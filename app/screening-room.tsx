"use client";

import { countRender } from "./debug-renders";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FloatLayer, type FloatHandle } from "./float-layer";
import { BubbleLayer, type BubbleHandle } from "./chat-bubbles";
import { mentionsName } from "./chat-text";
import { isRotatedView, landscapePhoneQuery } from "./screen-layout";
import dynamic from "next/dynamic";
import { RoomPanel } from "./room-panel";
import { TopbarTitle } from "./topbar-title";
import { usePlaybackQuality } from "./use-playback-quality";
import { VideoPlayer } from "./video-player";
import { LanguageSwitch, useI18n } from "./i18n";
import { captionLabel } from "./i18n/caption-label";
import type { ApiError } from "./i18n/core";
import { openRoomStream } from "./room-stream";
import { useKeyboardLayout } from "./use-keyboard-layout";
import { applyPatch, cleanCodeInput, isCustomCode, isRoomId, mediaUrl, normalizeRoomId, type Reaction, type RoomCommand, type RoomMember, type RoomMessage, type RoomSnapshot, type RoomState, type StatePatch } from "./room-shared";

// Opened only on demand, so they are not part of what a phone has to download and parse to show the room.
const VideoDetails = dynamic(() => import("./video-details").then(module => module.VideoDetails));
const QuickReply = dynamic(() => import("./quick-reply").then(module => module.QuickReply));

type Connection = "checking" | "join" | "connecting" | "connected" | "reconnecting" | "unavailable";

/** POST some JSON. A refusal becomes an Error whose message is already in the viewer's language (`describe` does that). */
async function post(path: string, body: object, describe: (payload: ApiError | null) => string) {
  const result = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(describe(await result.json().catch(() => null)));
  return result;
}

const sameMembers = (a: RoomMember[], b: RoomMember[]) =>
  a.length === b.length && a.every((member, index) => member.id === b[index].id && member.name === b[index].name && member.health === b[index].health);

/** Add messages we have not seen yet, keeping the newest 100. Returns the same array when nothing is new. */
function mergeMessages(current: RoomMessage[], incoming?: RoomMessage[]) {
  if (!incoming?.length) return current;
  const known = new Set(current.map(message => message.id));
  const fresh = incoming.filter(message => !known.has(message.id));
  return fresh.length ? [...current, ...fresh].sort((a, b) => a.id - b.id).slice(-100) : current;
}

