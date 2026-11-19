"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ConfirmButton } from "./confirm-button";
import { Failure, LanguageSwitch, problemOf, useI18n, type Problem } from "./i18n";
import type { ApiError } from "./i18n/core";
import { useListPresence } from "./motion";
import { isCustomCode } from "./room-shared";
import type { AdminRoom } from "./room-store";

type AdminState = { open: boolean; lockEnabled: boolean; defaultPassword: boolean; rooms: AdminRoom[] };
const noRooms: AdminRoom[] = [];

/** Up to this many rooms are shown open on the management page; with more, each one is folded to a summary line. */
const foldAfter = 3;

/** How long a button that asked "Sure?" waits for its second tap. */
const confirmMs = 6000;

/** Set (for this browser tab only) when the admin unlocked the site from the lock screen with the default password. */
const defaultPasswordFlag = "screening-default-password";

async function postJson(path: string, body: object) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * A one-time notice for the admin who just unlocked the site with the default password, shown on the join form and in the
 * room until it is dismissed. (On the management page the warning is always there.) The lock screen leaves the flag behind
 * in this tab, because unlocking reloads the page and the login answer would otherwise be forgotten.
 */
export function useDefaultPasswordNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(sessionStorage.getItem(defaultPasswordFlag) === "1"); } catch { /* Storage can be blocked. */ }
  }, []);
  const dismiss = useCallback(() => {
    try { sessionStorage.removeItem(defaultPasswordFlag); } catch { /* Nothing to forget. */ }
    setShow(false);
  }, []);
  return { show, dismiss };
}

export function DefaultPasswordNotice({ onDismiss, floating }: { onDismiss: () => void; floating?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="struggle-banner default-password" data-floating={!!floating} role="alert">
      <p>{t("admin.defaultPasswordNow")}</p>
      <button className="player-dismiss" type="button" onClick={onDismiss}>{t("common.dismiss")}</button>
    </div>
  );
}

/**
 * The password form. On the lock screen (`mode="lock"`) a correct password also opens the site for everyone else; on the
 * management page (`mode="admin"`) it only signs in.
 */
export function PasswordGate({ mode, room }: { mode: "lock" | "admin"; room?: string }) {
  const { t, say } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Kept as data, so switching language rewrites it instead of leaving the old sentence behind.
  const [error, setError] = useState<Problem>();
  // A friend waiting on the lock screen is let in by itself: the page asks every few seconds whether the site has opened.
  const [checking, setChecking] = useState(false);
  const [stillClosed, setStillClosed] = useState(false);
  const passwordField = useRef<HTMLInputElement>(null);

  const check = useCallback(async (manual: boolean) => {
    if (manual) { setChecking(true); setStillClosed(false); }
    // A manual check shows "Checking…" for a moment even when the answer is instant, so pressing it again is seen to do something.
    const minimum = manual ? new Promise(resolve => setTimeout(resolve, 700)) : undefined;
    try {
      const response = await fetch("/api/open", { cache: "no-store" });
      await minimum;
      const answer = await response.json().catch(() => null) as { open?: boolean } | null;
      if (answer?.open) { window.location.reload(); return; }
      if (manual) setStillClosed(true);
    } catch { await minimum; if (manual) setStillClosed(true); }
    finally { if (manual) setChecking(false); }
  }, []);

  useEffect(() => {
    if (mode !== "lock") return;
    const timer = setInterval(() => { if (!document.hidden) void check(false); }, 8000);
    const back = () => { if (!document.hidden) void check(false); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", back); };
  }, [mode, check]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await postJson("/api/admin/login", { password, ...(mode === "lock" ? { open: true } : {}) });
      if (!response.ok) throw new Failure(await response.json().catch(() => null) as ApiError | null, "err.request.failed");
      const result = await response.json().catch(() => null) as { defaultPassword?: boolean } | null;
      // Unlocking reloads the page, so the warning has to survive the reload (for this tab only).
      if (mode === "lock" && result?.defaultPassword) {
        try { sessionStorage.setItem(defaultPasswordFlag, "1"); } catch { /* Storage can be blocked. */ }
      }
      // The page is rendered on the server according to who is signed in, so load it again.
      window.location.reload();
    } catch (reason) {
      setError(problemOf(reason, "err.request.failed"));
      setBusy(false);
    }
  }

  const form = (
    <form className="join-form" onSubmit={submit}>
      <label htmlFor="admin-password">{t("lock.password")}</label>
      <input
        ref={passwordField} id="admin-password" type="password" autoComplete="current-password" enterKeyHint="go" required
        value={password} onChange={event => { setPassword(event.target.value); setError(undefined); }}
      />
      <button className="btn btn-primary" type="submit" disabled={busy || !password}>
        {busy ? t("lock.busy") : mode === "lock" ? t("lock.submit") : t("admin.signIn")}
      </button>
      {error && <p className="room-error" role="alert">{say(error)}</p>}
    </form>
  );

  return (
    <main className="gate">
      <section className="gate-card" aria-labelledby="gate-title">
        <span className="room-mark" aria-hidden="true" />
        <h1 id="gate-title">{mode === "lock" ? t("lock.title") : t("admin.title")}</h1>
        <p className="sheet-lede">{mode === "lock" ? t("lock.lede") : t("admin.lede.login")}</p>
        {mode === "lock" && room && <p className="sheet-lede join-target">{isCustomCode(room) ? t("lock.invited", { code: room }) : t("lock.invitedPrivate")}</p>}
        {mode === "lock" ? (
          <>
            <button className="btn gate-check" type="button" onClick={() => void check(true)} disabled={checking}>{checking ? t("lock.busy") : t("lock.check")}</button>
            <p className="sheet-note gate-status" role="status">{stillClosed ? t("lock.stillClosed") : ""}</p>
            {/* Friends have nothing to enter here; the password is for the admin, so it is folded away. */}
            <details className="fold gate-admin" onToggle={event => { if (event.currentTarget.open) passwordField.current?.focus(); }}>
              <summary><span>{t("lock.admin")}</span></summary>
              <div className="fold-body">
                {form}
                <p className="fold-note">{t("lock.note")}</p>
                <p className="fold-note">{t("lock.note2")}</p>
              </div>
            </details>
          </>
        ) : (
          <>
            {form}
            <p className="sheet-note"><a className="admin-link" href="/">{t("admin.back")}</a></p>
          </>
        )}
        <LanguageSwitch />
      </section>
    </main>
  );
}

