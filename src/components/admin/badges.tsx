import { Badge } from "@/components/ui/badge";

const userStatusTone: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  PENDING: "warning",
};

export function UserStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={userStatusTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
  );
}

export function UserRoleBadge({ role }: { role: string }) {
  const tone: "neutral" | "info" | "primary" =
    role === "SUPER_ADMIN" ? "primary" : role === "ADMIN" ? "info" : "neutral";
  return <Badge tone={tone}>{role.replace("_", " ")}</Badge>;
}

const withdrawalTone: Record<string, "neutral" | "warning" | "success" | "info" | "danger"> = {
  PENDING: "warning",
  PROCESSING: "info",
  SUCCESS: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  REVERSED: "danger",
};

export function WithdrawalStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={withdrawalTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
  );
}

export function RiskSeverityBadge({ severity }: { severity: string }) {
  const tone: "neutral" | "warning" | "danger" =
    severity === "HIGH" ? "danger" : severity === "MEDIUM" ? "warning" : "neutral";
  return <Badge tone={tone}>{severity}</Badge>;
}

export function RiskResolvedBadge({ resolved }: { resolved: boolean }) {
  return (
    <Badge tone={resolved ? "success" : "warning"}>{resolved ? "Resolved" : "Open"}</Badge>
  );
}

const advertiserTone: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "danger",
};

export function AdvertiserStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={advertiserTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
  );
}

const campaignTone: Record<string, "neutral" | "warning" | "success" | "danger" | "info"> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  SCHEDULED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={campaignTone[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
  );
}