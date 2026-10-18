import { motion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { useLanguage, translations } from "@sanny/i18n";
import { dismissToast, getToasts, subscribeToToasts } from "../utils/toast";
import "../styles/toasts.css";

export default function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);
  const t = translations[useLanguage().language];

  return (
    <div
      className="toast-viewport"
      role="region"
      aria-label={t.shared.notifications.title}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
        >
          <motion.section
            key={toast.attentionVersion}
            className={`toast toast--${toast.kind}`}
            initial={toast.attentionVersion === 0 ? false : { x: 0 }}
            animate={
              toast.attentionVersion === 0
                ? { x: 0 }
                : { x: [0, -6, 6, -4, 4, 0] }
            }
            transition={{ duration: 0.35 }}
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
          </motion.section>
        </div>
      ))}
    </div>
  );
}
