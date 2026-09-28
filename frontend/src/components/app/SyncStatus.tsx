"use client";
import { useState, useSyncExternalStore } from "react";
import type { LibrarySyncView } from "./useLibrarySync";
import { exportLibraryConflicts, listLibraryConflicts, resolveLibraryConflict, type LibraryConflictReview } from "@/lib/local/sync";
import { downloadBackupFile } from "@/lib/local/migrate";
import { isCurrentLocalAccount } from "@/lib/local/db";
const subscribeHydration = () => () => { };
const collectionLabels = { recipe: "Recipe", draft: "Recipe draft", planned_meal: "Planned meal", shopping: "Shopping item", pantry: "Pantry item", cook_session: "Cooking session" };
const fieldLabels: Record<string, string> = { week_of: "Week starting", day_index: "Day", recipe_id: "Recipe reference", position: "Order in plan", quantity_text: "Quantity", checked: "Purchased", source: "Added from", generated_week_of: "Planner week", needs_review: "Quantity needs review", status: "Stock level" };
const button = "rounded-xl border border-line-strong px-3 py-2 text-sm disabled:opacity-50";
/** Label priority, first match wins: conflicts, actionable error, signed out, waiting, connecting, up to date. */
export function syncLabel({ account, status, stage, running, ready, authRequired }: LibrarySyncView) {
    return status.conflicts ? "Review changes" : isActionable(status) ? "Sync needs attention" : authRequired || !account.ownerId ? "Sign in to sync" : status.pending || (stage === "all" && status.deferred) || !ready || stage === "off" ? "Saved on this device · waiting to sync" : running || !status.lastSuccessAt ? "Connecting your library" : "Up to date";
}
function isActionable(status: LibrarySyncView["status"]) {
    return !!status.error && !["paused", "account", "auth"].includes(status.error.category);
}
/** Conflicts and actionable errors are the only sync states shown above screen content. */
export function syncNeedsAttention(sync: LibrarySyncView) {
    return !!sync.status.conflicts || isActionable(sync.status);
}
const useHydrated = () => useSyncExternalStore(subscribeHydration, () => true, () => false);
const dotColors: Record<string, string> = { "Review changes": "bg-warn", "Sync needs attention": "bg-warn", "Sign in to sync": "bg-ink-mute", "Up to date": "bg-forest" };
/** Compact header status; the only live region for the sync label. Always opens Settings. */
export function SyncStatusChip({ sync }: {
    sync: LibrarySyncView;
}) {
    const label = useHydrated() ? syncLabel(sync) : "Checking your library…";
    return <a href="/app#/settings" aria-label={label} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink">
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotColors[label] ?? "bg-terra"}`}/>
    <span role="status" className="truncate">{label}</span>
  </a>;
}
/** Full sync detail: inline above content for conflicts or errors, and embedded in Settings. */
export function SyncAttentionBanner({ sync, embedded = false }: {
    sync: LibrarySyncView;
    embedded?: boolean;
}) {
    if (useHydrated())
        return <SyncDetail key={sync.account.generation} sync={sync} embedded={embedded}/>;
    return embedded ? <p className="text-sm text-ink-soft">Checking your library…</p> : null;
}
function SyncDetail({ sync, embedded }: {
    sync: LibrarySyncView;
    embedded: boolean;
}) {
    const { account, status, stage, running, ready, authRequired } = sync;
    const [reviews, setReviews] = useState<LibraryConflictReview[] | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const actionable = isActionable(status);
    const label = syncLabel(sync);
    async function action(operation: () => Promise<void>) {
        setBusy(true);
        setNotice(null);
        try {
            await operation();
        }
        catch (error) {
            if (isCurrentLocalAccount(account))
                setNotice(error instanceof Error ? error.message : "These changes could not be opened. Please retry.");
        }
        finally {
            if (isCurrentLocalAccount(account))
                setBusy(false);
        }
    }
    async function review() { const rows = await listLibraryConflicts(account); if (isCurrentLocalAccount(account))
        setReviews(rows); }
    async function choose(item: LibraryConflictReview, choice: "local" | "remote") {
        const resolved = await resolveLibraryConflict(item, choice);
        if (!isCurrentLocalAccount(account))
            return;
        await review();
        if (!isCurrentLocalAccount(account))
            return;
        setNotice(resolved ? "Your choice is saved on this device and waiting to sync. Newer edits stay in your library and may still need review; choosing an older version does not discard them." : "These versions changed while you reviewed them. Review the latest changes before choosing again.");
        sync.syncNow();
    }
    return <section aria-label="Library sync" className={embedded ? "rounded-2xl border border-line bg-paper p-5 text-ink" : "mb-6 rounded-2xl border border-line bg-paper p-4 text-ink"}>
    {embedded && <h2 className="mb-2 font-serif text-2xl">Library sync</h2>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{label}</p>{!embedded && <a href="/app#/settings" className="text-sm underline">Account / Settings</a>}</div>
    {account.ownerId && <><p className="mt-2 text-sm text-ink-soft">{stage === "recipes" ? status.pending : status.pending + status.deferred} {stage === "recipes" ? "recipe changes" : "changes"} waiting · Last successful sync: {status.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString() : "not yet"}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={running || !ready || stage === "off"} onClick={sync.syncNow}>{running ? "Syncing…" : "Sync now"}</button>{!!status.conflicts && <button type="button" className={button} disabled={busy} onClick={() => void action(review)}>Review changes</button>}</div></>}
    {!embedded && (authRequired || !account.ownerId) && <a href="/login" className="mt-2 inline-block text-sm underline">Sign in</a>}
    {stage === "off" && <p className="mt-2 text-sm text-ink-soft">Cloud sync is paused. Your library and waiting changes are kept on this device.</p>}
    {stage === "recipes" && !!status.deferred && <p className="mt-2 text-sm text-ink-soft">{status.deferred} device-only change groups are retained for a future release.</p>}
    {stage === "recipes" && <p className="mt-2 text-sm text-ink-soft">Recipes and recipe drafts sync. Plans, shopping, pantry, and cooking progress are saved on this device only.</p>}
    {actionable && <p role="alert" className="mt-2 text-sm text-warn">{status.error?.category === "protocol" ? "Update the app before syncing again. Your waiting changes are kept." : status.error?.category === "validation" ? "Some changes could not be synced. Export a backup and review your changes before retrying." : "Your library could not connect. Check your connection and try Sync now."}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {reviews && <div className="mt-5 space-y-5"><p className="text-sm text-ink-soft">Both versions are kept until you choose. Each choice applies to the whole change group. Download unresolved changes as a recovery reference. It is not a restorable library backup.</p><button type="button" className={button} disabled={busy} onClick={() => void action(async () => { const json = await exportLibraryConflicts(account); downloadBackupFile(json, "all-around-food-unresolved-changes.json", account); })}>Export unresolved changes</button>{reviews.length === 0 && <p>No changes currently need review.</p>}{reviews.map(item => <article key={item.mutationId} className="rounded-xl border border-line p-4"><h2 className="font-serif text-xl">Review this change group</h2>{item.local.map(local => { const remote = item.remote.find(row => row.kind === local.kind && row.entity_id === local.entity_id); return <div key={`${local.kind}:${local.entity_id}`} className="mt-3"><h3 className="font-semibold">{collectionLabels[local.kind]}</h3><div className="mt-2 grid gap-4 sm:grid-cols-2"><div><h4 className="font-semibold">This device</h4><Version deleted={local.deleted} payload={local.payload}/></div><div><h4 className="font-semibold">Cloud version</h4>{remote && "absent" in remote ? <p>Not saved in the cloud</p> : <Version deleted={remote?.deleted ?? false} payload={remote?.payload}/>}</div></div></div>; })}<div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void action(() => choose(item, "local"))}>Use this device version</button><button type="button" className={button} disabled={busy} onClick={() => void action(() => choose(item, "remote"))}>Use cloud version</button></div></article>)}</div>}
  </section>;
}
function Version({ deleted, payload }: {
    deleted: boolean;
    payload: unknown;
}) {
    if (deleted)
        return <p>Deleted from this version</p>;
    return <Readable value={payload}/>;
}
/** Lists and named fields keep every reviewed version readable. */
export function Readable({ value, field }: {
    value: unknown;
    field?: string;
}) {
    if (value === null || value === undefined)
        return <span className="text-ink-mute">Not provided</span>;
    if (Array.isArray(value))
        return value.length ? <ul className="ml-4 list-disc space-y-1">{value.map((item, index) => <li key={index}><Readable value={item}/></li>)}</ul> : <span>None</span>;
    if (typeof value === "object")
        return <dl className="space-y-2 text-sm">{Object.entries(value).filter(([key]) => key !== "id").map(([key, item]) => <div key={key}><dt className="font-semibold capitalize">{fieldLabels[key] ?? key.replaceAll("_", " ")}</dt><dd className="whitespace-pre-wrap break-words"><Readable value={item} field={key}/></dd></div>)}</dl>;
    if (field === "day_index" && typeof value === "number")
        return <span>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][value] ?? String(value)}</span>;
    if (field === "position" && typeof value === "number")
        return <span>{value + 1}</span>;
    if (field === "status" && typeof value === "string")
        return <span>{{ in_stock: "In stock", low: "Running low", out: "Out of stock" }[value as "in_stock" | "low" | "out"] ?? value}</span>;
    return <span>{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
}
