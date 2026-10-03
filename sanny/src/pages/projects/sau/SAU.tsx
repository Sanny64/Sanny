import { useLanguage, translations } from "@sanny/i18n";

export default function SAU() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.projects.sau.title}</div>;
}
