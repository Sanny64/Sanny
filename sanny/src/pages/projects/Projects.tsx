import { useLanguage, translations } from "@sanny/i18n";

export default function Projects() {
  const t = translations[useLanguage().language];
  return (
    <>
      <div className="content" key="projects-content">
        {t.main.projects.title}
      </div>
    </>
  );
}
