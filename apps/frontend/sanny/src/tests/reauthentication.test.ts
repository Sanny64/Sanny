import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginReauthentication,
  isLogoutReturn,
  prepareLogoutUrl,
  restoreLogoutReturnTo,
  takePendingActionCredentials,
} from '../utils/reauthentication.js';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/settings?tab=security');
});

describe('reauthentication', () => {
  it('stores credentials and starts email MFA', () => {
    beginReauthentication('https://api.example.test/', 'email', 'resume-123');

    expect(window.sessionStorage.getItem('sanny:pending-action')).toBe(
      JSON.stringify({ resumeToken: 'resume-123', factor: 'email' })
    );
  });

  it('takes valid pending credentials once', () => {
    window.sessionStorage.setItem(
      'sanny:pending-action',
      JSON.stringify({ resumeToken: 'resume-123', factor: 'mfa' })
    );

    expect(takePendingActionCredentials()).toEqual({
      resumeToken: 'resume-123',
      factor: 'mfa',
    });
    expect(takePendingActionCredentials()).toBeNull();
  });

  it('prepares and restores a same-origin logout return', () => {
    const logoutUrl = prepareLogoutUrl('https://auth.example.test/logout');
    const state = new URL(logoutUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    window.history.replaceState(null, '', `/logout-callback?state=${state}`);
    restoreLogoutReturnTo();

    expect(window.location.pathname).toBe('/settings');
    expect(isLogoutReturn()).toBe(true);
  });
});
