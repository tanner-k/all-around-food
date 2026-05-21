import { proxyToBackend } from "@/lib/backend-proxy";

export async function DELETE() {
  return proxyToBackend("/shopping-list/checked", { method: "DELETE" });
}