export function ScreeningRoom({ initialRoom }: { initialRoom?: string }) {
  countRender("room");
  const i18n = useI18n();
  const { t, fail, locale } = i18n;
  // The live connection is set up once per room. It reads the language through this ref so that switching language
  // does not tear the connection down.
  const i18nRef = useRef(i18n);
  useEffect(() => { i18nRef.current = i18n; });
  const describe = useCallback((payload: ApiError | null) => fail(payload, "err.request.failed"), [fail]);
  const [roomId, setRoomId] = useState(initialRoom);
  const [room, setRoom] = useState<RoomSnapshot>();
  const [connection, setConnection] = useState<Connection>(initialRoom ? "checking" : "join");
  const [clockOffset, setClockOffset] = useState<number>();
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [mode, setMode] = useState<"start" | "join">("start");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  // Why this browser is back at the join form: the admin removed it, or closed the room.
  const [notice, setNotice] = useState("");
  const floatLayer = useRef<FloatHandle>(null);
  const bubbleLayer = useRef<BubbleHandle>(null);
  // A hidden input that is focused inside the tap on a chat bubble. Phones only raise the keyboard from within a tap,
  // and the real message box is not on screen yet (full screen is still closing), so this one holds the keyboard open.
  const focusProxy = useRef<HTMLInputElement>(null);
  const [quickReply, setQuickReply] = useState<string>();
  const [replyRequest, setReplyRequest] = useState<{ name: string; n: number }>();
  useKeyboardLayout();
  const { quality, setQuality, profile } = usePlaybackQuality();
  const latestRoom = useRef<RoomSnapshot>(undefined);
  useEffect(() => { latestRoom.current = room; });

  // A reaction arrives as its own tiny event and goes straight to the screen. It never touches room
  // state, so a burst of emoji does not re-render the chat or the player.
  // While the chat panel is out of sight (full screen, or a phone held sideways), other people's messages appear as bubbles.
  const addBubble = useCallback((message: RoomMessage) => {
    const current = latestRoom.current;
    if (!current || message.authorId === current.youId || !isRotatedView()) return;
    const me = current.members.find(member => member.id === current.youId)?.name ?? "";
    bubbleLayer.current?.add({
      id: message.id, text: message.text, mention: !!me && mentionsName(message.text, me),
      author: current.members.find(member => member.id === message.authorId)?.name ?? i18nRef.current.t("chat.someone"),
    });
  }, []);

  /** Tapping a bubble: leave full screen, then open the message box with "@name " typed and the keyboard up. */
  const startReply = useCallback((name: string) => {
    focusProxy.current?.focus({ preventScroll: true }); // Inside the tap, so the keyboard comes up.
    void (async () => {
      const wasFullscreen = !!document.fullscreenElement;
      if (wasFullscreen) { try { await document.exitFullscreen(); } catch { /* Already out. */ } }
      // Leaving full screen also releases the orientation lock. Give a phone held upright a moment to turn back.
      for (let waited = 0; waited < 1000 && (wasFullscreen || waited === 0) && matchMedia(landscapePhoneQuery).matches; waited += 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Still sideways: the chat panel is not on screen, so reply from a bar over the picture. Otherwise use the real chat box.
      if (matchMedia(landscapePhoneQuery).matches) setQuickReply(name);
      else setReplyRequest({ name, n: Date.now() });
    })();
  }, []);

  const addFloater = useCallback((reaction: Reaction) => {
    const current = latestRoom.current;
    floatLayer.current?.add(reaction, current?.members.find(member => member.id === reaction.authorId)?.name ?? "", reaction.authorId === current?.youId);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    if (!isRoomId(roomId)) {
      setConnection("unavailable");
      setError(i18nRef.current.t("room.err.linkUnavailable"));
      return;
    }
    const endpoint = `/api/rooms/${roomId}`;
    const abort = new AbortController();
    let stream: { close: () => void } | undefined;
    let clockPending = false;

    async function sampleClock(samples = 3) {
      if (clockPending) return;
      clockPending = true;
      try {
        let best = { latency: Infinity, offset: 0 };
        for (let index = 0; index < samples; index++) {
          const sent = performance.now();
          const response = await fetch(`${endpoint}?clock=1`, { cache: "no-store", signal: abort.signal });
          if (!response.ok) return;
          const { serverTime } = await response.json() as { serverTime: number };
          const received = performance.now();
          const latency = received - sent;
          if (latency < best.latency) best = { latency, offset: serverTime - (sent + received) / 2 };
        }
        if (!abort.signal.aborted) setClockOffset(best.offset);
      } catch { /* Keep the last estimate during a dropped connection. */ }
      finally { clockPending = false; }
    }

    // Merge a full snapshot or a small state update into what we have, keeping object identity for
    // anything unchanged so React can skip re-rendering parts that did not change.
    function receive(incoming: RoomState & { messages?: RoomMessage[] }) {
      if (!performance.getEntriesByName("room:state").length) performance.mark("room:state");
      setRoom(previous => {
        if (!previous || previous.id !== incoming.id) return { ...incoming, messages: incoming.messages ?? [] };
        const messages = mergeMessages(previous.messages, incoming.messages);
        if (previous.serverTime > incoming.serverTime) return messages === previous.messages ? previous : { ...previous, messages };
        return {
          ...incoming, messages,
          members: sameMembers(previous.members, incoming.members) ? previous.members : incoming.members,
          media: previous.media?.id === incoming.media?.id && previous.media?.version === incoming.media?.version && previous.media?.captionsVersion === incoming.media?.captionsVersion && previous.media?.metaVersion === incoming.media?.metaVersion ? previous.media : incoming.media,
          playback: previous.playback.revision === incoming.playback.revision ? previous.playback : incoming.playback,
        };
      });
    }

    // A state event is only what changed, so it is applied over what we already hold.
    function patch(change: StatePatch) {
      if (!performance.getEntriesByName("room:state").length) performance.mark("room:state");
      setRoom(previous => {
        if (!previous || previous.serverTime > change.serverTime) return previous;
        const merged = applyPatch(previous, change);
        return {
          ...merged, messages: previous.messages,
          members: change.members ? (sameMembers(previous.members, merged.members) ? previous.members : merged.members) : previous.members,
          media: change.media === undefined ? previous.media : merged.media,
          playback: !change.playback || (previous.playback.revision === merged.playback.revision && previous.playback.anchorAt === merged.playback.anchorAt && previous.playback.playing === merged.playback.playing && previous.playback.position === merged.playback.position) ? previous.playback : merged.playback,
        };
      });
    }

    // One streaming request does what used to take two: it says whether this browser is in the room, delivers the
    // whole room, then keeps delivering changes.
    let lastMessageId = 0;
    const noteMessages = (messages?: RoomMessage[]) => { for (const message of messages ?? []) lastMessageId = Math.max(lastMessageId, message.id); };
    setConnection("connecting");
    stream = openRoomStream({
      url: () => `${endpoint}/events?since=${lastMessageId}`,
      onOpen: () => {},
      onDrop: () => { if (!abort.signal.aborted) setConnection("reconnecting"); },
      onRefused: (status, payload) => {
        if (abort.signal.aborted) return;
        if (status === 401) { setConnection("join"); return; }
        setError(i18nRef.current.fail(payload, "err.connect.failed"));
        setConnection("unavailable");
      },
      onEvent: (name, data, timing) => {
        if (abort.signal.aborted) return;
        try {
          if (name === "snapshot") {
            const snapshot = JSON.parse(data) as RoomSnapshot;
            noteMessages(snapshot.messages);
            // A first estimate of the clock on the server, from the request that carried the snapshot. sampleClock refines it.
            if (timing.first) setClockOffset(snapshot.serverTime - (timing.sentAt + timing.receivedAt) / 2);
            receive(snapshot);
            setConnection("connected");
            void sampleClock();
          } else if (name === "state") {
            patch(JSON.parse(data) as StatePatch);
          } else if (name === "chat") {
            const message = JSON.parse(data) as RoomMessage;
            noteMessages([message]);
            setRoom(previous => previous && { ...previous, messages: mergeMessages(previous.messages, [message]) });
            addBubble(message);
          } else if (name === "reaction") {
            addFloater(JSON.parse(data) as Reaction);
          } else if (name === "kicked" || name === "closed") {
            // The admin took this browser out of the room. Stop listening and go back to the join form, saying why.
            stream?.close();
            setNotice(i18nRef.current.t(name === "kicked" ? "room.kicked" : "room.closed"));
            setRoom(undefined);
            setRoomId(undefined);
            setConnection("join");
            const url = new URL(window.location.href);
            url.searchParams.delete("room");
            window.history.replaceState(null, "", url);
          }
        } catch { /* A damaged event is skipped; the next state event repairs anything it carried. */ }
      },
    });

    function refreshClock() {
      if (!abort.signal.aborted && !document.hidden) void sampleClock(2);
    }

    const clock = setInterval(refreshClock, 60000);
    document.addEventListener("visibilitychange", refreshClock);
    return () => {
      abort.abort();
      stream?.close();
      clearInterval(clock);
      document.removeEventListener("visibilitychange", refreshClock);
    };
  }, [roomId, attempt, addFloater, addBubble]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining || !name.trim()) return;
    // Joining a link goes to that room. Otherwise: start a room (with a chosen code if one was typed) or join by code.
    const body: Record<string, unknown> = { name };
    if (roomId) {
      body.roomId = roomId;
    } else if (mode === "join") {
      const target = normalizeRoomId(code);
      if (!target) { setError(t("join.err.needCode")); return; }
      body.roomId = target;
    } else if (code.trim()) {
      const chosen = cleanCodeInput(code);
      if (!isCustomCode(chosen)) { setError(t("err.code.invalid")); return; }
      body.code = chosen;
    }
    setJoining(true);
    setError("");
    setNotice("");
    try {
      const response = await post("/api/rooms", body, describe);
      const result = await response.json() as { roomId: string };
      const url = new URL(window.location.href);
      url.searchParams.set("room", result.roomId);
      window.history.replaceState(null, "", url);
      setConnection("checking");
      if (roomId === result.roomId) setAttempt(value => value + 1);
      else setRoomId(result.roomId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("join.err.generic"));
    } finally {
      setJoining(false);
    }
  }

  const identity = room?.members.find(member => member.id === room.youId);
  const isHost = !!room && room.hostId === room.youId;
  const media = room?.media;
  const currentRoomId = room?.id;
  const send = useCallback(async (command: RoomCommand) => { await post(`/api/rooms/${currentRoomId}`, command, describe); }, [currentRoomId, describe]);
  const playback = room?.playback;
  const pausedBy = room?.pausedBy;
  const wantPlay = room?.wantPlay;
  const buffering = room?.buffering;
  // Names of the other people who are waiting for video data, for the notice over the picture.
  const bufferingNames = useMemo(
    () => buffering && room ? buffering.filter(id => id !== room.youId).map(id => room.members.find(member => member.id === id)?.name).filter((name): name is string => !!name) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buffering, room?.members, room?.youId],
  );
  const playerRoom = useMemo(
    () => currentRoomId && playback && media && clockOffset !== undefined
      ? { id: currentRoomId, playback, clockOffset, duration: media.duration, isHost, pausedBy, wantPlay, bufferingNames, send } : undefined,
    [currentRoomId, playback, media, clockOffset, isHost, pausedBy, wantPlay, bufferingNames, send],
  );
  const captions = useMemo(
    () => media && currentRoomId ? media.captions.map((caption, index) => ({
      source: mediaUrl(currentRoomId, media, `captions/${index}?v=${media.captionsVersion}`), language: caption.lang, label: captionLabel(caption.lang, caption.label, locale, t),
    })) : [],
    [media, currentRoomId, locale, t],
  );
  const reactionLayer = useMemo(() => (
    <>
      <FloatLayer handle={floatLayer} max={profile.lowEnd ? 10 : 40} />
      <BubbleLayer handle={bubbleLayer} onReply={startReply} max={profile.lowEnd ? 2 : 3} />
    </>
  ), [profile.lowEnd, startReply]);
  const live = connection === "connected";

  return (
    <main className="app" data-in-room={!!room}>
      <header className="topbar">
        <span className="room-mark" aria-hidden="true" />
        <TopbarTitle
          title={media?.title ?? t("room.title.default")}
          detail={room ? `${isHost ? t("room.detail.hosting") : t("room.detail.shared")}${isCustomCode(room.id) ? ` · ${t("room.detail.code", { code: room.id })}` : ""}` : t("room.tagline")}
          onOpen={room && media ? () => setDetailsOpen(true) : undefined}
        />
        {room && (
          <span className="status-pill" data-state={connection} role="status">
            <i aria-hidden="true" />
            {live ? t("status.live") : connection === "reconnecting" ? t("status.reconnecting") : t("status.connecting")}
          </span>
        )}
      </header>

      {detailsOpen && room && media && (
        <VideoDetails
          media={media} roomId={room.id} onClose={() => setDetailsOpen(false)}
          posterUrl={media.hasPoster ? mediaUrl(room.id, media, `poster?v=${media.version}`) : undefined}
          room={{ code: isCustomCode(room.id) ? room.id : undefined, hostName: room.members.find(member => member.id === room.hostId)?.name ?? t("common.unknown"), people: room.members.length }}
        />
      )}

      <section className="stage" aria-label={t("stage.label")}>
        {room && media ? (
          <VideoPlayer
            key={`${media.id}-${media.version}`}
            title={media.title} kind={media.kind} media={media} quality={quality} onQuality={setQuality}
            source={mediaUrl(room.id, media, media.kind === "file" ? `file?v=${media.version}` : media.entry)}
            poster={media.hasPoster ? mediaUrl(room.id, media, `poster?v=${media.version}`) : undefined}
            captions={captions} lite={profile.lowEnd}
            room={playerRoom}
            overlay={reactionLayer}
          />
        ) : (
          <div className="stage-empty">
            <span className="room-mark" aria-hidden="true" />
            <p>
              {!room ? t("stage.joinToWatch")
                : isHost ? t("stage.noVideoHost")
                : t("stage.waitingHost")}
            </p>
          </div>
        )}
      </section>

      {room ? (
        <RoomPanel room={room} identityName={identity?.name} isHost={isHost} send={send} quality={quality} onQuality={setQuality} profile={profile} replyRequest={replyRequest} />
      ) : (
        <aside className="sheet" aria-labelledby="join-title">
          <h2 id="join-title">{roomId ? t("join.title.link") : t("join.title.new")}</h2>
          <p className="sheet-lede">{roomId ? t("join.lede.link") : t("join.lede.new")}</p>
          {notice && connection === "join" && <p className="room-error" role="alert">{notice}</p>}
          {connection === "checking" ? <p role="status" className="sheet-note">{t("join.checking")}</p> : null}
          {connection === "unavailable" ? (
            <>
              <p className="room-error" role="alert">{error}</p>
              <button className="btn" type="button" onClick={() => { setConnection("checking"); setAttempt(value => value + 1); }}>{t("join.retry")}</button>
            </>
          ) : null}
          {connection === "join" ? (
            <form className="join-form" onSubmit={join}>
              {!roomId && (
                <div className="segmented mode-tabs" role="radiogroup" aria-label={t("join.modeLabel")}>
                  <button type="button" role="radio" aria-checked={mode === "start"} onClick={() => { setMode("start"); setError(""); }}>{t("join.tab.start")}</button>
                  <button type="button" role="radio" aria-checked={mode === "join"} onClick={() => { setMode("join"); setError(""); }}>{t("join.tab.join")}</button>
                </div>
              )}
              <label htmlFor="room-name">{t("join.name")}</label>
              <input id="room-name" maxLength={32} required autoComplete="nickname" enterKeyHint={roomId ? "go" : "next"} value={name} onChange={event => setName(event.target.value)} />
              {!roomId && (
                <>
                  <label htmlFor="room-code">{mode === "start" ? t("join.code.optional") : t("join.code")}</label>
                  <input
                    id="room-code" maxLength={mode === "join" ? 200 : 40} enterKeyHint="go" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    autoComplete="off" required={mode === "join"} value={code}
                    placeholder={mode === "start" ? t("join.code.placeholderStart") : t("join.code.placeholderJoin")}
                    onChange={event => { setCode(event.target.value); setError(""); }}
                    aria-describedby="room-code-hint"
                  />
                  <p id="room-code-hint" className="code-hint">
                    {mode === "join"
                      ? t("join.hint.join")
                      : code.trim()
                        ? (isCustomCode(cleanCodeInput(code)) ? <>{t("join.hint.customBefore")}<strong>{cleanCodeInput(code)}</strong>{t("join.hint.customAfter")}</> : t("join.hint.rules"))
                        : t("join.hint.blank")}
                  </p>
                </>
              )}
              <button className="btn btn-primary" type="submit" disabled={joining || !name.trim() || (mode === "join" && !roomId && !code.trim())}>
                {joining ? t("join.busy") : roomId || mode === "join" ? t("join.submit.join") : t("join.submit.start")}
              </button>
              {error && <p className="room-error" role="alert">{error}</p>}
            </form>
          ) : null}
          <LanguageSwitch />
          <p className="sheet-note"><a className="admin-link" href="/admin">{t("admin.manage")}</a></p>
        </aside>
      )}
      <input ref={focusProxy} className="focus-proxy" aria-hidden="true" tabIndex={-1} readOnly inputMode="text" />
      {quickReply && room && <QuickReply name={quickReply} send={send} onClose={() => setQuickReply(undefined)} />}
    </main>
  );
}
