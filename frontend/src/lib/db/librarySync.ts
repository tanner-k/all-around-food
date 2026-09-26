import { captureLocalAccount, assertCurrentLocalAccount } from '@/lib/local/db';
import { z } from 'zod';
import { validateRecord, validateConflictRecord, type RemoteRecord, type ConflictRecord } from '@/lib/local/sync-codecs';
import type { SyncChange } from '@/lib/local/sync-state';
export type PushRequest = {
    protocol_version: 1;
    mutation_id: string;
    changes: SyncChange[];
};
export type PushResponse = {
    status: 'accepted';
    revision: number;
    records: RemoteRecord[];
} | {
    status: 'conflict';
    records: ConflictRecord[];
};
export type PullResponse = {
    protocol_version: 1;
    batches: {
        revision: number;
        records: RemoteRecord[];
    }[];
    next_revision: number;
    has_more: boolean;
};
export type LibraryTransport = {
    push(request: PushRequest, signal?: AbortSignal): Promise<unknown>;
    pull(afterRevision: number, maxRevisions: number, signal?: AbortSignal): Promise<unknown>;
};
export type SyncErrorCategory = 'auth' | 'transient' | 'validation' | 'protocol' | 'account' | 'paused';
export class LibrarySyncError extends Error {
    constructor(public category: SyncErrorCategory, message: string) { super(message); }
}
/** Deadline rejection prevents late values from reaching receipt/cursor processing. */
export function withLibraryDeadline<T>(operation: (signal: AbortSignal) => PromiseLike<T>, parent?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (callback: () => void) => { if (settled)
            return; settled = true; clearTimeout(timer); parent?.removeEventListener('abort', cancel); callback(); };
        const cancel = () => finish(() => { controller.abort(); reject(new LibrarySyncError('paused', 'Library sync paused.')); });
        const timer = setTimeout(() => finish(() => { controller.abort(); reject(new LibrarySyncError('transient', 'Library request timed out; retry sync.')); }), 30000);
        parent?.addEventListener('abort', cancel, { once: true });
        if (parent?.aborted) {
            cancel();
            return;
        }
        try {
            Promise.resolve(operation(controller.signal)).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
        }
        catch (error) {
            finish(() => reject(error));
        }
    });
}
const revision = z.number().int().nonnegative().safe();
export function parsePush(value: unknown, request: PushRequest): PushResponse {
    try {
        const response = z.discriminatedUnion('status', [z.object({ status: z.literal('accepted'), revision: revision.refine(n => n > 0), records: z.array(z.unknown()) }), z.object({ status: z.literal('conflict'), records: z.array(z.unknown()) })]).parse(value);
        if (response.status === 'conflict') {
            const records = response.records.map(validateConflictRecord);
            const targets = records.map(r => `${r.kind}:${r.entity_id}`);
            if (!records.length || new Set(targets).size !== records.length || records.some(r => !request.changes.some(c => c.kind === r.kind && c.entity_id === r.entity_id)))
                throw Error('Invalid conflict targets.');
            return { ...response, records };
        }
        const records = response.records.map(validateRecord);
        for (const change of request.changes) {
            const row = records.find(r => r.kind === change.kind && r.entity_id === change.entity_id);
            if (!row || row.revision !== response.revision || row.deleted !== change.deleted)
                throw Error('Incomplete acknowledgement.');
        }
        return { ...response, records };
    }
    catch (error) {
        throw new LibrarySyncError('protocol', error instanceof Error ? error.message : 'Invalid response');
    }
}
export function parsePull(value: unknown, after: number): PullResponse {
    try {
        const page = z.object({ protocol_version: z.literal(1), batches: z.array(z.object({ revision: revision, records: z.array(z.unknown()).min(1) })), next_revision: revision, has_more: z.boolean() }).parse(value);
        let previous = after;
        const batches = page.batches.map(batch => {
            if (batch.revision <= previous)
                throw Error('Unordered revision page');
            previous = batch.revision;
            const records = batch.records.map(validateRecord);
            if (records.some(r => r.revision !== batch.revision))
                throw Error('Torn revision batch');
            return { ...batch, records };
        });
        if (page.next_revision !== previous || (page.has_more && !batches.length))
            throw Error('Invalid pull cursor');
        return { ...page, batches };
    }
    catch (error) {
        throw new LibrarySyncError('protocol', error instanceof Error ? error.message : 'Invalid response');
    }
}
/** Auth verification must run outside an auth-change callback. */
export function createLibraryTransport(client: {
    auth: {
        getUser(): Promise<{
            data: {
                user: {
                    id: string;
                } | null;
            };
            error: unknown;
        }>;
    };
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
        data: unknown;
        status?: number;
        error: {
            message: string;
            code?: string;
            status?: number;
        } | null;
    }> & {
        abortSignal?(signal: AbortSignal): PromiseLike<{
            data: unknown;
            status?: number;
            error: {
                message: string;
                code?: string;
                status?: number;
            } | null;
        }>;
    };
}, ownerId: string): LibraryTransport {
    const account = captureLocalAccount();
    async function call(name: string, args: Record<string, unknown>, signal: AbortSignal) {
        if (signal.aborted)
            throw new LibrarySyncError('paused', 'Library sync paused.');
        assertCurrentLocalAccount(account);
        if (account.ownerId !== ownerId)
            throw new LibrarySyncError('auth', 'Sign in to sync.');
        const auth = await client.auth.getUser();
        assertCurrentLocalAccount(account);
        if (auth.error || auth.data.user?.id !== ownerId)
            throw new LibrarySyncError('auth', 'Sign in to sync.');
        if (signal.aborted)
            throw new LibrarySyncError('paused', 'Library sync paused.');
        const rpc = client.rpc(name, args);
        const result = await (rpc.abortSignal ? rpc.abortSignal(signal) : rpc);
        if (signal.aborted)
            throw new LibrarySyncError('paused', 'Library sync paused.');
        assertCurrentLocalAccount(account);
        if (result.error) {
            const error = result.error;
            const status = result.status ?? error.status ?? 0;
            throw new LibrarySyncError(error.code === '42501' || error.code === 'PGRST301' || status === 401 || status === 403 ? 'auth' : status === 0 || status === 429 || status >= 500 ? 'transient' : 'validation', error.message);
        }
        return result.data;
    }
    return { push: (request, parent) => withLibraryDeadline(signal => call('push_library_changes', { p_request: request }, signal), parent), pull: (after, max, parent) => withLibraryDeadline(signal => call('pull_library_changes', { p_after_revision: after, p_max_revisions: max }, signal), parent) };
}
