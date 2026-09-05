"use client";

import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GymMembershipSummary } from "@/types/api";

const CREATE_GYM_VALUE = "__create__";

export function GymSwitcher({
  memberships,
  currentGymId,
  className,
}: {
  memberships: GymMembershipSummary[];
  currentGymId: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (value: string | null) => {
    if (!value || value === currentGymId) return;
    if (value === CREATE_GYM_VALUE) {
      router.push("/gyms/new");
      return;
    }
    // Preserve the current tab (e.g. /staff, /devices) across the switch --
    // if it doesn't exist for the new gym (e.g. Profile, owner-only), the
    // manage layout's own role-based redirect already handles that safely.
    const suffix = pathname.replace(`/gyms/${currentGymId}/manage`, "");
    router.push(`/gyms/${value}/manage${suffix}`);
  };

  const items = Object.fromEntries([
    ...memberships.map((m) => [m.gym.id, m.gym.name]),
    [CREATE_GYM_VALUE, "Create a gym"],
  ]);

  return (
    <Select value={currentGymId} onValueChange={handleChange} items={items}>
      <SelectTrigger
        className={cn(
          "h-9 w-full justify-between gap-1.5 bg-card px-2.5 font-medium shadow-sm",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {memberships.map((m) => (
          <SelectItem key={m.gym.id} value={m.gym.id}>
            <span className="flex w-full items-center justify-between gap-3">
              <span>{m.gym.name}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
            </span>
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={CREATE_GYM_VALUE} className="text-primary">
          <Plus className="size-3.5" />
          Create a gym
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
