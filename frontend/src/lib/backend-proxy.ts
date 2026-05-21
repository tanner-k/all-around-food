import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Proxy a request to the FastAPI backend, forwarding the status code and JSON
 * body. Backend `detail` errors are surfaced under a uniform `error` key so the
 * browser client can show them.
 */
export async function proxyToBackend(
  path: string,
  init?: RequestInit
): Promise<NextResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (data as { detail?: string } | null)?.detail;
      return NextResponse.json(
        { error: detail ?? "Backend request failed" },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[proxy] ${path} failed:`, err);
    return NextResponse.json(
      { error: "Failed to reach backend" },
      { status: 502 }
    );
  }
}
