import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/backend-proxy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ weekOf: string }> }
) {
  const { weekOf } = await params;
  return proxyToBackend(`/meal-plans/${weekOf}`);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ weekOf: string }> }
) {
  const { weekOf } = await params;
  return proxyToBackend(`/meal-plans/${weekOf}`, {
    method: "PUT",
    body: JSON.stringify(await req.json()),
  });
}
