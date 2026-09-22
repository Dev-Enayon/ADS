import "server-only";

function browserName(ua: string): string | null {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  if (/opera|opr\//i.test(ua)) return "Opera";
  return null;
}

function osName(ua: string): string | null {
  if (/iphone|ipod/i.test(ua)) return "iOS";
  if (/ipad/i.test(ua)) return "iPadOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

/** "Chrome · Linux" style label for a user-agent string. */
export function deviceNameFromUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const browser = browserName(userAgent) ?? "Browser";
  const os = osName(userAgent) ?? "Device";
  return `${browser} · ${os}`;
}