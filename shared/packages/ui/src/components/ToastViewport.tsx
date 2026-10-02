import { useSyncExternalStore } from "react";
import { useLanguage, translations } from "@sanny/i18n";
import { dismissToast, getToasts, subscribeToToasts } from "../utils/toast";
import "../styles/toasts.css";

export default function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);
  const t = translations[useLanguage().language];

  return (
    <div className="toast-viewport" aria-label={t.shared.notifications.title}>
      {toasts.map((toast) => (
        <section
          key={toast.id}
          className={`toast toast--${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
        >
          <p>{toast.message}</p>
          {toast.action && (
            <button
              type="button"
              className="toast__action"
              onClick={toast.action.onClick}
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast__dismiss"
            aria-label={t.shared.notifications.dismiss}
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </section>
      ))}
    </div>
  );
}
