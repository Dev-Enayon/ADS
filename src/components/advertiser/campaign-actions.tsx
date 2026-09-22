"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { EditIcon, PauseIcon } from "@/components/ui/icons";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";

export function CampaignActions({
  campaignId,
  status,
  canManage,
}: {
  campaignId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    name: string,
    path: string,
    okMessage: string,
    method: "POST" | "DELETE" | "PATCH" = "POST",
  ) {
    if (busy) return;
    setBusy(name);
    try {
      await apiFetch(path, { method });
      pushToast("success", okMessage);
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    try {
      const res = await apiFetch<{ fund?: { status?: string }; status?: string }>(
        `/api/advertiser/campaigns/${campaignId}/submit`,
        { method: "POST" },
      );
      pushToast(
        "success",
        res.status === "APPROVED"
          ? "Campaign approved and published."
          : res.status === "PENDING_REVIEW"
            ? "Campaign submitted for review."
            : "Campaign submitted.",
      );
      router.refresh();
    } catch (err) {
      pushToast("error", apiErrorMessage(err));
      setBusy(null);
    }
  }

  if (!canManage) {
    return <p className="text-xs font-medium text-muted">Read-only access.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (
        <>
          <Link href={`/advertiser/campaigns/${campaignId}/edit`}>
            <Button variant="outline" size="sm">
              <EditIcon size={15} />
              Edit
            </Button>
          </Link>
          <Button size="sm" loading={busy === "submit"} onClick={submit}>
            Submit for review
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === "delete"}
            onClick={() =>
              run("delete", `/api/advertiser/campaigns/${campaignId}`, "Campaign deleted.")
            }
          >
            Delete
          </Button>
        </>
      )}

      {status === "REJECTED" && (
        <>
          <Link href={`/advertiser/campaigns/${campaignId}/edit`}>
            <Button variant="outline" size="sm">
              <EditIcon size={15} />
              Edit and resubmit
            </Button>
          </Link>
          <Button
            variant="danger"
            size="sm"
            loading={busy === "cancel"}
            onClick={() =>
              run("cancel", `/api/advertiser/campaigns/${campaignId}/cancel`, "Campaign cancelled.")
            }
          >
            Cancel
          </Button>
        </>
      )}

      {(status === "PENDING_REVIEW" || status === "APPROVED") && (
        <Button
          variant="danger"
          size="sm"
          loading={busy === "cancel"}
          onClick={() =>
            run("cancel", `/api/advertiser/campaigns/${campaignId}/cancel`, "Campaign cancelled.")
          }
        >
          Cancel campaign
        </Button>
      )}

      {(status === "ACTIVE" || status === "SCHEDULED") && (
        <>
          <Button
            variant="outline"
            size="sm"
            loading={busy === "pause"}
            onClick={() =>
              run("pause", `/api/advertiser/campaigns/${campaignId}/pause`, "Campaign paused.")
            }
          >
            <PauseIcon size={15} />
            Pause
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === "cancel"}
            onClick={() =>
              run("cancel", `/api/advertiser/campaigns/${campaignId}/cancel`, "Campaign cancelled and budget refunded.")
            }
          >
            Cancel
          </Button>
        </>
      )}

      {status === "PAUSED" && (
        <>
          <Button
            size="sm"
            loading={busy === "resume"}
            onClick={() =>
              run("resume", `/api/advertiser/campaigns/${campaignId}/pause`, "Campaign resumed.", "PATCH")
            }
          >
            Resume
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busy === "cancel"}
            onClick={() =>
              run("cancel", `/api/advertiser/campaigns/${campaignId}/cancel`, "Campaign cancelled and budget refunded.")
            }
          >
            Cancel
          </Button>
        </>
      )}

      {(status === "COMPLETED" || status === "EXPIRED" || status === "CANCELLED") && (
        <p className="text-xs font-medium text-muted">This campaign is finished.</p>
      )}
    </div>
  );
}