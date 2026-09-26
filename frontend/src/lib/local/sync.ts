import { notifyChange, refreshShoppingFlags } from './repository';
import type { IDBPTransaction } from 'idb';
import { LibrarySyncError, withLibraryDeadline, parsePull, parsePush, type LibraryTransport, type PushRequest, type SyncErrorCategory } from '@/lib/db/librarySync';
import { assertCurrentLocalAccount, captureLocalAccount, getLocalDB, type LocalAccount, type LocalDBSchema } from './db';
import { validateRecord, validateConflictRecord, type ConflictRecord, type RemoteRecord } from './sync-codecs';
import { RecipeSchema } from '@/lib/recipe-schema';
import { RecipeDraftSchema } from './schema';
import { PlannedOccurrenceSchema, PlannedMealSchema, withPlannedMealIds } from '@/lib/meal-plan-schema';
import { ShoppingListItemSchema } from '@/lib/shopping-schema';
import { PantryItemSchema } from '@/lib/pantry-schema';
import { syncEntityKey, type SyncKind, type SyncOutbox } from './sync-state';
const stores = ['recipes', 'drafts', 'meal_plans', 'shopping', 'pantry', 'sync_outbox', 'sync_shadow', 'sync_conflicts', 'sync_meta'] as const;
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
    signal?: AbortSignal;
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
    await materialize(tx, row);
}
/** Shared entity writes for receipts, pull, and reviewed conflict choices. */
async function materialize(tx: Tx, row: RemoteRecord) {
    if (row.kind === 'recipe') {
        if (row.deleted) await tx.objectStore('recipes').delete(row.entity_id);
        else await tx.objectStore('recipes').put(RecipeSchema.parse(row.payload));
    }
    if (row.kind === 'draft') {
        if (row.deleted) await tx.objectStore('drafts').delete(row.entity_id);
        else await tx.objectStore('drafts').put(RecipeDraftSchema.parse(row.payload));
    }
    if (row.kind === 'shopping') {
        if (row.deleted) await tx.objectStore('shopping').delete(row.entity_id);
        else await tx.objectStore('shopping').put(ShoppingListItemSchema.parse(row.payload));
    }
    if (row.kind === 'pantry') {
        if (row.deleted) await tx.objectStore('pantry').delete(row.entity_id);
        else await tx.objectStore('pantry').put(PantryItemSchema.parse(row.payload));
    }
    if (row.kind === 'planned_meal') {
        const occurrence = row.deleted ? null : PlannedOccurrenceSchema.parse(row.payload);
        const plans = await tx.objectStore('meal_plans').getAll();
        let inserted = false;
        for (const raw of plans) {
            const plan = withPlannedMealIds(raw);
            const meals = plan.meals.filter(meal => meal.id !== row.entity_id);
            if (occurrence?.week_of === plan.week_of) {
                const meal = PlannedMealSchema.parse(occurrence);
                meals.push(meal);
                inserted = true;
            }
            if (meals.length !== plan.meals.length || occurrence?.week_of === plan.week_of) {
                meals.sort((a, b) => a.position! - b.position! || (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0));
                await tx.objectStore('meal_plans').put({ ...plan, meals, updated_at: row.updated_at });
            }
        }
        if (occurrence && !inserted) {
            const { week_of, ...meal } = occurrence;
            await tx.objectStore('meal_plans').put({ week_of, meals: [meal], updated_at: row.updated_at });
        }
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
        if (options.signal?.aborted)
            throw new LibrarySyncError('paused', 'Library sync paused.');
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
            async function remote<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
                for (let attempt = 0;; attempt++) {
                    guard();
                    try {
                        const result = await withLibraryDeadline(operation, options.signal);
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
                const response = parsePush(await remote(signal => options.transport.push(structuredClone(request), signal)), request);
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
                await refreshShoppingFlags(tx);
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
                const page = parsePull(await remote(signal => options.transport.pull(cursor, 10, signal)), cursor);
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
                await refreshShoppingFlags(tx);
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
        // SQL returns only failed CAS targets. Non-conflicting members matched their frozen base.
        // Reconstruct only from a known server shadow, or a null base's explicit absence.
        const shadow = await tx.objectStore('sync_shadow').get(syncEntityKey(change.kind, change.entity_id));
        if (!remote && change.base_revision !== null && (!shadow || shadow.revision < change.base_revision))
            throw new LibrarySyncError('protocol', 'Download the missing server version before reviewing this group.');
        latest.push(shadow ? validateRecord({ ...change, ...shadow, schema_version: 1, updated_at: new Date(0).toISOString() }) : remote ?? { kind: change.kind, entity_id: change.entity_id, absent: true });
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
    const resolvedChanges = group.changes.map(change => { const row = remote.find(r => r.kind === change.kind && r.entity_id === change.entity_id)!; const selected = edited?.find(c => c.kind === change.kind && c.entity_id === change.entity_id); const desired = selected ?? (choice === 'remote' ? { ...change, payload: 'absent' in row ? null : row.payload, deleted: 'absent' in row ? true : row.deleted } : change); return { ...desired, base_revision: 'absent' in row ? null : row.revision }; });
    const discarded = resolvedChanges.filter(change => choice === 'remote' && !edited?.some(c => c.kind === change.kind && c.entity_id === change.entity_id) && remote.some(r => r.kind === change.kind && r.entity_id === change.entity_id && 'absent' in r));
    const changes = resolvedChanges.filter(change => !discarded.includes(change));
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
    if (changes.length)
        await tx.objectStore('sync_outbox').add(replacement);
    const all = await tx.objectStore('sync_outbox').getAll();
    const replaced = new Map<string, {
        id: string | null;
        changes: SyncOutbox['changes'];
        discarded: SyncOutbox['changes'];
    }>([
        [group.mutation_id, { id: changes.length ? replacement.mutation_id : null, changes, discarded }],
    ]);
    for (const dependent of all.filter(g => g.sequence > group.sequence).sort((a, b) => a.sequence - b.sequence)) {
        if (!dependent.depends_on.some(id => replaced.has(id)))
            continue;
        const noOps: SyncOutbox['changes'] = [];
        const updated = dependent.changes.flatMap(change => {
            const prior = all.filter(g => g.sequence < dependent.sequence && matches(g, change)).sort((a, b) => a.sequence - b.sequence).at(-1);
            const cancelled = prior && replaced.get(prior.mutation_id)?.discarded.some(c => c.kind === change.kind && c.entity_id === change.entity_id);
            if (cancelled && change.deleted) {
                noOps.push(change);
                return [];
            }
            return [{ ...change, base_revision: cancelled ? null : change.base_revision }];
        });
        const dependencies = [...new Set(dependent.depends_on.flatMap(id => { const prior = replaced.get(id); return prior ? (prior.id && prior.changes.some(c => updated.some(item => item.kind === c.kind && item.entity_id === c.entity_id)) ? [prior.id] : []) : [id]; }))];
        if (!updated.length)
            await tx.objectStore('sync_outbox').delete(dependent.mutation_id);
        else
            await tx.objectStore('sync_outbox').put({ ...dependent, changes: updated, depends_on: dependencies });
        if (noOps.length)
            replaced.set(dependent.mutation_id, { id: updated.length ? dependent.mutation_id : null, changes: updated, discarded: noOps });
    }
    await tx.objectStore('sync_outbox').delete(group.mutation_id);
    await tx.objectStore('sync_conflicts').delete(group.mutation_id);
    for (const change of resolvedChanges) {
        const latest = all.filter(g => g.sequence > group.sequence && matches(g, change)).sort((a, b) => b.sequence - a.sequence)[0]?.changes.find(c => c.kind === change.kind && c.entity_id === change.entity_id) ?? change;
        const row = validateRecord({ ...latest, schema_version: 1, revision: 1, updated_at: new Date().toISOString() });
        await materialize(tx, row);
    }
    await refreshShoppingFlags(tx);
    await tx.done;
    assertCurrentLocalAccount(account);
    notifyChange(account);
    return true;
}
export async function exportLibraryConflicts(account = captureLocalAccount()): Promise<string> { const reviews = await listLibraryConflicts(account); const db = await getLocalDB(account); assertCurrentLocalAccount(account); const pending = await db.getAll('sync_outbox'); assertCurrentLocalAccount(account); return JSON.stringify({ schema_version: 1, owner_id: account.ownerId, conflicts: reviews.map(review => ({ mutationId: review.mutationId, local: review.local, remote: review.remote, reviewToken: review.reviewToken })), pending }, null, 2); }
