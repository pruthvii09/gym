import type { Metadata } from "next";
import {
  Flame,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Trophy,
  Dumbbell,
  Package,
  ShieldAlert,
  Truck,
  Ban,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Design System — GymStreak",
  description: "Colors, typography, and components for the GymStreak web app.",
};

const NAV_SECTIONS = [
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "badges", label: "Status badges" },
  { id: "cards", label: "Cards" },
  { id: "forms", label: "Forms" },
  { id: "alerts", label: "Alerts" },
  { id: "progress", label: "Progress" },
  { id: "gradient", label: "Gradient usage" },
];

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <Hero />
      <main className="mx-auto flex max-w-5xl flex-col gap-20 px-6 pb-32 pt-16 sm:px-8">
        <ColorsSection />
        <TypographySection />
        <ButtonsSection />
        <BadgesSection />
        <CardsSection />
        <FormsSection />
        <AlertsSection />
        <ProgressSection />
        <GradientSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------------------------------- Nav ---------------------------------- */

function SiteNav() {
  return (
    <div className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-5xl items-center gap-6 overflow-x-auto px-6 py-3 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-1.5 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
            <Flame className="size-3.5" />
          </span>
          GymStreak
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            design system
          </span>
        </a>
        <div className="h-4 w-px shrink-0 bg-border" />
        <nav className="flex shrink-0 items-center gap-5 text-sm text-muted-foreground">
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="whitespace-nowrap transition-colors hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border/70">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 15% 0%, var(--brand-start), transparent), radial-gradient(50% 40% at 100% 20%, var(--brand-end), transparent)",
        }}
      />
      <div className="relative mx-auto max-w-5xl px-6 py-20 sm:px-8">
        <Badge variant="outline" className="mb-5 gap-1.5 border-border/80 text-muted-foreground">
          <Flame className="size-3 text-primary" />
          Light mode · v1
        </Badge>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          The <span className="text-gradient-brand">GymStreak</span> design system
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Colors, type, and components for GymStreak&apos;s member web app —
          clean neutral surfaces with an indigo-to-purple accent reserved
          for streaks, milestones, and primary actions.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="gradient" size="lg">
            <Flame />
            Primary action
          </Button>
          <Button variant="outline" size="lg">
            View components
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Shared --------------------------------- */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl scroll-mt-24">
      <p className="text-xs font-semibold uppercase tracking-wider text-gradient-brand">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-2 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------- Colors --------------------------------- */

function Swatch({
  name,
  token,
  hex,
  className,
  textClassName,
}: {
  name: string;
  token: string;
  hex: string;
  className: string;
  textClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className={cn("h-16 w-full", className)} />
      <div className={cn("space-y-0.5 bg-card p-3", textClassName)}>
        <p className="text-sm font-medium">{name}</p>
        <p className="font-mono text-xs text-muted-foreground">{token}</p>
        <p className="font-mono text-xs text-muted-foreground">{hex}</p>
      </div>
    </div>
  );
}

