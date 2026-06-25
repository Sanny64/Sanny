import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import type { ThemeContextType } from './ThemeProvider';

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};