import { rovingRef } from "./roving";

/**
 * A row that scrolls sideways shows a soft fade on whichever edge still has more to see, so it is clear that it can be
 * swiped. Use as `ref={scrollFadeRef}` together with the `.fade-x` class, which draws the fade from the two custom
 * properties this sets. The properties are written straight to the element, so scrolling never re-renders React.
 */
export function scrollFadeRef(element: HTMLElement | null) {
  if (!element) return;
  const size = "2.25rem";
  const update = () => {
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    element.style.setProperty("--fade-left", left ? size : "0px");
    element.style.setProperty("--fade-right", right ? size : "0px");
  };
  update();
  element.addEventListener("scroll", update, { passive: true });
  // Rotating the phone, a language switch (longer labels) or a button appearing all change how much there is to scroll.
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
  observer?.observe(element);
  element.querySelectorAll(":scope > *").forEach(child => observer?.observe(child));
  const mutations = new MutationObserver(() => {
    observer?.disconnect();
    observer?.observe(element);
    element.querySelectorAll(":scope > *").forEach(child => observer?.observe(child));
    update();
  });
  mutations.observe(element, { childList: true });
  return () => {
    element.removeEventListener("scroll", update);
    observer?.disconnect();
    mutations.disconnect();
  };
}

/** A row of buttons that is one Tab stop (arrow keys move along it) and fades on the edge that has more to scroll to. */
export function rovingFadeRef(element: HTMLElement | null) {
  const stopRoving = rovingRef(element);
  const stopFading = scrollFadeRef(element);
  return () => { stopRoving?.(); stopFading?.(); };
}
