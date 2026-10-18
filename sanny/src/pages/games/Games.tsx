import { useLanguage, translations } from '@sanny/i18n';

export default function Games() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {t.main.games}
    </div>
  );
}