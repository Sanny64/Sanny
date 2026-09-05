import {
  getSelfUserHandler,
  deleteSelfUserHandler,
  requestSelfPasswordResetHandler,
  requestUserPasswordResetHandler,
  deleteUserHandler,
  getUserByIdHandler,
  getUserByEmailHandler,
  getUsersHandler,
  registerSelfUserHandler,
  updateSelfUserHandler,
  updateUserRolesHandler,
  updateUserHandler,
  linkUserAccountsHandler,
} from "../controllers/user.controller.js";
import {
  createSelfUserSchema,
  createUserResponseSchema,
  updateUserRolesResponseSchema,
  updateUserRolesSchema,
  updateSelfUserSchema,
  updateUserSchema,
  userIdParamSchema,
  userEmailQuerySchema,
  linkUserAccountsSchema,
} from "../schemas/user.schema.js";
import type { FastifyInstance } from "fastify";
import { requirePermissions, requireRoles } from "../utils/auth0-guards.js";
import {
  requireRecentAuthentication,
  requireMfaAuthentication,
  requireSession,
} from "../utils/session.js";

async function userRoutes(server: FastifyInstance) {
  // self read
  server.get(
    "/me",
    {
      preHandler: [requireSession],
      schema: {
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    getSelfUserHandler,
  );

  // self create
  server.post(
    "/me",
    {
      preHandler: [requireSession],
      schema: {
        body: createSelfUserSchema,
        security: [{ sessionCookie: [] }],
        response: {
          201: createUserResponseSchema, // user created
        },
      },
    },
    registerSelfUserHandler,
  );

  // self update
  server.patch(
    "/me",
    {
      preHandler: [requireSession, requirePermissions(["update:me"])],
      schema: {
        body: updateSelfUserSchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    updateSelfUserHandler,
  );

  // self delete
  server.delete(
    "/me",
    {
      preHandler: [
        requireSession,
        requirePermissions(["delete:me"]),
        requireMfaAuthentication(),
      ],
      schema: {
        security: [{ sessionCookie: [] }],
      },
    },
    deleteSelfUserHandler,
  );

  server.post(
    "/me/password-reset",
    {
      preHandler: [requireSession],
      schema: {
        security: [{ sessionCookie: [] }],
      },
    },
    requestSelfPasswordResetHandler,
  );

  // link secondary account into primary
  server.post(
    "/link-account",
    {
      preHandler: [requireSession, requireRecentAuthentication()],
      schema: {
        body: linkUserAccountsSchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    linkUserAccountsHandler,
  );

  server.get(
    "/lookup",
    {
      preHandler: [
        requireSession,
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        querystring: userEmailQuerySchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    getUserByEmailHandler,
  );

  server.get(
    "/:userId",
    {
      preHandler: [
        requireSession,
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    getUserByIdHandler,
  );

  // admin list users
  server.get(
    "/list",
    {
      preHandler: [
        requireSession,
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 50 },
          },
          additionalProperties: false,
        },
        security: [{ sessionCookie: [] }],
      },
    },
    getUsersHandler,
  );

  // admin update user
  server.patch(
    "/:userId",
    {
      preHandler: [
        requireSession,
        requirePermissions(["write:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        body: updateUserSchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: createUserResponseSchema,
        },
      },
    },
    updateUserHandler,
  );

  // admin synchronize user roles with Auth0
  server.patch(
    "/:userId/roles",
    {
      preHandler: [
        requireSession,
        requirePermissions(["write:users"]),
        requireRoles(["admin"]),
        requireMfaAuthentication(),
      ],
      schema: {
        params: userIdParamSchema,
        body: updateUserRolesSchema,
        security: [{ sessionCookie: [] }],
        response: {
          200: updateUserRolesResponseSchema,
        },
      },
    },
    updateUserRolesHandler,
  );

  server.post(
    "/:userId/password-reset",
    {
      preHandler: [
        requireSession,
        requirePermissions(["write:users"]),
        requireRoles(["admin"]),
        requireMfaAuthentication(),
      ],
      schema: {
        params: userIdParamSchema,
        security: [{ sessionCookie: [] }],
      },
    },
    requestUserPasswordResetHandler,
  );

  server.delete(
    "/:userId",
    {
      preHandler: [
        requireSession,
        requirePermissions(["delete:users"]),
        requireRoles(["admin"]),
        requireMfaAuthentication(),
      ],
      schema: {
        params: userIdParamSchema,
        security: [{ sessionCookie: [] }],
      },
    },
    deleteUserHandler,
  );
}

export default userRoutes;
