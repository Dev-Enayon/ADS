import { beforeEach } from "vitest";
import { prisma } from "../src/lib/db";

/** Wipe every application table (FK-safe via CASCADE) so each test starts clean. */
export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations')
    ORDER BY tablename
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await resetDb();
});