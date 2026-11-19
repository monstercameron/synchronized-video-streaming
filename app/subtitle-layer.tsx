"use client";

import { countRender } from "./debug-renders";
import { memo, useEffect, useState, type CSSProperties, type RefObject } from "react";
import { useI18n } from "./i18n";
import { cueHtml, secondsUntilChange, visibleCues, type Cue, type CueList } from "./subtitle-engine";
import { fontStacks, useSubtitleSettings } from "./subtitle-settings";


function rgba(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * Draws the current subtitle lines over the picture, in the viewer's own style. The text comes from the video's
 * subtitle track; timing, delay, stay and stacking are applied here, so changes show up instantly.
 */
export const SubtitleLayer = memo(function SubtitleLayer({ videoRef, list, enabled, preview }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  list?: CueList;
  enabled: boolean;
  /** While the settings are open, show a sample line whenever no real subtitle is due. */
  preview: boolean;
}) {
  const { t } = useI18n();
  countRender("subtitles");
  const settings = useSubtitleSettings();
  const [active, setActive] = useState<Cue[]>([]);
  const { delay, stay, stack } = settings;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled || !list) {
      setActive([]);
      return;
    }
    let previous = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timing = { delay, stay, stack };

    // Works out what should show now, and (while playing) sets one timer for the moment that could change it: the next line
    // starting or one ending. No polling, so a weak phone is not woken ten times a second to find out nothing has changed.
    // The timer is also never longer than a second, so a stall, a seek or a speed change cannot leave a stale line up.
    const update = () => {
      if (timer) { clearTimeout(timer); timer = undefined; }
      const now = video.currentTime;
      const next = visibleCues(list, now, timing);
      const key = next.map(cue => cue.id).join(",");
      if (key !== previous) {
        previous = key;
        setActive(next);
      }
      if (video.paused || video.ended) return;
      const wait = secondsUntilChange(list, now, timing) / (video.playbackRate || 1);
      timer = setTimeout(update, Math.min(1000, Math.max(40, wait * 1000 + 15)));
    };

    const events = ["seeking", "seeked", "play", "playing", "pause", "ended", "emptied", "ratechange"] as const;
    events.forEach(name => video.addEventListener(name, update));
    update();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(name => video.removeEventListener(name, update));
    };
  }, [videoRef, list, enabled, delay, stay, stack]);

  const lines = enabled && active.length ? active : preview ? [{ id: "sample", start: 0, end: 0, text: t("subs.preview") } as Cue] : [];
  if (!lines.length) return null;

  const style = {
    "--sub-scale": settings.size,
    "--sub-bottom": `${settings.position}%`,
    "--sub-color": rgba(settings.color, settings.opacity),
    "--sub-bg": rgba(settings.background, settings.backgroundOpacity),
    "--sub-stroke": `calc(${settings.outline} * 0.035em)`,
    "--sub-stroke-color": settings.outlineColor,
    "--sub-shadow": settings.shadow ? "0 0.06em 0.14em rgba(0, 0, 0, 0.85)" : "none",
    "--sub-font": fontStacks[settings.font],
    "--sub-weight": settings.bold ? 700 : 500,
  } as CSSProperties;

  return (
    <div className="subtitle-layer" style={style} aria-hidden="true">
      <div className="subtitle-stack">
        {lines.map(cue => <p key={cue.id} className="subtitle-line" dangerouslySetInnerHTML={{ __html: cueHtml(cue.text) }} />)}
      </div>
    </div>
  );
});
