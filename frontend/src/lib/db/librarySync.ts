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
    push(request: PushRequest): Promise<unknown>;
    pull(afterRevision: number, maxRevisions: number): Promise<unknown>;
};
export type SyncErrorCategory = 'auth' | 'transient' | 'validation' | 'protocol' | 'account';
export class LibrarySyncError extends Error {
    constructor(public category: SyncErrorCategory, message: string) { super(message); }
}
const revision = z.number().int().nonnegative().safe();
export function parsePush(value: unknown, request: PushRequest): PushResponse {
    try {
        const response = z.discriminatedUnion('status', [z.object({ status: z.literal('accepted'), revision: revision.refine(n => n > 0), records: z.array(z.unknown()) }), z.object({ status: z.literal('conflict'), records: z.array(z.unknown()) })]).parse(value);
        if (response.status === 'conflict') {
            const records = response.records.map(validateConflictRecord);
            if (request.changes.some(c => !records.some(r => r.kind === c.kind && r.entity_id === c.entity_id)))
                throw Error('Incomplete conflict group.');
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
    }>;
}, ownerId: string): LibraryTransport {
    const account = captureLocalAccount();
    async function call(name: string, args: Record<string, unknown>) {
        assertCurrentLocalAccount(account);
        if (account.ownerId !== ownerId)
            throw new LibrarySyncError('auth', 'Sign in to sync.');
        const auth = await client.auth.getUser();
        assertCurrentLocalAccount(account);
        if (auth.error || auth.data.user?.id !== ownerId)
            throw new LibrarySyncError('auth', 'Sign in to sync.');
        const result = await client.rpc(name, args);
        assertCurrentLocalAccount(account);
        if (result.error) {
            const error = result.error;
            const status = result.status ?? error.status ?? 0;
            throw new LibrarySyncError(error.code === '42501' || error.code === 'PGRST301' || status === 401 || status === 403 ? 'auth' : status === 0 || status === 429 || status >= 500 ? 'transient' : 'validation', error.message);
        }
        return result.data;
    }
    return { push: request => call('push_library_changes', { p_request: request }), pull: (after, max) => call('pull_library_changes', { p_after_revision: after, p_max_revisions: max }) };
}
