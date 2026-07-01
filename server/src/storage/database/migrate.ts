import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getPool } from '@/storage/database/drizzle';
import { getDatabaseUrl } from '@/storage/database/database.config';

export async function runMigrations(): Promise<void> {
  const sqlPath = resolve(process.cwd(), 'drizzle/0000_init.sql');
  const sql = readFileSync(sqlPath, 'utf-8');
  const pool = getPool();

  try {
    await pool.query(sql);
    console.log('[Database] 迁移完成');
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[Database] 迁移失败: ${message}`);
    console.error(
      `[Database] 请确认 PostgreSQL 已启动且 DATABASE_URL 正确:\n  ${getDatabaseUrl()}\n` +
        '  运行: bash server/scripts/setup-postgres.sh',
    );
    throw err;
  }
}
