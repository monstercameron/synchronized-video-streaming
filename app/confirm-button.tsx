"use client";

import { useRef, type MouseEventHandler } from "react";

/** A second tap sooner than this after the first is a double-tap (or a fumble), not a decision, and is ignored. */
const settleMs = 600;

/**
 * A button that needs two taps (for things that cannot be undone). The first tap changes only the words and the colour:
 * both labels are always laid out on top of each other, so the button is as wide as the longer one and never grows,
 * wraps or moves, and the second tap lands on the same spot. `aria` is what the button does; `sureAria` is what the
 * second tap will do, said exactly (it is also announced when the button asks). The caller owns the timer that cancels it.
 * A fast double-tap does not count as the two taps: a second tap within 600 ms of the first is ignored.
 * The accessible name always starts with the words on the button, so voice control ("tap Delete") finds it.
 */
export function ConfirmButton({ confirming, label, sureLabel, aria, sureAria, className = "", disabled, title, onClick }: {
  confirming: boolean;
  label: string;
  sureLabel: string;
  aria: string;
  sureAria: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const armedAt = useRef(0);
  const click: MouseEventHandler<HTMLButtonElement> = event => {
    const now = performance.now();
    if (confirming) {
      if (now - armedAt.current < settleMs) return;
    } else {
      armedAt.current = now;
    }
    onClick(event);
  };
  return (
    <>
      <button
        className={`btn video-delete ${className}`} type="button" data-confirm={confirming} disabled={disabled}
        aria-label={confirming ? sureAria : aria} title={confirming ? sureAria : title} onClick={click}
      >
        <span className="cb-label" data-shown={!confirming}>{label}</span>
        <span className="cb-label" data-shown={confirming}>{sureLabel}</span>
      </button>
      {confirming && <span className="sr-only" role="status">{sureAria}</span>}
    </>
  );
}
