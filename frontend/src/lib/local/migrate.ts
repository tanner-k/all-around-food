import { emptyReport, parseBackup, restoreBackup, type MigrationReport, type StoreName } from "./backup";
import { readSnapshot } from "./repository";
import { assertCurrentLocalAccount, captureLocalAccount, type LocalAccount } from "./db";

const keys: Record<StoreName, string> = {
  recipes: "id", meal_plans: "week_of", shopping: "id", pantry: "id",
  cook_progress: "recipe_id", drafts: "id", settings: "key",
};

export async function fetchSupabaseBackup(account = captureLocalAccount()): Promise<string> {
  const response = await fetch("/api/export", { cache: "no-store" });
  const body = await response.json();
  assertCurrentLocalAccount(account);
  if (!response.ok) {
    const details = Array.isArray(body.validation_errors) ? ` ${body.validation_errors.join(" ")}` : "";
    throw new Error(`${body.error ?? `Cloud export failed (${response.status}).`}${details}`);
  }
  return JSON.stringify(body);
}

export function downloadBackupFile(json: string, filename: string, account: LocalAccount = captureLocalAccount()): void {
  assertCurrentLocalAccount(account);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download the legacy snapshot first, then merge without replacing local edits. */
export async function migrateSupabaseLibrary(cloudJson?: string, account = captureLocalAccount()): Promise<MigrationReport> {
  assertCurrentLocalAccount(account);
  if (account.ownerId) throw new Error("Cloud copy requires synced enrollment. Keep the downloaded export and retry after account migration is available.");
  const cloud = cloudJson ?? await fetchSupabaseBackup(account);
  assertCurrentLocalAccount(account);
  const parsed = parseBackup(cloud);
  if (!parsed.backup) {
    const report: MigrationReport = { stores: emptyReport().stores, validation_errors: parsed.errors };
    return report;
  }
  if (!cloudJson && typeof URL.createObjectURL === "function") {
    downloadBackupFile(cloud, "all-around-food-cloud-export.json", account);
  }
  const before = await readSnapshot(account);
  const report = await restoreBackup(cloud, "merge", {}, account);
  if (report.validation_errors.length) return report;
  const after = await readSnapshot(account);
  for (const [name, key] of Object.entries(keys) as [StoreName, string][]) {
    const prior = new Set(before[name].map((item) => (item as unknown as Record<string, unknown>)[key]));
    const imported = new Map(after[name].map((item) => [(item as unknown as Record<string, unknown>)[key], item]));
    for (const source of parsed.backup.library[name]) {
      const id = (source as unknown as Record<string, unknown>)[key];
      if (!prior.has(id) && JSON.stringify(imported.get(id)) !== JSON.stringify(source)) {
        report.validation_errors.push(`Verification failed for ${name} ${id}.`);
      }
    }
  }
  return report;
}
