import { useLanguage, translations } from "@sanny/i18n";

export default function Portfolio() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.portfolio}</div>;
}
