import type { ThemeContextType } from './types/theme.types.js';
import { createContext } from 'react';

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);
