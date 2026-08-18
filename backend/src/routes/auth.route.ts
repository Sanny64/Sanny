import { loginHandler } from "../controllers/auth.controller.js";
import {
    loginSchema,
    loginResponseSchema
} from "../schemas/auth.schema.js";
import type { FastifyInstance } from "fastify";

async function authRoutes(server: FastifyInstance) {
    server.post('/', {
        schema: {
            body: loginSchema,
            response: {
                200: loginResponseSchema,
            }
        }
    }, loginHandler);
}

export default authRoutes;