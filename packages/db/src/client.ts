import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let activeUrl: string | null = null;

function poolSize(): number {
  const parsed = Number(process.env.DB_POOL_SIZE);
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 10);
  return 3;
}

export function createDb(connectionString: string) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  if (db && activeUrl === connectionString) {
    return db;
  }

  if (client) {
    void client.end({ timeout: 1 });
    client = null;
    db = null;
  }

  activeUrl = connectionString;
  client = postgres(connectionString, {
    prepare: false,
    max: poolSize(),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  db = drizzle(client, { schema });
  return db;
}

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set. Call createDb() first.");
    }
    return createDb(url);
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
    activeUrl = null;
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    if (!client) getDb();
    if (!client) return false;
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export type Database = ReturnType<typeof createDb>;
