import type { LanguageContextType } from "./language.types";
import { useContext } from "react";
import { LanguageContext } from "./LanguageContext";

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);

  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }

  return context;
};
