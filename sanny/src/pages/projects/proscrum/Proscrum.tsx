import { useLanguage, translations } from "@sanny/i18n";

export default function Proscrum() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.projects.proscrum.title}</div>;
}
