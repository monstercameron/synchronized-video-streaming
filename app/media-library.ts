import { execFile } from "node:child_process";
import { translate, type MessageKey } from "./i18n/core";
import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { database } from "./db";
import { invalidateMedia, type MediaRecord } from "./media-catalog";
import type { MediaCompat, NoteCode } from "./room-shared";
import { notifyMediaChanged, reassignMissingMedia } from "./room-store";

export const videoExtensions = [".mp4", ".m4v", ".mov", ".webm", ".mkv"];
export const subtitleExtensions = [".vtt", ".srt"];
export const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

/** Bump when how videos are rated changes, so existing videos are looked at again on the next scan. */
const scanVersion = 3;

const hlsExtensions = [".m3u8", ".m4s", ".mp4", ".ts", ".aac", ".vtt", ".webvtt"];

export const contentTypes: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".m3u8": "application/vnd.apple.mpegurl", ".m4s": "video/iso.segment", ".ts": "video/mp2t", ".aac": "audio/aac",
  ".vtt": "text/vtt; charset=utf-8", ".webvtt": "text/vtt; charset=utf-8", ".srt": "text/vtt; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

export function mediaRoot() {
  return resolve(/* turbopackIgnore: true */ process.env.MEDIA_DIR ?? ".data/media");
}

// ---------- Probing ----------

type Probe = {
  duration: number; width: number; height: number; container: string;
  vcodec: string; pixFmt: string; acodec: string; bitrate: number;
};

/** A problem with one file, as a message code the page can translate. */
class Problem extends Error {
  constructor(public code: MessageKey) { super(translate("en", code)); }
}
class ToolMissing extends Problem {}

function run(command: string, args: string[]) {
  return new Promise<string>((resolveOutput, reject) => {
    execFile(command, args, { timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (!error) return resolveOutput(stdout);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new ToolMissing("scan.noFfprobe"));
      else reject(new Problem("scan.unreadable"));
    });
  });
}

async function probe(file: string, hls: boolean): Promise<Probe> {
  const tool = process.env.FFPROBE_PATH ?? "ffprobe";
  const out = await run(tool, [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
    ...(hls ? ["-allowed_extensions", "ALL"] : []), file,
  ]);
  const data = JSON.parse(out) as {
    format?: { duration?: string; bit_rate?: string; format_name?: string };
    streams?: { codec_type: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string; duration?: string; disposition?: { attached_pic?: number } }[];
  };
  const video = data.streams?.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
  const audio = data.streams?.find(stream => stream.codec_type === "audio");
  if (!video) throw new Problem("scan.noVideo");
  const duration = Number(data.format?.duration ?? video.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Problem("scan.noDuration");
  return {
    duration, width: video.width ?? 0, height: video.height ?? 0,
    container: data.format?.format_name ?? "", vcodec: video.codec_name ?? "", pixFmt: video.pix_fmt ?? "",
    acodec: audio?.codec_name ?? "", bitrate: Number(data.format?.bit_rate) || 0,
  };
}

/** True when the MP4's index (moov) comes before the media data, so playback can start without reading the file's end. */
async function hasFaststart(file: string) {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(16);
    let position = 0;
    for (let step = 0; step < 64 && position + 8 <= size; step++) {
      await handle.read(head, 0, 16, position);
      let length = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (length === 1) length = Number(head.readBigUInt64BE(8));
      else if (length === 0) length = size - position;
      if (length < 8) return true;
      position += length;
    }
    return true;
  } finally {
    await handle.close();
  }
}

