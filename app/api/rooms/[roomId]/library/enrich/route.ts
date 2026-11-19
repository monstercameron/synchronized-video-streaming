import type { NextRequest } from "next/server";
import { getMedia, toInfo } from "../../../../../media-catalog";
import { findDetails, metadataConfigured } from "../../../../../media-enrich";
import { assertAdmin } from "../../../../../admin-auth";
import { getSession, noStore, readBody, roomResponse } from "../../../../../room-http";
import { notifyMediaChanged, requireMembership, RoomError } from "../../../../../room-store";

export const runtime = "nodejs";

/** The host asks for a web lookup of one video's details. Body: { mediaId, hint? }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const body = await readBody(request);
    const { roomId } = await params;
    const { room, you } = requireMembership(roomId, getSession(request));
    if (you.id !== room.hostId) throw new RoomError(403, "err.host.lookup");
    assertAdmin(request);
    if (!metadataConfigured()) throw new RoomError(503, "err.meta.notConfigured");
    const media = typeof body.mediaId === "string" ? getMedia(body.mediaId) : undefined;
    if (!media) throw new RoomError(404, "err.media.notInLibrary");
    const hint = typeof body.hint === "string" ? body.hint : undefined;
    const lang = body.lang === "es" ? "es" : "en";
    const meta = await findDetails(media, hint, lang);
    // Rooms showing this video get the new title straight away.
    notifyMediaChanged([media.id]);
    return Response.json({ meta, title: toInfo(media).title }, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}
