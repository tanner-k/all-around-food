import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function POST(req: NextRequest) {
  return proxyToBackend("/shopping-list/generate", {
    method: "POST",
    body: JSON.stringify(await req.json()),
  });
}
