import { auth0UserExists } from "./auth0-management.js";
import { logSecurityEvent } from "./security-audit.js";
import {
  deleteSelfUserBySub,
  findNonDatabaseConnectionUsers,
} from "../services/user.service.js";

const cleanupIntervalMs = 3_600_000;

type CleanupDeps = {
  findNonDatabaseConnectionUsers: typeof findNonDatabaseConnectionUsers;
  auth0UserExists: typeof auth0UserExists;
  deleteSelfUserBySub: typeof deleteSelfUserBySub;
};

const defaultDeps: CleanupDeps = {
  findNonDatabaseConnectionUsers,
  auth0UserExists,
  deleteSelfUserBySub,
};

export async function cleanUpOrphanedSocialUsers(
  deps: CleanupDeps = defaultDeps,
) {
  const users = await deps.findNonDatabaseConnectionUsers();
  for (const user of users) {
    if (!user.auth0Sub) continue;
    try {
      const exists = await deps.auth0UserExists(user.auth0Sub);
      if (exists) continue;
      await deps.deleteSelfUserBySub(user.auth0Sub);
      logSecurityEvent("orphaned_social_user_deleted", {
        userId: user.id,
        auth0Sub: user.auth0Sub,
      });
    } catch (error) {
      logSecurityEvent("orphaned_social_user_cleanup_failed", {
        userId: user.id,
        auth0Sub: user.auth0Sub,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function startOrphanedSocialUserCleanup() {
  let running = false;
  const cleanUp = async () => {
    if (running) return;
    running = true;
    try {
      await cleanUpOrphanedSocialUsers();
    } catch (error) {
      logSecurityEvent("orphaned_social_user_cleanup_failed", {
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