/** Decide, from the codecs alone, how many browsers can play this file directly. */
function rate(kind: "file" | "hls", extension: string, probeResult: Probe): { compat: MediaCompat; notes: NoteCode[] } {
  const { vcodec, pixFmt, acodec } = probeResult;
  if (kind === "hls") return { compat: "universal", notes: [{ key: "note.hls" }] };

  const eightBit = !pixFmt || /^yuvj?4[24][0-4]p$/.test(pixFmt);
  const audioOk = !acodec || ["aac", "mp3", "opus", "vorbis", "flac"].includes(acodec);
  const audioForMp4 = !acodec || ["aac", "mp3"].includes(acodec);

  if (!eightBit) return { compat: "convert", notes: [{ key: "note.tenBit", params: { pix: pixFmt } }] };
  if (!audioOk) return { compat: "convert", notes: [{ key: "note.audioBad", params: { codec: acodec.toUpperCase() } }] };

  if ([".mp4", ".m4v", ".mov"].includes(extension)) {
    if (vcodec === "h264") {
      return audioForMp4
        ? { compat: "universal", notes: [{ key: "note.h264mp4" }] }
        : { compat: "limited", notes: [{ key: "note.mp4AudioLimited", params: { codec: acodec } }] };
    }
    if (vcodec === "hevc") return { compat: "limited", notes: [{ key: "note.hevc" }] };
    if (vcodec === "av1" || vcodec === "vp9") return { compat: "limited", notes: [{ key: "note.av1vp9", params: { codec: vcodec.toUpperCase() } }] };
    return { compat: "convert", notes: [vcodec ? { key: "note.convertVideo", params: { codec: vcodec } } : { key: "note.convertVideoUnknown" }] };
  }
  if (extension === ".webm") {
    return ["vp8", "vp9", "av1"].includes(vcodec)
      ? { compat: "limited", notes: [{ key: "note.webm" }] }
      : { compat: "convert", notes: [{ key: "note.webmBad" }] };
  }
  if (extension === ".mkv") {
    return ["h264", "vp9", "av1", "vp8"].includes(vcodec)
      ? { compat: "limited", notes: [{ key: "note.mkv" }] }
      : { compat: "convert", notes: [vcodec ? { key: "note.mkvBad", params: { codec: vcodec } } : { key: "note.mkvBadUnknown" }] };
  }
  return { compat: "convert", notes: [{ key: "note.unsupported" }] };
}

// ---------- Sidecar subtitles and posters ----------

function languageLabel(code: string): string {
  if (!code) return "Subtitles";
  // "en-sdh" and "en-forced" are variants of one language: "English (SDH)", "English (forced)".
  const variant = /^(.+?)-(sdh|forced|cc)(\d*)$/i.exec(code);
  if (variant) return `${languageLabel(variant[1])} (${variant[2].toLowerCase() === "forced" ? "forced" : variant[2].toUpperCase()})`;
  if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) {
    try {
      const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
      if (name && name !== code) return name;
    } catch { /* Fall through to the raw code. */ }
  }
  return code.charAt(0).toUpperCase() + code.slice(1);
}

function sidecars(names: string[], dir: string, stem: string | null, hls: boolean) {
  const lower = (value: string) => value.toLowerCase();
  const captions: MediaRecord["captions"] = [];
  let poster: string | null = null;
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const extension = lower(extname(name));
    const base = name.slice(0, name.length - extension.length);
    if (subtitleExtensions.includes(extension)) {
      if (hls || (stem !== null && lower(base).startsWith(`${lower(stem)}.`)) || (stem !== null && lower(base) === lower(stem))) {
        const lang = hls ? base : base.slice(stem!.length + 1);
        captions.push({ file: join(dir, name).split(sep).join("/"), lang, label: languageLabel(lang) });
      }
    } else if (imageExtensions.includes(extension) && !poster) {
      const matches = hls ? ["poster", "cover", "thumbnail"].includes(lower(base)) : stem !== null && lower(base) === lower(stem);
      if (matches) poster = join(dir, name).split(sep).join("/");
    }
  }
  // Group each language together with the plain track first, so "automatic" never lands on a forced-only or SDH track
  // when a normal one exists.
  const variant = (lang: string) => (/-forced[0-9]*$/i.test(lang) ? 2 : /-(sdh|cc)[0-9]*$/i.test(lang) ? 1 : 0);
  const language = (lang: string) => lang.replace(/-(sdh|forced|cc)[0-9]*$/i, "");
  captions.sort((x, y) => language(x.lang).localeCompare(language(y.lang)) || variant(x.lang) - variant(y.lang) || x.lang.localeCompare(y.lang));
  return { captions, poster };
}

