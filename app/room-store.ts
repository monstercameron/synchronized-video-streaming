import { createHash, randomBytes, randomUUID } from "node:crypto";
import { database } from "./db";
import { translate, type MessageKey, type Params } from "./i18n/core";
import { defaultMediaId, getMedia, toInfo } from "./media-catalog";
import { isRoomId, playbackPosition, type MemberHealth, type OwnedRoom, type Playback, type Reaction, type RoomCommand, type RoomEvent, type RoomMember, type RoomMessage, type RoomSnapshot, type RoomState, type SharedRoomState } from "./room-shared";

const runtime = globalThis as typeof globalThis & {
  screeningListeners?: Map<string, Set<(event: RoomEvent) => void>>;
  screeningReactionRate?: Map<string, number[]>;
  screeningHealth?: Map<string, { mediaId: string; level: MemberHealth }>;
  screeningPausers?: Map<string, { memberId: string; revision: number }>;
  screeningWants?: Map<string, Map<string, { at: number; revision: number }>>;
  screeningBuffering?: Map<string, string>;
  screeningOnline?: Map<string, number>;
  screeningOffline?: Map<string, number>;
  screeningRoomRows?: Map<string, RoomRow>;
  screeningMemberLists?: Map<string, RoomMember[]>;
  screeningMemberByToken?: Map<string, RoomMember>;
  screeningLastShared?: Map<string, SharedRoomState>;
  screeningSweeper?: ReturnType<typeof setInterval>;
};

type RoomRow = Omit<Playback, "playing"> & { id: string; hostId: string; playing: number; mediaId: string | null };
type Membership = { room: RoomRow; you: RoomMember };

/**
 * An expected failure. It carries a message code (see app/i18n/en.ts), not a sentence: the page turns the code into the
 * viewer's language. `message` is the English sentence, for logs and for anything that is not the page.
 */
export class RoomError extends Error {
  constructor(public status: number, public code: MessageKey, public params?: Params) {
    super(translate("en", code, params));
    this.name = "RoomError";
  }
}

export function serverTime() {
  return Math.round(performance.timeOrigin + performance.now());
}

// ---------- Reactions: relayed to whoever is connected, never stored ----------

const reactionRate = runtime.screeningReactionRate ??= new Map<string, number[]>();

function newReaction(memberId: string, emoji: string, now: number): Reaction {
  // At most 6 reactions per member in any 2 seconds, so one phone cannot flood the room.
  const recent = (reactionRate.get(memberId) ?? []).filter(at => now - at < 2000);
  if (recent.length >= 6) throw new RoomError(429, "err.slowDown");
  recent.push(now);
  reactionRate.set(memberId, recent);
  return { id: randomBytes(6).toString("hex"), authorId: memberId, emoji, at: now };
}

// ---------- Device health: a member's own report that the current video is too heavy for it ----------

const health = runtime.screeningHealth ??= new Map<string, { mediaId: string; level: MemberHealth }>();

// ---------- Who paused: a viewer's pause, remembered for the revision it created ----------

const pausers = runtime.screeningPausers ??= new Map<string, { memberId: string; revision: number }>();

// ---------- "Play now?": viewers asking the host to start, remembered for the revision they asked at ----------

const wants = runtime.screeningWants ??= new Map<string, Map<string, { at: number; revision: number }>>();
const askAgainAfter = 10_000;

// ---------- Who is waiting for video data: a member's own report, remembered with the video it was about ----------

const buffering = runtime.screeningBuffering ??= new Map<string, string>();

// ---------- Who is connected ----------

const online = runtime.screeningOnline ??= new Map<string, number>();
const offlineSince = runtime.screeningOffline ??= new Map<string, number>();

// ---------- Rooms ----------

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionToken(cookie?: string) {
  return cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie) ? cookie : undefined;
}

// Rooms, member lists and "who owns this session" are read on every request and event but change only when someone joins or
// a command is applied. They are kept in memory and dropped at exactly those moments. The size caps are only a safety net.
const roomRows = runtime.screeningRoomRows ??= new Map<string, RoomRow>();
const memberLists = runtime.screeningMemberLists ??= new Map<string, RoomMember[]>();
const memberByToken = runtime.screeningMemberByToken ??= new Map<string, RoomMember>();
const lastShared = runtime.screeningLastShared ??= new Map<string, SharedRoomState>();

function forgetRoom(id: string) {
  roomRows.delete(id);
}

