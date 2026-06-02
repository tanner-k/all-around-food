import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToBackend(`/shopping-list/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(await req.json()),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToBackend(`/shopping-list/items/${id}`, { method: "DELETE" });
}
