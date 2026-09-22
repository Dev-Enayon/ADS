import { Badge } from "@/components/ui/badge";

const campaignTone: Record<string, "neutral" | "warning" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  APPROVED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "info",
  EXPIRED: "neutral",
  REJECTED: "danger",
};

const campaignLabel: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  ACTIVE: "Live",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={campaignTone[status] ?? "neutral"}>{campaignLabel[status] ?? status}</Badge>
  );
}

const advertiserTone: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "danger",
};

export function AdvertiserStatusBadge({ status }: { status: string }) {
  return <Badge tone={advertiserTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>;
}

const fundingTone: Record<string, "neutral" | "warning" | "success" | "info" | "danger"> = {
  PENDING: "warning",
  PENDING_VERIFICATION: "warning",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function FundingStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={fundingTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={role === "OWNER" ? "primary" : role === "MANAGER" ? "info" : "neutral"}>{role}</Badge>;
}