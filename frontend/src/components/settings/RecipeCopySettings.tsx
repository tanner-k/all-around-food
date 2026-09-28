"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { captureLocalAccount, assertCurrentLocalAccount, isCurrentLocalAccount } from "@/lib/local/db";
import { copyRecipes, previewRecipeCopy, readLegacyDeviceBackup, fetchLegacyRecipeBackup, type RecipeCopyPreview } from "@/lib/local/recipe-copy";
import { exportBackup } from "@/lib/local/backup";
import { downloadBackupFile } from "@/lib/local/migrate";
import { Readable } from "@/components/app/SyncStatus";
import { CheckboxButton } from "@/components/CheckboxButton";
const button = "min-h-11 rounded-xl border border-line-strong px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50";
const select = "block min-h-11 w-full appearance-none rounded-xl border border-line-strong bg-paper py-2 pl-3 pr-10 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";
export function RecipeCopySettings() {
  const account = captureLocalAccount();
  const confirmId = useId();
  const [preview, setPreview] = useState<RecipeCopyPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, "existing" | "source">>({});
  const [sourceName, setSourceName] = useState("");
  const [sourceBackup, setSourceBackup] = useState(false);
  const [destinationBackup, setDestinationBackup] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setResult(null);
    try { await action(); assertCurrentLocalAccount(account); }
    catch (failure) { if (isCurrentLocalAccount(account)) setError(failure instanceof Error ? failure.message : "Unable to copy recipes. Preview again."); }
    finally { if (isCurrentLocalAccount(account)) setBusy(false); }
  }
  async function review(json: string, label: string) {
    const value = await previewRecipeCopy(json, account);
    assertCurrentLocalAccount(account);
    setPreview(value); setSourceName(label); setChoices({}); setSourceBackup(false); setDestinationBackup(null); setConfirmed(false);
  }
  return <div className="min-w-0 rounded-2xl border border-line bg-paper p-5">
    <h2 className="font-serif text-2xl">Copy recipes into your account</h2>
    <p className="mt-2 text-ink-soft">Only recipes are copied. Plans, shopping, pantry, cooking progress, and source drafts stay on their original device or in your source backup. New shared imports already sync.</p>
    <p className="mt-2 break-words text-sm">Destination account: {account.ownerId}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button className={button} disabled={busy} onClick={() => void run(async () => review(await readLegacyDeviceBackup(account), "This device’s original library"))}>Review recipes on this device</button>
      <button className={button} disabled={busy} onClick={() => void run(async () => review(await fetchLegacyRecipeBackup(account), "Legacy cloud library"))}>Review legacy cloud recipes</button>
    </div>
    <label className="mt-4 block">Review recipes from a backup file<input type="file" accept=".json,application/json" disabled={busy} className="mt-2 block w-full min-w-0 text-sm" onChange={event => { const file = event.target.files?.[0]; if (file) void run(async () => review(await file.text(), file.name)); event.target.value = ""; }} /></label>
    {busy && <p role="status" className="mt-3">Working…</p>}
    {error && <p role="alert" className="mt-3 text-warn">{error}</p>}
    {result && <p role="status" className="mt-3 text-forest">{result}</p>}
    {preview && <div className="mt-5 space-y-4">
      <p className="break-words">Source: {sourceName}. {preview.rows.length} recipes in source; {preview.destination.recipes.length} in this account on this device.</p>
      <p className="text-sm text-ink-soft">Originals stay in place. Matching recipes are kept. Different IDs keep both recipes, even with the same title. For the same ID with different content, choose a version below.</p>
      {!preview.rows.length && <p>This source has no recipes.</p>}
      {preview.rows.map(row => <article key={row.source.id} className="min-w-0 rounded-xl border border-line p-4">
        <h3 className="break-words font-semibold">{row.source.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{row.state === "new" ? "New recipe" : row.state === "same" ? "Already in this account; enroll if needed" : row.state === "draft" ? "A matching import draft needs review in Imports. This copy keeps the draft and skips the source recipe." : "Same recipe ID, different content"}</p>
        {row.state === "different" && <><details className="mt-3"><summary className="min-h-11 cursor-pointer py-2">Compare recipe versions</summary><div className="mt-2 grid min-w-0 gap-4 sm:grid-cols-2"><div className="min-w-0"><h4 className="mb-2 font-semibold">In your account</h4><Readable value={row.existing} /></div><div className="min-w-0"><h4 className="mb-2 font-semibold">From source</h4><Readable value={row.source} /></div></div></details><label className="mt-3 block">Version for {row.source.title}<span className="relative mt-2 block"><select disabled={busy} value={choices[row.source.id] ?? "existing"} onChange={event => setChoices(previous => ({ ...previous, [row.source.id]: event.target.value as "existing" | "source" }))} className={select}><option value="existing">Keep account version</option><option value="source">Use source version</option></select><ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute" /></span></label></>}
      </article>)}
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void run(async () => { downloadBackupFile(preview.sourceJson, "all-around-food-recipe-copy-source.json", account); setSourceBackup(true); setConfirmed(false); })}>Download source backup</button><button className={button} disabled={busy} onClick={() => void run(async () => { const json = await exportBackup(account); downloadBackupFile(json, "all-around-food-before-recipe-copy.json", account); setDestinationBackup(json); setConfirmed(false); })}>Download account backup before copy</button></div>
      <label className="flex min-h-11 items-center gap-2"><CheckboxButton size="sm" aria-labelledby={confirmId} disabled={busy || !sourceBackup || !destinationBackup} checked={confirmed} onChange={setConfirmed} /><span id={confirmId}>I saved both backup files and reviewed these recipe choices.</span></label>
      <div className="flex flex-wrap gap-3"><button className={`${button} bg-forest font-semibold text-white`} disabled={busy || !confirmed || !preview.rows.length} onClick={() => void run(async () => { const value = await copyRecipes(preview, choices, { confirmed, sourceBackup, destinationBackup: destinationBackup ?? undefined }); assertCurrentLocalAccount(account); setPreview(null); setResult(`${value.copied} recipes copied, ${value.kept} kept, ${value.queued} recipe changes saved on this device and waiting to sync. Check Library sync for cloud confirmation.`); })}>Copy reviewed recipes</button><button className={button} disabled={busy} onClick={() => setPreview(null)}>Cancel review</button></div>
    </div>}
  </div>;
}
