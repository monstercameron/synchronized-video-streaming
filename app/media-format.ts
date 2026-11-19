import { formatNumber } from "./i18n/format";
import type { MediaInfo } from "./room-shared";

export function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** "1.4 GB" in English, "1,4 GB" in Spanish. The server sends English (the default). */
export function formatSize(bytes: number, locale = "en") {
  if (bytes >= 1e9) return `${formatNumber(locale, bytes / 1e9, 1)} GB`;
  return `${formatNumber(locale, Math.max(1, Math.round(bytes / 1e6)))} MB`;
}

export function resolutionLabel(height: number) {
  if (height >= 2000) return "4K";
  return height ? `${height}p` : "";
}

export function formatBitrate(bitsPerSecond: number, locale: string, unknown: string) {
  return bitsPerSecond > 0 ? `${formatNumber(locale, bitsPerSecond / 1e6, 1)} Mb/s` : unknown;
}

const videoCodecs: Record<string, string> = {
  h264: "H.264 (AVC)", hevc: "H.265 (HEVC)", vp9: "VP9", vp8: "VP8", av1: "AV1", mpeg4: "MPEG-4", mpeg2video: "MPEG-2",
};

const audioCodecs: Record<string, string> = {
  aac: "AAC", mp3: "MP3", opus: "Opus", vorbis: "Vorbis", flac: "FLAC", ac3: "Dolby Digital (AC-3)", eac3: "Dolby Digital Plus",
  dts: "DTS", truehd: "Dolby TrueHD", pcm_s16le: "PCM",
};

export const videoCodecLabel = (codec: string, unknown: string) => videoCodecs[codec] ?? (codec ? codec.toUpperCase() : unknown);
export const audioCodecLabel = (codec: string, none: string) => (codec ? audioCodecs[codec] ?? codec.toUpperCase() : none);

/** A readable name for the file format, from what the probe reported. */
export function containerLabel(media: Pick<MediaInfo, "kind" | "container">, text: { hls: string; unknown: string }) {
  if (media.kind === "hls") return text.hls;
  const name = media.container.toLowerCase();
  if (name.includes("mp4") || name.includes("mov")) return "MP4";
  if (name.includes("matroska")) return "MKV / WebM";
  if (name.includes("webm")) return "WebM";
  return media.container || text.unknown;
}
