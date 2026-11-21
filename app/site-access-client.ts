const accessKey = "screening-access-change";

export function notifySiteAccessChanged() {
  try { localStorage.setItem(accessKey, `${Date.now()}-${Math.random()}`); } catch { /* Other tabs can still refresh. */ }
}

export function watchSiteAccess(check: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === accessKey) check(); };
  const visible = () => { if (!document.hidden) check(); };
  const restored = (event: PageTransitionEvent) => { if (event.persisted) check(); };
  window.addEventListener("storage", storage);
  window.addEventListener("pageshow", restored);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener("pageshow", restored);
    document.removeEventListener("visibilitychange", visible);
  };
}

export async function checkRoomEntry(room?: string, signal?: AbortSignal): Promise<{ open: boolean; siteOpen: boolean } | undefined> {
  const query = new URLSearchParams({ entry: "1" });
  if (room) query.set("room", room);
  const response = await fetch(`/api/open?${query}`, { cache: "no-store", signal });
  if (!response.ok) return undefined;
  return await response.json() as { open: boolean; siteOpen: boolean };
}
