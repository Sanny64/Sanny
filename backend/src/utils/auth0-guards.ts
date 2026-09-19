import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type AccessTokenIdentity,
  AccessTokenValidationError,
  getAccessTokenIdentity,
} from "./access-token.js";

export function requirePermissions(requiredPermissions: string[]) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    let identity: AccessTokenIdentity;

    try {
      identity = getAccessTokenIdentity(request);
    } catch (error) {
      if (error instanceof AccessTokenValidationError) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: error.message,
        });
      }
      throw error;
    }

    const permissions = identity.permissions;

    const hasAllPermissions = requiredPermissions.every((permission) =>
      permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      return reply.code(403).send({
        error: "Forbidden",
        message: `Missing required permissions: ${requiredPermissions.join(", ")}`,
      });
    }
  };
}

export function requireRoles(requiredRoles: string[]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    let identity: AccessTokenIdentity;

    try {
      identity = getAccessTokenIdentity(request);
    } catch (error) {
      if (error instanceof AccessTokenValidationError) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: error.message,
        });
      }
      throw error;
    }

    const roles = identity.roles;

    const hasAllRoles = requiredRoles.every((role) => roles.includes(role));

    if (!hasAllRoles) {
      const missingRoles = requiredRoles.filter(r => !roles.includes(r));
      return reply.code(403).send({
        error: "Forbidden",
        message: `Missing required roles: ${missingRoles.join(", ")}. User has: ${roles.length > 0 ? roles.join(", ") : "(none)"}`,
      });
    }
  };
}
