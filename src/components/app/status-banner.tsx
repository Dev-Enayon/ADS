import { UserStatus } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import { ResendVerificationButton } from "@/components/app/resend-verification-button";
import { ShieldIcon } from "@/components/ui/icons";

export function StatusBanner({
  status,
  emailVerified,
  email,
}: {
  status: string;
  emailVerified: boolean;
  email: string;
}) {
  if (status === UserStatus.SUSPENDED) {
    return (
      <Alert tone="danger" className="mb-4">
        <div className="flex items-start gap-3">
          <ShieldIcon className="mt-0.5 text-danger" />
          <div>
            <p className="font-semibold">Account suspended</p>
            <p className="text-muted">
              This account has been suspended. If you believe this is a mistake,
              please contact support.
            </p>
          </div>
        </div>
      </Alert>
    );
  }

  if (!emailVerified) {
    return (
      <Alert tone="warning" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Verify your email to start earning</p>
            <p className="text-muted">
              We sent a verification link to <strong>{email}</strong>. Rewards and
              withdrawals are unlocked after verification.
            </p>
          </div>
          <ResendVerificationButton email={email} />
        </div>
      </Alert>
    );
  }

  return null;
}