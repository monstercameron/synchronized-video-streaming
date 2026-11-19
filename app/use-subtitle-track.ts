"use client";

import { useEffect, useState, type RefObject } from "react";
import { prepareCues, type CueList } from "./subtitle-engine";
import { useI18n } from "./i18n";
import { updateSubtitleSettings, useSubtitleSettings } from "./subtitle-settings";

export type Caption = { source: string; language: string; label: string };

/** A stable name for a track in the saved settings: its language, or its position when it has none. */
export const captionId = (caption: Caption, index: number) => caption.language || `#${index}`;

/** Which track the viewer's setting points at, or -1 for off. Automatic prefers the browser's language. */
export function resolveTrack(captions: Caption[], trackLang: string, appLang: string) {
  if (!captions.length || trackLang === "off") return -1;
  const base = (code: string) => code.split("-")[0].toLowerCase();
  // A saved choice: that exact track, or (for a bare language such as "es") the first track in that language.
  const byId = trackLang ? captions.findIndex((caption, index) => captionId(caption, index) === trackLang) : -1;
  if (byId >= 0) return byId;
  const byLanguage = trackLang ? captions.findIndex(caption => base(caption.language) === base(trackLang)) : -1;
  if (byLanguage >= 0) return byLanguage;
  // Otherwise the app's language, then the browser's, then the first track.
  const browser = typeof navigator === "undefined" ? "" : base(navigator.language);
  for (const language of [appLang, browser]) {
    const match = captions.findIndex(caption => base(caption.language) === language);
    if (match >= 0) return match;
  }
  return 0;
}

/**
 * Chooses the subtitle track from this viewer's setting and loads its lines. The browser still downloads and
 * parses the track (in "hidden" mode, so it draws nothing); we draw the lines ourselves so size, colour, delay,
 * stay and stacking can all change live. On iPhone's own full-screen player our drawing is not visible, so the
 * browser's native subtitles are switched on there.
 */
export function useSubtitleTrack(videoRef: RefObject<HTMLVideoElement | null>, captions: Caption[], nativeFullscreen: boolean) {
  const { lang } = useI18n();
  const trackLang = useSubtitleSettings(settings => settings.trackLang);
  const index = resolveTrack(captions, trackLang, lang);
  const [list, setList] = useState<CueList>();
  const signature = captions.map(caption => caption.source).join("|");

  useEffect(() => {
    const video = videoRef.current;
    setList(undefined);
    if (!video) return;
    const elements = [...video.querySelectorAll("track")];
    elements.forEach((element, position) => {
      element.track.mode = position !== index ? "disabled" : nativeFullscreen ? "showing" : "hidden";
    });
    const track = elements[index]?.track;
    if (!track) return;

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      if (cancelled || !track.cues) return false;
      const raw = [...track.cues].map(cue => ({ startTime: cue.startTime, endTime: cue.endTime, text: (cue as VTTCue).text ?? "" }));
      setList(prepareCues(raw));
      return true;
    };
    const onLoad = () => { read(); };
    elements[index].addEventListener("load", onLoad);
    // Cues can arrive before or after we start listening, so also look now and again shortly.
    if (!read()) retry = setTimeout(read, 400);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      elements[index]?.removeEventListener("load", onLoad);
    };
  }, [videoRef, index, signature, nativeFullscreen]);

  function select(next: number) {
    updateSubtitleSettings({ trackLang: next < 0 ? "off" : captionId(captions[next], next) });
  }

  return { index, list, label: index >= 0 ? captions[index].label : "", select };
}
