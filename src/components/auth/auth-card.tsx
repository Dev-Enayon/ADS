import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";
import { Card } from "@/components/ui/card";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Link href="/" aria-label="RewardHub home">
          <Logo />
        </Link>
      </div>
      <Card className="p-6 sm:p-8">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </Card>
      {footer && <div className="text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}