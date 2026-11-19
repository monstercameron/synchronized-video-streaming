import { en, type MessageKey } from "./en";
import { es } from "./es";

/** Plain translation functions with no React in them, so the server can use them too. */

export type Lang = "en" | "es";
export type Params = Record<string, string | number>;
export type { MessageKey };

export const languages: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
];
export const langCookie = "screening-lang";
export const isLang = (value: unknown): value is Lang => value === "en" || value === "es";

const catalogs: Record<Lang, Record<string, string>> = { en, es };

/** The text for `key` in `lang`, with {placeholders} filled in. Falls back to English, then to the key itself. */
export function translate(lang: Lang, key: MessageKey, params?: Params) {
  const text = catalogs[lang][key] ?? en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;
}

/** Base names of the texts that come in singular and plural forms (key.one / key.other). */
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}.one` ? Base : never }[MessageKey];

export function translatePlural(lang: Lang, base: PluralKey, count: number, params?: Params) {
  // English and Spanish both use the singular for exactly one.
  return translate(lang, `${base}.${count === 1 ? "one" : "other"}` as MessageKey, { count, ...params });
}

/** What the API sends when something goes wrong: an English sentence plus a code the page can translate. */
export type ApiError = { error?: string; code?: MessageKey; params?: Params };

/** The sentence to show for a failed request, in the viewer's language. */
export function describeError(lang: Lang, payload: ApiError | null | undefined, fallback: MessageKey) {
  if (payload?.code && payload.code in en) return translate(lang, payload.code, payload.params);
  return payload?.error ?? translate(lang, fallback);
}

/** The Intl locale for a language, used for dates, numbers and language names. */
export const localeOf = (lang: Lang) => (lang === "es" ? "es" : "en");
