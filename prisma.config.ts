/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Prisma 7 config accepts adapter at runtime; its bundled types are stale.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

// Runtime (prisma client) uses the pooled DATABASE_URL. Prisma CLI commands
// that talk to Postgres directly (migrate / db) use the direct endpoint, which
// Neon needs for transactional DDL; falls back to DATABASE_URL when DIRECT_URL
// is unset.
const cliAdapter = () =>
  new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    adapter: cliAdapter,
  },
  db: {
    adapter: cliAdapter,
  },
});