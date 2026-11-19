import { roomExists, RoomError } from "./room-store";

// Room codes people choose are far easier to guess than the random ones, so wrong guesses are limited.
// Each address gets a handful of misses per minute. It has to be checked before the lookup: if misses were
// refused but hits were not, the refusal itself would tell an attacker which guesses were wrong.
/** Anything with request headers: a route's request, or the headers the page was asked with. */
type Requester = { headers: Pick<Headers, "get"> };

const window = 60_000;
const allowed = 10;

const runtime = globalThis as typeof globalThis & { screeningMisses?: Map<string, number[]> };
const misses = runtime.screeningMisses ??= new Map<string, number[]>();

/**
 * Who is asking. Behind Nginx the last X-Forwarded-For entry is the one Nginx added itself (earlier entries can be
 * forged by the client), so that is the one used. With no proxy there is no header, and everyone shares one bucket.
 */
export function clientKey(request: Requester) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

function recent(key: string, now = Date.now()) {
  const list = (misses.get(key) ?? []).filter(at => now - at < window);
  if (list.length) misses.set(key, list);
  else misses.delete(key);
  return list;
}

/** Refuse when this address has already tried too many codes that did not exist. */
export function assertNotThrottled(request: Requester) {
  if (recent(clientKey(request)).length >= allowed) {
    throw new RoomError(429, "err.join.tooMany");
  }
}

export function recordMiss(request: Requester) {
  const key = clientKey(request);
  const now = Date.now();
  misses.set(key, [...recent(key, now), now]);
  if (misses.size > 5000) for (const other of misses.keys()) recent(other, now);
}

/**
 * Whether the room named by a link is gone, for the page to say so up front instead of letting someone fill in a name and then fail.
 * It says exactly what joining that code would say, under the same limit: it counts a miss like a join does, and once an address has
 * used up its misses it answers nothing ("unknown"), so it cannot be used to run through codes any faster than joining can.
 */
export function roomLinkGone(headers: Pick<Headers, "get">, roomId: string) {
  if (recent(clientKey({ headers })).length >= allowed) return false;
  if (roomExists(roomId)) return false;
  recordMiss({ headers });
  return true;
}
