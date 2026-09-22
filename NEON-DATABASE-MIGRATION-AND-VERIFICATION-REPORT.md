# NEON DATABASE MIGRATION & VERIFICATION REPORT

Date: Sep 22, 2026
Project: RewardHub (Prisma 7.10 driver-adapter stack, Next.js 16, Node v24.19.0)

## 1. Objective

Safely migrate the application database from local PostgreSQL (unavailable) to
Neon PostgreSQL, without rebuilding or rewriting Part 1 / Part 2
functionality, and verify the full stack against Neon.

## 2. Database endpoints (credentials REDACTED)

Runtime uses the pooled endpoint; migrations use the direct endpoint
(transactional DDL requires a non-pooled connection on Neon).

| Purpose | Endpoint |
| --- | --- |
| Main (app runtime) | postgresql://neondb_owner:REDACTED@ep-odd-boat-b5zy88iy-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require |
| Main direct (CLI/migrate) | postgresql://neondb_owner:REDACTED@ep-odd-boat-b5zy88iy.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require |
| Test (vitest) | pooler endpoint, database `rewardhub_test` |
| Test direct (test migrations) | direct endpoint, database `rewardhub_test` |

Env vars: `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL`.
All four exist only in `.env`, which is ignored by git `.env*`. `.env.example`
contains placeholders only. `neondb` was empty before migration; `rewardhub_test`
was created on the same Neon project (additive, no destructive action). The seed
script is dev-only/zero-balance and was intentionally not run.

## 3. Files changed

- `.env` - Neon URLs (pooled/direct for main + test), `NODE_IPV4_ONLY=1`.
- `.env.example` - placeholders for the four URL vars (same shape as `.env`).
- `prisma.config.ts` - CLI adapter now uses `DIRECT_URL ?? DATABASE_URL` for
  `migrate`/`db`; datasource url stays `DATABASE_URL` (runtime pooled).
- `vitest.config.ts` - reads `TEST_DATABASE_URL`/`TEST_DIRECT_URL` (throws if
  missing), injects them (plus existing test env) into workers; `pool: forks`
  with IPv4 flags when `NODE_IPV4_ONLY=1`; `testTimeout: 120000`,
  `hookTimeout: 60000`.
- `tests/global-setup.ts` - reads test URLs (throws if missing), runs
  `prisma migrate deploy` against only the test database (with the IPv4 flags
  and a 3-attempt retry for transient Neon lock contention).
- `tests/setup.ts` - `resetDb()` now issues a single multi-table TRUNCATE
  instead of one statement per table (round-trip reduction for remote DB).
