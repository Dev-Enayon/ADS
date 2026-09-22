import type { Metadata } from "next";
import Link from "next/link";
import { AppError } from "@/lib/errors";
import { verifyEmail } from "@/lib/auth/service";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckIcon, XIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Verify your email" };

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let verified: string | null = null;
  let error: string | null = null;

  if (token) {
    try {
      const result = await verifyEmail(token);
      verified = result.email;
    } catch (err) {
      error = err instanceof AppError ? err.message : "We couldn't verify this link.";
    }
  } else {
    error = "Missing verification token. Use the full link from your email.";
  }

  return (
    <AuthCard
      title={verified ? "Email verified" : "Verify your email"}
      subtitle={
        verified
          ? "Your account is now active. Time to start earning."
          : "We couldn't complete verification"
      }
    >
      {verified ? (
        <div className="space-y-6">
          <div className="flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckIcon size={24} />
            </span>
          </div>
          <Alert tone="success">
            <strong>{verified}</strong> is verified. Rewards and withdrawals are now unlocked.
          </Alert>
          <Link href="/dashboard" className="block">
            <Button className="w-full" size="lg">
              Go to dashboard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <XIcon size={24} />
            </span>
          </div>
          <Alert tone="danger">{error}</Alert>
          <div className="flex gap-3">
            <Link href="/login" className="flex-1">
              <Button variant="outline" className="w-full">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      )}
    </AuthCard>
  );
}