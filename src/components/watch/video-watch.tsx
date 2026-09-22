"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CheckIcon, PlayIcon, SparklesIcon } from "@/components/ui/icons";
import { apiFetch, apiErrorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type OpportunityProps = {
  id: string;
  title: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  rewardAmount: number;
};

type SessionProps = {
  id: string;
  startedAt: string;
  watchedDuration: number;
  requiredDuration: number;
};

type Phase = "intro" | "loading" | "watching" | "completing" | "done" | "error";

const HEARTBEAT_MS = 5000;

export function VideoWatch({
  opportunity,
  initialSession,
}: {
  opportunity: OpportunityProps;
  initialSession: SessionProps | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [session, setSession] = useState<SessionProps | null>(initialSession);
  const [serverWatched, setServerWatched] = useState<number>(
    initialSession?.watchedDuration ?? 0,
  );
  const [mediaEnded, setMediaEnded] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ rewardAmount: number; pending: boolean } | null>(null);

  const maybeError = useCallback((err: unknown) => {
    setMessage(apiErrorMessage(err));
    setPhase("error");
  }, []);

  // Kick-off: create the session when the user taps "Start watching".
  async function onStart() {
    setPhase("loading");
    setMessage(null);
    try {
      const res = await apiFetch<{ session: SessionProps }>("/api/watch-sessions", {
        body: { opportunityId: opportunity.id },
      });
      const s = res?.session;
      if (!s) throw new Error("No session returned.");
      setSession(s);
      setServerWatched(s.watchedDuration ?? 0);
      setNow(Date.now());
      setPhase("watching");
    } catch (err) {
      maybeError(err);
    }
  }

  const elapsed = useMemo(() => {
    if (!session) return 0;
    const seconds = Math.floor((now - Date.parse(session.startedAt)) / 1000);
    return Math.max(0, Math.min(seconds, session.requiredDuration));
  }, [session, now]);

  // 1s tick while watching, plus 5s heartbeats.
  useEffect(() => {
    if (phase !== "watching") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    if (phase !== "watching" || !session) return;
    let stopped = false;
    const beat = async () => {
      try {
        const res = await apiFetch<{ watchedDuration: number; remainingSeconds: number }>(
          `/api/watch-sessions/${session.id}/heartbeat`,
          { body: { watchedSeconds: Math.ceil(elapsed) } },
        );
        if (!stopped && res) setServerWatched((prev) => Math.max(prev, res.watchedDuration));
      } catch {
        // Heartbeat failures are non-fatal; completion re-checks server-side.
      }
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id, elapsed, session?.requiredDuration]);

  const progress = session ? serverWatched / session.requiredDuration : 0;
  const watchingDone = elapsed >= (session?.requiredDuration ?? Infinity);
  const canComplete = phase === "watching" && watchingDone && mediaEnded;
  const starting = phase === "loading";
  const completing = phase === "completing";

  async function onComplete() {
    if (!session) return;
    setPhase("completing");
    setMessage(null);
    try {
      const res = await apiFetch<{
        reward: { amount: number; status: string };
      }>(`/api/watch-sessions/${session.id}/complete`, { method: "POST" });
      setResult({
        rewardAmount: res?.reward?.amount ?? opportunity.rewardAmount,
        pending: res?.reward?.status !== "AVAILABLE",
      });
      setPhase("done");
      router.refresh();
    } catch (err) {
      maybeError(err);
    }
  }

  // Auto-complete once the media ends and the watch time is satisfied.
  const autoCompletedRef = useRef(false);
  useEffect(() => {
    if (canComplete && !autoCompletedRef.current) {
      autoCompletedRef.current = true;
      window.setTimeout(() => onComplete(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canComplete]);

  if (phase === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:px-10">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckIcon size={28} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-foreground">Watch complete!</h2>
          <p className="mt-1 text-sm text-muted">
            Your verified reward of{" "}
            <strong className="text-foreground">{formatMoney(result.rewardAmount)}</strong> is{" "}
            {result.pending ? "in review and will be released shortly." : "now available in your wallet."}
          </p>
        </div>
        {result.pending && (
          <Alert tone="info">Pending rewards become available automatically after validation.</Alert>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push("/wallet")}>View wallet</Button>
          <Button variant="outline" onClick={() => router.push("/opportunities")}>
            Watch another
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-sm font-medium text-foreground">We couldn&apos;t continue</p>
        <p className="mt-1 text-sm text-muted">{message ?? "Something went wrong."}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button onClick={() => router.push("/opportunities")} variant="outline">
            Opportunities
          </Button>
          {session && (
            <Button
              onClick={() => {
                setMessage(null);
                setPhase("watching");
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {phase === "watching" && opportunity.videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={opportunity.videoUrl}
              poster={opportunity.thumbnailUrl ?? undefined}
              autoPlay
              controls
              playsInline
              className="h-full w-full"
              onEnded={() => setMediaEnded(true)}
            />
            {!watchingDone && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-white/90">
                  <span className="flex items-center gap-1">
                    <PlayIcon size={13} />
                    Watch nearly done
                  </span>
                  <span className="tabular-nums">
                    {formatClock(session!.requiredDuration - elapsed)} remaining
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-1000"
                    style={{ width: `${Math.min(100, (elapsed / session!.requiredDuration) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {watchingDone && !mediaEnded && (
              <div className="absolute inset-x-0 bottom-0 bg-primary p-3 text-center text-sm font-semibold text-white">
                Watch time reached — finish the video to earn your reward.
              </div>
            )}
          </>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-surface-muted"
            style={
              opportunity.thumbnailUrl
                ? {
                    backgroundImage: `url(${opportunity.thumbnailUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg">
              <PlayIcon size={30} />
            </span>
          </div>
        )}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {phase === "intro" && (
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                <SparklesIcon size={16} className="text-primary" />
                Earn {formatMoney(opportunity.rewardAmount)} for watching
              </h3>
              <p className="mt-1 text-sm text-muted">
                Watch the full {opportunity.durationSeconds}-second video. Your watch time is
                tracked on our servers and the reward is granted right after completion.
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-muted">
              <li className="flex items-center gap-2">
                <CheckIcon size={15} className="text-success" /> Complete the full video
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon size={15} className="text-success" /> No forwarding — progress is
                server-verified
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon size={15} className="text-success" /> Credit hits your wallet ledger
              </li>
            </ul>
            <Button size="lg" className="w-full" onClick={onStart} loading={starting}>
              Start watching
            </Button>
          </div>
        )}

        {phase === "loading" && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Preparing your session…
          </div>
        )}

        {phase === "watching" && session && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Progress</span>
              <span className="tabular-nums text-muted">
                {formatClock(serverWatched)} / {formatClock(session.requiredDuration)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-1000",
                  watchingDone ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, progress * 100)}%` }}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {canComplete
                  ? "Ready! Your reward will be credited now."
                  : mediaEnded
                    ? "Finishing up…"
                    : "Keep watching to reach the full watch time."}
              </p>
              <Button
                onClick={onComplete}
                loading={completing}
                disabled={!canComplete}
              >
                {canComplete ? "Complete & earn" : "Finish to claim reward"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}