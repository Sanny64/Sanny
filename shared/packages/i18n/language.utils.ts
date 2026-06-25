import { de } from './locales/de';
import { en } from './locales/en';
import type { Language, Translations } from './language.types';

export const translations: Record<Language, Translations> = {
  en,
  de,
};

export function resolveSystemLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';

  const systemLanguage = navigator.languages?.[0] ?? navigator.language;
  return systemLanguage?.toLowerCase().startsWith('de') ? 'de' : 'en';
}