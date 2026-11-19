"use client";

import { useEffect, useState, type RefObject } from "react";

export type Stall = "buffering" | "seeking" | null;

/** How long a stall must last before the spinner appears, so a quick seek or a blip does not flash one. */
const showAfter = { buffering: 400, seeking: 250 } as const;
/** How long before the room is told. A short wait is normal for everyone and not worth a message. */
const reportAfter = 3000;

/**
 * Watches the video for the two moments it cannot show a picture: jumping to a new spot (seeking) and running out of data
 * (buffering). Returns what to show: `stalled` is the kind of stall once it has lasted long enough to be worth a spinner
 * (null when everything is fine), and `long` turns true after several seconds so the room can be told.
 *
 * It looks at the video's real state (is it seeking, does it have the next frames) rather than trusting any single
 * event, because browsers do not always fire "waiting" or "playing" when you would expect, and re-checks every second
 * while stalled so a missed event can never leave a spinner on top of a playing picture.
 */
export function useBuffering(videoRef: RefObject<HTMLVideoElement | null>) {
  const [stalled, setStalled] = useState<Stall>(null);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let current: Stall = null;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let longTimer: ReturnType<typeof setTimeout> | undefined;
    let recheck: ReturnType<typeof setInterval> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let longOn = false;

    const state = (): Stall => {
      if (video.seeking) return "seeking";
      // Waiting for data while it should be playing. (Paused, or not yet started, is not buffering.)
      if (!video.paused && !video.ended && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return "buffering";
      return null;
    };

    const evaluate = () => {
      const next = state();
      if (next === current) return;
      current = next;
      clearTimeout(showTimer);
      clearInterval(recheck);
      clearTimeout(hideTimer);
      clearTimeout(settleTimer);
      if (!next) {
        // Back to normal. The spinner goes a moment later, so a stall that ends and starts again straight away (a second jump
        // to catch up, for instance) does not make it blink. The stall only counts as over once it has stayed over for a
        // moment, so one that restarts keeps its history: the room is not told "buffering, not buffering, buffering".
        hideTimer = setTimeout(() => setStalled(null), 200);
        settleTimer = setTimeout(() => { clearTimeout(longTimer); longTimer = undefined; longOn = false; setLong(false); }, 1500);
        return;
      }
      showTimer = setTimeout(() => setStalled(next), showAfter[next]);
      if (!longOn && !longTimer) longTimer = setTimeout(() => { longOn = true; longTimer = undefined; setLong(true); }, reportAfter);
      recheck = setInterval(evaluate, 1000);
    };

    const events = ["waiting", "seeking", "seeked", "playing", "canplay", "canplaythrough", "pause", "play", "emptied", "loadstart", "ended"] as const;
    events.forEach(name => video.addEventListener(name, evaluate));
    evaluate();
    return () => {
      events.forEach(name => video.removeEventListener(name, evaluate));
      clearTimeout(showTimer);
      clearTimeout(longTimer);
      clearTimeout(hideTimer);
      clearTimeout(settleTimer);
      clearInterval(recheck);
    };
  }, [videoRef]);

  return { stalled, long };
}

/** Whether the browser thinks it has a network connection. */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}
