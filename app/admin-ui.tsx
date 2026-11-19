"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiError } from "./i18n/core";
import { LanguageSwitch, useI18n } from "./i18n";
import type { AdminRoom } from "./room-store";

type AdminState = { open: boolean; lockEnabled: boolean; defaultPassword: boolean; rooms: AdminRoom[] };

async function postJson(path: string, body: object) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * The password form. On the lock screen (`mode="lock"`) a correct password also opens the site for everyone else; on the
 * management page (`mode="admin"`) it only signs in.
 */
export function PasswordGate({ mode }: { mode: "lock" | "admin" }) {
  const { t, fail } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError("");
    try {
      const response = await postJson("/api/admin/login", { password, ...(mode === "lock" ? { open: true } : {}) });
      if (!response.ok) throw new Error(fail(await response.json().catch(() => null) as ApiError | null, "err.request.failed"));
      // The page is rendered on the server according to who is signed in, so load it again.
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("err.request.failed"));
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <section className="gate-card" aria-labelledby="gate-title">
        <span className="room-mark" aria-hidden="true" />
        <h1 id="gate-title">{mode === "lock" ? t("lock.title") : t("admin.title")}</h1>
        <p className="sheet-lede">{mode === "lock" ? t("lock.lede") : t("admin.lede.login")}</p>
        <form className="join-form" onSubmit={submit}>
          <label htmlFor="admin-password">{t("lock.password")}</label>
          <input
            id="admin-password" type="password" autoComplete="current-password" enterKeyHint="go" required
            value={password} onChange={event => { setPassword(event.target.value); setError(""); }}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !password}>
            {busy ? t("lock.busy") : mode === "lock" ? t("lock.submit") : t("admin.signIn")}
          </button>
          {error && <p className="room-error" role="alert">{error}</p>}
        </form>
        {mode === "lock" && <p className="sheet-note">{t("lock.note")}</p>}
        <LanguageSwitch />
      </section>
    </main>
  );
}

/** Rooms, people and the lock, for the signed-in admin. It refreshes by itself every few seconds. */
export function AdminPanel() {
  const { t, tn, fail } = useI18n();
  const [state, setState] = useState<AdminState>();
  const [error, setError] = useState("");
  // A button tapped once asks for a second tap within a few seconds before it does anything that cannot be undone.
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);

  const apply = useCallback(async (response: Response, fallback: "admin.err.load" | "admin.err.action") => {
    const payload = await response.json().catch(() => null);
    if (response.status === 401) { window.location.reload(); return; }
    if (!response.ok) throw new Error(fail(payload as ApiError | null, fallback));
    setState(payload as AdminState);
    setError("");
  }, [fail]);

  const load = useCallback(async () => {
    try { await apply(await fetch("/api/admin", { cache: "no-store" }), "admin.err.load"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("admin.err.load")); }
  }, [apply, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(undefined), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function act(key: string, body: object, needsConfirm: boolean) {
    if (busy) return;
    if (needsConfirm && confirming !== key) { setConfirming(key); return; }
    setConfirming(undefined);
    setBusy(true);
    try { await apply(await postJson("/api/admin", body), "admin.err.action"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("admin.err.action")); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await postJson("/api/admin/logout", {}).catch(() => undefined);
    window.location.reload();
  }

  const people = state?.rooms.reduce((total, room) => total + room.members.length, 0) ?? 0;

  return (
    <main className="admin">
      <header className="admin-head">
        <h1>{t("admin.title")}</h1>
        <div className="admin-head-actions">
          <a className="btn" href="/">{t("admin.back")}</a>
          <button className="btn" type="button" onClick={() => void signOut()}>{t("admin.signOut")}</button>
        </div>
      </header>

      {state?.defaultPassword && <p className="struggle-banner" role="alert">{t("admin.defaultPassword")}</p>}
      {error && <p className="room-error" role="alert">{error}</p>}

      <section className="admin-card" aria-labelledby="admin-site">
        <h2 id="admin-site">{t("admin.site")}</h2>
        {state ? (
          <>
            <p className="admin-state" data-open={state.open}>
              <i aria-hidden="true" />{state.open ? t("admin.state.open") : t("admin.state.locked")}
            </p>
            {state.lockEnabled ? (
              <button className="btn" type="button" disabled={busy} onClick={() => void act("lock", { type: state.open ? "lock" : "open" }, false)}>
                {state.open ? t("admin.lock") : t("admin.open")}
              </button>
            ) : <p className="sheet-note">{t("admin.lockOff")}</p>}
          </>
        ) : <p className="sheet-note" role="status">{t("join.checking")}</p>}
      </section>

      <section className="admin-card" aria-labelledby="admin-rooms">
        <h2 id="admin-rooms">{t("admin.rooms")}</h2>
        {state && state.rooms.length === 0 && <p className="sheet-note">{t("admin.rooms.none")}</p>}
        {state?.rooms.map(room => (
          <article className="admin-room" key={room.id}>
            <div className="admin-room-head">
              <div>
                <strong>{room.custom ? t("admin.room.code", { id: room.id }) : t("admin.room.private", { id: room.id.slice(0, 6) })}</strong>
                <span>
                  {room.video ? t("admin.room.video", { title: room.video }) : t("admin.room.noVideo")} · {room.playing ? t("admin.room.playing") : t("admin.room.paused")} · {tn("admin.people", room.members.length)}
                </span>
              </div>
              <button
                className="btn video-delete" type="button" data-confirm={confirming === `close:${room.id}`} disabled={busy}
                onClick={() => void act(`close:${room.id}`, { type: "closeRoom", roomId: room.id }, true)}
              >
                {confirming === `close:${room.id}` ? t("admin.closeConfirm") : t("admin.close")}
              </button>
            </div>
            <ul className="admin-people">
              {room.members.map(member => (
                <li key={member.id}>
                  <span className="admin-person" data-online={member.online}>
                    <i aria-hidden="true" />
                    {member.name}
                    {member.host && <small>{t("admin.person.host")}</small>}
                    <small>{member.online ? t("admin.person.online") : t("admin.person.away")}</small>
                  </span>
                  <button
                    className="btn video-delete" type="button" data-confirm={confirming === `kick:${member.id}`} disabled={busy}
                    onClick={() => void act(`kick:${member.id}`, { type: "kick", roomId: room.id, memberId: member.id }, true)}
                  >
                    {confirming === `kick:${member.id}` ? t("admin.kickConfirm", { name: member.name }) : t("admin.kick")}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {state && state.rooms.length > 1 && (
          <button
            className="btn video-delete" type="button" data-confirm={confirming === "closeAll"} disabled={busy}
            onClick={() => void act("closeAll", { type: "closeAll" }, true)}
          >
            {confirming === "closeAll" ? t("admin.closeAllConfirm", { count: state.rooms.length }) : t("admin.closeAll", { count: state.rooms.length, people })}
          </button>
        )}
      </section>

      <section className="admin-card" aria-labelledby="admin-videos">
        <h2 id="admin-videos">{t("admin.videos")}</h2>
        <p className="sheet-note">{t("admin.videosNote")}</p>
      </section>
      <LanguageSwitch />
    </main>
  );
}
