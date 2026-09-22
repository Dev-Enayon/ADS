import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { getWallet } from "@/services/wallet";
import { listWithdrawals } from "@/services/withdrawals";
import { withdrawalRules } from "@/lib/settings";
import { WithdrawalsView } from "@/components/withdrawals/withdrawals-view";

export const metadata: Metadata = { title: "Withdrawals" };

export const dynamic = "force-dynamic";

export default async function WithdrawalsPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const [wallet, withdrawals, rules] = await Promise.all([
    getWallet(user.id),
    listWithdrawals(user.id),
    withdrawalRules(),
  ]);

  return (
    <WithdrawalsView
      user={{
        emailVerified: user.emailVerifiedAt != null,
        status: user.status,
      }}
      wallet={{
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
      }}
      withdrawals={withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        fee: w.fee,
        netAmount: w.netAmount,
        status: w.status,
        reference: w.reference,
        paymentMethod: w.paymentMethod,
        failureReason: w.failureReason,
        createdAt: w.createdAt.toISOString(),
      }))}
      rules={rules}
    />
  );
}