/** Rooms, people and the lock, for the signed-in admin. It refreshes by itself every few seconds. */
export function AdminPanel() {
  const { t, tn, say } = useI18n();
  const [state, setState] = useState<AdminState>();
  const [error, setError] = useState<Problem>();
  // A button tapped once asks for a second tap within a few seconds before it does anything that cannot be undone.
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Rooms the admin opened or folded by hand (the rest follow the "few rooms are open" rule).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const apply = useCallback(async (response: Response, fallback: "admin.err.load" | "admin.err.action") => {
    const payload = await response.json().catch(() => null);
    if (response.status === 401) { window.location.reload(); return; }
    if (!response.ok) throw new Failure(payload as ApiError | null, fallback);
    setState(payload as AdminState);
    setError(undefined);
  }, []);

  const load = useCallback(async () => {
    try { await apply(await fetch("/api/admin", { cache: "no-store" }), "admin.err.load"); }
    catch (reason) { setError(problemOf(reason, "admin.err.load")); }
  }, [apply]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 4000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(undefined), confirmMs);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function act(key: string, body: object, needsConfirm: boolean) {
    if (busy) return;
    if (needsConfirm && confirming !== key) { setConfirming(key); return; }
    setConfirming(undefined);
    setBusy(true);
    try { await apply(await postJson("/api/admin", body), "admin.err.action"); }
    catch (reason) { setError(problemOf(reason, "admin.err.action")); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await postJson("/api/admin/logout", {}).catch(() => undefined);
    try { sessionStorage.removeItem(defaultPasswordFlag); } catch { /* Nothing to forget. */ }
    window.location.reload();
  }

  const people = state?.rooms.reduce((total, room) => total + room.members.length, 0) ?? 0;
  // A room that was closed fades out where it was, and so does a person who was removed.
  const roomRows = useListPresence(state?.rooms ?? noRooms, room => room.id);

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
      {error && <p className="room-error" role="alert">{say(error)}</p>}

      <section className="admin-card" aria-labelledby="admin-site">
        <h2 id="admin-site">{t("admin.site")}</h2>
        {state ? (
          <>
            {/* A live region: when the site opens or locks (here or from another device) the new state is read out in full. */}
            <div role="status">
              <p className="admin-state" data-open={state.open}>
                <i aria-hidden="true" />{state.open ? t("admin.state.open") : t("admin.state.locked")}
              </p>
            </div>
            {state.lockEnabled ? (
              <>
                <p className="sheet-note">{state.open ? t("admin.note.open") : t("admin.note.locked")}</p>
                <ConfirmButton
                  className="admin-lock" confirming={confirming === "lock"} disabled={busy}
                  label={state.open ? t("admin.lock") : t("admin.open")} sureLabel={t("confirm.sure")}
                  aria={state.open ? t("admin.lock") : t("admin.open")} sureAria={state.open ? t("admin.lockConfirm") : t("admin.openConfirm")}
                  onClick={() => void act("lock", { type: state.open ? "lock" : "open" }, true)}
                />
              </>
            ) : <p className="sheet-note">{t("admin.lockOff")}</p>}
          </>
        ) : <p className="sheet-note" role="status">{t("admin.loading")}</p>}
      </section>

      <section className="admin-card" aria-labelledby="admin-rooms">
        {/* "Close all" sits up here with the title (which stays in view while scrolling a long list), not at the bottom of it. */}
        <div className="admin-card-head">
          <h2 id="admin-rooms">{t("admin.rooms")}</h2>
          {state && state.rooms.length > 1 && (
            <ConfirmButton
              className="admin-close-all" confirming={confirming === "closeAll"} disabled={busy}
              label={t("admin.closeAll", { count: state.rooms.length, people })} sureLabel={t("admin.closeAllSure", { count: state.rooms.length })}
              aria={t("admin.closeAll", { count: state.rooms.length, people })} sureAria={t("admin.closeAllConfirm", { count: state.rooms.length })}
              onClick={() => void act("closeAll", { type: "closeAll" }, true)}
            />
          )}
        </div>
        {state && state.rooms.length === 0 && <p className="sheet-note">{t("admin.rooms.none")}</p>}
        {roomRows.map(({ item: room, key, leaving }) => {
          const label = room.custom ? room.id : `${room.id.slice(0, 6)}…`;
          // A few rooms are shown open. With many, each is a one-line summary that opens to its people.
          const open = expanded[room.id] ?? (state?.rooms.length ?? 0) <= foldAfter;
          return (
            <article className="admin-room" key={key} data-leaving={leaving} inert={leaving}>
              <div className="admin-room-head">
                <button
                  className="admin-room-toggle" type="button" aria-expanded={open} aria-controls={`room-${room.id}`}
                  onClick={() => setExpanded(current => ({ ...current, [room.id]: !open }))}
                >
                  <strong>{room.custom ? t("admin.room.code", { id: room.id }) : t("admin.room.private", { id: room.id.slice(0, 6) })}</strong>
                  <span>
                    {tn("admin.people", room.members.length)} · {room.playing ? t("admin.room.playing") : t("admin.room.paused")} · {room.video ? t("admin.room.video", { title: room.video }) : t("admin.room.noVideo")}
                  </span>
                </button>
                <ConfirmButton
                  confirming={confirming === `close:${room.id}`} disabled={busy}
                  label={t("admin.close")} sureLabel={t("confirm.sure")}
                  aria={t("admin.closeAria", { id: label, people: tn("admin.people", room.members.length) })} sureAria={t("admin.closeConfirm", { id: label })}
                  onClick={() => void act(`close:${room.id}`, { type: "closeRoom", roomId: room.id }, true)}
                />
              </div>
              <div id={`room-${room.id}`} hidden={!open}>
                <AdminPeople room={room} confirming={confirming} busy={busy} act={act} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="admin-card" aria-labelledby="admin-videos">
        <h2 id="admin-videos">{t("admin.videos")}</h2>
        <p className="sheet-note">{t("admin.videosNote")}</p>
        <ol className="admin-steps">
          <li>{t("admin.videos.step1")}</li>
          <li>{t("admin.videos.step2")}</li>
          <li>{t("admin.videos.step3")}</li>
        </ol>
        <a className="btn btn-primary admin-cta" href="/">{t("admin.videos.start")}</a>
      </section>
      <LanguageSwitch />
    </main>
  );
}

/** The people in one room, each with a remove button. Someone who was removed fades out where they were. */
function AdminPeople({ room, confirming, busy, act }: {
  room: AdminRoom;
  confirming?: string;
  busy: boolean;
  act: (key: string, body: object, needsConfirm: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const rows = useListPresence(room.members, member => member.id);
  return (
    <ul className="admin-people">
      {rows.map(({ item: member, key, leaving }) => (
        <li key={key} data-leaving={leaving} inert={leaving} data-online={member.online}>
          <i className="admin-dot" aria-hidden="true" />
          <span className="admin-name" title={member.name}>{member.name}</span>
          <span className="admin-chips">
            {member.host && <small>{t("admin.person.host")}</small>}
            <small>{member.online ? t("admin.person.online") : t("admin.person.away")}</small>
          </span>
          <ConfirmButton
            confirming={confirming === `kick:${member.id}`} disabled={busy}
            label={t("admin.kick")} sureLabel={t("confirm.sure")}
            aria={t("admin.kickAria", { name: member.name })} sureAria={t("admin.kickConfirm", { name: member.name })}
            onClick={() => void act(`kick:${member.id}`, { type: "kick", roomId: room.id, memberId: member.id }, true)}
          />
        </li>
      ))}
    </ul>
  );
}
