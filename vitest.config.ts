import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests run against a dedicated Neon test database (never the main database).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DIRECT_URL = process.env.TEST_DIRECT_URL;

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "TEST_DATABASE_URL and TEST_DIRECT_URL must be set (see .env.example).",
  );
}

// Machine-local networking workaround (see .env NODE_IPV4_ONLY). Some dev
// hosts have no IPv6 route while DNS returns AAAA for the Neon host; Node's
// network-family autoselection stalls and node-postgres fails to connect. The
// flags below pin resolution to IPv4 for forked test workers. Harmless on
// IPv4/IPv6-capable networks.
const ipv4OnlyFlags =
  process.env.NODE_IPV4_ONLY === "1"
    ? ["--dns-result-order=ipv4first", "--no-network-family-autoselection"]
    : undefined;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Services import "server-only" to keep RSC-safe code out of the client;
      // it is a no-op in the Node test environment.
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DIRECT_URL,
      NODE_ENV: "test",
      SESSION_COOKIE_NAME: "rewardhub_session",
      SESSION_TTL_DAYS: "30",
      EMAIL_TRANSPORT: "log",
      APP_URL: "http://localhost:3000",
    },
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    execArgv: ipv4OnlyFlags,
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 60000,
  },
});