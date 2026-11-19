import type { MessageKey } from "./i18n/en";
export const REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥", "👍", "🎉"] as const;

/** A short-lived emoji burst. Reactions are never stored, only relayed. */
export type Reaction = { id: string; authorId: string; emoji: string; at: number };

export type Playback = {
  playing: boolean;
  position: number;
  anchorAt: number;
  revision: number;
};

/** How widely a video is expected to play: everywhere, only some browsers, or not without conversion. */
export type MediaCompat = "universal" | "limited" | "convert";

/** What a web lookup found out about a video. Every field but the lists is optional: only confirmed facts are kept. */
export type MediaMeta = {
  title?: string;
  kind?: "movie" | "episode" | "show" | "other";
  year?: number;
  series?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  synopsis?: string;
  genres: string[];
  directors: string[];
  cast: { name: string; role?: string }[];
  rating?: string;
  network?: string;
  language?: string;
  /** Minutes. */
  runtime?: number;
  /** How sure the lookup was that it found the right video. */
  confidence: "high" | "medium" | "low";
  sources: { title: string; url: string }[];
  fetchedAt: number;
  model: string;
};

/** A sentence the page translates: a message key (see app/i18n/en.ts) and the values to put in it. */
export type NoteCode = { key: MessageKey; params?: Record<string, string | number> };

export type MediaInfo = {
  id: string;
  /** The looked-up title when there is one, otherwise the name made from the file. */
  title: string;
  /** Changes when a lookup is saved or removed ("" while there is none), so a viewer knows to fetch the details again. */
  metaVersion: string;
  duration: number;
  /** "file" is a single progressive file (MP4, WebM, ...). "hls" is a segmented, adaptive package. */
  kind: "file" | "hls";
  /** Changes when the file on disk changes, so browsers do not reuse a stale cached copy. */
  version: string;
  /** Path of the playable entry under the video: "file", or "hls/<playlist>". */
  entry: string;
  /** Changes when a subtitle file is added or replaced, without changing `version` (so the video itself is not reloaded). */
  captionsVersion: string;
  width: number;
  height: number;
  /** Video codec name (h264, hevc, vp9, av1) and average bits per second, used to judge whether a phone can keep up. */
  vcodec: string;
  acodec: string;
  /** The file format as the probe reports it (for example "mov,mp4,m4a,3gp,3g2,mj2" or "matroska,webm"). */
  container: string;
  /** Size on disk in bytes. For an adaptive video, the whole folder. */
  size: number;
  bitrate: number;
  compat: MediaCompat;
  /** Why the video is rated as it is, and what to do about it. The page translates them. */
  notes: NoteCode[];
  captions: { label: string; lang: string }[];
  hasPoster: boolean;
};

/** Everything the host's library picker shows about a video. */
export type LibraryItem = MediaInfo & {
  /** The video has looked-up details. */
  described: boolean;
  /** Average megabits per second one viewer downloads while watching. */
  mbps: number;
  faststart: boolean;
};

/** "struggling" is reported by a member's own device when it cannot play the current video smoothly. */
export type MemberHealth = "ok" | "struggling";

export type RoomMember = { id: string; name: string; health?: MemberHealth };
export type RoomMessage = { id: number; authorId: string; text: string; sentAt: number };

export type RoomSnapshot = {
  id: string;
  youId: string;
  hostId: string;
  members: RoomMember[];
  messages: RoomMessage[];
  media: MediaInfo | null;
  playback: Playback;
  /** Set while the video is paused because a viewer (not the host) paused it: that viewer's name. */
  pausedBy?: string;
  /** Ids of the people whose video is waiting for data right now. Absent when nobody is. */
  buffering?: string[];
  /**
   * Viewers asking the host to start playback while the video is paused. `names` are the other people asking (never
   * yourself), `mine` says whether you asked, and `ping` changes each time someone asks, so the host's prompt can pulse.
   */
  wantPlay?: { names: string[]; mine: boolean; ping: number };
  serverTime: number;
};

/** The small, frequently changing part of a room. Sent whenever playback, the video or the people change. */
export type RoomState = Omit<RoomSnapshot, "messages">;

/**
 * What the live stream carries. A full "snapshot" is sent once on connect (and again after any reconnect);
 * after that each event carries only what changed, so a reaction costs bytes, not the whole chat history.
 */
export type RoomEvent =
  | { type: "state"; shared?: SharedRoomState }
  | { type: "chat"; message: RoomMessage }
  | { type: "reaction"; reaction: Reaction }
  /** The admin removed one person (that person is told and disconnected; everyone else ignores it). */
  | { type: "kick"; memberId: string; left?: boolean; last?: boolean }
  /** The admin closed the room: everybody in it is told and disconnected. */
  | { type: "closed" };

/**
 * The part of a room's state that is the same for everyone in it (server side). Worked out once per change and handed to every
 * connected viewer. Unchanged parts are the very same objects as in the previous one, so comparing two of them is a few
 * reference checks, not a deep comparison.
 */
