import { useTheme, getThemeVariant } from "@sanny/styles";
import { useLanguage, translations } from "@sanny/i18n";
import { Button } from "./Button";
import { ButtonGroup } from "./ButtonGroup";
import { Section } from "./Section";
import "../styles/sharedSetupProbe.css";

export function SharedSetupProbe({ className = "shared-setup-probe" }) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === "en" ? "de" : "en";
  const themeVariant = getThemeVariant(theme);
  const t = translations[language];

  return (
    <>
      <Section
        className={`ssp-section ${className}`}
        aria-label="Shared setup verification"
        variant={themeVariant}
        data-testid={`shared-setup-probe ${className}`}
      >
        <strong>{t.shared.setupProbe.title}</strong>
        <div>
          {t.shared.setupProbe.theme}: {theme}
        </div>
        <div>
          {t.shared.setupProbe.language}: {language}
        </div>
        {/* Test global provider state changes */}
        <ButtonGroup
          className={`settings-button-group ${className}`}
          layout="horizontal"
        >
          {/* Test global theme provider state changes */}
          <Button
            className={`toggle-theme-button ${className}`}
            aria-label={t.shared.setupProbe.descriptionToggleThemeButton(theme)}
            variant={themeVariant}
            onClick={toggleTheme}
            data-testid={`toggle-theme-test ${className}`}
          >
            {t.shared.setupProbe.toggleThemeButton(theme)}
          </Button>
          {/* Test global language provider state changes */}
          <Button
            className={`switch-language-button ${className}`}
            aria-label={t.shared.setupProbe.descriptionSwitchLanguageButton(
              nextLanguage,
            )}
            variant={themeVariant}
            onClick={() => setLanguage(nextLanguage)}
            data-testid={`switch-language-test ${className}`}
          >
            {t.shared.setupProbe.switchLanguageButton(nextLanguage)}
          </Button>
        </ButtonGroup>
      </Section>
    </>
  );
}
