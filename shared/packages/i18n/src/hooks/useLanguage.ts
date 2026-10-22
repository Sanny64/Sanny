import type { LanguageContextType } from '../types/language.types.js';
import { useContext } from 'react';
import { LanguageContext } from '../LanguageContext.js';

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);

  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
};
