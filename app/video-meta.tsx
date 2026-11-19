"use client";

import { useCallback, useEffect, useState } from "react";
import { Failure, problemOf, useI18n, type Problem } from "./i18n";
import type { MediaInfo, MediaMeta } from "./room-shared";

type Lookup = { meta: MediaMeta | null; canLookUp?: boolean; model?: string };

/** The looked-up details of a video. Fetched when first needed and again whenever the saved lookup changes. */
export function useMediaMeta(roomId: string, media: Pick<MediaInfo, "id" | "metaVersion">) {
  const [lookup, setLookup] = useState<Lookup>();
  const [error, setError] = useState<Problem>();

  useEffect(() => {
    let current = true;
    setError(undefined);
    fetch(`/api/rooms/${roomId}/meta?mediaId=${encodeURIComponent(media.id)}`, { cache: "no-store" })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Failure(payload, "meta.err.load");
        if (current) setLookup(payload as Lookup);
      })
      .catch(reason => { if (current) setError(problemOf(reason, "meta.err.load")); });
    return () => { current = false; };
  }, [roomId, media.id, media.metaVersion]);

  return { ...lookup, error, loaded: !!lookup };
}


/** The facts a lookup found, as plain text (nothing from the web is ever rendered as markup). */
export function MetaView({ meta }: { meta: MediaMeta }) {
  const { t, locale } = useI18n();
  const episode = meta.season !== undefined && meta.episode !== undefined ? `${t("meta.seasonEpisode", { season: meta.season, episode: meta.episode })}${meta.episodeTitle ? `: ${meta.episodeTitle}` : ""}` : meta.episodeTitle;
  const line = [meta.kind && t(`meta.kind.${meta.kind}` as const), meta.year, meta.rating, meta.network, meta.runtime ? t("meta.minutes", { n: meta.runtime }) : undefined].filter(Boolean).join(" · ");
  const confidence = meta.confidence === "medium" ? t("meta.conf.medium") : meta.confidence === "low" ? t("meta.conf.low") : "";
  return (
    <div className="meta">
      {line && <p className="meta-line">{line}</p>}
      {meta.series && <p className="meta-line"><strong>{meta.series}</strong>{episode ? ` · ${episode}` : ""}</p>}
      {!meta.series && episode && <p className="meta-line">{episode}</p>}
      {meta.synopsis && <p className="meta-synopsis">{meta.synopsis}</p>}
      {meta.genres.length > 0 && <ul className="meta-tags" aria-label={t("meta.genres")}>{meta.genres.map(genre => <li key={genre}>{genre}</li>)}</ul>}
      {meta.directors.length > 0 && <p className="meta-line"><span>{t("meta.directedBy")}</span> {meta.directors.join(", ")}</p>}
      {meta.cast.length > 0 && (
        <>
          <h3>{t("meta.cast")}</h3>
          <ul className="details-list">
            {meta.cast.map(person => <li key={person.name}>{person.name}{person.role && <small>{person.role}</small>}</li>)}
          </ul>
        </>
      )}
      {confidence && <p className="details-note">{confidence}</p>}
      {meta.sources.length > 0 && (
        <p className="meta-sources">
          {t("meta.sources")}{" "}
          {meta.sources.map((source, index) => (
            <span key={source.url}>{index > 0 && ", "}<a href={source.url} target="_blank" rel="noopener noreferrer nofollow">{source.title}</a></span>
          ))}
        </p>
      )}
      <p className="meta-sources">{t("meta.found", { model: meta.model, date: new Date(meta.fetchedAt).toLocaleDateString(locale) })}</p>
    </div>
  );
}

/** The host's button: search the web for this video's details. Optional hint text helps with odd file names. */
export function FindDetails({ roomId, media, canLookUp, model, described, admin }: {
  roomId: string; media: MediaInfo; canLookUp?: boolean; model?: string; described: boolean;
  /** Whether this person is the signed-in admin: only the admin is told which server setting is missing. */
  admin?: boolean;
}) {
  const { t, lang, say } = useI18n();
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem>();

  const run = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/rooms/${roomId}/library/enrich`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, hint: hint.trim() || undefined, lang }),
      });
      if (!response.ok) throw new Failure(await response.json().catch(() => null), "meta.err.lookup");
    } catch (reason) {
      setError(problemOf(reason, "meta.err.lookup"));
    } finally {
      setBusy(false);
    }
  }, [roomId, media.id, hint, lang]);

  if (canLookUp === undefined) return null;
  if (!canLookUp) {
    // The name of the server setting is for whoever runs the server; everybody else is just told it is not available.
    return <p className="details-note">{admin ? <>{t("meta.notConfiguredBefore")}<code>METADATA_API_KEY</code>{t("meta.notConfiguredAfter")}</> : t("meta.notConfigured")}</p>;
  }
  return (
    <div className="find-details">
      <input
        aria-label={t("meta.hint")} placeholder={t("meta.hintPlaceholder")} maxLength={200}
        value={hint} onChange={event => setHint(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !busy) void run(); }}
      />
      <button className="btn btn-primary" type="button" onClick={() => void run()} disabled={busy}>
        {busy ? t("meta.searching") : described ? t("meta.lookupAgain") : t("meta.find")}
      </button>
      <p className="details-note">{t("meta.privacy", { model: model ?? t("meta.modelFallback") })}</p>
      {error && <p className="room-error" role="alert">{say(error)}</p>}
    </div>
  );
}
