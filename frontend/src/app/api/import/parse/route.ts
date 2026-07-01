import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BACKEND_URL } from "@/lib/backend-url";
import {
  parseRecipeFromImage,
  parseRecipeFromUrl,
  parseRecipeFromVideoText,
  gradeRecipeParse,
  sha256Hex,
} from "@/lib/claude";
import { EvaluationSchema, type Evaluation } from "@/lib/eval-schema";

type ParseErrorSource = "backend" | "claude" | "unknown";

class ParseError extends Error {
  readonly source: ParseErrorSource;
  readonly status: number;
  readonly detail: string;

  constructor(opts: {
    source: ParseErrorSource;
    status: number;
    message: string;
    detail?: string;
  }) {
    super(opts.message);
    this.source = opts.source;
    this.status = opts.status;
    this.detail = opts.detail ?? opts.message;
  }
}

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

async function wrapClaude<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // Anthropic SDK throws APIError with `.status`; everything else gets
    // tagged as claude/500 so the UI can distinguish from backend failures.
    const e = err as { status?: number; message?: string };
    throw new ParseError({
      source: "claude",
      status: typeof e?.status === "number" ? e.status : 500,
      message: e?.message ?? "Claude call failed",
      detail: e?.message ?? String(err),
    });
  }
}

function toParseError(err: unknown): ParseError {
  if (err instanceof ParseError) return err;
  const e = err as { status?: number; message?: string };
  return new ParseError({
    source: "unknown",
    status: typeof e?.status === "number" ? e.status : 500,
    message: e?.message ?? "Recipe parsing failed",
    detail: e?.message ?? String(err),
  });
}

function hintFor(err: ParseError): string {
  if (err.source === "claude") {
    if (err.status === 401) {
      return " — Claude auth failed. Confirm ANTHROPIC_API_KEY_PARSING in frontend/.env.local AND restart `pnpm dev` (Next.js only loads .env at startup).";
    }
    if (err.status === 429) {
      return " — Claude rate limited. Wait a moment and try again.";
    }
    if (err.status >= 500 && err.status < 600) {
      return " — upstream Anthropic API error. Try again in a moment.";
    }
    return "";
  }
  if (err.source === "backend") {
    if (err.status === 503) {
      return " — backend unreachable. Confirm the all-around-food FastAPI is running and BACKEND_URL in frontend/.env.local points at it.";
    }
    if (err.status === 502) {
      return " — upstream transcription used by the backend failed — check the backend logs.";
    }
    if (err.status === 504) {
      return " — backend timed out. Try a shorter video or raise VIDEO_IMPORT_TIMEOUT_S.";
    }
    if (err.status === 422) {
      return " — video could not be parsed (private, expired, or missing recipe text).";
    }
    return " — backend error.";
  }
  return "";
}

async function fetchVideoText(url: string): Promise<{
  caption: string;
  transcript: string;
}> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/recipes/parse-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    // Network-level failure — backend unreachable, DNS error, etc.
    throw new ParseError({
      source: "backend",
      status: 503,
      message: `Backend unreachable at ${BACKEND_URL}`,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Video extraction failed (${res.status})`;
    throw new ParseError({
      source: "backend",
      status: res.status,
      message: detail,
      detail,
    });
  }

  const data = await res.json();
  const caption = typeof data?.caption === "string" ? data.caption : "";
  const transcript =
    typeof data?.transcript === "string" ? data.transcript : "";

  if (!caption.trim() && !transcript.trim()) {
    throw new ParseError({
      source: "backend",
      status: 422,
      message: "Video extraction returned no transcript or caption text",
    });
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
      const result = await wrapClaude(
        () => parseRecipeFromImage(validBody.data, validBody.mediaType)
      );
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
    } else if (validBody.kind === "video_url" || isVideoUrl(validBody.url)) {
      const videoText = await fetchVideoText(validBody.url);
      const result = await wrapClaude(() =>
        parseRecipeFromVideoText({
          ...videoText,
          sourceUrl: validBody.url,
        })
      );
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
      strippedText = result.strippedText;
    } else {
      const result = await wrapClaude(() => parseRecipeFromUrl(validBody.url));
      recipe = result.recipe;
      workerPrompt = result.workerPrompt;
      strippedText = result.strippedText;
    }
  } catch (err) {
    const parseErr = toParseError(err);
    console.error(
      `[parse] worker failed [source=${parseErr.source} status=${parseErr.status}]:`,
      parseErr.detail
    );
    const hint = hintFor(parseErr);
    return NextResponse.json(
      {
        error: `Recipe parsing failed (${parseErr.status})${hint}`,
        source: parseErr.source,
        detail: parseErr.detail,
      },
      {
        status:
          parseErr.status >= 400 && parseErr.status < 500
            ? parseErr.status
            : 502,
      }
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

      const res = await fetch(`${BACKEND_URL}/evaluations`, {
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
