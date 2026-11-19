"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const key = "screening-sound";

type Saved = { muted: boolean; volume: number };

function load(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Saved> | null;
    return {
      muted: value?.muted === true,
      volume: typeof value?.volume === "number" && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

type AudioGraph = { context: AudioContext; gain: GainNode };

/**
 * This device's sound choice for the video: mute and a volume level. It is remembered, so choosing once holds when the host
 * changes the video or the page reloads, instead of every new player starting at full volume.
 *
 * Most browsers let a page set the video's volume. iPhones and some other phones ignore that (the hardware buttons own the
 * volume), so there the volume is applied by the page instead, through the Web Audio API, which every phone supports.
 * That route is only set up the first time the person actually touches the slider (it needs a tap), and one thing comes with
 * it on iPhone: Web Audio obeys the silent switch, so with the switch on there is no sound.
 */
export function useSound(videoRef: RefObject<HTMLVideoElement | null>) {
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  // The browser will not let the page change the volume of a video, and Web Audio is not available either.
  const [volumeWorks, setVolumeWorks] = useState(true);
  // The volume is applied by the page (Web Audio) rather than by the video element.
  const [soft, setSoft] = useState(false);
  const softRef = useRef(false);
  const volumeRef = useRef(1);
  const graph = useRef<AudioGraph | null>(null);
  const graphFailed = useRef(false);

  /** Build the Web Audio path for this video, once. Needs to run inside a tap or key press so the browser lets it start. */
  const prepare = useCallback(() => {
    const video = videoRef.current;
    if (!video || !softRef.current) return;
    if (graph.current) { void graph.current.context.resume(); return; }
    if (graphFailed.current) return;
    try {
      const Context: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error("No Web Audio");
      const context = new Context();
      const gain = context.createGain();
      gain.gain.value = volumeRef.current;
      context.createMediaElementSource(video).connect(gain).connect(context.destination);
      graph.current = { context, gain };
      void context.resume();
    } catch {
      graphFailed.current = true;
      setVolumeWorks(false);
    }
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const saved = load();
    video.muted = saved.muted;

    // Probe: set a volume that is not 1 and see whether the element kept it. (Setting the remembered volume would hide a
    // phone that ignores volume whenever the remembered volume is 100%.)
    let native = true;
    try {
      video.volume = 0.37;
      native = Math.abs(video.volume - 0.37) < 0.01;
      video.volume = native ? saved.volume : 1;
    } catch { native = false; }
    softRef.current = !native;
    setSoft(!native);
    volumeRef.current = native ? video.volume : saved.volume;
    setMutedState(video.muted);
    setVolumeState(volumeRef.current);

    const persist = () => {
      // A silent start forced by the browser blocking autoplay is not the person's choice, so it is not remembered.
      if (video.dataset.autoMuted === "1" && video.muted) return;
      try { localStorage.setItem(key, JSON.stringify({ muted: video.muted, volume: volumeRef.current })); } catch { /* Not remembered. */ }
    };
    const sync = () => {
      setMutedState(video.muted);
      if (!softRef.current) { volumeRef.current = video.volume; setVolumeState(video.volume); }
      persist();
    };
    video.addEventListener("volumechange", sync);

    // A remembered level below 100% on a phone that needs the Web Audio path: set it up on the first tap or key press.
    const early = () => prepare();
    if (!native && saved.volume < 1) {
      document.addEventListener("pointerup", early, { once: true, capture: true }); // iPhones count the end of a tap, not the start.
      document.addEventListener("keydown", early, { once: true, capture: true });
    }
    return () => {
      video.removeEventListener("volumechange", sync);
      document.removeEventListener("pointerup", early, { capture: true });
      document.removeEventListener("keydown", early, { capture: true });
      void graph.current?.context.close().catch(() => {});
      graph.current = null;
    };
  }, [videoRef, prepare]);

  const setVolume = useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    const level = clamp(next);
    if (softRef.current) {
      prepare();
      volumeRef.current = level;
      setVolumeState(level);
      if (graph.current) graph.current.gain.gain.value = level;
      if (level > 0 && video.muted) video.muted = false; // Also saves the new level through volumechange.
      else try { localStorage.setItem(key, JSON.stringify({ muted: video.muted, volume: level })); } catch { /* Not remembered. */ }
      return;
    }
    try { video.volume = level; } catch { return; }
    // Dragging up from silence should also unmute.
    if (level > 0 && video.muted) video.muted = false;
  }, [videoRef, prepare]);

  const setMuted = useCallback((next: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = next;
    // Unmuting at zero volume would still be silent, which looks like a broken button.
    if (!next && volumeRef.current === 0) setVolume(0.5);
  }, [videoRef, setVolume]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    // Zero volume is silent too, so it counts as muted: the button then offers to unmute, not to mute.
    if (video) setMuted(!(video.muted || volumeRef.current === 0));
  }, [videoRef, setMuted]);

  return { muted: muted || (volumeWorks && volume === 0), volume, volumeWorks, soft, prepare, setMuted, setVolume, toggleMute };
}
