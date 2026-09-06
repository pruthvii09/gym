import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

// Full literal class strings, not template-interpolated (`bg-${tone}/10`) --
// Tailwind's build-time scanner can't see a dynamically-constructed class
// name, so those would silently never make it into the compiled CSS.
const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
} as const;

export function StatCard({
  icon: Icon,
  value,
  label,
  tone = "primary",
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
