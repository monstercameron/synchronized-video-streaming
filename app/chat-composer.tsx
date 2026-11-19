"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { groupMentions } from "./chat-text";
import { problemOf, useI18n, type Problem } from "./i18n";
import { rovingFadeRef } from "./scroll-fade";
import { REACTIONS, type RoomCommand, type RoomMember } from "./room-shared";

const emojiPalette = [
  "😀", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩",
  "🥳", "😅", "😉", "🙃", "🤔", "🙄", "😬", "😴",
  "😮", "😱", "🤯", "😢", "😭", "😡", "🥺", "😇",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
  "❤️", "💔", "💯", "🔥", "✨", "🎉", "🎬", "🍿",
  "👀", "🤌", "🫶", "😏", "🫠", "🤭", "🤫", "😤",
];

const mentionQuery = /(?:^|\s)@([^\s@]{0,32})$/u;

export type ComposerHandle = { mention: (name: string) => void; focus: () => void };

/**
 * The reaction row, emoji picker, @-suggestions and message box. It owns the text being typed, so a
 * keystroke re-renders only this component, never the chat history above it.
 */
export function ChatComposer({ members, youId, send, onSent, handle }: {
  members: RoomMember[];
  youId: string;
  send: (command: RoomCommand) => Promise<void>;
  onSent: () => void;
  handle: RefObject<ComposerHandle | null>;
}) {
  const { t, say } = useI18n();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [mentionClosed, setMentionClosed] = useState(false);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Problem>();
  const field = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const before = draft.slice(0, caret);
  const query = mentionClosed ? undefined : mentionQuery.exec(before)?.[1];
  const suggestions = query === undefined ? [] : [
    ...members.filter(member => member.id !== youId).map(member => member.name),
    ...groupMentions,
  ].filter((name, index, all) => all.indexOf(name) === index && name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);
  const active = Math.min(pick, Math.max(0, suggestions.length - 1));

  function insert(text: string, replaceFrom = caret, replaceTo = caret) {
    const next = draft.slice(0, replaceFrom) + text + draft.slice(replaceTo);
    const position = replaceFrom + text.length;
    setDraft(next.slice(0, 500));
    setCaret(position);
    setMentionClosed(false);
    requestAnimationFrame(() => {
      const input = field.current;
      if (!input) return;
      input.setSelectionRange(position, position);
      input.focus({ preventScroll: true });
    });
  }

  function accept(name: string) {
    insert(`@${name} `, before.lastIndexOf("@"), caret);
    setPick(0);
  }

  // The People tab can start a message to someone.
  useEffect(() => {
    handle.current = {
      mention(name) {
        setDraft(value => {
          const next = `${value}${value && !value.endsWith(" ") ? " " : ""}@${name} `.slice(0, 500);
          setCaret(next.length);
          return next;
        });
        requestAnimationFrame(() => field.current?.focus());
      },
      focus() { requestAnimationFrame(() => field.current?.focus()); },
    };
    return () => { handle.current = null; };
  }, [handle]);

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setPick((active + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        accept(suggestions[active]);
      } else if (event.key === "Escape") {
        setMentionClosed(true);
      }
    } else if (event.key === "Escape") {
      setPicker(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || suggestions.length) return;
    setSending(true);
    setError(undefined);
    try {
      onSent();
      await send({ type: "chat", text });
      setDraft(value => value.trim() === text ? "" : value);
      setCaret(0);
      setPicker(false);
    } catch (reason) {
      setError(problemOf(reason, "chat.err.send"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="reaction-bar" role="toolbar" aria-label={t("chat.reactions")} ref={rovingFadeRef}>
        {REACTIONS.map(emoji => (
          // Fire and forget: a rate-limit reply just means "slow down".
          <button key={emoji} type="button" onClick={() => void send({ type: "react", emoji }).catch(() => {})} aria-label={t("chat.react", { emoji })}>{emoji}</button>
        ))}
      </div>

      {picker && (
        <div
          id={`${listId}-emoji`} className="emoji-picker" role="group" aria-label={t("chat.emoji")}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPicker(false); toggle.current?.focus(); } }}
        >
          {emojiPalette.map(emoji => (
            <button key={emoji} type="button" onPointerDown={event => event.preventDefault()} onClick={() => insert(emoji)}>{emoji}</button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="mention-list" id={listId} role="listbox" aria-label={t("chat.mentionSomeone")}>
          {suggestions.map((name, index) => (
            // The options are plain rows, not buttons inside rows: the message box keeps the focus and points at the active one.
            <li
              key={name} id={`${listId}-${index}`} role="option" aria-selected={index === active} data-active={index === active}
              onPointerDown={event => event.preventDefault()} onClick={() => accept(name)}
            >
              <span className="avatar" aria-hidden="true">{groupMentions.includes(name) ? "@" : name.trim().charAt(0).toUpperCase()}</span>
              <span>@{name}</span>
              {groupMentions.includes(name) && <small>{t("chat.notifyRoom")}</small>}
            </li>
          ))}
        </ul>
      )}

      <form className="composer" onSubmit={submit}>
        <button ref={toggle} className="emoji-toggle" type="button" aria-label={t("chat.emoji")} aria-expanded={picker} aria-controls={picker ? `${listId}-emoji` : undefined} onClick={() => setPicker(value => !value)}>🙂</button>
        <input
          ref={field} aria-label={t("chat.write")} placeholder={t("chat.placeholder")}
          role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length > 0 ? listId : undefined} aria-activedescendant={suggestions.length > 0 ? `${listId}-${active}` : undefined}
          enterKeyHint="send" autoComplete="off" maxLength={500} value={draft}
          onChange={event => { setDraft(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setMentionClosed(false); setPick(0); }}
          onSelect={event => setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onKeyDown={onKey}
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim() || sending}>{t("chat.send")}</button>
      </form>
      {error && <p className="room-error" role="alert">{say(error)}</p>}
    </>
  );
}
