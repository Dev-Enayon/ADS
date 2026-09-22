import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordPageInner } from "@/components/auth/reset-password-page";

export const metadata: Metadata = { title: "Reset your password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}