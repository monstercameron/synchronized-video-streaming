"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "./i18n";
import type { RoomCommand } from "./room-shared";

/**
 * A one-line reply bar for a phone that is physically sideways, where the chat panel is not on screen. It starts with
 * "@name " already typed and the keyboard up, sits above the keyboard, and closes after sending.
 */
export function QuickReply({ name, send, onClose }: { name: string; send: (command: RoomCommand) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(`@${name} `);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    // Nothing but the @name is not a reply yet.
    if (!message || message === `@${name}` || sending) return;
    setSending(true);
    setError("");
    try {
      await send({ type: "chat", text: message });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("chat.err.send"));
      setSending(false);
    }
  }

  return (
    <form className="quick-reply" onSubmit={submit} onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <input
        ref={input} aria-label={t("chat.replyTo", { name })} enterKeyHint="send" autoComplete="off" maxLength={500}
        value={text} onChange={event => setText(event.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={sending}>{t("chat.send")}</button>
      <button className="btn" type="button" onClick={onClose} aria-label={t("chat.closeReply")}>✕</button>
      {error && <p className="room-error" role="alert">{error}</p>}
    </form>
  );
}
