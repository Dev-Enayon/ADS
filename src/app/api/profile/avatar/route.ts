import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { getRequestContext } from "@/lib/api";
import { route } from "@/lib/api-handler";
import { requireUserFromRequest } from "@/lib/auth/session";
import { Errors } from "@/lib/errors";
import { prisma } from "@/lib/db";

const AVATAR_DIR = path.join(process.cwd(), "storage", "avatars");
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const runtime = "nodejs";

export const POST = route({ originCheck: true }, async (req) => {
  const { user } = await requireUserFromRequest(req);

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    throw Errors.badRequest("Upload an avatar file.", "NO_FILE");
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    throw Errors.badRequest("Avatar must be a PNG, JPEG or WebP image.", "UNSUPPORTED_TYPE");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw Errors.badRequest("Avatar must be smaller than 2MB.", "FILE_TOO_LARGE");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = `${randomUUID()}.${ext}`;

  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, fileName), bytes);

  const avatarUrl = `/api/profile/avatar/${fileName}`;

  const existing = await prisma.profile.findUnique({ where: { userId: user.id } });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { avatarUrl },
    create: { userId: user.id, avatarUrl },
  });

  // Best-effort cleanup of the previous avatar file.
  if (existing?.avatarUrl?.startsWith("/api/profile/avatar/")) {
    const oldName = existing.avatarUrl.split("/").pop();
    if (oldName && oldName !== fileName) {
      unlink(path.join(AVATAR_DIR, oldName)).catch(() => undefined);
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PROFILE.AVATAR_UPDATED",
      meta: { fileName } as object,
      ipAddress: getRequestContext(req).ip as string | null,
    },
  });

  return NextResponse.json({ avatarUrl }, { status: 201 });
});