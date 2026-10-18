import { translations, useLanguage } from "@sanny/i18n";
import { Button } from "@sanny/ui";
import { motion, useReducedMotion } from "framer-motion";
import { Menu as MenuIcon, Settings, Shield, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import LoginButton from "../default/LoginButton";
import "../../styles/components/accountMenu.css";

export default function Menu() {
  const { language } = useLanguage();
  const t = translations[language];
  const reducedMotion = useReducedMotion();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [identity, setIdentity] = useState<{ roles?: string[] } | null>(null);
  const isAdmin = identity?.roles?.includes("admin") ?? false;

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className="account-menu"
      ref={menuRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <Button
        ref={triggerRef}
        className="account-menu__trigger"
        type="button"
        variant="secondary"
        aria-label={language === "de" ? "Kontomenü" : "Account menu"}
        aria-expanded={isOpen}
        aria-controls={menuId}
        title={language === "de" ? "Kontomenü" : "Account menu"}
        onClick={() => setIsOpen((open) => !open)}
      >
        <motion.span
          className="account-menu__icon"
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {isOpen ? (
            <X size={22} aria-hidden="true" />
          ) : (
            <MenuIcon size={22} aria-hidden="true" />
          )}
        </motion.span>
      </Button>
      <motion.nav
        id={menuId}
        className="account-menu__dropdown"
        aria-label={language === "de" ? "Konto" : "Account"}
        aria-hidden={!isOpen}
        inert={!isOpen}
        initial={false}
        animate={{
          opacity: isOpen ? 1 : 0,
          y: isOpen || reducedMotion ? 0 : -8,
          visibility: isOpen ? "visible" : "hidden",
        }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}
        onClick={() => {
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
      >
        <LoginButton
          className="account-menu__item__login-redirect"
          autoVariant={false}
          onIdentityChange={setIdentity}
        />
        <Button
          className="account-menu__item__settings-redirect"
          variant="secondary"
          to="/settings"
        >
          <Settings size={18} aria-hidden="true" />
          {t.shared.settings.title}
        </Button>
        {isAdmin && (
          <Button
            className="account-menu__item__admin-redirect"
            variant="secondary"
            to="/settings/admin"
          >
            <Shield size={18} aria-hidden="true" />
            {t.shared.settings.adminSettingsTitle}
          </Button>
        )}
      </motion.nav>
    </div>
  );
}
