#!/usr/bin/env node
// Make any video file browser-ready for the screening room.
//
//   node scripts/prepare-media.mjs <input> [options]
//
//   --out <dir>        Where to write (default: $MEDIA_DIR, else .data/media)
//   --name <text>       Name for the output files (default: the input file's name)
//   --audio-lang <code> Which audio track to use, by language such as eng or spa (default: the file's default track)
//   --hls              Build an adaptive HLS ladder instead of a single MP4
//   --max-height <px>  Never output taller than this (forces a re-encode when the source is taller)
//   --crf <n>          H.264 quality when re-encoding, lower is better (default 20)
//   --preset <name>    x264 speed/size trade-off (default medium)
//   --dry-run          Print the ffmpeg commands without running them
//
// MP4 mode copies the video and audio untouched when browsers can already play them
// (H.264 8-bit video, AAC audio) and only re-encodes the part that cannot. It always
// moves the MP4 index to the front so playback starts immediately.
// Text subtitles are extracted to .vtt files next to the video, plus a poster image.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const valueOptions = new Set(["out", "max-height", "crf", "preset", "name", "audio-lang"]);
const input = args.find((arg, index) => !arg.startsWith("--") && !valueOptions.has(args[index - 1]?.replace(/^--/, "")));

if (!input || flag("help")) {
  console.log(`Usage: node scripts/prepare-media.mjs <input> [--out dir] [--hls] [--max-height 1080] [--crf 20] [--preset medium] [--dry-run]`);
  process.exit(input ? 0 : 1);
}

