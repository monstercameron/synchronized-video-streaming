"use client";

import type { MessageKey } from "./i18n/en";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { MemberHealth, MediaInfo } from "./room-shared";

type Capabilities = { decodingInfo?: (config: unknown) => Promise<{ supported: boolean; smooth: boolean }> };

/** A codec string a decoder can be asked about, chosen to match the video's size. */
function contentType(media: MediaInfo) {
  const level = media.height > 1440 ? "640033" : media.height > 720 ? "640028" : "64001f";
  switch (media.vcodec) {
    case "h264": return `video/mp4; codecs="avc1.${level}"`;
    case "hevc": return 'video/mp4; codecs="hvc1.1.6.L120.90"';
    case "vp9": return 'video/webm; codecs="vp09.00.10.08"';
    case "vp8": return 'video/webm; codecs="vp8"';
    case "av1": return 'video/mp4; codecs="av01.0.08M.08"';
    default: return undefined;
  }
}

/**
 * Watches whether this device can actually keep up with the video, and reports it so the viewer can
 * switch to a lighter setting and the host can see who is struggling.
 *
 * Two checks: before playing, ask the browser whether it can decode this size and bitrate smoothly; while
 * playing, watch for dropped frames and repeated stalls.
 */
export function useVideoHealth(videoRef: RefObject<HTMLVideoElement | null>, media: MediaInfo, report?: (level: MemberHealth) => void) {
  const [reason, setReason] = useState<MessageKey | "">("");
  const level = useRef<MemberHealth>("ok");
  const reported = useRef(report);
  reported.current = report;

  function change(next: MemberHealth, why: MessageKey | "" = "") {
    setReason(next === "ok" ? "" : why);
    if (level.current === next) return;
    level.current = next;
    reported.current?.(next);
  }

  // Before play: can this device decode this video smoothly at all?
  useEffect(() => {
    const type = contentType(media);
    const capabilities = (navigator as Navigator & { mediaCapabilities?: Capabilities }).mediaCapabilities;
    if (!type || !capabilities?.decodingInfo || media.kind !== "file") return;
    let cancelled = false;
    capabilities.decodingInfo({
      type: "file",
      video: { contentType: type, width: media.width, height: media.height, bitrate: Math.max(media.bitrate, 1), framerate: 30 },
    }).then(result => {
      if (cancelled) return;
      if (!result.supported) change("struggling", "health.noDecode");
      else if (!result.smooth) change("struggling", "health.heavy");
    }).catch(() => { /* Older browsers cannot answer; the playback check below still runs. */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, media.version]);

  // While playing: dropped frames and stalls.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let dropped = 0;
    let total = 0;
    let bad = 0;
    let good = 0;
    let waits: number[] = [];
    let startedAt = 0;

    const resetCounters = () => {
      const quality = video.getVideoPlaybackQuality?.();
      dropped = quality?.droppedVideoFrames ?? 0;
      total = quality?.totalVideoFrames ?? 0;
      startedAt = performance.now();
    };
    // Waiting right after a seek or a start is normal. Only stalls in the middle of playing count.
    const onWaiting = () => {
      if (video.seeking || performance.now() - startedAt < 6000) return;
      const now = performance.now();
      waits = [...waits.filter(at => now - at < 30000), now];
      if (waits.length >= 3) change("struggling", "health.stalling");
    };
    const onPlaying = () => resetCounters();

    const timer = setInterval(() => {
      if (video.paused || video.seeking || document.hidden || performance.now() - startedAt < 4000) return;
      const quality = video.getVideoPlaybackQuality?.();
      if (!quality) return;
      const frames = quality.totalVideoFrames - total;
      const lost = quality.droppedVideoFrames - dropped;
      dropped = quality.droppedVideoFrames;
      total = quality.totalVideoFrames;
      if (frames < 30) return;
      if (lost / frames > 0.2) { bad++; good = 0; } else { good++; if (lost / frames < 0.05) bad = 0; }
      if (bad >= 2) change("struggling", "health.dropping");
      // Recovered (for example after switching to a lighter setting): stay quiet for a while, then clear.
      else if (level.current === "struggling" && good >= 5 && waits.every(at => performance.now() - at > 30000)) change("ok");
    }, 2000);

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("seeked", onPlaying);
    resetCounters();
    return () => {
      clearInterval(timer);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("seeked", onPlaying);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, media.id]);

  return { struggling: reason !== "", reason };
}
