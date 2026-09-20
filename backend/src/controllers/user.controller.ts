import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { 
    createSelfUserSchema,
    updateSelfUserSchema,
    updateUserRolesSchema,
    updateUserSchema,
    userIdParamSchema,
} from "../schemas/user.schema.js";
import {
  Auth0SubjectConflictError,
  createOrGetSelfUser,
  deleteSelfUserBySub,
  deleteUserById,
  findUserDeletionTarget,
  findSelfUserBySub,
  findUserByEmail,
  findUserById,
  findUserByIdWithAuth0Sub,
  findUsers,
  updateSelfUserBySub,
  updateUserById,
  mergeUserAccounts,
} from "../services/user.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AccessTokenValidationError,
  getAccessTokenIdentity,
} from "../utils/access-token.js";
import {
  Auth0ManagementError,
  deleteAuth0UserBySub,
  updateAuth0UsernameBySub,
  getAllRoles,
  getUserRoles,
  isRoleSyncEnabled,
  sendAuth0PasswordResetEmail,
  syncAuth0UserRolesByName,
} from "../utils/auth0-management.js";
import { destroySessionsForSubject } from "../utils/session.js";
import { createSafeErrorResponse } from "../utils/safe-error.js";
import { logSecurityEvent } from "../utils/security-audit.js";

type CreateSelfUserInput = z.infer<typeof createSelfUserSchema>;
type UpdateSelfUserInput = z.infer<typeof updateSelfUserSchema>;
type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UserIdParamInput = z.infer<typeof userIdParamSchema>;

function getIdentityOrReplyUnauthorized(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    return getAccessTokenIdentity(request);
  } catch (error) {
    if (error instanceof AccessTokenValidationError) {
      void reply.code(401).send({
        error: "Unauthorized",
        message: error.message,
      });
      return null;
    }

    throw error;
  }
}

function fallbackNameFromEmail(email: string): string {
  const [localPart] = email.split("@");
  return localPart && localPart.length > 0 ? localPart : "User";
}

