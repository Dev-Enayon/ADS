import "server-only";

import { PaymentProviderCode } from "@/generated/prisma/enums";
import { env, isProd } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { randomUUID } from "node:crypto";

export type PayoutStartResult = {
  providerRef: string;
  providerStatus: string;
  /** Human-readable confirmation for operators/the user. */
  note?: string;
};

/**
 * Payout-provider abstraction (Part 3).
 *
 * A provider hands back a `providerRef` which the withdrawal persists BEFORE
 * the user is told anything. Settlement arrives asynchronously over an
 * authenticated webhook (or an operator recording it) keyed by that ref, so a
 * retried `startPayout` can never double-pay -- the reference doubles as the
 * idempotency key.
 */
export interface PayoutProvider {
  readonly name: string;
  startPayout(input: {
    withdrawalId: string;
    reference: string;
    amountKobo: number;
    paymentMethod: string;
    paymentDetails: Record<string, unknown> | null;
  }): Promise<PayoutStartResult>;
}

export function describePayoutProvider(): string {
  return env.payoutProvider.toUpperCase() || "MANUAL";
}

/**
 * Development-only payout provider: instantly queues the payout and records a
 * providerRef; a synthetic webhook flips it to SUCCEEDED during testing.
 * Refuses to run in production explicitly.
 */
export class DevMockPayoutProvider implements PayoutProvider {
  readonly name = "dev_mock_payout";

  constructor() {
    if (isProd) {
      throw Errors.conflict(
        "The dev payout provider is disabled in production.",
        "PAYOUT_PROVIDER_UNAVAILABLE",
      );
    }
  }

  async startPayout(input: {
    withdrawalId: string;
    reference: string;
    amountKobo: number;
  }): Promise<PayoutStartResult> {
    return {
      providerRef: `PAYOUT-${randomUUID()}`,
      providerStatus: "queued",
      note: `Payout queued on the dev provider (${input.reference}).`,
    };
  }
}

/**
 * Manual payout provider: withdrawal is left for an operator and the provider
 * reference is only set when the admin records the actual settlement.
 */
export class ManualPayoutProvider implements PayoutProvider {
  readonly name = "manual_payout";

  async startPayout(input: {
    withdrawalId: string;
    reference: string;
  }): Promise<PayoutStartResult> {
    return {
      providerRef: `MANUAL-${randomUUID()}`,
      providerStatus: "manual_review",
      note: `Awaiting manual settlement (${input.reference}).`,
    };
  }
}

const PAYOUT_PROVIDER_CODES = new Set<PaymentProviderCode>([
  PaymentProviderCode.DEV_MOCK,
  PaymentProviderCode.MANUAL,
]);

export function getPayoutProvider(
  code: PaymentProviderCode,
): PayoutProvider {
  switch (code) {
    case PaymentProviderCode.DEV_MOCK:
      return new DevMockPayoutProvider();
    case PaymentProviderCode.MANUAL:
      return new ManualPayoutProvider();
    default:
      throw Errors.conflict(
        "This payout provider is not configured yet.",
        "PAYOUT_PROVIDER_NOT_CONFIGURED",
      );
  }
}

/** Resolve the configured payout provider from the environment. */
export function configuredPayoutProvider(): PayoutProvider {
  const raw = env.payoutProvider.toUpperCase();
  if (!PAYOUT_PROVIDER_CODES.has(raw as PaymentProviderCode)) {
    throw Errors.conflict(
      "The configured payout provider is invalid for this environment.",
      "PAYOUT_PROVIDER_INVALID",
    );
  }
  return getPayoutProvider(raw as PaymentProviderCode);
}