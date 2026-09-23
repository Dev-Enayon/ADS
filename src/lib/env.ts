export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionCookieName:
    process.env.SESSION_COOKIE_NAME ?? "rewardhub_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  emailFrom: process.env.EMAIL_FROM ?? "RewardHub <no-reply@rewardhub.dev>",
  emailTransport: process.env.EMAIL_TRANSPORT ?? "log",
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Part 3: payment/payout driver selection + webhook signing
  paymentProvider: process.env.PAYMENT_PROVIDER ?? "DEV_MOCK",
  payoutProvider: process.env.PAYOUT_PROVIDER ?? "MANUAL",
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
  payoutWebhookSecret: process.env.PAYOUT_WEBHOOK_SECRET ?? "",
  // Optional bootstrap super admin (idempotent, set once at deploy time).
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "",
};

export const isProd = env.nodeEnv === "production";