import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProbeResult = {
  /** Server-measured duration in seconds, when ffprobe is available. */
  durationSeconds: number | null;
  /** True when the duration came from a real media probe. */
  verified: boolean;
  /** Response Content-Type of the URL, when reachable. */
  contentType: string | null;
  /** True when the URL could not be reached/validated. */
  unreachable: boolean;
};

/**
 * Best-effort server-side validation of a video asset:
 *  1. confirms the URL is reachable over HTTP(S);
 *  2. when ffprobe exists, extracts the real duration.
 *
 * Client-supplied durations are NEVER trusted for accounting: they are only
 * used as a fallback metadata value and are re-validated against platform
 * min/max rules server-side.
 */
export async function probeVideoUrl(url: string): Promise<ProbeResult> {
  let contentType: string | null = null;
  let unreachable = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    contentType = res.headers.get("content-type");
    if (!res.ok) unreachable = true;
  } catch {
    unreachable = true;
  }

  const durationSeconds = await probeDurationViaFfprobe(url);
  return {
    durationSeconds,
    verified: durationSeconds !== null,
    contentType,
    unreachable,
  };
}

async function probeDurationViaFfprobe(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        url,
      ],
      { timeout: 12_000, windowsHide: true },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
    };
    const duration = Number.parseFloat(parsed.format?.duration ?? "");
    if (Number.isFinite(duration) && duration > 0) {
      return Math.max(0, Math.round(duration));
    }
    return null;
  } catch {
    return null; // ffprobe missing or the URL did not resolve as a media file
  }
}