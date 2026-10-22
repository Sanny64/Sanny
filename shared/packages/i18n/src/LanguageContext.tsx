import type { LanguageContextType } from './types/language.types.js';
import { createContext } from 'react';

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);
