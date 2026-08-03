import { useTheme, getThemeVariant } from '@sanny/styles';
import { useLanguage, translations } from '@sanny/i18n';
import { Button } from './Button';
import { ButtonGroup } from './ButtonGroup';
import { Section } from './Section';
import '../styles/sharedSetupProbe.css';

export function SharedSetupProbe({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === 'en' ? 'de' : 'en';
  const themeVariant = getThemeVariant(theme);
  const t = translations[language];

  return (
    <div 
      className={`shared-setup-probe ${className}`}
      aria-label="Shared setup verification"
    >
    <Section
      className={`ssp-section ${className}`}
      variant={themeVariant}
    >
      <strong>
        {t.shared.setupProbe.title}
      </strong>
      <div>
        {t.shared.setupProbe.theme}: {theme}
      </div>
      <div>
        {t.shared.setupProbe.language}: {language}
      </div>
      {/* Test global provider state changes */}
      <ButtonGroup
        className={`ssp-button-group ${className}`}
        layout="horizontal"
      >
      {/* Test global theme provider state changes */}
      <Button
        className={`ssp-toggle-theme-button ${className}`}
        aria-label={t.shared.setupProbe.descriptionToggleThemeButton(theme)}
        data-testid={`ssp-toggle-theme-button ${className}`}
        variant={themeVariant}
        onClick={toggleTheme}
      >
        {t.shared.setupProbe.toggleThemeButton(theme)}
      </Button>
          {/* Test global language provider state changes */}
          <Button
            className={`ssp-switch-language-button ${className}`}
            aria-label={t.shared.setupProbe.descriptionSwitchLanguageButton(
              nextLanguage,
            )}
            data-testid={`ssp-switch-language-button ${className}`}
            variant={themeVariant}
            onClick={() => setLanguage(nextLanguage)}
          >
            {t.shared.setupProbe.switchLanguageButton(nextLanguage)}
          </Button>
        </ButtonGroup>
      </Section>
    </div>
  );
}