import { type NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function POST(req: NextRequest) {
  return proxyToBackend("/pricing/basket", {
    method: "POST",
    body: JSON.stringify(await req.json()),
  });
}
