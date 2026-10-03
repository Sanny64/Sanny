import { useLanguage, translations } from "@sanny/i18n";

export default function Haptigation() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.projects.haptigation.title}</div>;
}
