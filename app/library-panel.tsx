"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { captionLabel, commonLanguages as subtitleLanguages } from "./i18n/caption-label";
import { formatNumber } from "./i18n/format";
import { ConfirmButton } from "./confirm-button";
import { Failure, problemOf, useI18n, type Problem } from "./i18n";
import { useListPresence } from "./motion";
import { watchSiteAccess } from "./site-access-client";
import { rovingRef } from "./roving";
import type { ApiError } from "./i18n/core";
import type { DeviceProfile } from "./device";
import { formatDuration, formatSize, resolutionLabel } from "./media-format";
import type { LibraryItem, MediaInfo, RoomCommand, RoomSnapshot } from "./room-shared";
import { fixedHeight, type Quality } from "./use-playback-quality";
import { FindDetails, useMediaMeta } from "./video-meta";

type Upload = { id: number; name: string; percent: number; error?: Problem };
type Storage = { used: number; quota: number; pending: number; free: number };

/** How long a delete button that asked "Sure?" waits for its second tap. */
const confirmMs = 6000;

function putFile(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => {
      if (request.status < 300) return resolve();
      let payload: ApiError | null = null;
      try { payload = JSON.parse(request.responseText) as ApiError; } catch { /* Not a JSON answer: the generic text is used. */ }
      reject(new Failure(payload, "upload.err.failed"));
    };
    request.onerror = () => reject(new Failure(null, "upload.err.dropped"));
    request.send(file);
  });
}

type QualityProps = { quality: Quality; onQuality: (quality: Quality) => void; profile: DeviceProfile };

/**
 * One of the tools under the video list: a fold that is closed until asked for, so the list of videos (the point of this
 * tab) comes first and the rarely used settings do not push it off the screen.
 */
function Fold({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="fold">
      <summary><span>{title}</span>{hint && <small>{hint}</small>}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** Each person's own playback setting. Data saver keeps adaptive video small, for weak phones and slow networks. */
function QualityControl({ quality, onQuality, profile, media }: QualityProps & { media: MediaInfo | null }) {
  const { t } = useI18n();
  const adaptive = media?.kind === "hls";
  const fixed = fixedHeight(quality);
  const current = fixed ? `${fixed}p` : quality === "saver" ? t("quality.saver") : t("quality.auto");
  return (
    <Fold title={t("qc.legend")} hint={current}>
      <div className="quality-choice" role="radiogroup" aria-label={t("qc.group")} ref={rovingRef}>
        <button type="button" role="radio" aria-checked={quality === "auto"} onClick={() => onQuality("auto")}>{t("quality.auto")}</button>
        <button type="button" role="radio" aria-checked={quality === "saver"} onClick={() => onQuality("saver")}>{t("quality.saver")}</button>
      </div>
      <p className="fold-note">
        {!adaptive && media ? t("qc.single")
          : fixed ? t("qc.fixed", { height: fixed })
          : quality === "saver" ? t("qc.saver")
          : t("qc.auto")}
        {quality === "saver" && profile.reasons.length > 0 && t("qc.because", { reasons: profile.reasons.map(reason => t(reason.key, reason.params)).join("; ") })}
      </p>
    </Fold>
  );
}


/** The host adds a subtitle file (.srt or .vtt) to the video that is playing. Everyone can then pick it in their player. */
function AddSubtitles({ roomId, media }: { roomId: string; media: MediaInfo }) {
  const { t, say, locale } = useI18n();
  const [lang, setLang] = useState("en");
  const [custom, setCustom] = useState("");
  // The outcome is kept as data (not as a finished sentence), so switching language rewrites it.
  const [status, setStatus] = useState<{ busy?: boolean; ok?: boolean; problem: Problem }>();
  const picker = useRef<HTMLInputElement>(null);

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const code = lang === "other" ? custom.trim() : lang;
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) {
      setStatus({ problem: { key: "subs.add.errCode" } });
      return;
    }
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setStatus({ problem: { key: "subs.add.errFile" } });
      return;
    }
    setStatus({ busy: true, problem: { key: "subs.add.busy", params: { name: file.name } } });
    try {
      await putFile(`/api/rooms/${roomId}/library/upload?name=${encodeURIComponent(file.name)}&media=${media.id}&lang=${encodeURIComponent(code)}`, file, () => {});
      setStatus({ ok: true, problem: { key: "subs.add.ok" } });
    } catch (reason) {
      setStatus({ problem: problemOf(reason, "subs.add.fail") });
    }
  }

  return (
    <Fold title={t("subs.add.legend")}>
      <p className="fold-note">{media.captions.length ? media.captions.map(caption => captionLabel(caption.lang, caption.label, locale, t)).join(", ") : t("subs.add.none")}</p>
      <div className="subs-form">
        <select aria-label={t("subs.add.language")} value={lang} onChange={event => setLang(event.target.value)}>
          {subtitleLanguages.map(code => <option key={code} value={code}>{captionLabel(code, code, locale, t)}</option>)}
          <option value="other">{t("subs.add.other")}</option>
        </select>
        {lang === "other" && <input aria-label={t("subs.add.code")} placeholder={t("subs.add.placeholder")} maxLength={11} value={custom} onChange={event => setCustom(event.target.value)} />}
        <button className="btn" type="button" onClick={() => picker.current?.click()} disabled={status?.busy}>{t("subs.add.button")}</button>
        <input ref={picker} type="file" hidden accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={add} />
      </div>
      {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "subs-ok" : status.busy ? undefined : "room-error"}>{say(status.problem)}</p>}
    </Fold>
  );
}

