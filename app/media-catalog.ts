import { createHash } from "node:crypto";
import { database } from "./db";
import { getMeta } from "./media-meta";
import type { LibraryItem, MediaCompat, MediaInfo, NoteCode } from "./room-shared";

/** One catalog row, including the server-only file locations. */
export type MediaRecord = {
  id: string;
  relPath: string;
  kind: "file" | "hls";
  title: string;
  duration: number;
  width: number;
  height: number;
  container: string;
  vcodec: string;
  acodec: string;
  size: number;
  bitrate: number;
  compat: MediaCompat;
  note: string;
  faststart: boolean;
  sig: string;
  captions: { file: string; label: string; lang: string; sig?: string }[];
  poster: string | null;
};

type Row = Omit<MediaRecord, "relPath" | "faststart" | "captions"> & {
  rel_path: string; faststart: number; captions: string;
};

function toRecord(row: Row): MediaRecord {
  return { ...row, relPath: row.rel_path, faststart: !!row.faststart, captions: JSON.parse(row.captions) };
}

// Looked up on every request for a video file, playlist, segment or subtitle, and on every room update. The catalog only
// changes when the library is scanned, so the records are kept until then.
const records = new Map<string, MediaRecord>();
const derived = new WeakMap<MediaRecord, { stamp: number; info: MediaInfo }>();

/** Forget cached records. Called when the library is scanned or a video is removed. */
export function invalidateMedia() {
  records.clear();
}

export function getMedia(id: string | null | undefined) {
  if (!id) return undefined;
  const known = records.get(id);
  if (known) return known;
  const row = database().prepare("SELECT * FROM media WHERE id = ?").get(id) as Row | undefined;
  if (!row) return undefined;
  const record = toRecord(row);
  if (records.size >= 200) records.clear();
  records.set(id, record);
  return record;
}

export function listMedia() {
  const rows = database().prepare("SELECT * FROM media ORDER BY title COLLATE NOCASE, rel_path").all() as Row[];
  return rows.map(toRecord);
}

/** The video a brand-new room starts with. */
export function defaultMediaId() {
  const row = database().prepare("SELECT id FROM media ORDER BY title COLLATE NOCASE, rel_path LIMIT 1").get() as { id: string } | undefined;
  return row?.id ?? null;
}

function effectiveBitrate(media: MediaRecord) {
  return media.bitrate > 0 ? media.bitrate : media.duration > 0 ? Math.round((media.size * 8) / media.duration) : 0;
}

/** The notes are stored as JSON. A row from before notes were codes holds one English sentence, which is simply dropped. */
function parseNotes(stored: string): NoteCode[] {
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed as NoteCode[] : [];
  } catch { return []; }
}

export function toInfo(media: MediaRecord): MediaInfo {
  const meta = getMeta(media.id);
  // The same record gives the same answer until its looked-up details change. The answer is also the very same object, which
  // lets a room's update skip comparing it with the last one it sent.
  const stamp = meta?.fetchedAt ?? 0;
  const cached = derived.get(media);
  if (cached && cached.stamp === stamp) return cached.info;
  const info = describe(media, meta);
  derived.set(media, { stamp, info });
  return info;
}

function describe(media: MediaRecord, meta: ReturnType<typeof getMeta>): MediaInfo {
  return {
    id: media.id, title: meta?.title ?? media.title, metaVersion: meta ? meta.fetchedAt.toString(36) : "", duration: media.duration, kind: media.kind,
    // Only the video file itself, so adding subtitles does not make every viewer reload the video.
    version: createHash("sha1").update(media.sig.split("|")[1] ?? media.sig).digest("base64url").slice(0, 8),
    captionsVersion: createHash("sha1").update(media.captions.map(caption => `${caption.file}:${caption.sig ?? ""}`).join("|")).digest("base64url").slice(0, 8),
    entry: media.kind === "hls" ? `hls/${media.relPath.split("/").pop()}` : "file",
    width: media.width, height: media.height, vcodec: media.vcodec, acodec: media.acodec, container: media.container, size: media.size, bitrate: effectiveBitrate(media), compat: media.compat, notes: parseNotes(media.note),
    captions: media.captions.map(({ label, lang }) => ({ label, lang })),
    hasPoster: !!media.poster,
  };
}

export function toLibraryItem(media: MediaRecord): LibraryItem {
  const mbps = effectiveBitrate(media) / 1e6;
  return {
    ...toInfo(media),
    mbps: Math.round(mbps * 10) / 10, faststart: media.faststart, described: !!getMeta(media.id),
  };
}
