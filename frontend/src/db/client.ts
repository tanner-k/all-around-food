// SERVER-ONLY — do not import from client components or pages marked "use client".
// The `sql` client from @vercel/postgres is lazy: it does not attempt to connect
// until the first query is executed. This means importing this module does NOT
// throw when DATABASE_URL is unset, so `pnpm build` passes without secrets.

import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";
import * as schema from "./schema";

export const db = drizzle(sql, { schema });

export type Database = typeof db;
