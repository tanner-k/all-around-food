import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseReceiptFromImage } from "@/lib/claude";

const BodySchema = z.object({
  data: z.string(),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

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

  try {
    const result = await parseReceiptFromImage(
      parsed.data.data,
      parsed.data.mediaType
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[pantry/receipt] parse failed:", err);
    const e = err as { status?: number; message?: string };
    const status = e?.status ?? 500;
    let hint = "";
    if (status === 401) {
      hint =
        " — auth failed. Confirm ANTHROPIC_API_KEY_PARSING in frontend/.env.local AND restart `pnpm dev`.";
    } else if (status === 429) {
      hint = " — rate limited. Wait a moment and try again.";
    } else if (status >= 500 && status < 600) {
      hint = " — upstream Anthropic API error; retried. Try again in a moment.";
    }
    return NextResponse.json(
      {
        error: `Receipt parsing failed (${status})${hint}`,
        detail: e?.message ?? String(err),
      },
      { status: 502 }
    );
  }
}
