"use client";

import { countRender } from "./debug-renders";
import type Hls from "hls.js";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { PlayerIcon } from "./player-icon";
import type { Level, SettingsTab } from "./player-settings";
import dynamic from "next/dynamic";
import { PlayerTimeline } from "./player-timeline";
import { useBuffering, useOnline } from "./use-buffering";
import { SubtitleLayer } from "./subtitle-layer";
import { useI18n } from "./i18n";
import { playbackPosition, type MediaInfo, type RoomCommand } from "./room-shared";
import { fixedHeight, type Quality } from "./use-playback-quality";
import { useSound } from "./use-sound";
import { useSubtitleTrack, type Caption } from "./use-subtitle-track";
import { useVideoHealth } from "./use-video-health";
import { listNames } from "./screen-layout";
import { useIdle } from "./use-idle";
import { readLead, roomTarget, useRoomPlayback, type PlayerRoom } from "./use-room-playback";

type VideoPlayerProps = {
  title: string;
  source: string;
  /** "file" plays a single MP4/WebM/MKV directly; "hls" plays a segmented adaptive stream. */
  kind: "file" | "hls";
  poster?: string;
  captions: Caption[];
  room?: PlayerRoom;
  media: MediaInfo;
  /** A weak device: update the clock and progress bar less often. */
  lite?: boolean;
  /** Data saver keeps HLS at 480p or below with small buffers, for weak phones and slow connections. */
  quality: Quality;
  onQuality: (quality: Quality) => void;
  /** Drawn over the picture (and kept in full screen), e.g. scrolling reactions. */
  overlay?: ReactNode;
};

type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

/**
 * The highest quality level this player should fetch. Two limits apply: never more pixels than the player can
 * show (a 390px-wide phone does not need 1080p), and in saver mode never above 480p.
 *
 * hls.js's own "cap to player size" is switched off because it rewrites the cap on its own schedule and would
 * undo the saver limit. Only the ceiling is set here; the player still picks the level itself. Pinning a level
 * (hls.nextLevel = ...) would switch it to manual mode and it would never climb again.
 */
function levelCap(hls: Hls, video: HTMLVideoElement, saver: boolean) {
  const levels = hls.levels;
  if (!levels.length) return -1;
  const ratio = saver ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const width = video.clientWidth * ratio;
  const height = video.clientHeight * ratio;
  let cap = levels.length - 1;
  if (width > 0 && levels.some(level => level.width > 0)) {
    const fit = levels.findIndex(level => level.width >= width || level.height >= height);
    if (fit >= 0) cap = fit;
  }
  if (saver) {
    let limit = 0;
    levels.forEach((level, index) => { if (level.height > 0 && level.height <= 480) limit = index; });
    cap = Math.min(cap, limit);
  }
  return cap;
}

/**
 * Set the ceiling. hls.js remembers its last pick until a segment at that level finishes loading, so a lowered
 * ceiling would otherwise be ignored for a long time. Setting nextAutoLevel pulls that pick down right away,
 * and unlike hls.nextLevel it stays in automatic mode, so the player can still climb back up later.
 */
function setCap(hls: Hls, cap: number) {
  hls.autoLevelCapping = cap;
  if (cap >= 0 && hls.nextAutoLevel > cap) hls.nextAutoLevel = cap;
}

/** Apply the quality choice to a running HLS player without reloading the video. */
function applyQuality(hls: Hls, video: HTMLVideoElement, quality: Quality) {
  const fixed = fixedHeight(quality);
  const saver = quality === "saver" || (fixed !== undefined && fixed <= 480);
  hls.config.maxBufferLength = saver ? 15 : 30;
  hls.config.maxMaxBufferLength = saver ? 30 : 60;
  hls.config.maxBufferSize = saver ? 20e6 : 60e6;
  hls.config.backBufferLength = saver ? 5 : 30;
  if (fixed !== undefined) {
    // The person chose a specific rung: the highest one that does not exceed it. Only this explicit choice
    // switches hls.js to manual mode; every other mode below returns it to automatic.
    if (!hls.levels.length) return;
    let pick = 0;
    hls.levels.forEach((level, index) => { if (level.height <= fixed) pick = index; });
    hls.autoLevelCapping = -1;
    if (hls.currentLevel !== pick) hls.currentLevel = pick;
    return;
  }
  if (!hls.autoLevelEnabled) hls.currentLevel = -1;
  // Saver starts on the smallest rung so playback begins fast on a slow connection.
  hls.config.startLevel = saver ? 0 : undefined;
  setCap(hls, levelCap(hls, video, saver));
}

