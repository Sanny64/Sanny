export type Theme = "dark" | "light";

export type ThemeVariant = "primary" | "secondary" | "ghost";

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}
