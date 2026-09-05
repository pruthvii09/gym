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


def _gap_covered_by_rest_day(start: date, gap: int, rest_day_of_week: int | None) -> bool:
    """True if every missing date in a gap (the `gap` days strictly between
    `start` and `start + gap + 1`) falls on the user's designated rest
    weekday. In practice `gap` is always 1 here -- two different calendar
    dates can't share a weekday unless 7+ days apart, and a gap that large
    already exceeds allowed_rest_days regardless -- but this holds for any
    gap size on general principle.
    """
    if rest_day_of_week is None or gap <= 0:
        return False
    return all((start + timedelta(days=i)).weekday() == rest_day_of_week for i in range(1, gap + 1))


def calculate_streak(
    gym_days: list[date],
    policy: StreakPolicyData,
    today: date,
    rest_day_of_week: int | None = None,
) -> StreakResult:
    """gym_days must be sorted and distinct. rest_day_of_week (0=Monday..
    6=Sunday, apps.streaks.models.UserRestDay's convention) is additive to
    policy's own allowed_rest_days/freeze_count budget, not a replacement --
    a gap fully on that weekday is forgiven for free, never consuming
    gaps_used.
    """
    if not gym_days:
        return StreakResult(current_streak=0, longest_streak=0, last_activity_date=None)

    runs = []  # list of (start, end, gaps_used)
    run_start = gym_days[0]
    run_days = [gym_days[0]]
    gaps_used = 0

    for prev, curr in zip(gym_days, gym_days[1:]):
        gap = (curr - prev).days - 1
        broken = False

        if gap > 0 and _gap_covered_by_rest_day(prev, gap, rest_day_of_week):
            pass  # forgiven for free -- not broken, gaps_used untouched
        elif gap > 0:
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
        alive = (
            virtual_gap == 0
            or _gap_covered_by_rest_day(last_end, virtual_gap, rest_day_of_week)
            or (virtual_gap <= policy.allowed_rest_days and last_gaps_used < policy.freeze_count)
        )
        current_streak = spans[-1] if alive else 0

    return StreakResult(
        current_streak=current_streak,
        longest_streak=longest_streak,
        last_activity_date=last_activity_date,
    )
