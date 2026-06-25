import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';
import type { ThemeContextType } from './theme.types';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};