function getRoom(id: string) {
  let room = roomRows.get(id);
  if (!room) {
    const db = database();
    const row = isRoomId(id) && db.prepare(`
      SELECT id, host_id AS hostId, playing, position, anchor_at AS anchorAt, revision, media_id AS mediaId FROM rooms WHERE id = ?
    `).get(id) as RoomRow | undefined;
    if (!row) throw new RoomError(404, "err.room.notFound");
    room = { ...row };
    if (roomRows.size >= 500) roomRows.clear();
    roomRows.set(id, room);
  }
  // A room that predates the library, or whose video was removed, falls back to the first video
  // available. That is a video change like any other: paused at 0:00, and everyone is told.
  if (!getMedia(room.mediaId)) {
    const fallback = defaultMediaId();
    if (fallback !== room.mediaId) {
      const now = serverTime();
      database().prepare("UPDATE rooms SET media_id = ?, playing = 0, position = 0, anchor_at = ?, revision = revision + 1 WHERE id = ?").run(fallback, now, id);
      forgetRoom(id);
      queueMicrotask(() => broadcast(id));
      return getRoom(id);
    }
  }
  return room;
}

/** Tell every room that is showing one of these videos that its details (such as subtitles) changed. */
export function notifyMediaChanged(mediaIds: string[]) {
  if (!mediaIds.length) return;
  const marks = mediaIds.map(() => "?").join(",");
  const rooms = database().prepare(`SELECT id FROM rooms WHERE media_id IN (${marks})`).all(...mediaIds) as { id: string }[];
  for (const { id } of rooms) broadcast(id);
}

/** After the library changes, move any room whose video vanished (or that has none yet) onto a valid one. */
export function reassignMissingMedia() {
  const rooms = database().prepare("SELECT id FROM rooms WHERE media_id IS NULL OR media_id NOT IN (SELECT id FROM media)").all() as { id: string }[];
  for (const { id } of rooms) { forgetRoom(id); getRoom(id); }
}

export function requireMembership(id: string, token?: string): Membership {
  // A room that does not exist and a room you have not joined look exactly the same from outside (401), so
  // these endpoints cannot be used to find out which codes are in use. Only joining says "no such room".
  let room: RoomRow;
  try {
    room = getRoom(id);
  } catch (error) {
    if (error instanceof RoomError && error.status === 404) throw new RoomError(401, "err.join.required");
    throw error;
  }
  if (!token) throw new RoomError(401, "err.join.required");
  const key = `${id}|${token}`;
  let member = memberByToken.get(key);
  if (!member) {
    member = database().prepare("SELECT id, name FROM members WHERE room_id = ? AND session_hash = ?")
      .get(id, sessionHash(token)) as RoomMember | undefined;
    // Only a real member is remembered, so wrong guesses cannot fill the cache.
    if (member) {
      if (memberByToken.size >= 5000) memberByToken.clear();
      memberByToken.set(key, member);
    }
  }
  if (!member) throw new RoomError(401, "err.join.required");
  return { room, you: member };
}

/**
 * Join the room `id`, or start a new one. A new room gets the code in `customCode` if one was chosen, otherwise a
 * random ID. A chosen code that is already taken is refused, never shared, so nobody can land in someone else's room.
 */
export function joinRoom(name: string, id: string | undefined, cookie?: string, customCode?: string) {
  const token = cookie ?? randomBytes(32).toString("base64url");
  const hash = sessionHash(token);
  const roomId = id ?? customCode ?? randomBytes(16).toString("base64url");
  const memberId = randomUUID();
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (id) {
      getRoom(id);
      const existing = db.prepare("SELECT id FROM members WHERE room_id = ? AND session_hash = ?").get(id, hash);
      const count = db.prepare("SELECT COUNT(*) AS size FROM members WHERE room_id = ?").get(id)?.size;
      if (!existing && Number(count) >= 50) throw new RoomError(409, "err.room.full");
      if (Number(count) === 0) db.prepare("UPDATE rooms SET host_id = ?, revision = revision + 1 WHERE id = ?").run(memberId, id);
    } else {
      if (customCode && db.prepare("SELECT 1 FROM rooms WHERE id = ?").get(roomId)) {
        throw new RoomError(409, "err.code.taken");
      }
      db.prepare("INSERT INTO rooms (id, host_id, anchor_at, media_id, owner_session_hash) VALUES (?, ?, ?, ?, ?)")
        .run(roomId, memberId, serverTime(), defaultMediaId(), hash);
    }
    db.prepare(`
      INSERT INTO members (id, room_id, session_hash, name) VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id, session_hash) DO UPDATE SET name = excluded.name
    `).run(memberId, roomId, hash, name);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  // The people in the room (and what is remembered about this session) changed.
  memberLists.delete(roomId);
  memberByToken.delete(`${roomId}|${token}`);
  forgetRoom(roomId);
  broadcast(roomId);
  return { roomId, token };
}

