import type { NextRequest } from "next/server";
import { requireMembership, roomSnapshot, sharedState, subscribe, viewerState, wantFor } from "../../../../room-store";
import { getSession, roomResponse } from "../../../../room-http";
import { diffShared, type RoomEvent, type SharedRoomState, type StatePatch } from "../../../../room-shared";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const frame = (name: string, data: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

// A chat line or a reaction goes to everyone in the room: it is turned into bytes once, not once per viewer.
const frames = new WeakMap<RoomEvent, Uint8Array>();
function eventFrame(event: RoomEvent) {
  let bytes = frames.get(event);
  if (!bytes) {
    bytes = event.type === "chat" ? frame("chat", event.message) : event.type === "reaction" ? frame("reaction", event.reaction) : new Uint8Array();
    frames.set(event, bytes);
  }
  return bytes;
}

// One timer keeps every open stream alive (a comment line every 15 seconds), instead of one timer per viewer.
const keepAlive = encoder.encode(": keep-alive\n\n");
const beats = globalThis as typeof globalThis & { screeningStreams?: Set<(bytes: Uint8Array) => void>; screeningBeat?: ReturnType<typeof setInterval> };
const streams = beats.screeningStreams ??= new Set();

function watch(send: (bytes: Uint8Array) => void) {
  streams.add(send);
  if (!beats.screeningBeat) {
    beats.screeningBeat = setInterval(() => streams.forEach(write => write(keepAlive)), 15000);
    beats.screeningBeat.unref();
  }
  return () => {
    streams.delete(send);
    if (!streams.size && beats.screeningBeat) { clearInterval(beats.screeningBeat); beats.screeningBeat = undefined; }
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const { you } = requireMembership(roomId, getSession(request));
    const sinceParam = Number(request.nextUrl.searchParams.get("since"));
    const since = Number.isInteger(sinceParam) && sinceParam >= 0 && request.nextUrl.searchParams.has("since") ? sinceParam : undefined;
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const send = (bytes: Uint8Array) => {
          if (closed) return;
          try {
            if ((controller.desiredSize ?? 0) <= 0) {
              close();
              return;
            }
            controller.enqueue(bytes);
          } catch {
            close();
          }
        };
        // The first event is the whole room. After that, each event carries only what changed:
        // a reaction or chat line is a few dozen bytes instead of the entire chat history again.
        // What this viewer last received, so a state event can be just the difference.
        let last: SharedRoomState | undefined;
        let lastWant = "";
        const wantKeyOf = (shared: SharedRoomState) => {
          const want = wantFor(shared, you.id);
          return want ? JSON.stringify(want) : "";
        };
        const deliver = (event: RoomEvent) => {
          try {
            if (event.type === "closed") {
              // The admin closed the room. Say so, then hang up: this stream is done.
              send(frame("closed", {}));
              close();
            } else if (event.type === "kick") {
              if (event.memberId === you.id) { send(frame(event.left ? "left" : "kicked", event.left ? { last: !!event.last } : {})); close(); }
            } else if (event.type === "state") {
              const shared = event.shared ?? sharedState(roomId);
              const wantKey = wantKeyOf(shared);
              if (!last) {
                send(frame("state", viewerState(shared, you.id)));
              } else if (wantKey === lastWant) {
                // The same update for every viewer who is in step: made once, then handed out.
                let bytes = shared.patches.get(last);
                if (!bytes) { bytes = frame("state", diffShared(last, shared)); shared.patches.set(last, bytes); }
                send(bytes);
              } else {
                // Someone asking the host to play: that part is different for each viewer.
                const patch: StatePatch = { ...diffShared(last, shared), wantPlay: wantFor(shared, you.id) ?? null };
                send(frame("state", patch));
              }
              last = shared;
              lastWant = wantKey;
            } else {
              send(eventFrame(event));
            }
          } catch {
            close();
          }
        };
        const unsubscribe = subscribe(roomId, deliver, you.id);
        const unwatch = watch(send);

        function dispose() {
          if (closed) return;
          closed = true;
          unwatch();
          unsubscribe();
          request.signal.removeEventListener("abort", close);
        }

        function close() {
          if (closed) return;
          dispose();
          try { controller.close(); } catch { /* The client already closed the stream. */ }
        }

        cleanup = dispose;
        request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) close();
        else {
          try {
            const shared = sharedState(roomId);
            const snapshot = roomSnapshot(roomId, you.id, since, shared);
            last = shared;
            lastWant = wantKeyOf(shared);
            send(frame("snapshot", snapshot));
          } catch { close(); }
        }
      },
      cancel() { cleanup(); },
    }, { highWaterMark: 16 });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return roomResponse(error);
  }
}