function ColorsSection() {
  return (
    <section id="colors" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Foundations"
        title="Colors"
        description="A neutral gray-white base carries almost all UI. Indigo is the single solid primary; the gradient is reserved for a short, deliberate list of moments (see Gradient usage)."
      />

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Neutral base</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <Swatch name="Background" token="--background" hex="#FAFAFA" className="bg-background border-b border-border" />
          <Swatch name="Card" token="--card" hex="#FFFFFF" className="bg-card border-b border-border" />
          <Swatch name="Muted surface" token="--muted" hex="#F4F4F5" className="bg-muted" />
          <Swatch name="Border" token="--border" hex="#E4E4E7" className="bg-border" />
          <Swatch name="Foreground (ink)" token="--foreground" hex="#18181B" className="bg-foreground" />
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Primary &amp; gradient</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <Swatch name="Primary (indigo-500)" token="--primary" hex="#6366F1" className="bg-primary" />
          <Swatch name="Gradient start" token="--brand-start" hex="#6366F1" className="bg-[color:var(--brand-start)]" />
          <Swatch name="Gradient end" token="--brand-end" hex="#A855F7" className="bg-[color:var(--brand-end)]" />
          <Swatch name="Accent (violet-600)" token="--accent" hex="#7C3AED" className="bg-accent" />
        </div>
        <div className="h-16 w-full rounded-xl bg-gradient-brand" />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Semantic</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch name="Success" token="--success" hex="#16A34A" className="bg-success" />
          <Swatch name="Warning" token="--warning" hex="#F59E0B" className="bg-warning" />
          <Swatch name="Danger" token="--destructive" hex="#DC2626" className="bg-destructive" />
          <Swatch name="Info" token="--info" hex="#0EA5E9" className="bg-info" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Typography ------------------------------- */

function TypeRow({
  label,
  className,
  sample = "Verified streak, unlocked.",
}: {
  label: string;
  className: string;
  sample?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-5 sm:flex-row sm:items-baseline sm:gap-8">
      <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
        {label}
      </span>
      <span className={className}>{sample}</span>
    </div>
  );
}

function TypographySection() {
  return (
    <section id="typography" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Foundations"
        title="Typography"
        description="Space Grotesk end to end — display headings and everyday UI text share one geometric, slightly technical typeface."
      />
      <div>
        <TypeRow label="Display / 6xl / 600" className="text-6xl font-semibold tracking-tight" />
        <TypeRow label="H1 / 4xl / 600" className="text-4xl font-semibold tracking-tight" />
        <TypeRow label="H2 / 3xl / 600" className="text-3xl font-semibold tracking-tight" />
        <TypeRow label="H3 / 2xl / 600" className="text-2xl font-semibold" />
        <TypeRow label="H4 / xl / 500" className="text-xl font-medium" />
        <TypeRow label="Body / base / 400" className="text-base font-normal" sample="47-day streak · 3 verified check-ins this week." />
        <TypeRow label="Small / sm / 400" className="text-sm font-normal text-muted-foreground" sample="Next milestone at 60 days unlocks a reward tier." />
        <TypeRow label="Caption / xs / 600" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" sample="Streak milestone" />
      </div>
    </section>
  );
}

/* --------------------------------- Buttons -------------------------------- */

function ButtonsSection() {
  return (
    <section id="buttons" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Buttons"
        description="Solid indigo (default) is the everyday primary action. The gradient variant is reserved for the single most important CTA on a screen."
      />

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Variants</p>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="gradient">
              <Flame /> Gradient
            </Button>
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Sizes</p>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="gradient" size="xs">Extra small</Button>
            <Button variant="gradient" size="sm">Small</Button>
            <Button variant="gradient" size="default">Default</Button>
            <Button variant="gradient" size="lg">Large</Button>
            <Button variant="outline" size="icon" aria-label="Icon button">
              <Flame />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">States</p>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="gradient">Default</Button>
            <Button variant="gradient" disabled>Disabled</Button>
            <Button variant="outline" disabled>Disabled outline</Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/* ---------------------------------- Badges --------------------------------- */

function StatusBadge({
  label,
  tone,
  icon: Icon,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral" | "gradient";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones: Record<typeof tone, string> = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/25",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
    info: "bg-info/10 text-info border-info/20",
    neutral: "bg-muted text-muted-foreground border-border",
    gradient: "bg-gradient-brand text-primary-foreground border-transparent",
  };
  return (
    <Badge variant="outline" className={cn("gap-1 border", tones[tone])}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

function BadgesSection() {
  return (
    <section id="badges" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Status badges"
        description="Small, colored pills that mirror the backend's own status vocabulary — check-in outcomes, reward fulfillment, and fraud risk tiers."
      />

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Check-in status</p>
        <Card>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge label="Verified" tone="success" icon={CheckCircle2} />
            <StatusBadge label="Review" tone="warning" icon={AlertTriangle} />
            <StatusBadge label="Rejected" tone="danger" icon={XCircle} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Reward claim status</p>
        <Card>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge label="Claimed" tone="neutral" icon={Package} />
            <StatusBadge label="Processing" tone="info" icon={Package} />
            <StatusBadge label="Shipped" tone="gradient" icon={Truck} />
            <StatusBadge label="Delivered" tone="success" icon={CheckCircle2} />
            <StatusBadge label="Cancelled" tone="danger" icon={Ban} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Fraud risk</p>
        <Card>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge label="Low" tone="success" icon={CheckCircle2} />
            <StatusBadge label="Medium" tone="warning" icon={AlertTriangle} />
            <StatusBadge label="High" tone="danger" icon={ShieldAlert} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/* ---------------------------------- Cards ---------------------------------- */

function CardsSection() {
  return (
    <section id="cards" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Cards"
        description="One card shape system-wide — rounded-xl, a hairline ring, white on the gray-white app background. Gradient shows up only as small icon chips, never as a full card fill."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
              <Flame className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-none">47</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Day streak</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
              <Dumbbell className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-none">3</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Check-ins this week</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <Trophy className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-none">2</p>
              <p className="mt-1.5 text-sm text-muted-foreground">Rewards earned</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>60-day tee</CardTitle>
            <CardDescription>Streak-milestone reward</CardDescription>
            <CardAction>
              <StatusBadge label="Shipped" tone="gradient" icon={Truck} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex h-28 items-center justify-center rounded-lg bg-primary/10">
              <Flame className="size-8 text-primary" />
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-sm text-muted-foreground">Size M</span>
            <Button variant="link" size="sm" className="h-auto p-0">
              Track shipment
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Downtown Fitness</CardTitle>
            <CardDescription>0.4 mi away · open now</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Geofenced QR check-in · 25m radius</p>
            <p>142 members checked in this week</p>
          </CardContent>
          <CardFooter>
            <Button variant="gradient" size="sm" className="w-full">
              Check in
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}

/* ---------------------------------- Forms ---------------------------------- */

function FormsSection() {
  return (
    <section id="forms" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Forms"
        description="Inputs stay quiet — a thin border, no fill — until focus, when the indigo ring takes over."
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ds-email">Email</Label>
            <Input id="ds-email" type="email" placeholder="you@example.com" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ds-email-error">Email (error state)</Label>
            <Input
              id="ds-email-error"
              type="email"
              defaultValue="not-an-email"
              aria-invalid
            />
            <p className="text-xs text-destructive">Enter a valid email address.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ds-gym">Home gym</Label>
            <Select
              defaultValue="downtown"
              items={{
                downtown: "Downtown Fitness",
                riverside: "Riverside Gym",
                northside: "Northside Athletic Club",
              }}
            >
              <SelectTrigger id="ds-gym" className="w-full">
                <SelectValue placeholder="Select a gym" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downtown">Downtown Fitness</SelectItem>
                <SelectItem value="riverside">Riverside Gym</SelectItem>
                <SelectItem value="northside">Northside Athletic Club</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ds-bio">Bio</Label>
            <Textarea id="ds-bio" placeholder="Tell us about your training goals" />
          </div>

          <div className="space-y-3 sm:col-span-2">
            <p className="text-sm font-medium">Notification preferences</p>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox defaultChecked />
              Email me when a milestone reward unlocks
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox />
              Weekly streak summary
            </label>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Preferred units</p>
            <RadioGroup defaultValue="mi">
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="mi" /> Miles
              </label>
              <label className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="km" /> Kilometers
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Account</p>
            <label className="flex items-center justify-between gap-2.5 text-sm">
              Public streak on profile
              <Switch defaultChecked />
            </label>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost">Cancel</Button>
          <Button variant="gradient">Save changes</Button>
        </CardFooter>
      </Card>
    </section>
  );
}

/* ---------------------------------- Alerts ---------------------------------- */

function ToneAlert({
  tone,
  icon: Icon,
  title,
  description,
}: {
  tone: "success" | "warning" | "danger" | "info";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  const tones: Record<typeof tone, string> = {
    success: "border-success/25 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    danger: "border-destructive/25 bg-destructive/5 text-destructive",
    info: "border-info/25 bg-info/5 text-info",
  };
  return (
    <Alert className={tones[tone]}>
      <Icon className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-current/80">{description}</AlertDescription>
    </Alert>
  );
}

function AlertsSection() {
  return (
    <section id="alerts" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Alerts"
        description="Inline feedback banners — tinted background at low opacity, colored icon and border, never a full-saturation fill."
      />
      <div className="space-y-3">
        <ToneAlert tone="success" icon={CheckCircle2} title="Check-in verified" description="Your streak is now 47 days — 13 to go until the next reward tier." />
        <ToneAlert tone="warning" icon={AlertTriangle} title="Under review" description="This check-in needs a manual look before it counts toward your streak." />
        <ToneAlert tone="danger" icon={XCircle} title="Check-in rejected" description="We couldn't verify your location against this gym's check-in radius." />
        <ToneAlert tone="info" icon={Info} title="QR codes refresh every 30 seconds" description="If a scan fails, ask staff to show the code again before retrying." />
      </div>
    </section>
  );
}

/* --------------------------------- Progress --------------------------------- */

function ProgressSection() {
  return (
    <section id="progress" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Components"
        title="Progress"
        description="The standard progress bar is solid indigo. The gradient version is reserved for streak-to-milestone progress specifically."
      />
      <Card>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Weekly check-in goal</span>
              <span className="text-muted-foreground">3 / 4</span>
            </div>
            <Progress value={75} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">47-day streak → 60-day reward</span>
              <span className="text-muted-foreground">47 / 60</span>
            </div>
            <Progress
              value={78}
              trackClassName="h-2"
              indicatorClassName="bg-gradient-brand"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/* --------------------------------- Gradient --------------------------------- */

function GradientSection() {
  return (
    <section id="gradient" className="scroll-mt-24 space-y-8">
      <SectionHeading
        eyebrow="Guidance"
        title="Gradient usage"
        description="The gradient is the brand's signature move — it stays powerful by staying rare."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" /> Do
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-16 items-center justify-center rounded-lg bg-gradient-brand text-sm font-medium text-primary-foreground">
              Primary CTA / streak ring
            </div>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>The one primary CTA on a screen</li>
              <li>Streak progress toward a milestone</li>
              <li>A small icon chip on a stat/reward card</li>
              <li>Hero panel accents, used subtly</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="size-4" /> Don&apos;t
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-16 items-center justify-center rounded-lg bg-gradient-brand text-sm font-medium text-primary-foreground opacity-40">
              Page background
            </div>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Body text or long-form copy</li>
              <li>Every button on a page</li>
              <li>Card backgrounds / large fills</li>
              <li>Secondary or destructive actions</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <Separator className="mb-6" />
          <p className="text-sm text-muted-foreground">
            Everywhere else — cards, inputs, most badges, page chrome — stays
            on the neutral gray-white scale with a solid indigo primary. That
            contrast is what makes the gradient read as &quot;something
            earned&quot; rather than decoration.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

/* --------------------------------- Footer --------------------------------- */

function SiteFooter() {
  return (
    <footer className="border-t border-border/70 py-10">
      <div className="mx-auto max-w-5xl px-6 text-sm text-muted-foreground sm:px-8">
        GymStreak design system · light mode · Space Grotesk
      </div>
    </footer>
  );
}
