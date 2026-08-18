import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateUserInput, LoginInput } from "../types/inputs.js";
import { createUser, findUserByEmail, findUsers } from "../services/user.service.js";
import { verifyPassword } from "../utils/hash.js";
import { server } from "../server.js";

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

export async function loginHandler(request: FastifyRequest<{
    Body: LoginInput
}>, 
reply: FastifyReply
) {
    const body = request.body;

    // find user by email 
    const user = await findUserByEmail(body.email);

    if (!user) {
        return reply.code(401).send({
            error: "Invalid email or password"
        })
    }

    // verify password
    const correctPassword = await verifyPassword(body.password, user.password);

    // generate and return JWT token
    if (correctPassword) {
        const { password, ...rest } = user;
        const accessToken = server.jwt.sign(rest, { expiresIn: "1h" });
        return reply.code(200).send({ accessToken });
    } else {
        return reply.code(401).send({
            error: "Invalid email or password"
        })
    }
}

export async function getUsersHandler(request: FastifyRequest, reply: FastifyReply) {
    const users = await findUsers();
    return users;
}