import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { captureLocalAccount, selectLegacyGuest, selectVerifiedAccount, signOutLocalAccount } from "@/lib/local/db";
import { useLibrarySync } from "../useLibrarySync";
const m = vi.hoisted(() => ({ getUser: vi.fn(), setup: vi.fn(), cleanup: vi.fn(), sync: vi.fn(), status: vi.fn(), auth: undefined as undefined | (() => void), changes: undefined as undefined | (() => void) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: m.getUser, onAuthStateChange: (cb: () => void) => {
                m.auth = cb;
                m.setup();
                return { data: { subscription: { unsubscribe: m.cleanup } } };
            } } }) }));
vi.mock("@/lib/db/librarySync", () => ({ createLibraryTransport: vi.fn(), withLibraryDeadline: (operation: () => unknown) => operation() }));
vi.mock("@/lib/local/repository", () => ({ subscribeToLocalChanges: (cb: () => void) => {
        m.changes = cb;
        return () => {
        };
    } }));
vi.mock("@/lib/local/sync", () => ({ syncLibraryOnce: m.sync, getLibrarySyncStatus: m.status }));
const clean = { pending: 0, deferred: 0, conflicts: 0, lastSuccessAt: "2026-09-25T12:00:00Z" };
beforeEach(() => {
    vi.clearAllMocks();
    selectLegacyGuest();
    process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE = "recipes";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "key";
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    m.getUser.mockResolvedValue({ data: { user: { id: "a" } }, error: null });
    m.status.mockResolvedValue(clean);
    m.sync.mockResolvedValue(clean);
});
afterEach(() => {
    vi.useRealTimers();
    delete process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});
