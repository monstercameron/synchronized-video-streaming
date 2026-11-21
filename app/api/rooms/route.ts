import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "../../admin-auth";
import { isMemberOf, joinRoom, listOwnedRooms, RoomError } from "../../room-store";
import { isOpen } from "../../site-lock";
import { cookieName, getSession, noStore, readBody, roomResponse } from "../../room-http";
import { assertNotThrottled, recordMiss } from "../../room-guard";
import { cleanCodeInput, codeRules, isCustomCode, isRoomId, normalizeRoomId } from "../../room-shared";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  try {
    return Response.json({ rooms: listOwnedRooms(getSession(request)) }, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}

/**
 * Join a room ({ name, roomId }) or start one ({ name }, optionally with { code } to choose its code).
 * Codes and links are accepted in any case, and a whole pasted invitation link works as a roomId.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, roomId, code } = await readBody(request);
    const displayName = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (!displayName || displayName.length > 32) throw new RoomError(400, "err.name.invalid");

    const wantsJoin = roomId !== undefined && roomId !== "";
    const wantsCode = code !== undefined && code !== null && code !== "";
    if (wantsJoin && wantsCode) throw new RoomError(400, "err.join.both");

    // While the site is locked only the admin can start or join rooms. Someone who is already in a room can come back to it.
    if (!isOpen() && !isAdmin(request)) {
      const back = wantsJoin && typeof roomId === "string" ? normalizeRoomId(roomId) : "";
      if (!back || !isMemberOf(back, getSession(request))) throw new RoomError(423, "err.locked");
    }

    let target: string | undefined;
    let chosen: string | undefined;
    if (wantsJoin) {
      // Checked before looking anything up, so being refused reveals nothing about which codes exist.
      assertNotThrottled(request);
      target = typeof roomId === "string" ? normalizeRoomId(roomId) : "";
      if (!isRoomId(target)) {
        recordMiss(request);
        throw new RoomError(404, "err.room.notFound");
      }
    } else if (wantsCode) {
      chosen = typeof code === "string" ? cleanCodeInput(code) : "";
      if (!isCustomCode(chosen)) throw new RoomError(400, "err.code.invalid");
    }

    let result: { roomId: string; token: string };
    try {
      result = joinRoom(displayName, target, getSession(request), chosen);
    } catch (error) {
      if (wantsJoin && error instanceof RoomError && error.status === 404) recordMiss(request);
      throw error;
    }
    const response = NextResponse.json({ roomId: result.roomId }, { status: 201, headers: noStore });
    response.cookies.set(cookieName, result.token, {
      path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30,
      secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    });
    return response;
  } catch (error) {
    return roomResponse(error);
  }
}
