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
} from "../controllers/user.controller.js";
import {
  createSelfUserSchema,
  createUserResponseSchema,
  updateUserRolesResponseSchema,
  updateUserRolesSchema,
  updateSelfUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from "../schemas/user.schema.js";
import type { FastifyInstance } from "fastify";
import { requirePermissions, requireRoles } from "../utils/auth0-guards.js";

async function userRoutes(server: FastifyInstance) {
  // self read
  server.get(
    "/me",
    {
      preHandler: [server.requireAuth()],
      schema: {
        security: [{ bearerAuth: [] }],
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
      preHandler: [server.requireAuth()],
      schema: {
        body: createSelfUserSchema,
        security: [{ bearerAuth: [] }],
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
      preHandler: [server.requireAuth(), requirePermissions(["update:me"])],
      schema: {
        body: updateSelfUserSchema,
        security: [{ bearerAuth: [] }],
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
      preHandler: [server.requireAuth(), requirePermissions(["delete:me"])],
      schema: {
        security: [{ bearerAuth: [] }],
      },
    },
    deleteSelfUserHandler,
  );

  server.get(
    "/:userId",
    {
      preHandler: [
        server.requireAuth(),
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        security: [{ bearerAuth: [] }],
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
        server.requireAuth(),
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        security: [{ bearerAuth: [] }],
      },
    },
    getUsersHandler,
  );

  // admin update user
  server.patch(
    "/:userId",
    {
      preHandler: [
        server.requireAuth(),
        requirePermissions(["write:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        body: updateUserSchema,
        security: [{ bearerAuth: [] }],
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
        server.requireAuth(),
        requirePermissions(["write:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        body: updateUserRolesSchema,
        security: [{ bearerAuth: [] }],
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
        server.requireAuth(),
        requirePermissions(["delete:users"]),
        requireRoles(["admin"]),
      ],
      schema: {
        params: userIdParamSchema,
        security: [{ bearerAuth: [] }],
      },
    },
    deleteUserHandler,
  );
}

export default userRoutes;
