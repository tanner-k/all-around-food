import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function POST(req: NextRequest) {
  return proxyToBackend("/pantry/receipt-import", {
    method: "POST",
    body: JSON.stringify(await req.json()),
  });
}
