import { languageCookieOptions, languageStorageKey } from "./language.config";
import Cookies from "js-cookie";
import type { Language } from "./language.types";

export function resolveSystemLanguage(): Language {
  if (typeof navigator === "undefined") return "en";

  const systemLanguage = navigator.languages?.[0] ?? navigator.language;
  return systemLanguage?.toLowerCase().startsWith("de") ? "de" : "en";
}

export function persistLanguage(lang: Language) {
  Cookies.set(languageStorageKey, lang, languageCookieOptions);
  localStorage.setItem(languageStorageKey, lang);
  document.documentElement.lang = lang;
}

export function resolveStoredLanguage(): Language | null {
  const storedCookie = Cookies.get(languageStorageKey) as Language | undefined;
  const storedLocal = localStorage.getItem(
    languageStorageKey,
  ) as Language | null;

  if (storedCookie === "en" || storedCookie === "de") {
    if (storedLocal !== storedCookie) {
      try {
        localStorage.setItem(languageStorageKey, storedCookie);
      } catch {
        // ignore storage errors (e.g. private mode)
      }
    }
    return storedCookie;
  }

  if (storedLocal === "en" || storedLocal === "de") {
    Cookies.set(languageStorageKey, storedLocal, languageCookieOptions);
    return storedLocal;
  }

  return null;
}

export function applyLanguageToDocument(lang: Language) {
  document.documentElement.lang = lang;
}
