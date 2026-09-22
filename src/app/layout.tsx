import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RewardHub — Earn rewards for watching sponsored videos",
    template: "%s · RewardHub",
  },
  description:
    "RewardHub is a trusted rewards platform. Discover sponsored videos, complete eligible activities and earn verified rewards into your wallet.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}