function parseUserId(request: FastifyRequest): number | null {
  const params = request.params as Partial<UserIdParamInput>;
  const userId =
    typeof params.userId === "number" ? params.userId : Number(params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

export async function getUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const query = request.query as Record<string, string | number | undefined>;
    const usersQuery: { page?: string | number; limit?: string | number } = {};

    if (query.page !== undefined) {
      usersQuery.page = query.page;
    }
    if (query.limit !== undefined) {
      usersQuery.limit = query.limit;
    }

    const users = await findUsers(usersQuery);
    return users;
  } catch (err) {
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function getUserByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    const safe = createSafeErrorResponse(
      new Error("Invalid userId parameter"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  try {
    const user = await findUserById(userId);
    if (!user) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    return reply.code(200).send(user);
  } catch (err) {
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function getUserByEmailHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = request.query as { email?: string };

  try {
    const user = await findUserByEmail(query.email ?? "");
    if (!user) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    return reply.code(200).send(user);
  } catch (err) {
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function registerSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const email = identity.email;

  if (!email || !identity.emailVerified) {
    return reply.code(400).send({
      error: "A verified email claim is required for local-account creation.",
    });
  }

  const body = (request.body ?? {}) as CreateSelfUserInput;
  const tokenName = identity.name ?? undefined;
  const providedName =
    typeof body.username === "string" ? body.username.trim() : undefined;
  const finalName = providedName || tokenName || fallbackNameFromEmail(email);

  try {
    const { created, user } = await createOrGetSelfUser({
      auth0Sub: identity.sub,
      email,
      username: finalName,
    });
    return reply.status(created ? 201 : 200).send(user);
  } catch (err) {
    if (err instanceof Auth0SubjectConflictError) {
      const safe = createSafeErrorResponse(err, 409);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function getSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  try {
    const user = await findSelfUserBySub(identity.sub);

    if (!user) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    return reply.code(200).send(user);
  } catch (err) {
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function updateSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const body = request.body as UpdateSelfUserInput;

  try {
    await updateAuth0UsernameBySub(identity.sub, body.username.trim());
    const user = await updateSelfUserBySub(identity.sub, body.username.trim());
    return reply.code(200).send(user);
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const safe = createSafeErrorResponse(err, err.statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function deleteSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const auth0Sub = identity.sub;
  try {
    await deleteAuth0UserBySub(auth0Sub);
    await deleteSelfUserBySub(auth0Sub);
    await destroySessionsForSubject(auth0Sub);
    return reply.code(204).send();
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function requestSelfPasswordResetHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = request.sannySession;
  if (!identity) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }

  try {
    const user = await findSelfUserBySub(identity.sub);
    if (!user) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    await sendAuth0PasswordResetEmail(identity.sub, user.email);
    return reply.code(200).send({ success: true, message: "Password reset email sent" });

  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 400;
      console.error(
        "Auth0 Management API error creating password reset ticket:",
        err.statusCode,
        err.message,
      );
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    console.error("Unexpected error requesting password reset:", err);
    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function updateUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    const safe = createSafeErrorResponse(
      new Error("Invalid userId parameter"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  const body = request.body as UpdateUserInput;

  try {
    const target = await findUserByIdWithAuth0Sub(userId);
    if (!target) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    if (target.auth0Sub) {
      await updateAuth0UsernameBySub(target.auth0Sub, body.username.trim());
    }
    const user = await updateUserById(userId, body);
    return reply.code(200).send(user);
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      logSecurityEvent("admin_user_update_failed", {
        userId,
        statusCode: err.statusCode,
        reason: err.message,
      });
      const safe = createSafeErrorResponse(err, err.statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function deleteUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    return reply.code(400).send({ error: "Invalid userId parameter" });
  }

  try {
    const user = await findUserDeletionTarget(userId);
    if (!user) {
      return reply.code(204).send();
    }

    if (user.auth0Sub) {
      await deleteAuth0UserBySub(user.auth0Sub);
    }
    await deleteUserById(userId);
    if (user.auth0Sub) {
      await destroySessionsForSubject(user.auth0Sub);
    }
    return reply.code(204).send();
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const safe = createSafeErrorResponse(err, err.statusCode || 502);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function updateUserRolesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    const safe = createSafeErrorResponse(
      new Error("Invalid userId parameter"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  const body = request.body as UpdateUserRolesInput;
  const requestedRoles = Array.isArray(body.roles) ? body.roles : [];

  if (!isRoleSyncEnabled()) {
    return reply.code(503).send({
      error: "Role synchronization is disabled",
      message: "Role synchronization is not enabled for this environment.",
    });
  }

  try {
    // Fetch all available roles from Auth0
    const allRoles = await getAllRoles();
    const availableRoleNames = new Set(allRoles.map((r) => r.name));

    // Validate requested roles exist in Auth0
    const invalidRoles = requestedRoles.filter(
      (role) => !availableRoleNames.has(role),
    );
    if (invalidRoles.length > 0) {
      const safe = createSafeErrorResponse(new Error("Role not found"), 400);
      return reply.code(safe.status).send({
        error: safe.error,
        message: `Roles not found in Auth0: ${invalidRoles.join(", ")}`,
      });
    }

    // Find user and update roles
    const user = await findUserByIdWithAuth0Sub(userId);
    if (!user || !user.auth0Sub) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    return reply
      .code(200)
      .send(await syncAuth0UserRolesByName(user.auth0Sub, requestedRoles));
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function requestUserPasswordResetHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);
  if (!userId) {
    const safe = createSafeErrorResponse(
      new Error("Invalid userId parameter"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  try {
    const user = await findUserById(userId);
    if (!user) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    const userWithAuth0Sub = await findUserByIdWithAuth0Sub(userId);
    if (!userWithAuth0Sub || !userWithAuth0Sub.auth0Sub) {
      const safe = createSafeErrorResponse(new Error("User not linked to Auth0"), 400);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    await sendAuth0PasswordResetEmail(userWithAuth0Sub.auth0Sub, user.email);
    // Return 200 instead of 204 for consistency and better frontend handling
    return reply.code(200).send({ success: true, message: "Password reset email sent" });
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 400;
      console.error(
        "Auth0 Management API error creating password reset ticket:",
        err.statusCode,
        err.message,
      );
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    console.error("Unexpected error requesting password reset:", err);
    const safe = createSafeErrorResponse(err, 400);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function linkUserAccountsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const body = request.body as {
    primaryAuth0Sub?: string;
    secondaryAuth0Sub?: string;
  };

  const primaryAuth0Sub = body.primaryAuth0Sub?.trim();
  const secondaryAuth0Sub = body.secondaryAuth0Sub?.trim();

  if (!primaryAuth0Sub || !secondaryAuth0Sub) {
    const safe = createSafeErrorResponse(
      new Error("primaryAuth0Sub and secondaryAuth0Sub are required"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  const currentUserSub = identity.sub;
  if (
    currentUserSub !== primaryAuth0Sub &&
    currentUserSub !== secondaryAuth0Sub
  ) {
    const safe = createSafeErrorResponse(
      new Error("You must own one of the accounts being linked"),
      403,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  try {
    const mergedUser = await mergeUserAccounts(
      primaryAuth0Sub,
      secondaryAuth0Sub,
    );
    return reply.code(200).send(mergedUser);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      const safe = createSafeErrorResponse(err, 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function getAvailableRolesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const roles = await getAllRoles();
    return reply.code(200).send({ roles: roles.map((r) => r.name) });
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      console.error(
        "Auth0 Management API error fetching roles:",
        err.statusCode,
        err.message,
      );
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    console.error("Unexpected error fetching roles:", err);
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}

export async function getUserRolesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    const safe = createSafeErrorResponse(
      new Error("Invalid userId parameter"),
      400,
    );
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }

  try {
    const user = await findUserByIdWithAuth0Sub(userId);
    if (!user || !user.auth0Sub) {
      const safe = createSafeErrorResponse(new Error("User not found"), 404);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    const roles = await getUserRoles(user.auth0Sub);
    return reply.code(200).send({ roles: roles.map((r) => r.name) });
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      console.error(
        "Auth0 Management API error fetching user roles:",
        err.statusCode,
        err.message,
      );
      const safe = createSafeErrorResponse(err, statusCode);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }

    console.error("Unexpected error fetching user roles:", err);
    const safe = createSafeErrorResponse(err, 500);
    return reply
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  }
}