const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";
const outDir = resolve(option("out", process.env.MEDIA_DIR ?? ".data/media"));
const crf = option("crf", "20");
const preset = option("preset", "medium");
const dryRun = flag("dry-run");
const source = resolve(input);
if (!existsSync(source)) fail(`Input not found: ${source}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const probed = spawnSync(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", source], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (probed.error?.code === "ENOENT") fail("ffprobe was not found. Install FFmpeg, or set FFPROBE_PATH.");
if (probed.status !== 0) fail(`ffprobe could not read the input:\n${probed.stderr}`);
const info = JSON.parse(probed.stdout);
const video = info.streams.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
const audioStreams = info.streams.filter(stream => stream.codec_type === "audio");
const wantedLang = option("audio-lang", "").toLowerCase();
const langOf = stream => (stream.tags?.language ?? "").toLowerCase();
// Files with several languages often list a foreign track first, so pick by language, then by the "default" flag.
if (wantedLang && !audioStreams.some(stream => langOf(stream) === wantedLang)) fail(`No audio track in language "${wantedLang}". Found: ${audioStreams.map(langOf).join(", ") || "none"}`);
const audioIndex = Math.max(0, wantedLang ? audioStreams.findIndex(stream => langOf(stream) === wantedLang) : audioStreams.findIndex(stream => stream.disposition?.default));
const audio = audioStreams[audioIndex];
if (!video) fail("The input has no video track.");
const duration = Number(info.format.duration) || 0;
const stem = option("name", basename(source, extname(source)));
const maxHeight = Number(option("max-height", 0)) || Infinity;
const targetHeight = Math.min(video.height, maxHeight);
const [frameNumerator, frameDenominator = 1] = String(video.avg_frame_rate || "30").split("/").map(Number);
const fps = frameNumerator / (frameDenominator || 1) || 30; // e.g. "30000/1001"
const eightBitH264 = video.codec_name === "h264" && /^yuvj?420p$/.test(video.pix_fmt ?? "yuv420p");
const keyframes = String(Math.round(fps * 6));

console.log(`${basename(source)}: ${video.codec_name} ${video.width}x${video.height} (${video.pix_fmt}), audio ${audio?.codec_name ?? "none"}, ${Math.round(duration)}s`);

function run(label, command, commandArgs) {
  console.log(`\n> ${label}\n  ${command} ${commandArgs.map(arg => (/\s|\[/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
  if (dryRun) return Promise.resolve();
  return new Promise((done, reject) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", error => reject(error.code === "ENOENT" ? new Error("ffmpeg was not found. Install FFmpeg, or set FFMPEG_PATH.") : error));
    child.on("close", code => (code === 0 ? done() : reject(new Error(`${label} failed (exit ${code}).`))));
  });
}

// ffmpeg writes these patterns into the playlists, so they must use forward slashes even on Windows.
const slashes = path => path.split("\\").join("/");

const quiet = ["-hide_banner", "-loglevel", "warning", "-stats", "-y"];

async function mp4() {
  mkdirSync(outDir, { recursive: true });
  let target = join(outDir, `${stem}.mp4`);
  if (resolve(target) === source) target = join(outDir, `${stem}.prepared.mp4`);

  const reencodeVideo = !eightBitH264 || targetHeight < video.height;
  const videoArgs = reencodeVideo
    ? ["-c:v", "libx264", "-preset", preset, "-crf", crf, "-pix_fmt", "yuv420p", ...(targetHeight < video.height ? ["-vf", `scale=-2:${targetHeight}`] : [])]
    : ["-c:v", "copy"];
  const audioArgs = !audio ? ["-an"] : audio.codec_name === "aac" && (audio.channels ?? 2) <= 2 ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k", "-ac", "2"];

  await run(`${reencodeVideo ? "Re-encoding" : "Copying"} video, ${audio ? (audioArgs[1] === "copy" ? "copying" : "converting") + " audio" : "no audio"} -> ${basename(target)}`, ffmpeg, [
    ...quiet, "-i", source, "-map", "0:v:0", ...(audio ? ["-map", `0:a:${audioIndex}`] : []), "-sn", "-dn",
    ...videoArgs, ...audioArgs, "-movflags", "+faststart", target,
  ]);
  return target;
}

async function hls() {
  // The small rungs are what let a weak phone or a poor connection keep playing instead of stalling.
  const heights = [1080, 720, 480, 360, 240].filter(height => height <= targetHeight);
  if (!heights.length) heights.push(targetHeight);
  const rate = { 2160: 14000, 1080: 5000, 720: 2800, 480: 1200, 360: 700, 240: 350 };
  const dir = join(outDir, stem);
  mkdirSync(dir, { recursive: true });
  for (const height of heights) mkdirSync(join(dir, `v${height}p`), { recursive: true });

  const split = `[0:v]split=${heights.length}${heights.map((_, i) => `[s${i}]`).join("")}`;
  const scales = heights.map((height, i) => `[s${i}]scale=-2:${height}[v${i}]`);
  const codec = heights.flatMap((height, i) => {
    const bitrate = rate[height] ?? 2800;
    // Small rungs use the Main profile, which every phone decodes in hardware.
    return [`-map`, `[v${i}]`, `-c:v:${i}`, "libx264", `-profile:v:${i}`, height <= 480 ? "main" : "high", `-b:v:${i}`, `${bitrate}k`, `-maxrate:v:${i}`, `${Math.round(bitrate * 1.07)}k`, `-bufsize:v:${i}`, `${bitrate * 2}k`];
  });
  const audios = audio ? heights.flatMap(() => ["-map", `0:a:${audioIndex}`]) : [];

  await run(`Building HLS ladder ${heights.map(height => `${height}p`).join(", ")} -> ${basename(dir)}/`, ffmpeg, [
    ...quiet, "-i", source, "-filter_complex", [split, ...scales].join(";"),
    ...codec, ...audios, "-preset", preset, "-pix_fmt", "yuv420p",
    "-g", keyframes, "-keyint_min", keyframes, "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*6)",
    ...(audio ? ["-c:a", "aac", "-ac", "2", ...heights.flatMap((height, i) => [`-b:a:${i}`, height >= 720 ? "128k" : height >= 360 ? "96k" : "64k"])] : []),
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
    "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", slashes(join(dir, "v%v", "segment_%03d.m4s")),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", heights.map((height, i) => `v:${i}${audio ? `,a:${i}` : ""},name:${height}p`).join(" "),
    slashes(join(dir, "v%v", "index.m3u8")),
  ]);
  return dir;
}

const iso2 = { eng: "en", spa: "es", ara: "ar", cze: "cs", dan: "da", ger: "de", gre: "el", fin: "fi", fil: "fil", fre: "fr", heb: "he", hrv: "hr", hun: "hu", ind: "id", ita: "it", jpn: "ja", kor: "ko", may: "ms", nob: "nb", dut: "nl", pol: "pl", por: "pt", rum: "ro", rus: "ru", swe: "sv", tha: "th", tur: "tr", ukr: "uk", vie: "vi", chi: "zh", zho: "zh", fra: "fr", deu: "de", nld: "nl", ces: "cs", ell: "el", ron: "ro", msa: "ms" };

/** A short, unique name for a subtitle track: es-419, pt-BR, zh-Hant, en-sdh, en-forced. The library turns it into a readable label. */
function trackCode(stream) {
  const raw = (stream.tags?.language ?? "").toLowerCase();
  const lang = iso2[raw] ?? (raw.length === 2 ? raw : raw || "und");
  const title = stream.tags?.title ?? "";
  const part = [];
  if (/latin america/i.test(title)) part.push("419");
  else if (/brazil/i.test(title)) part.push("BR");
  else if (/portugal/i.test(title)) part.push("PT");
  else if (/traditional/i.test(title)) part.push("Hant");
  else if (/simplified/i.test(title)) part.push("Hans");
  const code = [lang, ...part].join("-");
  const flag = /sdh|hearing|\bcc\b/i.test(title) || stream.disposition?.hearing_impaired ? "sdh" : /forced/i.test(title) ? "forced" : ""; // The title is trusted over the forced flag: some files flag their main English track as forced.
  return flag ? `${code}-${flag}` : code;
}

/**
 * Text subtitles become .vtt files and one frame becomes the poster. Picture-based subtitles
 * (PGS, DVD) cannot be converted here. `subtitleFile(code)` decides where each .vtt goes.
 */
async function sidecars(subtitleFile, poster) {
  const picture = ["hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle"];
  const used = new Set();
  const outputs = [];
  let index = 0;
  for (const stream of info.streams.filter(stream => stream.codec_type === "subtitle")) {
    if (picture.includes(stream.codec_name)) {
      console.log(`\n(skipping picture-based subtitle track ${index}: ${stream.codec_name})`);
    } else {
      let code = trackCode(stream);
      for (let copy = 2; used.has(code); copy++) code = `${trackCode(stream)}${copy}`;
      used.add(code);
      outputs.push("-map", `0:s:${index}`, "-c:s", "webvtt", subtitleFile(code));
    }
    index++;
  }
  // All tracks in one pass over the file instead of one pass each.
  if (outputs.length) await run(`Extracting ${outputs.length / 5} subtitle track(s)`, ffmpeg, [...quiet, "-i", source, ...outputs]);
  await run(`Poster image -> ${basename(poster)}`, ffmpeg, [...quiet, "-ss", String(Math.round(duration * 0.1)), "-i", source, "-frames:v", "1", "-update", "1", "-vf", "scale=-2:720", "-q:v", "3", poster]);
}

try {
  if (flag("hls")) {
    const dir = await hls();
    await sidecars(lang => join(dir, `${lang}.vtt`), join(dir, "poster.jpg"));
    console.log(`
Done: ${dir}`);
  } else {
    const file = await mp4();
    const base = file.slice(0, -extname(file).length);
    // Single files share the video's name: Movie.mp4, Movie.en.vtt, Movie.jpg.
    await sidecars(lang => `${base}.${lang}.vtt`, `${base}.jpg`);
    console.log(`
Done: ${file}`);
  }
  console.log("Open the Video tab in a room and tap Rescan.");
} catch (error) {
  fail(error.message);
}
