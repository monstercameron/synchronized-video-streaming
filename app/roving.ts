import { useEffect, type RefObject } from "react";

/**
 * Keyboard behaviour for a group of choices, the way screen readers and keyboard users expect it:
 *
 *  - role="tablist" / role="radiogroup": only the chosen item is a Tab stop (the others are reached with the arrow keys),
 *    and Left/Right/Up/Down/Home/End move to another item and choose it.
 *  - role="toolbar" (a row of plain buttons): one Tab stop for the whole row, and the arrow keys move along it.
 *
 * Without this every item is its own Tab stop, and a room view has more than twenty of them before the chat box.
 * Use it as `ref={rovingRef}` on the element that has the role. It watches the group, so it keeps working while the
 * chosen item, or the list of items, changes.
 */

const choiceSelector = '[role="radio"],[role="tab"]';

export function rovingRef(container: HTMLElement | null) {
  if (!container) return;
  const toolbar = container.getAttribute("role") === "toolbar";
  const selector = toolbar ? "button" : choiceSelector;
  let current: HTMLElement | undefined;

  const all = () => Array.from(container.querySelectorAll<HTMLElement>(selector));
  const usable = () => all().filter(item => !item.hasAttribute("disabled"));

  const sync = () => {
    const items = usable();
    const chosen = toolbar
      ? (current && items.includes(current) ? current : items[0])
      : items.find(item => item.getAttribute("aria-checked") === "true" || item.getAttribute("aria-selected") === "true") ?? items[0];
    for (const item of all()) item.tabIndex = item === chosen ? 0 : -1;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (!target || !container.contains(target)) return;
    const items = usable();
    const index = items.indexOf(target);
    if (index < 0) return;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
    if (!toolbar) items[next].click(); // Choosing follows focus, like the arrow keys in a native radio group.
  };

  const onFocusIn = (event: FocusEvent) => {
    if (!toolbar) return;
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (item && container.contains(item)) { current = item; sync(); }
  };

  sync();
  const observer = new MutationObserver(sync);
  observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-checked", "aria-selected", "disabled"] });
  container.addEventListener("keydown", onKeyDown);
  container.addEventListener("focusin", onFocusIn);
  return () => {
    observer.disconnect();
    container.removeEventListener("keydown", onKeyDown);
    container.removeEventListener("focusin", onFocusIn);
  };
}

/** The same, for an element that already has a ref of its own. */
export function useRoving(ref: RefObject<HTMLElement | null>) {
  useEffect(() => rovingRef(ref.current), [ref]);
}
