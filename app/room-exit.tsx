"use client";

import { useEffect, useState } from "react";
import { ConfirmButton } from "./confirm-button";
import { Failure, problemOf, useI18n, type Problem } from "./i18n";
import { isCustomCode, type OwnedRoom } from "./room-shared";

export function LeaveRoomButton({ onLeave, transfersHost }: { onLeave: () => Promise<void>; transfersHost: boolean }) {
  const { t, say } = useI18n();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<Problem>();

  useEffect(() => {
    if (step !== "confirm") return;
    const timer = setTimeout(() => setStep("idle"), 6000);
    return () => clearTimeout(timer);
  }, [step]);

  async function leave() {
    if (step === "busy") return;
    if (step === "idle") { setStep("confirm"); setError(undefined); return; }
    setStep("busy");
    try { await onLeave(); }
    catch (reason) { setError(problemOf(reason, "err.request.failed")); setStep("idle"); }
  }

  return (
    <div className="room-exit">
      <ConfirmButton
        className="leave-room" confirming={step !== "idle"} disabled={step === "busy"}
        label={t("leave.button")} sureLabel={t(step === "busy" ? "leave.busy" : "confirm.sure")}
        aria={t("leave.button")} sureAria={t(transfersHost ? "leave.confirmHost" : "leave.confirm")}
        onClick={() => void leave()}
      />
      {error && <p className="room-error" role="alert">{say(error)}</p>}
    </div>
  );
}

export function OwnedRooms() {
  const { t, tn, say } = useI18n();
  const [rooms, setRooms] = useState<OwnedRoom[]>([]);
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<Problem>();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/rooms", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Failure(await response.json().catch(() => null));
        const { rooms } = await response.json() as { rooms: OwnedRoom[] };
        if (!controller.signal.aborted) setRooms(rooms);
      } catch (reason) {
        if (!controller.signal.aborted) setError(problemOf(reason, "owner.loadError"));
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(undefined), 6000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function close(id: string) {
    if (busy) return;
    setError(undefined);
    setClosed(false);
    if (confirming !== id) { setConfirming(id); return; }
    setConfirming(undefined);
    setBusy(true);
    try {
      const response = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Failure(await response.json().catch(() => null));
      setRooms(current => current.filter(room => room.id !== id));
      setClosed(true);
    } catch (reason) {
      setError(problemOf(reason, "owner.closeError"));
    } finally { setBusy(false); }
  }

  if (!rooms.length && !error) return closed ? <p className="sheet-status" role="status">{t("owner.closed")}</p> : null;
  return (
    <section className="owned-rooms" aria-labelledby="owned-rooms-title">
      <h2 id="owned-rooms-title">{t("owner.rooms")}</h2>
      {rooms.length > 0 && <ul>
        {rooms.map(room => {
          const prefix = room.id.slice(0, 6);
          const custom = isCustomCode(room.id);
          const label = custom ? room.id : `${prefix}…`;
          return (
            <li key={room.id}>
              <div><strong>{t(custom ? "admin.room.code" : "admin.room.private", { id: custom ? room.id : prefix })}</strong>
                <small>{tn("admin.people", room.people)}</small></div>
              <ConfirmButton
                confirming={confirming === room.id} disabled={busy}
                label={t("admin.close")} sureLabel={t("confirm.sure")}
                aria={t("admin.closeAria", { id: label, people: tn("admin.people", room.people) })}
                sureAria={t("admin.closeConfirm", { id: label })}
                onClick={() => void close(room.id)}
              />
            </li>
          );
        })}
      </ul>}
      {closed && <p className="sheet-note" role="status">{t("owner.closed")}</p>}
      {error && <p className="room-error" role="alert">{say(error)}</p>}
    </section>
  );
}
