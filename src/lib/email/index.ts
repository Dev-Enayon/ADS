import "server-only";

import { env } from "@/lib/env";
import { generateToken } from "@/lib/security/password";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Email abstraction.
 *
 * Part 1 ships with a "log" transport (messages are printed server-side and
 * a link is provided). Production deploys swap EMAIL_TRANSPORT to a real
 * provider (e.g. Resend, SES) by extending this function only.
 */
export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  const id = generateToken(16);
  if (env.emailTransport === "smtp" || env.emailTransport === "http") {
    // Placeholder for a real provider integration (Part 3 / production).
    throw new Error(`Email transport "${env.emailTransport}" is not configured yet.`);
  }
  // Default "log" transport: safe for development.
  console.info(
    [
      `\n[email:dev] ${id}`,
      `  from:    ${env.emailFrom}`,
      `  to:      ${message.to}`,
      `  subject: ${message.subject}`,
      `  text:    ${message.text.split("\n").join("\n           ")}`,
    ].join("\n"),
  );
  return { id };
}