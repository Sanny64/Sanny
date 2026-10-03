import { useLanguage, translations } from "@sanny/i18n";

export default function Blog() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.main.blog}</div>;
}
