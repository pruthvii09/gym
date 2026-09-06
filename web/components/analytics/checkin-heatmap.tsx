import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CheckinHeatmapCell } from "@/types/api";

// day_of_week from the API is Django's ExtractWeekDay convention (1=Sunday
// ..7=Saturday) -- this label array is indexed the same way (index 0 unused)
// so no extra conversion is needed here, unlike the JS-Date-based spots
// elsewhere in this app.
const DAY_LABELS = ["", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function intensityClass(fraction: number) {
  if (fraction <= 0) return "bg-muted";
  if (fraction < 0.25) return "bg-primary/25";
  if (fraction < 0.5) return "bg-primary/50";
  if (fraction < 0.75) return "bg-primary/75";
  return "bg-primary";
}

export function CheckinHeatmap({ cells }: { cells: CheckinHeatmapCell[] }) {
  const countByCell = new Map<string, number>();
  let max = 0;
  for (const cell of cells) {
    countByCell.set(`${cell.day_of_week}-${cell.hour}`, cell.count);
    if (cell.count > max) max = cell.count;
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">Busiest times (all-time)</p>
        {max === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No verified check-ins yet.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex flex-col gap-[3px]" style={{ minWidth: 24 * 17 + 28 }}>
              <div className="flex gap-[3px]" style={{ marginLeft: 28 }}>
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className="text-center text-[9px] text-muted-foreground"
                    style={{ width: 17 }}
                  >
                    {hour % 3 === 0 ? hour : ""}
                  </span>
                ))}
              </div>
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <div key={day} className="flex items-center gap-[3px]">
                  <span className="w-6 shrink-0 text-[10px] text-muted-foreground">
                    {DAY_LABELS[day]}
                  </span>
                  {HOURS.map((hour) => {
                    const count = countByCell.get(`${day}-${hour}`) ?? 0;
                    return (
                      <div
                        key={hour}
                        title={`${DAY_LABELS[day]} ${hour}:00 — ${count} check-in${count === 1 ? "" : "s"}`}
                        className={cn("rounded-[2px] transition-transform hover:scale-125", intensityClass(count / max))}
                        style={{ width: 14, height: 14 }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