/** Turn the screen sideways for a wide video on a touch device. Quietly does nothing where the browser refuses. */
async function lockLandscape(video: HTMLVideoElement) {
  if (!matchMedia("(pointer: coarse)").matches) return;
  if (video.videoHeight > video.videoWidth) return; // A portrait video stays upright.
  try {
    await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.("landscape");
  } catch { /* Not allowed here (desktop, iPhone, or a browser without orientation lock). */ }
}

function unlockOrientation() {
  try { screen.orientation.unlock(); } catch { /* Nothing was locked. */ }
}

// The settings and subtitles panels are only needed once someone opens them, so they are loaded then, not with the page.
const PlayerSettings = dynamic(() => import("./player-settings").then(module => module.PlayerSettings));
const SubtitlesPanel = dynamic(() => import("./subtitles-panel").then(module => module.SubtitlesPanel));

function VideoPlayerView({ title, source, kind, poster, captions, room, media, lite, quality, onQuality, overlay }: VideoPlayerProps) {
  countRender("player");
  const i18n = useI18n();
  const { t, tn, locale } = i18n;
  // Effects that start once per video read the language through this ref, so switching language does not restart playback.
  const i18nRef = useRef(i18n);
  useEffect(() => { i18nRef.current = i18n; });
  const playerRef = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const subsButton = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<FullscreenVideo>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string>();
  const [fullscreenError, setFullscreenError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  // One panel at a time under the buttons: the settings drawer, or the subtitles panel.
  const [panel, setPanel] = useState<"settings" | "subtitles" | null>(null);
  const settingsOpen = panel === "settings";
  const subsOpen = panel === "subtitles";
  // The full-width volume row under the buttons.
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("quality");
  const [levels, setLevels] = useState<Level[]>([]);
  const [activeLevel, setActiveLevel] = useState(-1);
  const sound = useSound(videoRef);
  const [scrubbing, setScrubbing] = useState(false);
  // The timeline, and in full screen the button row too, fade out after 5 seconds without a touch, move or key press.
  // They stay while the timeline is being dragged or the settings are open. The whole player is watched, so touching a
  // button counts as being active.
  const { active: controlsOn, wake } = useIdle(playerRef, 5000, scrubbing || panel !== null);

  // The button that opened a panel is also how it is closed. Opening a panel can narrow the player (a phone held sideways
  // puts it beside the picture), which would leave that button scrolled out of sight in the row, so bring it back into view.
  // Escape closes the panel too.
  useEffect(() => {
    if (!panel) return;
    wake();
    (panel === "settings" ? settingsButton : subsButton).current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPanel(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, wake]);
  const subs = useSubtitleTrack(videoRef, captions, nativeFullscreen);
  const [duration, setDuration] = useState(0);
  const [roomError, setRoomError] = useState("");
  const [commandPending, setCommandPending] = useState(false);
  const seekTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const { needsTap, soundBlocked, held, catchUp, holdLocal, rejoin, enableSound } = useRoomPlayback(videoRef, room);
  const roomRef = useRef(room);
  roomRef.current = room;
  const hlsRef = useRef<Hls>(undefined);
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [autoSaver, setAutoSaver] = useState(false);
  // The connection to the video dropped and is being retried (as opposed to the video simply running out of data).
  const [recovering, setRecovering] = useState(false);
  const online = useOnline();
  const { stalled, long: stalledLong } = useBuffering(videoRef);

  // Tell the room when this device has been waiting for data for a while, and when it is back, so the others (and the host)
  // can see why someone is behind instead of wondering.
  const sendRef = useRef(room?.send);
  useEffect(() => { sendRef.current = room?.send; });
  const reported = useRef(false);
  useEffect(() => {
    if (!sendRef.current || stalledLong === reported.current) return;
    reported.current = stalledLong;
    void sendRef.current({ type: "buffering", on: stalledLong }).catch(() => {});
  }, [stalledLong]);
  useEffect(() => () => {
    if (reported.current) void sendRef.current?.({ type: "buffering", on: false }).catch(() => {});
  }, []);
  const health = useVideoHealth(videoRef, media, room ? level => { void room.send({ type: "health", level }).catch(() => {}); } : undefined);

  // A device that cannot keep up (frames being dropped, as opposed to a slow connection) moves to Data saver by itself,
  // once, instead of only being offered it. Stalls are not counted: those usually mean the network, not the phone.
  const autoSwitched = useRef(false);
  useEffect(() => {
    if (autoSwitched.current || kind !== "hls" || quality !== "auto" || health.reason !== "health.dropping") return;
    autoSwitched.current = true;
    setAutoSaver(true);
    onQuality("saver");
  }, [health.reason, kind, quality, onQuality]);

  useEffect(() => { if (hlsRef.current && videoRef.current) applyQuality(hlsRef.current, videoRef.current, quality); }, [quality]);
  // A new warning (a different reason) is shown even if an earlier one was dismissed.
  useEffect(() => { setDismissedWarning(false); }, [health.reason]);
  const roomRunning = !!room && room.playback.playing && playbackPosition(room.playback, performance.now() + room.clockOffset, room.duration) < room.duration;

  useEffect(() => () => {
    if (seekTimer.current) clearTimeout(seekTimer.current);
  }, [room?.id]);

  // A new request to play buzzes the host's phone, so it is noticed even when the screen is not being watched.
  const askPing = room?.isHost ? room.wantPlay?.ping : undefined;
  useEffect(() => {
    if (askPing === undefined) return;
    try { navigator.vibrate?.([60, 40, 60]); } catch { /* Not every browser can vibrate. */ }
    wake();
  }, [askPing, wake]);

  // Play, pause or a jump in the video brings the timeline back, so you can see where things are.
  useEffect(() => { wake(); }, [playing, roomRunning, wake]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hls: Hls | undefined;
    let resize: ResizeObserver | undefined;

    function reportError() {
      if (!cancelled) setError(i18nRef.current.t("player.err.load"));
    }

    // A dropped connection or a hiccup in decoding is retried, with growing pauses, before it is called an error. A phone
    // walking between Wi-Fi and mobile data should see a spinner for a moment, not a failure screen.
    let networkRetries = 0;
    let mediaRecoveries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const recovered = () => { networkRetries = 0; mediaRecoveries = 0; setRecovering(false); };
    const backoff = (attempt: number) => Math.min(8000, 800 * 2 ** (attempt - 1));

    function onVideoError() {
      if (cancelled) return;
      // hls.js handles its own errors (see below). Only a plain file, or the browser's own HLS, is dealt with here.
      if (hls) return;
      const code = video!.error?.code;
      if (code === MediaError.MEDIA_ERR_NETWORK && networkRetries < 5) {
        networkRetries++;
        setRecovering(true);
        const resumeAt = video!.currentTime;
        retryTimer = setTimeout(() => {
          if (cancelled) return;
          video!.src = source;
          video!.load();
          try { video!.currentTime = resumeAt; } catch { /* The sync loop will seek. */ }
        }, backoff(networkRetries));
        return;
      }
      reportError();
    }

    async function load(player: HTMLVideoElement) {
      // Open at the spot the room is at, so a restarted page does not load 0:00 and then jump. While the room is
      // playing, aim a little ahead for the time the first data takes to arrive.
      const live = roomRef.current;
      const startAt = live ? roomTarget(live) + (live.playback.playing ? readLead() : 0) : 0;
      if (kind === "file") {
        player.src = source;
        if (startAt > 0.5) { try { player.currentTime = startAt; } catch { /* Not allowed yet; the sync loop will seek. */ } }
        return;
      }
      const nativeHls = player.canPlayType("application/vnd.apple.mpegurl");
      if (nativeHls && navigator.vendor === "Apple Computer, Inc.") {
        player.src = source;
        return;
      }

      const { default: HlsPlayer } = await import("hls.js");
      if (cancelled) return;

      if (HlsPlayer.isSupported()) {
        hls = new HlsPlayer({ capLevelToPlayerSize: false, lowLatencyMode: false, startPosition: startAt > 0.5 ? startAt : -1 });
        hlsRef.current = hls;
        // Debugging aid: localStorage.setItem("screening-debug", "1") exposes the player as window.__hls.
        try { if (localStorage.getItem("screening-debug")) (window as unknown as { __hls?: Hls }).__hls = hls; } catch { /* Storage can be blocked. */ }
        applyQuality(hls, player, qualityRef.current);
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          applyQuality(hls!, player, qualityRef.current);
          setLevels(hls!.levels.map(level => ({ height: level.height, bitrate: level.bitrate })));
        });
        hls.on(HlsPlayer.Events.LEVEL_SWITCHED, (_event, data) => setActiveLevel(data.level));
        // Rotating the phone or entering full screen changes how many pixels the player can show.
        resize = new ResizeObserver(() => { if (hls && fixedHeight(qualityRef.current) === undefined) setCap(hls, levelCap(hls, player, qualityRef.current === "saver")); });
        resize.observe(player);
        hls.on(HlsPlayer.Events.FRAG_LOADED, recovered);
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === HlsPlayer.ErrorTypes.NETWORK_ERROR && networkRetries < 5) {
            // Lost the connection: wait, then carry on loading from where playback is.
            networkRetries++;
            setRecovering(true);
            retryTimer = setTimeout(() => hls?.startLoad(), backoff(networkRetries));
            return;
          }
          if (data.type === HlsPlayer.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
            // A glitch decoding the stream: reset the decoder; the second time also try the other audio codec path.
            if (mediaRecoveries++ === 1) hls?.swapAudioCodec();
            hls?.recoverMediaError();
            return;
          }
          reportError();
        });
        hls.loadSource(source);
        hls.attachMedia(player);
      } else if (nativeHls) {
        player.src = source;
      } else {
        setError(i18nRef.current.t("player.err.hls"));
      }
    }

    video.addEventListener("error", onVideoError);
    video.addEventListener("playing", recovered);
    // Back online: do not wait for the next scheduled retry.
    const onOnline = () => { if (hls) hls.startLoad(); };
    window.addEventListener("online", onOnline);
    void load(video).catch(reportError);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      video.removeEventListener("playing", recovered);
      video.removeEventListener("error", onVideoError);
      resize?.disconnect();
      hls?.destroy();
      hlsRef.current = undefined;
      video.removeAttribute("src");
      video.load();
    };
  }, [source, kind, attempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function syncFullscreen() {
      const on = document.fullscreenElement === playerRef.current;
      setFullscreen(on);
      wake(); // Entering or leaving full screen shows the controls briefly.
      // On a phone, full screen means sideways. Android browsers allow locking the screen to landscape while in full
      // screen. iPhones play full screen in their own player, which turns with the phone.
      if (on) void lockLandscape(video!);
      else unlockOrientation();
    }

    // iPhone's own full-screen player cannot show our subtitles, so it uses the browser's native ones.
    function beginNativeFullscreen() {
      if (video) video.controls = true;
      setNativeFullscreen(true);
    }

    function endNativeFullscreen() {
      if (video) video.controls = false;
      setNativeFullscreen(false);
    }

    video.addEventListener("webkitbeginfullscreen", beginNativeFullscreen);
    video.addEventListener("webkitendfullscreen", endNativeFullscreen);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      video.removeEventListener("webkitbeginfullscreen", beginNativeFullscreen);
      video.removeEventListener("webkitendfullscreen", endNativeFullscreen);
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, []);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (!video.paused) {
      video.pause();
      return;
    }

    try {
      await video.play();
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(t("player.err.start"));
    }
  }

  async function sendPlayback(command: RoomCommand) {
    if (!room) return;
    setRoomError("");
    try {
      await room.send(command);
    } catch (reason) {
      setRoomError(reason instanceof Error ? reason.message : t("player.err.command"));
    }
  }

  /**
   * The main button. While the room is playing it is ALWAYS Pause, for everyone, whatever state this device's own
   * video is in (still loading, blocked from autoplaying, catching up). Only the host can press Play.
   */
  async function pressMain() {
    if (!room) return togglePlayback();
    if (commandPending) return;
    setCommandPending(true);
    // A viewer cannot start the video, but can ask the host to. The host sees a "Play now" prompt.
    try { await sendPlayback({ type: roomRunning ? "pause" : room.isHost ? "play" : "nudge" }); }
    finally { setCommandPending(false); }
  }

  /** The big button over the picture: join a running room (autoplay was blocked), or the host starting playback. */
  function pressTap() {
    if (!room) return void togglePlayback();
    if (held) return rejoin();
    if (roomRunning) return void catchUp();
    return void pressMain();
  }

  /** Jump to a position. Resolves when it has happened; a request replaced by a newer one never resolves. */
  function seek(position: number): Promise<void> | void {
    if (room?.isHost) {
      if (seekTimer.current) clearTimeout(seekTimer.current);
      return new Promise<void>(resolve => {
        seekTimer.current = setTimeout(async () => {
          await sendPlayback({ type: "seek", position });
          resolve();
        }, 120);
      });
    }
    const video = videoRef.current;
    if (!room && video) {
      return new Promise<void>(resolve => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = position;
      });
    }
  }

  async function toggleFullscreen() {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video) return;

    setFullscreenError(false);
    try {
      if (document.fullscreenElement === player) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled && player.requestFullscreen) {
        await player.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      } else {
        setFullscreenError(true);
      }
    } catch {
      setFullscreenError(true);
    }
  }

  // "Pause all" and "Pause me" are different things: the first stops the room for everyone, the second only this device.
  const asked = !!room?.wantPlay?.mine;
  const playLabel = !room ? (playing ? t("player.pause") : t("player.play")) : roomRunning ? t("player.pauseAll") : room.isHost ? t("player.playAll") : asked ? t("player.asked") : t("player.waiting");
  const mainIcon = !room ? (playing ? "pause" : "play") : roomRunning ? "pause" : "play";
  // Pausing works as soon as the room is running, even before this device's video has loaded.
  // A viewer can always press the button while paused: it asks the host to play.
  const canPlay = room ? !commandPending && (roomRunning || !room.isHost || !error) : !!duration && !error;
  // Joining a room that is already playing: normal for a second or two after opening or restarting the page.
  const syncing = !!room && roomRunning && !playing && !needsTap && !held && !error;
  // The big button over the picture: only when it is really needed.
  const showTap = !!room && !error && (held || (roomRunning ? needsTap : room.isHost && !!duration));
  const soundLabel = sound.muted ? t("player.unmute") : t("player.mute");
  const fullscreenLabel = fullscreen ? t("player.exitFullscreen") : t("player.fullscreen");
  const others = (count: number) => t("list.others", { count });
  const percent = Math.round((sound.muted ? 0 : sound.volume) * 100);

  return (
    <div className="player" ref={playerRef} data-controls={controlsOn ? "on" : "off"} data-volume={volumeOpen ? "open" : "closed"} aria-label={t("player.group", { title })} role="group">
      <div className="player-picture">
        <video
          ref={videoRef}
          aria-label={title}
          poster={poster}
          preload={room?.playback.playing ? "auto" : "metadata"}
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onDurationChange={({ currentTarget }) => {
            setDuration(Number.isFinite(currentTarget.duration) ? currentTarget.duration : 0);
          }}
          onSeeked={wake}
          onEmptied={() => { setDuration(0); setPlaying(false); }}
        >
          {captions.map((caption, index) => (
            <track key={caption.source} kind="subtitles" label={caption.label} srcLang={caption.language || undefined} src={caption.source} data-track={index} />
          ))}
        </video>
        {overlay}
        <SubtitleLayer videoRef={videoRef} list={subs.list} enabled={subs.index >= 0 && !nativeFullscreen} preview={subsOpen} />
        {showTap && !stalled && (
          <button className="player-tap" type="button" onClick={pressTap} aria-label={held ? t("player.tapRejoinAria") : needsTap && roomRunning ? t("player.tapJoinAria") : t("player.play")}>
            <span><PlayerIcon name="play" /></span>
            {held ? <em>{t("player.pausedForYou")}</em> : needsTap && roomRunning && <em>{t("player.tapToJoin")}</em>}
          </button>
        )}
        {soundBlocked && (
          <button className="player-sound" type="button" onClick={enableSound}>
            <PlayerIcon name="muted" /> {t("player.tapForSound")}
          </button>
        )}
        {room?.isHost && room.wantPlay && !roomRunning && (
          // The key changes with every new request, so the prompt pulses again each time someone asks.
          <button key={room.wantPlay.ping} className="play-demand" type="button" onClick={pressMain} disabled={commandPending}>
            <PlayerIcon name="play" />
            <span>{tn("player.demand", room.wantPlay.names.length, { names: listNames(room.wantPlay.names, locale, others) })}</span>
            <em>{t("player.playNow")}</em>
          </button>
        )}
        {(stalled || recovering) && !error && (
          <div className="player-spinner" role="status" aria-live="polite">
            <i aria-hidden="true" />
            <span>{!online ? t("player.offline") : recovering ? t("player.reconnecting") : stalled === "seeking" ? t("player.seeking") : t("player.buffering")}</span>
            {stalledLong && online && !recovering && <small>{t("player.slowConnection")}</small>}
          </div>
        )}
        {syncing && !stalled && <p className="player-waiting" role="status">{t("player.syncing")}</p>}
        {room?.bufferingNames?.length && roomRunning && !syncing && !stalled && !held ? (
          <p className="player-waiting" role="status">{tn("player.someoneBuffering", room.bufferingNames.length, { names: listNames(room.bufferingNames, locale, others) })}</p>
        ) : null}
        {held && !showTap && <p className="player-waiting" role="status">{t("player.heldNote")}</p>}
        {!!duration && !error && room && !roomRunning && (room.pausedBy || !room.isHost) && (
          <p className="player-waiting" role="status">
            {room.pausedBy
              ? t(room.isHost ? "player.pausedBy" : "player.pausedByViewer", { name: room.pausedBy })
              : room.wantPlay && !room.isHost
                ? tn("player.askedHost", (room.wantPlay.mine ? 1 : 0) + room.wantPlay.names.length, { names: listNames([...(room.wantPlay.mine ? [t("player.you")] : []), ...room.wantPlay.names], locale, others) })
                : t("player.waitHost")}
          </p>
        )}
      <PlayerTimeline videoRef={videoRef} duration={duration} lite={lite} disabled={!duration || !!error || (!!room && !room.isHost)} onSeek={seek} onScrub={setScrubbing} />
      </div>

      <div className="player-deck">
        <div className="player-actions">
          <button className="player-button player-play" type="button" onClick={pressMain} disabled={!canPlay} title={room && !room.isHost && !roomRunning ? t("player.askTitle") : undefined}>
            <PlayerIcon name={mainIcon} />
            <span>{playLabel}</span>
          </button>
          {room && (
            <button
              className="player-button" type="button" onClick={held ? rejoin : holdLocal} disabled={!held && !roomRunning}
              aria-pressed={held} title={held ? t("player.rejoinTitle") : t("player.holdTitle")}
            >
              <PlayerIcon name={held ? "playMe" : "pauseMe"} />
              <span>{held ? t("player.rejoin") : t("player.pauseMe")}</span>
            </button>
          )}
          <button className="player-button" type="button" onClick={() => { sound.prepare(); sound.toggleMute(); }} aria-pressed={sound.muted}>
            <PlayerIcon name={sound.muted ? "muted" : "volume"} />
            <span>{soundLabel}</span>
          </button>
          {sound.volumeWorks && (
            // Opens a row with the volume slider, for this device only: handy when WhatsApp or Discord is open next to the film.
            <button className="player-button" type="button" onClick={() => { sound.prepare(); setVolumeOpen(open => !open); }} aria-expanded={volumeOpen} aria-pressed={volumeOpen} aria-controls="volume-row" title={t("player.volumeSlider")}>
              <PlayerIcon name="levels" />
              <span>{t("player.volume")}</span>
            </button>
          )}
          <button
            ref={subsButton} className="player-button" type="button" onClick={() => setPanel(current => current === "subtitles" ? null : "subtitles")}
            aria-expanded={subsOpen} aria-pressed={subsOpen} data-on={subs.index >= 0} disabled={!captions.length}
            title={subs.index >= 0 ? subs.label : t("player.subtitlesOff")}
          >
            <PlayerIcon name="captions" />
            <span>{subs.index >= 0 && captions.length > 1 ? subs.label : t("player.subtitles")}</span>
          </button>
          <button className="player-button" type="button" onClick={toggleFullscreen} aria-label={fullscreenLabel} disabled={!duration || !!error}>
            <PlayerIcon name={fullscreen ? "shrink" : "expand"} />
            <span>{fullscreen ? t("player.exit") : t("player.fullscreen")}</span>
          </button>
          <button ref={settingsButton} className="player-button" type="button" onClick={() => setPanel(current => current === "settings" ? null : "settings")} aria-expanded={settingsOpen} aria-pressed={settingsOpen} aria-label={t("player.settingsAria")} title={settingsOpen ? t("player.closeSettings") : t("player.settings")}>
            <PlayerIcon name="settings" />
            <span>{t("player.settings")}</span>
          </button>
        </div>

        {volumeOpen && sound.volumeWorks && (
          <div className="volume-row" id="volume-row">
            <button className="volume-mute" type="button" onClick={() => { sound.prepare(); sound.toggleMute(); }} aria-label={soundLabel} aria-pressed={sound.muted}>
              <PlayerIcon name={sound.muted ? "muted" : "volume"} />
            </button>
            <input
              className="volume-range" type="range" min={0} max={1} step={0.01} aria-label={t("player.volume")}
              value={sound.muted ? 0 : sound.volume}
              style={{ "--fill": `${percent}%` } as React.CSSProperties}
              aria-valuetext={t("player.percent", { n: percent })}
              onPointerDown={sound.prepare} onPointerUp={sound.prepare}
              onChange={event => sound.setVolume(Number(event.target.value))}
            />
            <output htmlFor="volume-row" className="volume-percent">{percent}%</output>
          </div>
        )}

        {error && (
          <div className="player-error">
            <p role="alert">{error}</p>
            <button className="player-button" type="button" onClick={() => { setError(undefined); setAttempt(value => value + 1); }}>
              {t("player.tryAgain")}
            </button>
          </div>
        )}
        {health.struggling && !dismissedWarning && (
          <div className="player-notice player-struggle" role="status">
            <p>{health.reason && t(health.reason)}</p>
            {autoSaver && <p>{t("player.autoSaver")}</p>}
            {kind === "hls" && quality !== "saver" && (
              <button className="player-button" type="button" onClick={() => onQuality("saver")}>{t("player.switchSaver")}</button>
            )}
            {kind === "hls" && quality === "saver" && !autoSaver && <p>{t("player.saverAlready")}</p>}
            {kind === "file" && <p>{t("player.singleQuality")}</p>}
            <button className="player-dismiss" type="button" onClick={() => setDismissedWarning(true)}>{t("player.dismiss")}</button>
          </div>
        )}
        {fullscreenError && <p className="player-notice" role="status">{t("player.fullscreenUnavailable")}</p>}
        {roomError && <p className="player-notice" role="alert">{roomError}</p>}
      </div>

      {subsOpen && <SubtitlesPanel captions={captions} trackIndex={subs.index} onSelectTrack={subs.select} />}
      {settingsOpen && (
        <PlayerSettings
          tab={settingsTab} onTab={setSettingsTab}
          media={media} levels={levels} activeLevel={activeLevel} quality={quality} onQuality={onQuality}
          muted={sound.muted} volume={sound.volume} volumeWorks={sound.volumeWorks} soft={sound.soft} onMute={sound.setMuted} onVolume={sound.setVolume}
        />
      )}
    </div>
  );
}

/** Memoized: chat and presence changes in the room do not re-render the player. */
export const VideoPlayer = memo(VideoPlayerView);
