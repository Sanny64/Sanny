import type { Language, Translations } from "../language.types";
import { de } from "./de";
import { en } from "./en";

export const translations: Record<Language, Translations> = {
  en,
  de,
};
