"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MuscleBodyDiagram } from "@/components/workouts/muscle-body-diagram";
import { listExercises } from "@/lib/api/workouts";
import { ApiError } from "@/lib/api/client";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { Exercise } from "@/types/api";

function ExerciseResultRow({
  exercise,
  adding,
  onAdd,
}: {
  exercise: Exercise;
  adding: boolean;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{exercise.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline" className="bg-muted text-[10px] text-muted-foreground capitalize">
              {exercise.category}
            </Badge>
            {exercise.primary_muscles.slice(0, 2).map((m) => (
              <Badge key={m} variant="outline" className="bg-muted text-[10px] text-muted-foreground capitalize">
                {m}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          <Button
            size="icon-sm"
            variant="outline"
            disabled={adding}
            onClick={(e) => {
              e.stopPropagation();
              onAdd();
            }}
          >
            {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t border-border px-3 pb-3">
          <MuscleBodyDiagram
            primaryMuscles={exercise.primary_muscles}
            secondaryMuscles={exercise.secondary_muscles}
            height={110}
          />
        </div>
      ) : null}
    </div>
  );
}

const CATEGORIES = [
  "strength",
  "cardio",
  "stretching",
  "olympic weightlifting",
  "strongman",
  "plyometrics",
  "powerlifting",
];
const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebells",
  "bands",
  "body only",
  "e-z curl bar",
  "exercise ball",
  "foam roll",
  "medicine ball",
  "other",
];
const LEVELS = ["beginner", "intermediate", "expert"];
const MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
];

function FilterChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(value === option ? null : option)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs capitalize transition-colors",
              value === option
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExercisePickerSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (exercise: Exercise) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<Exercise[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // Below `sm`, a right-side drawer only gets 75vw at full height -- too
  // cramped for this screen's actual job (search + filters + a scrollable
  // result list). A bottom sheet uses the full width instead; sm: and up
  // keeps today's right-side drawer unchanged.
  const isMobile = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setResults(null);
      listExercises({
        search: search.trim() || undefined,
        category: category ?? undefined,
        equipment: equipment ?? undefined,
        level: level ?? undefined,
        muscle: muscle ?? undefined,
      })
        .then((res) => setResults(res.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timeout);
  }, [open, search, category, equipment, level, muscle]);

  const activeFilterCount = [category, equipment, level, muscle].filter(Boolean).length;

  const handleAdd = async (exercise: Exercise) => {
    setAddingId(exercise.id);
    setAddError(null);
    try {
      await onAdd(exercise);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Couldn't add that exercise.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        // Inline style, not a `h-[85vh]` class: the shared Sheet component's
        // own `data-[side=bottom]:h-auto` utility (an attribute-selector
        // variant) beats a plain height class on specificity, so a class
        // here gets silently overridden. An inline style always wins.
        style={isMobile ? { height: "85vh" } : undefined}
        className={cn(
          "flex flex-col overflow-hidden",
          isMobile ? "rounded-t-xl" : "sm:max-w-md"
        )}
      >
        <SheetHeader>
          <SheetTitle>Add an exercise</SheetTitle>
          <SheetDescription>Search or filter the catalog, tap to add it to your workout.</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4">
          {addError ? <p className="text-xs text-destructive">{addError}</p> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showFilters ? "Hide filters" : "Filters"}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>

          {showFilters ? (
            <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
              <FilterChipGroup label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
              <FilterChipGroup label="Equipment" options={EQUIPMENT} value={equipment} onChange={setEquipment} />
              <FilterChipGroup label="Muscle" options={MUSCLES} value={muscle} onChange={setMuscle} />
              <FilterChipGroup label="Level" options={LEVELS} value={level} onChange={setLevel} />
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null);
                    setEquipment(null);
                    setLevel(null);
                    setMuscle(null);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 pb-4">
          {results === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No exercises match.</p>
          ) : (
            results.map((exercise) => (
              <ExerciseResultRow
                key={exercise.id}
                exercise={exercise}
                adding={addingId === exercise.id}
                onAdd={() => handleAdd(exercise)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
