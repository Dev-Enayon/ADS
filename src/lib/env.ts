export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionCookieName:
    process.env.SESSION_COOKIE_NAME ?? "rewardhub_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  emailFrom: process.env.EMAIL_FROM ?? "RewardHub <no-reply@rewardhub.dev>",
  emailTransport: process.env.EMAIL_TRANSPORT ?? "log",
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
};

export const isProd = env.nodeEnv === "production";