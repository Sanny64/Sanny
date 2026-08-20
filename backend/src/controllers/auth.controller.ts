import type { FastifyReply, FastifyRequest } from "fastify";
import {
    type AccessTokenIdentity,
    AccessTokenValidationError,
    getAccessTokenIdentity,
} from "../utils/access-token.js";

export async function getProfileHandler(request: FastifyRequest, reply: FastifyReply) {
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

    const profile = {
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        roles: identity.roles,
        permissions: identity.permissions,
    };

    return reply.code(200).send(profile);
}