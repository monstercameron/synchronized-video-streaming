"use client";

import { memo, useEffect, useState, type RefObject } from "react";
import { useI18n } from "./i18n";

export type Bubble = { id: number; author: string; text: string; mention: boolean };
export type BubbleHandle = { add: (bubble: Bubble) => void };

const life = 7000;
const mentionLife = 11000;

/**
 * Other people's chat shown as small speech bubbles over the picture, tucked against the right edge so they do not sit
 * in the middle of the film. They appear only while the chat panel is out of sight (full screen, or a phone held sideways),
 * fade away by themselves, and tapping one starts a reply to that person. It is filled through a handle, like the
 * floating emoji, so a chat line never re-renders the player.
 */
export const BubbleLayer = memo(function BubbleLayer({ handle, onReply, max = 3 }: {
  handle: RefObject<BubbleHandle | null>;
  onReply: (author: string) => void;
  max?: number;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    handle.current = { add: bubble => setBubbles(list => [...list.filter(item => item.id !== bubble.id), bubble].slice(-max)) };
    return () => { handle.current = null; };
  }, [handle, max]);

  if (!bubbles.length) return null;
  return (
    <div className="chat-bubbles">
      {bubbles.map(bubble => (
        <BubbleItem key={bubble.id} bubble={bubble} onReply={onReply} onGone={() => setBubbles(list => list.filter(item => item.id !== bubble.id))} />
      ))}
    </div>
  );
});

function BubbleItem({ bubble, onReply, onGone }: { bubble: Bubble; onReply: (author: string) => void; onGone: () => void }) {
  const { t } = useI18n();
  const lifetime = bubble.mention ? mentionLife : life;
  useEffect(() => {
    const timer = setTimeout(onGone, lifetime);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      className="chat-bubble" type="button" data-mention={bubble.mention}
      style={{ animationDuration: `${lifetime}ms` }}
      onClick={() => onReply(bubble.author)}
      aria-label={t("chat.bubble", { author: bubble.author, text: bubble.text })}
    >
      <strong>{bubble.author}</strong>
      <span>{bubble.text}</span>
    </button>
  );
}
