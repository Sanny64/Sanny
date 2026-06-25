import Cookies from 'js-cookie';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LanguageContext } from './LanguageContext';
import { resolveSystemLanguage, translations } from './language.utils';
import type { Language } from './language.types';

const languageCookieOptions = {
  expires: 365,
  path: '/',
  sameSite: 'lax' as const,
};

const languageStorageKey = 'language';

function persistLanguage(lang: Language) {
  Cookies.set('language', lang, languageCookieOptions);
  localStorage.setItem(languageStorageKey, lang);
  document.documentElement.lang = lang;
}

function applyLanguageToDocument(lang: Language) {
  document.documentElement.lang = lang;
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    const storedCookie = Cookies.get('language') as Language | undefined;
    const storedLocal = localStorage.getItem(languageStorageKey) as Language | null;

    if (storedCookie === 'en' || storedCookie === 'de') {
      // Mirror cookie -> localStorage when cookie is present or changed
      if (storedLocal !== storedCookie) {
        try {
          localStorage.setItem(languageStorageKey, storedCookie);
        } catch {
          // ignore storage errors (e.g. private mode)
        }
      }
      return storedCookie;
    }

    if (storedLocal === 'en' || storedLocal === 'de') {
      // No cookie set: initialize cookie from existing localStorage value
      Cookies.set('language', storedLocal, languageCookieOptions);
      return storedLocal;
    }

    return resolveSystemLanguage();
  });

  useEffect(() => {
    applyLanguageToDocument(language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    persistLanguage(lang);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t: translations[language],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export default LanguageProvider;
