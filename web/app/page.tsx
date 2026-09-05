import {
  Flame,
  QrCode,
  Trophy,
  ShieldCheck,
  Bell,
  MapPin,
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  Building2,
} from "lucide-react";
import Link from "next/link";

import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <>
      <SiteNavbar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <RewardsShowcase />
        <OwnerCta />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}

/* --------------------------------- Shared --------------------------------- */

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-gradient-brand">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </div>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-border/70"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 15% 0%, var(--brand-start), transparent), radial-gradient(50% 40% at 100% 20%, var(--brand-end), transparent)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-20 sm:px-8 md:grid-cols-2 md:items-center md:py-28">
        <div>
          <Badge
            variant="outline"
            className="mb-5 gap-1.5 border-border/80 text-muted-foreground"
          >
            <MapPin className="size-3 text-primary" />
            Verified check-ins, not the honor system
          </Badge>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Turn gym consistency into{" "}
            <span className="text-gradient-brand">real rewards</span>.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            GymStreak verifies every check-in with QR and GPS geofencing,
            tracks your streak automatically, and ships real merchandise
            when you hit a milestone.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="gradient" size="lg" render={<Link href="/register" />}>
              Sign up
              <ArrowRight />
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<a href="#how-it-works" />}
            >
              See how it works
            </Button>
          </div>
        </div>
        <HeroPreviewCard />
      </div>
    </section>
  );
}

function HeroPreviewCard() {
  return (
    <div className="mx-auto w-full max-w-sm md:ml-auto md:mr-0">
      <Card>
        <CardContent className=" my-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-none">47</p>
              <p className="mt-1 text-sm text-muted-foreground">Day streak</p>
            </div>
            <Badge
              variant="outline"
              className="ml-auto gap-1 border-success/20 bg-success/10 text-success"
            >
              <CheckCircle2 className="size-3" />
              Verified
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Next milestone</span>
              <span className="text-muted-foreground">47 / 60</span>
            </div>
            <Progress
              value={78}
              trackClassName="h-2"
              indicatorClassName="bg-gradient-brand"
            />
          </div>

          <div className="flex items-center gap-2.5 rounded-lg bg-muted p-3">
            <Trophy className="size-4 shrink-0 text-primary" />
            <p className="text-sm">Reward unlocks at 60 days</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------- How it works ------------------------------ */

const STEPS = [
  {
    n: "1",
    icon: QrCode,
    title: "Scan the gym's QR",
    description:
      "A short-lived, single-use code — no manual check-in, no guessing.",
  },
  {
    n: "2",
    icon: Flame,
    title: "Build a verified streak",
    description:
      "GPS geofencing and replay checks confirm you were actually there.",
  },
  {
    n: "3",
    icon: Trophy,
    title: "Claim real merchandise",
    description: "Hit a milestone, pick your size, get a tracked shipment.",
  },
];

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 mx-auto max-w-6xl px-6 py-20 sm:px-8"
    >
      <SectionIntro
        eyebrow="How it works"
        title="From a scan to a shipment"
        description="Three steps, all verified server-side — nothing here is self-reported."
      />
      <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map((step) => (
          <Card key={step.n}>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {step.n}
                </span>
                <step.icon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- Features -------------------------------- */

const FEATURES = [
  {
    icon: QrCode,
    title: "Verified check-ins",
    description: "QR + GPS geofencing confirm you were actually at the gym.",
  },
  {
    icon: CalendarDays,
    title: "Streak calendar",
    description: "A full activity heatmap of every verified day.",
  },
  {
    icon: Trophy,
    title: "Milestone rewards",
    description: "Real merchandise, not badges — shipped to your door.",
  },
  {
    icon: ShieldCheck,
    title: "Fraud protection",
    description:
      "Deterministic, explainable risk scoring — no black-box ML.",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Know the moment a milestone unlocks or a claim ships.",
  },
  {
    icon: MapPin,
    title: "Multi-gym network",
    description: "Check in anywhere in the network — your streak stays yours.",
  },
];

function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-t border-border/70 bg-muted/40"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
        <SectionIntro
          eyebrow="Features"
          title="Everything runs on verified data"
          description="The backend recomputes streaks, eligibility, and inventory from stored history — never from what the client claims."
        />
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="space-y-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{feature.title}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Rewards showcase ----------------------------- */

const REWARD_TIERS = [
  { streak: 7, name: "Starter cap", status: "earned" as const },
  { streak: 30, name: "30-day hoodie", status: "in-progress" as const },
  { streak: 60, name: "60-day tee + bag", status: "locked" as const },
];

function TierBadge({ status }: { status: "earned" | "in-progress" | "locked" }) {
  const tones = {
    earned: { label: "Earned", className: "bg-success/10 text-success border-success/20" },
    "in-progress": {
      label: "In progress",
      className: "bg-info/10 text-info border-info/20",
    },
    locked: {
      label: "Locked",
      className: "bg-muted text-muted-foreground border-border",
    },
  } as const;
  const tone = tones[status];
  return (
    <Badge variant="outline" className={cn("border", tone.className)}>
      {tone.label}
    </Badge>
  );
}

function RewardsShowcase() {
  return (
    <section
      id="rewards"
      className="scroll-mt-24 mx-auto max-w-6xl px-6 py-20 sm:px-8"
    >
      <SectionIntro
        eyebrow="Rewards"
        title="Milestones you can actually hold"
        description="Every reward tier is backed by real, ledger-tracked inventory — claims are race-safe, shipments are tracked."
      />
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {REWARD_TIERS.map((tier) => (
          <Card key={tier.streak}>
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <CardDescription>{tier.streak}-day streak</CardDescription>
              <CardAction>
                <TierBadge status={tier.status} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex h-24 items-center justify-center rounded-lg bg-primary/10">
                <Trophy className="size-7 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- Owner CTA -------------------------------- */

function OwnerCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:px-8">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gradient-brand">
                For gym owners
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Run a gym? List it on GymStreak.
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Reach members who show up consistently. Every new gym goes
                through a quick review before it goes live.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="lg"
            className="w-full shrink-0 sm:w-auto"
            render={<Link href="/gyms/new" />}
          >
            List your gym
            <ArrowRight />
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

/* --------------------------------- Closing CTA -------------------------------- */

function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-t border-border/70">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(60% 60% at 50% 0%, var(--brand-start), transparent)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:px-8">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your streak is waiting.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Scan in at any gym in the network and start building a streak that
          actually pays off.
        </p>
        <div className="mt-8 flex justify-center">
          <Button variant="gradient" size="lg" render={<Link href="/register" />}>
            Sign up
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
