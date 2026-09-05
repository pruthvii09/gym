"""Pure streak calculation. No DB access -- mirrors apps/gyms/tokens.py's
split between DB-free primitives and DB-touching orchestration (services.py).

Verified CheckIns are the source of truth; this module only ever computes a
fresh answer from a list of gym-days, it never mutates or increments
anything.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta


@dataclass(frozen=True)
class StreakPolicyData:
    minimum_days_per_week: int
    allowed_rest_days: int
    grace_period: int  # minutes
    freeze_count: int


@dataclass(frozen=True)
class StreakResult:
    current_streak: int
    longest_streak: int
    last_activity_date: date | None


def gym_day(checked_in_at: datetime, grace_period_minutes: int) -> date:
    return (checked_in_at - timedelta(minutes=grace_period_minutes)).date()


def calculate_streak(
    gym_days: list[date], policy: StreakPolicyData, today: date
) -> StreakResult:
    """gym_days must be sorted and distinct."""
    if not gym_days:
        return StreakResult(current_streak=0, longest_streak=0, last_activity_date=None)

    runs = []  # list of (start, end, gaps_used)
    run_start = gym_days[0]
    run_days = [gym_days[0]]
    gaps_used = 0

    for prev, curr in zip(gym_days, gym_days[1:]):
        gap = (curr - prev).days - 1
        broken = False

        if gap > 0:
            if gap > policy.allowed_rest_days or gaps_used >= policy.freeze_count:
                broken = True
            else:
                gaps_used += 1

        if (
            not broken
            and policy.minimum_days_per_week > 0
            and (curr - run_start).days >= 6
        ):
            window_start = curr - timedelta(days=6)
            window_count = len([d for d in run_days if d >= window_start]) + 1
            if window_count < policy.minimum_days_per_week:
                broken = True

        if broken:
            runs.append((run_start, run_days[-1], gaps_used))
            run_start = curr
            run_days = [curr]
            gaps_used = 0
        else:
            run_days.append(curr)

    runs.append((run_start, run_days[-1], gaps_used))

    spans = [(end - start).days + 1 for start, end, _ in runs]
    longest_streak = max(spans)
    last_activity_date = gym_days[-1]

    last_start, last_end, last_gaps_used = runs[-1]
    days_since = (today - last_end).days
    if days_since <= 0:
        current_streak = spans[-1]
    else:
        virtual_gap = days_since - 1
        alive = virtual_gap == 0 or (
            virtual_gap <= policy.allowed_rest_days and last_gaps_used < policy.freeze_count
        )
        current_streak = spans[-1] if alive else 0

    return StreakResult(
        current_streak=current_streak,
        longest_streak=longest_streak,
        last_activity_date=last_activity_date,
    )
