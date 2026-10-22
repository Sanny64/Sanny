import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccountLinkContinuationUrl } from '../utils/account-link-continuation.js';

test('continuation uses the backend custom Auth0 domain and preserves signed parameters', () => {
  const previousDomain = process.env.AUTH0_DOMAIN;
  process.env.AUTH0_DOMAIN = 'auth.example.test';
  try {
    const input = {
      state: 'opaque-state',
      decision: 'confirm' as const,
      primaryUserId: 'google-oauth2|primary',
      secondaryUserId: 'auth0|secondary',
      temporaryUserId: 'google-oauth2|primary',
      proof: 'payload.signature',
    };
    const url = new URL(getAccountLinkContinuationUrl(input));
    assert.equal(url.origin, 'https://auth.example.test');
    assert.equal(url.pathname, '/continue');
    assert.deepEqual(Object.fromEntries(url.searchParams), input);
    const cancel = new URL(
      getAccountLinkContinuationUrl({
        state: input.state,
        decision: 'cancel',
        primaryUserId: input.primaryUserId,
        secondaryUserId: input.secondaryUserId,
      })
    );
    assert.equal(cancel.searchParams.has('proof'), false);
    assert.equal(cancel.searchParams.has('temporaryUserId'), false);
  } finally {
    if (previousDomain === undefined) delete process.env.AUTH0_DOMAIN;
    else process.env.AUTH0_DOMAIN = previousDomain;
  }
});
