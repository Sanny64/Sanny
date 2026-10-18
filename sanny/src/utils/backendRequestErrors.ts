import { retriggerToast, showErrorToast, showToast } from "@sanny/ui";

const backendOfflineToastDurationMs = 4_000;
let backendOfflineToastTimeout: ReturnType<typeof setTimeout> | undefined;
let backendOfflineToastId: number | undefined;

export function showBackendRequestError(
  error: unknown,
  backendOfflineMessage: string,
  fallbackMessage: string,
) {
  if (error instanceof TypeError) {
    if (backendOfflineToastTimeout !== undefined) {
      if (
        backendOfflineToastId !== undefined &&
        retriggerToast(backendOfflineToastId)
      ) {
        return;
      }
      clearTimeout(backendOfflineToastTimeout);
      backendOfflineToastTimeout = undefined;
    }

    backendOfflineToastId = showToast(backendOfflineMessage, {
      durationMs: backendOfflineToastDurationMs,
    });
    backendOfflineToastTimeout = setTimeout(() => {
      backendOfflineToastTimeout = undefined;
      backendOfflineToastId = undefined;
    }, backendOfflineToastDurationMs);
    return;
  }

  showErrorToast(error, fallbackMessage);
}
