/**
 * Unit tests for isEmailAllowed().
 *
 * Pure function — no env, no network, no DB.
 * We mock the heavy framework deps so Vitest can import auth.ts without
 * requiring next-auth's runtime (which depends on next/server).
 */

import { describe, expect, it, vi } from "vitest";

// Mock next-auth and its deps before importing auth.ts so the module
// resolves cleanly in the Vitest/jsdom environment.
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));
vi.mock("next-auth/providers/google", () => ({ default: {} }));
vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: () => ({}),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ getAllowedEmails: () => [] }));

import { isEmailAllowed } from "./auth";

describe("isEmailAllowed", () => {
  const allowed = ["alice@example.com", "bob@example.com"];

  // ── Exact match ────────────────────────────────────────────────────────────

  it("returns true for an exact match", () => {
    expect(isEmailAllowed("alice@example.com", allowed)).toBe(true);
  });

  it("returns true for the second entry in the allowlist", () => {
    expect(isEmailAllowed("bob@example.com", allowed)).toBe(true);
  });

  it("returns false for an email not in the allowlist", () => {
    expect(isEmailAllowed("eve@example.com", allowed)).toBe(false);
  });

  // ── Case-insensitivity ─────────────────────────────────────────────────────

  it("is case-insensitive for the provided email", () => {
    expect(isEmailAllowed("ALICE@EXAMPLE.COM", allowed)).toBe(true);
  });

  it("is case-insensitive for mixed-case email", () => {
    expect(isEmailAllowed("Alice@Example.Com", allowed)).toBe(true);
  });

  it("is case-insensitive when the allowlist entry is uppercase", () => {
    expect(isEmailAllowed("alice@example.com", ["ALICE@EXAMPLE.COM"])).toBe(
      true,
    );
  });

  // ── Trailing-space safety ──────────────────────────────────────────────────

  it("trims trailing spaces from the email", () => {
    expect(isEmailAllowed("alice@example.com  ", allowed)).toBe(true);
  });

  it("trims leading spaces from the email", () => {
    expect(isEmailAllowed("  alice@example.com", allowed)).toBe(true);
  });

  it("trims spaces from allowlist entries", () => {
    expect(
      isEmailAllowed("alice@example.com", ["  alice@example.com  "]),
    ).toBe(true);
  });

  // ── Null / empty email → false ─────────────────────────────────────────────

  it("returns false for null email", () => {
    expect(isEmailAllowed(null, allowed)).toBe(false);
  });

  it("returns false for undefined email", () => {
    expect(isEmailAllowed(undefined, allowed)).toBe(false);
  });

  it("returns false for an empty string email", () => {
    expect(isEmailAllowed("", allowed)).toBe(false);
  });

  it("returns false for a whitespace-only email", () => {
    expect(isEmailAllowed("   ", allowed)).toBe(false);
  });

  // ── Empty allowlist → false (deny-by-default) ──────────────────────────────

  it("returns false when the allowlist is empty", () => {
    expect(isEmailAllowed("alice@example.com", [])).toBe(false);
  });

  it("returns false for null email AND empty allowlist", () => {
    expect(isEmailAllowed(null, [])).toBe(false);
  });
});
