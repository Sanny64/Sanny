import { deleteAuth0UserBySub } from "./auth0-management.js";
import { claimExpiredPendingAccountLinks } from "./session.js";
import { logSecurityEvent } from "./security-audit.js";

const cleanupIntervalMs = 60_000;

export async function cleanUpExpiredPendingAccountLinks() {
  const links = await claimExpiredPendingAccountLinks();
  for (const link of links) {
    await deleteAuth0UserBySub(link.temporaryUserId);
    logSecurityEvent("pending_account_link_expired", {
      primaryUserId: link.primaryUserId,
      secondaryUserId: link.secondaryUserId,
      temporaryUserId: link.temporaryUserId,
    });
  }
}

export function startPendingAccountLinkCleanup() {
  let running = false;
  const cleanUp = async () => {
    if (running) return;
    running = true;
    try {
      await cleanUpExpiredPendingAccountLinks();
    } catch (error) {
      logSecurityEvent("pending_account_link_cleanup_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };
  void cleanUp();
  const interval = setInterval(() => void cleanUp(), cleanupIntervalMs);
  interval.unref();
  return () => clearInterval(interval);
}
