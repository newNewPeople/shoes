# 单机部署说明

## 前置条件

- Node.js 18+、pnpm 9+
- PostgreSQL 15+ 与 [pgvector](https://github.com/pgvector/pgvector) 扩展

## 火山方舟 AI 配置

**详细图文步骤见：[ark-ai-config.md](./ark-ai-config.md)**（如何获取 API Key、LLM 接入点、Embedding 接入点）。

以下为简要说明。在 [火山方舟控制台](https://console.volcengine.com/ark) 完成以下步骤，可写入 `server/.env` 或小程序管理页 **AI配置**（页面优先）。

### 1. API Key

控制台 → **API Key 管理** → 创建/复制 → 写入：

```bash
SHOES_AI_API_KEY=ark-你的Key
```

### 2. LLM 接入点（看图分析，已有可跳过）

**在线推理 → 预置推理接入点** 中已有 Doubao-Seed-2.0-pro 时，写入模型 ID 即可：

```bash
SHOES_LLM_MODEL=doubao-seed-2-0-pro-260215
```

### 3. Embedding 接入点（搜图/入库必填）

1. **在线推理 → 创建在线推理**
2. 接入点名称：`shoes-embedding`（随意，便于识别）
3. 推理模式：**指定单一模型**
4. 点击 **+ 添加模型** → 搜索 `embedding` → 选择文本 Embedding 模型（如 `doubao-embedding-text-240715`）
5. 接入模式：**按 Token 付费** → **创建并接入**
6. 复制生成的 **接入点 ID**（`ep-xxx`）写入：

```bash
SHOES_EMBEDDING_MODEL=ep-你的Embedding接入点ID
```

### 4. 交接清单

| 配置项 | 推荐方式 |
|--------|----------|
| API Key | 管理页「AI配置」或 `SHOES_AI_API_KEY` |
| LLM 模型/接入点 | 管理页「AI配置」或 `SHOES_LLM_MODEL` |
| Embedding 接入点 | 管理页「AI配置」或 `SHOES_EMBEDDING_MODEL` |

页面配置写入 `server/data/runtime-config.json`，**优先于** `.env`，保存后立即生效，无需重启。

| 文件 | 说明 |
|------|------|
| `server/.env` | 含 API Key、LLM、Embedding、DATABASE_URL、PUBLIC_BASE_URL（**勿提交 Git**） |
| `server/.env.example` | 模板，列出所有必填项 |
| `.env.local` | 小程序 `PROJECT_DOMAIN`，生产改为 HTTPS 域名 |

新人接手：`cp server/.env.example server/.env` → 填入同一方舟账号的 Key 和 ep-xxx → `pnpm build:server && pnpm start:prod`。

若沿用同一台服务器，**直接保留现有 `server/.env` 即可**，无需再配。

## 首次安装

```bash
# 1. 初始化数据库（一次性）
bash server/scripts/setup-postgres.sh

# 2. 配置环境变量
cp server/.env.example server/.env
# 编辑 DATABASE_URL、PUBLIC_BASE_URL（生产 HTTPS 域名）

# 3. 安装与构建
pnpm install
pnpm build:server

# 4. 数据库迁移
cd server && pnpm db:migrate

# 5. 启动
pnpm start:prod
```

服务默认监听 `3000`，健康检查：`GET /api/health`。

## 生产环境

1. 设置 `PUBLIC_BASE_URL=https://your-domain.com`（图片 URL 供小程序与 LLM 访问）
2. 小程序构建时设置 `PROJECT_DOMAIN=https://your-domain.com`
3. AI Key / Embedding 接入点写在 `server/.env`（见上文「火山方舟」章节）
4. 上传目录：`server/data/uploads/`（需持久化或定期备份）

## systemd 示例

```ini
[Unit]
Description=Shoes API Server
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/shoes/server
EnvironmentFile=/opt/shoes/server/.env
ExecStart=/usr/bin/node dist/src/main.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm db:setup` | 提示 setup 脚本并执行迁移 |
| `pnpm db:migrate` | 仅执行 SQL 迁移 |
| `node dist/src/scripts/direct-import.js /path/to/data` | 离线批量导入 |
