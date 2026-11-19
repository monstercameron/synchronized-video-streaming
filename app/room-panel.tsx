"use client";

import { countRender } from "./debug-renders";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatComposer, type ComposerHandle } from "./chat-composer";
import { MessageText, mentionsName } from "./chat-text";
import dynamic from "next/dynamic";
import type { DeviceProfile } from "./device";
import { useI18n } from "./i18n";
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
const ChatMessage = memo(function ChatMessage({ message, author, own, grouped, names, me }: {
  message: RoomMessage; author?: string; own: boolean; grouped: boolean; names: string[]; me: string;
}) {
  const { t, locale } = useI18n();
  const mention = !own && !!me && mentionsName(message.text, me);
  return (
    <article className="chat-message" data-own={own} data-grouped={grouped} data-mention={mention}>
      {!own && !grouped && <strong>{author ?? t("chat.someone")}</strong>}
      <p><MessageText text={message.text} names={names} me={me} /></p>
      <time dateTime={new Date(message.sentAt).toISOString()}>{timeOf(locale, message.sentAt)}</time>
    </article>
  );
});

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
  const me = room.members.find(member => member.id === room.youId)?.name ?? identityName ?? "";
  // Stable between updates (members keep their identity unless someone joins), so memoized lines stay put.
  const names = useMemo(() => room.members.map(member => member.name), [room.members]);
  const people = useMemo(() => new Map(room.members.map(member => [member.id, member.name])), [room.members]);
  const lastId = room.messages.at(-1)?.id ?? 0;
  const struggling = room.members.filter(member => member.health === "struggling");

  const [tab, setTab] = useState<"chat" | "people" | "video">("chat");
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [seenId, setSeenId] = useState(lastId);
  const [atBottom, setAtBottom] = useState(true);
  const [toast, setToast] = useState<Toast>();
  const feed = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const follow = useRef(true);
  const notified = useRef(lastId);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!replyRequest) return;
    setTab("chat");
    composer.current?.mention(replyRequest.name);
  }, [replyRequest]);

  // The tab row scrolls sideways; keep the chosen tab in view.
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);

  // ----- Unread and mention tracking -----
  const unread = room.messages.filter(message => message.id > seenId && message.authorId !== room.youId);
  const unreadMentions = unread.filter(message => !!me && mentionsName(message.text, me)).length;

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
    if (tab === "chat" && follow.current) return;
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
    setCopied(false);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: t("chat.shareTitle"), url: url.toString(), ...(isCustomCode(room.id) ? { text: t("chat.shareCode", { code: room.id }) } : {}) });
      } else {
        await navigator.clipboard.writeText(url.toString());
        setCopied(true);
      }
    } catch { /* The field exposes the link when sharing or clipboard access is unavailable. */ }
  }

  return (
    <aside className="panel" aria-label={t("panel.label")}>
      <div className="tabs" role="tablist" aria-label={t("panel.tabs")}>
        <button role="tab" id="tab-chat" aria-selected={tab === "chat"} aria-controls="pane-chat" onClick={() => setTab("chat")}>
          {t("tab.chat")}
          {tab !== "chat" && unread.length > 0 && (
            <span className="badge" data-mention={unreadMentions > 0} aria-label={unreadMentions ? t("chat.unreadMentions", { count: unread.length, mentions: unreadMentions }) : t("chat.unread", { count: unread.length })}>
              {unreadMentions > 0 ? "@" : ""}{unread.length}
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

      {toast && (
        <button className="mention-toast" type="button" onClick={openToast}>
          <strong>{t("chat.mentionedYou", { author: toast.author })}</strong>
          <span>{toast.text}</span>
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
              return <ChatMessage key={message.id} message={message} author={own || grouped ? undefined : people.get(message.authorId)} own={own} grouped={grouped} names={names} me={me} />;
            })}
          </div>
          {!atBottom && unread.length > 0 && (
            <button className="jump-latest" type="button" onClick={jumpToLatest}>
              {t("chat.newCount", { count: unread.length })}{unreadMentions ? " · @" : ""}
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
          {invite && <input className="invite-link" aria-label={t("people.inviteLabel")} readOnly value={invite} onFocus={event => event.currentTarget.select()} />}
          <ul className="people">
            {room.members.map(member => (
              <li key={member.id}>
                <span className="avatar" aria-hidden="true">{member.name.trim().charAt(0).toUpperCase()}</span>
                <span className="person-name">{member.name}{member.id === room.youId ? ` ${t("people.you")}` : ""}</span>
                {member.health === "struggling" && (isHost || member.id === room.youId) && (
                  <span className="struggle" title={t("people.strugglingHint")}>{t("people.struggling")}</span>
                )}
                {room.buffering?.includes(member.id) && <span className="buffering-tag" title={t("people.buffering")}>{t("people.buffering")}</span>}
                <span className="member-role">{member.id === room.hostId ? t("people.host") : t("people.viewer")}</span>
                {member.id !== room.youId && (
                  <button className="mention-person" type="button" onClick={() => mention(member.name)} aria-label={t("people.mention", { name: member.name })}>@</button>
                )}
              </li>
            ))}
          </ul>
          <p className="sheet-note">{isHost ? t("people.signedInHost", { name: identityName ?? "" }) : t("people.signedInViewer", { name: identityName ?? "" })}</p>
        </div>
      )}
    </aside>
  );
}
