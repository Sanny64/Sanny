import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { recordDatabaseQuery } from "./metrics.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Add it to backend/.env before starting the API.",
  );
}

const adapter = new PrismaMariaDb(databaseUrl);

const prisma = new PrismaClient({
  adapter,
  omit: {
    user: {
      password: true,
    },
  },
}).$extends({
  name: "sanny-database-metrics",
  query: {
    async $allOperations({ operation, args, query }) {
      const startedAt = performance.now();
      try {
        const result = await query(args);
        recordDatabaseQuery(
          operation,
          true,
          (performance.now() - startedAt) / 1000,
        );
        return result;
      } catch (error) {
        recordDatabaseQuery(
          operation,
          false,
          (performance.now() - startedAt) / 1000,
        );
        throw error;
      }
    },
  },
});

export default prisma;
