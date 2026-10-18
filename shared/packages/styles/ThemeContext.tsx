import type { ThemeContextType } from "./theme.types";
import { createContext } from "react";

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
);
