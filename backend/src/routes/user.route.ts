import { 
    getUsersHandler, 
    registerUserHandler 
} from "../controllers/user.controller.js";
import {
    createUserResponseSchema,
    createUserSchema,
} from "../schemas/user.schema.js";
import type { FastifyInstance } from "fastify";

async function userRoutes(server: FastifyInstance) {
    server.post('/create',
        {
            schema: {
                body: createUserSchema,
                response: {
                    201: createUserResponseSchema,
                }
            }
        }, 
        registerUserHandler,
    );

    server.get('/', {
        preHandler: [server.authenticate],
    }, getUsersHandler);
}

export default userRoutes;