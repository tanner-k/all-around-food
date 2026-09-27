import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recipeFixture } from '@/lib/__tests__/fixtures/recipe';
import { ShoppingListItemSchema } from '@/lib/shopping-schema';
import { closeLocalDB, getLocalDB, selectVerifiedAccount, signOutLocalAccount } from '../db';
import { addPantryItem, addPlannedMeal, addRecipesToShopping, addShoppingItem, completeShopping, generateWeekShopping, readSnapshot, removePantryItem, removePlannedMeal, removeShoppingItem, saveMealPlan, setPantryStatus, setPlannedServings, setShoppingChecked } from '../repository';
import { listLibraryConflicts, resolveLibraryConflict, syncLibraryOnce } from '../sync';
import type { RemoteRecord } from '../sync-codecs';
import type { PushRequest } from '@/lib/db/librarySync';

const owner = '11111111-1111-4111-8111-111111111111';
const week = '2026-09-21';
const kinds = ['recipe', 'draft', 'planned_meal', 'shopping', 'pantry'] as const;
const originalIDB = indexedDB;
let clients: IDBFactory[];

function server() {
    let revision = 0;
    const records = new Map<string, RemoteRecord>();
    const batches: { revision: number; records: RemoteRecord[] }[] = [];
    const receipts = new Map<string, unknown>();
    const key = (row: { kind: string; entity_id: string }) => `${row.kind}:${row.entity_id}`;
    const transport = {
        async push(request: PushRequest) {
            const receipt = receipts.get(request.mutation_id);
            if (receipt) return structuredClone(receipt);
            const conflicts = request.changes.filter(change => (records.get(key(change))?.revision ?? null) !== change.base_revision);
            if (conflicts.length) return { status: 'conflict', records: conflicts.map(change => records.get(key(change)) ?? { kind: change.kind, entity_id: change.entity_id, absent: true }) };
            if (request.changes.some(change => change.deleted && change.base_revision === null)) throw Error('Never-existing target cannot be deleted');
            const accepted = request.changes.map(change => ({ ...change, schema_version: 1 as const, revision: revision + 1, updated_at: new Date().toISOString() }));
            revision++;
            for (const row of accepted) records.set(key(row), row);
            batches.push({ revision, records: accepted });
            const response = { status: 'accepted', revision, records: accepted };
            receipts.set(request.mutation_id, structuredClone(response));
            return response;
        },
        async pull(after: number) {
            return structuredClone({ protocol_version: 1, batches: batches.filter(batch => batch.revision > after), next_revision: revision, has_more: false });
        },
    };
    return { transport, records, receipts };
}
async function useClient(index: number) {
    await closeLocalDB();
    vi.stubGlobal('indexedDB', clients[index]);
    selectVerifiedAccount(owner);
}
async function sync(remote: ReturnType<typeof server>) {
    return syncLibraryOnce({ verifiedOwnerId: owner, outboundKinds: kinds, transport: remote.transport, sleep: async () => {} });
}
async function seedRecipe() {
    await (await getLocalDB()).put('recipes', { ...recipeFixture(), servings: 2 });
}
beforeEach(async () => {
    clients = [new IDBFactory(), new IDBFactory()];
    await useClient(0);
});
afterEach(async () => {
    await closeLocalDB();
    signOutLocalAccount();
    vi.stubGlobal('indexedDB', originalIDB);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('merges independent offline day additions with stable equal-position ordering and missing recipes', async () => {
    const remote = server();
    await addPlannedMeal(week, 0, 'missing-recipe');
    const a = (await readSnapshot()).meal_plans[0].meals[0];
    await useClient(1);
    await addPlannedMeal(week, 1, 'other-missing');
    const b = (await readSnapshot()).meal_plans[0].meals[0];
    await useClient(0);
    expect((await sync(remote)).error).toBeUndefined();
    await useClient(1);
    expect((await sync(remote)).error).toBeUndefined();
    const expected = [a.id, b.id].sort();
    expect((await readSnapshot()).meal_plans[0].meals.map(meal => meal.id)).toEqual(expected);
    await useClient(0);
    await sync(remote);
    expect((await readSnapshot()).meal_plans[0].meals.map(meal => meal.id)).toEqual(expected);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
});

it('reviews simultaneous serving edits and preserves a newer edit through remote resolution', async () => {
    const remote = server();
    await addPlannedMeal(week, 2, 'missing');
    const id = (await readSnapshot()).meal_plans[0].meals[0].id!;
    await sync(remote);
    await useClient(1);
    await sync(remote);
    await setPlannedServings(week, id, 4);
    await useClient(0);
    await setPlannedServings(week, id, 3);
    await sync(remote);
    await useClient(1);
    expect((await sync(remote)).conflicts).toBe(1);
    const [review] = await listLibraryConflicts();
    await setPlannedServings(week, id, 9);
    expect(await resolveLibraryConflict(review, 'remote')).toBe(true);
    expect((await readSnapshot()).meal_plans[0].meals[0].servings).toBe(9);
    await sync(remote);
    await sync(remote);
    await useClient(0);
    await sync(remote);
    expect((await readSnapshot()).meal_plans[0].meals[0].servings).toBe(9);
});

it('keeps independent duplicate pantry names and derives coverage without shopping echo', async () => {
    const remote = server();
    const a = await addPantryItem('bread');
    await setPantryStatus(a.id, 'low');
    await sync(remote);
    await sync(remote);
    await useClient(1);
    const b = await addPantryItem('bread');
    const shopping = await addShoppingItem('bread');
    await sync(remote);
    expect((await readSnapshot()).pantry.map(item => item.id).sort()).toEqual([a.id, b.id].sort());
    expect((await readSnapshot()).shopping.find(item => item.id === shopping.id)).toMatchObject({ pantry_covered: true, pantry_low: false });
    const wire = remote.records.get(`shopping:${shopping.id}`)!.payload as Record<string, unknown>;
    expect(wire).not.toHaveProperty('pantry_covered');
    expect(wire).not.toHaveProperty('pantry_low');
    await useClient(0);
    await sync(remote);
    expect((await readSnapshot()).shopping[0].pantry_covered).toBe(true);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
});

it('conflicts regeneration against another device checking a removed generated row', async () => {
    const remote = server();
    await seedRecipe();
    await addPlannedMeal(week, 0, recipeFixture().id);
    await generateWeekShopping(week);
    await sync(remote);
    const initial = (await readSnapshot()).shopping[0];
    const mealId = (await readSnapshot()).meal_plans[0].meals[0].id!;
    await useClient(1);
    await sync(remote);
    await setShoppingChecked(initial.id, true);
    await useClient(0);
    await setPlannedServings(week, mealId, 4);
    await generateWeekShopping(week);
    const groups = (await (await getLocalDB()).getAll('sync_outbox')).sort((a, b) => a.sequence - b.sequence);
    expect(groups.at(-1)!.changes.some(change => change.entity_id === initial.id && change.deleted)).toBe(true);
    await sync(remote);
    await useClient(1);
    expect((await sync(remote)).conflicts).toBe(1);
    expect((await readSnapshot()).shopping.find(item => item.id === initial.id)?.checked).toBe(true);
    expect((await listLibraryConflicts())[0].remote[0]).toMatchObject({ deleted: true });
});

it('does not resurrect a deleted pantry item from a stale offline edit', async () => {
    const remote = server();
    const item = await addPantryItem('bread');
    await sync(remote);
    await useClient(1);
    await sync(remote);
    await setPantryStatus(item.id, 'low');
    await useClient(0);
    await removePantryItem(item.id);
    await sync(remote);
    await useClient(1);
    expect((await sync(remote)).conflicts).toBe(1);
    const [review] = await listLibraryConflicts();
    expect(await resolveLibraryConflict(review, 'remote')).toBe(true);
    expect((await readSnapshot()).pantry).toEqual([]);
    await sync(remote);
    expect(remote.records.get(`pantry:${item.id}`)!.deleted).toBe(true);
});

it('completes a purchase once on receipt retry and conflicts a second device completion as one group', async () => {
    const remote = server();
    const item = await addShoppingItem('bread');
    await sync(remote);
    await useClient(1);
    await sync(remote);
    await completeShopping([item.id, item.id]);
    await useClient(0);
    await completeShopping([item.id]);
    const push = remote.transport.push;
    let lost = false;
    remote.transport.push = async request => {
        const response = await push(request);
        if (!lost) { lost = true; throw Error('Accepted response lost'); }
        return response;
    };
    expect((await sync(remote)).error).toBeUndefined();
    await completeShopping([item.id]);
    expect((await readSnapshot()).pantry).toHaveLength(1);
    await useClient(1);
    expect((await sync(remote)).conflicts).toBe(1);
    const [review] = await listLibraryConflicts();
    expect(review.local).toHaveLength(2);
    expect(await resolveLibraryConflict(review, 'remote')).toBe(true);
    await sync(remote);
    expect((await readSnapshot()).shopping).toEqual([]);
    expect((await readSnapshot()).pantry).toHaveLength(1);
    expect([...remote.records.values()].filter(row => row.kind === 'pantry' && !row.deleted)).toHaveLength(1);
});

it('persists legacy occurrence IDs and positions once before removal/reopen', async () => {
    const db = await getLocalDB();
    await db.put('meal_plans', { week_of: week, meals: [{ day_index: 0, recipe_id: 'missing', servings: null }, { day_index: 1, recipe_id: 'missing', servings: null }], updated_at: new Date().toISOString() });
    const first = (await readSnapshot()).meal_plans[0];
    expect(first.meals.map(meal => meal.id)).toEqual([`legacy:${week}:0`, `legacy:${week}:1`]);
    expect((await db.get('meal_plans', week))!.meals[1]).toMatchObject({ id: `legacy:${week}:1`, position: 1 });
    await removePlannedMeal(week, first.meals[0].id!);
    await closeLocalDB();
    expect((await readSnapshot()).meal_plans[0].meals[0]).toMatchObject({ id: `legacy:${week}:1`, position: 1 });
});

it('rolls back the complete purchase when its atomic group exceeds 100 changes', async () => {
    const db = await getLocalDB();
    const rows = Array.from({ length: 51 }, (_, index) => ShoppingListItemSchema.parse({ id: `purchase-${index}`, name: `item-${index}`, created_at: new Date().toISOString() }));
    for (const row of rows) await db.put('shopping', row);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(completeShopping(rows.map(row => row.id))).rejects.toThrow('100 changes');
    const snapshot = await readSnapshot();
    expect(snapshot.shopping).toHaveLength(51);
    expect(snapshot.pantry).toEqual([]);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
    report.mockRestore();
});

it('covers explicit plan replacement, recipe shopping replacement, checking, and removal without no-op groups', async () => {
    await seedRecipe();
    await saveMealPlan({ week_of: week, meals: [{ id: 'meal', day_index: 0, recipe_id: 'missing', servings: 2 }], updated_at: new Date().toISOString() });
    await addRecipesToShopping([recipeFixture().id]);
    const item = (await readSnapshot()).shopping[0];
    await setShoppingChecked(item.id, true);
    await addRecipesToShopping([recipeFixture().id]);
    expect((await readSnapshot()).shopping[0]).toMatchObject({ id: item.id, checked: true });
    await removeShoppingItem(item.id);
    await saveMealPlan({ week_of: week, meals: [], updated_at: new Date().toISOString() });
    const db = await getLocalDB();
    const groups = await db.getAll('sync_outbox');
    expect(groups.flatMap(group => group.changes).filter(change => change.deleted).map(change => change.kind).sort()).toEqual(['planned_meal', 'shopping']);
    await removeShoppingItem('absent');
    await removePantryItem('absent');
    await removePlannedMeal(week, 'absent');
    expect(await db.getAll('sync_outbox')).toHaveLength(groups.length);
});

it.each(['planned_meal', 'shopping', 'pantry'] as const)('materializes reviewed absence for an unsent %s creation without uploading a tombstone', async kind => {
    if (kind === 'planned_meal') await addPlannedMeal(week, 0, 'missing');
    if (kind === 'shopping') await addShoppingItem('bread');
    if (kind === 'pantry') await addPantryItem('bread');
    const [group] = await (await getLocalDB()).getAll('sync_outbox');
    await syncLibraryOnce({ verifiedOwnerId: owner, outboundKinds: kinds, transport: {
        push: async () => ({ status: 'conflict', records: group.changes.map(change => ({ kind: change.kind, entity_id: change.entity_id, absent: true })) }),
        pull: async () => ({ protocol_version: 1, batches: [], next_revision: 0, has_more: false }),
    } });
    const [review] = await listLibraryConflicts();
    expect(await resolveLibraryConflict(review, 'remote')).toBe(true);
    const snapshot = await readSnapshot();
    expect(snapshot.meal_plans.flatMap(plan => plan.meals)).toEqual([]);
    expect(snapshot.shopping).toEqual([]);
    expect(snapshot.pantry).toEqual([]);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
});

it('applies occurrence moves and tombstones without dropping unrelated missing-recipe meals', async () => {
    const remote = server();
    await addPlannedMeal(week, 0, 'missing');
    await addPlannedMeal(week, 1, 'another-missing');
    await sync(remote);
    const original = (await readSnapshot()).meal_plans[0];
    const moved = original.meals[0];
    await saveMealPlan({ week_of: '2026-09-28', meals: [{ ...moved, day_index: 2 }], updated_at: new Date().toISOString() });
    expect((await readSnapshot()).meal_plans.flatMap(plan => plan.meals).filter(meal => meal.id === moved.id)).toHaveLength(1);
    await sync(remote);
    await useClient(1);
    await sync(remote);
    const plans = (await readSnapshot()).meal_plans;
    expect(plans.find(plan => plan.week_of === week)!.meals.map(meal => meal.id)).toEqual([original.meals[1].id]);
    expect(plans.find(plan => plan.week_of === '2026-09-28')!.meals[0]).toMatchObject({ id: moved.id, recipe_id: 'missing', day_index: 2 });
    await removePlannedMeal('2026-09-28', moved.id!);
    await sync(remote);
    await useClient(0);
    await sync(remote);
    expect((await readSnapshot()).meal_plans.flatMap(plan => plan.meals).map(meal => meal.id)).toEqual([original.meals[1].id]);
});

it('rolls back oversized plan writes and leaves prior week and outbox intact', async () => {
    await addPlannedMeal(week, 0, 'missing');
    const before = await readSnapshot();
    const groups = await (await getLocalDB()).getAll('sync_outbox');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(saveMealPlan({ week_of: week, meals: Array.from({ length: 101 }, (_, position) => ({ id: `meal-${position}`, position, day_index: 0, recipe_id: 'missing', servings: null })), updated_at: new Date().toISOString() })).rejects.toThrow('100 changes');
    expect((await readSnapshot()).meal_plans).toEqual(before.meal_plans);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual(groups);
});

it('rejects the entire regeneration if another device checked an affected row first', async () => {
    const remote = server();
    await seedRecipe();
    await addPlannedMeal(week, 0, recipeFixture().id);
    await generateWeekShopping(week);
    await sync(remote);
    const original = (await readSnapshot()).shopping[0];
    const meal = (await readSnapshot()).meal_plans[0].meals[0];
    await useClient(1);
    await sync(remote);
    await setShoppingChecked(original.id, true);
    await sync(remote);
    await useClient(0);
    await setPlannedServings(week, meal.id!, 4);
    await generateWeekShopping(week);
    expect((await sync(remote)).conflicts).toBe(1);
    const [review] = await listLibraryConflicts();
    expect(review.local).toHaveLength(2);
    expect(review.remote.some(row => 'absent' in row)).toBe(true);
    expect(remote.records.get(`shopping:${original.id}`)!.payload).toMatchObject({ checked: true });
    expect([...remote.records.values()].filter(row => row.kind === 'shopping' && !row.deleted)).toHaveLength(1);
    expect((await readSnapshot()).shopping[0].quantity_text).toBe('4 slices');
});

it('preserves a pantry edit made during completion upload and never repeats its stock write', async () => {
    const remote = server();
    const shopping = await addShoppingItem('bread');
    await sync(remote);
    await completeShopping([shopping.id]);
    const stocked = (await readSnapshot()).pantry[0];
    const push = remote.transport.push;
    let edited = false;
    remote.transport.push = async request => {
        const response = await push(request);
        if (!edited) { edited = true; await setPantryStatus(stocked.id, 'low'); }
        return response;
    };
    await sync(remote);
    expect((await readSnapshot()).pantry[0].status).toBe('low');
    const [later] = await (await getLocalDB()).getAll('sync_outbox');
    expect(later.changes).toHaveLength(1);
    expect(later.changes[0].base_revision).toBe(2);
    await sync(remote);
    expect(remote.records.get(`pantry:${stocked.id}`)!.payload).toMatchObject({ status: 'low' });
    expect([...remote.records.values()].filter(row => row.kind === 'pantry')).toHaveLength(1);
});

it('rolls back regeneration above the byte bound without deleting its prior shopping rows', async () => {
    await seedRecipe();
    await addPlannedMeal(week, 0, recipeFixture().id);
    await generateWeekShopping(week);
    const before = (await readSnapshot()).shopping;
    const db = await getLocalDB();
    const recipe = recipeFixture();
    await db.put('recipes', { ...recipe, ingredients: [{ ...recipe.ingredients[0], name: 'x'.repeat(1024 * 1024) }] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(generateWeekShopping(week)).rejects.toThrow('1 MiB');
    expect((await readSnapshot()).shopping).toEqual(before);
});

it('strips received derived shopping flags from shadows and recomputes local coverage', async () => {
    const row = ShoppingListItemSchema.parse({ id: 'remote-shopping', name: 'bread', pantry_covered: true, pantry_low: true, created_at: new Date().toISOString() });
    await syncLibraryOnce({ verifiedOwnerId: owner, outboundKinds: kinds, transport: {
        push: async () => { throw Error('No pending work'); },
        pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [{ kind: 'shopping', entity_id: row.id, schema_version: 1, revision: 1, payload: row, deleted: false, updated_at: row.created_at }] }], next_revision: 1, has_more: false }),
    } });
    expect((await readSnapshot()).shopping[0]).toMatchObject({ pantry_covered: false, pantry_low: false });
    const shadow = await (await getLocalDB()).get('sync_shadow', `shopping:${row.id}`);
    expect(shadow!.payload).not.toHaveProperty('pantry_covered');
    expect(shadow!.payload).not.toHaveProperty('pantry_low');
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
});