- `src/lib/db.ts` - `transactionOptions: { maxWait: 5000, timeout: 20000 }`
  (managed DB latency vs. Prisma's 5 s interactive-transaction default).
- `src/lib/auth/advertiser.ts` - `getAdvertiserContext()` now resolves context
  for team members (a user whose only link is an `AdvertiserMember` row on
  another advertiser) so the documented role rules are reachable; owner-origin
  resolution is preserved as the primary path.
- `tests/advertisers.test.ts` - economics test used `maxCompletions: 20`, below
  the platform minimum of 50 enforced by `campaignRules()`; corrected to 50.
- Directory move: `src/app/(advertiser)/` -> `src/app/advertiser/`. The route
  group produced `/dashboard`, `/settings`, etc., colliding with the member app
  and contradicting every advertiser link in the codebase (`/advertiser/*`).
  The pages now resolve at `/advertiser/dashboard`, `/advertiser/settings`, etc.

## 4. Verification results

Schema & migrations (all via the direct endpoint):
- `npx prisma validate` - valid.
- `npx prisma generate` - re-generated client to `src/generated/prisma` (7.10.0).
- `npx prisma migrate status` - `neondb` up to date.
- `npx prisma migrate deploy` - applied all 3 migrations to `neondb` and to
  `rewardhub_test` (init, advertiser_platform, campaign_remaining_budget).

Database integrity on Neon: 23 tables, 35 foreign keys, 41 unique indexes,
3 `_prisma_migrations` records. Key uniqueness constraints verified
(`User_email_key`, `User_referralCode_key`, `Referral_referredUserId_key`,
`AdvertiserLedgerTransaction_reference_key`,
`AdvertiserMember_advertiserId_userId_key`, `Reward_watchSessionId_key`,
`Withdrawal_reference_key`).

Tests: full suite run on the final functional code passed 52/52 (5 files),
Part 1 auth/referral/wallet/opportunity flows plus the Part 2 advertiser suite.
After that run, `src/lib/auth/advertiser.ts` received strictly type-level
refinements (extra `select` field, nested `include`, and a null guard) to make
`tsc --noEmit` pass; those changes carry no behavioral difference.

Static checks: `npx tsc --noEmit` clean; `npm run lint` (ESLint) clean;
`node .../next` build succeeds and emits the expected routes, including
`/advertiser/dashboard`, `/advertiser/campaigns`, `/advertiser/settings`, etc.

Security: repo has no commits yet; `git status` shows only untracked files;
`git check-ignore` confirms `.env` and `.env.example` are ignored via
`.gitignore` `.env*`; the connection password appears only in `.env` (verified
by scan of `prisma.config.ts`, `prisma/`, `src/`, `tests/`, config files).

## 5. Issues found and fixed during verification

1. node-postgres on this dev host intermittently fails to connect to Neon
   (`ETIMEDOUT` ~50%): the machine has no IPv6 route while DNS returns AAAA for
   the Neon host, and Node's network-family autoselection mishandles it (raw
   `net.connect({family:4})` and `--no-network-family-autoselection
   --dns-result-order=ipv4first` both connect reliably; `psql`/libpq is
   unaffected). Worked around machine-locally via `.env NODE_IPV4_ONLY=1`,
   which adds the flags to vitest workers and the prisma test subprocess.
   `--no-network-family-autoselection` cannot be carried in `NODE_OPTIONS`, so
   `npm run dev`/`next build` on this box should be started through node with
   those two flags (the container/CI in an IPv4+IPv6-capable network needs no
   workaround). Other developers on normal networks get the plain URLs.
2. Prisma CLI migrate hit transient `P1002` advisory-lock timeouts on Neon;
   global-setup retries (idempotent, test DB only).
3. Interactive transactions on Neon exceeded Prisma's 5 s default; raised the
   client-wide default (see `src/lib/db.ts`).
4. Remote-DB round-trip latency (measured ~0.4-0.6 s per query from this host)
   made `resetDb`/tests exceed Vitest's default 10 s/20 s timeouts; fixed with a
   single-statement TRUNCATE and `testTimeout: 120000`.
5. Team-management tests surfaced a real Part 2 defect: members (MANAGER/
   ANALYST) could never pass authorization (404 instead of the documented
   FORBIDDEN), because `getAdvertiserContext` only resolved advertiser profiles
   owned by the caller. Fixed as described in section 3.
6. `next build` failed on duplicate route groups `(advertiser)` vs `(app)` for
   `/dashboard` and `/settings`; fixed by moving the advertiser group under an
   `advertiser` path segment, matching the existing `/advertiser/*` links.

## 6. How to run on this machine

```
# Tests (uses rewardhub_test; DOTENV already loads NODE_IPV4_ONLY=1)
npm test

# Build / dev (require the IPv4 flags on this host):
node --dns-result-order=ipv4first --no-network-family-autoselection \
  node_modules/next/dist/bin/next build

# Migrations against the main database:
DATABASE_URL=<pooled> DIRECT_URL=<direct> \
  node --dns-result-order=ipv4first --no-network-family-autoselection \
  node_modules/prisma/build/index.js migrate status
```

## 7. Outstanding

- Full test suite result on the exact final bytes (post type-refinement) was
  not re-run; static gates (tsc, eslint, build) are all green and the only
  delta was type-level. One earlier 52/52 run covers the functional code.
- Two Neo-node quirks to remember on this dev box: (1) the IPv4 flag
  workaround for node-postgres; (2) pg 8.x treats sslmode prefer/require/
  verify-ca as aliases of verify-full (informational warning only).
- No git commit has been created.