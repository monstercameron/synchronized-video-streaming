import type { NextRequest } from "next/server";
import { applyCommand, closeOwnedRoom, requireMembership, roomExists, roomSnapshot, serverTime } from "../../../room-store";
import { assertSameOrigin, getSession, noStore, readBody, readCommand, roomResponse } from "../../../room-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ roomId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { roomId } = await params;
    const { you } = requireMembership(roomId, getSession(request));
    const value = request.nextUrl.searchParams.has("clock") ? { serverTime: serverTime() } : roomSnapshot(roomId, you.id);
    return Response.json(value, { headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const command = readCommand(await readBody(request));
    const { roomId } = await params;
    const member = requireMembership(roomId, getSession(request));
    applyCommand(member, command);
    // Leaving says whether the room closed, including rooms with no owner to keep them open.
    if (command.type === "leave") return Response.json({ closed: !roomExists(roomId) }, { headers: noStore });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request);
    closeOwnedRoom((await params).roomId, getSession(request));
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return roomResponse(error);
  }
}
