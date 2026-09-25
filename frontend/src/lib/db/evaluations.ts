// Server-only data-access layer for evaluation rows, backed by Supabase.
//
// RLS scopes every query to the signed-in user via the cookie-bound server
// client. The worker writes evaluations with a service-role client and stamps
// `user_id`; dashboard reads stay on the anon/user session path.

import "server-only";
import { EvaluationSchema, type Evaluation } from "@/lib/eval-schema";
import { createClient } from "@/lib/supabase/server";

const TABLE = "evaluations";
const STATS_VIEW = "evaluation_stats";

export interface EvaluationStats {
  count: number;
  mean_overall: number | null;
  mean_accuracy: number | null;
  mean_completeness: number | null;
  min_overall: number | null;
  max_overall: number | null;
  last_30d_count: number;
}

const EMPTY_STATS: EvaluationStats = {
  count: 0,
  mean_overall: null,
  mean_accuracy: null,
  mean_completeness: null,
  min_overall: null,
  max_overall: null,
  last_30d_count: 0,
};

function parseRow(row: unknown): Evaluation {
  return EvaluationSchema.parse(row);
}

/** All of the current user's evaluations, newest first. */
export async function listEvaluations(): Promise<Evaluation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list evaluations: ${error.message}`);
  return (data ?? []).map(parseRow);
}

/** Aggregate stats for the current user's evaluations. */
export async function getEvaluationStats(): Promise<EvaluationStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(STATS_VIEW)
    .select(
      "count, mean_overall, mean_accuracy, mean_completeness, min_overall, max_overall, last_30d_count",
    )
    .maybeSingle();

  if (error)
    throw new Error(`Failed to load evaluation stats: ${error.message}`);
  if (!data) return EMPTY_STATS;

  return {
    count: data.count ?? 0,
    mean_overall: data.mean_overall,
    mean_accuracy: data.mean_accuracy,
    mean_completeness: data.mean_completeness,
    min_overall: data.min_overall,
    max_overall: data.max_overall,
    last_30d_count: data.last_30d_count ?? 0,
  };
}
