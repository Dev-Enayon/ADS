import { cn } from "@/lib/utils";

export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          Reward<span className="text-primary">Hub</span>
        </span>
      )}
    </span>
  );
}