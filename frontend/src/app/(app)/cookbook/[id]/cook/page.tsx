import { redirect } from "next/navigation";
import { localHref } from "@/lib/local/navigation";

export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(localHref("cook", (await params).id));
}
