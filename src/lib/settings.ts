import "server-only";

import { prisma } from "@/lib/db";

/**
 * Centralized, database-backed platform settings.
 *
 * Hardcoded withdrawal/reward constants are NOT used anywhere in the
 * codebase -- every rule reads from here so admin (Part 3) can tune them
 * without code changes.
 */

export const SETTING_KEYS = {
  MINIMUM_WITHDRAWAL: "MINIMUM_WITHDRAWAL",
  MAXIMUM_WITHDRAWAL: "MAXIMUM_WITHDRAWAL",
  DAILY_WITHDRAWAL_LIMIT: "DAILY_WITHDRAWAL_LIMIT",
  WITHDRAWAL_FEE_RATE: "WITHDRAWAL_FEE_RATE",
  REFERRAL_REWARD_AMOUNT: "REFERRAL_REWARD_AMOUNT",
  REWARD_VALIDATION_DELAY_SECONDS: "REWARD_VALIDATION_DELAY_SECONDS",
  MAX_ACTIVE_WATCH_SESSIONS: "MAX_ACTIVE_WATCH_SESSIONS",
  CAMPAIGN_MIN_VIDEO_SECONDS: "CAMPAIGN_MIN_VIDEO_SECONDS",
  CAMPAIGN_MAX_VIDEO_SECONDS: "CAMPAIGN_MAX_VIDEO_SECONDS",
  CAMPAIGN_MIN_REWARD: "CAMPAIGN_MIN_REWARD",
  CAMPAIGN_MAX_REWARD: "CAMPAIGN_MAX_REWARD",
  CAMPAIGN_MIN_COMPLETIONS: "CAMPAIGN_MIN_COMPLETIONS",
  CAMPAIGN_MAX_COMPLETIONS: "CAMPAIGN_MAX_COMPLETIONS",
  CAMPAIGN_FEE_RATE: "CAMPAIGN_FEE_RATE",
  ADVERTISER_REVIEW_MODE: "ADVERTISER_REVIEW_MODE",
} as const;

type SettingDefaults = {
  [SETTING_KEYS.MINIMUM_WITHDRAWAL]: number; // kobo
  [SETTING_KEYS.MAXIMUM_WITHDRAWAL]: number; // kobo (0 = none)
  [SETTING_KEYS.DAILY_WITHDRAWAL_LIMIT]: number; // kobo
  [SETTING_KEYS.WITHDRAWAL_FEE_RATE]: number; // percent (0 = free)
  [SETTING_KEYS.REFERRAL_REWARD_AMOUNT]: number; // kobo
  [SETTING_KEYS.REWARD_VALIDATION_DELAY_SECONDS]: number; // seconds
  [SETTING_KEYS.MAX_ACTIVE_WATCH_SESSIONS]: number; // per user
  [SETTING_KEYS.CAMPAIGN_MIN_VIDEO_SECONDS]: number;
  [SETTING_KEYS.CAMPAIGN_MAX_VIDEO_SECONDS]: number;
  [SETTING_KEYS.CAMPAIGN_MIN_REWARD]: number; // kobo
  [SETTING_KEYS.CAMPAIGN_MAX_REWARD]: number; // kobo
  [SETTING_KEYS.CAMPAIGN_MIN_COMPLETIONS]: number;
  [SETTING_KEYS.CAMPAIGN_MAX_COMPLETIONS]: number;
  [SETTING_KEYS.CAMPAIGN_FEE_RATE]: number; // percent (0 = free)
};

const DEFAULT_VALUES: SettingDefaults = {
  [SETTING_KEYS.MINIMUM_WITHDRAWAL]: 50000, // ₦500.00
  [SETTING_KEYS.MAXIMUM_WITHDRAWAL]: 0, // no cap
  [SETTING_KEYS.DAILY_WITHDRAWAL_LIMIT]: 0, // no cap
  [SETTING_KEYS.WITHDRAWAL_FEE_RATE]: 0, // free (Part 3 can enable)
  [SETTING_KEYS.REFERRAL_REWARD_AMOUNT]: 2000, // ₦20.00
  [SETTING_KEYS.REWARD_VALIDATION_DELAY_SECONDS]: 0, // instant in Part 1
  [SETTING_KEYS.MAX_ACTIVE_WATCH_SESSIONS]: 3,
  [SETTING_KEYS.CAMPAIGN_MIN_VIDEO_SECONDS]: 8,
  [SETTING_KEYS.CAMPAIGN_MAX_VIDEO_SECONDS]: 120,
  [SETTING_KEYS.CAMPAIGN_MIN_REWARD]: 100, // ₦1.00
  [SETTING_KEYS.CAMPAIGN_MAX_REWARD]: 20000, // ₦200.00
  [SETTING_KEYS.CAMPAIGN_MIN_COMPLETIONS]: 50,
  [SETTING_KEYS.CAMPAIGN_MAX_COMPLETIONS]: 1_000_000,
  [SETTING_KEYS.CAMPAIGN_FEE_RATE]: 0, // free in Part 2
};

