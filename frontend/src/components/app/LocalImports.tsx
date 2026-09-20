"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { DropZone } from "@/components/recipe/DropZone";
import { RecipeReview } from "@/components/recipe/RecipeReview";
import { classifyUrlKind } from "@/lib/db/parseJobs";
import { acceptDraft, listLocalImports, queueLocalImport, reselectScreenshotImport,
  retryLocalImport, updateImportDraft, type LocalImportInput } from "@/lib/local/imports";
import { localHref } from "@/lib/local/navigation";
import { subscribeToLocalChanges } from "@/lib/local/repository";
import type { LocalImport, RecipeDraft } from "@/lib/local/schema";
import { createClient } from "@/lib/supabase/client";

const ownerKey = "aaf-import-owner-id";
const publicConfig = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function knownOwner(): Promise<string | null> {
  const cached = window.localStorage.getItem(ownerKey);
  if (!publicConfig()) return cached;
  try {
    const { data } = await createClient().auth.getSession();
    const current = data.session?.user.id;
    if (current) {
      window.localStorage.setItem(ownerKey, current);
      return current;
    }
  } catch { /* An offline request can still use the last known owner. */ }
  return cached;
}

function importSource(row: LocalImport): string {
  if (row.source_url) return row.source_url;
  if (row.payload_text) return row.payload_text.slice(0, 80);
  return "Screenshot";
}

export function LocalImports({ drafts }: { drafts: RecipeDraft[] }) {
  const [imports, setImports] = useState<LocalImport[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listLocalImports().then(setImports).catch(() => setNotice("Unable to read local imports. Check browser storage and retry."));
  }, []);
  useEffect(() => {
    refresh();
    return subscribeToLocalChanges(refresh);
  }, [refresh]);

  async function queue(input: LocalImportInput) {
    setBusy(true);
    setNotice(null);
    try {
      await queueLocalImport({ ...input, owner_id: await knownOwner() });
      setNotice("Saved locally. Import processing will resume when you are online and signed in.");
      refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not queue import");
    } finally { setBusy(false); }
  }

  async function retry(id: string) {
    setRetrying(id);
    setNotice(null);
    try { await retryLocalImport(id); refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not retry import"); }
    finally { setRetrying(null); }
  }

  async function reselect(id: string, file: File) {
    setRetrying(id);
    setNotice(null);
    try { await reselectScreenshotImport(id, file); refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not queue screenshot"); }
    finally { setRetrying(null); }
  }

  const active = imports.filter((row) => row.state !== "replaced" && row.state !== "saved");
  const pending = active.filter((row) => row.state !== "draft");

  return <>
    <SectionHeader number="05" scene="NEW RECIPE" title={<>Save a <em className="italic text-terra">recipe</em>.</>}
      description="Import a link, screenshot, or pasted recipe. Review every result before saving it." />
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <a href={localHref("edit")} className="inline-flex min-h-11 items-center rounded-full bg-terra px-5 text-sm font-semibold text-white">Enter a recipe manually</a>
      <span className="text-sm text-ink-mute">Manual entry works offline.</span>
    </div>
    {!publicConfig() && <p role="status" className="mt-5 rounded-xl border border-line bg-paper-2 p-4 text-sm text-ink-soft">Online import is not configured on this device. You can still queue a source and enter recipes manually.</p>}
    <div className="mt-8 max-w-3xl">
      <DropZone onUrl={(url) => void queue({ kind: classifyUrlKind(url), source_url: url })}
        onVideoUrl={(url) => void queue({ kind: "video", source_url: url })}
        onImage={(_base64, _type, file) => void queue({ kind: "screenshot", upload: file })} />
      <form className="mt-6 rounded-2xl border border-line bg-paper p-5" onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        void queue({ kind: "text", payload_text: text.trim() });
        setText("");
      }}>
        <label htmlFor="local-import-text" className="block text-sm font-semibold text-ink">Recipe text</label>
        <textarea id="local-import-text" value={text} onChange={(event) => setText(event.target.value)}
          placeholder="Paste ingredients and directions here" rows={5}
          className="mt-2 w-full rounded-xl border border-line bg-paper-2 p-3 text-sm text-ink focus:border-terra focus:outline-none" />
        <button type="submit" disabled={busy || !text.trim()} className="mt-3 min-h-11 rounded-full bg-terra px-5 text-sm font-semibold text-white disabled:opacity-50">Import pasted text</button>
      </form>
    </div>
    {notice && <p role="status" className="mt-5 max-w-3xl rounded-xl border border-line bg-paper-2 p-4 text-sm text-ink">{notice}</p>}

    {drafts.length > 0 && <section className="mt-12 max-w-3xl" aria-label="Recipes ready for review">
      <h2 className="font-serif text-2xl text-ink">Ready to review</h2>
      <div className="mt-5 space-y-8">{drafts.map((draft) => <div key={draft.id} className="rounded-2xl border border-line bg-paper p-5">
        <RecipeReview recipe={draft.recipe} warnings={draft.warnings} saveLabel="Save to cookbook"
          onChange={(recipe) => { void updateImportDraft(draft.id, recipe); }}
          onSave={async (recipe) => {
            const saved = await acceptDraft(draft.id, recipe);
            window.location.hash = localHref("recipe", saved.id).split("#")[1];
          }} />
      </div>)}</div>
    </section>}

    <section className="mt-12 max-w-3xl" aria-label="Import queue">
      <h2 className="font-serif text-2xl text-ink">Import queue</h2>
      {pending.length === 0 ? <p className="mt-3 text-sm text-ink-mute">Nothing waiting right now.</p> :
        <ul className="mt-4 space-y-3">{pending.map((row) => <li key={row.id} className="rounded-xl border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-terra-soft px-2.5 py-1 text-xs font-semibold capitalize text-terra">{row.kind}</span>
            <span className="text-sm font-medium text-ink">{row.state === "queued" ? "Waiting to send" : row.state === "submitted" ? "Processing" : "Needs attention"}</span>
          </div>
          <p className="mt-2 break-all text-sm text-ink-soft">{importSource(row)}</p>
          {row.error && <p className="mt-2 text-sm text-terra">{row.error}</p>}
          {row.state === "error" && <div className="mt-3 flex flex-wrap items-center gap-3">
            {row.error !== "Import expired; submit again" && <button type="button" onClick={() => void retry(row.id)} disabled={retrying === row.id}
              className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50">Retry</button>}
            {row.kind === "screenshot" && !row.upload && <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-semibold text-ink">
              Reselect screenshot<input aria-label="Reselect screenshot" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void reselect(row.id, file); event.target.value = ""; }} />
            </label>}
            {row.error === "Import expired; submit again" && row.kind !== "screenshot" && <button type="button" onClick={() => void retry(row.id)} disabled={retrying === row.id}
              className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink disabled:opacity-50">Retry</button>}
          </div>}
        </li>)}</ul>}
    </section>
  </>;
}
