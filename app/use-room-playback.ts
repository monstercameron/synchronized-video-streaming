import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { playbackPosition, type Playback, type RoomCommand } from "./room-shared";

export type PlayerRoom = {
  id: string;
  playback: Playback;
  clockOffset: number;
  /** Length of the room's video in seconds, from the library. */
  duration: number;
  isHost: boolean;
  /** Name of the viewer whose pause stopped the video, if that is why it is paused. */
  pausedBy?: string;
  /** Names of the other people whose video is waiting for data right now. */
  bufferingNames?: string[];
  /** People asking the host to start playback (see RoomState.wantPlay). */
  wantPlay?: { names: string[]; mine: boolean; ping: number };
  send: (command: RoomCommand) => Promise<void>;
};

const leadKey = "screening-lead";

/** How far ahead to aim when jumping into a playing room: the seek time this device measured last time. */
export function readLead() {
  try {
    const saved = Number(localStorage.getItem(leadKey));
    if (saved >= 0.05 && saved <= 1.5) return saved;
  } catch { /* Storage can be blocked. */ }
  return 0.3;
}

/** Where the room's video is right now, in seconds. */
export function roomTarget(room: Pick<PlayerRoom, "playback" | "clockOffset" | "duration">) {
  return playbackPosition(room.playback, performance.now() + room.clockOffset, room.duration);
}