const TTL_MS = 30 * 1000;
let cache: { at: number; values: Record<string, string> } | null = null;

async function loadAll(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.values;
  const rows = await prisma.platformSetting.findMany();
  const values: Record<string, string> = {};
  for (const row of rows) values[row.key] = row.value;
  cache = { at: now, values };
  return values;
}

export async function getIntSetting(
  key: string,
  fallback: number,
): Promise<number> {
  const values = await loadAll();
  const raw = values[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getStringSetting(
  key: string,
  fallback: string,
): Promise<string> {
  const values = await loadAll();
  return values[key] ?? fallback;
}

export async function withdrawalRules(): Promise<{
  minimum: number;
  maximum: number;
  dailyLimit: number;
  feeRate: number;
}> {
  const values = await loadAll();
  const int = (key: string, fallback: number) => {
    const raw = values[key];
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    minimum: int(SETTING_KEYS.MINIMUM_WITHDRAWAL, DEFAULT_VALUES.MINIMUM_WITHDRAWAL),
    maximum: int(SETTING_KEYS.MAXIMUM_WITHDRAWAL, DEFAULT_VALUES.MAXIMUM_WITHDRAWAL),
    dailyLimit: int(SETTING_KEYS.DAILY_WITHDRAWAL_LIMIT, DEFAULT_VALUES.DAILY_WITHDRAWAL_LIMIT),
    feeRate: int(SETTING_KEYS.WITHDRAWAL_FEE_RATE, DEFAULT_VALUES.WITHDRAWAL_FEE_RATE),
  };
}

export async function rewardValidationDelaySeconds(): Promise<number> {
  return getIntSetting(
    SETTING_KEYS.REWARD_VALIDATION_DELAY_SECONDS,
    DEFAULT_VALUES.REWARD_VALIDATION_DELAY_SECONDS,
  );
}

export async function referralRewardAmount(): Promise<number> {
  return getIntSetting(
    SETTING_KEYS.REFERRAL_REWARD_AMOUNT,
    DEFAULT_VALUES.REFERRAL_REWARD_AMOUNT,
  );
}

export async function maxActiveWatchSessions(): Promise<number> {
  return getIntSetting(
    SETTING_KEYS.MAX_ACTIVE_WATCH_SESSIONS,
    DEFAULT_VALUES.MAX_ACTIVE_WATCH_SESSIONS,
  );
}

export async function campaignRules(): Promise<{
  minVideoSeconds: number;
  maxVideoSeconds: number;
  minReward: number;
  maxReward: number;
  minCompletions: number;
  maxCompletions: number;
  feeRate: number;
}> {
  const values = await loadAll();
  const int = (key: string, fallback: number) => {
    const raw = values[key];
    if (raw === undefined || raw === "") return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    minVideoSeconds: int(SETTING_KEYS.CAMPAIGN_MIN_VIDEO_SECONDS, DEFAULT_VALUES.CAMPAIGN_MIN_VIDEO_SECONDS),
    maxVideoSeconds: int(SETTING_KEYS.CAMPAIGN_MAX_VIDEO_SECONDS, DEFAULT_VALUES.CAMPAIGN_MAX_VIDEO_SECONDS),
    minReward: int(SETTING_KEYS.CAMPAIGN_MIN_REWARD, DEFAULT_VALUES.CAMPAIGN_MIN_REWARD),
    maxReward: int(SETTING_KEYS.CAMPAIGN_MAX_REWARD, DEFAULT_VALUES.CAMPAIGN_MAX_REWARD),
    minCompletions: int(SETTING_KEYS.CAMPAIGN_MIN_COMPLETIONS, DEFAULT_VALUES.CAMPAIGN_MIN_COMPLETIONS),
    maxCompletions: int(SETTING_KEYS.CAMPAIGN_MAX_COMPLETIONS, DEFAULT_VALUES.CAMPAIGN_MAX_COMPLETIONS),
    feeRate: int(SETTING_KEYS.CAMPAIGN_FEE_RATE, DEFAULT_VALUES.CAMPAIGN_FEE_RATE),
  };
}

/**
 * Campaign submission review mode:
 * - "auto"  (dev default) — submitted campaigns are approved immediately so
 *   the dev flow is testable without an admin.
 * - "hold"  (production)   — submitted campaigns wait for a human admin
 *   approval (Part 3 admin UI consumes this state).
 */
export async function advertiserReviewMode(): Promise<"auto" | "hold"> {
  const values = await loadAll();
  const raw = values[SETTING_KEYS.ADVERTISER_REVIEW_MODE];
  if (raw === "hold") return "hold";
  return "auto";
}