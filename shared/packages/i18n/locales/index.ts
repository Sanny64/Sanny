import { de } from './de';
import { en } from './en';
import type { Language, Translations } from '../language.types';

export const translations: Record<Language, Translations> = {
  en,
  de,
};