import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/recipes/${id}/cooked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? "Failed to mark recipe as cooked" },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[recipes/${id}/cooked] POST failed:`, err);
    return NextResponse.json(
      { error: "Failed to mark recipe as cooked" },
      { status: 502 }
    );
  }
}
