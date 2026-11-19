"use client";

import { useSyncExternalStore } from "react";

export type SubtitleFont = "sans" | "serif" | "mono";

export type SubtitleSettings = {
  /** "" picks automatically (your browser language, else the first track). "off" hides subtitles. Otherwise a language code. */
  trackLang: string;
  /** Text size as a multiple of the default, 0.5 to 2.5. */
  size: number;
  /** Distance from the bottom of the picture, in percent. */
  position: number;
  /** Seconds to shift subtitles. Positive is later, negative is earlier. */
  delay: number;
  /** Extra seconds each line stays after it ends. */
  stay: number;
  /** How many lines can show at once. */
  stack: number;
  color: string;
  opacity: number;
  background: string;
  backgroundOpacity: number;
  /** Outline thickness, 0 to 5. */
  outline: number;
  outlineColor: string;
  shadow: boolean;
  font: SubtitleFont;
  bold: boolean;
};

export const defaultSubtitleSettings: SubtitleSettings = {
  trackLang: "",
  size: 1, position: 7, delay: 0, stay: 0, stack: 2,
  color: "#ffffff", opacity: 1,
  background: "#000000", backgroundOpacity: 0.55,
  outline: 0, outlineColor: "#000000", shadow: false,
  font: "sans", bold: false,
};

/** Look-and-feel bundles. They change how subtitles look, never the track, timing or stacking. */
export const subtitlePresets: { id: "default" | "cinema" | "contrast" | "large" | "minimal"; look: Partial<SubtitleSettings> }[] = [
  { id: "default", look: { size: 1, position: 7, color: "#ffffff", opacity: 1, background: "#000000", backgroundOpacity: 0.55, outline: 0, outlineColor: "#000000", shadow: false, font: "sans", bold: false } },
  { id: "cinema", look: { size: 1.1, position: 8, color: "#ffe14d", opacity: 1, backgroundOpacity: 0, outline: 3, outlineColor: "#000000", shadow: true, font: "sans", bold: true } },
  { id: "contrast", look: { size: 1.2, position: 7, color: "#ffffff", opacity: 1, background: "#000000", backgroundOpacity: 0.9, outline: 0, shadow: false, font: "sans", bold: true } },
  { id: "large", look: { size: 1.8, position: 9, color: "#ffffff", opacity: 1, background: "#000000", backgroundOpacity: 0.7, outline: 0, shadow: false, font: "sans", bold: true } },
  { id: "minimal", look: { size: 0.9, position: 5, color: "#ffffff", opacity: 0.85, backgroundOpacity: 0, outline: 3, outlineColor: "#000000", shadow: true, font: "sans", bold: false } },
];

export const fontStacks: Record<SubtitleFont, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, Menlo, Consolas, monospace",
};

const storageKey = "screening-subtitles";
const colour = /^#[0-9a-f]{6}$/i;
const number = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Accept only well-formed values from storage, so an old or edited entry cannot break the player. */
function sanitize(input: unknown): SubtitleSettings {
  const d = defaultSubtitleSettings;
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    trackLang: typeof v.trackLang === "string" && v.trackLang.length <= 24 ? v.trackLang : d.trackLang,
    size: number(v.size, 0.5, 2.5, d.size),
    position: number(v.position, 2, 40, d.position),
    delay: Math.round(number(v.delay, -30, 30, d.delay) * 10) / 10,
    stay: number(v.stay, 0, 10, d.stay),
    stack: Math.round(number(v.stack, 1, 4, d.stack)),
    color: typeof v.color === "string" && colour.test(v.color) ? v.color : d.color,
    opacity: number(v.opacity, 0.2, 1, d.opacity),
    background: typeof v.background === "string" && colour.test(v.background) ? v.background : d.background,
    backgroundOpacity: number(v.backgroundOpacity, 0, 1, d.backgroundOpacity),
    outline: number(v.outline, 0, 5, d.outline),
    outlineColor: typeof v.outlineColor === "string" && colour.test(v.outlineColor) ? v.outlineColor : d.outlineColor,
    shadow: typeof v.shadow === "boolean" ? v.shadow : d.shadow,
    font: v.font === "serif" || v.font === "mono" || v.font === "sans" ? v.font : d.font,
    bold: typeof v.bold === "boolean" ? v.bold : d.bold,
  };
}

let current = defaultSubtitleSettings;
let loaded = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) current = sanitize(JSON.parse(raw));
  } catch { /* Storage can be blocked or hold junk: keep the defaults. */ }
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Change some settings. Takes effect immediately for every subtitle on screen. */
export function updateSubtitleSettings(change: Partial<SubtitleSettings>) {
  load();
  current = sanitize({ ...current, ...change });
  listeners.forEach(listener => listener());
  // Sliders fire many times a second; write to storage once the dragging settles.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(current)); } catch { /* Not remembered, still applied. */ }
  }, 300);
}

export function resetSubtitleSettings() {
  updateSubtitleSettings({ ...defaultSubtitleSettings });
}

export function getSubtitleSettings() {
  load();
  return current;
}

/** Read all settings, or one value through a selector (cheaper: re-renders only when that value changes). */
export function useSubtitleSettings(): SubtitleSettings;
export function useSubtitleSettings<T>(select: (settings: SubtitleSettings) => T): T;
export function useSubtitleSettings<T>(select?: (settings: SubtitleSettings) => T) {
  return useSyncExternalStore(
    subscribe,
    () => (select ? select(getSubtitleSettings()) : getSubtitleSettings()),
    () => (select ? select(defaultSubtitleSettings) : defaultSubtitleSettings),
  );
}
