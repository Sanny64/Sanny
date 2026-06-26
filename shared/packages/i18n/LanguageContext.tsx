import { createContext } from "react";
import type { LanguageContextType } from "./language.types";

export const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);
