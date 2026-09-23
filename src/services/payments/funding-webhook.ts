import "server-only";

import { FundingStatus, NotificationType, WebhookEventStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  verifyWebhookSignature,
  WebhookSignatureError,
} from "@/lib/payments/webhook";
import { createHash } from "node:crypto";

type ParsedPaymentEvent = {
  provider: string;
  providerEventId: string;
  event: string;
  providerRef?: string | null;
  reference?: string | null;
  failureReason?: string | null;
  ip?: string | null;
};

function parsePaymentEvent(payload: unknown, provider: string): ParsedPaymentEvent {
  if (!payload || typeof payload !== "object") {
    throw Errors.badRequest("Invalid webhook payload.", "INVALID_WEBHOOK_PAYLOAD");
  }
  const body = payload as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event : "";

  const providerRef = typeof body.providerRef === "string" ? body.providerRef : null;
  const reference = typeof body.reference === "string" ? body.reference : null;
  const failureReason =
    typeof body.failureReason === "string"
      ? body.failureReason
      : typeof body.reason === "string"
        ? body.reason
        : null;

  let providerEventId: string;
  if (typeof body.id === "string" && body.id.length > 0) {
    providerEventId = body.id;
  } else {
    providerEventId = createHash("sha256")
      .update(`${providerRef ?? reference ?? "?"}|${event}`)
      .digest("hex")
      .slice(0, 32);
  }

  return { provider, providerEventId, event, providerRef, reference, failureReason };
}

export type PaymentWebhookResult = {
  outcome: "processed" | "duplicate" | "ignored";
  message: string;
};

/**
 * Authenticate and record an ingoing payment (funding) webhook. On success it
 * settles the CampaignFunding the same way the frontend verify path does, but
 * it does NOT touch `verifyFunding` -- operators keep the deterministic
 * path and the two cannot interfere with one another.
 */
export async function processPaymentWebhook(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  provider?: string;
}): Promise<PaymentWebhookResult> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, input.secret)) {
    throw new WebhookSignatureError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw Errors.badRequest("Invalid webhook payload.", "INVALID_WEBHOOK_PAYLOAD");
  }

  const evt = parsePaymentEvent(payload, input.provider ?? "payment_provider");
  const isSuccess =
    evt.event.endsWith(".success") || evt.event === "payment.success" || evt.event === "charge.success";
  const isFailure =
    evt.event.endsWith(".failed") || evt.event === "payment.failed" || evt.event === "charge.failed";

  return prisma.$transaction(async (tx) => {
    // Idempotency, same discipline as payout webhooks: read BEFORE creating so
    // a retry of a FAILED/IGNORED event is re-processed rather than dropped.
    const existing = await tx.webhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: evt.provider,
          providerEventId: evt.providerEventId,
        },
      },
    });
    if (existing?.status === WebhookEventStatus.PROCESSED) {
      return { outcome: "duplicate", message: "Event already processed." };
    }
    let created: { id: string } | null = existing;
    if (!created) {
      try {
        created = await tx.webhookEvent.create({
          data: {
            provider: evt.provider,
            providerEventId: evt.providerEventId,
            type: evt.event,
            entityType: "CampaignFunding",
            entityId: evt.reference ?? evt.providerRef ?? null,
            externalRef: evt.providerRef ?? null,
            payload: payload as object,
            status: WebhookEventStatus.PENDING,
          },
        });
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
          // A concurrent delivery won the race; the guarded updates below make
          // an extra attempt harmless.
          return { outcome: "duplicate", message: "Event already received." };
        }
        throw err;
      }
    }
    if (!created) return { outcome: "duplicate", message: "Event already received." };

    let funding = null;
    if (evt.reference) {
      funding = await tx.campaignFunding.findUnique({ where: { reference: evt.reference } });
    }
    if (!funding && evt.providerRef) {
      funding = await tx.campaignFunding.findFirst({ where: { providerRef: evt.providerRef } });
    }
    if (!funding) {
      await tx.webhookEvent.update({
        where: { id: created.id },
        data: { status: WebhookEventStatus.IGNORED, error: "Unknown payment reference." },
      });
      return { outcome: "ignored", message: "Payment target not found." };
    }

    try {
      if (isSuccess) {
        const claimed = await tx.campaignFunding.updateMany({
          where: { id: funding.id, status: FundingStatus.PENDING_VERIFICATION },
          data: { status: FundingStatus.COMPLETED, verifiedAt: new Date() },
        });
        if (claimed.count !== 1) {
          await tx.webhookEvent.update({
            where: { id: created.id },
            data: {
              status: WebhookEventStatus.IGNORED,
              error: "Funding is not awaiting verification.",
            },
          });
          return { outcome: "ignored", message: "Funding not awaiting verification." };
        }

        const wallet = await tx.advertiserWallet.findUnique({
          where: { advertiserId: funding.advertiserId },
        });
        if (!wallet) throw Errors.conflict("Advertiser wallet missing.", "WALLET_MISSING");
        const balanceAfter = wallet.availableBalance + funding.amount;
        await tx.advertiserWallet.update({
          where: { id: wallet.id },
          data: {
            availableBalance: { increment: funding.amount },
            totalFunded: { increment: funding.amount },
          },
        });
        await tx.advertiserLedgerTransaction.create({
          data: {
            advertiserId: funding.advertiserId,
            walletId: wallet.id,
            type: "FUNDING_CREDIT",
            direction: "CREDIT",
            amount: funding.amount,
            balanceAfter,
            reference: `FD-CR-${funding.id}`,
            description: `Wallet funding · ${formatMoney(funding.amount)} (webhook)`,
            fundingId: funding.id,
            meta: { fundingReference: funding.reference, provider: evt.provider },
          },
        });

        const advertiser = await tx.advertiserProfile.findUnique({
          where: { id: funding.advertiserId },
        });
        if (!advertiser) throw Errors.conflict("Advertiser missing.", "ADVERTISER_MISSING");
        await tx.notification.create({
          data: {
            userId: advertiser.userId,
            type: NotificationType.PAYMENT_SUCCESS,
            title: "Payment received",
            message: `${formatMoney(funding.amount)} was added to your advertiser wallet.`,
          },
        });

        await tx.webhookEvent.update({
          where: { id: created.id },
          data: { status: WebhookEventStatus.PROCESSED, entityId: funding.id },
        });
        return { outcome: "processed", message: "Funding settled." };
      }

      if (isFailure) {
        const failed = await tx.campaignFunding.updateMany({
          where: { id: funding.id, status: FundingStatus.PENDING_VERIFICATION },
          data: {
            status: FundingStatus.FAILED,
            failureReason: evt.failureReason ?? "Payment failed at the provider.",
          },
        });
        await tx.webhookEvent.update({
          where: { id: created.id },
          data: {
            status: failed.count === 1 ? WebhookEventStatus.PROCESSED : WebhookEventStatus.IGNORED,
            error: failed.count === 1 ? null : "Funding is not awaiting verification.",
          },
        });
        return { outcome: "processed", message: "Funding failure recorded." };
      }

      await tx.webhookEvent.update({
        where: { id: created.id },
        data: { status: WebhookEventStatus.IGNORED, error: `Unsupported event: ${evt.event}` },
      });
      return { outcome: "ignored", message: "Unsupported payment event." };
    } catch (err) {
      await tx.webhookEvent.update({
        where: { id: created.id },
        data: {
          status: WebhookEventStatus.FAILED,
          error: err instanceof Error ? err.message : "Processing failed.",
        },
      });
      throw err;
    }
  });
}