/**
 * For measuring only. With localStorage.setItem("screening-debug", "1") each component that calls this adds to
 * window.__renders[name], so a test can count how often it re-renders. Without the flag it does nothing.
 */
const enabled = (() => {
  try { return typeof localStorage !== "undefined" && !!localStorage.getItem("screening-debug"); } catch { return false; }
})();

export function countRender(name: string) {
  if (!enabled) return;
  const target = window as unknown as { __renders?: Record<string, number> };
  target.__renders ??= {};
  target.__renders[name] = (target.__renders[name] ?? 0) + 1;
}
