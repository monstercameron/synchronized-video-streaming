import type { NextRequest } from "next/server";
import { getMedia } from "../../../../../../media-catalog";
import { contentTypes, readCaptions, resolveMediaFile } from "../../../../../../media-library";
import { serveFile } from "../../../../../../media-serve";
import { getSession, roomResponse } from "../../../../../../room-http";
import { isMediaId } from "../../../../../../room-shared";
import { requireMembership, RoomError } from "../../../../../../room-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ roomId: string; mediaId: string; path: string[] }> };

const unavailable = () => new RoomError(404, "err.media.unavailable");

/**
 * Streams a room's current video. Every request is checked against room membership and
 * against the video the room is showing right now, including playlists, segments and subtitles.
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { roomId, mediaId, path } = await params;
    const { room } = requireMembership(roomId, getSession(request));
    if (!isMediaId(mediaId) || room.mediaId !== mediaId) throw unavailable();
    const media = getMedia(mediaId);
    if (!media) throw unavailable();

    if (path[0] === "captions" && path.length === 2) {
      const text = await readCaptions(media, Number(path[1]));
      if (text === undefined) throw unavailable();
      return new Response(text, { headers: { "Content-Type": contentTypes[".vtt"], "Cache-Control": "private, max-age=300" } });
    }

    const target = await resolveMediaFile(media, path);
    if (!target) throw unavailable();
    const playlist = target.extension === ".m3u8";
    return await serveFile(request, target.file, {
      type: contentTypes[target.extension] ?? "application/octet-stream",
      // Playlists are revalidated; the large files carry a version in their URL or an ETag.
      cache: playlist ? "private, no-cache" : "private, max-age=3600",
    });
  } catch (error) {
    return roomResponse(error);
  }
}
