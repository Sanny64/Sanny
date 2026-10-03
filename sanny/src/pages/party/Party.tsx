import { useLanguage, translations } from "@sanny/i18n";

export default function Party() {
  const t = translations[useLanguage().language];
  return <div className="content">{t.auxiliary.party.title}</div>;
}
