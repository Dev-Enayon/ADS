import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { requireUserFromRequest } from "@/lib/auth/session";
import { route } from "@/lib/api-handler";

import {
  MAX_SIZE_BYTES,
  ALLOWED,
  extForType,
  sniffImageBytes,
  isBlobManagedUrl,
  storeAvatarBlob,
  delPreviousAvatarAfterSuccess,
} from "@/lib/avatar/upload";

export const runtime = "nodejs";

export const POST = route({ originCheck: true }, async (req) => {
  const { user } = await requireUserFromRequest(req);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Errors.serviceUnavailable(
      "Avatar storage is not configured. Set BLOB_READ_WRITE_TOKEN.",
    );
  }

  const form = await req.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) {
    throw Errors.badRequest("Upload an avatar file.", "NO_FILE");
  }

  const ext = extForType(file.type);
  if (!ext) {
    throw Errors.badRequest("Avatar must be a PNG, JPEG or WebP image.", "UNSUPPORTED_TYPE");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw Errors.badRequest("Avatar must be smaller than 2MB.", "FILE_TOO_LARGE");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniffImageBytes(ext, bytes)) {
    throw Errors.badRequest("File content does not match its declared type.", "CONTENT_MISMATCH");
  }

  const pathname = `avatars/${user.id}/${randomUUID()}.${ext}`;
  const avatarUrl = await storeAvatarBlob({
    pathname,
    bytes,
    contentType: file.type,
  });

  const existing = await prisma.profile.findUnique({
    where: { userId: user.id },
    select: { avatarUrl: true },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { avatarUrl },
    create: { userId: user.id, avatarUrl },
  });

  await delPreviousAvatarAfterSuccess(existing?.avatarUrl ?? null, avatarUrl);

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "PROFILE.AVATAR_UPDATED",
      meta: { pathname } as object,
    },
  });

  return NextResponse.json({ avatarUrl }, { status: 201 });
});
