import type { ReactNode } from 'react';
import type { Language } from './types/language.types.js';
import { useState, useEffect, useLayoutEffect } from 'react';
import {
  resolveStoredLanguage,
  resolveSystemLanguage,
  applyLanguageToDocument,
  persistLanguage,
} from './utils/language.utils.js';
import { LanguageContext } from './LanguageContext.js';
import { translations } from '../locales/index.js';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => {
    const storedLanguage = resolveStoredLanguage();
    if (storedLanguage) return storedLanguage;

    return resolveSystemLanguage();
  });

  useIsomorphicLayoutEffect(() => {
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