function memberList(id: string): RoomMember[] {
  let list = memberLists.get(id);
  if (!list) {
    list = database().prepare("SELECT id, name FROM members WHERE room_id = ? ORDER BY rowid").all(id) as RoomMember[];
    if (memberLists.size >= 500) memberLists.clear();
    memberLists.set(id, list);
  }
  return list;
}

const sameMembers = (a: RoomMember[], b: RoomMember[]) =>
  a.length === b.length && a.every((member, index) => member.id === b[index].id && member.name === b[index].name && member.health === b[index].health);

/**
 * The part of a room's state that is the same for everyone in it. Worked out once per change, not once per viewer. Parts that
 * have not changed are the very same objects as in the previous one, so a viewer's update can skip them by a plain comparison.
 */
export function sharedState(id: string): SharedRoomState {
  const room = getRoom(id);
  const previous = lastShared.get(id);
  const people = memberList(id).map(member => {
    const report = health.get(member.id);
    return report?.mediaId === room.mediaId && report.level === "struggling" ? { ...member, health: report.level } : member;
  });
  const members = previous && sameMembers(previous.members, people) ? previous.members : people;
  const media = getMedia(room.mediaId);
  const pause = pausers.get(id);
  // Requests belong to the exact revision they were made at, so any play, pause, seek or new video clears them.
  const asking = [...(wants.get(id)?.entries() ?? [])]
    // Someone who has since left or been removed is not asking any more (there would be no name to show).
    .filter(([asker, request]) => !room.playing && request.revision === room.revision && members.some(member => member.id === asker))
    .map(([asker, request]) => ({ id: asker, at: request.at }));
  const pausedBy = !room.playing && pause?.revision === room.revision ? members.find(member => member.id === pause.memberId)?.name : undefined;
  // Whoever reports waiting for data on the video that is showing now. The list is reused when it has not changed.
  const waiting = members.filter(member => room.mediaId !== null && buffering.get(member.id) === room.mediaId).map(member => member.id);
  const stillWaiting = previous && previous.buffering.length === waiting.length && previous.buffering.every((memberId, index) => memberId === waiting[index]);
  const playing = !!room.playing;
  const playback = previous && previous.playback.playing === playing && previous.playback.position === room.position
    && previous.playback.anchorAt === room.anchorAt && previous.playback.revision === room.revision
    ? previous.playback : { playing, position: room.position, anchorAt: room.anchorAt, revision: room.revision };
  const state: SharedRoomState = {
    id, hostId: room.hostId, members, media: media ? toInfo(media) : null, playback,
    ...(pausedBy ? { pausedBy } : {}), asking, buffering: stillWaiting ? previous.buffering : waiting, serverTime: serverTime(), patches: new WeakMap(),
  };
  lastShared.set(id, state);
  return state;
}

/** What one viewer is asking for: the people who asked (not themselves), whether they did, and when the latest ask was. */
export function wantFor(shared: SharedRoomState, memberId: string): RoomState["wantPlay"] {
  if (!shared.asking.length) return undefined;
  return {
    names: shared.asking.filter(asker => asker.id !== memberId).map(asker => shared.members.find(member => member.id === asker.id)?.name).filter((name): name is string => !!name),
    mine: shared.asking.some(asker => asker.id === memberId),
    ping: Math.max(...shared.asking.map(asker => asker.at)),
  };
}

/** A viewer's whole view of the room: the shared part plus what is theirs alone. */
export function viewerState(shared: SharedRoomState, memberId: string): RoomState {
  const wantPlay = wantFor(shared, memberId);
  return {
    id: shared.id, youId: memberId, hostId: shared.hostId, members: shared.members,
    ...(shared.pausedBy ? { pausedBy: shared.pausedBy } : {}),
    ...(shared.buffering.length ? { buffering: shared.buffering } : {}),
    ...(wantPlay ? { wantPlay } : {}),
    media: shared.media, playback: shared.playback, serverTime: shared.serverTime,
  };
}

/** Everything except chat history: small enough to send on every playback or membership change. */
export function roomState(id: string, memberId: string): RoomState {
  return viewerState(sharedState(id), memberId);
}

