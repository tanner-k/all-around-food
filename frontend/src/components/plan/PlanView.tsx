"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { api, type MealPlan, type Recipe } from "@/lib/api";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = typeof MEAL_TYPES[number];

function getWeekDays(anchorDate: Date): Date[] {
  // Start from Monday
  const day = anchorDate.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(anchorDate);
  monday.setDate(anchorDate.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface AssignDialogState {
  date: string;
  mealType: MealType;
}

export function PlanView() {
  const today = new Date();
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date(today);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weekDays = getWeekDays(weekStart);
  const weekDayStrs = weekDays.map(toDateStr);

  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<AssignDialogState | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planData, recipeData] = await Promise.all([
        api.plan.list(),
        api.recipes.list(),
      ]);
      setPlans(planData);
      setRecipes(recipeData);
    } catch {
      setError("Could not load plan data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Plans for this week only
  const weekPlans = plans.filter((p) => weekDayStrs.includes(p.scheduledFor));

  function getPlansFor(dateStr: string, mealType?: MealType): MealPlan[] {
    return weekPlans.filter(
      (p) =>
        p.scheduledFor === dateStr &&
        (mealType === undefined || p.mealType === mealType),
    );
  }

  function getRecipeName(recipeId: string): string {
    return recipes.find((r) => r.id === recipeId)?.title ?? "Unknown";
  }

  function openDialog(date: string, mealType: MealType) {
    setSelectedRecipeId(recipes[0]?.id ?? "");
    setDialog({ date, mealType });
  }

  async function handleAssign() {
    if (!dialog || !selectedRecipeId) return;
    setAssigning(true);
    try {
      const newPlan = await api.plan.create({
        recipeId: selectedRecipeId,
        scheduledFor: dialog.date,
        mealType: dialog.mealType,
      });
      setPlans((prev) => [...prev, newPlan]);
      setDialog(null);
    } catch {
      // keep dialog open; user can retry
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(planId: string) {
    try {
      await api.plan.remove(planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch {
      // silently ignore
    }
  }

  const weekLabel = (() => {
    const start = weekDays[0]!;
    return start.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  })();

  const totalMeals = weekPlans.length;

  return (
    <>
      <SectionHeader
        number="01"
        scene="THE WEEK"
        title={
          <>
            Plan your <em className="italic text-terra">week</em>.
          </>
        }
        description="Assign recipes to days. Your shopping list updates automatically."
      />

      <div className="mt-14 space-y-6">
        {/* Week header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-serif text-ink leading-tight" style={{ fontSize: "26px" }}>
              Week of <em className="italic text-terra">{weekLabel}</em>
            </h2>
            <p className="text-xs text-ink-mute mt-0.5">
              {totalMeals === 0 ? "No meals planned yet" : `${totalMeals} meal${totalMeals !== 1 ? "s" : ""} planned`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() - 7);
                setWeekStart(d);
              }}
              className="rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink-mute hover:text-ink transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => {
                const d = new Date();
                const day = d.getDay();
                const diff = (day === 0 ? -6 : 1 - day);
                d.setDate(d.getDate() + diff);
                d.setHours(0, 0, 0, 0);
                setWeekStart(d);
              }}
              className="rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink-mute hover:text-ink transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => {
                const d = new Date(weekStart);
                d.setDate(d.getDate() + 7);
                setWeekStart(d);
              }}
              className="rounded-full border border-line bg-paper-2 px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-ink-mute hover:text-ink transition-colors"
            >
              Next →
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-terra-soft border border-terra/20 px-4 py-3 text-sm text-terra">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-7 gap-1 animate-pulse">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-32 rounded-md bg-line" />
            ))}
          </div>
        ) : (
          <>
            {/* 7-day grid */}
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, idx) => {
                const dateStr = toDateStr(day);
                const isToday = toDateStr(today) === dateStr;
                const dayPlans = getPlansFor(dateStr);

                return (
                  <div
                    key={dateStr}
                    className={[
                      "rounded-md border p-1.5 flex flex-col gap-1 min-h-[76px]",
                      isToday
                        ? "bg-terra-soft border-terra"
                        : "border-line bg-paper",
                    ].join(" ")}
                  >
                    {/* Day label */}
                    <div
                      className={[
                        "text-[9px] uppercase tracking-[0.05em]",
                        isToday ? "text-terra" : "text-ink-mute",
                      ].join(" ")}
                    >
                      {DAY_LABELS[idx]}
                    </div>
                    <div
                      className={[
                        "font-serif leading-none",
                        isToday ? "text-terra" : "text-ink",
                      ].join(" ")}
                      style={{ fontSize: "14px" }}
                    >
                      {day.getDate()}
                    </div>

                    {/* Meal chips */}
                    {dayPlans.map((p) => (
                      <div
                        key={p.id}
                        className="group/chip flex items-start gap-0.5"
                      >
                        <span
                          className={[
                            "flex-1 text-[9px] px-1 py-0.5 rounded-[3px] leading-[1.2] truncate",
                            isToday ? "bg-paper text-ink" : "bg-paper-2 text-ink",
                          ].join(" ")}
                          title={getRecipeName(p.recipeId)}
                        >
                          {getRecipeName(p.recipeId).slice(0, 12)}
                        </span>
                        <button
                          onClick={() => handleRemove(p.id)}
                          className="hidden group-hover/chip:inline text-[9px] text-ink-mute hover:text-terra transition-colors leading-none"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {/* Add chip */}
                    <button
                      onClick={() => openDialog(dateStr, "dinner")}
                      className={[
                        "text-[9px] px-1 py-0.5 rounded-[3px] border text-center leading-[1.2] text-ink-mute",
                        "border-dashed border-line-strong bg-transparent hover:border-terra hover:text-terra transition-colors",
                      ].join(" ")}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Meal-type breakdown */}
            <div className="rounded-xl border border-line bg-paper p-5 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
                This week's meals
              </p>

              {MEAL_TYPES.map((mealType) => {
                const mealPlans = weekPlans.filter((p) => p.mealType === mealType);
                return (
                  <div key={mealType}>
                    <p className="text-xs font-semibold text-ink-soft capitalize mb-1.5">
                      {mealType}
                    </p>
                    {mealPlans.length === 0 ? (
                      <p className="text-xs text-ink-mute italic">None planned</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {mealPlans.map((p) => {
                          const day = new Date(p.scheduledFor + "T12:00:00");
                          const dayLabel = day.toLocaleDateString("en-US", { weekday: "short" });
                          return (
                            <div
                              key={p.id}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-2 px-2.5 py-0.5 text-[11px] text-ink-soft"
                            >
                              <span className="text-ink-mute text-[10px]">{dayLabel}</span>
                              <span className="text-ink">{getRecipeName(p.recipeId)}</span>
                              <button
                                onClick={() => handleRemove(p.id)}
                                className="text-ink-mute hover:text-terra transition-colors ml-0.5"
                                aria-label="Remove"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {weekPlans.length === 0 && (
                <p className="text-sm text-ink-mute">
                  Assign recipes to days above, or{" "}
                  <Link href="/cookbook" className="text-terra underline">
                    browse your cookbook
                  </Link>
                  .
                </p>
              )}
            </div>

            {/* No recipes state */}
            {recipes.length === 0 && (
              <EmptyState
                icon="📖"
                title="No recipes yet"
                description="Import a recipe first, then you can add it to your plan."
                action={
                  <Link
                    href="/import"
                    className="inline-flex items-center gap-1.5 rounded-full bg-terra px-4 py-2 text-xs font-semibold text-paper hover:bg-terra/90 transition-colors"
                  >
                    + Import a recipe
                  </Link>
                }
              />
            )}

            {/* Quick link to shop */}
            {weekPlans.length > 0 && (
              <div className="flex justify-end">
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 rounded-full bg-ink text-paper px-4 py-2 text-xs font-semibold hover:bg-ink/90 transition-colors"
                >
                  Review shopping →
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      {/* Assign dialog */}
      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title="Add to plan"
      >
        {dialog && (
          <div className="space-y-4">
            <p className="text-xs text-ink-mute">
              {new Date(dialog.date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>

            {/* Meal type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
                Meal type
              </label>
              <div className="flex gap-2 flex-wrap">
                {MEAL_TYPES.map((mt) => (
                  <button
                    key={mt}
                    type="button"
                    onClick={() => setDialog((d) => d ? { ...d, mealType: mt } : d)}
                    className={[
                      "px-3 py-1 rounded-full border text-xs font-medium capitalize transition-colors",
                      dialog.mealType === mt
                        ? "bg-terra text-paper border-terra"
                        : "bg-paper-2 text-ink-soft border-line hover:border-ink-mute",
                    ].join(" ")}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipe picker */}
            {recipes.length === 0 ? (
              <p className="text-sm text-ink-mute">
                No recipes yet.{" "}
                <Link href="/import" className="text-terra underline" onClick={() => setDialog(null)}>
                  Import one first
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-mute">
                  Recipe
                </label>
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value)}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:border-ink-soft transition-colors"
                >
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="terra"
                size="lg"
                block
                disabled={assigning || !selectedRecipeId || recipes.length === 0}
                onClick={handleAssign}
              >
                {assigning ? "Adding…" : "Add to plan"}
              </Button>
              <Button size="lg" onClick={() => setDialog(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
