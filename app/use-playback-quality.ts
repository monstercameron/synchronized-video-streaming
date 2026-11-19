"use client";

import { useCallback, useEffect, useState } from "react";
import { deviceProfile, type DeviceProfile } from "./device";

/**
 * "auto" lets the player climb to the best quality it can fetch. "saver" keeps video at 480p or below. A value like
 * "h720" fixes the quality at that rung (it stays there even if the connection could do more or less).
 */
export type Quality = "auto" | "saver" | `h${number}`;

/** The pixel height of a fixed quality, or undefined for auto and saver. */
export function fixedHeight(quality: Quality) {
  const match = /^h(\d{3,4})$/.exec(quality);
  return match ? Number(match[1]) : undefined;
}

const isQuality = (value: string | null): value is Quality => value === "auto" || value === "saver" || /^h\d{3,4}$/.test(value ?? "");

const key = "screening-quality";

/**
 * Should this page switch itself to the light mode? A phone can look capable on paper (memory and cores are only hints)
 * and still struggle. The browser reports "long tasks": stretches of 50 ms or more when the page could not respond. A few of
 * those during start-up and the first moments of use are normal on a fast machine. Many, or a lot of time lost to them,
 * means this device is slow, whatever its specification says. Pure, so it can be tested without a browser.
 */
export function shouldGoLite(longTasks: number[]) {
  const blocked = longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0);
  return longTasks.length >= 6 || blocked >= 700 || longTasks.some(duration => duration >= 600);
}

/** How long after the page starts the check keeps listening. */
const watchWindow = 25000;

/**
 * The viewer's quality choice, remembered on this device. Weak phones and slow or Data Saver networks
 * start on "saver" until the person chooses otherwise. Also marks the page so CSS can drop heavy effects.
 */
export function usePlaybackQuality() {
  const [quality, setQualityState] = useState<Quality>("auto");
  const [profile, setProfile] = useState<DeviceProfile>({ lowEnd: false, constrained: false, reasons: [] });

  // Watch how the page copes. If it keeps stalling, drop to the light mode and Data saver (unless the person chose a quality).
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
    const tasks: number[] = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) tasks.push(entry.duration);
      if (!shouldGoLite(tasks)) return;
      observer.disconnect();
      document.documentElement.dataset.perf = "lite";
      setProfile(previous => previous.lowEnd ? previous : { ...previous, lowEnd: true, reasons: [...previous.reasons, { key: "device.slow" }] });
      let chosen: string | null = null;
      try { chosen = localStorage.getItem(key); } catch { /* Storage can be blocked. */ }
      if (!isQuality(chosen)) setQualityState(current => current === "auto" ? "saver" : current);
    });
    try { observer.observe({ type: "longtask", buffered: true }); } catch { return; }
    const stop = setTimeout(() => observer.disconnect(), watchWindow);
    return () => { clearTimeout(stop); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const detected = deviceProfile();
    setProfile(detected);
    document.documentElement.dataset.perf = detected.lowEnd ? "lite" : "full";
    let saved: string | null = null;
    try { saved = localStorage.getItem(key); } catch { /* Storage can be blocked. */ }
    setQualityState(isQuality(saved) ? saved : detected.lowEnd || detected.constrained ? "saver" : "auto");
  }, []);

  const setQuality = useCallback((next: Quality) => {
    setQualityState(next);
    try { localStorage.setItem(key, next); } catch { /* Not remembered, still applied. */ }
  }, []);

  return { quality, setQuality, profile };
}
