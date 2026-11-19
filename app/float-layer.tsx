"use client";

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { Reaction } from "./room-shared";

type Floater = { id: string; emoji: string; name: string; own: boolean; lane: number; size: number; speed: number; travel: number };
type Arriving = Pick<Floater, "id" | "emoji" | "name" | "own">;

export type FloatHandle = { add: (reaction: Reaction, name: string, own: boolean) => void };

/** At most this many new emoji appear in one frame. A burst arrives over a few frames instead of all at once. */
const spawnsPerFrame = 3;

/**
 * The emoji that scroll across the video.
 *
 * Kept in step with the display on purpose:
 *  - The movement is a CSS animation of `transform` only, so the browser runs it on the compositor, on the display's own
 *    clock, whatever the page's JavaScript is doing. Nothing here moves an emoji frame by frame.
 *  - New emoji are queued and added inside one requestAnimationFrame, at most a few per frame. The change is committed
 *    synchronously inside that callback (flushSync), so the emoji is in the page for the very frame that is about to be
 *    drawn and its animation starts on that frame, not one later. A burst never causes one big layout pass.
 *  - Each emoji's travel distance is a fixed number of pixels worked out when it appears. The keyframes then never need
 *    to be recalculated, which they would if they depended on the container's size while it is being resized.
 *  - Emoji that have finished are removed in the same per-frame step, not one render each.
 *
 * It owns its own state and is filled through a handle, so a burst re-renders only this small layer.
 */
export const FloatLayer = memo(function FloatLayer({ handle, max }: { handle: RefObject<FloatHandle | null>; max: number }) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const limit = useRef(max);
  const queue = useRef<Arriving[]>([]);
  const finished = useRef(new Set<string>());
  const frame = useRef(0);

  // The single per-frame step: bring in the next few emoji and drop the ones that have finished, in one render.
  const step = useCallback(() => {
    frame.current = 0;
    // One read of the layer's size per frame, shared by everything that appears in it.
    const width = layer.current?.clientWidth || 360;
    const arriving = queue.current.splice(0, spawnsPerFrame).map((item): Floater => {
      const size = 0.85 + Math.random() * 0.5;
      // Far enough to leave the picture: its width, the emoji itself and its name tag (capped at 10rem in the stylesheet).
      return { ...item, lane: Math.random(), size, speed: 3.4 + Math.random() * 1.6, travel: Math.round(width + 160 + size * 2.25 * 16 * 1.5) };
    });
    const gone = new Set(finished.current);
    finished.current.clear();
    if (arriving.length || gone.size) {
      // Safe here: this runs from a requestAnimationFrame callback, never during a render.
      flushSync(() => {
        setFloaters(list => {
          const kept = gone.size ? list.filter(item => !gone.has(item.id)) : list;
          return arriving.length ? [...kept, ...arriving].slice(-limit.current) : kept;
        });
      });
    }
    if (queue.current.length) frame.current = requestAnimationFrame(step);
  }, []);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(step);
  }, [step]);

  useEffect(() => {
    limit.current = max;
    const add: FloatHandle["add"] = (reaction, name, own) => {
      queue.current.push({ id: reaction.id, emoji: reaction.emoji, name, own });
      // Never let a flood queue up without bound: only the newest few can be on screen anyway.
      if (queue.current.length > max * 2) queue.current.splice(0, queue.current.length - max * 2);
      schedule();
    };
    handle.current = { add };

    // For measuring: localStorage.setItem("screening-debug", "1") adds window.__floatBurst(count).
    try {
      if (localStorage.getItem("screening-debug")) {
        (window as unknown as { __floatBurst?: (count: number) => void }).__floatBurst = count => {
          for (let index = 0; index < count; index++) add({ id: `debug-${performance.now()}-${index}`, authorId: "debug", emoji: ["❤️", "😂", "🔥", "👏"][index % 4], at: Date.now() }, "Debug", false);
        };
      }
    } catch { /* Storage can be blocked. */ }

    return () => {
      handle.current = null;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [handle, max, schedule]);

  const retire = (id: string) => {
    finished.current.add(id);
    schedule();
  };

  return (
    <div className="floaters" ref={layer} aria-hidden="true">
      {floaters.map(floater => (
        <span
          key={floater.id} className="floater" data-own={floater.own}
          style={{ top: `${6 + floater.lane * 66}%`, "--size": `${floater.size * 2.25}rem`, "--speed": `${floater.speed}s`, "--travel": `${floater.travel}px` } as CSSProperties}
          onAnimationEnd={() => retire(floater.id)}
        >
          <b>{floater.emoji}</b>
          {floater.name && <i>{floater.name}</i>}
        </span>
      ))}
    </div>
  );
});
