import {
  getSelfUserHandler,
  deleteSelfUserHandler,
  deleteUserHandler,
  getUserByIdHandler,
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
  linkUserAccountsSchema,
} from "../schemas/user.schema.js";
import type { FastifyInstance } from "fastify";
import { requirePermissions, requireRoles } from "../utils/auth0-guards.js";
import {
  requireRecentAuthentication,
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
      preHandler: [
        requireSession,
        requirePermissions(["update:me"]),
        requireRecentAuthentication(),
      ],
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
        requireRecentAuthentication(),
      ],
      schema: {
        security: [{ sessionCookie: [] }],
      },
    },
    deleteSelfUserHandler,
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
        requireRecentAuthentication(),
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
        requireRecentAuthentication(),
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

  server.delete(
    "/:userId",
    {
      preHandler: [
        requireSession,
        requirePermissions(["delete:users"]),
        requireRoles(["admin"]),
        requireRecentAuthentication(),
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
