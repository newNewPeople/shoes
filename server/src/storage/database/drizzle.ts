import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/storage/database/shared/schema';
import { getDatabaseUrl } from '@/storage/database/database.config';

export type AppDatabase = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let db: AppDatabase | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
    });
  }
  return pool;
}

export function getDb(): AppDatabase {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
