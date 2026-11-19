"use client";

import { useI18n } from "./i18n";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

/**
 * The video's title in the top bar. A long title scrolls sideways (swipe it) instead of being cut off with "…",
 * with a soft fade on whichever side has more to read. Tapping it opens the video's details.
 */
export function TopbarTitle({ title, detail, onOpen }: { title: string; detail: string; onOpen?: () => void }) {
  const { t } = useI18n();
  const scroller = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setMore(previous => (previous.left === left && previous.right === right ? previous : { left, right }));
  }, []);

  useEffect(() => {
    measure();
    const element = scroller.current;
    if (!element) return;
    element.scrollLeft = 0;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [title, measure]);

  const open = onOpen && {
    role: "button" as const, tabIndex: 0, "aria-haspopup": "dialog" as const, "aria-label": t("topbar.showDetails", { title }),
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } },
  };

  return (
    <div className="topbar-title" data-interactive={!!onOpen} {...open}>
      <div className="title-row">
        <strong
          ref={scroller} className="title-scroll" onScroll={measure}
          style={{ "--fade-left": more.left ? "1.25rem" : "0px", "--fade-right": more.right ? "1.25rem" : "0px" } as CSSProperties}
        >{title}</strong>
        {onOpen && <i className="title-info" aria-hidden="true">i</i>}
      </div>
      <span>{detail}</span>
    </div>
  );
}