/** The host's lookup of the playing video's details on the web (title, synopsis, cast), shown to everyone in the details sheet. */
function DescribeVideo({ roomId, media, admin }: { roomId: string; media: MediaInfo; admin: boolean }) {
  const { t } = useI18n();
  const details = useMediaMeta(roomId, media);
  if (details.canLookUp === undefined) return null;
  return (
    <Fold title={t("describe.legend")}>
      <p className="fold-note">{details.meta ? t("describe.done", { title: `${details.meta.title ?? media.title}${details.meta.year ? ` (${details.meta.year})` : ""}` }) : t("describe.none")}</p>
      <FindDetails roomId={roomId} media={media} canLookUp={details.canLookUp} model={details.model} described={!!details.meta} admin={admin} />
    </Fold>
  );
}

export function LibraryPanel({ room, isHost, send, quality, onQuality, profile }: {
  room: RoomSnapshot;
  isHost: boolean;
  send: (command: RoomCommand) => Promise<void>;
} & QualityProps) {
  const { t, tn, fail, say, locale } = useI18n();
  const size = (bytes: number) => formatSize(bytes, locale);
  const [items, setItems] = useState<LibraryItem[]>();
  const [problems, setProblems] = useState<{ file: string; message: string; code?: string }[]>([]);
  const [folder, setFolder] = useState<string>();
  const [limits, setLimits] = useState<{ maxBytes: number; extensions: string[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Problem>();
  const [uploads, setUploads] = useState<Upload[]>([]);
  // A finished upload fades out of the list instead of vanishing.
  const uploadRows = useListPresence(uploads, upload => String(upload.id));
  const [pending, setPending] = useState<string>();
  const [storage, setStorage] = useState<Storage>();
  // Uploading and deleting need the admin password (signed in on the management page), not just being the host.
  const [admin, setAdmin] = useState(false);
  // A video the host tapped Delete on once. A second tap within a few seconds confirms.
  const [confirming, setConfirming] = useState<string>();
  const picker = useRef<HTMLInputElement>(null);
  const uploadCount = useRef(0);
  const refreshNumber = useRef(0);
  const roomId = room.id;

  const refresh = useCallback(async (rescan: boolean) => {
    const current = ++refreshNumber.current;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/rooms/${roomId}/library${rescan ? "?rescan=1" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (current !== refreshNumber.current) return;
      if (!response.ok) throw new Failure(payload, "lib.err.load");
      setItems(payload.items);
      setAdmin(!!payload.admin);
      setProblems(payload.errors ?? []);
      setFolder(payload.folder);
      setStorage(payload.storage);
      setLimits({ maxBytes: payload.maxUploadBytes, extensions: payload.allowedUploads });
    } catch (reason) {
      if (current === refreshNumber.current) setError(problemOf(reason, "lib.err.load"));
    } finally {
      if (current === refreshNumber.current) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { if (isHost) void refresh(false); }, [isHost, refresh]);
  useEffect(() => {
    if (!isHost) return;
    return watchSiteAccess(() => void refresh(false));
  }, [isHost, refresh]);

  async function choose(item: LibraryItem) {
    if (pending || item.id === room.media?.id) return;
    setPending(item.id);
    setError(undefined);
    try { await send({ type: "load", mediaId: item.id }); }
    catch (reason) { setError(problemOf(reason, "lib.err.switch")); }
    finally { setPending(undefined); }
  }

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(undefined), confirmMs);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function remove(item: LibraryItem) {
    if (confirming !== item.id) { setConfirming(item.id); return; }
    setConfirming(undefined);
    setPending(item.id);
    setError(undefined);
    try {
      const response = await fetch(`/api/rooms/${roomId}/library?mediaId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Failure(payload, "lib.err.delete");
      await refresh(false);
    } catch (reason) {
      setError(problemOf(reason, "lib.err.delete"));
    } finally {
      setPending(undefined);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    for (const file of files) {
      const id = ++uploadCount.current;
      // Catch obvious problems here, so the server never has to turn a huge upload away mid-transfer.
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const refusal: Problem | undefined = limits && !limits.extensions.includes(extension) ? extension ? { key: "lib.refuse.type", params: { ext: extension } } : { key: "lib.refuse.typeNone" }
        : limits && file.size > limits.maxBytes ? { key: "lib.refuse.limit", params: { limit: size(limits.maxBytes) } }
        : storage && file.size > storage.free ? { key: "lib.refuse.space", params: { free: size(storage.free), quota: size(storage.quota), size: size(file.size) } } : undefined;
      if (refusal) {
        setUploads(list => [...list, { id, name: file.name, percent: 0, error: refusal }]);
        continue;
      }
      setUploads(list => [...list, { id, name: file.name, percent: 0 }]);
      const update = (change: Partial<Upload>) => setUploads(list => list.map(item => item.id === id ? { ...item, ...change } : item));
      try {
        await putFile(`/api/rooms/${roomId}/library/upload?name=${encodeURIComponent(file.name)}`, file, percent => update({ percent }));
        setUploads(list => list.filter(item => item.id !== id));
      } catch (reason) {
        update({ error: problemOf(reason, "upload.err.failed") });
      }
    }
    void refresh(true);
  }

  if (!isHost) return <CurrentVideo media={room.media} {...{ quality, onQuality, profile }} />;

  const people = Math.max(1, room.members.length);
  const struggling = room.members.filter(member => member.health === "struggling");

  return (
    <div className="pane pane-scroll" id="pane-video" role="tabpanel" aria-labelledby="tab-video">
      {struggling.length > 0 && (
        <p className="struggle-banner" role="status">
          {tn("lib.struggling", struggling.length, { name: struggling[0].name, rest: struggling.length - 1 })}
        </p>
      )}

      {/* The videos first: choosing one is what this tab is for. The settings that go with it are folded away below. */}
      <div className="library-actions">
        {admin && <button className="btn btn-primary" type="button" onClick={() => picker.current?.click()}>{t("lib.upload")}</button>}
        <button className="btn" type="button" onClick={() => void refresh(true)} disabled={loading}>{loading ? t("lib.scanning") : t("lib.rescan")}</button>
        <input ref={picker} type="file" hidden multiple accept="video/*,.mkv,.srt,.vtt,image/*" onChange={upload} />
      </div>

      {!admin && items && (
        <p className="sheet-note">{t("lib.adminOnly")} <a href="/admin" target="_blank" rel="noopener">{t("admin.openPage")}</a></p>
      )}

      {uploadRows.map(({ item: upload, key, leaving }) => (
        <div className="upload" key={key} data-error={!!upload.error} data-leaving={leaving} inert={leaving}>
          <span>{upload.name}</span>
          {upload.error ? <em role="alert">{say(upload.error)}</em> : (
            // A bar that grows with a transform (not its width), so the browser can animate it without re-laying-out the page.
            <div className="upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.percent} aria-label={t("lib.uploading", { name: upload.name })}>
              <i style={{ transform: `scaleX(${upload.percent / 100})` }} />
            </div>
          )}
        </div>
      ))}

      {error && <p className="room-error" role="alert">{say(error)}</p>}
      {problems.map(problem => <p className="room-error" key={problem.file}>{problem.file}: {fail(problem as ApiError, "scan.generic")}</p>)}

      {items && !items.length && !loading && (
        <p className="sheet-note">
          {t("lib.emptyBefore")}{folder ? <code>{folder}</code> : t("lib.mediaFolder")}{t("lib.emptyAfter")}
        </p>
      )}

      <ul className="video-list">
        {items?.map(item => {
          const current = item.id === room.media?.id;
          const total = Math.round(item.mbps * people * 10) / 10;
          const notesText = (video: LibraryItem) => video.notes.map(note => t(note.key, note.params)).join(" ");
          // A file whose bitrate is not known would read "≈ 0.0 Mb/s": say nothing instead.
          const bandwidth = item.mbps >= 0.05 ? tn("lib.bandwidth", people, { rate: formatNumber(locale, item.mbps, 1), total: formatNumber(locale, total, 1) }) : "";
          const extra = [bandwidth, item.captions.length > 0 ? tn("lib.subs", item.captions.length) : ""].filter(Boolean).join(" · ");
          return (
            <li key={item.id}>
              <button type="button" className="video-item" data-current={current} data-compat={item.compat} onClick={() => void choose(item)} disabled={!!pending}>
                <span className="video-title">{item.title}{current && <small>{t("lib.nowPlaying")}</small>}</span>
                <span className="video-meta">
                  {[formatDuration(item.duration), resolutionLabel(item.height), item.vcodec.toUpperCase(), size(item.size)].filter(Boolean).join(" · ")}
                </span>
                {extra && <span className="video-meta">{extra}</span>}
                <span className="compat" data-compat={item.compat} title={notesText(item)}>{t(`compat.${item.compat}` as const)}</span>
                {(item.compat !== "universal" || !item.faststart) && <span className="video-note">{notesText(item)}</span>}
              </button>
              {/* The video that is playing cannot be deleted, and its "Now playing" tag already says it: no disabled button. */}
              {admin && !current && (
                <ConfirmButton
                  confirming={confirming === item.id} disabled={!!pending}
                  label={t("lib.delete", { size: size(item.size) })} sureLabel={t("lib.deleteSure", { size: size(item.size) })}
                  aria={t("lib.deleteAria", { title: item.title, size: size(item.size) })}
                  sureAria={t("lib.deleteConfirm", { title: item.title, size: size(item.size) })}
                  title={t("lib.deleteTitle", { size: size(item.size) })}
                  onClick={() => void remove(item)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {/* Only worth saying when there is another video to switch to. */}
      {items && items.length > 1 && <p className="sheet-note">{t("lib.switchNote")}</p>}

      {storage && (
        <div className="storage" role="group" aria-label={t("storage.group")}>
          <div className="storage-bar" role="img" aria-label={t("storage.bar", { used: size(storage.used), quota: size(storage.quota) })}>
            <i style={{ transform: `scaleX(${Math.min(100, Math.round(((storage.used + storage.pending) / Math.max(1, storage.quota)) * 100)) / 100})` }} data-full={storage.free < storage.quota * 0.05} />
          </div>
          <p>
            <strong>{size(storage.used)}</strong>{t("storage.ofUsed", { quota: size(storage.quota) })}
            {storage.free > 0 ? t("storage.free", { free: size(storage.free) }) : t("storage.full")}
          </p>
          {storage.free === 0 && <p className="room-error">{t("storage.fullWarn")}</p>}
        </div>
      )}

      <QualityControl {...{ quality, onQuality, profile }} media={room.media} />
      {room.media && admin && <AddSubtitles roomId={room.id} media={room.media} />}
      {room.media && <DescribeVideo roomId={room.id} media={room.media} admin={admin} />}
    </div>
  );
}

function CurrentVideo({ media, quality, onQuality, profile }: { media: MediaInfo | null } & QualityProps) {
  const { t } = useI18n();
  return (
    <div className="pane pane-scroll" id="pane-video" role="tabpanel" aria-labelledby="tab-video">
      {media ? (
        <div className="video-item" data-current="true" data-compat={media.compat}>
          <span className="video-title">{media.title}<small>{t("lib.nowPlaying")}</small></span>
          <span className="video-meta">{[formatDuration(media.duration), resolutionLabel(media.height)].filter(Boolean).join(" · ")}</span>
        </div>
      ) : <p className="sheet-note">{t("stage.waitingHost")}</p>}
      <p className="sheet-note">{t("lib.hostNote")}</p>
      <QualityControl {...{ quality, onQuality, profile }} media={media} />
    </div>
  );
}
