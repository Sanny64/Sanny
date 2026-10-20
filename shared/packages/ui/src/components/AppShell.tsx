import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { translations, useLanguage } from "@sanny/i18n";
import brandMark from "../brand.png";

const MotionLink = motion.create(Link);

interface AppShellProps {
  children: ReactNode;
  variant?: "public" | "auth";
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  variant = "public",
  headerActions,
}: AppShellProps) {
  const { pathname } = useLocation();
  const reducedMotion = useReducedMotion();
  const { language } = useLanguage();

  return (
    <div className={`layout layout--${variant}`}>
      <a href="#main-content" className="skip-link" tabIndex={0}>
        {language === "de" ? "Zum Hauptinhalt" : "Skip to main content"}
      </a>
      <header className="app-header">
        <MotionLink
          className="app-brand"
          to="/"
          tabIndex={0}
          whileHover={reducedMotion ? undefined : { scale: 1.05 }}
        >
          <img src={brandMark} alt="" width={28} height={28} />
          Sanny64
        </MotionLink>
        {variant === "auth" && (
          <span className="app-brand__context">
            {translations[language].shared.auth.title}
          </span>
        )}
        {headerActions && <div className="app-tools">{headerActions}</div>}
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <motion.div
          key={pathname}
          className="page-content"
          initial={reducedMotion ? false : { y: 8 }}
          animate={{ y: 0 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
