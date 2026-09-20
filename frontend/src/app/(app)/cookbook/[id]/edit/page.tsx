import { redirect } from "next/navigation";
import { localHref } from "@/lib/local/navigation";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  redirect(localHref("edit", (await params).id));
}
