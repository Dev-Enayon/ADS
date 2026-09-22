import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import {
  BellIcon,
  ClockIcon,
  PlayIcon,
  ShieldIcon,
  SparklesIcon,
  WalletIcon,
} from "@/components/ui/icons";

const features = [
  {
    icon: <PlayIcon />,
    title: "Watch sponsored videos",
    description:
      "Discover legitimate sponsored content and earn a verified reward for every video you complete.",
  },
  {
    icon: <WalletIcon />,
    title: "A real wallet & ledger",
    description:
      "Every reward is tracked in a transparent ledger. See pending and available balances at a glance.",
  },
  {
    icon: <ShieldIcon />,
    title: "Verified, not invented",
    description:
      "Rewards are granted server-side after genuine watch sessions. No fake balances, no fake payouts.",
  },
  {
    icon: <BellIcon />,
    title: "Always stay in the loop",
    description:
      "Notifications for every reward, withdrawal and security event on your account.",
  },
];

const steps = [
  { n: "01", title: "Create an account", text: "Sign up in seconds and verify your email." },
  { n: "02", title: "Watch & earn", text: "Open an eligible sponsored video and complete the watch time." },
  { n: "03", title: "Withdraw anytime", text: "Move verified rewards to your preferred payout method." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
              <SparklesIcon size={14} className="text-primary" />
              Earn verified rewards for sponsored content
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
              Watch sponsored videos.
              <br />
              <span className="text-primary">Earn real rewards.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
              RewardHub connects you with approved sponsored opportunities. Complete the watch,
              pass validation, and your verified reward lands in a transparent wallet — not a
              promise.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  Create free account
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Sign in
                </Button>
              </Link>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-soft">
              <ClockIcon size={13} />
              Free to join · No cost to start earning
            </p>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="p-6 sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] bg-primary-faint text-primary-strong">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-[var(--radius)] border border-border bg-surface p-6">
                <span className="text-2xl font-extrabold text-primary-soft">{s.n}</span>
                <h3 className="mt-2 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Ready to earn your first reward?
            </h2>
            <p className="mt-2 text-muted">
              Join RewardHub in under a minute and start with a batch of sponsored videos.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto">
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} RewardHub. All rights reserved.</span>
          <span className="flex items-center gap-4">
            <span>Terms</span>
            <span>Privacy</span>
            <span>Support</span>
          </span>
        </div>
      </footer>
    </div>
  );
}