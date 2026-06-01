import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    // Falls back to empty string so `drizzle-kit generate` works offline
    // (generate does not connect to the DB).
    url: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  },
});
