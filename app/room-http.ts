import type { NextRequest } from "next/server";
import { RoomError, sessionToken } from "./room-store";
import { isMediaId, REACTIONS, type RoomCommand } from "./room-shared";
import { translate } from "./i18n/core";

export const cookieName = "screening-session";
export const noStore = { "Cache-Control": "private, no-store" };

export function getSession(request: NextRequest) {
  return sessionToken(request.cookies.get(cookieName)?.value);
}

export function assertSameOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.slice(0, -1);
  if (request.headers.get("origin") !== `${protocol}://${host}` || !host) {
    throw new RoomError(403, "err.req.origin");
  }
}

export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new RoomError(415, "err.req.json");
  }
  const text = await request.text();
  if (text.length > 4096) throw new RoomError(413, "err.req.large");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new RoomError(400, "err.req.badJson"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RoomError(400, "err.req.invalid");
  return body as Record<string, unknown>;
}

export function readCommand(body: Record<string, unknown>): RoomCommand {
  if (body.type === "play" || body.type === "pause") return { type: body.type };
  if (body.type === "seek" && typeof body.position === "number" && Number.isFinite(body.position)) {
    return { type: "seek", position: body.position };
  }
  if (body.type === "chat" && typeof body.text === "string") {
    const text = body.text.trim();
    if (text.length && text.length <= 500) return { type: "chat", text };
    throw new RoomError(400, "err.chat.invalid");
  }
  if (body.type === "nudge") return { type: "nudge" };
  if (body.type === "leave") return { type: "leave" };
  if (body.type === "buffering" && typeof body.on === "boolean") return { type: "buffering", on: body.on };
  if (body.type === "health" && (body.level === "ok" || body.level === "struggling")) return { type: "health", level: body.level };
  if (body.type === "load" && isMediaId(body.mediaId)) return { type: "load", mediaId: body.mediaId };
  if (body.type === "react" && typeof body.emoji === "string" && (REACTIONS as readonly string[]).includes(body.emoji)) {
    return { type: "react", emoji: body.emoji };
  }
  throw new RoomError(400, "err.action.invalid");
}

export function roomResponse(error: unknown) {
  if (error instanceof RoomError || (error instanceof Error && error.name === "RoomError" && "status" in error)) {
    const { code, params } = error as RoomError;
    return Response.json({ error: error.message, ...(code ? { code, params } : {}) }, { status: Number(error.status), headers: noStore });
  }
  console.error("Screening room request failed", error);
  return Response.json({ error: translate("en", "err.unavailable"), code: "err.unavailable" }, { status: 500, headers: noStore });
}
