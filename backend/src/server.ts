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
import helmet from "@fastify/helmet";
import {
  closeSessionStore,
  initializeSessionStore,
  requireCsrf,
} from "./utils/session.js";
import packageJson from "../package.json" with { type: "json" };
import authRoutes from "./routes/auth.route.js";
import {
  getCorsOrigins,
  getTrustProxy,
  isSwaggerEnabled,
  validateProductionConfig,
} from "./utils/config.js";
import { applyRateLimit } from "./utils/rate-limit.js";
import { applySecurityHeaders } from "./utils/security-headers.js";
import { startPendingAccountLinkCleanup } from "./utils/account-link-cleanup.js";
import { startOrphanedSocialUserCleanup } from "./utils/orphaned-social-user-cleanup.js";

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

validateProductionConfig();
const corsOrigins = getCorsOrigins();

// server
export const server = Fastify({
  logger: true,
  trustProxy: getTrustProxy(),
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
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await server.register(cookie);
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", "https://*.auth0.com"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: "deny" },
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
  server.addHook("onSend", async (request, reply) => {
    applySecurityHeaders(request, reply);
  });
  server.addHook("onRequest", async (request, reply) => {
    const rateLimitDecision = await applyRateLimit(request, reply);
    if (!rateLimitDecision.allowed) {
      return reply.code(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please retry later.",
      });
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method))
      return requireCsrf(request, reply);
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
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "__Secure-sanny_session",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  if (isSwaggerEnabled()) {
    await server.register(swaggerUI, {
      routePrefix: "/api/v001/swagger",
    });
  }

  // auth0 api registration
  await server.register(fastifyAuth0Api, {
    domain: auth0Config.domain,
    audience: auth0Config.audience,
  });

  // api routes
  await server.register(userRoutes, { prefix: "/api/v001/users" });
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  let stopPendingAccountLinkCleanup: (() => void) | null = null;
  let stopOrphanedSocialUserCleanup: (() => void) | null = null;

  // disconnect from the database when the server is closed
  server.addHook("onClose", async () => {
    stopPendingAccountLinkCleanup?.();
    stopOrphanedSocialUserCleanup?.();
    await closeSessionStore();
    await prisma.$disconnect();
  });

  // start the server
  try {
    await initializeSessionStore();
    stopPendingAccountLinkCleanup = startPendingAccountLinkCleanup();
    stopOrphanedSocialUserCleanup = startOrphanedSocialUserCleanup();
    await prisma.$connect();
    await prisma.$queryRawUnsafe("SELECT 1");
    await server.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
