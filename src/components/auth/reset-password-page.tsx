"use client";

import { useSearchParams } from "next/navigation";
import { ResetPasswordForm, InvalidToken } from "@/components/auth/reset-password-form";

export function ResetPasswordPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  if (!token || token.length < 20) {
    return <InvalidToken />;
  }
  return <ResetPasswordForm token={token} />;
}