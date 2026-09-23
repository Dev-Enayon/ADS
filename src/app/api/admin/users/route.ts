import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { json } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireAdminFromRequest } from "@/lib/auth/admin";
import { listUsers } from "@/services/admin/users";

export const GET = route({}, async (req) => {
  await requireAdminFromRequest(req);
  const url = new URL(req.url);

  const statusRaw = url.searchParams.get("status");
  const roleRaw = url.searchParams.get("role");

  const result = await listUsers({
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 25),
    status: (statusRaw && statusRaw in UserStatus ? statusRaw : undefined) as UserStatus | undefined,
    role: (roleRaw && roleRaw in UserRole ? roleRaw : undefined) as UserRole | undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  return json(result);
});