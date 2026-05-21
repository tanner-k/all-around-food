import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToBackend(`/pantry/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(await req.json()),
  });
}
