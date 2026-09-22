import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { getWallet, listTransactions } from "@/services/wallet";
import { WalletView } from "@/components/wallet/wallet-view";

export const metadata: Metadata = { title: "Wallet" };

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const session = await getCurrentUser();
  if (!session) return null;
  const { user } = session;

  const [wallet, transactions] = await Promise.all([
    getWallet(user.id),
    listTransactions(user.id, { limit: 30 }),
  ]);

  return (
    <WalletView
      wallet={wallet}
      initialTransactions={transactions.map((t) => ({
        id: t.id,
        type: t.type,
        direction: t.direction,
        amount: t.amount,
        description: t.description,
        reference: t.reference,
        createdAt: t.createdAt.toISOString(),
        status: t.status,
      }))}
    />
  );
}