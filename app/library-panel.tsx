"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { captionLabel, commonLanguages as subtitleLanguages } from "./i18n/caption-label";
import { formatNumber } from "./i18n/format";
import { useI18n } from "./i18n";
import type { ApiError } from "./i18n/core";
import type { DeviceProfile } from "./device";
import { formatDuration, formatSize, resolutionLabel } from "./media-format";
import type { LibraryItem, MediaInfo, RoomCommand, RoomSnapshot } from "./room-shared";
import { fixedHeight, type Quality } from "./use-playback-quality";
import { FindDetails, useMediaMeta } from "./video-meta";

type Upload = { id: number; name: string; percent: number; error?: string };
type Storage = { used: number; quota: number; pending: number; free: number };

function putFile(url: string, file: File, onProgress: (percent: number) => void, text: { failed: string; dropped: string; describe: (payload: ApiError | null) => string }) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => {
      if (request.status < 300) return resolve();
      try { reject(new Error(text.describe(JSON.parse(request.responseText) as ApiError))); } catch { reject(new Error(text.failed)); }
    };
    request.onerror = () => reject(new Error(text.dropped));
    request.send(file);
  });
}

type QualityProps = { quality: Quality; onQuality: (quality: Quality) => void; profile: DeviceProfile };

/** Each person's own playback setting. Data saver keeps adaptive video small, for weak phones and slow networks. */
function QualityControl({ quality, onQuality, profile, media }: QualityProps & { media: MediaInfo | null }) {
  const { t } = useI18n();
  const adaptive = media?.kind === "hls";
  return (
    <fieldset className="quality">
      <legend>{t("qc.legend")}</legend>
      <div className="quality-choice" role="radiogroup" aria-label={t("qc.group")}>
        <button type="button" role="radio" aria-checked={quality === "auto"} onClick={() => onQuality("auto")}>{t("quality.auto")}</button>
        <button type="button" role="radio" aria-checked={quality === "saver"} onClick={() => onQuality("saver")}>{t("quality.saver")}</button>
      </div>
      <p>
        {!adaptive && media ? t("qc.single")
          : fixedHeight(quality) ? t("qc.fixed", { height: fixedHeight(quality)! })
          : quality === "saver" ? t("qc.saver")
          : t("qc.auto")}
        {quality === "saver" && profile.reasons.length > 0 && t("qc.because", { reasons: profile.reasons.map(reason => t(reason.key, reason.params)).join("; ") })}
      </p>
    </fieldset>
  );
}


/** The host adds a subtitle file (.srt or .vtt) to the video that is playing. Everyone can then pick it in their player. */
function AddSubtitles({ roomId, media }: { roomId: string; media: MediaInfo }) {
  const { t, fail, locale } = useI18n();
  const [lang, setLang] = useState("en");
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<{ busy?: boolean; ok?: boolean; text: string }>();
  const picker = useRef<HTMLInputElement>(null);

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const code = lang === "other" ? custom.trim() : lang;
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) {
      setStatus({ text: t("subs.add.errCode") });
      return;
    }
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setStatus({ text: t("subs.add.errFile") });
      return;
    }
    setStatus({ busy: true, text: t("subs.add.busy", { name: file.name }) });
    try {
      await putFile(`/api/rooms/${roomId}/library/upload?name=${encodeURIComponent(file.name)}&media=${media.id}&lang=${encodeURIComponent(code)}`, file, () => {}, { failed: t("upload.err.failed"), dropped: t("upload.err.dropped"), describe: payload => fail(payload, "upload.err.failed") });
      setStatus({ ok: true, text: t("subs.add.ok") });
    } catch (reason) {
      setStatus({ text: reason instanceof Error ? reason.message : t("subs.add.fail") });
    }
  }

  return (
    <fieldset className="quality subs-add">
      <legend>{t("subs.add.legend")}</legend>
      <p>{media.captions.length ? media.captions.map(caption => captionLabel(caption.lang, caption.label, locale, t)).join(", ") : t("subs.add.none")}</p>
      <div className="subs-form">
        <select aria-label={t("subs.add.language")} value={lang} onChange={event => setLang(event.target.value)}>
          {subtitleLanguages.map(code => <option key={code} value={code}>{captionLabel(code, code, locale, t)}</option>)}
          <option value="other">{t("subs.add.other")}</option>
        </select>
        {lang === "other" && <input aria-label={t("subs.add.code")} placeholder={t("subs.add.placeholder")} maxLength={11} value={custom} onChange={event => setCustom(event.target.value)} />}
        <button className="btn" type="button" onClick={() => picker.current?.click()} disabled={status?.busy}>{t("subs.add.button")}</button>
        <input ref={picker} type="file" hidden accept=".srt,.vtt,text/vtt,application/x-subrip" onChange={add} />
      </div>
      {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "subs-ok" : status.busy ? undefined : "room-error"}>{status.text}</p>}
    </fieldset>
  );
}

