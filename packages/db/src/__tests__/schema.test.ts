import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createTestDb } from "../test-db";

describe("PGlite in-memory DB", () => {
  it("connects and runs a query", async () => {
    const { db, cleanup } = createTestDb();
    try {
      const result = await db.execute(sql`SELECT 1 + 1 AS sum`);
      expect((result.rows[0] as { sum: number }).sum).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("creates and queries the user table", async () => {
    const { db, client, cleanup } = createTestDb();
    try {
      await client.exec(`
        CREATE TABLE IF NOT EXISTS "user" (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          email_verified BOOLEAN NOT NULL DEFAULT FALSE,
          image TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await client.exec(`
        INSERT INTO "user" (id, name, email, email_verified)
        VALUES ('u1', 'Alice', 'alice@example.com', false)
      `);

      const rows = await client.query(`SELECT * FROM "user"`);
      expect(rows.rows).toHaveLength(1);
      expect((rows.rows[0] as { name: string }).name).toBe("Alice");
    } finally {
      cleanup();
    }
  });
});
