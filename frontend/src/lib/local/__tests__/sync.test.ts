import { beforeEach, afterEach, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { recipeFixture } from '@/lib/__tests__/fixtures/recipe';
import { closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from '../db';
import { putRecipe } from '../repository';
import { syncLibraryOnce } from '../sync';
const owner = '11111111-1111-4111-8111-111111111111';
beforeEach(async () => { signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); selectVerifiedAccount(owner); });
afterEach(async () => { signOutLocalAccount(); await closeLocalDB(); await deleteDB(`aaf-local:${owner}`); });
const record = (revision = 1) => ({ kind: 'recipe', entity_id: recipeFixture().id, schema_version: 1, revision, payload: recipeFixture(), deleted: false, updated_at: new Date().toISOString() });
it('downloads a new library atomically', async () => {
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { throw Error('unexpected'); }, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [record()] }], next_revision: 1, has_more: false }) } });
    const db = await getLocalDB();
    expect(await db.getAll('recipes')).toHaveLength(1);
    expect((await db.get('sync_meta', 'pull_cursor'))?.value).toBe(1);
});
it('retries the exact frozen request after lost response', async () => {
    await putRecipe(recipeFixture());
    const sent: unknown[] = [];
    const transport = { push: async (request: unknown) => {
            sent.push(structuredClone(request));
            if (sent.length === 1)
                throw Error('offline');
            return { status: 'accepted', revision: 1, records: [record()] };
        }, pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) };
    await syncLibraryOnce({ verifiedOwnerId: owner, transport, sleep: async () => { } });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toHaveLength(0);
});
it('keeps cursor before unsupported data', async () => {
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => null, pull: async () => ({ protocol_version: 2, batches: [], next_revision: 1, has_more: false }) } });
    expect(result.error?.category).toBe('protocol');
    expect(await (await getLocalDB()).get('sync_meta', 'pull_cursor')).toBeUndefined();
});
it('resolves exact predecessor bases while preserving edits made during upload', async () => {
    await putRecipe(recipeFixture());
    const bases: (number | null)[] = [];
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async (request) => { bases.push(request.changes[0].base_revision); await putRecipe({ ...recipeFixture(), title: 'Later' }); return { status: 'accepted', revision: 8, records: [record(8)] }; }, pull: async () => ({ protocol_version: 1, batches: [{ revision: 10, records: [{ ...record(10), payload: { ...recipeFixture(), title: 'Remote' } }] }], next_revision: 10, has_more: false }) } });
    const db = await getLocalDB();
    expect((await db.getAll('recipes'))[0].title).toBe('Later');
    expect((await db.getAll('sync_outbox'))[0].changes[0].base_revision).toBe(8);
    expect((await db.getAll('sync_shadow'))[0].revision).toBe(10);
});
it('does not publish a response after account switch', async () => {
    await putRecipe(recipeFixture());
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { signOutLocalAccount(); return { status: 'accepted', revision: 1, records: [record()] }; }, pull: async () => null } });
    expect(result.error?.category).toBe('account');
    selectVerifiedAccount(owner);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toHaveLength(1);
});
it('materializes latest shadow after an old receipt finally clears dirty work', async () => {
    await putRecipe(recipeFixture());
    const db = await getLocalDB();
    const [group] = await db.getAll('sync_outbox');
    await db.put('sync_outbox', { ...group, status: 'frozen' });
    await db.put('sync_shadow', { key: `recipe:${recipeFixture().id}`, revision: 10, payload: { ...recipeFixture(), title: 'Latest remote' }, deleted: false });
    await db.put('sync_meta', { key: 'pull_cursor', value: 10 });
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => ({ status: 'accepted', revision: 8, records: [record(8)] }), pull: async () => ({ protocol_version: 1, batches: [], next_revision: 10, has_more: false }) } });
    expect((await db.getAll('recipes'))[0].title).toBe('Latest remote');
});
it('reviews a group conflict and retains a newer dependent local edit on resolution', async () => {
    const { listLibraryConflicts, resolveLibraryConflict } = await import('../sync');
    await putRecipe(recipeFixture());
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => ({ status: 'conflict', records: [{ ...record(3), payload: { ...recipeFixture(), title: 'Server' } }] }), pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) } });
    const [review] = await listLibraryConflicts();
    await putRecipe({ ...recipeFixture(), title: 'Newest intent' });
    expect(await resolveLibraryConflict(review, 'remote')).toBe(true);
    const db = await getLocalDB();
    const groups = (await db.getAll('sync_outbox')).sort((a, b) => a.sequence - b.sequence);
    expect(groups).toHaveLength(2);
    expect(groups[0].changes[0].base_revision).toBe(3);
    expect(groups[1].depends_on).toEqual([groups[0].mutation_id]);
    expect((await db.getAll('recipes'))[0].title).toBe('Newest intent');
    expect(await resolveLibraryConflict(review, 'local')).toBe(false);
});
it('rejects resolution when an unreviewed remote revision arrived', async () => {
    const { listLibraryConflicts, resolveLibraryConflict } = await import('../sync');
    await putRecipe(recipeFixture());
    const transport = { push: async () => ({ status: 'conflict', records: [record(3)] }), pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) };
    await syncLibraryOnce({ verifiedOwnerId: owner, transport });
    const [review] = await listLibraryConflicts();
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { ...transport, pull: async () => ({ protocol_version: 1, batches: [{ revision: 4, records: [record(4)] }], next_revision: 4, has_more: false }) } });
    expect(await resolveLibraryConflict(review, 'local')).toBe(false);
    expect(await (await getLocalDB()).getAll('sync_conflicts')).toHaveLength(1);
});
it('blocks conflict descendants while uploading independent groups', async () => {
    await putRecipe(recipeFixture());
    await putRecipe({ ...recipeFixture(), title: 'Dependent' });
    await putRecipe({ ...recipeFixture(), id: 'independent' });
    const sent: string[] = [];
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async (req) => { const id = req.changes[0].entity_id; sent.push(id); return id === 'independent' ? { status: 'accepted', revision: 4, records: [{ ...record(4), entity_id: id, payload: { ...recipeFixture(), id } }] } : { status: 'conflict', records: [record(3)] }; }, pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) } });
    expect(sent).toEqual([recipeFixture().id, 'independent']);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toHaveLength(2);
});
it('keeps the completed first page when the next page is interrupted', async () => {
    let pulls = 0;
    await syncLibraryOnce({ verifiedOwnerId: owner, sleep: async () => { }, transport: { push: async () => null, pull: async () => {
                if (pulls++ === 0)
                    return { protocol_version: 1, batches: [{ revision: 1, records: [record()] }], next_revision: 1, has_more: true };
                throw Error('offline');
            } } });
    expect((await (await getLocalDB()).get('sync_meta', 'pull_cursor'))?.value).toBe(1);
});
it('bounds offline retries and retains frozen work across reopen', async () => {
    await putRecipe(recipeFixture());
    let attempts = 0;
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, sleep: async () => { }, transport: { push: async () => { attempts++; throw Error('offline'); }, pull: async () => null } });
    expect(attempts).toBe(3);
    expect(result.error?.category).toBe('transient');
    await closeLocalDB();
    expect((await (await getLocalDB()).getAll('sync_outbox'))[0].status).toBe('frozen');
});
it('never splits a group outside the selected outbound scope', async () => {
    const db = await getLocalDB();
    await db.put('sync_outbox', { mutation_id: crypto.randomUUID(), sequence: 1, status: 'pending', depends_on: [], created_at: new Date().toISOString(), changes: [{ kind: 'recipe', entity_id: recipeFixture().id, payload: recipeFixture(), deleted: false, base_revision: null }, { kind: 'pantry', entity_id: 'p', payload: { id: 'p' }, deleted: false, base_revision: null }] });
    let pushes = 0;
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { pushes++; return null; }, pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) } });
    expect(pushes).toBe(0);
    expect(result.deferred).toBe(1);
    expect(result.pending).toBe(0);
});
it('rolls back the entire page when its second record is unsupported', async () => {
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => null, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [record(), { ...record(), kind: 'pantry', entity_id: 'p', payload: { id: 'p' } }] }], next_revision: 1, has_more: false }) } });
    expect(result.error?.category).toBe('protocol');
    const db = await getLocalDB();
    expect(await db.getAll('recipes')).toHaveLength(0);
    expect(await db.get('sync_meta', 'pull_cursor')).toBeUndefined();
});
it('allows overlapping runners after lease expiry without losing an in-flight edit', async () => {
    await putRecipe(recipeFixture());
    let clock = 0;
    let release!: () => void;
    let entered!: () => void;
    const entry = new Promise<void>(r => entered = r);
    const gate = new Promise<void>(r => release = r);
    let pushes = 0;
    const transport = { push: async () => {
            pushes++;
            if (pushes === 1) {
                entered();
                await gate;
            }
            return { status: 'accepted', revision: 1, records: [record()] };
        }, pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }) };
    const first = syncLibraryOnce({ verifiedOwnerId: owner, transport, now: () => clock });
    await entry;
    clock = 20000;
    await syncLibraryOnce({ verifiedOwnerId: owner, transport, now: () => clock });
    await putRecipe({ ...recipeFixture(), title: 'New generation' });
    release();
    await first;
    const db = await getLocalDB();
    expect((await db.getAll('recipes'))[0].title).toBe('New generation');
    expect(await db.getAll('sync_outbox')).toHaveLength(1);
});
it('does not retry deterministic server validation errors', async () => {
    const { LibrarySyncError } = await import('@/lib/db/librarySync');
    await putRecipe(recipeFixture());
    let attempts = 0;
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => { attempts++; throw new LibrarySyncError('validation', 'Invalid payload'); }, pull: async () => null } });
    expect(attempts).toBe(1);
    expect(result.error?.category).toBe('validation');
    expect(await (await getLocalDB()).getAll('sync_outbox')).toHaveLength(1);
});
it('does not start RPC after identity verification switches the local account', async () => {
    const { createLibraryTransport } = await import('@/lib/db/librarySync');
    let calls = 0;
    const transport = createLibraryTransport({ auth: { getUser: async () => { signOutLocalAccount(); return { data: { user: { id: owner } }, error: null }; } }, rpc: async () => { calls++; return { data: null, error: null }; } }, owner);
    await expect(transport.pull(0, 10)).rejects.toThrow();
    expect(calls).toBe(0);
});
it('rejects conflict responses that omit a member of the submitted group', async () => {
    const { parsePush } = await import('@/lib/db/librarySync');
    expect(() => parsePush({ status: 'conflict', records: [] }, { protocol_version: 1, mutation_id: crypto.randomUUID(), changes: [{ kind: 'recipe', entity_id: recipeFixture().id, payload: recipeFixture(), deleted: false, base_revision: null }] })).toThrow();
});
it('wakes existing local subscribers only after a remote page commits', async () => {
    const { subscribeToLocalChanges } = await import('../repository');
    let calls = 0;
    const unsubscribe = subscribeToLocalChanges(() => calls++);
    await syncLibraryOnce({ verifiedOwnerId: owner, transport: { push: async () => null, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [record()] }], next_revision: 1, has_more: false }) } });
    unsubscribe();
    expect(calls).toBeGreaterThan(0);
});
it('classifies Supabase HTTP response status for bounded retries', async () => {
    const { createLibraryTransport } = await import('@/lib/db/librarySync');
    const transport = createLibraryTransport({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, rpc: async () => ({ data: null, error: { message: 'Unavailable' }, status: 503 }) }, owner);
    await expect(transport.pull(0, 10)).rejects.toMatchObject({ category: 'transient' });
});
it('reports incomplete pagination at the bounded pass limit', async () => {
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, maxPages: 1, transport: { push: async () => null, pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [record()] }], next_revision: 1, has_more: true }) } });
    expect(result.error?.category).toBe('transient');
    expect(result.lastSuccessAt).toBeNull();
});
