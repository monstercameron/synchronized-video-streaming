import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";
import { getMedia } from "../../../../../media-catalog";
import { isMediaId } from "../../../../../room-shared";
import { imageExtensions, mediaRoot, scanLibrary, subtitleExtensions, videoExtensions } from "../../../../../media-library";
import { assertAdmin } from "../../../../../admin-auth";
import { assertSameOrigin, getSession, noStore, roomResponse } from "../../../../../room-http";
import { reserveSpace, usageChanged } from "../../../../../media-quota";
import { formatSize } from "../../../../../media-format";
import { requireMembership, RoomError } from "../../../../../room-store";

export const runtime = "nodejs";

const allowed = [...videoExtensions, ...subtitleExtensions, ...imageExtensions];

function cleanName(raw: string) {
  const name = basename(raw.replace(/\\/g, "/")).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^[.\s]+|[\s.]+$/g, "").slice(0, 180);
  return name;
}

async function freeName(dir: string, name: string) {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let copy = 1; copy < 100; copy++) {
    const candidate = copy === 1 ? name : `${stem} (${copy})${extension}`;
    if (!(await stat(join(dir, candidate)).catch(() => undefined))) return candidate;
  }
  throw new RoomError(409, "err.upload.nameTaken");
}

class TooLarge extends Error {}
class OutOfSpace extends Error {}

const maxSubtitleBytes = 5 * 1024 * 1024;

/**
 * Subtitle files come from all over and are often not UTF-8 (older SRT files are usually Windows-1252). Read it as
 * UTF-8 if that is valid, otherwise as Windows-1252, and store clean UTF-8 so every browser shows the right characters.
 */
function normalizeSubtitles(bytes: Buffer) {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("windows-1252").decode(bytes); }
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.includes("-->")) throw new RoomError(422, "err.subs.notSubtitle");
  return text;
}

/**
 * Answering before the body is read makes the connection reset mid-upload, so the client sees a
 * dropped connection instead of our message. Read and discard a bounded amount first.
 */
async function drain(request: Request, limit = 16 * 1024 * 1024) {
  if (!request.body || request.bodyUsed || request.body.locked) return;
  const reader = request.body.getReader();
  const deadline = Date.now() + 5000;
  let seen = 0;
  try {
    while (seen < limit && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += value.length;
    }
  } catch { /* The client went away. */ }
  finally { await reader.cancel().catch(() => {}); }
}

/**
 * Host-only upload. The body is streamed straight to disk, so a multi-gigabyte video never sits in memory.
 * Send the raw file as the request body: PUT /library/upload?name=Movie.mp4
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  let partial: string | undefined;
  let space: Awaited<ReturnType<typeof reserveSpace>> | undefined;
  try {
    assertSameOrigin(request);
    const { roomId } = await params;
    const { room, you } = requireMembership(roomId, getSession(request));
    if (you.id !== room.hostId) throw new RoomError(403, "err.host.upload");
    assertAdmin(request);

    const name = cleanName(request.nextUrl.searchParams.get("name") ?? "");
    if (!name || !allowed.includes(extname(name).toLowerCase())) {
      throw new RoomError(415, "err.upload.types", { types: allowed.join(", ") });
    }

    // Subtitles for a specific video: the file is stored under the name the library looks for, which is
    // "<video name>.<language>.srt" next to a single file, or "<language>.srt" inside an adaptive folder.
    const forMedia = request.nextUrl.searchParams.get("media");
    let subtitleTarget: { relative: string; others: string[] } | undefined;
    if (forMedia) {
      const media = isMediaId(forMedia) ? getMedia(forMedia) : undefined;
      if (!media) throw new RoomError(404, "err.media.notInLibrary");
      const extension = extname(name).toLowerCase();
      if (!subtitleExtensions.includes(extension)) throw new RoomError(415, "err.subs.type");
      const lang = request.nextUrl.searchParams.get("lang") ?? "";
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang)) throw new RoomError(400, "err.subs.lang");
      const folder = dirname(media.relPath) === "." ? "" : dirname(media.relPath);
      const base = media.kind === "file" ? `${basename(media.relPath, extname(media.relPath))}.${lang}` : lang;
      subtitleTarget = {
        relative: join(folder, base + extension),
        // A second file for the same language (say .vtt next to .srt) would show up as a duplicate track.
        others: subtitleExtensions.filter(other => other !== extension).map(other => join(folder, base + other)),
      };
      const declared = Number(request.headers.get("content-length"));
      if (declared > maxSubtitleBytes) throw new RoomError(413, "err.subs.tooBig");
    }
    if (!request.body) throw new RoomError(400, "err.upload.empty");

    const limit = subtitleTarget ? maxSubtitleBytes : Number(process.env.MAX_UPLOAD_GB ?? 20) * 1024 ** 3;
    if (Number(request.headers.get("content-length")) > limit) throw new TooLarge();

    // The media folder has a total size cap (4 GB unless MEDIA_QUOTA_GB says otherwise). Check what was announced now,
    // and keep counting while the bytes arrive, because the announced size can be wrong.
    const declaredSize = Number(request.headers.get("content-length")) || 0;
    space = await reserveSpace(declaredSize);
    if (!space.ok) {
      throw new RoomError(507, "err.upload.noSpace", { size: formatSize(declaredSize), free: formatSize(space.free) });
    }
    const root = mediaRoot();
    await mkdir(join(root, ".incoming"), { recursive: true });
    partial = join(root, ".incoming", `${randomBytes(8).toString("hex")}.part`);
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        if (space?.ok && !space.grow(chunk.length)) done(new OutOfSpace());
        else if (received > limit) done(new TooLarge());
        else done(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(request.body as unknown as NodeReadableStream), counter, createWriteStream(partial, { flags: "wx" }));
    if (!received) throw new RoomError(400, "err.upload.empty");

    let finalName: string;
    if (subtitleTarget) {
      await writeFile(/* turbopackIgnore: true */ partial, normalizeSubtitles(await readFile(/* turbopackIgnore: true */ partial)), "utf8");
      finalName = subtitleTarget.relative;
      for (const other of subtitleTarget.others) await rm(join(/* turbopackIgnore: true */ root, other), { force: true });
    } else {
      finalName = await freeName(root, name);
    }
    await rename(partial, join(/* turbopackIgnore: true */ root, finalName));
    partial = undefined;
    usageChanged();
    const scan = await scanLibrary();
    return Response.json({ name: basename(finalName), errors: scan.errors }, { status: 201, headers: noStore });
  } catch (error) {
    if (partial) await rm(partial, { force: true }).catch(() => {});
    if (error instanceof OutOfSpace) error = new RoomError(507, "err.upload.ranOut");
    if (!partial && !request.bodyUsed) await drain(request);
    return roomResponse(error instanceof TooLarge ? new RoomError(413, "err.upload.tooLarge") : error);
  } finally {
    space?.ok && space.release();
  }
}
