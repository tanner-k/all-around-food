import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseRecipe, RecipeParseError } from "@/lib/anthropic";
import { createRecipeWithChildren } from "@/app/api/_lib/recipes";
import { checkRateLimit } from "@/lib/rate-limit";
import { toSafeErrorResponse } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Rate-limit constants — 10 requests per minute per IP
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Request body schema — at least one source field is required.
// URL must use http(s); obvious private/internal networks are rejected to
// reduce SSRF exposure (see infra/context.md for residual risk notes).
// ---------------------------------------------------------------------------

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0)/i;

const importUrlSchema = z
  .string()
  .url()
  .max(2048, "URL must be 2048 characters or fewer")
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must use http or https")
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return !PRIVATE_HOST_RE.test(parsed.hostname);
    } catch {
      return false;
    }
  }, "URL must not point to a private or loopback address");

const importBodySchema = z
  .object({
    url: importUrlSchema.optional(),
    text: z.string().min(1).max(50_000, "Text must be 50 000 characters or fewer").optional(),
    imageBase64: z.string().min(1).max(5_000_000, "Image must be 5 MB or fewer when base64-encoded").optional(),
    imageMediaType: z.string().min(1).max(100).optional(),
  })
  .refine(
    (data) => data.url !== undefined || data.text !== undefined || data.imageBase64 !== undefined,
    {
      message: "At least one of url, text, or imageBase64 must be provided.",
    },
  );

// ---------------------------------------------------------------------------
// POST /api/recipes/import
// ---------------------------------------------------------------------------

/**
 * Import a recipe from a URL, pasted text, or a base64-encoded image.
 *
 * Request body (JSON):
 *   { url?: string; text?: string; imageBase64?: string; imageMediaType?: string }
 *
 * Responses:
 *   201  Created recipe row
 *   400  Missing/invalid body
 *   422  Model could not parse the recipe
 *   429  Rate limit exceeded
 *   500  Unexpected server error
 */
export async function POST(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // Rate limiting — key by client IP (x-forwarded-for header set by Vercel)
  // ---------------------------------------------------------------------------
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor
    ? (forwardedFor.split(",")[0]?.trim() ?? "unknown")
    : "unknown";

  const rateLimitKey = `import:${clientIp}`;
  const rl = checkRateLimit(rateLimitKey, {
    limit: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return NextResponse.json(
      { error: "Too many requests. Please wait before importing another recipe.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Parse request body
  // ---------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate
  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { url, text, imageBase64, imageMediaType } = parsed.data;

  // ---------------------------------------------------------------------------
  // Parse recipe via AI
  // ---------------------------------------------------------------------------
  let recipeInput;
  try {
    recipeInput = await parseRecipe({ url, text, imageBase64, imageMediaType });
  } catch (err) {
    if (err instanceof RecipeParseError) {
      return NextResponse.json(
        { error: "Could not extract a recipe from the provided source. Please try a different URL or paste the recipe text directly." },
        { status: 422 },
      );
    }
    // Unexpected errors — log server-side, return generic 500 (no secrets/stack leaked)
    return toSafeErrorResponse(err, {
      context: "[api/recipes/import]",
      code: "IMPORT_UNEXPECTED",
    });
  }

  // ---------------------------------------------------------------------------
  // Persist
  // ---------------------------------------------------------------------------
  let recipe;
  try {
    recipe = await createRecipeWithChildren(recipeInput);
  } catch (err) {
    return toSafeErrorResponse(err, {
      context: "[api/recipes/import]",
      code: "DB_ERROR",
      message: "Failed to save the recipe. Please try again.",
    });
  }

  return NextResponse.json(recipe, { status: 201 });
}
