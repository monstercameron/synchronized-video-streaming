"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * True while the person has touched, moved over, focused or typed in the element within the last `ms`
 * milliseconds, so controls can fade out when nobody is using them. `hold` keeps them up (for example while the
 * person is dragging the timeline). `wake` shows them again from code, such as when playback changes.
 */
export function useIdle(ref: RefObject<HTMLElement | null>, ms: number, hold = false) {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const last = useRef(0);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const expire = useCallback(() => {
    // Still being held: look again in a second instead of hiding under the person's finger.
    if (holdRef.current) timer.current = setTimeout(expire, 1000);
    else setActive(false);
  }, []);

  const wake = useCallback(() => {
    setActive(true);
    // Pointer moves arrive many times a second. Restarting the clock that often is wasted work.
    const now = performance.now();
    if (timer.current && now - last.current < 250) return;
    last.current = now;
    clearTimeout(timer.current);
    timer.current = setTimeout(expire, ms);
  }, [expire, ms]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const events = ["pointermove", "pointerdown", "keydown", "focusin"] as const;
    events.forEach(name => element.addEventListener(name, wake, { passive: true }));
    wake();
    return () => {
      events.forEach(name => element.removeEventListener(name, wake));
      clearTimeout(timer.current);
    };
  }, [ref, wake]);

  return { active, wake };
}
