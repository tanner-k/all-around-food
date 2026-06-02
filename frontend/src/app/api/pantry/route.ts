import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function GET() {
  return proxyToBackend("/pantry");
}

export async function POST(req: NextRequest) {
  return proxyToBackend("/pantry", {
    method: "POST",
    body: JSON.stringify(await req.json()),
  });
}
