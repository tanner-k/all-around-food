import { z } from 'zod';
import { RecipeSchema } from '@/lib/recipe-schema';
import { RecipeDraftSchema } from './schema';
import { PlannedOccurrenceSchema } from '@/lib/meal-plan-schema';
import { CanonicalShoppingItemSchema } from '@/lib/shopping-schema';
import { PantryItemSchema } from '@/lib/pantry-schema';
const schemas = { recipe: RecipeSchema, draft: RecipeDraftSchema, planned_meal: PlannedOccurrenceSchema, shopping: CanonicalShoppingItemSchema, pantry: PantryItemSchema };
const kind = z.enum(['recipe', 'draft', 'planned_meal', 'shopping', 'pantry', 'cook_session']);
export const RemoteRecordSchema = z.object({ kind, entity_id: z.string().min(1), schema_version: z.literal(1), revision: z.number().int().positive().safe(), payload: z.unknown(), deleted: z.boolean(), updated_at: z.string().datetime({ offset: true }) });
export const AbsentRecordSchema = z.object({ kind, entity_id: z.string().min(1), absent: z.literal(true) });
export type RemoteRecord = z.infer<typeof RemoteRecordSchema>;
export type ConflictRecord = RemoteRecord | z.infer<typeof AbsentRecordSchema>;
export function validateRecord(value: unknown): RemoteRecord {
    const row = RemoteRecordSchema.parse(value);
    if (row.kind === 'cook_session')
        throw new Error(`Unsupported collection ${row.kind}; update the app.`);
    if (row.deleted) {
        if (row.payload !== null)
            throw new Error('Tombstone payload must be null.');
    }
    else {
        const parsed = schemas[row.kind as keyof typeof schemas].parse(row.payload);
        if (parsed.id !== row.entity_id)
            throw new Error('Record payload ID mismatch.');
        if (row.kind === 'shopping')
            row.payload = parsed;
    }
    return row;
}
export function validateConflictRecord(value: unknown): ConflictRecord {
    const absent = AbsentRecordSchema.safeParse(value);
    return absent.success ? absent.data : validateRecord(value);
}
