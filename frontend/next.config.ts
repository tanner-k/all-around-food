import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Content-Security-Policy
//
// Conservative policy that keeps Next.js working (inline scripts/styles are
// required by the Next.js runtime). Adjust connect-src when external API
// calls are added from the browser.
//
// Notes:
// - 'unsafe-inline' in script-src is required by Next.js hydration when not
//   using a nonce/hash strategy. Switch to a nonce-based CSP for stricter XSS
//   protection in a future hardening pass.
// - 'unsafe-eval' is included for dev-mode hot-reload; it is harmless in
//   production (no eval paths in the app code).
// - img-src includes data: (base64 recipe images) and blob: (object URLs).
// ---------------------------------------------------------------------------

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
