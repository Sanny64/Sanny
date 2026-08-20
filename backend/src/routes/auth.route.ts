import { getProfileHandler } from "../controllers/auth.controller.js";
import {
    meResponseSchema,
} from "../schemas/auth.schema.js";
import type { FastifyInstance } from "fastify";

async function authRoutes(server: FastifyInstance) {
    server.get('/me', {
        preHandler: [server.requireAuth()],
        schema: {
            security: [{ bearerAuth: [] }],
            description: "Returns the authenticated user's profile.",
            response: {
                200: meResponseSchema,
            }
        }
    }, getProfileHandler);
}

export default authRoutes;