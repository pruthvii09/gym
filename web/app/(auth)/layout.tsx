import Link from "next/link";
import { Flame } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 15% 0%, var(--brand-start), transparent), radial-gradient(50% 40% at 100% 20%, var(--brand-end), transparent)",
        }}
      />
      <header className="relative px-6 py-6 sm:px-8">
        <Link href="/" className="flex w-fit items-center gap-1.5 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-brand text-primary-foreground">
            <Flame className="size-3.5" />
          </span>
          GymStreak
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
