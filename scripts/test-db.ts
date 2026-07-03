import postgres from "postgres";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const [row] = await sql`SELECT current_database() AS db, current_user AS usr`;
  console.log("Postgres OK:", row);

  const tables = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log("Tables:", tables.map((t) => t.tablename).join(", "));
} catch (e) {
  console.error("Postgres FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end();
}
