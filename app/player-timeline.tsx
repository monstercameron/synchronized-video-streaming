"use client";

import { memo, useEffect, useState, type CSSProperties, type RefObject } from "react";
import { countRender } from "./debug-renders";
import { useI18n } from "./i18n";

export function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

/**
 * The time bar. It keeps the playback time to itself: the video reports the time several times a second, and if the
 * player held that in its own state, every report would re-render the whole player (buttons, notices, panels) just to
 * move one number. Here only this small component updates. On a weak phone that is the difference between the page
 * being idle and being busy all the time while the film plays.
 */
export const PlayerTimeline = memo(function PlayerTimeline({ videoRef, duration, lite, disabled, onSeek, onScrub }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number;
  /** Weak device: the bar moves about once a second instead of four times. */
  lite?: boolean;
  disabled: boolean;
  /** Ask for a new position. The returned promise settles when the jump has happened, which is when the preview is dropped. */
  onSeek: (position: number) => Promise<void> | void;
  onScrub: (scrubbing: boolean) => void;
}) {
  countRender("timeline");
  const { t } = useI18n();
  const [time, setTime] = useState(0);
  // How far the video has loaded ahead of the playing position, so a seek can be aimed at what will start at once.
  const [loaded, setLoaded] = useState(0);
  // Where the thumb is while it is being dragged or a jump is on its way, so the bar never snaps back in between.
  const [preview, setPreview] = useState<number>();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const step = lite ? 0.9 : 0.2;
    const follow = () => setTime(previous => Math.abs(video.currentTime - previous) >= step ? video.currentTime : previous);
    const exact = () => { setTime(video.currentTime); measure(); };
    const reset = () => { setTime(0); setLoaded(0); };
    // The end of the loaded stretch that contains the playing position (or the position itself when nothing is loaded there).
    function measure() {
      const ranges = video!.buffered;
      const now = video!.currentTime;
      let end = now;
      for (let index = 0; index < ranges.length; index++) {
        if (ranges.start(index) <= now + 0.25 && ranges.end(index) >= now) { end = ranges.end(index); break; }
      }
      setLoaded(previous => Math.abs(end - previous) >= (lite ? 3 : 1) ? end : previous);
    }
    exact();
    video.addEventListener("timeupdate", follow);
    video.addEventListener("progress", measure);
    video.addEventListener("loadedmetadata", exact);
    video.addEventListener("seeked", exact);
    video.addEventListener("emptied", reset);
    return () => {
      video.removeEventListener("timeupdate", follow);
      video.removeEventListener("progress", measure);
      video.removeEventListener("loadedmetadata", exact);
      video.removeEventListener("seeked", exact);
      video.removeEventListener("emptied", reset);
    };
  }, [videoRef, lite]);

  const position = Math.min(preview ?? time, duration);
  const style = {
    "--played": `${duration ? (position / duration) * 100 : 0}%`,
    "--buffered": `${duration ? (Math.max(loaded, position) / duration) * 100 : 0}%`,
  } as CSSProperties;

  function change(value: number) {
    setPreview(value);
    // Only the newest request settles; an older one is replaced by it, so it can leave the preview alone.
    void Promise.resolve(onSeek(value)).then(() => setPreview(current => current === value ? undefined : current));
  }

  return (
    <div className="player-timeline">
      <span aria-hidden="true">{formatTime(position)}</span>
      <input
        type="range"
        aria-label={t("player.position")}
        aria-valuetext={t("player.positionText", { time: formatTime(position), total: formatTime(duration) })}
        min={0}
        max={duration || 1}
        step="any"
        value={position}
        style={style}
        disabled={disabled}
        onChange={({ currentTarget }) => change(currentTarget.valueAsNumber)}
        onPointerDown={() => onScrub(true)}
        onPointerUp={() => onScrub(false)}
        onPointerCancel={() => onScrub(false)}
        onBlur={() => onScrub(false)}
      />
      <span aria-hidden="true">{formatTime(duration)}</span>
    </div>
  );
});