/** The complete room, sent once when a stream connects or reconnects. */
export function roomSnapshot(id: string, memberId: string, since?: number, shared?: SharedRoomState): RoomSnapshot {
  // A client that already holds the chat up to `since` only needs what came after it.
  const messages = database().prepare(`
    SELECT id, author_id AS authorId, text, sent_at AS sentAt FROM messages WHERE room_id = ? AND id > ? ORDER BY id DESC LIMIT 100
  `).all(id, since ?? 0) as RoomMessage[];
  return { ...viewerState(shared ?? sharedState(id), memberId), messages: messages.reverse() };
}

export function applyCommand({ room, you }: Membership, command: RoomCommand) {
  const db = database();
  const now = serverTime();
  if (command.type === "chat") {
    const result = db.prepare("INSERT INTO messages (room_id, author_id, text, sent_at) VALUES (?, ?, ?, ?)").run(room.id, you.id, command.text, now);
    db.prepare(`
      DELETE FROM messages WHERE room_id = ? AND id <
        (SELECT id FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 1 OFFSET 99)
    `).run(room.id, room.id);
    broadcast(room.id, { type: "chat", message: { id: Number(result.lastInsertRowid), authorId: you.id, text: command.text, sentAt: now } });
    return;
  } else if (command.type === "leave") {
    kickMember(room.id, you.id, true);
    return;
  } else if (command.type === "react") {
    broadcast(room.id, { type: "reaction", reaction: newReaction(you.id, command.emoji, now) });
    return;
  } else if (command.type === "nudge") {
    // Only a viewer can ask, and only while there is something to ask for: a paused room with a video loaded.
    if (you.id === room.hostId || room.playing || !room.mediaId) return;
    const requests = wants.get(room.id) ?? new Map<string, { at: number; revision: number }>();
    const previous = requests.get(you.id);
    // Tapping again right away does not nag the host; after a few seconds it pings again.
    if (previous?.revision === room.revision && now - previous.at < askAgainAfter) return;
    requests.set(you.id, { at: now, revision: room.revision });
    wants.set(room.id, requests);
  } else if (command.type === "buffering") {
    if (!room.mediaId) return;
    // Nothing to tell anyone when it did not change.
    if (command.on ? buffering.get(you.id) === room.mediaId : !buffering.has(you.id)) return;
    if (command.on) buffering.set(you.id, room.mediaId);
    else buffering.delete(you.id);
  } else if (command.type === "health") {
    if (!room.mediaId) return;
    const previous = health.get(you.id);
    if (previous?.mediaId === room.mediaId && previous.level === command.level) return;
    health.set(you.id, { mediaId: room.mediaId, level: command.level });
  } else if (command.type === "load") {
    if (you.id !== room.hostId) throw new RoomError(403, "err.host.choose");
    const media = getMedia(command.mediaId);
    if (!media) throw new RoomError(404, "err.media.notInLibrary");
    if (room.mediaId === media.id) return;
    // A new video always starts paused at the beginning, for everyone.
    db.prepare(`
      UPDATE rooms SET media_id = ?, playing = 0, position = 0, anchor_at = ?, revision = revision + 1 WHERE id = ?
    `).run(media.id, now, room.id);
    forgetRoom(room.id);
  } else {
    // Anyone can pause. Starting and moving the video stay with the host, so one person's tap cannot restart
    // or shove the timeline for everybody.
    if (you.id !== room.hostId && command.type !== "pause") throw new RoomError(403, "err.host.playSeek");
    const media = getMedia(room.mediaId);
    if (!media) throw new RoomError(409, "err.media.choose");
    const duration = media.duration;
    const prior = { ...room, playing: !!room.playing };
    const position = playbackPosition(prior, now, duration);
    if (command.type === "play" && prior.playing && position < duration) return;
    if (command.type === "pause" && !prior.playing) return;
    const nextPosition = command.type === "seek" ? Math.max(0, Math.min(command.position, duration))
      : command.type === "play" && position >= duration ? 0 : position;
    const playing = command.type === "play" || (command.type === "seek" && prior.playing && nextPosition < duration);
    const anchorAt = command.type === "play" ? now + 550 : playing ? Math.max(now, prior.anchorAt) : now;
    db.prepare(`
      UPDATE rooms SET playing = ?, position = ?, anchor_at = ?, revision = revision + 1 WHERE id = ?
    `).run(Number(playing), nextPosition, anchorAt, room.id);
    forgetRoom(room.id);
    // Remember who paused, so the host is not left wondering why the video stopped. It is tied to this exact
    // revision, so any later play, seek or video change clears it by itself.
    if (command.type === "pause" && you.id !== room.hostId) pausers.set(room.id, { memberId: you.id, revision: room.revision + 1 });
  }
  broadcast(room.id);
}

