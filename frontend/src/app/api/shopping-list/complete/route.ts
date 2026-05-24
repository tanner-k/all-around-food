import { proxyToBackend } from "@/lib/backend-proxy";

export async function POST() {
  return proxyToBackend("/shopping-list/complete", { method: "POST" });
}
