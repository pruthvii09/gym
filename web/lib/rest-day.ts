// The rest-day API always uses Python's date.weekday() convention:
// 0=Monday..6=Sunday. JS's Date.getDay() is 0=Sunday..6=Saturday -- convert
// once here rather than inline at every call site, since the two numeric
// scales look interchangeable but silently aren't.

export const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function jsDayToApiWeekday(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function apiWeekdayToJsDay(apiWeekday: number): number {
  return (apiWeekday + 1) % 7;
}

export function todayApiWeekday(date: Date = new Date()): number {
  return jsDayToApiWeekday(date.getDay());
}

export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day] ?? "";
}
