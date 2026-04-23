import { Moon, Sun, Languages, Paintbrush } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useLanguage } from '../../hooks/useLanguage';
import ToggleOption from '../../components/toggle';
import Card from '../../components/card';
import type { Language } from '../../types';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const languageFlagsPath = `${import.meta.env.BASE_URL}lang_flags/`;

  const handleLanguageChange = (newLanguage: Language) => {
    setLanguage(newLanguage);
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1 className="settings-title">{t.settings.title}</h1>
        
        {/* Theme Settings Section */}
        <Card
          icon={<Paintbrush size={24} />}
          title={t.settings.theme}
          description={t.settings.theme_description}
        >
          <div className="settings-options">
            <ToggleOption
              onToggle={() => theme === 'dark' && toggleTheme()}
              active={theme === 'light'}
              ariaLabel={`${t.settings.switch} ${t.settings.lightMode}`}
              icon={<Sun size={24} />}
              label={t.settings.lightMode}
              sublabel={t.settings.light_description}
            />

            <ToggleOption
              onToggle={() => theme === 'light' && toggleTheme()}
              active={theme === 'dark'}
              ariaLabel={`${t.settings.switch} ${t.settings.darkMode}`}
              icon={<Moon size={24} />}
              label={t.settings.darkMode}
              sublabel={t.settings.dark_description}
            />
          </div>
        </Card>

        {/* Language Settings Section */}
        <Card
          icon={<Languages size={24} />}
          title={t.settings.language}
          description={t.settings.language_description}
        >
          <div className="settings-options">
            <ToggleOption
              onToggle={() => handleLanguageChange('en')}
              active={language === 'en'}
              ariaLabel={`${t.settings.switch} ${t.settings.english}`}
              icon={
                <img
                  src={`${languageFlagsPath}united-kingdom.png`}
                  alt="UK flag"
                  className="settings-flag-icon"
                />
              }
              label={t.settings.english}
              sublabel={t.settings.global}
            />

            <ToggleOption
              onToggle={() => handleLanguageChange('de')}
              active={language === 'de'}
              ariaLabel={`${t.settings.switch} ${t.settings.german}`}
              icon={
                <img
                  src={`${languageFlagsPath}germany.png`}
                  alt="German flag"
                  className="settings-flag-icon"
                />
              }
              label={t.settings.german}
              sublabel={t.settings.local}
            />
          </div>
        </Card>

        {/* Info Section */}
        <Card as="div" className="settings-info">
          <p>{t.settings.saved_info}</p>
        </Card>
      </div>
    </div>
  );
}