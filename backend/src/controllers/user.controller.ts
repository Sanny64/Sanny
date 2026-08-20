import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreateSelfUserInput,
  UpdateSelfUserInput,
  UpdateUserRolesInput,
  UpdateUserInput,
  UserIdParamInput,
} from "../types/inputs.js";
import {
  createOrGetSelfUser,
  deleteSelfUserByEmail,
  deleteUserById,
  findSelfUserByEmail,
  findUserById,
  findUsers,
  updateSelfUserByEmail,
  updateUserById,
} from "../services/user.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AccessTokenValidationError,
  getAccessTokenIdentity,
} from "../utils/access-token.js";
import {
  Auth0ManagementError,
  deleteAuth0UserBySub,
} from "../utils/auth0-management.js";

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
  const users = await findUsers();
  return users;
}

export async function getUserByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    return reply.code(400).send({ error: "Invalid userId parameter" });
  }

  const user = await findUserById(userId);
  if (!user) {
    return reply.code(404).send({ error: "User not found" });
  }

  return reply.code(200).send(user);
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

  if (!email) {
    return reply.code(400).send({
      error:
        "Email claim missing from access token. Configure AUTH0_EMAIL_CLAIM or include a namespaced email claim.",
    });
  }

  const body = (request.body ?? {}) as CreateSelfUserInput;
  const tokenName = identity.name ?? undefined;
  const providedName =
    typeof body.name === "string" ? body.name.trim() : undefined;
  const finalName = providedName || tokenName || fallbackNameFromEmail(email);

  const { created, user } = await createOrGetSelfUser({
    email,
    name: finalName,
  });
  return reply.status(created ? 201 : 200).send(user);
}

export async function getSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const email = identity.email;

  if (!email) {
    return reply.code(400).send({
      error:
        "Email claim missing from access token. Configure AUTH0_EMAIL_CLAIM or include a namespaced email claim.",
    });
  }

  const user = await findSelfUserByEmail(email);

  if (!user) {
    return reply.code(404).send({ error: "User not found" });
  }

  return reply.code(200).send(user);
}

export async function updateSelfUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const identity = getIdentityOrReplyUnauthorized(request, reply);
  if (!identity) {
    return;
  }

  const email = identity.email;

  if (!email) {
    return reply.code(400).send({ error: "Email claim missing from access token" });
  }

  const body = request.body as UpdateSelfUserInput;

  try {
    const user = await updateSelfUserByEmail(email, body.name.trim());
    return reply.code(200).send(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return reply.code(404).send({ error: "User not found" });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: message });
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
  const email = identity.email;

  if (!email) {
    return reply.code(400).send({ error: "Email claim missing from access token" });
  }

  try {
    await deleteAuth0UserBySub(auth0Sub);
    await deleteSelfUserByEmail(email);
    return reply.code(204).send();
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      return reply.code(statusCode).send({ error: err.message });
    }

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return reply.code(404).send({ error: "User not found" });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: message });
  }
}

export async function updateUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    return reply.code(400).send({ error: "Invalid userId parameter" });
  }

  const body = request.body as UpdateUserInput;

  try {
    const user = await updateUserById(userId, body);
    return reply.code(200).send(user);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return reply.code(404).send({ error: "User not found" });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: message });
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
    const user = await findUserById(userId);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    await deleteUserById(userId);
    return reply.code(204).send();
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      return reply.code(statusCode).send({ error: err.message });
    }

    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return reply.code(404).send({ error: "User not found" });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: message });
  }
}

export async function updateUserRolesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = parseUserId(request);

  if (!userId) {
    return reply.code(400).send({ error: "Invalid userId parameter" });
  }

  const body = request.body as UpdateUserRolesInput;
  const requestedRoles = Array.isArray(body.roles) ? body.roles : [];

  try {
    const user = await findUserById(userId);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.code(501).send({
      error: "Auth0 role synchronization requires an Auth0 subject",
    });
  } catch (err) {
    if (err instanceof Auth0ManagementError) {
      const statusCode =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502;
      return reply.code(statusCode).send({ error: err.message });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return reply.code(400).send({ error: message });
  }
}
