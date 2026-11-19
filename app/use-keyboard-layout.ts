"use client";

import { useEffect } from "react";

/**
 * Keeps the page usable while the on-screen keyboard is up.
 *
 * Android Chrome shrinks the page when the keyboard opens (the viewport meta asks for that). iPhones do not: the keyboard
 * slides over the bottom of the page and Safari pans the visible area, so anything pinned to the bottom, the message box
 * and the reply bar included, ends up hidden behind it. The browser does report the part you can actually see (the
 * "visual viewport"), so this follows it and publishes three things on <html> for the stylesheet:
 *
 *   data-keyboard="open"  while a text field has focus and the visible height has dropped by a keyboard's worth
 *   --vvh                 the visible height in pixels (set only while the keyboard is open)
 *   --vvt                 how far the visible area has been panned down from the top of the page
 *
 * A browser bar that slides away, a pinch zoom or going full screen change the height too but are not the keyboard, so
 * the field-has-focus test and the zoom test keep them from counting.
 */

const fieldSelector = "input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]), textarea, select, [contenteditable=true]";
const keyboardMinimum = 100;

export function useKeyboardLayout() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    // The visible height when no field is being edited: what a keyboard is measured against.
    let resting = viewport.height;
    let width = window.innerWidth;
    let frame = 0;

    const editing = () => {
      const active = document.activeElement;
      return !!active && active.matches(fieldSelector);
    };

    const apply = () => {
      frame = 0;
      if (window.innerWidth !== width) { width = window.innerWidth; resting = viewport.height; } // Turned the phone: start over.
      const typing = editing();
      if (!typing) resting = Math.max(viewport.height, 0);
      const open = typing && viewport.scale <= 1.01 && resting - viewport.height > keyboardMinimum;
      if (open) {
        root.dataset.keyboard = "open";
        root.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
        root.style.setProperty("--vvt", `${Math.round(viewport.offsetTop)}px`);
      } else {
        delete root.dataset.keyboard;
        root.style.removeProperty("--vvh");
        root.style.removeProperty("--vvt");
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    // Focus moves a moment before the keyboard finishes animating, so look again shortly after it does.
    const focusChange = () => { schedule(); setTimeout(schedule, 120); setTimeout(schedule, 400); };

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", focusChange);
    document.addEventListener("focusout", focusChange);
    apply();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", focusChange);
      document.removeEventListener("focusout", focusChange);
      delete root.dataset.keyboard;
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, []);
}
