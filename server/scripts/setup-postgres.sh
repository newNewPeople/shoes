#!/usr/bin/env bash
# 一次性初始化本地 PostgreSQL（需已安装 postgres + pgvector）
set -euo pipefail

DB_USER="${DB_USER:-shoes}"
DB_PASS="${DB_PASS:-shoes}"
DB_NAME="${DB_NAME:-shoes}"

echo "==> 创建用户与数据库（如已存在会跳过）"
sudo -u postgres psql -v ON_ERROR_STOP=0 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\\gexec
SQL

echo "==> 启用 pgvector 扩展"
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo ""
echo "完成。推荐 DATABASE_URL："
echo "  postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
echo ""
echo "下一步："
echo "  cd server && cp .env.example .env"
echo "  pnpm install && pnpm build && pnpm db:migrate"
echo "  pnpm start:prod"
