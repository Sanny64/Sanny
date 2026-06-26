import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";
import "@sanny/styles";

export default function Error() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {/* TODO: Add dynamic error message display based on the HTTP error with consistent styling */}
      {t.shared.errors.title}
      <SharedSetupProbe />
    </div>
  );
}
