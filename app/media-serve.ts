import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import { Readable } from "node:stream";
import { mediaRoot } from "./media-library";

type Options = { type: string; cache: string };

function rangeOf(header: string | null, size: number): { start: number; end: number } | "invalid" | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return undefined; // Multi-range or malformed: serve the whole file.
  let start: number;
  let end: number;
  if (!match[1]) {
    // Suffix range: the last N bytes.
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  return start >= size || start > end ? "invalid" : { start, end };
}

/**
 * Serve a file with Range support, so browsers can seek inside large videos without
 * downloading them. When MEDIA_ACCEL_PREFIX is set (Nginx `internal` location), the
 * byte serving is handed to Nginx after this route has authorized the request.
 */
export async function serveFile(request: Request, file: string, { type, cache }: Options) {
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

  const prefix = process.env.MEDIA_ACCEL_PREFIX;
  if (prefix) {
    const path = relative(mediaRoot(), file).split(sep).map(encodeURIComponent).join("/");
    return new Response(null, { headers: { "X-Accel-Redirect": `${prefix.replace(/\/$/, "")}/${path}`, "Content-Type": type, "Cache-Control": cache } });
  }

  const etag = `W/"${info.size.toString(36)}-${Math.round(info.mtimeMs).toString(36)}"`;
  const headers: Record<string, string> = {
    "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache, ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  const ifRange = request.headers.get("if-range");
  const range = ifRange && ifRange !== etag ? undefined : rangeOf(request.headers.get("range"), info.size);

  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${info.size}` } });
  }
  if (!range && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  if (info.size === 0) return new Response(null, { status: 200, headers: { ...headers, "Content-Length": "0" } });

  const stream = createReadStream(file, { start, end, highWaterMark: 256 * 1024 });
  request.signal.addEventListener("abort", () => stream.destroy(), { once: true });
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers: {
      ...headers, "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
    },
  });
}
