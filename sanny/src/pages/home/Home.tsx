import { useLanguage, translations } from "@sanny/i18n";

export default function Home() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.home}</div>;
}
