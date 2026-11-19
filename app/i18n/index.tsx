"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { describeError, isLang, langCookie, languages, localeOf, translate, translatePlural, type ApiError, type Lang, type MessageKey, type Params, type PluralKey } from "./core";

export { languages, translate, type Lang, type MessageKey };

type I18n = {
  lang: Lang;
  locale: string;
  t: (key: MessageKey, params?: Params) => string;
  /** A text with singular and plural forms: tn("people", 3) uses people.other with {count} set. */
  tn: (key: PluralKey, count: number, params?: Params) => string;
  /** The sentence for a failed API request, in this language. */
  fail: (payload: ApiError | null | undefined, fallback: MessageKey) => string;
  setLang: (lang: Lang) => void;
};

const Context = createContext<I18n | null>(null);

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n needs a LanguageProvider above it.");
  return value;
}

function remember(lang: Lang) {
  try { document.cookie = `${langCookie}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* Not remembered. */ }
  document.documentElement.lang = lang;
  document.title = translate(lang, "room.title.default");
}

/**
 * Holds the chosen language. Until a language has been chosen (first visit, no cookie) nothing else is shown: the person
 * is asked first, in both languages at once. The choice is kept in a cookie, so the server renders the right language
 * straight away on the next visit.
 */
export function LanguageProvider({ initial, children }: { initial?: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang | undefined>(initial);
  const setLang = useCallback((next: Lang) => { remember(next); setLangState(next); }, []);

  const value = useMemo<I18n | null>(() => {
    if (!lang) return null;
    return {
      lang, locale: localeOf(lang), setLang,
      t: (key, params) => translate(lang, key, params),
      tn: (key, count, params) => translatePlural(lang, key, count, params),
      fail: (payload, fallback) => describeError(lang, payload, fallback),
    };
  }, [lang, setLang]);

  return value ? <Context.Provider value={value}>{children}</Context.Provider> : <LanguageChooser onChoose={setLang} />;
}

/** The first screen: both languages at once, with the phone's own language ready to confirm. */
function LanguageChooser({ onChoose }: { onChoose: (lang: Lang) => void }) {
  // The phone's language is only known in the browser, so the highlight appears after the first render.
  const [suggested, setSuggested] = useState<Lang>();
  useEffect(() => {
    const preferred = (navigator.languages?.[0] ?? navigator.language ?? "en").slice(0, 2).toLowerCase();
    setSuggested(isLang(preferred) ? preferred : "en");
  }, []);

  return (
    <main className="lang-gate" aria-labelledby="lang-title">
      <div className="lang-card">
        <h1 id="lang-title" className="lang-title">
          <span lang="en">Choose your language</span>
          <span lang="es">Elige tu idioma</span>
        </h1>
        <div className="lang-options">
          {languages.map(option => (
            <button key={option.code} type="button" lang={option.code} data-suggested={suggested === option.code} onClick={() => onChoose(option.code)}>
              {option.name}
            </button>
          ))}
        </div>
        <p className="lang-note"><span lang="en">You can change this later.</span> · <span lang="es">Puedes cambiarlo después.</span></p>
      </div>
    </main>
  );
}

/** Two buttons to switch language at any time (used on the join screen and in the video details). */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t("language.label")}>
      {languages.map(option => (
        <button key={option.code} type="button" role="radio" lang={option.code} aria-checked={lang === option.code} onClick={() => setLang(option.code)}>
          {option.name}
        </button>
      ))}
    </div>
  );
}
