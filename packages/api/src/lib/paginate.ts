import type { SQL } from "drizzle-orm";
import { asc, desc, gt, lt } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";
import { z } from "zod";

// ─── Input schema ─────────────────────────────────────────────────────────────

export const cursorPageSchema = z.object({
  cursor: z.string().optional(),
  limit:  z.number().int().min(1).max(100).default(20),
  order:  z.enum(["asc", "desc"]).default("desc"),
});

export type CursorPageInput = z.infer<typeof cursorPageSchema>;

// ─── Output type ──────────────────────────────────────────────────────────────

export interface CursorPage<T> {
  items:      T[];
  nextCursor: string | null;
  hasMore:    boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Apply cursor-based pagination to a Drizzle select query.
 *
 * The cursor column must be an orderable column (timestamp or uuid recommended).
 * Returns `items`, `nextCursor` (pass as `cursor` on next request), and `hasMore`.
 *
 * @example
 *   const page = await paginate(
 *     db.select().from(post).$dynamic(),
 *     post.createdAt,
 *     { cursor, limit, order },
 *   );
 */
export async function paginate<T extends Record<string, unknown>>(
  query: PgSelect,
  cursorCol: PgColumn,
  { cursor, limit, order }: CursorPageInput,
): Promise<CursorPage<T>> {
  const conditions: SQL[] = [];

  if (cursor) {
    const decodedCursor = Buffer.from(cursor, "base64").toString("utf-8");
    conditions.push(order === "desc" ? lt(cursorCol, decodedCursor) : gt(cursorCol, decodedCursor));
  }

  const orderClause = order === "desc" ? desc(cursorCol) : asc(cursorCol);

  const rows = (await query
    .where(...(conditions as [SQL]))
    .orderBy(orderClause)
    .limit(limit + 1)) as T[];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const lastItem = items.at(-1);
  const nextCursor =
    hasMore && lastItem
      ? Buffer.from(String((lastItem as Record<string, unknown>)[cursorCol.name])).toString("base64")
      : null;

  return { items, nextCursor, hasMore };
}
