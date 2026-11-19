"use client";

import { useId } from "react";
import { formatNumber } from "./i18n/format";
import { useI18n, type MessageKey } from "./i18n";
import { rovingRef } from "./roving";

export const textColors = ["#ffffff", "#ffe14d", "#7df9ff", "#7dff9a", "#ff9ad5", "#ffa64d"];
export const backgroundColors = ["#000000", "#222222", "#10204a", "#3a2200"];
export const outlineColors = ["#000000", "#ffffff", "#10204a", "#5a0000"];

export function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="set-row">
      <div className="set-head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{format(value)}</output></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    </div>
  );
}

export function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="set-row">
      <div className="set-head"><span id={id}>{label}</span></div>
      <div className="swatches" role="radiogroup" aria-labelledby={id} ref={rovingRef}>
        {colors.map(color => {
          // Named, not the hex code: "Yellow", not "#ffe14d".
          const name = t(`colour.${color.slice(1)}` as MessageKey);
          return (
            <button key={color} type="button" role="radio" aria-checked={value.toLowerCase() === color} aria-label={name} title={name}
              className="swatch" style={{ background: color }} onClick={() => onChange(color)} />
          );
        })}
        <label className="swatch swatch-custom" title={t("subs.customColor", { label })}>
          <input type="color" value={value} aria-label={t("subs.customColor", { label })} onChange={event => onChange(event.currentTarget.value)} />
        </label>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="set-row">
      <div className="set-head"><span id={id}>{label}</span></div>
      <div className="segmented" role="radiogroup" aria-labelledby={id} ref={rovingRef}>
        {options.map(option => (
          <button key={String(option.value)} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span>{label}{hint && <small>{hint}</small>}</span>
      <i aria-hidden="true" />
    </button>
  );
}

/** A number with its sign always shown, in the viewer's decimal style: "+0,5" in Spanish, "+0.5" in English (a real minus sign, not a hyphen). */
export const signed = (locale: string, value: number) => (value > 0 ? "+" : value < 0 ? "−" : "") + formatNumber(locale, Math.abs(value), 1);
export const seconds = (locale: string, value: number) => `${signed(locale, value)} s`;

