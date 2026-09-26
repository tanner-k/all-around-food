import { notifyChange } from './repository';
import type { IDBPTransaction } from 'idb';
import { LibrarySyncError, parsePull, parsePush, type LibraryTransport, type PushRequest, type SyncErrorCategory } from '@/lib/db/librarySync';
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, type LocalAccount, type LocalDBSchema } from './db';
import { validateRecord, validateConflictRecord, type ConflictRecord, type RemoteRecord } from './sync-codecs';
import { RecipeSchema } from '@/lib/recipe-schema';
import { RecipeDraftSchema } from './schema';
import { syncEntityKey, type SyncKind, type SyncOutbox } from './sync-state';
const stores = ['recipes', 'drafts', 'sync_outbox', 'sync_shadow', 'sync_conflicts', 'sync_meta'] as const;
type Tx = IDBPTransaction<LocalDBSchema, typeof stores[number][], 'readwrite'>;
export type SyncResult = {
    pending: number;
    deferred: number;
    conflicts: number;
    lastSuccessAt: string | null;
    error?: {
        category: SyncErrorCategory;
        message: string;
    };
    busy?: boolean;
};
export type SyncOptions = {
    verifiedOwnerId: string;
    transport: LibraryTransport;
    account?: LocalAccount;
    outboundKinds?: readonly SyncKind[];
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    maxPages?: number;
};
async function apply(tx: Tx, row: RemoteRecord, dirty: boolean) {
    const key = syncEntityKey(row.kind, row.entity_id);
    const previous = await tx.objectStore('sync_shadow').get(key);
    if (previous && previous.revision > row.revision) {
        if (dirty)
            return;
        row = { ...row, ...previous };
    }
    await tx.objectStore('sync_shadow').put({ key, revision: row.revision, payload: row.payload, deleted: row.deleted });
    if (dirty)
        return;
    if (row.kind === 'recipe') {
        if (row.deleted)
            await tx.objectStore('recipes').delete(row.entity_id);
        else
            await tx.objectStore('recipes').put(RecipeSchema.parse(row.payload));
    }
    if (row.kind === 'draft') {
        if (row.deleted)
            await tx.objectStore('drafts').delete(row.entity_id);
        else
            await tx.objectStore('drafts').put(RecipeDraftSchema.parse(row.payload));
    }
}
const matches = (group: SyncOutbox, row: {
    kind: SyncKind;
    entity_id: string;
}) => group.changes.some(c => c.kind === row.kind && c.entity_id === row.entity_id);
export async function getLibrarySyncStatus(account = captureLocalAccount(), outboundKinds: readonly SyncKind[] = ['recipe', 'draft']): Promise<SyncResult> {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction(['sync_outbox', 'sync_conflicts', 'sync_meta']);
    const groups = await tx.objectStore('sync_outbox').getAll();
    const conflicts = await tx.objectStore('sync_conflicts').count();
    const last = await tx.objectStore('sync_meta').get('last_success_at');
    await tx.done;
    assertCurrentLocalAccount(account);
    return { pending: groups.filter(g => g.changes.every(c => outboundKinds.includes(c.kind))).length, deferred: groups.filter(g => g.changes.some(c => !outboundKinds.includes(c.kind))).length, conflicts, lastSuccessAt: typeof last?.value === 'string' ? last.value : null };
}
export async function syncLibraryOnce(options: SyncOptions): Promise<SyncResult> {
    const account = options.account ?? captureLocalAccount();
    const kinds = options.outboundKinds ?? ['recipe', 'draft'];
    const now = options.now ?? Date.now;
    const token = crypto.randomUUID();
    let acquired = false;
    const guard = () => {
        assertCurrentLocalAccount(account);
        if (!account.ownerId || options.verifiedOwnerId !== account.ownerId)
            throw new LibrarySyncError('auth', 'Sign in to sync.');
    };
    try {
        guard();
        const db = await getLocalDB(account);
        guard();
        async function lease(release = false) {
            guard();
            const tx = db.transaction('sync_meta', 'readwrite');
            const prior = await tx.store.get('lease');
            const value = prior?.value as {
                token: string;
                expires: number;
            } | undefined;
            if (release) {
                if (value?.token === token)
                    await tx.store.delete('lease');
            }
            else if (value && value.token !== token && value.expires > now()) {
                await tx.done;
                return false;
            }
            else
                await tx.store.put({ key: 'lease', value: { token, expires: now() + 15000 } });
            await tx.done;
            guard();
            return true;
        }
        acquired = await lease();
        if (!acquired)
            return { ...await getLibrarySyncStatus(account, kinds), busy: true };
        const timer = setInterval(() => { void lease().catch(() => undefined); }, 5000);
        try {
            async function remote<T>(operation: () => Promise<T>): Promise<T> {
                for (let attempt = 0;; attempt++) {
                    guard();
                    try {
                        const result = await operation();
                        guard();
                        return result;
                    }
                    catch (error) {
                        guard();
                        const category = error instanceof LibrarySyncError ? error.category : 'transient';
                        if (category !== 'transient' || attempt >= 2)
                            throw error;
                        await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(250 * 2 ** attempt + Math.floor(Math.random() * 100));
                        guard();
                    }
                }
            }
            guard();
            const initial = await db.getAll('sync_outbox');
            guard();
            for (const candidate of initial.sort((a, b) => a.sequence - b.sequence)) {
                guard();
                const freeze = db.transaction('sync_outbox', 'readwrite');
                let group = await freeze.store.get(candidate.mutation_id);
                if (!group || group.status === 'conflict' || group.depends_on.length || !group.changes.every(c => kinds.includes(c.kind))) {
                    await freeze.done;
                    continue;
                }
                for (const c of group.changes)
                    validateRecord({ ...c, schema_version: 1, revision: 1, updated_at: new Date().toISOString() });
                if (group.status === 'pending') {
                    group = { ...group, status: 'frozen' };
                    await freeze.store.put(group);
                }
                await freeze.done;
                guard();
                const request: PushRequest = { protocol_version: 1, mutation_id: group.mutation_id, changes: group.changes };
                const response = parsePush(await remote(() => options.transport.push(structuredClone(request))), request);
                guard();
                const tx = db.transaction([...stores], 'readwrite');
                const current = await tx.objectStore('sync_outbox').get(group.mutation_id);
                if (!current || current.status !== 'frozen') {
                    await tx.done;
                    continue;
                }
                const all = (await tx.objectStore('sync_outbox').getAll()).sort((a, b) => a.sequence - b.sequence);
                if (response.status === 'conflict') {
                    await tx.objectStore('sync_outbox').put({ ...current, status: 'conflict' });
                    for (const row of response.records)
                        if (!('absent' in row))
                            await apply(tx, row, true);
                    await tx.objectStore('sync_conflicts').put({ key: current.mutation_id, local: current.changes, remote: response.records, created_at: new Date().toISOString() });
                }
                else {
                    for (const dependent of all.filter(g => g.depends_on.includes(current.mutation_id))) {
                        const changes = dependent.changes.map(change => {
                            const prior = all.filter(g => g.sequence < dependent.sequence && matches(g, change)).at(-1);
                            if (prior?.mutation_id !== current.mutation_id)
                                return change;
                            const accepted = response.records.find(r => r.kind === change.kind && r.entity_id === change.entity_id)!;
                            return { ...change, base_revision: accepted.revision };
                        });
                        await tx.objectStore('sync_outbox').put({ ...dependent, changes, depends_on: dependent.depends_on.filter(id => id !== current.mutation_id) });
                    }
                    await tx.objectStore('sync_outbox').delete(current.mutation_id);
                    const remaining = all.filter(g => g.mutation_id !== current.mutation_id);
                    for (const row of response.records)
                        await apply(tx, row, remaining.some(g => matches(g, row)));
                    await tx.objectStore('sync_conflicts').delete(current.mutation_id);
                }
                await tx.done;
                guard();
                notifyChange(account);
            }
            const pageLimit = Math.max(1, Math.min(50, options.maxPages ?? 50));
            for (let pageNumber = 0; pageNumber < pageLimit; pageNumber++) {
                guard();
                const cursorRow = await db.get('sync_meta', 'pull_cursor');
                guard();
                const cursor = typeof cursorRow?.value === 'number' ? cursorRow.value : 0;
                const page = parsePull(await remote(() => options.transport.pull(cursor, 10)), cursor);
                guard();
                const tx = db.transaction([...stores], 'readwrite');
                const live = await tx.objectStore('sync_meta').get('pull_cursor');
                if ((live?.value ?? 0) !== cursor) {
                    await tx.done;
                    continue;
                }
                const groups = await tx.objectStore('sync_outbox').getAll();
                for (const batch of page.batches)
                    for (const row of batch.records)
                        await apply(tx, row, groups.some(g => matches(g, row)));
                await tx.objectStore('sync_meta').put({ key: 'pull_cursor', value: page.next_revision });
                await tx.done;
                guard();
                if (page.batches.length)
                    notifyChange(account);
                if (page.has_more && pageNumber === pageLimit - 1)
                    throw new LibrarySyncError('transient', 'More library changes remain; sync again.');
                if (!page.has_more) {
                    guard();
                    await db.put('sync_meta', { key: 'last_success_at', value: new Date(now()).toISOString() });
                    break;
                }
            }
        }
        finally {
            clearInterval(timer);
        }
        guard();
        await lease(true);
        return await getLibrarySyncStatus(account, kinds);
    }
    catch (error) {
        try {
            assertCurrentLocalAccount(account);
            const status = await getLibrarySyncStatus(account, kinds);
            return { ...status, error: { category: error instanceof LibrarySyncError ? error.category : 'transient', message: error instanceof Error ? error.message : 'Sync failed' } };
        }
        catch {
            return { pending: 0, deferred: 0, conflicts: 0, lastSuccessAt: null, error: { category: 'account', message: 'Local account changed; retry sync.' } };
        }
    }
    finally {
        if (acquired) {
            try {
                assertCurrentLocalAccount(account);
                const db = await getLocalDB(account);
                assertCurrentLocalAccount(account);
                const tx = db.transaction('sync_meta', 'readwrite');
                const row = await tx.store.get('lease');
                if ((row?.value as {
                    token?: string;
                })?.token === token)
                    await tx.store.delete('lease');
                await tx.done;
            }
            catch { /* Stale account lease expires without touching another namespace. */ }
        }
    }
}
export type LibraryConflictReview = {
    account: LocalAccount;
    mutationId: string;
    local: SyncOutbox['changes'];
    remote: ConflictRecord[];
    reviewToken: string;
};
async function conflictRemote(tx: Tx, group: SyncOutbox, original: unknown): Promise<ConflictRecord[]> {
    const records = (original as unknown[]).map(validateConflictRecord);
    const latest: ConflictRecord[] = [];
    for (const change of group.changes) {
        const remote = records.find(r => r.kind === change.kind && r.entity_id === change.entity_id);
        if (!remote)
            throw new LibrarySyncError('protocol', 'Incomplete conflict group.');
        const shadow = await tx.objectStore('sync_shadow').get(syncEntityKey(change.kind, change.entity_id));
        latest.push(shadow ? validateRecord({ ...change, ...shadow, schema_version: 1, updated_at: new Date(0).toISOString() }) : remote);
    }
    return latest;
}
export async function listLibraryConflicts(account = captureLocalAccount()): Promise<LibraryConflictReview[]> {
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction([...stores], 'readwrite');
    const conflicts = await tx.objectStore('sync_conflicts').getAll();
    const reviews: LibraryConflictReview[] = [];
    for (const conflict of conflicts) {
        const group = await tx.objectStore('sync_outbox').get(conflict.key);
        if (!group)
            continue;
        const remote = await conflictRemote(tx, group, conflict.remote);
        reviews.push({ account, mutationId: group.mutation_id, local: group.changes, remote, reviewToken: JSON.stringify(remote) });
    }
    await tx.done;
    assertCurrentLocalAccount(account);
    return reviews;
}
/** Replaces the rejected request, preserving every dependent edit and CAS against only reviewed versions. */
export async function resolveLibraryConflict(review: LibraryConflictReview, choice: 'local' | 'remote', edited?: SyncOutbox['changes']): Promise<boolean> {
    const account = review.account;
    const db = await getLocalDB(account);
    assertCurrentLocalAccount(account);
    const tx = db.transaction([...stores], 'readwrite');
    const group = await tx.objectStore('sync_outbox').get(review.mutationId);
    const conflict = await tx.objectStore('sync_conflicts').get(review.mutationId);
    if (!group || group.status !== 'conflict' || !conflict) {
        await tx.done;
        return false;
    }
    const remote = await conflictRemote(tx, group, conflict.remote);
    if (JSON.stringify(remote) !== review.reviewToken) {
        await tx.done;
        return false;
    }
    const changes = group.changes.map(change => { const row = remote.find(r => r.kind === change.kind && r.entity_id === change.entity_id)!; const selected = edited?.find(c => c.kind === change.kind && c.entity_id === change.entity_id); const desired = selected ?? (choice === 'remote' ? { ...change, payload: 'absent' in row ? null : row.payload, deleted: 'absent' in row ? true : row.deleted } : change); return { ...desired, base_revision: 'absent' in row ? null : row.revision }; });
    try {
        for (const change of changes)
            validateRecord({ ...change, schema_version: 1, revision: 1, updated_at: new Date().toISOString() });
    }
    catch (error) {
        void tx.done.catch(() => undefined);
        tx.abort();
        throw error;
    }
    const replacement = { ...group, mutation_id: crypto.randomUUID(), status: 'pending' as const, changes };
    await tx.objectStore('sync_outbox').add(replacement);
    const all = await tx.objectStore('sync_outbox').getAll();
    for (const dependent of all.filter(g => g.depends_on.includes(group.mutation_id)))
        await tx.objectStore('sync_outbox').put({ ...dependent, depends_on: dependent.depends_on.map(id => id === group.mutation_id ? replacement.mutation_id : id) });
    await tx.objectStore('sync_outbox').delete(group.mutation_id);
    await tx.objectStore('sync_conflicts').delete(group.mutation_id);
    for (const change of changes) {
        const latest = all.filter(g => g.sequence > group.sequence && matches(g, change)).sort((a, b) => b.sequence - a.sequence)[0]?.changes.find(c => c.kind === change.kind && c.entity_id === change.entity_id) ?? change;
        const row = validateRecord({ ...latest, schema_version: 1, revision: 1, updated_at: new Date().toISOString() });
        if (row.kind === 'recipe') {
            if (row.deleted)
                await tx.objectStore('recipes').delete(row.entity_id);
            else
                await tx.objectStore('recipes').put(RecipeSchema.parse(row.payload));
        }
        else if (row.kind === 'draft') {
            if (row.deleted)
                await tx.objectStore('drafts').delete(row.entity_id);
            else
                await tx.objectStore('drafts').put(RecipeDraftSchema.parse(row.payload));
        }
    }
    await tx.done;
    assertCurrentLocalAccount(account);
    notifyChange(account);
    return true;
}
export async function exportLibraryConflicts(account = captureLocalAccount()): Promise<string> { const reviews = await listLibraryConflicts(account); const db = await getLocalDB(account); assertCurrentLocalAccount(account); const pending = await db.getAll('sync_outbox'); assertCurrentLocalAccount(account); return JSON.stringify({ schema_version: 1, owner_id: account.ownerId, conflicts: reviews.map(review => ({ mutationId: review.mutationId, local: review.local, remote: review.remote, reviewToken: review.reviewToken })), pending }, null, 2); }
