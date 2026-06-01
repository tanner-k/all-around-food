import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We need to reset the module between tests so the lazy singleton resets.
// Using dynamic imports inside tests achieves this via vi.resetModules().
import { vi } from "vitest";

describe("env", () => {
  const REQUIRED_VARS = {
    DATABASE_URL: "postgres://test:test@localhost:5432/testdb",
    ANTHROPIC_API_KEY: "sk-test-anthropic",
    AUTH_SECRET: "super-secret-auth-value-at-least-32-chars",
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all required vars before each test
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.ALLOWED_EMAILS;
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    // Reset the module so the lazy singleton is cleared
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("throws when DATABASE_URL is missing", async () => {
    Object.assign(process.env, {
      ANTHROPIC_API_KEY: REQUIRED_VARS.ANTHROPIC_API_KEY,
      AUTH_SECRET: REQUIRED_VARS.AUTH_SECRET,
    });

    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    Object.assign(process.env, {
      DATABASE_URL: REQUIRED_VARS.DATABASE_URL,
      AUTH_SECRET: REQUIRED_VARS.AUTH_SECRET,
    });

    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws when AUTH_SECRET is missing", async () => {
    Object.assign(process.env, {
      DATABASE_URL: REQUIRED_VARS.DATABASE_URL,
      ANTHROPIC_API_KEY: REQUIRED_VARS.ANTHROPIC_API_KEY,
    });

    const { getEnv } = await import("./env");
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it("returns parsed values when all required vars are set", async () => {
    Object.assign(process.env, REQUIRED_VARS);

    const { getEnv, getDatabaseUrl, getAnthropicApiKey, getAuthSecret } =
      await import("./env");

    const env = getEnv();
    expect(env.DATABASE_URL).toBe(REQUIRED_VARS.DATABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBe(REQUIRED_VARS.ANTHROPIC_API_KEY);
    expect(env.AUTH_SECRET).toBe(REQUIRED_VARS.AUTH_SECRET);

    // Named accessors also work
    expect(getDatabaseUrl()).toBe(REQUIRED_VARS.DATABASE_URL);
    expect(getAnthropicApiKey()).toBe(REQUIRED_VARS.ANTHROPIC_API_KEY);
    expect(getAuthSecret()).toBe(REQUIRED_VARS.AUTH_SECRET);
  });

  it("parses ALLOWED_EMAILS into an array", async () => {
    Object.assign(process.env, {
      ...REQUIRED_VARS,
      ALLOWED_EMAILS: "alice@example.com, bob@example.com, carol@example.com",
    });

    const { getAllowedEmails } = await import("./env");
    expect(getAllowedEmails()).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
    ]);
  });

  it("returns empty array when ALLOWED_EMAILS is not set", async () => {
    Object.assign(process.env, REQUIRED_VARS);
    const { getAllowedEmails } = await import("./env");
    expect(getAllowedEmails()).toEqual([]);
  });

  it("returns AUTH_URL when set", async () => {
    Object.assign(process.env, {
      ...REQUIRED_VARS,
      AUTH_URL: "https://myapp.example.com",
    });

    const { getAuthUrl } = await import("./env");
    expect(getAuthUrl()).toBe("https://myapp.example.com");
  });

  it("falls back to NEXTAUTH_URL when AUTH_URL is not set", async () => {
    Object.assign(process.env, {
      ...REQUIRED_VARS,
      NEXTAUTH_URL: "https://myapp.example.com",
    });

    const { getAuthUrl } = await import("./env");
    expect(getAuthUrl()).toBe("https://myapp.example.com");
  });
});
