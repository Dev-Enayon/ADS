import { cn } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-16 w-16 text-xl",
  };
  const initials = (name ?? "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "User avatar"}
        className={cn("rounded-full object-cover", sizes[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex select-none items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-strong",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}