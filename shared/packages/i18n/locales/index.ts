import type { Language, Translations } from '../src/types/language.types.js';
import { de } from './translations/de.js';
import { en } from './translations/en.js';

export const translations: Record<Language, Translations> = {
  en,
  de,
};
