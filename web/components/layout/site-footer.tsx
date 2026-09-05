import Link from "next/link";
import { Flame } from "lucide-react";

import { Separator } from "@/components/ui/separator";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Rewards", href: "#rewards" },
      { label: "List your gym", href: "/gyms/new" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-card">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <a href="#top" className="flex items-center gap-1.5 font-semibold">
              <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
                <Flame className="size-3.5" />
              </span>
              GymStreak
            </a>
            <p className="max-w-xs text-sm text-muted-foreground">
              Verified gym streaks, milestone rewards, and real merchandise
              claims — no self-reported check-ins.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="space-y-3">
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} GymStreak. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-wider">
              Space Grotesk · Light mode
            </span>
            <Link
              href="/design-system"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              Design system
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
