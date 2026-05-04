// Auth tables — auto-generated section (run `pnpm auth:generate` to update)
export * from "./auth-schema";

// ─── App tables ──────────────────────────────────────────────────────────────
// Add your application-specific tables below.
// Example:
//
// import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
// import { user } from "./auth-schema";
//
// export const post = pgTable("post", {
//   id:        uuid("id").primaryKey().defaultRandom(),
//   title:     text("title").notNull(),
//   content:   text("content"),
//   authorId:  text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
//   createdAt: timestamp("created_at").notNull().defaultNow(),
//   updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
// });
