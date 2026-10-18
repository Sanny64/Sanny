import { useLanguage, translations } from "@sanny/i18n";

export default function SMNow() {
  const t = translations[useLanguage().language];
  return (
    <>
      <div className="content">{t.main.projects.smnow.title}</div>
    </>
  );
}
