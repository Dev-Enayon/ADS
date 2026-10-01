import { put, del } from "@vercel/blob";

/** 2 MiB hard cap, enforced BEFORE anything is read into memory. */
export const MAX_SIZE_BYTES = 2 * 1024 * 1024;

/** MIME -> canonical file extension. PNG/JPEG/WebP only (matches the UI copy). */
export const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Magic-byte sniffers keyed by extension — Content-Type is NEVER trusted alone. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a,
  jpg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    b.length >= 12 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP",
};

export function extForType(type: string): string | undefined {
  return ALLOWED[type];
}

export function sniffImageBytes(ext: string, bytes: Buffer): boolean {
  const fn = MAGIC[ext];
  return !!fn && fn(bytes);
}

/** True only for Blob-managed URLs. Guards cleanup so we NEVER delete the profile
 * body, other managed assets, or arbitrary same-domain resources. */
export function isBlobManagedUrl(
  url: string | null | undefined,
): url is string {
  if (!url) return false;
  try {
    return new URL(url).host.endsWith("blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Store an avatar blob and return its public URL.
 * Throws (propagates) on failure — the caller must only persist the URL on
 * success; never fake success, never write a stale/empty URL to the DB.
 */
export async function storeAvatarBlob(opts: {
  pathname: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const { url } = await put(opts.pathname, opts.bytes, {
    access: "public",
    contentType: opts.contentType,
    addRandomSuffix: false,
  });
  return url;
}

/**
 * Best-effort cleanup of the PREVIOUS avatar blob. Call ONLY after the new URL
 * has been successfully persisted (never delete-before-success). Only touches
 * Blob-managed URLs and never deletes a URL equal to the fresh one. Failures
 * are swallowed — cleanup must not make a successful update look failed.
 */
export async function delPreviousAvatarAfterSuccess(
  previousUrl: string | null | undefined,
  newUrl: string,
): Promise<void> {
  if (!isBlobManagedUrl(previousUrl) || previousUrl === newUrl) return;
  await del(previousUrl).catch(() => undefined);
}
