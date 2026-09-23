import { notFound } from "next/navigation";
import Link from "next/link";

import { getAdminSession } from "@/lib/auth/admin";
import { getUserDetail } from "@/services/admin/users";
import { PageHeader } from "@/components/advertiser/cards";
import { UserRoleBadge, UserStatusBadge, RiskSeverityBadge } from "@/components/admin/badges";
import { AdminActionButton } from "@/components/admin/actions";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import {
  BanknoteIcon,
  CheckIcon,
  ChevronLeftIcon,
  ShieldIcon,
  XIcon,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: Props) {
  const session = await getAdminSession();
  if (!session) return null;
  const isSuper = session.user.role === "SUPER_ADMIN";

  const { id } = await params;
  let user;
  try {
    user = await getUserDetail(id);
  } catch {
    notFound();
  }

  const suspended = user.status === "SUSPENDED";

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
        <ChevronLeftIcon size={14} /> Users
      </Link>
      <PageHeader
        title={user.profile?.fullName ?? user.email}
        subtitle={user.email}
        actions={
          <div className="flex gap-2">
            <UserRoleBadge role={user.role} />
            <UserStatusBadge status={user.status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Account</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-muted">Joined</dt>
                <dd className="font-medium">{formatDateTime(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Email verified</dt>
                <dd className="font-medium">{user.emailVerifiedAt ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Last login</dt>
                <dd className="font-medium">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Referred by</dt>
                <dd className="font-medium">{user.referredBy ? user.referredBy.email : "None"}</dd>
              </div>
            </dl>
            {user.profile && (
              <dl className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                <div className="flex justify-between">
                  <dt className="text-muted">Phone</dt>
                  <dd className="font-medium">{user.profile.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Country</dt>
                  <dd className="font-medium">{user.profile.country ?? "—"}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <ShieldIcon size={14} /> Risk events
            </p>
            {user.riskEvents.length === 0 ? (
              <p className="mt-3 text-muted">No risk events recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {user.riskEvents.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{e.type.replaceAll("_", " ")}</p>
                      <p className="truncate text-xs text-muted">{e.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskSeverityBadge severity={e.severity} />
                      <span className={e.resolved ? "text-xs text-success" : "text-xs text-warning"}>
                        {e.resolved ? "Resolved" : "Open"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Sessions</p>
            {user.sessions.length === 0 ? (
              <p className="mt-3 text-muted">No active sessions.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {user.sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-foreground">{s.ipAddress ?? "—"}</span>
                    <span className="text-muted">
                      {s.revokedAt ? "Revoked" : "Active"} · last {formatDateTime(s.lastActiveAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Wallet</p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between">
                <dt className="text-muted">Available</dt>
                <dd className="font-medium text-foreground">{formatMoney(user.wallet?.availableBalance ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pending</dt>
                <dd className="font-medium text-foreground">{formatMoney(user.wallet?.pendingBalance ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Withdrawn</dt>
                <dd className="font-medium text-foreground">{formatMoney(user.wallet?.totalWithdrawn ?? 0)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-soft">
              <BanknoteIcon size={14} /> Withdrawals
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">{user._count.withdrawals}</p>
            <p className="text-xs text-muted">rewards: {user._count.rewards}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">Actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suspended ? (
                <AdminActionButton
                  url={`/api/admin/users/${user.id}`}
                  payload={{ action: "reactivate" }}
                  label="Reactivate"
                  variant="primary"
                  successMessage="User reactivated"
                />
              ) : (
                <AdminActionButton
                  url={`/api/admin/users/${user.id}`}
                  payload={{ action: "suspend", reason: "Suspended from admin console." }}
                  label="Suspend"
                  variant="danger"
                  confirm="Suspend this account and revoke its sessions?"
                  successMessage="User suspended"
                />
              )}

              {isSuper && (
                <>
                  {user.role === "USER" ? (
                    <AdminActionButton
                      url={`/api/admin/users/${user.id}`}
                      payload={{ action: "setRole", role: "ADMIN" }}
                      label="Make admin"
                      variant="outline"
                      confirm="Promote this user to ADMIN?"
                      successMessage="Role changed"
                    />
                  ) : user.role === "ADMIN" ? (
                    <AdminActionButton
                      url={`/api/admin/users/${user.id}`}
                      payload={{ action: "setRole", role: "SUPER_ADMIN" }}
                      label="Make super admin"
                      variant="outline"
                      confirm="Promote this admin to SUPER_ADMIN?"
                      successMessage="Role changed"
                    />
                  ) : null}
                  {user.role !== "USER" && user.id !== session.user.id && (
                    <AdminActionButton
                      url={`/api/admin/users/${user.id}`}
                      payload={{ action: "setRole", role: "USER" }}
                      label="Demote"
                      variant="ghost"
                      confirm="Remove admin role from this user?"
                      successMessage="Role changed"
                    />
                  )}
                </>
              )}
            </div>
            {!isSuper && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                <XIcon size={13} className="mt-0.5 shrink-0" />
                Only SUPER_ADMIN can change roles to protect the console.
              </p>
            )}
            {!suspended && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                <CheckIcon size={13} className="mt-0.5 shrink-0" />
                Suspending revokes the member&apos;s active sessions immediately.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}