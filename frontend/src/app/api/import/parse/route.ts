import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseRecipeFromImage,
  parseRecipeFromUrl,
  parseRecipeFromVideoText,
  gradeRecipeParse,
  sha256Hex,
} from "@/lib/claude";
import { EvaluationSchema, type Evaluation } from "@/lib/eval-schema";

const VIDEO_URL_HOST_RE =
  /(^|\.)((tiktok\.com)|(vm\.tiktok\.com)|(instagram\.com)|(instagr\.am))$/i;

const ImageBodySchema = z.object({
  kind: z.literal("image"),
  data: z.string(),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const UrlBodySchema = z.object({
  kind: z.literal("url"),
  url: z.string().url(),
});

const VideoUrlBodySchema = z.object({
  kind: z.literal("video_url"),
  url: z.string().url(),
});

const BodySchema = z.discriminatedUnion("kind", [
  ImageBodySchema,
  UrlBodySchema,
  VideoUrlBodySchema,
]);

function isVideoUrl(url: string): boolean {
  try {
    return VIDEO_URL_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function fetchVideoText(url: string): Promise<{
  caption: string;
  transcript: string;
}> {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const res = await fetch(`${backendUrl}/recipes/parse-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Video extraction failed (${res.status})`;
    const error = new Error(detail) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  const caption = typeof data?.caption === "string" ? data.caption : "";
  const transcript =
    typeof data?.transcript === "string" ? data.transcript : "";

  if (!caption.trim() && !transcript.trim()) {
    throw new Error("Video extraction returned no transcript or caption text");
  }

  return { caption, transcript };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const validBody = parsed.data;

  let recipe;
  let workerPrompt: string;
  let strippedText: string | undefined;

  try {
    if (validBody.kind === "image") {
      const result = await parseRecipeFromImage(
        validBody.data,
        validBody.mediaType
      );
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
    } else if (validBody.kind === "video_url" || isVideoUrl(validBody.url)) {
      const videoText = await fetchVideoText(validBody.url);
      const result = await parseRecipeFromVideoText({
        ...videoText,
        sourceUrl: validBody.url,
      });
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
      strippedText = result.strippedText;
    } else {
      const result = await parseRecipeFromUrl(validBody.url);
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
      strippedText = result.strippedText;
    }
  } catch (err) {
    console.error("[parse] worker failed:", err);
    // Surface the real upstream error to the UI so it's diagnosable.
    const e = err as { status?: number; message?: string };
    const status = e?.status ?? 500;
    let hint = "";
    if (status === 401) {
      hint =
        " — auth failed. Confirm ANTHROPIC_API_KEY_PARSING in frontend/.env.local AND restart `pnpm dev` (Next.js only loads .env at startup).";
    } else if (status === 429) {
      hint = " — rate limited. Wait a moment and try again.";
    } else if (status >= 500 && status < 600) {
      hint = " — upstream Anthropic API error; retried 4x. Try again in a moment.";
    }
    return NextResponse.json(
      {
        error: `Recipe parsing failed (${status})${hint}`,
        detail: e?.message ?? String(err),
      },
      { status: status >= 400 && status < 500 ? status : 502 }
    );
  }

  // Assign timestamps
  recipe = { ...recipe, id: "", created_at: new Date().toISOString() };

  // Fire-and-forget grading
  void (async () => {
    try {
      let sourceRef: string;
      if (validBody.kind === "url" || validBody.kind === "video_url") {
        sourceRef = validBody.url;
      } else {
        const bytes = Buffer.from(validBody.data, "base64");
        sourceRef = `screenshot:${await sha256Hex(bytes.buffer as ArrayBuffer)}`;
      }

      const sourceContent =
        validBody.kind === "image"
          ? ({
              kind: "image" as const,
              base64: validBody.data,
              mediaType: validBody.mediaType,
            })
          : ({
              kind: "url-text" as const,
              text: strippedText ?? "",
            });

      const { verdict, judgePrompt, rawJudgeOutput } = await gradeRecipeParse({
        sourceKind: validBody.kind === "image" ? "image" : "url",
        sourceRef,
        workerPrompt,
        workerOutput: recipe,
        sourceContent,
      });

      const evaluation: Evaluation = EvaluationSchema.parse({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        source_kind: validBody.kind === "image" ? "image" : "url",
        source_ref: sourceRef,
        worker_model: "claude-haiku-4-5",
        worker_prompt: workerPrompt,
        worker_output: JSON.stringify(recipe),
        worker_parse_confidence: recipe.parse_confidence,
        judge_model: "claude-sonnet-4-6",
        judge_prompt: judgePrompt,
        ...verdict,
        raw_judge_output: rawJudgeOutput,
      });

      const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
      const res = await fetch(`${backendUrl}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evaluation),
      });
      if (!res.ok) {
        console.error(
          "[eval] backend rejected:",
          res.status,
          await res.text()
        );
      }
    } catch (err) {
      console.error("[eval] grading failed:", err);
    }
  })();

  return NextResponse.json(recipe);
}
