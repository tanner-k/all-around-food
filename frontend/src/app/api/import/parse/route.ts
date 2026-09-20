import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Direct parsing is retired. Use the local import queue in /app#/import." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
