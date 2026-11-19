"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small helpers for the exit half of an animation. CSS can animate something in when it is added to the page, but it
 * cannot animate it out once React has removed it, so these keep a thing on screen for a moment, flagged as leaving, and
 * the stylesheet (see the "Motion" section of globals.css) plays the exit while it lingers.
 */

/** How long a leaving thing stays in the page. A little longer than --dur-exit in globals.css, so the exit has finished. */
const exitMs = 180;

/**
 * Should things leave at once, with no exit animation? True on weak phones (the "lite" mode set by usePlaybackQuality)
 * and for people who asked their device for less motion. Only call it from an event or an effect, never while hydrating.
 */
export function instantMotion() {
  if (typeof document === "undefined") return true;
  try {
    return document.documentElement.dataset.perf === "lite" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/**
 * Keeps the last value on screen for a moment after it goes away. While `closing` is true, render it as leaving
 * (data-closing, inert) and let the stylesheet fade it out. Pass `null` for "not shown". Going straight from one value to
 * another shows the new one at once, so two panels are never on screen together.
 */
export function usePresence<T>(value: T | null, ms = exitMs): { shown: T | null; closing: boolean } {
  const present = value !== null;
  const last = useRef(value);
  if (present) last.current = value;
  // `gone` is true once the exit has finished (or nothing was ever shown).
  const [gone, setGone] = useState(!present);
  if (present && gone) setGone(false);
  const lingering = !present && !gone;
  const skip = lingering && instantMotion();

  useEffect(() => {
    if (!lingering) return;
    const timer = setTimeout(() => setGone(true), skip ? 0 : ms);
    return () => clearTimeout(timer);
  }, [lingering, skip, ms]);

  const closing = lingering && !skip;
  return { shown: present ? value : closing ? last.current : null, closing };
}

export type PresentRow<T> = { item: T; key: string; leaving: boolean };

/**
 * The rows of a list, plus the rows that were just removed from it (flagged `leaving`) at the place they used to be,
 * for a moment, so they can fade out instead of vanishing. `items` should keep its identity while nothing changes.
 */
export function useListPresence<T>(items: readonly T[], keyOf: (item: T) => string, ms = exitMs): PresentRow<T>[] {
  const [previous, setPrevious] = useState(items);
  const [ghosts, setGhosts] = useState<{ item: T; key: string; index: number }[]>([]);

  if (previous !== items) {
    setPrevious(items);
    const live = new Set(items.map(keyOf));
    const kept = ghosts.filter(ghost => !live.has(ghost.key));
    const added = instantMotion() ? [] : previous
      .map((item, index) => ({ item, key: keyOf(item), index }))
      .filter(ghost => !live.has(ghost.key) && !kept.some(other => other.key === ghost.key));
    if (added.length || kept.length !== ghosts.length) setGhosts([...kept, ...added]);
  }

  useEffect(() => {
    if (!ghosts.length) return;
    const keys = new Set(ghosts.map(ghost => ghost.key));
    const timer = setTimeout(() => setGhosts(list => list.filter(ghost => !keys.has(ghost.key))), ms);
    return () => clearTimeout(timer);
  }, [ghosts, ms]);

  const rows: PresentRow<T>[] = items.map(item => ({ item, key: keyOf(item), leaving: false }));
  for (const ghost of [...ghosts].sort((a, b) => a.index - b.index)) {
    rows.splice(Math.min(ghost.index, rows.length), 0, { item: ghost.item, key: ghost.key, leaving: true });
  }
  return rows;
}
