import { rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { NextRequest } from "next/server";
import { getMedia, listMedia, toLibraryItem } from "../../../../media-catalog";
import { imageExtensions, mediaRoot, scanLibrary, scannedAgo, subtitleExtensions, videoExtensions } from "../../../../media-library";
import { clearMeta } from "../../../../media-meta";
import { storage, usageChanged } from "../../../../media-quota";
import { assertAdmin, isAdmin } from "../../../../admin-auth";
import { assertSameOrigin, getSession, noStore, roomResponse } from "../../../../room-http";
import { requireMembership, RoomError } from "../../../../room-store";

export const runtime = "nodejs";

/** The host's view of every video in the media folder. Pass ?rescan=1 to look for new files right away. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const { room, you } = requireMembership(roomId, getSession(request));
    if (you.id !== room.hostId) throw new RoomError(403, "err.host.browse");

    const force = request.nextUrl.searchParams.has("rescan");
    const scan = force || scannedAgo() > 15000 ? await scanLibrary() : undefined;
    return Response.json({
      admin: isAdmin(request),
      items: listMedia().map(toLibraryItem),
      errors: scan?.errors ?? [],
      maxUploadBytes: Number(process.env.MAX_UPLOAD_GB ?? 20) * 1024 ** 3,
      storage: await storage(),
      allowedUploads: [...videoExtensions, ...subtitleExtensions, ...imageExtensions],
      folder: process.env.MEDIA_DIR_LABEL ?? (process.env.NODE_ENV === "production" ? undefined : mediaRoot()),
    }, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}

/**
 * The host deletes one video from the server to free space: ?mediaId=...
 * A single file takes its subtitles and poster with it; an adaptive video takes its whole folder.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    assertSameOrigin(request);
    const { roomId } = await params;
    const { room, you } = requireMembership(roomId, getSession(request));
    if (you.id !== room.hostId) throw new RoomError(403, "err.host.delete");
    assertAdmin(request);
    const media = getMedia(request.nextUrl.searchParams.get("mediaId"));
    if (!media) throw new RoomError(404, "err.media.notInLibrary");
    if (room.mediaId === media.id) throw new RoomError(409, "err.delete.playing");

    const root = mediaRoot();
    const inside = (relative: string) => {
      const target = resolve(root, relative);
      // Never delete the media folder itself or anything outside it.
      if (!target.startsWith(root + sep)) throw new RoomError(400, "err.file.outside");
      return target;
    };
    if (media.kind === "hls") {
      const folder = dirname(media.relPath);
      if (!folder || folder === ".") throw new RoomError(400, "err.delete.noFolder");
      await rm(inside(folder), { recursive: true, force: true });
    } else {
      const files = [media.relPath, ...media.captions.map(caption => caption.file), ...(media.poster ? [media.poster] : [])];
      for (const file of files) await rm(inside(file), { force: true });
    }
    clearMeta(media.id);
    usageChanged();
    // The scan drops the video from the catalog and moves any room that was showing it onto another one.
    await scanLibrary();
    return Response.json({ storage: await storage() }, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}
