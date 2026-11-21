"use client";

import { countRender } from "./debug-renders";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FloatLayer, type FloatHandle } from "./float-layer";
import { BubbleLayer, type BubbleHandle } from "./chat-bubbles";
import { mentionsName } from "./chat-text";
import { rovingRef } from "./roving";
import { isRotatedView, landscapePhoneQuery } from "./screen-layout";
import dynamic from "next/dynamic";
import { RoomPanel } from "./room-panel";
import { LeaveRoomButton, OwnedRooms } from "./room-exit";
import { TopbarTitle } from "./topbar-title";
import { usePlaybackQuality } from "./use-playback-quality";
import { VideoPlayer } from "./video-player";
import { DefaultPasswordNotice, ManageAccessLink, useDefaultPasswordNotice } from "./admin-ui";
import { Failure, LanguageSwitch, problemOf, useI18n, type MessageKey, type Problem } from "./i18n";
import { captionLabel } from "./i18n/caption-label";
import { openRoomStream } from "./room-stream";
import { checkRoomEntry, watchSiteAccess } from "./site-access-client";
import { useKeyboardLayout } from "./use-keyboard-layout";
import { applyPatch, cleanCodeInput, isCustomCode, isRoomId, mediaUrl, normalizeRoomId, type Reaction, type RoomCommand, type RoomMember, type RoomMessage, type RoomSnapshot, type RoomState, type StatePatch } from "./room-shared";

// Opened only on demand, so they are not part of what a phone has to download and parse to show the room.
const VideoDetails = dynamic(() => import("./video-details").then(module => module.VideoDetails));
const QuickReply = dynamic(() => import("./quick-reply").then(module => module.QuickReply));

// "gone": the link points at a room that is not open (closed, or never was). The person is offered a way forward instead of a name form.
type Connection = "checking" | "join" | "connecting" | "connected" | "reconnecting" | "unavailable" | "gone";

/** POST some JSON. A refusal becomes a Failure that keeps the server's error code, so whoever shows it can say it in the viewer's language. */
async function post(path: string, body: object) {
  const result = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!result.ok) throw new Failure(await result.json().catch(() => null));
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

