import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SyncAttentionBanner, SyncStatusChip, syncNeedsAttention } from "../SyncStatus";
import { captureLocalAccount, selectVerifiedAccount } from "@/lib/local/db";
import type { LibrarySyncView } from "../useLibrarySync";
const m = vi.hoisted(() => ({ list: vi.fn(), resolve: vi.fn(), export: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/local/sync", () => ({ listLibraryConflicts: m.list, resolveLibraryConflict: m.resolve, exportLibraryConflicts: m.export }));
vi.mock("@/lib/local/migrate", () => ({ downloadBackupFile: m.download }));
const base = { account: { ownerId: "a", dbName: "aaf-local:a", generation: 0 }, status: { pending: 0, deferred: 0, conflicts: 0, lastSuccessAt: "2026-09-25T12:00:00Z" }, running: false, authRequired: false, ready: true, stage: "recipes", syncNow: vi.fn() } as LibrarySyncView;
beforeEach(() => {
    selectVerifiedAccount("a");
    base.account = captureLocalAccount();
});
it.each([{ pending: 1, label: "Saved on this device · waiting to sync" }, { conflicts: 1, label: "Review changes" }, { error: { category: "validation", message: "Update needed" }, label: "Sync needs attention" }])("prioritizes unresolved work over last success", value => {
    render(<SyncStatusChip sync={{ ...base, status: { ...base.status, ...value } as LibrarySyncView["status"] }}/>);
    expect(screen.getByRole("status").textContent).toBe(value.label);
    expect(screen.queryByText("Up to date")).toBeNull();
});
it.each([
    { sync: { ...base, account: { ...base.account, ownerId: null } }, label: "Sign in to sync" },
    { sync: { ...base, running: true, status: { ...base.status, lastSuccessAt: null } }, label: "Connecting your library" },
    { sync: { ...base, stage: "off" }, label: "Saved on this device · waiting to sync" },
    { sync: base, label: "Up to date" },
] as { sync: LibrarySyncView; label: string }[])("shows $label in one live region that opens Settings", ({ sync, label }) => {
    render(<SyncStatusChip sync={sync}/>);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe(label);
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe("/app#/settings");
});
it("escalates only conflicts and actionable errors above content", () => {
    expect(syncNeedsAttention(base)).toBe(false);
    expect(syncNeedsAttention({ ...base, status: { ...base.status, pending: 2 } })).toBe(false);
    expect(syncNeedsAttention({ ...base, account: { ...base.account, ownerId: null } })).toBe(false);
    for (const category of ["paused", "account", "auth"] as const)
        expect(syncNeedsAttention({ ...base, status: { ...base.status, error: { category, message: "x" } } })).toBe(false);
    expect(syncNeedsAttention({ ...base, status: { ...base.status, conflicts: 1 } })).toBe(true);
    expect(syncNeedsAttention({ ...base, status: { ...base.status, error: { category: "transient", message: "x" } } })).toBe(true);
});
it("offers manual sync and account access", () => {
    render(<SyncAttentionBanner sync={base}/>);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(base.syncNow).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Account / Settings" }).getAttribute("href")).toBe("/app#/settings");
});
it("drops the self-link and sign-in link when embedded in Settings", () => {
    render(<SyncAttentionBanner sync={{ ...base, authRequired: true }} embedded/>);
    expect(screen.getByRole("heading", { name: "Library sync" })).toBeTruthy();
    expect(screen.getByText("Sign in to sync")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
});
it("reviews human-readable versions and exports before choosing", async () => {
    const review = { account: base.account, mutationId: "group", reviewToken: "token", local: [{ kind: "recipe", entity_id: "one", deleted: false, payload: { title: "My toast", ingredients: [{ name: "Bread", quantity: { as_written: "2 slices" } }], steps: [{ order: 1, instruction: "Toast bread" }] } }], remote: [{ kind: "recipe", entity_id: "one", deleted: true, payload: null }] };
    m.list.mockResolvedValue([review]);
    m.resolve.mockResolvedValue(true);
    m.export.mockResolvedValue("backup");
    render(<SyncAttentionBanner sync={{ ...base, status: { ...base.status, conflicts: 1 } }}/>);
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByText("My toast");
    expect(screen.getByText("Toast bread")).toBeTruthy();
    expect(screen.getByText("Deleted from this version")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export unresolved changes" }));
    await waitFor(() => expect(m.download).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Use cloud version" }));
    await waitFor(() => expect(m.resolve).toHaveBeenCalledWith(review, "remote"));
    expect(await screen.findByText(/Newer edits stay/)).toBeTruthy();
});
it("renders the same initial shell for server and hydration regardless of saved account", async () => {
    const { renderToString } = await import("react-dom/server");
    const account = base.account;
    for (const Component of [SyncStatusChip, ({ sync }: { sync: LibrarySyncView }) => <SyncAttentionBanner sync={sync} embedded/>]) {
        const signedIn = renderToString(<Component sync={base}/>);
        const signedOut = renderToString(<Component sync={{ ...base, account: { ...account, ownerId: null, dbName: "" } }}/>);
        expect(signedIn).toBe(signedOut);
        expect(signedIn).toContain("Checking your library");
    }
});
it("asks for fresh review if the reviewed server version changes", async () => {
    const review = { account: base.account, mutationId: "group", reviewToken: "token", local: [], remote: [] };
    m.list.mockResolvedValue([review]);
    m.resolve.mockResolvedValue(false);
    render(<SyncAttentionBanner sync={{ ...base, status: { ...base.status, conflicts: 1 } }}/>);
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    await screen.findByText("Review this change group");
    fireEvent.click(screen.getByRole("button", { name: "Use this device version" }));
    expect(await screen.findByText(/versions changed while/)).toBeTruthy();
});
it.each([
    { kind: 'planned_meal', heading: 'Planned meal', payload: { id: 'item', week_of: '2026-09-21', day_index: 1, recipe_id: 'missing-recipe', servings: 4, position: 2 }, detail: 'Tuesday', field: 'Recipe reference' },
    { kind: 'shopping', heading: 'Shopping item', payload: { id: 'item', name: 'Bread', quantity_text: '2 slices', checked: true }, detail: '2 slices', field: 'Purchased' },
    { kind: 'pantry', heading: 'Pantry item', payload: { id: 'item', name: 'Bread', status: 'in_stock', notes: 'Top shelf' }, detail: 'In stock', field: 'Stock level' },
])('labels $kind conflict versions in ordinary language', async ({ kind, heading, payload, detail, field }) => {
    m.list.mockResolvedValue([{ account: base.account, mutationId: 'collection', reviewToken: 'token', local: [{ kind, entity_id: 'item', payload, deleted: false }], remote: [{ kind, entity_id: 'item', absent: true }] }]);
    render(<SyncAttentionBanner sync={{ ...base, status: { ...base.status, conflicts: 1 } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.getByText(field)).toBeTruthy();
    expect(screen.getByText('Not saved in the cloud')).toBeTruthy();
});
it("keeps recipe sync up to date when only deferred device collections remain", () => {
  render(<SyncAttentionBanner sync={{ ...base, status: { ...base.status, deferred: 3 } }} />);
  expect(screen.getByText("Up to date")).toBeTruthy();
  expect(screen.getByText(/0 recipe changes waiting/)).toBeTruthy();
  expect(screen.getByText(/3 device-only change groups/)).toBeTruthy();
});
