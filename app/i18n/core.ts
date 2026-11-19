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
export function describeError(lang: Lang, payload: ApiError | null | undefined, fallback: MessageKey, params?: Params) {
  if (payload?.code && payload.code in en) return translate(lang, payload.code, payload.params);
  return payload?.error ?? translate(lang, fallback, params);
}

/**
 * A request that came back with a refusal. It carries the server's error (with its translatable code), so whoever catches it
 * can keep the *meaning* in state and write the sentence at render time, in whichever language is chosen by then.
 */
export class Failure extends Error {
  constructor(readonly payload: ApiError | null, readonly key?: MessageKey) { super(payload?.error ?? key ?? "Request failed"); }
}

/**
 * An error kept as data instead of as a finished sentence: `key` (with `params`) is what to say when the server gave no
 * translatable code. Showing it with `say(problem)` re-translates it when the language is switched, so a stale English
 * message never stays behind a Spanish page.
 */
export type Problem = { key: MessageKey; params?: Params; payload?: ApiError | null };

/** The problem for something that was thrown: a refusal keeps the server's code, anything else says `key`. */
export function problemOf(reason: unknown, key: MessageKey): Problem {
  return reason instanceof Failure ? { key: reason.key ?? key, payload: reason.payload } : { key };
}

export function describeProblem(lang: Lang, problem: Problem) {
  return describeError(lang, problem.payload, problem.key, problem.params);
}

/** The Intl locale for a language, used for dates, numbers and language names. */
export const localeOf = (lang: Lang) => (lang === "es" ? "es" : "en");
