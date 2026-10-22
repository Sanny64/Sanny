import type { en } from '../../locales/translations/en.js';

export type Language = 'en' | 'de';

export type Translations = typeof en;

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}
