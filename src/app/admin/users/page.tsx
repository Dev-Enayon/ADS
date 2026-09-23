import Link from "next/link";

import { PageHeader } from "@/components/advertiser/cards";
import { UserRoleBadge, UserStatusBadge } from "@/components/admin/badges";
import { getAdminSession } from "@/lib/auth/admin";
import { listUsers } from "@/services/admin/users";
import { formatDateTime } from "@/lib/utils";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_FILTERS = ["", "ACTIVE", "SUSPENDED"] as const;
const ROLE_FILTERS = ["", UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN] as const;

export default async function AdminUsersPage({ searchParams }: Props) {
  await getAdminSession();
  const sp = await searchParams;
  const page = Math.max(Number(sp.page ?? 1) || 1, 1);
  const status = typeof sp.status === "string" ? sp.status : "";
  const role = typeof sp.role === "string" ? sp.role : "";

  const data = await listUsers({
    page,
    pageSize: 25,
    status: status && status in UserStatus ? (status as UserStatus) : undefined,
    role: role && role in UserRole ? (role as UserRole) : undefined,
    search: typeof sp.search === "string" && sp.search ? sp.search : undefined,
  });

  const query = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({ ...(status ? { status } : {}), ...(role ? { role } : {}), ...overrides });

  return (
    <>
      <PageHeader title="Users" subtitle={`${data.total.toLocaleString()} members.`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Status:</span>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s || "all"}
            href={`/admin/users?${query(s ? { status: s } : {})}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              status === s
                ? "border-primary bg-primary-faint text-primary-strong"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {s || "All"}
          </Link>
        ))}
        <span className="ml-2 text-xs font-medium text-muted">Role:</span>
        {ROLE_FILTERS.map((r) => (
          <Link
            key={r || "all"}
            href={`/admin/users?${query(r ? { role: r } : {})}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              role === r
                ? "border-primary bg-primary-faint text-primary-strong"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {r || "All"}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-soft">
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Balance</th>
              <th className="px-4 py-3 font-semibold">Withdrawals</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-foreground hover:underline">
                    {u.profile?.fullName ?? u.email}
                  </Link>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3">
                  <UserRoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">{Intl.NumberFormat("en-NG").format((u.wallet?.availableBalance ?? 0) / 100)} ₦</td>
                <td className="px-4 py-3 text-muted">{u._count.withdrawals}</td>
                <td className="px-4 py-3 text-muted">{formatDateTime(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {data.page} of {data.pages}
          </span>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link href={`/admin/users?${query({ page: String(data.page - 1) })}`} className="text-primary hover:underline">
                Previous
              </Link>
            )}
            {data.page < data.pages && (
              <Link href={`/admin/users?${query({ page: String(data.page + 1) })}`} className="text-primary hover:underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}