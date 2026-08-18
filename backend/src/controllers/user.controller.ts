import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateUserInput } from "../types/inputs.js";
import { createUser, findUsers } from "../services/user.service.js";

export async function registerUserHandler(
    request: FastifyRequest<{
        Body: CreateUserInput
    }>, 
    reply: FastifyReply) {

    const body = request.body;

    try {

        const user = await createUser(body);
        return reply.status(201).send(user);

    } catch (err) {

        const message = err instanceof Error ? err.message : "Unknown error";
        return reply.code(400).send({ error: message }); // replace with appropriate error handling

    }
}

export async function getUsersHandler(request: FastifyRequest, reply: FastifyReply) {
    const users = await findUsers();
    return users;
}