"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { captionLabel } from "./i18n/caption-label";
import { formatNumber } from "./i18n/format";
import { useI18n, LanguageSwitch } from "./i18n";
import { audioCodecLabel, containerLabel, formatBitrate, formatDuration, formatSize, resolutionLabel, videoCodecLabel } from "./media-format";
import type { MediaInfo } from "./room-shared";
import { FindDetails, MetaView, useMediaMeta } from "./video-meta";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

/**
 * Everything known about the video, as a bottom sheet made for a phone: big touch targets, scrolls inside itself,
 * closes with the button, a tap outside, or the back gesture/Escape. A native <dialog> provides the focus handling.
 */
export function VideoDetails({ media, posterUrl, room, roomId, onClose }: {
  media: MediaInfo;
  posterUrl?: string;
  room: { code?: string; hostName: string; people: number };
  roomId: string;
  onClose: () => void;
}) {
  const { t, tn, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const details = useMediaMeta(roomId, media);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  // Close through the dialog itself: the browser then puts focus back on what opened it. (Unmounting an open dialog would drop focus on the page.)
  const dismiss = () => { if (dialog.current?.open) dialog.current.close(); onClose(); };

  const heightLabel = resolutionLabel(media.height);
  const dimensions = media.width && media.height ? `${media.width} × ${media.height}${heightLabel ? ` (${heightLabel})` : ""}` : t("common.unknown");
  const note = media.notes.map(entry => t(entry.key, entry.params)).join(" ");

  return (
    <dialog
      // A "close" that arrives while the sheet is open again is the echo of the effect below being run twice in development: ignore it.
      ref={dialog} className="details" aria-labelledby="details-title" onClose={event => { if (!event.currentTarget.open) onClose(); }}
      // A tap on the dimmed area outside the sheet lands on the dialog itself.
      onClick={event => { if (event.target === event.currentTarget) dismiss(); }}
    >
      <div className="details-sheet">
        {/* Stays at the top while the sheet scrolls, so closing is always one tap away (Escape and a tap outside also close). */}
        <div className="details-bar">
          <div className="details-handle" aria-hidden="true" />
          <button className="settings-close details-x" type="button" onClick={dismiss} aria-label={t("common.close")} title={t("common.close")}>✕</button>
        </div>
        {posterUrl && <img className="details-poster" src={posterUrl} alt="" loading="lazy" />}
        <h2 id="details-title">{media.title}</h2>

        <div className="details-badges">
          {heightLabel && <span>{heightLabel}</span>}
          <span>{media.kind === "hls" ? t("details.adaptive") : t("details.single")}</span>
          <span className="compat" data-compat={media.compat}>{t(`compat.${media.compat}` as const)}</span>
        </div>
        {note && <p className="details-note">{note}</p>}

        {details.meta && <section><MetaView meta={details.meta} /></section>}
        {details.canLookUp && (
          <section>
            {!details.meta && <h3>{t("details.about")}</h3>}
            <FindDetails roomId={roomId} media={media} canLookUp={details.canLookUp} model={details.model} described={!!details.meta} />
          </section>
        )}

        <dl className="facts">
          <Fact label={t("details.length")}>{formatDuration(media.duration)}</Fact>
          <Fact label={t("details.picture")}>{dimensions}</Fact>
          {/* A file whose bitrate is not known would read "0.0 Mb/s": leave the line out instead. */}
          {media.bitrate >= 50_000 && <Fact label={t("details.bitrate")}>{formatBitrate(media.bitrate, locale, t("common.unknown"))}</Fact>}
          <Fact label={t("details.size")}>{media.size ? formatSize(media.size, locale) : t("common.unknown")}</Fact>
          <Fact label={t("details.format")}>{containerLabel(media, { hls: t("media.hls"), unknown: t("common.unknown") })}</Fact>
          <Fact label={t("details.video")}>{videoCodecLabel(media.vcodec, t("common.unknown"))}</Fact>
          <Fact label={t("details.audio")}>{audioCodecLabel(media.acodec, t("details.none"))}</Fact>
          <Fact label={t("details.subtitles")}>{media.captions.length ? tn("details.tracks", media.captions.length) : t("details.none")}</Fact>
        </dl>

        {media.captions.length > 0 && (
          <section>
            <h3>{t("details.subtitleTracks")}</h3>
            <ul className="details-list">
              {media.captions.map(caption => <li key={caption.label + caption.lang}>{captionLabel(caption.lang, caption.label, locale, t)}{caption.lang && <small>{caption.lang}</small>}</li>)}
            </ul>
          </section>
        )}

        <section>
          <h3>{t("details.room")}</h3>
          <dl className="facts">
            <Fact label={t("details.host")}>{room.hostName}</Fact>
            <Fact label={t("details.people")}>{formatNumber(locale, room.people)}</Fact>
          </dl>
          {room.code && (
            <div className="room-code details-code">
              <div><small>{t("details.code")}</small><strong>{room.code}</strong></div>
              <button className="btn" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(room.code!); setCopied(true); } catch { /* The code is on screen to read out. */ }
              }}>{copied ? t("common.copied") : t("common.copy")}</button>
            </div>
          )}
        </section>

        <section>
          <h3>{t("language.label")}</h3>
          <LanguageSwitch />
        </section>

        <button className="btn btn-wide details-close" type="button" onClick={dismiss}>{t("common.close")}</button>
      </div>
    </dialog>
  );
}
