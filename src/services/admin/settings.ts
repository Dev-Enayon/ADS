import "server-only";

import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidateSettingsCache } from "@/lib/settings";
import { Errors } from "@/lib/errors";

type SettingKind = "int" | "bool" | "str";

type SettingCatalogEntry = {
  kind: SettingKind;
  defaultValue: string;
  description: string;
};

// Operator-facing catalog. Mirrors the keys consumed in lib/settings.ts; the
// database row wins over the default at runtime, but the defaults shown here
// keep the console useful even before a value is ever written.
const SETTING_CATALOG: Record<string, SettingCatalogEntry> = {
  MINIMUM_WITHDRAWAL: { kind: "int", defaultValue: "50000", description: "Minimum withdrawal amount in kobo." },
  MAXIMUM_WITHDRAWAL: { kind: "int", defaultValue: "0", description: "Maximum per-request withdrawal in kobo (0 = unlimited)." },
  DAILY_WITHDRAWAL_LIMIT: { kind: "int", defaultValue: "0", description: "Daily withdrawal cap in kobo (0 = unlimited)." },
  WITHDRAWAL_FEE_RATE: { kind: "int", defaultValue: "0", description: "Withdrawal fee percent (0 = free)." },
  REFERRAL_REWARD_AMOUNT: { kind: "int", defaultValue: "2000", description: "Referral reward amount in kobo." },
  REWARD_VALIDATION_DELAY_SECONDS: { kind: "int", defaultValue: "0", description: "Seconds a reward sits PENDING before it becomes available." },
  MAX_ACTIVE_WATCH_SESSIONS: { kind: "int", defaultValue: "3", description: "Max concurrently active watch sessions per user." },
  CAMPAIGN_MIN_VIDEO_SECONDS: { kind: "int", defaultValue: "8", description: "Min allowed video duration (seconds)." },
  CAMPAIGN_MAX_VIDEO_SECONDS: { kind: "int", defaultValue: "120", description: "Max allowed video duration (seconds)." },
  CAMPAIGN_MIN_REWARD: { kind: "int", defaultValue: "100", description: "Min reward per completion (kobo)." },
  CAMPAIGN_MAX_REWARD: { kind: "int", defaultValue: "20000", description: "Max reward per completion (kobo)." },
  CAMPAIGN_MIN_COMPLETIONS: { kind: "int", defaultValue: "50", description: "Min completion target for a campaign." },
  CAMPAIGN_MAX_COMPLETIONS: { kind: "int", defaultValue: "1000000", description: "Max completion target for a campaign." },
  CAMPAIGN_FEE_RATE: { kind: "int", defaultValue: "0", description: "Campaign fee percent (0 = free)." },
  ADVERTISER_REVIEW_MODE: { kind: "str", defaultValue: "auto", description: "auto or hold — campaign submission gate." },
  MAINTENANCE_MODE: { kind: "bool", defaultValue: "false", description: "Block all non-admin state-changing traffic." },
  ENABLE_WITHDRAWALS: { kind: "bool", defaultValue: "true", description: "Master switch for user withdrawals." },
  MAX_WITHDRAWALS_PER_HOUR: { kind: "int", defaultValue: "3", description: "Per-hour withdrawal requests before flagging." },
  SUSPICIOUS_REFERRAL_THRESHOLD: { kind: "int", defaultValue: "0", description: "Hourly referral volume that flags a chain (0 = disabled)." },
  WATCH_HEARTBEAT_MIN_INTERVAL_SECONDS: { kind: "int", defaultValue: "5", description: "Minimum acceptable gap between heartbeats." },
  WATCH_MAX_STEP_SECONDS: { kind: "int", defaultValue: "30", description: "Max progress a single heartbeat may claim." },
  MAX_COMPLETIONS_PER_HOUR: { kind: "int", defaultValue: "30", description: "Per-hour watch completions that flag a user." },
  MAX_ACTIVE_WATCH_PER_BROWSER: { kind: "int", defaultValue: "3", description: "Max active sessions tied to a single browser fingerprint." },
  ACCOUNT_SUSPENSION_HIGH_RISK: { kind: "bool", defaultValue: "false", description: "Auto-suspend users on HIGH risk events." },
};

export async function listSettings() {
  const rows = await prisma.platformSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const settings = Object.entries(SETTING_CATALOG).map(([key, entry]) => {
    const stored = byKey.get(key);
    return {
      key,
      value: stored ?? entry.defaultValue,
      source: stored === undefined ? "default" : "custom",
      kind: entry.kind,
      description: entry.description,
    };
  });
  return settings;
}

export async function updateSetting(input: {
  key: string;
  value: string;
  actorId: string;
  ip?: string | null;
}) {
  const entry = SETTING_CATALOG[input.key];
  if (!entry) throw Errors.validation("Unknown setting key.");

  const raw = input.value.trim();
  if (entry.kind === "int") {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      throw Errors.validation("This setting requires a whole number.");
    }
  } else if (entry.kind === "bool" && raw !== "true" && raw !== "false") {
    throw Errors.validation("This setting requires true or false.");
  }

  await prisma.platformSetting.upsert({
    where: { key: input.key },
    create: { key: input.key, value: raw, description: entry.description },
    update: { value: raw, description: entry.description },
  });
  invalidateSettingsCache();

  await audit({
    userId: input.actorId,
    action: "ADMIN.SETTING_UPDATED",
    entityType: "PlatformSetting",
    entityId: input.key,
    meta: { key: input.key, value: raw },
    ip: input.ip,
  });

  return { key: input.key, value: raw };
}