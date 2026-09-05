import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "Today" per the backend's clock, not the viewer's. The server runs with
// TIME_ZONE=UTC, so every date-only value it hands back (UserStreak.
// last_activity_date, CheckIn.checked_in_at's date component, etc.) is a
// UTC calendar day. Comparing against a browser-local `new Date()` breaks
// right at the UTC day boundary for anyone not in a UTC-aligned timezone
// (e.g. late evening UTC is already "tomorrow" in most timezones east of
// it) -- always compare same-day-ness through this, not local getters.
export function toUtcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
