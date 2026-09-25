import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requested = searchParams.get("next");
  const fallback = new URL("/app#/import", request.url);
  let next = fallback;
  try {
    const candidate = requested ? new URL(requested, request.url) : fallback;
    if (candidate.origin === fallback.origin) next = candidate;
  } catch { /* malformed return URL falls back to import */ }

  // PKCE flow (@supabase/ssr default): magic link returns ?code=… and must be
  // exchanged for a session using the code_verifier cookie set at sign-in.
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(next);
    }
  }

  // OTP / token_hash flow (used if the email template sends token_hash + type).
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(next);
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
