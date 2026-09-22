/**
 * Application error with an HTTP status code, an optional user-facing
 * message, and an optional machine-readable code.
 *
 * Never attach secrets, stack traces or internal details to the `message`
 * that is intended for clients. Internal context goes in `details`, which
 * is only logged server-side.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = "You must be signed in.") =>
    new AppError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "You do not have permission to do that.") =>
    new AppError(403, "FORBIDDEN", msg),
  notFound: (msg = "Not found.") => new AppError(404, "NOT_FOUND", msg),
  conflict: (msg: string, code = "CONFLICT") =>
    new AppError(409, code, msg),
  validation: (msg = "Invalid input.") =>
    new AppError(422, "VALIDATION_ERROR", msg),
  badRequest: (msg: string, code = "BAD_REQUEST") =>
    new AppError(400, code, msg),
  tooManyRequests: (msg = "Too many requests. Please try again later.") =>
    new AppError(429, "RATE_LIMITED", msg),
  insufficientFunds: (msg = "Insufficient available balance.") =>
    new AppError(400, "INSUFFICIENT_FUNDS", msg),
  suspended: (msg = "This account is suspended.") =>
    new AppError(403, "ACCOUNT_SUSPENDED", msg),
};