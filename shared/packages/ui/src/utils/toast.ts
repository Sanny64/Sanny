export type ToastKind = "error" | "warning" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type ToastOptions = {
  kind?: ToastKind;
  durationMs?: number;
  action?: ToastAction;
};

const maxToasts = 5;
let nextToastId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function notifySubscribers() {
  for (const listener of listeners) listener();
}

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

export function dismissToast(id: number) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const nextToasts = toasts.filter((toast) => toast.id !== id);
  if (nextToasts.length === toasts.length) return;
  toasts = nextToasts;
  notifySubscribers();
}

export function showToast(message: string, options: ToastOptions = {}) {
  const id = ++nextToastId;
  const toast: Toast = {
    id,
    message,
    kind: options.kind ?? "error",
    ...(options.action ? { action: options.action } : {}),
  };
  toasts = [...toasts, toast];

  while (toasts.length > maxToasts) {
    const oldest = toasts[0];
    if (oldest) dismissToast(oldest.id);
  }

  const durationMs = options.durationMs ?? 6_000;
  if (durationMs > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), durationMs),
    );
  }

  notifySubscribers();
  return id;
}

export function showErrorToast(error: unknown, fallbackMessage: string) {
  return showToast(error instanceof Error ? error.message : fallbackMessage, {
    kind:
      error instanceof Error && "status" in error && error.status === 429
        ? "warning"
        : "error",
  });
}
