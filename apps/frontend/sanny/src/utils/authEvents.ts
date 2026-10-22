export const authChangedEvent = 'sanny:auth-changed';

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(authChangedEvent));
}
