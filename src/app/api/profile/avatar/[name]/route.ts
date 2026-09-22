import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const AVATAR_DIR = path.join(process.cwd(), "storage", "avatars");

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params;
  // Strict pattern: blocks path traversal and non-image names.
  if (!/^[0-9a-f-]{36}\.(png|jpe?g|webp)$/i.test(name)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = name.split(".").pop()!.toLowerCase();
  try {
    const bytes = await readFile(path.join(AVATAR_DIR, name));
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}