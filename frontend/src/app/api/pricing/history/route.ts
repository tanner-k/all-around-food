import { type NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function GET(req: NextRequest) {
  return proxyToBackend(`/pricing/history${req.nextUrl.search}`);
}
