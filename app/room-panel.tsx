"use client";

import { countRender } from "./debug-renders";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DefaultPasswordNotice, useDefaultPasswordNotice } from "./admin-ui";
import { ChatComposer, type ComposerHandle } from "./chat-composer";
import { MessageText, mentionsName } from "./chat-text";
import dynamic from "next/dynamic";
import type { DeviceProfile } from "./device";
import { useI18n } from "./i18n";
import { useListPresence, usePresence } from "./motion";
import { useRoving } from "./roving";
import { isCustomCode, type RoomCommand, type RoomMessage, type RoomSnapshot } from "./room-shared";
import type { Quality } from "./use-playback-quality";

// The Video tab (and the host's library tools in it) is only loaded when someone opens it.
const LibraryPanel = dynamic(() => import("./library-panel").then(module => module.LibraryPanel));

const timeFormats = new Map<string, Intl.DateTimeFormat>();
/** The clock time of a message in the viewer's language (24-hour or AM/PM as that language prefers). */
function timeOf(locale: string, milliseconds: number) {
  let format = timeFormats.get(locale);
  if (!format) { format = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }); timeFormats.set(locale, format); }
  return format.format(milliseconds);
}

type Toast = { id: number; author: string; text: string };

/** One chat line. Memoized: when a new message arrives, the existing ones are not rendered again. */
const ChatMessage = memo(function ChatMessage({ message, author, own, grouped, names, me, fresh }: {
  message: RoomMessage; author?: string; own: boolean; grouped: boolean; names: string[]; me: string;
  /** Arrived after the chat was opened: slides in once. Older lines (the history) are simply there. */
  fresh: boolean;
}) {
  const { t, locale } = useI18n();
  const mention = !own && !!me && mentionsName(message.text, me);
  // The entrance plays once. Without this, coming back to the Chat tab (which is hidden, not removed) would replay it.
  const [entering, setEntering] = useState(fresh);
  return (
    <article
      className="chat-message" data-own={own} data-grouped={grouped} data-mention={mention} data-fresh={entering}
      onAnimationEnd={entering ? event => { if (event.animationName === "msg-in") setEntering(false); } : undefined}
    >
      {!own && !grouped && <strong>{author ?? t("chat.someone")}</strong>}
      <p><MessageText text={message.text} names={names} me={me} /></p>
      <time dateTime={new Date(message.sentAt).toISOString()}>{timeOf(locale, message.sentAt)}</time>
    </article>
  );
});

