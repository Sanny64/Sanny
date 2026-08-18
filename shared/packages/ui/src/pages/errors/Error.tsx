  import { Section } from "../../components/Section";
import { useLanguage, translations } from "@sanny/i18n";

export default function ErrorPage() {
  const t = translations[useLanguage().language];
  return (
    <>
      <h1>{t.shared.errors.title}</h1>
      <Section className="error-section" variant="primary">
        <h1>
          {t.shared.errors[500]?.title}
        </h1>
        <p>{t.shared.errors[500]?.message}</p>
      </Section>
    </>
  );
}
