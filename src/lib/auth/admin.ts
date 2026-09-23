import "server-only";

import { UserRole } from "@/generated/prisma/enums";
import { Errors } from "@/lib/errors";
import {
  getCurrentUser,
  getUserFromRequest,
  type ResolvedUser,
} from "@/lib/auth/session";

/**
 * Part 3 admin authorization.
 *
 * Hierarchy: SUPER_ADMIN > ADMIN > (regular users). ADMIN can operate the
 * console; SUPER_ADMIN additionally manages other admins and destructive
 * operations. These helpers never leak whether an account exists: a
 * non-admin caller gets the same 404/403 a nonexistent one would.
 */

export function isAdminRole(role: string): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function isSuperAdmin(role: string): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export function assertSuperAdmin(role: string): void {
  if (!isSuperAdmin(role)) {
    throw Errors.forbidden(
      "Only a super admin can do that.",
    );
  }
}

/** Server-component guard (layouts/pages): null when not an admin. */
export async function getAdminSession(): Promise<ResolvedUser | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  return isAdminRole(session.user.role) ? session : null;
}

export async function requireAdminFromRequest(req: Request): Promise<ResolvedUser> {
  const session = await getUserFromRequest(req);
  if (!session) throw Errors.unauthorized();
  if (!isAdminRole(session.user.role)) throw Errors.forbidden();
  return session;
}

export async function requireSuperAdminFromRequest(req: Request): Promise<ResolvedUser> {
  const session = await requireAdminFromRequest(req);
  assertSuperAdmin(session.user.role);
  return session;
}