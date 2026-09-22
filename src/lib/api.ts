import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError } from "@/lib/errors";
import { isProd } from "@/lib/env";

export type ApiContext = {
  ip: string | null;
  userAgent: string | null;
};

export function getRequestContext(req: Request): ApiContext {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  return {
    ip,
    userAgent: req.headers.get("user-agent"),
  };
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 200 });
}

/** SAFETY: swallowed error details are logged here so we never leak internals. */
function logServerError(err: unknown): void {
  if (err instanceof AppError) {
    console.error(
      `[api] ${err.code} ${err.status} ${err.message}`,
      err.details ? JSON.stringify(err.details) : "",
    );
  } else if (err instanceof Error) {
    console.error(`[api] error: ${err.message}`, err.stack);
  } else {
    console.error("[api] unknown error", err);
  }
}

export function apiError(err: unknown): NextResponse {
  logServerError(err);

  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }

  if (err instanceof ZodError) {
    const issues = (err.issues ?? []).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input.", issues } },
      422,
    );
  }

  if (isPrismaUniqueError(err)) {
    return json(
      {
        error: {
          code: "CONFLICT",
          message: "That request conflicts with an existing record.",
        },
      },
      409,
    );
  }

  return json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    500,
  );
}

function isPrismaUniqueError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code: string }).code === "P2002";
  }
  return false;
}

/** Parse a JSON body safely. Returns null when body is absent/invalid. */
export async function readJson<T = Record<string, unknown>>(
  req: Request,
): Promise<T | null> {
  try {
    if (!req.body) return null;
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Omit development-only checks in production. */
export { isProd };