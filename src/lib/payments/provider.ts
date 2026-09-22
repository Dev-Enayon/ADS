import "server-only";

import { PaymentProviderCode } from "@/generated/prisma/enums";
import { isProd } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { randomUUID } from "node:crypto";

export type ProviderVerifyStatus = "success" | "pending" | "failed" | "reversed";

export type InitPaymentResult = {
  providerRef: string;
  /** Present when the user must be redirected to a hosted checkout. */
  checkoutUrl: string | null;
};

/**
 * Payment-provider abstraction. Advertiser funds are ONLY moved after a
 * server-side verification step that returns success; a frontend redirect or
 * user-supplied "payment confirmed" flag is never treated as proof.
 */
export interface PaymentProvider {
  readonly name: string;
  initializePayment(input: {
    reference: string;
    amountKobo: number;
    meta?: Record<string, unknown>;
  }): Promise<InitPaymentResult>;
  verifyPayment(input: {
    providerRef: string;
    expectedAmountKobo: number;
  }): Promise<{ status: ProviderVerifyStatus; failureReason?: string }>;
}

/**
 * Development-only provider. Simulates an external payment gateway so the
 * full funding flow (initialize -> verify -> credit) can be exercised without
 * real money. Refuses to run in production explicitly so a wrongly configured
 * deployment cannot "verify" fake payments.
 */
export class DevMockProvider implements PaymentProvider {
  readonly name = "dev_mock";

  constructor() {
    if (isProd) {
      throw Errors.conflict(
        "The dev payment provider is disabled in production. Configure a real provider.",
        "PAYMENT_PROVIDER_UNAVAILABLE",
      );
    }
  }

  async initializePayment(): Promise<InitPaymentResult> {
    return { providerRef: `DEV-${randomUUID()}`, checkoutUrl: null };
  }

  async verifyPayment(): Promise<{ status: ProviderVerifyStatus }> {
    return { status: "success" };
  }
}

/** Manual provider — funds are credited only by an operator (Part 3). */
export class ManualProvider implements PaymentProvider {
  readonly name = "manual";

  async initializePayment(): Promise<InitPaymentResult> {
    return { providerRef: `MANUAL-${randomUUID()}`, checkoutUrl: null };
  }

  async verifyPayment(): Promise<{ status: ProviderVerifyStatus; failureReason?: string }> {
    // Never self-verify manual bank transfers. An operator marks them paid.
    return { status: "pending", failureReason: "Awaiting manual confirmation." };
  }
}

const PROVIDER_CODES = new Set<string>(Object.values(PaymentProviderCode));

export function parseProviderCode(raw: string | undefined): PaymentProviderCode {
  const value = raw?.toUpperCase() ?? (isProd ? "MANUAL" : "DEV_MOCK");
  if (value === "DEV_MOCK" && isProd) {
    throw Errors.conflict(
      "The dev payment provider is disabled in production.",
      "PAYMENT_PROVIDER_UNAVAILABLE",
    );
  }
  if (!PROVIDER_CODES.has(value)) {
    throw Errors.validation("Unsupported payment provider.");
  }
  return value as PaymentProviderCode;
}

export function getPaymentProvider(code: PaymentProviderCode): PaymentProvider {
  switch (code) {
    case PaymentProviderCode.DEV_MOCK:
      return new DevMockProvider();
    case PaymentProviderCode.MANUAL:
      return new ManualProvider();
    default:
      // PAYSTACK / FLUTTERWAVE are reserved for Part 3 settlement.
      throw Errors.conflict(
        "This payment provider is not configured yet.",
        "PAYMENT_PROVIDER_NOT_CONFIGURED",
      );
  }
}