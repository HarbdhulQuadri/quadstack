import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";

export type TestDb = ReturnType<typeof createTestDb>["db"];

/**
 * Creates an in-memory Postgres database for unit tests.
 * No Docker, no network — just Postgres as WASM.
 *
 * Usage:
 *   const { db, cleanup } = createTestDb();
 *   afterAll(cleanup);
 */
export function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  async function setup(migrationsFolder?: string) {
    if (migrationsFolder) {
      await migrate(db, { migrationsFolder });
    }
    return db;
  }

  function cleanup() {
    client.close();
  }

  return { db, setup, cleanup, client };
}
