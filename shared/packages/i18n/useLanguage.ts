import { useContext } from 'react';
import { LanguageContext } from './LanguageProvider';
import type { LanguageContextType } from './LanguageProvider';

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);

  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
};