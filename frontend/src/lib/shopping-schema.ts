import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AisleSchema } from "./pantry-schema";

export const ShoppingSourceSchema = z.enum(["manual", "recipe", "planner"]);

export const ShoppingListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity_text: z.string().nullable().default(null),
  aisle: AisleSchema.default("Other"),
  checked: z.boolean().default(false),
  source: ShoppingSourceSchema.default("manual"),
  source_recipe_id: z.string().nullable().default(null),
  pantry_covered: z.boolean().default(false),
  pantry_low: z.boolean().default(false),
  created_at: z.string(),
});

export const AisleGroupSchema = z.object({
  aisle: AisleSchema,
  items: z.array(ShoppingListItemSchema),
});

export const ShoppingListResponseSchema = z.object({
  groups: z.array(AisleGroupSchema),
  total_visible: z.number().int(),
});

// One grocery line item as parsed from a receipt.
export const GroceryItemSchema = z.object({
  name: z.string(),
  quantity_text: z.string().nullable(),
});

export const ReceiptParseSchema = z.object({
  items: z.array(GroceryItemSchema),
  store: z.string().nullable(),
  parse_confidence: z.number().min(0).max(1).nullable(),
});

export type ShoppingSource = z.infer<typeof ShoppingSourceSchema>;
export type ShoppingListItem = z.infer<typeof ShoppingListItemSchema>;
export type AisleGroup = z.infer<typeof AisleGroupSchema>;
export type ShoppingListResponse = z.infer<typeof ShoppingListResponseSchema>;
export type GroceryItem = z.infer<typeof GroceryItemSchema>;
export type ReceiptParse = z.infer<typeof ReceiptParseSchema>;

// Inline schema (no $ref wrapper) — Anthropic tool input_schema requires this shape.
const _rawReceiptSchema = zodToJsonSchema(ReceiptParseSchema) as Record<
  string,
  unknown
>;
delete _rawReceiptSchema.$schema;
export const receiptParseJsonSchema = _rawReceiptSchema;
