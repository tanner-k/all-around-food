import { z } from "zod";

export const PantryStatusSchema = z.enum(["in_stock", "low", "out"]);

export const AisleSchema = z.enum([
  "Produce",
  "Dairy",
  "Meat",
  "Bakery",
  "Pantry",
  "Frozen",
  "Beverages",
  "Household",
  "Other",
]);

export const PantryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: PantryStatusSchema.default("in_stock"),
  aisle: AisleSchema.default("Other"),
  aisle_overridden: z.boolean().default(false),
  notes: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PantryStatus = z.infer<typeof PantryStatusSchema>;
export type Aisle = z.infer<typeof AisleSchema>;
export type PantryItem = z.infer<typeof PantryItemSchema>;
