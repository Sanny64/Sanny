import "dotenv/config";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import userRoutes from "./routes/user.route.js";
import prisma from "./utils/prisma.js";
import fjwt from "@fastify/jwt";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform
} from "fastify-type-provider-zod";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import packageJson from "../package.json" with { type: "json" };
import authRoutes from "./routes/auth.route.js";

const version = packageJson.version;

// server
export const server = Fastify({
    logger: true
});

// jwt
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is not set");
}

server.register(fjwt, {
    secret: jwtSecret
});

// authentication
server.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            return reply.code(401).send({
                error: "Unauthorized",
                message: err instanceof Error ? err.message : "Invalid or missing token",
            });
        }
    },
);

// create a type provider for Zod
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// healthcheck
server.get('/healthcheck', async function () {
    return { status: 'OK' };
});

async function main() {
    await server.register(swagger, { 
        openapi: {
            info: {
                title: 'Sanny API',
                description: 'Sanny API Swagger documentation',
                version: version
            }
        },
        transform: jsonSchemaTransform,
    });

    await server.register(swaggerUI, {
        routePrefix: '/api/v001/swagger',
    });

    // api routes
    await server.register(userRoutes, { prefix: '/api/v001/users' });
    await server.register(authRoutes, { prefix: '/api/v001/auth' });

    // disconnect from the database when the server is closed
    server.addHook("onClose", async () => {
        await prisma.$disconnect();
    });

    // start the server
    try {
        await prisma.$connect();
        await prisma.$queryRawUnsafe("SELECT 1");
        await server.listen({ port: 3000, host: '0.0.0.0' });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

main()