import { useState, useEffect, useLayoutEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  resolveStoredTheme,
  resolveSystemTheme,
  applyThemeToDocument,
  persistTheme,
  watchSystemTheme,
} from './utils/theme.utils.js';
import { ThemeContext } from './ThemeContext.js';
import type { Theme } from './types/theme.types.js';
import type { ReactNode } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = resolveStoredTheme();
    if (storedTheme) return storedTheme;

    return resolveSystemTheme();
  });

  useEffect(() => {
    const storedTheme = resolveStoredTheme();
    if (storedTheme) return;

    const setThemeFromSystem = () => {
      setTheme(resolveSystemTheme());
    };
    return watchSystemTheme(setThemeFromSystem);
  }, []);

  const updateAndPersistTheme = (
    resolveNextTheme: (currentTheme: Theme) => Theme
  ) => {
    setTheme((currentTheme) => {
      const nextTheme = resolveNextTheme(currentTheme);
      persistTheme(nextTheme);
      return nextTheme;
    });
  };

  const toggleTheme = () => {
    updateAndPersistTheme((currentTheme) =>
      currentTheme === 'light' ? 'dark' : 'light'
    );
  };

  const updateTheme = (nextTheme: Theme) => {
    updateAndPersistTheme(() => nextTheme);
  };

  useIsomorphicLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme: updateTheme,
      }}
    >
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {children}
      </MotionConfig>
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
