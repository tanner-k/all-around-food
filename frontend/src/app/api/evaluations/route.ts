import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/evaluations`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[evaluations] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch evaluations" },
      { status: 502 }
    );
  }
}