export function ScreeningRoom({ initialRoom, roomGone, initialSiteOpen, lockEnabled }: {
  initialRoom?: string; roomGone?: boolean; initialSiteOpen: boolean; lockEnabled: boolean;
}) {
  countRender("room");
  const i18n = useI18n();
  const { t, say, locale } = i18n;
  // The live connection is set up once per room. It reads the language through this ref so that switching language
  // does not tear the connection down.
  const i18nRef = useRef(i18n);
  useEffect(() => { i18nRef.current = i18n; });
  const [roomId, setRoomId] = useState(initialRoom);
  const [room, setRoom] = useState<RoomSnapshot>();
  const [siteOpen, setSiteOpen] = useState(initialSiteOpen);
  // A link whose room is already known to be closed (or that is not shaped like a room at all) goes straight to the "not open" screen.
  const [goneRoom, setGoneRoom] = useState(roomGone || (initialRoom && !isRoomId(initialRoom)) ? initialRoom : undefined);
  const [connection, setConnection] = useState<Connection>(goneRoom ? "gone" : initialRoom ? "checking" : "join");
  const [clockOffset, setClockOffset] = useState<number>();
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [mode, setMode] = useState<"start" | "join">("start");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [code, setCode] = useState("");
  // Errors are kept as data (not as finished sentences), so switching language rewrites them.
  const [error, setError] = useState<Problem>();
  // Why this browser is back at the join form: the admin removed it, or closed the room.
  const [notice, setNotice] = useState<{ key: MessageKey; bad: boolean }>();
  const defaultPassword = useDefaultPasswordNotice();
  const [quickReply, setQuickReply] = useState<string>();
  const [replyRequest, setReplyRequest] = useState<{ name: string; n: number }>();
  /** Back to the join form, saying why (or that leaving worked). Used when the admin removes this browser, closes the room, or the person leaves. */
  const backToJoin = useCallback((key: "room.kicked" | "room.closed" | "room.left", closed?: boolean) => {
    const was = latestRoom.current;
    // This can run twice, from the stream and from the Leave button: the second time the room is already gone, so keep what the first set.
    if (key === "room.left" && !was) return;
    latestRoom.current = undefined;
    if (key === "room.left") {
      // Older rooms without an owner can still close automatically. Use the server's result, even when this was the last viewer.
      const gone = closed === true;
      setNotice({ key: gone ? "room.leftLast" : "room.left", bad: false });
      setMode(gone ? "start" : "join");
      if (was && isCustomCode(was.id)) setCode(was.id);
    } else {
      setNotice({ key, bad: true });
    }
    setRoom(undefined);
    setRoomId(undefined);
    setGoneRoom(undefined);
    setConnection("join");
    // Everything that belonged to the room closes with it, so none of it is open when this browser comes back.
    setDetailsOpen(false);
    setQuickReply(undefined);
    setReplyRequest(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  }, []);
  const floatLayer = useRef<FloatHandle>(null);
  const bubbleLayer = useRef<BubbleHandle>(null);
  // A hidden input that is focused inside the tap on a chat bubble. Phones only raise the keyboard from within a tap,
  // and the real message box is not on screen yet (full screen is still closing), so this one holds the keyboard open.
  const focusProxy = useRef<HTMLInputElement>(null);
  useKeyboardLayout();
  const { quality, setQuality, profile } = usePlaybackQuality();
  const latestRoom = useRef<RoomSnapshot>(undefined);
  useEffect(() => { latestRoom.current = room; });

  // A lock affects the join screen, but people in a room can keep watching.
  useEffect(() => {
    if (room || joining || connection === "checking" || connection === "connecting") return;
    const controller = new AbortController();
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const access = await checkRoomEntry(roomId, controller.signal);
        if (controller.signal.aborted || !access) return;
        if (!access.open) window.location.reload();
        else setSiteOpen(access.siteOpen);
      } catch { /* A failed check says nothing about whether the site is locked. */ }
      finally { pending = false; }
    };
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 8000);
    const unwatch = watchSiteAccess(() => void check());
    return () => { controller.abort(); clearInterval(timer); unwatch(); };
  }, [room, roomId, joining, connection]);

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

  /** Tapping a bubble: leave full screen, then open the message box with "@name " typed and the keyboard up. With no name it just opens the message box. */
  const startReply = useCallback((name = "") => {
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

  /** Closing the reply bar (sent, Escape or ✕) puts focus back on the 💬 button that opened it, not on the page body. */
  const closeQuickReply = useCallback(() => {
    setQuickReply(undefined);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".live-chat")?.focus({ preventScroll: true }));
  }, []);

  const addFloater = useCallback((reaction: Reaction) => {
    const current = latestRoom.current;
    floatLayer.current?.add(reaction, current?.members.find(member => member.id === reaction.authorId)?.name ?? "", reaction.authorId === current?.youId);
  }, []);

  useEffect(() => {
    if (!roomId || roomId === goneRoom) return;
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
        setError({ key: "err.connect.failed", payload });
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
          } else if (name === "kicked" || name === "closed" || name === "left") {
            // This browser was taken out of the room (or chose to leave). Stop listening and go back to the join form.
            stream?.close();
            backToJoin(name === "kicked" ? "room.kicked" : name === "closed" ? "room.closed" : "room.left", name === "left" ? !!(JSON.parse(data) as { last?: boolean }).last : undefined);
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
  }, [roomId, goneRoom, attempt, addFloater, addBubble, backToJoin]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (joining || !name.trim()) return;
    // Joining a link goes to that room. Otherwise: start a room (with a chosen code if one was typed) or join by code.
    const body: Record<string, unknown> = { name };
    if (roomId) {
      body.roomId = roomId;
    } else if (mode === "join") {
      const target = normalizeRoomId(code);
      if (!target) { setError({ key: "join.err.needCode" }); return; }
      body.roomId = target;
    } else if (code.trim()) {
      const chosen = cleanCodeInput(code);
      if (!isCustomCode(chosen)) { setError({ key: "err.code.invalid" }); return; }
      body.code = chosen;
    }
    setJoining(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await post("/api/rooms", body);
      const result = await response.json() as { roomId: string };
      const url = new URL(window.location.href);
      url.searchParams.set("room", result.roomId);
      window.history.replaceState(null, "", url);
      setConnection("checking");
      if (roomId === result.roomId) setAttempt(value => value + 1);
      else setRoomId(result.roomId);
    } catch (reason) {
      const problem = problemOf(reason, "join.err.generic");
      if (problem.payload?.code === "err.locked") {
        window.location.reload();
      } else if (roomId && problem.payload?.code === "err.room.notFound") {
        // The room closed since the link was made. Say so and offer a way forward, not a form that can only fail again.
        setGoneRoom(roomId);
        setConnection("gone");
      } else {
        setError(problem);
      }
    } finally {
      setJoining(false);
    }
  }

  /** From the "not open" screen (or a join by code that found nothing): on to the form, to start a room or to type a different code. */
  function leaveDeadLink(next: "start" | "join") {
    const keep = next === "start" && roomId && isCustomCode(roomId) ? roomId : "";
    setMode(next);
    setCode(keep);
    setError(undefined);
    setRoomId(undefined);
    setGoneRoom(undefined);
    setConnection("join");
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
    // The form is not on the page yet: wait for it, then put the cursor where the person has to type.
    setTimeout(() => document.getElementById("room-name")?.focus(), 0);
  }

  const identity = room?.members.find(member => member.id === room.youId);
  const isHost = !!room && room.hostId === room.youId;
  const media = room?.media;
  const currentRoomId = room?.id;
  const send = useCallback(async (command: RoomCommand) => { await post(`/api/rooms/${currentRoomId}`, command); }, [currentRoomId]);
  const leave = useCallback(async () => {
    const response = await post(`/api/rooms/${currentRoomId}`, { type: "leave" } satisfies RoomCommand);
    const { closed } = await response.json() as { closed: boolean };
    backToJoin("room.left", closed);
  }, [currentRoomId, backToJoin]);
  const leaveControl = useMemo(() => room ? (
    <LeaveRoomButton key={room.id} onLeave={leave} transfersHost={isHost && room.members.length > 1} />
  ) : null, [currentRoomId, leave, isHost, room?.members.length]);
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
  const goneCode = connection === "gone" && roomId && isCustomCode(roomId) ? roomId : undefined;
  // After leaving or being removed the join form takes over the screen: put the focus on what it says, not on nothing.
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const goneTitleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (notice && connection === "join") noticeRef.current?.focus({ preventScroll: true }); }, [notice, connection]);
  useEffect(() => { if (connection === "gone") goneTitleRef.current?.focus({ preventScroll: true }); }, [connection]);
  // The tab title follows the room: the video that is playing, then the app's name.
  const tabTitle = room && media ? `${media.title} · ${t("room.title.default")}` : t("room.title.default");
  useEffect(() => { document.title = tabTitle; }, [tabTitle]);

  return (
    <main className="app" data-in-room={!!room}>
      {room && <h1 className="sr-only">{media?.title ?? t("room.title.default")}</h1>}
      <header className="topbar">
        <span className="room-mark" aria-hidden="true" />
        <TopbarTitle
          title={media?.title ?? t("room.title.default")}
          detail={room ? (isCustomCode(room.id) ? t("room.detail.code", { code: room.id }) : isHost ? t("room.detail.hosting") : t("room.detail.shared")) : t("room.tagline")}
          onOpen={room && media ? () => setDetailsOpen(true) : undefined}
        />
        {room && (
          <span className="status-pill" data-state={connection} role="status">
            <i aria-hidden="true" />
            {live ? t("status.live") : connection === "reconnecting" ? t("status.reconnecting") : t("status.connecting")}
          </span>
        )}
        {leaveControl}
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
            overlay={reactionLayer} onChat={startReply} leaveControl={leaveControl}
          />
        ) : (
          <div className="stage-empty" data-join={!room}>
            {leaveControl && <div className="player-leave">{leaveControl}</div>}
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
          <h1 id="join-title" ref={goneTitleRef} tabIndex={-1}>{connection === "gone" ? t("join.gone.title") : roomId ? t("join.title.link") : t("join.title.new")}</h1>
          {connection !== "gone" && <p className="sheet-lede">{roomId ? t("join.lede.link") : t("join.lede.new")}</p>}
          <div className="lobby-access">
            <div className="lobby-access-status" role="status">
              <span>{t("admin.site")}</span>
              <strong className="admin-state" data-open={siteOpen}><i aria-hidden="true" />
                {t(!lockEnabled ? "access.alwaysOpen" : siteOpen ? "access.open" : "access.locked")}
              </strong>
            </div>
            <ManageAccessLink />
          </div>
          {/* A guest arriving by a link is told which room it is for (a private room has no code worth showing). */}
          {roomId && connection !== "gone" && <p className="sheet-lede join-target">{isCustomCode(roomId) ? t("join.linkCode", { code: roomId }) : t("join.linkPrivate")}</p>}
          {defaultPassword.show && <DefaultPasswordNotice onDismiss={defaultPassword.dismiss} />}
          {notice && connection === "join" && <p ref={noticeRef} tabIndex={-1} className={notice.bad ? "room-error sheet-status" : "sheet-status"} role={notice.bad ? "alert" : "status"}>{t(notice.key)}</p>}
          <OwnedRooms />
          {connection === "checking" ? <p role="status" className="sheet-note">{t("join.checking")}</p> : null}
          {connection === "gone" ? (
            <>
              <p className="sheet-lede">{goneCode ? t("join.gone.code", { code: goneCode }) : t("join.gone.link")}</p>
              <div className="gone-actions">
                <button className="btn btn-primary" type="button" onClick={() => leaveDeadLink("start")}>{goneCode ? t("join.gone.startCode") : t("join.tab.start")}</button>
                <button className="btn" type="button" onClick={() => leaveDeadLink("join")}>{goneCode ? t("join.gone.other") : t("join.tab.join")}</button>
              </div>
            </>
          ) : null}
          {connection === "unavailable" ? (
            <>
              <p className="room-error" role="alert">{say(error)}</p>
              <button className="btn" type="button" onClick={() => { setConnection("checking"); setAttempt(value => value + 1); }}>{t("join.retry")}</button>
            </>
          ) : null}
          {connection === "join" ? (
            <form className="join-form" onSubmit={join}>
              {!roomId && (
                <div className="segmented mode-tabs" role="radiogroup" aria-label={t("join.modeLabel")} ref={rovingRef}>
                  <button type="button" role="radio" aria-checked={mode === "start"} onClick={() => { setMode("start"); setError(undefined); }}>{t("join.tab.start")}</button>
                  <button type="button" role="radio" aria-checked={mode === "join"} onClick={() => { setMode("join"); setError(undefined); }}>{t("join.tab.join")}</button>
                </div>
              )}
              {/* The counter sits on the label's line, so it appears (and its words change) without moving anything below. */}
              <div className="field-head">
                <label htmlFor="room-name">{t("join.name")}</label>
                {name.length >= 24 && (
                  <small id="room-name-count" className="field-count" data-full={name.length >= 32} role={name.length >= 32 ? "status" : undefined}>
                    {name.length >= 32 ? t("join.nameFull") : t("join.nameCount", { count: name.length })}
                  </small>
                )}
              </div>
              <input
                id="room-name" maxLength={32} required autoComplete="nickname" enterKeyHint={roomId ? "go" : "next"} value={name}
                aria-describedby={name.length >= 24 ? "room-name-count" : undefined} onChange={event => setName(event.target.value)}
              />
              {!roomId && (
                <>
                  <label htmlFor="room-code">{mode === "start" ? t("join.code.optional") : t("join.code")}</label>
                  <input
                    id="room-code" maxLength={mode === "join" ? 200 : 24} enterKeyHint="go" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    autoComplete="off" required={mode === "join"} value={code}
                    placeholder={mode === "start" ? t("join.code.placeholderStart") : t("join.code.placeholderJoin")}
                    onChange={event => { setCode(event.target.value); setError(undefined); }}
                    aria-describedby={error?.key === "err.code.invalid" ? undefined : "room-code-hint"}
                  />
                  {/* When the code was refused the error below says the rules, so the hint steps aside instead of saying it twice. */}
                  {error?.key !== "err.code.invalid" && (
                    <p id="room-code-hint" className="code-hint">
                      {mode === "join"
                        ? t("join.hint.join")
                        : code.trim()
                          ? (isCustomCode(cleanCodeInput(code)) ? <>{t("join.hint.customBefore")}<strong>{cleanCodeInput(code)}</strong>{t("join.hint.customAfter")}</> : t("join.hint.rules"))
                          : t("join.hint.blank")}
                    </p>
                  )}
                </>
              )}
              <button className="btn btn-primary" type="submit" disabled={joining || !name.trim() || (mode === "join" && !roomId && !code.trim())}>
                {joining ? t("join.busy") : roomId || mode === "join" ? t("join.submit.join") : t("join.submit.start")}
              </button>
              {error && <p className="room-error" role="alert">{say(error)}</p>}
              {/* Joining by code found no room: if the code could be a room code, say so and offer to start it. */}
              {error?.payload?.code === "err.room.notFound" && !roomId && isCustomCode(cleanCodeInput(code)) && (
                <button className="btn" type="button" onClick={() => { setMode("start"); setError(undefined); }}>{t("join.gone.startCode")}</button>
              )}
            </form>
          ) : null}
          <LanguageSwitch />
        </aside>
      )}
      <input ref={focusProxy} className="focus-proxy" aria-hidden="true" tabIndex={-1} readOnly inputMode="text" />
      {quickReply !== undefined && room && <QuickReply name={quickReply} send={send} onClose={closeQuickReply} />}
    </main>
  );
}
