const DEFAULT_DATABASE_URL = 'postgresql://shoes:shoes@127.0.0.1:5432/shoes';

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (!process.env.DATABASE_URL_WARNED) {
      console.warn(
        `[Database] DATABASE_URL 未设置，使用默认: ${DEFAULT_DATABASE_URL}\n` +
          '  请安装 PostgreSQL + pgvector，或运行: bash server/scripts/setup-postgres.sh',
      );
      process.env.DATABASE_URL_WARNED = '1';
    }
    return DEFAULT_DATABASE_URL;
  }
  return url;
}

export function getPublicBaseUrl(): string {
  const port = process.env.PORT || '3000';
  return (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, '');
}
