import type { MessageKey, Params } from "./core";

type Translate = (key: MessageKey, params?: Params) => string;

/** Languages offered when choosing a subtitle language (for a new file, or as the preferred language). */
export const commonLanguages = ["en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh", "ar", "hi", "ru", "tr", "pl"];

const capitalise = (text: string, locale: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/**
 * The name of a subtitle track in the viewer's language, worked out from its language code ("en", "es-419", "pt-BR",
 * "en-sdh", "en-forced"). If the browser does not know the code, the server's label is used instead.
 */
export function captionLabel(code: string, fallback: string, locale: string, t: Translate) {
  const variant = /^(.+?)-(sdh|forced|cc)[0-9]*$/i.exec(code);
  const base = variant ? variant[1] : code;
  let name = "";
  try {
    const found = new Intl.DisplayNames([locale], { type: "language" }).of(base);
    if (found && found !== base) name = capitalise(found, locale);
  } catch { /* An unusual code: use the server's label. */ }
  if (!name) return fallback;
  if (!variant) return name;
  const tag = variant[2].toLowerCase() === "forced" ? t("subs.tag.forced") : variant[2].toUpperCase();
  return `${name} (${tag})`;
}
