"use client";
import { useEffect, useRef, useState } from "react";
import { captureLocalAccount, selectVerifiedAccount, subscribeToLocalAccountChange } from "@/lib/local/db";
import { subscribeToLocalChanges } from "@/lib/local/repository";
import { getLibrarySyncStatus, syncLibraryOnce, type SyncResult } from "@/lib/local/sync";
import { createLibraryTransport, withLibraryDeadline } from "@/lib/db/librarySync";
import { createClient } from "@/lib/supabase/client";
import type { SyncKind } from "@/lib/local/sync-state";
const empty: SyncResult = { pending: 0, deferred: 0, conflicts: 0, lastSuccessAt: null };
const allKinds: SyncKind[] = ["recipe", "draft", "planned_meal", "shopping", "pantry", "cook_session"];
export function accountSyncStage(): "off" | "recipes" | "all" {
    const value = process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE;
    return value === "recipes" || value === "all" ? value : "off";
}
export function useLibrarySync() {
    const stage = accountSyncStage();
    const [account, setAccount] = useState(captureLocalAccount);
    const [status, setStatus] = useState<SyncResult>(empty);
    const [running, setRunning] = useState(false);
    const [authRequired, setAuthRequired] = useState(false);
    const [ready, setReady] = useState(false);
    const manual = useRef<() => void>(() => { });
    const confirmation = useRef<typeof account | null>(null);
    useEffect(() => subscribeToLocalAccountChange(() => { setAccount(captureLocalAccount()); setStatus(empty); setAuthRequired(false); setRunning(false); }), []);
    useEffect(() => {
        let alive = true;
        let controller: AbortController | null = null;
        let debounce: ReturnType<typeof setTimeout> | undefined;
        let authTimer: ReturnType<typeof setTimeout> | undefined;
        let unsubscribeChanges = () => { };
        const kinds = stage === "all" ? allKinds : ["recipe", "draft"] as const;
        const current = () => alive && captureLocalAccount() === account;
        const foreground = () => navigator.onLine && document.visibilityState === "visible";
        const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const url = new URL(window.location.href);
        // Effect replay preserves this intent; a different account generation revokes it.
        if (confirmation.current !== account)
            confirmation.current = null;
        if (url.searchParams.get("account-confirmed") === "1") {
            confirmation.current = account;
            url.searchParams.delete("account-confirmed");
            window.history.replaceState(null, "", url);
        }
        const canVerify = () => confirmation.current === account || window.localStorage.getItem("aaf-local-signed-out") !== "1";
        const client = stage !== "off" && configured ? createClient() : null;
        async function refresh(schedule = false) {
            if (!account.ownerId || !current())
                return;
            try {
                const value = await getLibrarySyncStatus(account, kinds);
                if (!current())
                    return;
                // Local status reads must not erase an actionable pass error.
                setStatus(previous => ({ ...value, error: previous.error }));
                if (schedule && value.pending && !value.conflicts && !controller && stage !== "off") {
                    clearTimeout(debounce);
                    debounce = setTimeout(() => { void run(); }, 350);
                }
            }
            catch { /* shell reports local storage errors */ }
        }
        async function run() {
            setReady(foreground());
            if (!current() || !foreground() || !client || controller || !canVerify())
                return;
            const pass = new AbortController();
            controller = pass;
            setRunning(true);
            const valid = () => current() && !pass.signal.aborted && foreground();
            try {
                const { data, error } = await withLibraryDeadline(() => client.auth.getUser(), pass.signal);
                if (!valid())
                    return;
                if (error || !data.user) {
                    setAuthRequired(true);
                    return;
                }
                setAuthRequired(false);
                confirmation.current = null;
                if (account.ownerId !== data.user.id || !account.dbName) {
                    selectVerifiedAccount(data.user.id);
                    return;
                }
                const result = await syncLibraryOnce({ verifiedOwnerId: data.user.id, account, transport: createLibraryTransport(client, data.user.id), outboundKinds: kinds, signal: pass.signal });
                if (!valid())
                    return;
                setStatus(result);
                if (result.error?.category === "auth")
                    setAuthRequired(true);
            }
            catch {
                if (valid())
                    setStatus(previous => ({ ...previous, error: { category: "transient", message: "Your library could not connect. Try again when your connection is available." } }));
            }
            finally {
                if (controller === pass) {
                    controller = null;
                    if (current())
                        setRunning(false);
                }
            }
        }
        function environment() {
            if (!foreground()) {
                controller?.abort();
                controller = null;
                clearTimeout(debounce);
                if (current()) {
                    setReady(false);
                    setRunning(false);
                }
            }
            else {
                void run();
            }
        }
        manual.current = () => { void run(); };
        if (account.ownerId) {
            void refresh();
            unsubscribeChanges = subscribeToLocalChanges(() => { void refresh(true); }, account);
        }
        void run();
        const subscription = client?.auth.onAuthStateChange(() => {
            // Supabase holds its Auth lock during callbacks. Never await Auth inside it.
            clearTimeout(authTimer);
            authTimer = setTimeout(() => { void run(); }, 0);
        }).data.subscription;
        window.addEventListener("online", environment);
        window.addEventListener("offline", environment);
        window.addEventListener("focus", environment);
        document.addEventListener("visibilitychange", environment);
        const poll = setInterval(() => { void run(); }, 30000);
        return () => { alive = false; controller?.abort(); clearTimeout(debounce); clearTimeout(authTimer); clearInterval(poll); unsubscribeChanges(); subscription?.unsubscribe(); window.removeEventListener("online", environment); window.removeEventListener("offline", environment); window.removeEventListener("focus", environment); document.removeEventListener("visibilitychange", environment); };
    }, [account, stage]);
    return { account, status, running, authRequired, ready, stage, syncNow: () => manual.current() };
}
export type LibrarySyncView = ReturnType<typeof useLibrarySync>;
