import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The account-linking proof popup (`AccountLinkingProofPage`) posts the
// signed proof back to the opener window and only does so if React Router
// actually renders it at `/account-link-proof-complete` -- the exact
// pathname `getAccountLinkProofCompletionUrl` in auth.route.ts redirects the
// popup to. If this route is missing, the popup's useEffect never runs, so
// it never broadcasts the proof or closes itself: the main window is stuck
// on `/confirm-linking` forever and no account gets linked.
const appTsxPath = fileURLToPath(
  new URL("../../../login/src/App.tsx", import.meta.url),
);

test("login app registers both the confirm-linking and proof-complete routes", async () => {
  const source = await readFile(appTsxPath, "utf8");

  assert.match(source, /path="\/confirm-linking"/);
  assert.match(source, /element=\{<AccountLinkingPage \/>\}/);
  assert.match(source, /path="\/account-link-proof-complete"/);
  assert.match(source, /element=\{<AccountLinkingProofPage \/>\}/);
});
