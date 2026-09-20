import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Receipt parsing is unavailable in the personal app." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
