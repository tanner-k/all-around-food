import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-url";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/recipes/${id}`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? "Recipe not found" },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[recipes/${id}] GET failed:`, err);
    return NextResponse.json(
      { error: "Failed to fetch recipe" },
      { status: 502 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND_URL}/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.detail ?? "Failed to update recipe" },
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error(`[recipes/${id}] PUT failed:`, err);
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 502 }
    );
  }
}
