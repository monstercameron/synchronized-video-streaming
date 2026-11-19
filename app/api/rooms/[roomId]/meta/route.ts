import type { NextRequest } from "next/server";
import { getMedia } from "../../../../media-catalog";
import { metadataConfigured, metadataModel } from "../../../../media-enrich";
import { getMeta } from "../../../../media-meta";
import { getSession, noStore, roomResponse } from "../../../../room-http";
import { requireMembership, RoomError } from "../../../../room-store";

export const runtime = "nodejs";

/** Looked-up details of a video, fetched when someone opens the details sheet. ?mediaId=... */
export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const { room, you } = requireMembership(roomId, getSession(request));
    const mediaId = request.nextUrl.searchParams.get("mediaId") ?? "";
    if (!getMedia(mediaId)) throw new RoomError(404, "err.media.notInLibrary");
    const isHost = you.id === room.hostId;
    return Response.json({
      meta: getMeta(mediaId),
      // Only the host is offered the lookup button, so only the host needs to know whether it is set up.
      ...(isHost ? { canLookUp: metadataConfigured(), model: metadataModel() } : {}),
    }, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}
