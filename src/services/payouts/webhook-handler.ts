import "server-only";

import { WebhookEventStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import {
  verifyWebhookSignature,
  WebhookSignatureError,
} from "@/lib/payments/webhook";
import {
  confirmPayoutSuccessTx,
  recordPayoutFailureTx,
  reversePayoutTx,
} from "@/services/payouts/payouts";
import { createHash } from "node:crypto";

type ParsedPayoutEvent = {
  provider: string;
  providerEventId: string;
  event: string;
  providerRef?: string | null;
  withdrawalId?: string | null;
  reference?: string | null;
  externalRef?: string | null;
  ip?: string | null;
};

/**
 * Resolve an incoming provider event into the idempotency pair
 * (provider, providerEventId). When the provider omits an id we derive one
 * from providerRef|event so a redelivery of the same logical event maps to the
 * same stored row.
 */
function parsePayoutEvent(payload: unknown, provider: string): ParsedPayoutEvent {
  if (!payload || typeof payload !== "object") {
    throw Errors.badRequest("Invalid webhook payload.", "INVALID_WEBHOOK_PAYLOAD");
  }
  const body = payload as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event : "";

  const providerRef =
    typeof body.providerRef === "string" ? body.providerRef : null;
  const withdrawalId =
    typeof body.withdrawalId === "string" ? body.withdrawalId : null;
  const reference =
    typeof body.reference === "string" ? body.reference : null;
  const externalRef =
    typeof body.externalRef === "string" ? body.externalRef : null;

  let providerEventId: string;
  if (typeof body.id === "string" && body.id.length > 0) {
    providerEventId = body.id;
  } else {
    const seed = `${providerRef ?? withdrawalId ?? reference ?? "?"}|${event}`;
    providerEventId = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  }

  return { provider, providerEventId, event, providerRef, withdrawalId, reference, externalRef };
}

export type PayoutWebhookResult = {
  outcome: "processed" | "duplicate" | "ignored";
  message: string;
};

/**
 * Authenticate and settle a payout webhook. Returns normally on success so the
 * route can respond 2xx; rethrows processing errors so the provider retries.
 */
export async function processPayoutWebhook(input: {
  rawBody: string;
  signature: string | null;
  secret: string;
  provider?: string;
}): Promise<PayoutWebhookResult> {
  if (!verifyWebhookSignature(input.rawBody, input.signature, input.secret)) {
    throw new WebhookSignatureError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw Errors.badRequest("Invalid webhook payload.", "INVALID_WEBHOOK_PAYLOAD");
  }

  const evt = parsePayoutEvent(payload, input.provider ?? "payout_provider");

  return prisma.$transaction(async (tx) => {
    const providerEventId = evt.providerEventId;

    // Idempotency: the unique (provider, providerEventId) row is created once.
    // Read BEFORE creating so a retry of a FAILED/IGNORED event (created by an
    // earlier attempt that errored out) is re-processed instead of dropped.
    const existing = await tx.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: evt.provider, providerEventId } },
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
            providerEventId,
            type: evt.event,
            entityType: evt.withdrawalId || evt.providerRef ? "Withdrawal" : null,
            entityId: evt.withdrawalId ?? evt.providerRef ?? null,
            externalRef: evt.externalRef ?? null,
            payload: payload as object,
            status: WebhookEventStatus.PENDING,
          },
        });
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
          // A concurrent delivery won the race and is settling this event; the
          // guarded state transitions below make an extra attempt harmless.
          return { outcome: "duplicate", message: "Event already received." };
        }
        throw err;
      }
    }
    if (!created) return { outcome: "duplicate", message: "Event already received." };

    // Locate the withdrawal: providerRef is the strongest, admin-recorded key.
    let withdrawal = null;
    if (evt.providerRef) {
      withdrawal = await tx.withdrawal.findFirst({
        where: { providerRef: evt.providerRef },
      });
    }
    if (!withdrawal && evt.withdrawalId) {
      withdrawal = await tx.withdrawal.findUnique({
        where: { id: evt.withdrawalId },
      });
    }
    if (!withdrawal && evt.reference) {
      withdrawal = await tx.withdrawal.findUnique({
        where: { reference: evt.reference },
      });
    }
    if (!withdrawal) {
      await tx.webhookEvent.update({
        where: { id: created.id },
        data: { status: WebhookEventStatus.IGNORED, error: "Unknown payout target." },
      });
      return { outcome: "ignored", message: "Payout target not found." };
    }

    try {
      if (evt.event.endsWith(".success") || evt.event === "success") {
        const ok = await confirmPayoutSuccessTx(tx, {
          withdrawalId: withdrawal.id,
          providerRef: withdrawal.providerRef ?? evt.providerRef,
          providerStatus: "succeeded",
          ip: evt.ip ?? null,
        });
        await tx.webhookEvent.update({
          where: { id: created.id },
          data: { status: ok ? WebhookEventStatus.PROCESSED : WebhookEventStatus.IGNORED, error: ok ? null : "Withdrawal not in a payable state." },
        });
        return { outcome: "processed", message: "Payout confirmed." };
      }

      if (evt.event.endsWith(".failed") || evt.event === "failed") {
        const reason =
          (payload && typeof payload === "object"
            ? (payload as Record<string, unknown>).failureReason
            : undefined) ?? "Provider reported a payout failure.";
        const ok = await recordPayoutFailureTx(tx, {
          withdrawalId: withdrawal.id,
          providerStatus: "failed",
          failureReason: String(reason),
          ip: evt.ip ?? null,
        });
        await tx.webhookEvent.update({
          where: { id: created.id },
          data: { status: ok ? WebhookEventStatus.PROCESSED : WebhookEventStatus.IGNORED, error: ok ? null : "Withdrawal not in a payable state." },
        });
        return { outcome: "processed", message: "Payout failure recorded." };
      }

      if (evt.event.endsWith(".reversed") || evt.event === "reversed") {
        const reversalReason =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>).reason
            : undefined;
        const ok = await reversePayoutTx(tx, {
          withdrawalId: withdrawal.id,
          providerStatus: "reversed",
          reason:
            typeof reversalReason === "string"
              ? reversalReason
              : "Provider reversed the payout.",
          ip: evt.ip ?? null,
        });
        await tx.webhookEvent.update({
          where: { id: created.id },
          data: { status: ok ? WebhookEventStatus.PROCESSED : WebhookEventStatus.IGNORED, error: ok ? null : "Withdrawal is not in a reversible state." },
        });
        return { outcome: "processed", message: "Payout reversal recorded." };
      }

      await tx.webhookEvent.update({
        where: { id: created.id },
        data: { status: WebhookEventStatus.IGNORED, error: `Unsupported event: ${evt.event}` },
      });
      return { outcome: "ignored", message: "Unsupported payout event." };
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