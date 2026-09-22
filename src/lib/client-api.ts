"use client";

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  issues?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    status: number,
    code?: string,
    issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T = unknown>(
  path: string,
  opts: Options = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...opts.headers,
  };
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const errBody =
      data && typeof data === "object" && "error" in data
        ? (data as { error?: { message?: string; code?: string; issues?: Array<{ path: string; message: string }> } }).error
        : undefined;
    throw new ApiRequestError(
      errBody?.message ?? "Something went wrong. Please try again.",
      res.status,
      errBody?.code,
      errBody?.issues,
    );
  }
  return data as T;
}

/** Error message helper that formats field-level validation problems. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.issues && err.issues.length > 0) {
      return err.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}