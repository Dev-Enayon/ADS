import { describe, expect, it, vi, beforeEach } from "vitest";

import { randomUUID } from "node:crypto";
import { put as blobPut, del as blobDel } from "@vercel/blob";

import {
  MAX_SIZE_BYTES,
  ALLOWED,
  extForType,
  sniffImageBytes,
  isBlobManagedUrl,
  storeAvatarBlob,
  delPreviousAvatarAfterSuccess,
} from "../src/lib/avatar/upload";

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: vi.fn(),
}));

const putMock = vi.mocked(blobPut);
const delMock = vi.mocked(blobDel);

function pngBytes(): Buffer {
  const b = Buffer.alloc(16);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  return b;
}

describe("extForType (MIME allowlist)", () => {
  it("maps supported types to a safe file extension", () => {
    expect(extForType("image/png")).toBe("png");
    expect(extForType("image/jpeg")).toBe("jpg");
    expect(extForType("image/webp")).toBe("webp");
  });

  it("rejects anything not on the allowlist", () => {
    expect(extForType("image/gif")).toBeUndefined();
    expect(extForType("image/svg+xml")).toBeUndefined();
    expect(extForType("text/html")).toBeUndefined();
    expect(extForType("application/pdf")).toBeUndefined();
  });

  it("exposes only PNG, JPEG and WebP in ALLOWED", () => {
    expect(Object.keys(ALLOWED).sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("sniffImageBytes (magic-byte, content over declared type)", () => {
  it("accepts a real PNG signature", () => {
    expect(sniffImageBytes("png", pngBytes())).toBe(true);
  });

  it("rejects bytes that do not match the declared type", () => {
    expect(sniffImageBytes("png", Buffer.from("not-an-image"))).toBe(false);
    expect(sniffImageBytes("jpg", pngBytes())).toBe(false);
  });
});

describe("isBlobManagedUrl (guardrail for cleanup)", () => {
  it("recognizes Blob-managed URLs", () => {
    expect(
      isBlobManagedUrl(
        "https://x.public.blob.vercel-storage.com/avatars/user-1/abc.png",
      ),
    ).toBe(true);
  });

  it("rejects non-Blob URLs", () => {
    expect(isBlobManagedUrl("https://example.com/avatars/x.png")).toBe(false);
    expect(isBlobManagedUrl("/api/profile/avatar/abc.png")).toBe(false);
    expect(isBlobManagedUrl("")).toBe(false);
  });
});

describe("storeAvatarBlob", () => {
  let url = "";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(blobPut).mockResolvedValue({
      url: "https://x.public.blob.vercel-storage.com/avatars/user-1/abc.png",
      pathname: "avatars/user-1/abc.png",
      contentType: "image/png",
    } as Awaited<ReturnType<typeof blobPut>>);
  });

  it("puts a public, no-suffix blob and returns the URL", async () => {
    const bytes = pngBytes();
    url = await storeAvatarBlob({
      pathname: "avatars/user-1/abc.png",
      bytes,
      contentType: "image/png",
    });

    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, putBytes, opts] = putMock.mock.calls[0];
    expect(pathname).toBe("avatars/user-1/abc.png");
    expect(putBytes).toBe(bytes);
    expect(opts).toMatchObject({
      access: "public",
      addRandomSuffix: false,
      contentType: "image/png",
    });
    expect(url).toBe(
      "https://x.public.blob.vercel-storage.com/avatars/user-1/abc.png",
    );
  });

  it("propagates put failure", async () => {
    putMock.mockRejectedValue(new Error("blob down"));
    await expect(
      storeAvatarBlob({
        pathname: "avatars/user-1/abc.png",
        bytes: pngBytes(),
        contentType: "image/png",
      }),
    ).rejects.toThrow("blob down");
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});

describe("delPreviousAvatarAfterSuccess (replacement cleanup ordering)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the previous URL only after success", async () => {
    delMock.mockResolvedValue(undefined);
    const old =
      "https://old.public.blob.vercel-storage.com/avatars/user-1/old.png";
    await delPreviousAvatarAfterSuccess(old, "https://patch.local/patch.png");
    expect(delMock).toHaveBeenCalledTimes(1);
    expect(delMock).toHaveBeenCalledWith(old);
  });

  it("never deletes a non-Blob URL", async () => {
    delMock.mockResolvedValue(undefined);
    await delPreviousAvatarAfterSuccess(
      "/api/profile/avatar/old.png",
      "https://new.public.blob.vercel-storage.com/avatars/user-1/new.png",
    );
    expect(delMock).not.toHaveBeenCalled();
  });

  it("never deletes when old equals new", async () => {
    delMock.mockResolvedValue(undefined);
    const same =
      "https://a.public.blob.vercel-storage.com/avatars/user-1/x.png";
    await delPreviousAvatarAfterSuccess(same, same);
    expect(delMock).not.toHaveBeenCalled();
  });

  it("swallows cleanup failure (update already succeeded)", async () => {
    delMock.mockRejectedValue(new Error("del failed"));
    await expect(
      delPreviousAvatarAfterSuccess(
        "https://old.public.blob.vercel-storage.com/avatars/user-1/old.png",
        "https://new.public.blob.vercel-storage.com/avatars/user-1/new.png",
      ),
    ).resolves.toBeUndefined();
  });
});

void MAX_SIZE_BYTES;
void ALLOWED;
void randomUUID;
