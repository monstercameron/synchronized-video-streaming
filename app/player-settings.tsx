"use client";

import type { ReactNode } from "react";
import { captionLabel, commonLanguages } from "./i18n/caption-label";
import { formatNumber } from "./i18n/format";
import { LanguageSwitch, useI18n } from "./i18n";
import { rovingRef } from "./roving";
import { Slider, Switch } from "./settings-controls";
import type { MediaInfo } from "./room-shared";
import { updateSubtitleSettings, useSubtitleSettings } from "./subtitle-settings";
import { fixedHeight, type Quality } from "./use-playback-quality";

export type SettingsTab = "quality" | "sound" | "language";
export type Level = { height: number; bitrate: number };

// ---------- Quality ----------

function QualityTab({ media, levels, activeLevel, quality, onQuality }: {
  media: MediaInfo; levels: Level[]; activeLevel: number; quality: Quality; onQuality: (quality: Quality) => void;
}) {
  const { t, locale } = useI18n();
  const fixed = fixedHeight(quality);
  const rate = (bitrate: number) => t("quality.rate", { rate: formatNumber(locale, bitrate / 1e6, 1) });

  if (media.kind === "file") {
    return (
      <div className="set-group">
        <h3>{t("quality.title")}</h3>
        <p className="set-note">{media.bitrate >= 50_000 ? t("quality.single", { height: media.height, rate: formatNumber(locale, media.bitrate / 1e6, 1) }) : t("quality.singleNoRate", { height: media.height })}</p>
      </div>
    );
  }

  // Which listed quality a fixed choice resolves to: the highest one that does not exceed it.
  const fixedIndex = fixed === undefined ? -1 : levels.reduce((found, level, index) => (level.height <= fixed ? index : found), 0);
  const rows: { key: string; title: string; detail: string; selected: boolean; apply: Quality; playing: boolean }[] = [
    { key: "auto", title: t("quality.auto"), detail: t("quality.autoDetail"), selected: quality === "auto", apply: "auto", playing: false },
    { key: "saver", title: t("quality.saver"), detail: t("quality.saverDetail"), selected: quality === "saver", apply: "saver", playing: false },
    ...levels.map((level, index) => ({
      key: String(level.height), title: `${level.height}p`, detail: rate(level.bitrate),
      selected: index === fixedIndex, apply: `h${level.height}` as Quality, playing: index === activeLevel,
    })).reverse(),
  ];

  return (
    <div className="set-group">
      <h3>{t("quality.title")}</h3>
      <div className="quality-rows" role="radiogroup" aria-label={t("quality.title")} ref={rovingRef}>
        {rows.map(row => (
          <button key={row.key} type="button" role="radio" aria-checked={row.selected} onClick={() => onQuality(row.apply)}>
            <span>{row.title}{row.playing && <small>{t("quality.playingNow")}</small>}</span>
            <span>{row.detail}</span>
          </button>
        ))}
      </div>
      <p className="set-note">
        {quality === "auto" && activeLevel >= 0 && levels[activeLevel] ? t("quality.currently", { height: levels[activeLevel].height }) : ""}
        {t("quality.fixedNote")}
      </p>
    </div>
  );
}

// ---------- Sound ----------

function SoundTab({ muted, volume, volumeWorks, soft, onMute, onVolume }: {
  muted: boolean; volume: number; volumeWorks: boolean; soft?: boolean; onMute: (muted: boolean) => void; onVolume: (volume: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="set-group">
      <h3>{t("sound.title")}</h3>
      <Switch label={t("player.mute")} checked={muted} onChange={onMute} hint={t("sound.hint")} />
      {volumeWorks
        ? <Slider label={t("player.volume")} value={muted ? 0 : volume} min={0} max={1} step={0.05} format={value => `${Math.round(value * 100)}%`} onChange={onVolume} />
        : <p className="set-note">{t("sound.hardware")}</p>}
      {volumeWorks && soft && <p className="set-note">{t("sound.soft")}</p>}
    </div>
  );
}

// ---------- Language ----------

/** The app's own language, and which language subtitles should start in. */
function LanguageTab() {
  const { t, locale } = useI18n();
  const trackLang = useSubtitleSettings(settings => settings.trackLang);
  // A language picked from a video's own track list (such as es-419) is shown too, so the box always says what is in force.
  const listed = trackLang === "" || trackLang === "off" || commonLanguages.includes(trackLang);
  return (
    <>
      <div className="set-group">
        <h3>{t("lang.app")}</h3>
        <LanguageSwitch />
      </div>
      <div className="set-group">
        <h3>{t("lang.subs")}</h3>
        <select className="set-select" aria-label={t("lang.subs")} value={trackLang} onChange={event => updateSubtitleSettings({ trackLang: event.target.value })}>
          <option value="">{t("lang.subsAuto")}</option>
          <option value="off">{t("lang.subsOff")}</option>
          {!listed && <option value={trackLang}>{captionLabel(trackLang, trackLang, locale, t)}</option>}
          {commonLanguages.map(code => <option key={code} value={code}>{captionLabel(code, code, locale, t)}</option>)}
        </select>
        <p className="set-note">{t("lang.subsNote")}</p>
      </div>
    </>
  );
}

// ---------- The drawer ----------

export function PlayerSettings(props: {
  /** Fading out: the panel is on its way off the screen and takes no touches. */
  closing?: boolean;
  /** The panel has its own close button: the button that opened it can be scrolled out of sight in the row. */
  onClose: () => void;
  tab: SettingsTab; onTab: (tab: SettingsTab) => void;
  media: MediaInfo; levels: Level[]; activeLevel: number; quality: Quality; onQuality: (quality: Quality) => void;
  muted: boolean; volume: number; volumeWorks: boolean; soft?: boolean; onMute: (muted: boolean) => void; onVolume: (volume: number) => void;
}) {
  const { t } = useI18n();
  const tabs: { id: SettingsTab; label: string }[] = [{ id: "quality", label: t("settings.tab.quality") }, { id: "sound", label: t("settings.tab.sound") }, { id: "language", label: t("settings.tab.language") }];
  let body: ReactNode;
  if (props.tab === "quality") body = <QualityTab media={props.media} levels={props.levels} activeLevel={props.activeLevel} quality={props.quality} onQuality={props.onQuality} />;
  else if (props.tab === "sound") body = <SoundTab muted={props.muted} volume={props.volume} volumeWorks={props.volumeWorks} soft={props.soft} onMute={props.onMute} onVolume={props.onVolume} />;
  else body = <LanguageTab />;

  return (
    <section className="player-settings" aria-label={t("player.settingsAria")} data-closing={!!props.closing} inert={!!props.closing}>
      <div className="settings-bar">
        <div className="settings-tabs" role="tablist" aria-label={t("player.settingsAria")} ref={rovingRef}>
          {tabs.map(tab => (
            <button key={tab.id} type="button" role="tab" aria-selected={props.tab === tab.id} onClick={() => props.onTab(tab.id)}>{tab.label}</button>
          ))}
        </div>
        <button className="settings-close" type="button" onClick={props.onClose} aria-label={t("common.close")}>✕</button>
      </div>
      <div className="settings-body" role="tabpanel">{body}</div>
    </section>
  );
}