/** The people in the room. Someone who leaves fades out where they were instead of vanishing. */
function PeopleList({ room, isHost, onMention }: { room: RoomSnapshot; isHost: boolean; onMention: (name: string) => void }) {
  const { t } = useI18n();
  const rows = useListPresence(room.members, member => member.id);
  return (
    <ul className="people">
      {rows.map(({ item: member, key, leaving }) => (
        <li key={key} data-leaving={leaving} inert={leaving}>
          <span className="avatar" aria-hidden="true">{member.name.trim().charAt(0).toUpperCase()}</span>
          <span className="person-name">{member.name}{member.id === room.youId ? ` ${t("people.you")}` : ""}</span>
          {member.health === "struggling" && (isHost || member.id === room.youId) && (
            <span className="struggle" title={t("people.strugglingHint")}>{t("people.struggling")}</span>
          )}
          {room.buffering?.includes(member.id) && <span className="buffering-tag" title={t("people.buffering")}>{t("people.buffering")}</span>}
          <span className="member-role">{member.id === room.hostId ? t("people.host") : t("people.viewer")}</span>
          {member.id !== room.youId && (
            <button className="mention-person" type="button" onClick={() => onMention(member.name)} aria-label={t("people.mention", { name: member.name })}>@</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RoomPanel({ room, identityName, isHost, send, quality, onQuality, profile, replyRequest }: {
  room: RoomSnapshot;
  identityName?: string;
  isHost: boolean;
  send: (command: RoomCommand) => Promise<void>;
  quality: Quality;
  onQuality: (quality: Quality) => void;
  profile: DeviceProfile;
  /** Set when someone taps a chat bubble: open the chat with "@name " typed and the cursor in the message box. */
  replyRequest?: { name: string; n: number };
}) {
  const { t, tn } = useI18n();
  countRender("panel");
  const defaultPassword = useDefaultPasswordNotice();
  const me = room.members.find(member => member.id === room.youId)?.name ?? identityName ?? "";
  // Stable between updates (members keep their identity unless someone joins), so memoized lines stay put.
  const names = useMemo(() => room.members.map(member => member.name), [room.members]);
  const people = useMemo(() => new Map(room.members.map(member => [member.id, member.name])), [room.members]);
  const lastId = room.messages.at(-1)?.id ?? 0;
  const struggling = room.members.filter(member => member.health === "struggling");

  const [tab, setTab] = useState<"chat" | "people" | "video">("chat");
  const [invite, setInvite] = useState("");
  // Copying the invitation link: it worked, or it could not be done and the link is selected for the person to copy by hand.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const copied = copyState === "copied";
  const inviteField = useRef<HTMLInputElement>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [seenId, setSeenId] = useState(lastId);
  const [atBottom, setAtBottom] = useState(true);
  const [toast, setToast] = useState<Toast>();
  // The mention toast and the "new messages" button fade out instead of vanishing.
  const toastView = usePresence(toast ?? null);
  const feed = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const follow = useRef(true);
  const notified = useRef(lastId);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!replyRequest) return;
    setTab("chat");
    if (replyRequest.name) composer.current?.mention(replyRequest.name);
    else composer.current?.focus();
  }, [replyRequest]);

  // The tab row scrolls sideways; keep the chosen tab in view.
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);

  // The gold line under the chosen tab slides to it. It is one element (the row's ::after) moved with a transform; the
  // stylesheet reads where to put it from --tab-x and --tab-w, measured here. Choosing a tab sets data-slide so the move is
  // animated; a change of size (a language switch, a bigger badge) or the first placement just jumps.
  const tabRow = useRef<HTMLDivElement>(null);
  useRoving(tabRow);
  const slot = useRef({ x: -1, w: -1 });
  const place = useCallback((animate: boolean) => {
    const row = tabRow.current;
    const chosen = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !chosen || (chosen.offsetLeft === slot.current.x && chosen.offsetWidth === slot.current.w)) return;
    slot.current = { x: chosen.offsetLeft, w: chosen.offsetWidth };
    row.toggleAttribute("data-slide", animate);
    row.style.setProperty("--tab-x", String(chosen.offsetLeft));
    row.style.setProperty("--tab-w", String(chosen.offsetWidth));
    row.setAttribute("data-measured", "");
  }, []);
  useLayoutEffect(() => {
    const row = tabRow.current;
    place(false);
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(row);
    row.querySelectorAll("button").forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [place]);
  useLayoutEffect(() => { place(true); }, [tab, place]);

  // The chat that was already there when this panel opened is history; only newer lines slide in.
  const historyEnd = useRef(lastId);

  // ----- Unread and mention tracking -----
  const unread = room.messages.filter(message => message.id > seenId && message.authorId !== room.youId);
  const unreadMentions = unread.filter(message => !!me && mentionsName(message.text, me)).length;
  const jumpView = usePresence(!atBottom && unread.length > 0 ? { count: unread.length, mentions: unreadMentions } : null);

  useLayoutEffect(() => {
    const log = feed.current;
    if (tab === "chat" && log && follow.current) log.scrollTop = log.scrollHeight;
  }, [lastId, tab]);

  useEffect(() => {
    if (tab === "chat" && atBottom && seenId !== lastId) setSeenId(lastId);
  }, [tab, atBottom, lastId, seenId]);

  // Pop a toast (and buzz) when someone @-mentions you and you are not looking at the message.
  useEffect(() => {
    const fresh = room.messages.filter(message => message.id > notified.current);
    if (!fresh.length) return;
    notified.current = lastId;
    const hit = fresh.filter(message => message.authorId !== room.youId && !!me && mentionsName(message.text, me)).at(-1);
    if (!hit) return;
    try { navigator.vibrate?.([40, 40, 40]); } catch { /* Not every browser can vibrate. */ }
    // While a sheet (Settings, Subtitles) covers the chat on a phone, the chat is on screen to nobody: tell them with the toast, which stays visible above the sheet.
    const covered = !!panelRef.current && getComputedStyle(panelRef.current).visibility === "hidden";
    if (tab === "chat" && follow.current && !covered) return;
    setToast({ id: hit.id, author: people.get(hit.authorId) ?? t("chat.someone"), text: hit.text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 7000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function jumpToLatest() {
    follow.current = true;
    setAtBottom(true);
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }

  function openToast() {
    setToast(undefined);
    window.dispatchEvent(new Event("screening:close-sheets"));
    setTab("chat");
    follow.current = true;
    setAtBottom(true);
  }

  function mention(name: string) {
    setTab("chat");
    composer.current?.mention(name);
  }

  async function share() {
    const url = new URL(window.location.href);
    url.searchParams.set("room", room.id);
    setInvite(url.toString());
    setCopyState("idle");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: t("chat.shareTitle"), url: url.toString(), ...(isCustomCode(room.id) ? { text: t("chat.shareCode", { code: room.id }) } : {}) });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setCopyState("copied");
      }
    } catch (reason) {
      // The person closing the share sheet is not a failure. A blocked clipboard is: say so, and leave the link selected.
      if (!(reason instanceof DOMException && reason.name === "AbortError")) setCopyState("manual");
    }
  }
  useEffect(() => {
    if (copyState === "manual") { inviteField.current?.focus(); inviteField.current?.select(); }
  }, [copyState, invite]);

  return (
    <aside className="panel" aria-label={t("panel.label")} ref={panelRef}>
      <div className="tabs" role="tablist" aria-label={t("panel.tabs")} ref={tabRow}>
        <button role="tab" id="tab-chat" aria-selected={tab === "chat"} aria-controls="pane-chat" onClick={() => setTab("chat")}>
          {t("tab.chat")}
          {tab !== "chat" && unread.length > 0 && (
            <span className="badge" key={unread.length} data-mention={unreadMentions > 0} aria-label={unreadMentions ? t("chat.unreadMentions", { count: unread.length, mentions: unreadMentions }) : t("chat.unread", { count: unread.length })}>
              {unreadMentions > 0 ? "@" : ""}{unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </button>
        <button role="tab" id="tab-people" aria-selected={tab === "people"} aria-controls="pane-people" onClick={() => setTab("people")}>
          {t("tab.people")} <span className="badge">{room.members.length}</span>
        </button>
        <button role="tab" id="tab-video" aria-selected={tab === "video"} aria-controls="pane-video" onClick={() => setTab("video")}>
          {t("tab.video")}
          {isHost && struggling.length > 0 && <span className="badge" data-mention="true" aria-label={tn("tab.struggling", struggling.length)}>!</span>}
        </button>
      </div>

      {defaultPassword.show && <DefaultPasswordNotice floating onDismiss={defaultPassword.dismiss} />}

      {toastView.shown && (
        <button className="mention-toast" key={toastView.shown.id} type="button" onClick={openToast} data-closing={toastView.closing} inert={toastView.closing}>
          <strong>{t("chat.mentionedYou", { author: toastView.shown.author })}</strong>
          <span>{toastView.shown.text}</span>
        </button>
      )}

      {/* The chat stays mounted behind the other tabs, so a half-written message and the scroll position survive. */}
      <div className="pane" id="pane-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== "chat"}>
        <div className="chat-wrap">
          <div className="chat-log" ref={feed} role="log" aria-label={t("chat.log")} onScroll={event => {
            const log = event.currentTarget;
            const near = log.scrollHeight - log.scrollTop - log.clientHeight < 32;
            follow.current = near;
            setAtBottom(current => current === near ? current : near);
          }}>
            {!room.messages.length && <p className="chat-empty">{t("chat.empty")}</p>}
            {room.messages.map((message, index) => {
              const previous = room.messages[index - 1];
              const own = message.authorId === room.youId;
              const grouped = previous?.authorId === message.authorId && message.sentAt - previous.sentAt < 120000;
              return <ChatMessage key={message.id} message={message} author={own || grouped ? undefined : people.get(message.authorId)} own={own} grouped={grouped} names={names} me={me} fresh={message.id > historyEnd.current} />;
            })}
          </div>
          {jumpView.shown && (
            <button className="jump-latest" type="button" onClick={jumpToLatest} data-closing={jumpView.closing} inert={jumpView.closing}>
              {t("chat.newCount", { count: jumpView.shown.count })}{jumpView.shown.mentions ? " · @" : ""}
            </button>
          )}
        </div>
        <ChatComposer members={room.members} youId={room.youId} send={send} onSent={() => { follow.current = true; }} handle={composer} />
      </div>

      {tab === "video" && <LibraryPanel room={room} isHost={isHost} send={send} quality={quality} onQuality={onQuality} profile={profile} />}

      {tab === "people" && (
        <div className="pane pane-scroll" id="pane-people" role="tabpanel" aria-labelledby="tab-people">
          {isCustomCode(room.id) && (
            <div className="room-code">
              <div><small>{t("people.roomCode")}</small><strong>{room.id}</strong></div>
              <button className="btn" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(room.id); setCodeCopied(true); } catch { /* The code is on screen to read out or type. */ }
              }}>{codeCopied ? t("common.copied") : t("people.copyCode")}</button>
            </div>
          )}
          <button className="btn btn-primary btn-wide" type="button" onClick={share}>{copied ? t("people.linkCopied") : t("people.invite")}</button>
          <span className="sr-only" role="status">{copied ? t("people.linkCopied") : ""}</span>
          {invite && <input ref={inviteField} className="invite-link" aria-label={t("people.inviteLabel")} readOnly value={invite} onFocus={event => event.currentTarget.select()} />}
          {copyState === "manual" && <p className="sheet-note" role="status">{t("people.copyManual")}</p>}
          <PeopleList room={room} isHost={isHost} onMention={mention} />
          <p className="sheet-note">{isHost ? t("people.signedInHost", { name: identityName ?? "" }) : t("people.signedInViewer", { name: identityName ?? "" })}</p>
        </div>
      )}
    </aside>
  );
}