it("verifies sign-in from the unchanged signed-out state", async () => {
    signOutLocalAccount();
    window.history.replaceState(null, "", "/app?account-confirmed=1");
    renderHook(useLibrarySync);
    await waitFor(() => expect(captureLocalAccount().ownerId).toBe("a"));
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
});
it("does not resurrect an account after explicit sign-out during verification", async () => {
    let done!: (v: unknown) => void;
    m.getUser.mockReturnValue(new Promise(r => done = r));
    renderHook(useLibrarySync);
    act(() => signOutLocalAccount());
    await act(async () => done({ data: { user: { id: "a" } }, error: null }));
    expect(captureLocalAccount().dbName).toBe("");
    expect(m.sync).not.toHaveBeenCalled();
});
it("schedules Auth verification outside the callback lock", async () => {
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    const before = m.getUser.mock.calls.length;
    act(() => m.auth?.());
    expect(m.getUser).toHaveBeenCalledTimes(before);
    await waitFor(() => expect(m.getUser.mock.calls.length).toBeGreaterThan(before));
});
it("aborts a pass while hidden and reconnects with a fresh controller", async () => {
    selectVerifiedAccount("a");
    m.sync.mockImplementation(() => new Promise(() => {
    }));
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    const signal = m.sync.mock.calls[0][0].signal;
    act(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(signal.aborted).toBe(true);
    act(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(m.sync).toHaveBeenCalledTimes(2));
});
it("pauses rollout without changing the selected library", async () => {
    selectVerifiedAccount("a");
    process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE = "off";
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.status).toHaveBeenCalled());
    expect(captureLocalAccount().ownerId).toBe("a");
    expect(m.getUser).not.toHaveBeenCalled();
});
it("preserves a verified library when Auth expires", async () => {
    selectVerifiedAccount("a");
    m.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    const { result } = renderHook(useLibrarySync);
    await waitFor(() => expect(result.current.authRequired).toBe(true));
    expect(captureLocalAccount().ownerId).toBe("a");
});
it("does not loop after a success notification", async () => {
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    act(() => m.changes?.());
    await new Promise(r => setTimeout(r, 450));
    expect(m.sync).toHaveBeenCalledTimes(1);
});
it("keeps explicit sign-out closed even with a still-valid server cookie", async () => {
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    act(() => signOutLocalAccount());
    const calls = m.getUser.mock.calls.length;
    act(() => {
        m.auth?.();
        window.dispatchEvent(new Event("focus"));
    });
    await new Promise(r => setTimeout(r, 50));
    expect(m.getUser).toHaveBeenCalledTimes(calls);
    expect(captureLocalAccount().dbName).toBe("");
});
it("keeps the sign-out marker after unsuccessful confirmed verification", async () => {
    signOutLocalAccount();
    window.history.replaceState(null, "", "/app?account-confirmed=1");
    m.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    const { result } = renderHook(useLibrarySync);
    await waitFor(() => expect(result.current.authRequired).toBe(true));
    expect(localStorage.getItem("aaf-local-signed-out")).toBe("1");
    expect(captureLocalAccount().dbName).toBe("");
});
it("rejects late confirmed verification after another explicit sign-out", async () => {
    signOutLocalAccount();
    window.history.replaceState(null, "", "/app?account-confirmed=1");
    let done!: (v: unknown) => void;
    m.getUser.mockReturnValue(new Promise(r => done = r));
    renderHook(useLibrarySync);
    act(() => signOutLocalAccount());
    await act(async () => done({ data: { user: { id: "a" } }, error: null }));
    expect(captureLocalAccount().dbName).toBe("");
});
it("aborts offline work and discards a late account-A response", async () => {
    selectVerifiedAccount("a");
    let done!: (v: unknown) => void;
    m.sync.mockReturnValue(new Promise(r => done = r));
    const { result } = renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    const signal = m.sync.mock.calls[0][0].signal;
    act(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
        window.dispatchEvent(new Event("offline"));
        selectVerifiedAccount("b");
    });
    expect(signal.aborted).toBe(true);
    await act(async () => done({ ...clean, pending: 22 }));
    expect(result.current.account.ownerId).toBe("b");
    expect(result.current.status.pending).not.toBe(22);
});
it("debounces multiple local commits and refreshes pending counts", async () => {
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    m.status.mockResolvedValue({ ...clean, pending: 2 });
    act(() => {
        m.changes?.();
        m.changes?.();
        m.changes?.();
    });
    await waitFor(() => expect(m.sync).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 450));
    expect(m.sync).toHaveBeenCalledTimes(2);
});
it("uses the full rollout scope only when explicitly enabled", async () => {
    selectVerifiedAccount("a");
    process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE = "all";
    renderHook(useLibrarySync);
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
    expect(m.sync.mock.calls[0][0].outboundKinds).toEqual(["recipe", "draft", "planned_meal", "shopping", "pantry", "cook_session"]);
});
it("polls every thirty seconds only while foregrounded", async () => {
    selectVerifiedAccount("a");
    vi.useFakeTimers();
    renderHook(useLibrarySync);
    await act(async () => {
    });
    expect(m.sync).toHaveBeenCalledTimes(1);
    await act(async () => {
        vi.advanceTimersByTime(30000);
    });
    expect(m.sync).toHaveBeenCalledTimes(2);
    act(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
        vi.advanceTimersByTime(60000);
    });
    expect(m.sync).toHaveBeenCalledTimes(2);
});
it("retains confirmation verification across root Strict Mode effect replay", async () => {
    signOutLocalAccount();
    window.history.replaceState(null, "", "/app?account-confirmed=1");
    renderHook(useLibrarySync, { reactStrictMode: true });
    // Assert real setup/cleanup/setup before Auth resolves.
    expect(m.setup).toHaveBeenCalledTimes(2);
    expect(m.cleanup).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
    await waitFor(() => expect(captureLocalAccount().ownerId).toBe("a"));
    await waitFor(() => expect(m.sync).toHaveBeenCalled());
});
it("revokes replayed confirmation intent after another explicit sign-out", async () => {
    signOutLocalAccount();
    window.history.replaceState(null, "", "/app?account-confirmed=1");
    let done!: (value: unknown) => void;
    m.getUser.mockReturnValue(new Promise(resolve => {
        done = resolve;
    }));
    renderHook(useLibrarySync, { reactStrictMode: true });
    expect(m.setup).toHaveBeenCalledTimes(2);
    expect(m.cleanup).toHaveBeenCalledTimes(1);
    act(() => signOutLocalAccount());
    await act(async () => done({ data: { user: { id: "a" } }, error: null }));
    act(() => {
        m.auth?.();
        window.dispatchEvent(new Event("focus"));
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(captureLocalAccount().dbName).toBe("");
    expect(localStorage.getItem("aaf-local-signed-out")).toBe("1");
    expect(m.sync).not.toHaveBeenCalled();
});