// ---------- Live connections ----------

const listeners = runtime.screeningListeners ??= new Map<string, Set<(event: RoomEvent) => void>>();

export function subscribe(id: string, listener: (event: RoomEvent) => void, memberId?: string) {
  let room = listeners.get(id);
  if (!room) {
    room = new Set();
    listeners.set(id, room);
  }
  room.add(listener);
  if (memberId) {
    online.set(memberId, (online.get(memberId) ?? 0) + 1);
    offlineSince.delete(memberId);
  }
  return () => {
    room.delete(listener);
    if (!room.size) {
      listeners.delete(id);
      // Nobody is watching this room any more: what was kept to make updates cheaper can go.
      lastShared.delete(id);
    }
    if (memberId) {
      const count = (online.get(memberId) ?? 1) - 1;
      if (count > 0) online.set(memberId, count);
      else {
        online.delete(memberId);
        offlineSince.set(memberId, Date.now());
        // Someone who left cannot still be waiting for data.
        if (buffering.delete(memberId) && listeners.has(id)) broadcast(id);
      }
    }
  };
}

/** Send an event to everyone connected to the room. A playback or people change is worked out once and shared. */
function broadcast(id: string, event?: RoomEvent) {
  const connected = listeners.get(id);
  if (!connected?.size) return;
  const shared = event ?? { type: "state" as const, shared: sharedState(id) };
  connected.forEach(listener => listener(shared));
}

// ---------- Housekeeping: nothing in memory grows without limit ----------

const sweepEvery = 60_000;
const forgetOfflineAfter = 10 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [member, times] of reactionRate) {
    if (!times.length || now - times[times.length - 1] > 10_000) reactionRate.delete(member);
  }
  // What a person reported about their device is forgotten once they have been gone for a while.
  for (const [member, since] of offlineSince) {
    if (now - since > forgetOfflineAfter) { offlineSince.delete(member); health.delete(member); buffering.delete(member); }
  }
  // Requests and pauses belong to one revision of one room. Once nobody is connected to the room, or the revision has
  // moved on, they can never be shown again.
  for (const [room, requests] of wants) {
    if (!listeners.has(room)) { wants.delete(room); continue; }
    const revision = roomRows.get(room)?.revision;
    if (revision === undefined) continue;
    for (const [asker, request] of requests) if (request.revision < revision) requests.delete(asker);
    if (!requests.size) wants.delete(room);
  }
  for (const [room, pause] of pausers) {
    if (!listeners.has(room) || (roomRows.get(room) && pause.revision < roomRows.get(room)!.revision)) pausers.delete(room);
  }
}

if (!runtime.screeningSweeper) {
  runtime.screeningSweeper = setInterval(sweep, sweepEvery);
  runtime.screeningSweeper.unref();
}

// ---------- Admin: seeing rooms, removing people, closing rooms ----------

/** Whether this session token already belongs to a member of the room (without saying anything about why not). */
export function isMemberOf(id: string, token?: string) {
  try {
    requireMembership(id, token);
    return true;
  } catch {
    return false;
  }
}

export type AdminRoom = {
  id: string; custom: boolean; hostId: string; video: string | null; playing: boolean;
  members: { id: string; name: string; host: boolean; online: boolean }[];
};

/** Every room, with who is in it and who is connected right now, for the management page. */
export function listRooms(): AdminRoom[] {
  const db = database();
  const rows = db.prepare("SELECT id FROM rooms ORDER BY rowid DESC LIMIT 200").all() as { id: string }[];
  return rows.map(({ id }) => {
    const room = getRoom(id);
    const media = getMedia(room.mediaId);
    return {
      id, custom: !/^[A-Za-z0-9_-]{22}$/.test(id), hostId: room.hostId, video: media ? toInfo(media).title : null, playing: !!room.playing,
      members: memberList(id).map(member => ({ id: member.id, name: member.name, host: member.id === room.hostId, online: online.has(member.id) })),
    };
  });
}

function forgetMember(memberId: string) {
  health.delete(memberId);
  buffering.delete(memberId);
  online.delete(memberId);
  offlineSince.delete(memberId);
  reactionRate.delete(memberId);
}

