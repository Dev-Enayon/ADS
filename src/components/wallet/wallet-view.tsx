"use client";

import { useState } from "react";
import Link from "next/link";

import { MoneyCard } from "@/components/dashboard/money-card";
import { TransactionList } from "@/components/dashboard/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/client-api";

type Tx = {
  id: string;
  type: string;
  direction: string;
  amount: number;
  description: string;
  reference: string;
  createdAt: string;
  status: string;
};

export function WalletView({
  wallet,
  initialTransactions,
}: {
  wallet: {
    availableBalance: number;
    pendingBalance: number;
    totalEarned: number;
    totalWithdrawn: number;
  };
  initialTransactions: Tx[];
}) {
  const [transactions, setTransactions] = useState<Tx[]>(initialTransactions);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const res = await apiFetch<{ transactions: Tx[] }>(
        `/api/wallet/transactions?limit=30&offset=${transactions.length}`,
      );
      setTransactions((prev) => [...prev, ...(res?.transactions ?? [])]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Every credit and debit in your account, tracked in a transparent ledger.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyCard
          label="Available"
          amount={wallet.availableBalance}
          tone="success"
          hint="Ready to withdraw"
        />
        <MoneyCard
          label="Pending"
          amount={wallet.pendingBalance}
          hint="Passing validation"
        />
        <MoneyCard
          label="Total earned"
          amount={wallet.totalEarned}
          tone="info"
          hint="Lifetime earnings"
        />
        <MoneyCard
          label="Total withdrawn"
          amount={wallet.totalWithdrawn}
          hint="Sent to payout"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/withdrawals">
          <Button>Withdraw</Button>
        </Link>
        <Link href="/opportunities">
          <Button variant="outline">Earn more</Button>
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Transaction history"
          subtitle={transactions.length > 0 ? "Most recent first" : undefined}
        />
        <CardBody>
          <TransactionList transactions={transactions} />
          {transactions.length >= 30 && (
            <div className="mt-4 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} loading={loading}>
                Load more
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}