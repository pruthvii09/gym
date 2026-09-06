import {
  BACK_REGIONS,
  BODY_VIEWBOX,
  CATALOG_MUSCLE_TO_REGIONS,
  FRONT_REGIONS,
  regionsForMuscles,
  type MuscleRegion,
} from "@/lib/muscle-body-map";
import { cn } from "@/lib/utils";

function BodyView({
  regions,
  getFillClass,
  label,
  height,
}: {
  regions: MuscleRegion[];
  getFillClass: (regionKey: string) => string;
  label: string;
  height: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox={BODY_VIEWBOX}
        style={{ height, width: "auto" }}
        role="img"
        aria-label={`${label} muscle diagram`}
      >
        {regions.map((region) =>
          region.polygons.map((points, i) => (
            <polygon
              key={`${region.key}-${i}`}
              points={points}
              className={cn("transition-colors", getFillClass(region.key))}
            >
              <title>{region.key.replace(/-/g, " ")}</title>
            </polygon>
          ))
        )}
      </svg>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function MuscleBodyDiagram({
  primaryMuscles,
  secondaryMuscles,
  className,
  height = 160,
}: {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  className?: string;
  height?: number;
}) {
  const primary = regionsForMuscles(primaryMuscles);
  // Don't double-highlight a region that's already primary through a
  // different catalog muscle name (e.g. "lats" and "middle back" both map
  // to upper-back) -- primary always wins.
  const secondary = new Set(
    [...regionsForMuscles(secondaryMuscles)].filter((r) => !primary.has(r))
  );
  const getFillClass = (key: string) =>
    primary.has(key) ? "fill-primary" : secondary.has(key) ? "fill-primary/40" : "fill-muted-foreground/20";

  return (
    <div className={cn("flex items-start justify-center gap-4", className)}>
      <BodyView regions={FRONT_REGIONS} getFillClass={getFillClass} label="Front" height={height} />
      <BodyView regions={BACK_REGIONS} getFillClass={getFillClass} label="Back" height={height} />
    </div>
  );
}

// Continuous-intensity variant for analytics: muscleCounts maps a catalog
// muscle name (the same vocabulary Exercise.primary_muscles uses) to a set
// count, and every region gets shaded by its share of the busiest muscle --
// a "training heatmap" rather than a single exercise's primary/secondary
// split.
export function MuscleIntensityDiagram({
  muscleCounts,
  className,
  height = 220,
}: {
  muscleCounts: Record<string, number>;
  className?: string;
  height?: number;
}) {
  const regionCounts = new Map<string, number>();
  for (const [muscle, count] of Object.entries(muscleCounts)) {
    for (const region of CATALOG_MUSCLE_TO_REGIONS[muscle] ?? []) {
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + count);
    }
  }
  const max = Math.max(1, ...regionCounts.values());

  const getFillClass = (key: string) => {
    const fraction = (regionCounts.get(key) ?? 0) / max;
    if (fraction <= 0) return "fill-muted-foreground/20";
    if (fraction < 0.34) return "fill-primary/40";
    if (fraction < 0.67) return "fill-primary/70";
    return "fill-primary";
  };

  return (
    <div className={cn("flex items-start justify-center gap-4", className)}>
      <BodyView regions={FRONT_REGIONS} getFillClass={getFillClass} label="Front" height={height} />
      <BodyView regions={BACK_REGIONS} getFillClass={getFillClass} label="Back" height={height} />
    </div>
  );
}