it('rejects duplicate occurrence identity without committing an invalid group', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(saveMealPlan({ week_of: week, meals: [0, 1].map(day_index => ({ id: 'duplicate', day_index, recipe_id: 'missing', servings: null })), updated_at: new Date().toISOString() })).rejects.toThrow('unique');
    expect((await readSnapshot()).meal_plans).toEqual([]);
    expect(await (await getLocalDB()).getAll('sync_outbox')).toEqual([]);
});

it('rejects an invalid occurrence week before applying any record or advancing the cursor', async () => {
    const recipe = recipeFixture();
    const timestamp = new Date().toISOString();
    const result = await syncLibraryOnce({ verifiedOwnerId: owner, outboundKinds: kinds, transport: {
        push: async () => null,
        pull: async () => ({ protocol_version: 1, batches: [{ revision: 1, records: [
            { kind: 'recipe', entity_id: recipe.id, schema_version: 1, revision: 1, payload: recipe, deleted: false, updated_at: timestamp },
            { kind: 'planned_meal', entity_id: 'bad', schema_version: 1, revision: 1, payload: { id: 'bad', week_of: 'bad-week', day_index: 0, recipe_id: recipe.id, servings: null, position: 0 }, deleted: false, updated_at: timestamp },
        ] }], next_revision: 1, has_more: false }),
    } });
    expect(result.error?.category).toBe('protocol');
    expect((await readSnapshot()).recipes).toEqual([]);
    expect(await (await getLocalDB()).get('sync_meta', 'pull_cursor')).toBeUndefined();
});