// ---------- Scanning ----------

type Found = { kind: "file" | "hls"; absolute: string; relative: string; dir: string; names: string[] };

const slash = (value: string) => value.split(sep).join("/");

async function discover(root: string, dir: string, depth: number, found: Found[]) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const names = entries.map(entry => entry.name);
  const master = names.find(name => /^(master|index)\.m3u8$/i.test(name));
  if (master && dir !== root) {
    found.push({ kind: "hls", absolute: join(dir, master), relative: slash(join(dir, master).slice(root.length + 1)), dir: slash(dir.slice(root.length + 1)), names });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory() && depth < 3) await discover(root, absolute, depth + 1, found);
    else if (entry.isFile() && videoExtensions.includes(extname(entry.name).toLowerCase())) {
      found.push({ kind: "file", absolute, relative: slash(absolute.slice(root.length + 1)), dir: slash(dir.slice(root.length + 1)), names });
    }
  }
}

export type ScanResult = { total: number; added: number; removed: number; errors: { file: string; message: string; code: MessageKey }[] };

let running: Promise<ScanResult> | undefined;
let lastScan = 0;

export function scannedAgo() {
  return Date.now() - lastScan;
}

/** Bring the catalog in line with the media folder. Unchanged files are not probed again. */
export function scanLibrary(): Promise<ScanResult> {
  running ??= scan().finally(() => { running = undefined; lastScan = Date.now(); });
  return running;
}

