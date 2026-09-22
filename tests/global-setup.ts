import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DIRECT_URL = process.env.TEST_DIRECT_URL;

if (!TEST_DATABASE_URL || !TEST_DIRECT_URL) {
  throw new Error(
    "TEST_DATABASE_URL and TEST_DIRECT_URL must be set (see .env.example).",
  );
}

// Machine-local networking workaround (see .env NODE_IPV4_ONLY). Kept in sync
// with vitest.config.ts so the prisma CLI subprocess uses the same resolved
// connectivity as the test workers.
const ipv4OnlyArgs =
  process.env.NODE_IPV4_ONLY === "1"
    ? "--dns-result-order=ipv4first --no-network-family-autoselection "
    : "";

/**
 * Ensures the test database schema is up to date (idempotent) before the
 * test workers start. The env vars set here DO NOT leak to workers; they are
 * only used to run prisma against the dedicated test database. Both the
 * runtime and direct endpoints are pinned to the test database so a migration
 * can never be applied to the main application database.
 */
export default function globalSetup() {
  const cmd = `${process.execPath} ${ipv4OnlyArgs}node_modules/prisma/build/index.js migrate deploy`;
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DIRECT_URL,
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      execSync(cmd, { cwd: path.resolve(__dirname, ".."), env, stdio: "pipe" });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`[test] migrate deploy failed (attempt ${attempt}), retrying...`);
      execSync("sleep 3", { stdio: "pipe" });
    }
  }
  console.log("[test] database schema up to date");
}