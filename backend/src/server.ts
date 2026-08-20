import "dotenv/config";
import Fastify from "fastify";
import userRoutes from "./routes/user.route.js";
import prisma from "./utils/prisma.js";
import fastifyAuth0Api from "@auth0/auth0-fastify-api";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { requireCsrf } from "./utils/session.js";
import packageJson from "../package.json" with { type: "json" };
import authRoutes from "./routes/auth.route.js";

const version = packageJson.version;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable must be set`);
  }
  return value;
}

const auth0Config: { domain: string; audience: string } = {
  domain: getRequiredEnv("AUTH0_DOMAIN"),
  audience: getRequiredEnv("AUTH0_AUDIENCE"),
};

const defaultCorsOrigins = [
  "https://sanny64.de",
  "https://auth.sanny64.de",
  "https://www.sanny64.de",
  "http://localhost:5173",
  "http://localhost:5174",
];

const corsOrigins = (process.env.CORS_ORIGINS ?? defaultCorsOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGINS must contain exact origins; wildcard origins are not allowed");
}

// server
export const server = Fastify({
  logger: true,
});

// create a type provider for Zod
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// healthcheck
server.get("/healthcheck", async function () {
  return { status: "OK" };
});

async function main() {
  await server.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });
  await server.register(cookie);
  server.addHook("onRequest", async (request, reply) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method) && !request.url.includes("/auth")) await requireCsrf(request, reply);
  });

  // swagger registration
  await server.register(swagger, {
    openapi: {
      info: {
        title: "Sanny API",
        description: "Sanny API Swagger documentation",
        version: version,
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await server.register(swaggerUI, {
    routePrefix: "/api/v001/swagger",
  });

  // auth0 api registration
  await server.register(fastifyAuth0Api, {
    domain: auth0Config.domain,
    audience: auth0Config.audience,
  });

  // api routes
  await server.register(userRoutes, { prefix: "/api/v001/users" });
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  // disconnect from the database when the server is closed
  server.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  // start the server
  try {
    await prisma.$connect();
    await prisma.$queryRawUnsafe("SELECT 1");
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
