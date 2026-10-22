import type { ThemeContextType } from '../types/theme.types.js';
import { useContext } from 'react';
import { ThemeContext } from '../ThemeContext.js';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
