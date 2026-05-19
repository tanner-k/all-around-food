import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const JudgeFieldCheckSchema = z.object({
  field: z.string(),
  issue: z.enum(["missing", "incorrect", "hallucinated", "fine"]),
  detail: z.string(),
});

export const JudgeVerdictSchema = z.object({
  overall_grade: z.number().int().min(0).max(10),
  accuracy_grade: z.number().int().min(0).max(10),
  completeness_grade: z.number().int().min(0).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  field_checks: z.array(JudgeFieldCheckSchema).default([]),
  reasoning: z.string(),
  suggested_prompt_improvements: z.string().nullable(),
});

export const EvaluationSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  source_kind: z.enum(["image", "url"]),
  source_ref: z.string(),
  worker_model: z.string(),
  worker_prompt: z.string(),
  worker_output: z.string(),
  worker_parse_confidence: z.number().nullable(),
  judge_model: z.string(),
  judge_prompt: z.string(),
  overall_grade: z.number().int().min(0).max(10),
  accuracy_grade: z.number().int().min(0).max(10),
  completeness_grade: z.number().int().min(0).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  field_checks: z.array(JudgeFieldCheckSchema).default([]),
  reasoning: z.string(),
  suggested_prompt_improvements: z.string().nullable(),
  raw_judge_output: z.string(),
});

export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const judgeVerdictJsonSchema = zodToJsonSchema(JudgeVerdictSchema, {
  name: "JudgeVerdict",
});
