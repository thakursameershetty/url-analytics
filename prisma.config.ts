// Loads .env locally; on Railway the variables come from the environment.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// The database URL is read by prisma/schema.prisma (`url = env("DATABASE_URL")`) only
// when Prisma actually connects. Not requiring it here lets `prisma generate` run
// during the build, before any database exists; `migrate deploy` at start-up
// still fails loudly if DATABASE_URL is missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
