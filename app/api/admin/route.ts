import type { NextRequest } from "next/server";
import { assertAdmin, usingDefaultPassword } from "../../admin-auth";
import { noStore, readBody, roomResponse } from "../../room-http";
import { closeAllRooms, closeRoom, kickMember, listRooms, RoomError } from "../../room-store";
import { isOpen, lockEnabled, setOpen } from "../../site-lock";

export const runtime = "nodejs";

function state() {
  return { open: isOpen(), lockEnabled: lockEnabled(), defaultPassword: usingDefaultPassword(), rooms: listRooms() };
}

/** The management page's view: whether the site is open, and every room with who is in it. Admin only. */
export async function GET(request: NextRequest) {
  try {
    assertAdmin(request);
    return Response.json(state(), { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}

/**
 * What the admin can do: { type: "open" | "lock" | "closeAll" }, { type: "closeRoom", roomId },
 * { type: "kick", roomId, memberId }. Admin only; answers with the new state.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    assertAdmin(request);
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    if (body.type === "open") setOpen(true);
    else if (body.type === "lock") setOpen(false);
    else if (body.type === "closeAll") closeAllRooms();
    else if (body.type === "closeRoom" && roomId) closeRoom(roomId);
    else if (body.type === "kick" && roomId && memberId) kickMember(roomId, memberId);
    else throw new RoomError(400, "err.action.invalid");
    return Response.json(state(), { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}
