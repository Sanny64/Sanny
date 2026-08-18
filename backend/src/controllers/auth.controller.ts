import type { FastifyReply, FastifyRequest } from "fastify";
import type { LoginInput } from "../types/inputs.js";
import { verifyPassword } from "../utils/hash.js";
import { server } from "../server.js";
import { findUserByEmailWithPassword } from "../services/user.service.js";

const timingSideChannelSafetyHash = "$argon2id$v=19$m=19456,p=1,t=2$zkUacxN6nqt+0gmtN/ZqLA$1eX8YRvxeJJTCL5ZY8fowhDMa+orZn5oOf4OhBpaJJA"

export async function loginHandler(request: FastifyRequest<{
    Body: LoginInput
}>, 
reply: FastifyReply
) {
    const body = request.body;

    // find user by email 
    const user = await findUserByEmailWithPassword(body.email);

    // verify password
    const correctPassword = await verifyPassword(
        body.password,
        user?.password ?? timingSideChannelSafetyHash
    );

     if (!user || !correctPassword) {
        return reply.code(401).send({
            error: "Invalid email or password"
        })
    }

    // generate and return JWT token
    if (correctPassword) {
        const { password, ...rest } = user;
        const accessToken = server.jwt.sign(
            { id: user.id, email: user.email, name: user.name }, { expiresIn: "10min" });
        return reply.code(200).send({ accessToken });
    } else {
        return reply.code(401).send({
            error: "Invalid email or password"
        })
    }
}