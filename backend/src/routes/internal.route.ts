import type { FastifyInstance } from "fastify";
import { createSafeErrorResponse } from "../utils/safe-error.js";

async function internalRoutes(server: FastifyInstance) {
  server.get("/__nginx_rate_limit", async (_request, reply) => {
    const safe = createSafeErrorResponse(new Error("Rate limit exceeded"), 429);
    return reply
      .header("Retry-After", "60")
      .code(safe.status)
      .send({ error: safe.error, message: safe.message });
  });
}

export default internalRoutes;
