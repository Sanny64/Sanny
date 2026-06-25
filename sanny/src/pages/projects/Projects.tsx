import { useLanguage, translations } from '@sanny/i18n';
import { SharedSetupProbe } from '@sanny/ui';

export default function Projects() {
  const t = translations[useLanguage().language];
  return (
    <>
      <div className="content" key="projects-content">
        {t.main.projects.title}
        <SharedSetupProbe />
      </div>
    </>
  );
}
