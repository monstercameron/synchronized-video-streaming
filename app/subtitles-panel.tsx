"use client";

import { useEffect, useRef } from "react";
import { formatNumber } from "./i18n/format";
import { useI18n } from "./i18n";
import { Segmented, Slider, Swatches, Switch, backgroundColors, outlineColors, seconds, textColors } from "./settings-controls";
import {
  defaultSubtitleSettings, fontStacks, getSubtitleSettings, resetSubtitleSettings, subtitlePresets, updateSubtitleSettings, useSubtitleSettings,
  type SubtitleFont,
} from "./subtitle-settings";
import type { Caption } from "./use-subtitle-track";

/**
 * The subtitles panel: opened by the Subtitles button, under the buttons. The track list is at the very top, so picking a
 * language is one tap; delay, stacking and the look of the text follow below.
 */
export function SubtitlesPanel({ captions, trackIndex, onSelectTrack }: { captions: Caption[]; trackIndex: number; onSelectTrack: (index: number) => void }) {
  const { t, locale } = useI18n();
  const s = useSubtitleSettings();
  const set = updateSubtitleSettings;
  // Read the live value, not the last rendered one, so quick repeated taps all count.
  const nudge = (amount: number) => set({ delay: Math.round((getSubtitleSettings().delay + amount) * 10) / 10 });

  const list = useRef<HTMLDivElement>(null);
  // Open with the chosen track in view, however far down the list it is.
  useEffect(() => { list.current?.querySelector("[aria-checked=true]")?.scrollIntoView({ block: "nearest" }); }, []);

  return (
    <section className="player-settings subs-panel" aria-label={t("player.subtitles")}>
      <div className="settings-bar"><h2 className="panel-title">{t("player.subtitles")}</h2></div>
      <div className="settings-body">
      <div className="set-group">
        <h3>{t("subs.track")}</h3>
        {captions.length ? (
          <div className="segmented subs-tracks" role="radiogroup" aria-label={t("subs.trackLabel")} ref={list}>
            <button type="button" role="radio" aria-checked={trackIndex < 0} onClick={() => onSelectTrack(-1)}>{t("subs.off")}</button>
            {captions.map((caption, index) => (
              <button key={caption.source} type="button" role="radio" aria-checked={index === trackIndex} onClick={() => onSelectTrack(index)}>{caption.label}</button>
            ))}
          </div>
        ) : (
          <p className="set-note">{t("subs.none")}</p>
        )}
      </div>

      <div className="set-group">
        <h3>{t("subs.timing")}</h3>
        <Slider label={t("subs.delay")} value={s.delay} min={-10} max={10} step={0.1} format={value => seconds(locale, value)} onChange={delay => set({ delay })} />
        <div className="nudges" role="group" aria-label={t("subs.fineTune")}>
          <button type="button" onClick={() => nudge(-0.5)}>−0.5</button>
          <button type="button" onClick={() => nudge(-0.1)}>−0.1</button>
          <button type="button" onClick={() => set({ delay: 0 })} disabled={s.delay === 0}>{t("subs.reset")}</button>
          <button type="button" onClick={() => nudge(0.1)}>+0.1</button>
          <button type="button" onClick={() => nudge(0.5)}>+0.5</button>
        </div>
        <p className="set-note">{t("subs.delayNote")}</p>
        <Slider label={t("subs.stay")} value={s.stay} min={0} max={8} step={0.5} format={value => (value ? `+${formatNumber(locale, value, 1)} s` : t("subs.valueOff"))} onChange={stay => set({ stay })} />
        <p className="set-note">{t("subs.stayNote")}</p>
        <Segmented label={t("subs.stack")} value={s.stack}
          options={[1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))} onChange={stack => set({ stack })} />
        <p className="set-note">{t("subs.stackNote")}</p>
      </div>

      <div className="set-group">
        <h3>{t("subs.style")}</h3>
        <div className="chips" role="group" aria-label={t("subs.presets")}>
          {subtitlePresets.map(preset => <button key={preset.id} type="button" onClick={() => set(preset.look)}>{t(`subs.preset.${preset.id}` as const)}</button>)}
        </div>
        <Slider label={t("subs.size")} value={s.size} min={0.5} max={2.5} step={0.05} format={value => `${Math.round(value * 100)}%`} onChange={size => set({ size })} />
        <Slider label={t("subs.height")} value={s.position} min={2} max={40} step={1} format={value => `${value}%`} onChange={position => set({ position })} />
        <Swatches label={t("subs.textColor")} colors={textColors} value={s.color} onChange={color => set({ color })} />
        <Slider label={t("subs.textOpacity")} value={s.opacity} min={0.2} max={1} step={0.05} format={value => `${Math.round(value * 100)}%`} onChange={opacity => set({ opacity })} />
        <Swatches label={t("subs.bgColor")} colors={backgroundColors} value={s.background} onChange={background => set({ background })} />
        <Slider label={t("subs.bgOpacity")} value={s.backgroundOpacity} min={0} max={1} step={0.05} format={value => (value ? `${Math.round(value * 100)}%` : t("subs.valueNone"))} onChange={backgroundOpacity => set({ backgroundOpacity })} />
        <Slider label={t("subs.outline")} value={s.outline} min={0} max={5} step={0.5} format={value => (value ? formatNumber(locale, value, value % 1 ? 1 : 0) : t("subs.valueNone"))} onChange={outline => set({ outline })} />
        <Swatches label={t("subs.outlineColor")} colors={outlineColors} value={s.outlineColor} onChange={outlineColor => set({ outlineColor })} />
        <Switch label={t("subs.shadow")} checked={s.shadow} onChange={shadow => set({ shadow })} />
        <Switch label={t("subs.bold")} checked={s.bold} onChange={bold => set({ bold })} />
        <Segmented<SubtitleFont> label={t("subs.font")} value={s.font}
          options={(Object.keys(fontStacks) as SubtitleFont[]).map(font => ({ value: font, label: t(`subs.font.${font}` as const) }))}
          onChange={font => set({ font })} />
      </div>

      <button className="settings-reset" type="button" onClick={resetSubtitleSettings}
        disabled={JSON.stringify({ ...s, trackLang: "" }) === JSON.stringify({ ...defaultSubtitleSettings, trackLang: "" })}>
        {t("subs.resetAll")}
      </button>
      </div>
    </section>
  );
}

