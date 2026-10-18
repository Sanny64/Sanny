import type { LanguageContextType } from "./language.types";
import { createContext } from "react";

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);