async function scan(): Promise<ScanResult> {
  const root = mediaRoot();
  await mkdir(root, { recursive: true });
  const found: Found[] = [];
  await discover(root, root, 0, found);

  const db = database();
  const existing = new Map((db.prepare("SELECT id, sig FROM media").all() as { id: string; sig: string }[]).map(row => [row.id, row.sig]));
  const result: ScanResult = { total: 0, added: 0, removed: 0, errors: [] };
  const seen = new Set<string>();
  const changed: string[] = [];

  for (const item of found) {
    const id = createHash("sha1").update(item.relative).digest("base64url").slice(0, 16);
    try {
      const info = await stat(item.absolute);
      const sig = `${info.size}-${Math.round(info.mtimeMs)}`;
      const folder = item.kind === "hls" ? dirname(item.absolute) : dirname(item.absolute);
      const stem = item.kind === "file" ? basename(item.absolute, extname(item.absolute)) : null;
      const sibling = item.kind === "hls" ? await readdir(folder) : item.names;
      const { captions, poster } = sidecars(sibling, item.kind === "hls" ? item.dir : item.dir, stem, item.kind === "hls");
      seen.add(id);
      for (const caption of captions) {
        const captionInfo = await stat(join(root, caption.file)).catch(() => undefined);
        caption.sig = captionInfo ? `${captionInfo.size}-${Math.round(captionInfo.mtimeMs)}` : "";
      }
      const sidecarSig = `v${scanVersion}|${sig}|${captions.map(caption => `${caption.file}:${caption.sig}`).join(",")}|${poster ?? ""}`;
      if (existing.get(id) === sidecarSig) { result.total++; continue; }
      if (existing.has(id)) changed.push(id);

      const extension = extname(item.absolute).toLowerCase();
      const probed = await probe(item.absolute, item.kind === "hls");
      const verdict = rate(item.kind, extension, probed);
      const faststart = item.kind === "file" && [".mp4", ".m4v", ".mov"].includes(extension) ? await hasFaststart(item.absolute) : true;
      const heavy = item.kind === "file" && (probed.height > 1080 || probed.bitrate > 12e6);
      const notes: NoteCode[] = [...verdict.notes, ...(heavy ? [{ key: "note.heavy" as MessageKey }] : []), ...(faststart ? [] : [{ key: "note.faststart" as MessageKey }])];
      const note = JSON.stringify(notes);
      const title = (item.kind === "hls" ? basename(item.dir) : stem!).replace(/[_]+/g, " ").trim();
      const size = item.kind === "hls" ? await directorySize(folder) : info.size;

      db.prepare(`
        INSERT INTO media (id, rel_path, kind, title, duration, width, height, container, vcodec, acodec, size, bitrate, compat, note, faststart, sig, captions, poster)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET rel_path = excluded.rel_path, kind = excluded.kind, title = excluded.title, duration = excluded.duration,
          width = excluded.width, height = excluded.height, container = excluded.container, vcodec = excluded.vcodec, acodec = excluded.acodec,
          size = excluded.size, bitrate = excluded.bitrate, compat = excluded.compat, note = excluded.note, faststart = excluded.faststart,
          sig = excluded.sig, captions = excluded.captions, poster = excluded.poster
      `).run(id, item.relative, item.kind, title, probed.duration, probed.width, probed.height, probed.container, probed.vcodec, probed.acodec,
        size, probed.bitrate, verdict.compat, note, Number(faststart), sidecarSig, JSON.stringify(captions), poster);
      if (!existing.has(id)) result.added++;
      result.total++;
    } catch (error) {
      const code: MessageKey = error instanceof Problem ? error.code : "scan.generic";
      result.errors.push({ file: item.relative, message: translate("en", code), code });
      if (error instanceof ToolMissing) break;
    }
  }

  for (const id of existing.keys()) {
    if (seen.has(id)) continue;
    db.prepare("DELETE FROM media WHERE id = ?").run(id);
    result.removed++;
  }
  invalidateMedia();
  reassignMissingMedia();
  // Rooms showing a video whose subtitles (or file) changed need to tell their viewers.
  notifyMediaChanged(changed);
  return result;
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

// ---------- Resolving requested files ----------

/** Turn a requested path inside a video into a real file, refusing anything outside the video's own folder. */
const realRoots = new Map<string, string>();

export async function resolveMediaFile(media: MediaRecord, parts: string[]) {
  // The media folder's real location is worked out once, not on every segment request.
  const configured = mediaRoot();
  let root = realRoots.get(configured);
  if (!root) { root = await realpath(configured); realRoots.set(configured, root); }
  const inside = async (relative: string, allowed: string[], base = root) => {
    const file = await realpath(resolve(base, relative)).catch(() => undefined);
    if (!file || !file.startsWith(base + sep)) return undefined;
    const extension = extname(file).toLowerCase();
    return allowed.includes(extension) ? { file, extension } : undefined;
  };

  const [part, ...rest] = parts;
  if (part === "file" && media.kind === "file" && !rest.length) return inside(media.relPath, videoExtensions);
  if (part === "poster" && media.poster && !rest.length) return inside(media.poster, imageExtensions);
  if (part === "hls" && media.kind === "hls" && rest.length && rest.every(segment => segment && segment !== "." && segment !== "..")) {
    const base = await realpath(resolve(root, dirname(media.relPath)));
    if (!base.startsWith(root + sep)) return undefined;
    return inside(rest.join("/"), hlsExtensions, base);
  }
  return undefined;
}

/** Subtitle text as WebVTT. SRT files are converted on the fly. */
export async function readCaptions(media: MediaRecord, index: number) {
  const caption = media.captions[index];
  if (!caption) return undefined;
  const target = await resolveCaptionFile(caption.file);
  if (!target) return undefined;
  let text = (await readFile(target.file, "utf8")).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (target.extension === ".srt" || !text.startsWith("WEBVTT")) {
    text = "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  }
  return text;
}

async function resolveCaptionFile(relative: string) {
  const root = await realpath(mediaRoot());
  const file = await realpath(resolve(root, relative)).catch(() => undefined);
  if (!file || !file.startsWith(root + sep)) return undefined;
  const extension = extname(file).toLowerCase();
  return subtitleExtensions.includes(extension) ? { file, extension } : undefined;
}
