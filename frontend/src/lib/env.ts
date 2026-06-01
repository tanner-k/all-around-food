// SERVER-ONLY — do not import from client components or pages marked "use client".
// Validation is lazy: the schema is only parsed on first access, so `pnpm build`
// succeeds even when runtime secrets are not set in the build environment.

import { z } from "zod";

const envSchema = z.object({
  // Required — app will not start without these
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),

  // Auth URL — required in production, optional in local dev
  AUTH_URL: z.string().url().optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // Allowlist — comma-separated email addresses
  ALLOWED_EMAILS: z.string().optional(),

  // OAuth provider (Google example; add more as needed)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Node environment
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

let _parsed: Env | null = null;

function getEnv(): Env {
  if (_parsed) return _parsed;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `[env] Missing or invalid environment variables:\n${missing}\n\nSee .env.example for the full list.`,
    );
  }

  _parsed = result.data;
  return _parsed;
}

// Named accessors — use these in server code instead of process.env directly.

export function getDatabaseUrl(): string {
  return getEnv().DATABASE_URL;
}

export function getAnthropicApiKey(): string {
  return getEnv().ANTHROPIC_API_KEY;
}

export function getAuthSecret(): string {
  return getEnv().AUTH_SECRET;
}

export function getAuthUrl(): string | undefined {
  const env = getEnv();
  return env.AUTH_URL ?? env.NEXTAUTH_URL;
}

export function getAllowedEmails(): string[] {
  const raw = getEnv().ALLOWED_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export function getAuthGoogleId(): string | undefined {
  return getEnv().AUTH_GOOGLE_ID;
}

export function getAuthGoogleSecret(): string | undefined {
  return getEnv().AUTH_GOOGLE_SECRET;
}

export function getNodeEnv(): string {
  return getEnv().NODE_ENV;
}

// Expose the full parsed env for cases that need multiple values at once.
export { getEnv };