export function useRoomPlayback(videoRef: RefObject<HTMLVideoElement | null>, room?: PlayerRoom) {
  // Autoplay is blocked and even muted playback failed: the person has to tap once.
  const [needsTap, setNeedsTap] = useState(false);
  // Playing along, but silently, because the browser blocks sound until the person interacts with the page.
  const [soundBlocked, setSoundBlocked] = useState(false);
  // "Pause me": this device's video is stopped on purpose while the room keeps playing.
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const blocked = useRef(false);
  const pending = useRef(false);
  const applied = useRef<{ id: string; revision: number }>(null);
  const marked = useRef({ metadata: false, aligned: false, playing: false });
  // How long a seek takes to deliver picture on this device and connection. Jumping to the room's position
  // and then waiting for data leaves you behind by that long, so seeks aim that far ahead.
  const lead = useRef(readLead());
  // When this device last jumped to catch up. Used so that a jump still waiting for its data is not thrown away by the next one.
  const lastJump = useRef(0);
  const id = room?.id;
  const playback = room?.playback;
  const clockOffset = room?.clockOffset;
  const duration = room?.duration;

  // Anything the room does (play, pause, seek, a new video) is a shared moment, so it ends a personal pause.
  // The device then falls back in step with everyone.
  useEffect(() => {
    heldRef.current = false;
    setHeld(false);
  }, [id, playback?.revision]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !id || !playback || clockOffset === undefined || duration === undefined) return;
    let disposed = false;

    /** Jump to `position`. While playing, aim ahead by the time a seek takes, and learn that time for next time. */
    function jump(player: HTMLVideoElement, position: number, playing: boolean) {
      const issued = performance.now();
      lastJump.current = issued;
      player.currentTime = position + (playing ? lead.current : 0);
      if (!playing) return;
      player.addEventListener("seeked", () => {
        const took = (performance.now() - issued) / 1000;
        lead.current = Math.min(1.5, Math.max(0.05, lead.current * 0.6 + took * 0.4));
        try { localStorage.setItem(leadKey, lead.current.toFixed(3)); } catch { /* Not remembered. */ }
      }, { once: true });
    }

    /** Aligns this player with the room. Returns how far off it was, in seconds, so the loop can relax once it is settled. */
    function sync(player: HTMLVideoElement, timeline: Playback, offset: number, roomId: string) {
      if (player.readyState < HTMLMediaElement.HAVE_METADATA || player.seeking) return Infinity;
      if (!marked.current.metadata) { marked.current.metadata = true; performance.mark("sync:metadata"); }
      const now = performance.now() + offset;
      const end = Number.isFinite(player.duration) ? Math.min(duration!, player.duration) : duration!;
      const target = Math.min(playbackPosition(timeline, now, duration!), end);
      const shouldPlay = timeline.playing && now >= timeline.anchorAt && target < end;
      const drift = target - player.currentTime;
      const newRevision = applied.current?.id !== roomId || applied.current.revision !== timeline.revision;
      applied.current = { id: roomId, revision: timeline.revision };

      if (!shouldPlay) {
        if (!player.paused) player.pause();
        if (Math.abs(drift) > 0.12) jump(player, target, false);
        player.playbackRate = 1;
        return 0;
      }

      // "Pause me": leave this device's video stopped while the room plays on. Rejoin jumps back to the live spot.
      if (heldRef.current) {
        if (!player.paused) player.pause();
        return 0;
      }

      if (Math.abs(drift) > 0.55 || (newRevision && Math.abs(drift) > 0.12)) {
        // The room keeps moving while a jump's data is still arriving, so the gap grows and every check would say "jump again",
        // each one cancelling the download the last one started, forever on a slow connection. While waiting for the first
        // frames after a jump, let it finish (for up to 5 seconds); one jump when the data arrives corrects the rest.
        const settling = !newRevision && player.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && performance.now() - lastJump.current < 5000;
        if (!settling) {
          jump(player, target, true);
          player.playbackRate = 1;
        }
      } else if (player.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        player.playbackRate = Math.abs(drift) > 0.18 ? (drift > 0 ? 1.06 : 0.94) : 1;
      }

      if (player.paused && !blocked.current && !pending.current && !(player.ended && end - target < 0.2)) {
        pending.current = true;
        void player.play().catch(async reason => {
          if (disposed || !(reason instanceof DOMException && reason.name === "NotAllowedError")) return;
          if (!player.muted) {
            // Browsers block autoplay with sound until the person has interacted with the page, but allow it
            // muted. Start silently now so the picture is in step at once, and offer sound with one tap.
            player.dataset.autoMuted = "1";
            player.muted = true;
            try {
              await player.play();
              if (!disposed) setSoundBlocked(true);
              return;
            } catch {
              delete player.dataset.autoMuted;
              player.muted = false;
            }
          }
          blocked.current = true;
          setNeedsTap(true);
        }).finally(() => { pending.current = false; });
      }
      // First moment this device is actually playing, within a quarter second of the room.
      if (!marked.current.aligned && !player.paused && Math.abs(drift) < 0.25) {
        marked.current.aligned = true;
        performance.mark("sync:aligned", { detail: { drift } });
        // Landed ahead (negative drift) or behind (positive): the lead was off by about that much. Correct it for next time.
        lead.current = Math.min(1.5, Math.max(0.05, lead.current + drift * 0.8));
        try { localStorage.setItem(leadKey, lead.current.toFixed(3)); } catch { /* Not remembered. */ }
      }
      return Math.abs(drift);
    }

    // Check often right after a change, then back off once playback has stayed aligned. A phone that is
    // paused or already in step does not need to wake five times a second.
    let settled = 0;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const drift = sync(video, playback, clockOffset, id);
      settled = drift < 0.12 ? settled + 1 : 0;
      return drift;
    };
    const tick = () => {
      if (disposed) return;
      update();
      // Once in step, check less often; a weak phone (page marked "lite") checks once a second.
      const relaxed = document.documentElement.dataset.perf === "lite" ? 1000 : 500;
      timer = setTimeout(tick, !playback.playing ? 1000 : settled >= 8 ? relaxed : 200);
    };
    tick();
    const markPlaying = () => {
      if (!marked.current.playing) { marked.current.playing = true; performance.mark("sync:playing"); }
      update();
    };
    // Sound came back (the person tapped, or pressed Unmute): no longer playing silently.
    const onVolume = () => { if (!video.muted) { delete video.dataset.autoMuted; setSoundBlocked(false); } };
    const start = setTimeout(update, Math.max(0, playback.anchorAt - (performance.now() + clockOffset)));
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("canplay", update);
    video.addEventListener("seeked", update);
    video.addEventListener("playing", markPlaying);
    video.addEventListener("volumechange", onVolume);
    document.addEventListener("visibilitychange", update);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(start);
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("canplay", update);
      video.removeEventListener("seeked", update);
      video.removeEventListener("playing", markPlaying);
      video.removeEventListener("volumechange", onVolume);
      document.removeEventListener("visibilitychange", update);
      video.playbackRate = 1;
    };
  }, [videoRef, id, playback, clockOffset, duration]);

  /** The person tapped: join the room's playback now (a tap is allowed to start sound). */
  const catchUp = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !room) return;
    heldRef.current = false;
    setHeld(false);
    const now = performance.now() + room.clockOffset;
    const target = playbackPosition(room.playback, now, room.duration);
    const end = Number.isFinite(video.duration) ? Math.min(room.duration, video.duration) : room.duration;
    if (!room.playback.playing || now < room.playback.anchorAt || target >= end) return;
    if (Math.abs(video.currentTime - target) > 0.12) video.currentTime = target + lead.current;
    try {
      delete video.dataset.autoMuted;
      await video.play();
      blocked.current = false;
      setNeedsTap(false);
    } catch {
      blocked.current = true;
      setNeedsTap(true);
    }
  }, [videoRef, room]);

  /** Pause only this device's video. The room keeps playing for everyone else. */
  const holdLocal = useCallback(() => {
    heldRef.current = true;
    setHeld(true);
    videoRef.current?.pause();
  }, [videoRef]);

  /** Come back from a personal pause: jump to where the room is now and play. */
  const rejoin = useCallback(() => { void catchUp(); }, [catchUp]);

  /** The tap that turns silent playback into playback with sound. */
  const enableSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    delete video.dataset.autoMuted;
    video.muted = false;
    setSoundBlocked(false);
  }, [videoRef]);

  return { needsTap, soundBlocked, held, catchUp, holdLocal, rejoin, enableSound };
}
