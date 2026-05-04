import { faker } from "@faker-js/faker";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding database...");

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = Array.from({ length: 10 }, () => ({
    id:            faker.string.uuid(),
    name:          faker.person.fullName(),
    email:         faker.internet.email().toLowerCase(),
    emailVerified: true,
    image:         faker.image.avatar(),
    createdAt:     faker.date.past(),
    updatedAt:     new Date(),
  }));

  await db.insert(schema.user).values(users).onConflictDoNothing();
  console.log(`  ✓ ${users.length} users`);

  console.log("Done.");
}

seed()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => sql.end());