/** The host's lookup of the playing video's details on the web (title, synopsis, cast), shown to everyone in the details sheet. */
function DescribeVideo({ roomId, media }: { roomId: string; media: MediaInfo }) {
  const { t } = useI18n();
  const details = useMediaMeta(roomId, media);
  if (details.canLookUp === undefined) return null;
  return (
    <fieldset className="quality">
      <legend>{t("describe.legend")}</legend>
      <p>{details.meta ? t("describe.done", { title: `${details.meta.title ?? media.title}${details.meta.year ? ` (${details.meta.year})` : ""}` }) : t("describe.none")}</p>
      <FindDetails roomId={roomId} media={media} canLookUp={details.canLookUp} model={details.model} described={!!details.meta} />
    </fieldset>
  );
}

export function LibraryPanel({ room, isHost, send, quality, onQuality, profile }: {
  room: RoomSnapshot;
  isHost: boolean;
  send: (command: RoomCommand) => Promise<void>;
} & QualityProps) {
  const { t, tn, fail, locale } = useI18n();
  const size = (bytes: number) => formatSize(bytes, locale);
  const [items, setItems] = useState<LibraryItem[]>();
  const [problems, setProblems] = useState<{ file: string; message: string; code?: string }[]>([]);
  const [folder, setFolder] = useState<string>();
  const [limits, setLimits] = useState<{ maxBytes: number; extensions: string[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [pending, setPending] = useState<string>();
  const [storage, setStorage] = useState<Storage>();
  // A video the host tapped Delete on once. A second tap within a few seconds confirms.
  const [confirming, setConfirming] = useState<string>();
  const picker = useRef<HTMLInputElement>(null);
  const uploadCount = useRef(0);
  const roomId = room.id;

  const refresh = useCallback(async (rescan: boolean) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/library${rescan ? "?rescan=1" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(fail(payload, "lib.err.load"));
      setItems(payload.items);
      setProblems(payload.errors ?? []);
      setFolder(payload.folder);
      setStorage(payload.storage);
      setLimits({ maxBytes: payload.maxUploadBytes, extensions: payload.allowedUploads });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("lib.err.load"));
    } finally {
      setLoading(false);
    }
  }, [roomId, fail, t]);

  useEffect(() => { if (isHost) void refresh(false); }, [isHost, refresh]);

  async function choose(item: LibraryItem) {
    if (pending || item.id === room.media?.id) return;
    setPending(item.id);
    setError("");
    try { await send({ type: "load", mediaId: item.id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("lib.err.switch")); }
    finally { setPending(undefined); }
  }

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(undefined), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function remove(item: LibraryItem) {
    if (confirming !== item.id) { setConfirming(item.id); return; }
    setConfirming(undefined);
    setPending(item.id);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/library?mediaId=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(fail(payload, "lib.err.delete"));
      await refresh(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("lib.err.delete"));
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
      const refusal = limits && !limits.extensions.includes(extension) ? t("lib.refuse.type", { ext: extension || t("lib.fileType") })
        : limits && file.size > limits.maxBytes ? t("lib.refuse.limit", { limit: size(limits.maxBytes) })
        : storage && file.size > storage.free ? t("lib.refuse.space", { free: size(storage.free), quota: size(storage.quota), size: size(file.size) }) : "";
      if (refusal) {
        setUploads(list => [...list, { id, name: file.name, percent: 0, error: refusal }]);
        continue;
      }
      setUploads(list => [...list, { id, name: file.name, percent: 0 }]);
      const update = (change: Partial<Upload>) => setUploads(list => list.map(item => item.id === id ? { ...item, ...change } : item));
      try {
        await putFile(`/api/rooms/${roomId}/library/upload?name=${encodeURIComponent(file.name)}`, file, percent => update({ percent }), { failed: t("upload.err.failed"), dropped: t("upload.err.dropped"), describe: payload => fail(payload, "upload.err.failed") });
        setUploads(list => list.filter(item => item.id !== id));
      } catch (reason) {
        update({ error: reason instanceof Error ? reason.message : t("upload.err.failed") });
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
      <QualityControl {...{ quality, onQuality, profile }} media={room.media} />
      {room.media && <AddSubtitles roomId={room.id} media={room.media} />}
      {room.media && <DescribeVideo roomId={room.id} media={room.media} />}
      {storage && (
        <div className="storage" role="group" aria-label={t("storage.group")}>
          <div className="storage-bar" role="img" aria-label={t("storage.bar", { used: size(storage.used), quota: size(storage.quota) })}>
            <i style={{ inlineSize: `${Math.min(100, Math.round(((storage.used + storage.pending) / Math.max(1, storage.quota)) * 100))}%` }} data-full={storage.free < storage.quota * 0.05} />
          </div>
          <p>
            <strong>{size(storage.used)}</strong>{t("storage.ofUsed", { quota: size(storage.quota) })}
            {storage.free > 0 ? t("storage.free", { free: size(storage.free) }) : t("storage.full")}
          </p>
          {storage.free === 0 && <p className="room-error">{t("storage.fullWarn")}</p>}
        </div>
      )}
      <div className="library-actions">
        <button className="btn btn-primary" type="button" onClick={() => picker.current?.click()}>{t("lib.upload")}</button>
        <button className="btn" type="button" onClick={() => void refresh(true)} disabled={loading}>{loading ? t("lib.scanning") : t("lib.rescan")}</button>
        <input ref={picker} type="file" hidden multiple accept="video/*,.mkv,.srt,.vtt,image/*" onChange={upload} />
      </div>

      {uploads.map(upload => (
        <div className="upload" key={upload.id} data-error={!!upload.error}>
          <span>{upload.name}</span>
          {upload.error ? <em role="alert">{upload.error}</em> : <progress max={100} value={upload.percent} aria-label={t("lib.uploading", { name: upload.name })} />}
        </div>
      ))}

      {error && <p className="room-error" role="alert">{error}</p>}
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
          return (
            <li key={item.id}>
              <button type="button" className="video-item" data-current={current} data-compat={item.compat} onClick={() => void choose(item)} disabled={!!pending}>
                <span className="video-title">{item.title}{current && <small>{t("lib.nowPlaying")}</small>}</span>
                <span className="video-meta">
                  {[formatDuration(item.duration), resolutionLabel(item.height), item.vcodec.toUpperCase(), size(item.size)].filter(Boolean).join(" · ")}
                </span>
                <span className="video-meta">
                  {tn("lib.bandwidth", people, { rate: formatNumber(locale, item.mbps, 1), total: formatNumber(locale, total, 1) })}
                  {item.captions.length > 0 && ` · ${tn("lib.subs", item.captions.length)}`}
                </span>
                <span className="compat" data-compat={item.compat} title={notesText(item)}>{t(`compat.${item.compat}` as const)}</span>
                {(item.compat !== "universal" || !item.faststart) && <span className="video-note">{notesText(item)}</span>}
              </button>
              <button
                className="btn video-delete" type="button" data-confirm={confirming === item.id}
                onClick={() => void remove(item)} disabled={current || !!pending}
                title={current ? t("lib.deleteTitleBusy") : t("lib.deleteTitle", { size: size(item.size) })}
              >
                {confirming === item.id ? t("lib.deleteConfirm", { size: size(item.size) }) : current ? t("lib.deletePlaying") : t("lib.delete", { size: size(item.size) })}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="sheet-note">{t("lib.switchNote")}</p>
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
      <QualityControl {...{ quality, onQuality, profile }} media={media} />
      <p className="sheet-note">{t("lib.hostNote")}</p>
    </div>
  );
}
