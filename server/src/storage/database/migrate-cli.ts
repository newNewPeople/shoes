import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { runMigrations } from '@/storage/database/migrate';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../../.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

runMigrations()
  .then(() => {
    console.log('数据库迁移成功');
    process.exit(0);
  })
  .catch(err => {
    console.error('数据库迁移失败:', (err as Error).message);
    process.exit(1);
  });
