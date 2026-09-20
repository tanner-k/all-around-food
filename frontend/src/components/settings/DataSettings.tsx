"use client";

import { useEffect, useState } from "react";
import { exportBackup, parseBackup, restoreBackup, type MigrationReport } from "@/lib/local/backup";
import { downloadBackupFile, fetchSupabaseBackup, migrateSupabaseLibrary } from "@/lib/local/migrate";
import { readSnapshot, saveSetting } from "@/lib/local/repository";
import type { LibrarySnapshot } from "@/lib/local/schema";

type Counts = Record<keyof LibrarySnapshot, number>;
const storeNames: (keyof LibrarySnapshot)[] = ["recipes", "meal_plans", "shopping", "pantry", "cook_progress", "drafts", "settings"];
function counts(snapshot: LibrarySnapshot): Counts {
  return Object.fromEntries(storeNames.map((name) => [name, snapshot[name].length])) as Counts;
}
function size(bytes?: number) {
  return bytes === undefined ? "Unavailable" : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function DataSettings() {
  const [local, setLocal] = useState<Counts | null>(null);
  const [cloud, setCloud] = useState<Counts | null>(null);
  const [cloudJson, setCloudJson] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupDue, setBackupDue] = useState(true);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const snapshot = await readSnapshot();
    setLocal(counts(snapshot));
    const stamp = snapshot.settings.find((item) => item.key === "last_backup_at")?.value;
    setLastBackup(typeof stamp === "string" ? stamp : null);
    setBackupDue(typeof stamp !== "string" || Date.now() - new Date(stamp).getTime() > 7 * 24 * 60 * 60 * 1000);
    if (navigator.storage?.estimate) setEstimate(await navigator.storage.estimate());
    if (navigator.storage?.persisted) setPersistent(await navigator.storage.persisted());
  }

  useEffect(() => {
    void readSnapshot().then((snapshot) => {
      setLocal(counts(snapshot));
      const stamp = snapshot.settings.find((item) => item.key === "last_backup_at")?.value;
      setLastBackup(typeof stamp === "string" ? stamp : null);
      setBackupDue(typeof stamp !== "string" || Date.now() - new Date(stamp).getTime() > 7 * 24 * 60 * 60 * 1000);
      if (navigator.storage?.estimate) void navigator.storage.estimate().then(setEstimate);
      if (navigator.storage?.persisted) void navigator.storage.persisted().then(setPersistent);
    }).catch((failure) => setError(`Local storage unavailable: ${message(failure)}. Save is blocked until it works.`));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setReport(null);
    try { await action(); await refresh(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function downloadLocal() {
    const json = await exportBackup();
    downloadBackupFile(json, `all-around-food-backup-${new Date().toISOString().slice(0, 10)}.json`);
    await saveSetting({ key: "last_backup_at", value: new Date().toISOString() });
  }

  async function restoreFile(file: File, mode: "merge" | "replace") {
    const json = await file.text();
    const parsed = parseBackup(json);
    if (parsed.errors.length) { setReport({ stores: Object.fromEntries(storeNames.map((name) => [name, { inserted: 0, skipped: 0 }])) as MigrationReport["stores"], validation_errors: parsed.errors }); return; }
    let options;
    if (mode === "replace") {
      const preRestoreBackup = await exportBackup();
      downloadBackupFile(preRestoreBackup, `all-around-food-before-restore-${new Date().toISOString().slice(0, 10)}.json`);
      if (!window.confirm("A backup of your current local library has been downloaded. Replace every local recipe, plan, shopping item, pantry item, draft, cooking progress record, and setting with this file?")) return;
      options = { confirmed: true, preRestoreBackup };
    }
    setReport(await restoreBackup(json, mode, options));
  }

  async function prepareCloud() {
    const json = await fetchSupabaseBackup();
    const parsed = parseBackup(json);
    if (!parsed.backup) throw new Error(parsed.errors.join(" "));
    downloadBackupFile(json, `all-around-food-cloud-export-${new Date().toISOString().slice(0, 10)}.json`);
    setCloudJson(json);
    setCloud(counts(parsed.backup.library));
  }

  async function copyCloud() {
    if (!cloudJson) throw new Error("Download the cloud export first.");
    const result = await migrateSupabaseLibrary(cloudJson);
    setReport(result);
    if (!result.validation_errors.length) await saveSetting({ key: "last_migration", value: new Date().toISOString() });
  }

  return <section className="mx-auto max-w-3xl space-y-8 px-4 py-8 text-ink">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-terra">Your data</p><h1 className="font-serif text-4xl">Back up your kitchen</h1><p className="mt-2 text-ink-soft">Recipes, plans, shopping, pantry, drafts, and cooking progress live on this device. Pending import uploads are excluded from backups.</p></div>
    {error && <p role="alert" className="rounded-xl bg-warn-soft p-4 text-ink">{error}</p>}
    {!local && <p role="status">Checking local storage…</p>}
    {local && <div className="rounded-2xl border border-line bg-paper p-5"><h2 className="font-serif text-2xl">Local library</h2><CountList values={local} /><p className="mt-3 text-sm text-ink-soft">Storage used: {size(estimate?.usage)} of {size(estimate?.quota)}. Persistence: {persistent === null ? "unavailable" : persistent ? "granted" : "not granted"}.</p><button type="button" disabled={busy || !navigator.storage?.persist} onClick={() => void run(async () => { const granted = await navigator.storage.persist(); setPersistent(granted); await saveSetting({ key: "storage_persistence_requested", value: new Date().toISOString() }); })} className="mt-3 rounded-xl border border-line-strong px-4 py-2 disabled:opacity-50">Request persistent storage</button><p className="mt-2 text-sm text-ink-soft">You can keep using the app if the browser declines.</p></div>}
    <div className="rounded-2xl border border-line bg-paper p-5"><h2 className="font-serif text-2xl">Backup and restore</h2>{backupDue && <p className="mt-2 text-sm text-warn">It is time to download a backup.</p>}<p className="mt-2 text-sm text-ink-soft">Last backup: {lastBackup ? new Date(lastBackup).toLocaleString() : "none"}</p><button type="button" disabled={busy || !local} onClick={() => void run(downloadLocal)} className="mt-4 rounded-xl bg-forest px-4 py-2 font-semibold text-white disabled:opacity-50">Download local backup</button><div className="mt-5"><label htmlFor="restore-file" className="block text-sm font-semibold">Choose a backup JSON file</label><input id="restore-file" type="file" accept=".json,application/json" disabled={busy || !local} className="mt-2 block w-full" /><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy || !local} onClick={() => { const file = (document.getElementById("restore-file") as HTMLInputElement).files?.[0]; if (file) void run(() => restoreFile(file, "merge")); else setError("Choose a backup file first."); }} className="rounded-xl border border-line-strong px-4 py-2 disabled:opacity-50">Merge backup</button><button type="button" disabled={busy || !local} onClick={() => { const file = (document.getElementById("restore-file") as HTMLInputElement).files?.[0]; if (file) void run(() => restoreFile(file, "replace")); else setError("Choose a backup file first."); }} className="rounded-xl border border-line-strong px-4 py-2 disabled:opacity-50">Replace local library</button></div></div></div>
    <div className="rounded-2xl border border-line bg-paper p-5"><h2 className="font-serif text-2xl">Copy from Supabase</h2><p className="mt-2 text-sm text-ink-soft">Pause edits in the legacy app while taking this snapshot. Download the cloud export, compare its counts with your local library, then copy. Cloud records and Parquet archives stay in place. Local records with the same ID win.</p><button type="button" disabled={busy || !local} onClick={() => void run(prepareCloud)} className="mt-4 rounded-xl border border-line-strong px-4 py-2 disabled:opacity-50">Download cloud export</button>{cloud && <><h3 className="mt-5 font-semibold">Cloud source</h3><CountList values={cloud} /><button type="button" disabled={busy} onClick={() => void run(copyCloud)} className="mt-4 rounded-xl bg-forest px-4 py-2 font-semibold text-white disabled:opacity-50">Copy cloud records to this device</button></>}</div>
    {report && <div role="status" className="rounded-2xl border border-line bg-paper p-5"><h2 className="font-serif text-2xl">Result</h2>{report.validation_errors.length ? <ul className="mt-2 list-disc pl-5 text-warn">{report.validation_errors.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-2 text-forest">Completed and verified.</p>}<ul className="mt-3 space-y-1 text-sm">{storeNames.map((name) => <li key={name}>{name.replaceAll("_", " ")}: {report.stores[name].inserted} added, {report.stores[name].skipped} already local</li>)}</ul></div>}
  </section>;
}

function CountList({ values }: { values: Counts }) {
  return <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">{storeNames.map((name) => <li key={name}>{name.replaceAll("_", " ")}: <strong>{values[name]}</strong></li>)}</ul>;
}