/**
 * Remove one person from a room (the admin removing them, or `byChoice`: they chose to go). They are told, disconnected, and need to join again (their chat lines go with them). If the
 * host is removed the next person to have joined becomes the host. A voluntary last departure leaves an owned room open and paused.
 */
export function kickMember(roomId: string, memberId: string, byChoice = false) {
  const db = database();
  const room = getRoom(roomId);
  const target = db.prepare("SELECT id FROM members WHERE id = ? AND room_id = ?").get(memberId, roomId);
  if (!target) throw new RoomError(404, "err.admin.noMember");
  const owned = !!db.prepare("SELECT 1 FROM rooms WHERE id = ? AND owner_session_hash IS NOT NULL").get(roomId);
  let empty = false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM messages WHERE author_id = ?").run(memberId);
    db.prepare("DELETE FROM members WHERE id = ?").run(memberId);
    const next = db.prepare("SELECT id FROM members WHERE room_id = ? ORDER BY rowid LIMIT 1").get(roomId) as { id: string } | undefined;
    empty = !next;
    if (next && room.hostId === memberId) {
      db.prepare("UPDATE rooms SET host_id = ?, revision = revision + 1 WHERE id = ?").run(next.id, roomId);
    } else if (!next && byChoice && owned) {
      const now = serverTime();
      const position = playbackPosition({ ...room, playing: !!room.playing }, now, getMedia(room.mediaId)?.duration ?? 0);
      db.prepare("UPDATE rooms SET host_id = '', playing = 0, position = ?, anchor_at = ?, revision = revision + 1 WHERE id = ?")
        .run(position, now, roomId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  memberLists.delete(roomId);
  for (const key of memberByToken.keys()) if (key.startsWith(`${roomId}|`)) memberByToken.delete(key);
  forgetRoom(roomId);
  const closed = empty && (!byChoice || !owned);
  broadcast(roomId, { type: "kick", memberId, ...(byChoice ? { left: true, last: closed } : {}) });
  forgetMember(memberId);
  wants.get(roomId)?.delete(memberId);
  if (closed) closeRoom(roomId);
  else if (!empty) broadcast(roomId);
}

/** Whether a room with this id still exists, including an empty room its owner can close. */
export const roomExists = (roomId: string) => !!database().prepare("SELECT 1 FROM rooms WHERE id = ?").get(roomId);

export function listOwnedRooms(token?: string): OwnedRoom[] {
  if (!token) return [];
  return database().prepare(`
    SELECT id, (SELECT COUNT(*) FROM members WHERE room_id = rooms.id) AS people
    FROM rooms WHERE owner_session_hash = ? ORDER BY rowid DESC
  `).all(sessionHash(token)) as OwnedRoom[];
}

export function closeOwnedRoom(id: string, token?: string) {
  const owned = token && isRoomId(id) && database().prepare("SELECT 1 FROM rooms WHERE id = ? AND owner_session_hash = ?")
    .get(id, sessionHash(token));
  if (!owned) throw new RoomError(404, "err.owner.noRoom");
  closeRoom(id);
}

/** Close a room: everybody in it is told and disconnected, and the room, its people and its chat are deleted. */
export function closeRoom(roomId: string) {
  const db = database();
  if (!db.prepare("SELECT 1 FROM rooms WHERE id = ?").get(roomId)) throw new RoomError(404, "err.admin.noRoom");
  const people = db.prepare("SELECT id FROM members WHERE room_id = ?").all(roomId) as { id: string }[];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM messages WHERE room_id = ?").run(roomId);
    db.prepare("DELETE FROM members WHERE room_id = ?").run(roomId);
    db.prepare("DELETE FROM rooms WHERE id = ?").run(roomId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const connected = listeners.get(roomId);
  listeners.delete(roomId);
  connected?.forEach(listener => listener({ type: "closed" }));
  for (const { id } of people) forgetMember(id);
  memberLists.delete(roomId);
  for (const key of memberByToken.keys()) if (key.startsWith(`${roomId}|`)) memberByToken.delete(key);
  forgetRoom(roomId);
  lastShared.delete(roomId);
  wants.delete(roomId);
  pausers.delete(roomId);
}

/** Close every room. Returns how many there were. */
export function closeAllRooms() {
  const ids = (database().prepare("SELECT id FROM rooms").all() as { id: string }[]).map(row => row.id);
  for (const id of ids) closeRoom(id);
  return ids.length;
}
