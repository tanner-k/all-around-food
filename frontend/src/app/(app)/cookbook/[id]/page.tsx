import { redirect } from "next/navigation";
import { localHref } from "@/lib/local/navigation";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(localHref("recipe", (await params).id));
}
