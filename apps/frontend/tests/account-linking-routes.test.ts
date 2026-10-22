import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'vitest';

test('auth app registers the account-linking completion routes', async () => {
  const source = await readFile(
    resolve(process.cwd(), 'apps/frontend/auth/src/App.tsx'),
    'utf8'
  );

  assert.match(
    source,
    /path:\s*["']\/confirm-linking["'],\s*element:\s*<AccountLinkingPage \/>/
  );
  assert.match(
    source,
    /path:\s*["']\/account-link-proof-complete["'],\s*element:\s*<AccountLinkingProofPage \/>/
  );
  assert.match(
    source,
    /path:\s*["']\/account-link-proof-resume["'],\s*element:\s*<AccountLinkingResumePage \/>/
  );
});
