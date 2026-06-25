import { useTheme, getThemeVariant } from '@sanny/styles';
import { useLanguage, translations } from '@sanny/i18n';
import { Button } from './Button';
import { ButtonGroup } from './ButtonGroup';
import { Section } from './Section';
import '../styles/sharedSetupProbe.css';


export function SharedSetupProbe({ 
  testId = "shared-setup-probe", className }: {
     testId?: string;
     className?: string 
}) {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === 'en' ? 'de' : 'en';
  const themeVariant = getThemeVariant(theme);
  const t = translations[language];

  return (
    <Section
      className={`panelStyle ${className}`}
      aria-label="Shared setup verification"
      variant={themeVariant}
      data-testid={testId}
    >
      <strong>{t.shared.setupProbe.title}</strong>
      <div>{t.shared.setupProbe.theme}: {theme}</div>
      <div>{t.shared.setupProbe.language}: {language}</div>
      <ButtonGroup layout="horizontal">
        <Button 
          className="toggle-theme-button"
          aria-label={t.shared.setupProbe.descriptionToggleThemeButton(theme)}
          variant={themeVariant}
          onClick={toggleTheme}
        >
          {t.shared.setupProbe.toggleThemeButton(theme)}
        </Button>
        <Button
          className="switch-language-button"
          aria-label={t.shared.setupProbe.descriptionSwitchLanguageButton(nextLanguage)}
          variant={themeVariant}
          onClick={() => setLanguage(nextLanguage)}
        >
          {t.shared.setupProbe.switchLanguageButton(nextLanguage)}
        </Button>
      </ButtonGroup>
    </Section>
  );
}