export type SharedRoomState = {
  id: string;
  hostId: string;
  members: RoomMember[];
  media: MediaInfo | null;
  playback: Playback;
  pausedBy?: string;
  /** Viewers asking the host to play, for the current revision. Each viewer sees this differently (see wantFor). */
  asking: { id: string; at: number }[];
  /** Ids of the people whose video is waiting for data right now. Empty most of the time. */
  buffering: string[];
  serverTime: number;
  /** Update frames already made that follow an earlier state, so each is made once however many viewers need it. */
  patches: WeakMap<object, Uint8Array>;
};

export type RoomCommand =
  | { type: "play" | "pause" }
  | { type: "seek"; position: number }
  | { type: "load"; mediaId: string }
  | { type: "health"; level: MemberHealth }
  | { type: "nudge" }
  /** This device has been waiting for video data for a few seconds (on), or has caught up again (off). */
  | { type: "buffering"; on: boolean }
  | { type: "chat"; text: string }
  | { type: "react"; emoji: string }
  /** This person leaves the room (and is told it worked by the answer, not by an event). */
  | { type: "leave" };

/** Random room IDs are exactly 22 characters, so a chosen code (4 to 20) can never be mistaken for one. */
const randomRoomId = /^[A-Za-z0-9_-]{22}$/;
const customCode = /^[a-z0-9](?:[a-z0-9_-]{2,18})[a-z0-9]$/;

export const codeRules = "Use 4 to 20 letters, numbers, dashes or underscores.";

/** A room code someone chose themselves, for example "movie-night". Always lowercase. */
export function isCustomCode(value: unknown): value is string {
  return typeof value === "string" && customCode.test(value);
}

/** Make typed or pasted text into a code: lowercase, spaces become dashes, stray characters are dropped. */
export function cleanCodeInput(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/-{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "");
}

/**
 * Whatever a person typed or a link contained, as the room's real ID. Random IDs are case-sensitive and kept as
 * they are; chosen codes are not, so they are lowercased ("Movie-Night" and "movie-night" are the same room).
 * A whole invitation link can be pasted too.
 */
export function normalizeRoomId(raw: string) {
  let text = raw.trim();
  const fromLink = /[?&]room=([^&#\s]+)/.exec(text);
  if (fromLink) text = decodeURIComponent(fromLink[1]);
  return randomRoomId.test(text) ? text : cleanCodeInput(text);
}

export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && (randomRoomId.test(value) || customCode.test(value));
}

export function isMediaId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16}$/.test(value);
}

export function playbackPosition(playback: Playback, now: number, duration: number) {
  const elapsed = playback.playing ? Math.max(0, now - playback.anchorAt) / 1000 : 0;
  return Math.min(duration, playback.position + elapsed);
}

/** Same-origin URL of one part of a room's current video. */
export function mediaUrl(roomId: string, media: MediaInfo, part: string) {
  return `/api/rooms/${roomId}/media/${media.id}/${part}`;
}

/**
 * What a "state" event carries: only the fields of the room that changed since the last one this connection received.
 * A field that went away (a pause by someone is no longer the reason, nobody is asking) arrives as null.
 * Most events are then a playback position and a clock reading, not the member list and video record again.
 */
export type StatePatch = { [K in keyof RoomState]?: RoomState[K] | null } & { serverTime: number };

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The smallest patch that turns `previous` into `next`. */
export function diffState(previous: RoomState, next: RoomState): StatePatch {
  const patch: Record<string, unknown> = { serverTime: next.serverTime };
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (key === "serverTime") continue;
    const before = (previous as Record<string, unknown>)[key];
    const after = (next as Record<string, unknown>)[key];
    if (after === undefined) { if (before !== undefined) patch[key] = null; }
    else if (!same(before, after)) patch[key] = after;
  }
  return patch as StatePatch;
}

/** Apply a patch. Unchanged fields keep their identity, so React can skip the parts that did not change. */
export function applyPatch(previous: RoomState, patch: StatePatch): RoomState {
  const next: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null && key !== "media") delete next[key];
    else next[key] = value;
  }
  return next as RoomState;
}

/** What changed between two shared states, as a state patch. Parts the store reused compare by reference. */
export function diffShared(previous: SharedRoomState, next: SharedRoomState): StatePatch {
  const patch: StatePatch = { serverTime: next.serverTime };
  if (previous.hostId !== next.hostId) patch.hostId = next.hostId;
  if (previous.members !== next.members) patch.members = next.members;
  if (previous.media !== next.media) patch.media = next.media;
  if (previous.playback !== next.playback) patch.playback = next.playback;
  if (previous.pausedBy !== next.pausedBy) patch.pausedBy = next.pausedBy ?? null;
  if (previous.buffering !== next.buffering) patch.buffering = next.buffering.length ? next.buffering : null;
  return patch;
}
