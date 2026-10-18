import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type AccessTokenIdentity,
  AccessTokenValidationError,
  getAccessTokenIdentity,
} from "../utils/access-token.js";
import { createSafeErrorResponse } from "../utils/safe-error.js";
import { SESSION_TTL_MS } from "../utils/session.js";

export async function getProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  let identity: AccessTokenIdentity;

  try {
    identity = getAccessTokenIdentity(request);
  } catch (error) {
    if (error instanceof AccessTokenValidationError) {
      const safe = createSafeErrorResponse(error, 401);
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
    throw error;
  }

  const profile = {
    sub: identity.sub,
    email: identity.email,
    email_verified: identity.emailVerified,
    name: identity.name,
    roles: identity.roles,
    permissions: identity.permissions,
  };

  if (request.sannySessionRecord) {
    reply.header(
      "X-Session-Expires-At",
      String(request.sannySessionRecord.createdAt + SESSION_TTL_MS),
    );
  }

  return reply.code(200).send(profile);
}
