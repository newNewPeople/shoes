# 火山方舟 AI 三项配置获取指南

鞋款项目 AI 功能依赖火山方舟（Ark）的三项配置。换账号、新人接手或首次部署时，按本文在控制台拿到对应值即可。

控制台入口：[https://console.volcengine.com/ark](https://console.volcengine.com/ark)

---

## 三项配置一览

| 配置项 | 格式示例 | 用途 | 是否必填 |
|--------|----------|------|----------|
| **API Key** | `ark-xxxxxxxx-...` | 账号凭证，LLM + Embedding 费用记在此 Key | ✅ 必填 |
| **LLM 模型/接入点** | `doubao-seed-2-0-pro-260215` 或 `ep-m-xxx` | 看图分析鞋面（入库、搜图第一步） | ✅ 必填 |
| **Embedding 接入点** | `ep-xxxxxxxx-xxxxx` | 文本转向量（搜图相似度、入库向量） | ✅ 必填 |

---

## 配置写在哪里

两种方式任选其一（或混用），**管理页优先于 `.env`**：

| 方式 | 位置 | 特点 |
|------|------|------|
| **管理页（推荐）** | 小程序 → 鞋款管理后台 → **AI配置** | 保存即生效，无需重启 |
| **环境变量** | `server/.env` | 适合脚本/首次部署，改后需重启 |

管理页保存后写入：`server/data/runtime-config.json`（含 Key，勿提交 Git）。

`.env` 对应变量：

```bash
SHOES_AI_API_KEY=ark-...
SHOES_LLM_MODEL=doubao-seed-2-0-pro-260215   # 或 ep-m-xxx
SHOES_EMBEDDING_MODEL=ep-...
```

---

## 1. 获取 API Key

### 步骤

1. 登录 [火山方舟控制台](https://console.volcengine.com/ark)
2. 左侧底部 → **API Key 管理**
3. 点击 **创建 API Key**（或使用已有 Key）
4. 复制以 **`ark-`** 开头的完整字符串

### 也可在首页看到

**首页 → 快速开始** 区域的下拉框中会显示当前 API Key 名称，点 **查看 API Key** 进入管理页复制。

### 填入

- 管理页 **API Key** 输入框，或
- `SHOES_AI_API_KEY=ark-你的Key`

### 说明

- 同一火山账号下，LLM 和 Embedding **共用这一个 Key**
- 换 Key（同账号）只改 Key；**换账号**则 Key + 两个 `ep-xxx` 都要在新账号重建

---

## 2. 获取 LLM 模型 / 接入点（看图分析）

### 推荐：用预置接入点（最简单）

1. 左侧 **在线推理**
2. 打开 **预置推理接入点** 标签
3. 找到 **Doubao-Seed-2.0-pro | 260215**
4. 复制表中 **Model ID** 或 **接入点 ID**：

| 可复制内容 | 示例 |
|------------|------|
| 模型 ID | `doubao-seed-2-0-pro-260215` |
| 接入点 ID | `ep-m-20260630193651-n52zb` |

**二选一填入即可**，效果相同。

### 备选：自建 LLM 接入点

1. **在线推理 → 创建在线推理**
2. 推理模式：**指定单一模型**
3. **+ 添加模型** → 选 **Doubao-Seed-2.0-pro**（或 2.1-pro，需支持多模态/看图）
4. **不要选** Evolving、Character、Seedance（视频）等
5. 接入模式：**按 Token 付费** → 创建后复制 `ep-xxx`

### 不要选错的模型

| 模型 | 能否用于鞋图分析 |
|------|------------------|
| Doubao-Seed-2.0-pro | ✅ 推荐 |
| Doubao-Seed-2.1-pro | ✅ 通常可以 |
| Doubao-Seed-Evolving | ❌ 面向 Coding/Agent |
| Doubao-Seedance | ❌ 视频生成 |

### 填入

- 管理页 **LLM 模型 / 接入点**，或
- `SHOES_LLM_MODEL=doubao-seed-2-0-pro-260215`

### 内置默认（未配置时）

`doubao-seed-2-0-pro-260215`（需账号已开通该模型）

---

## 3. 获取 Embedding 接入点（搜图 / 入库向量）

**预置列表里一般没有 Embedding**，需要单独创建。

### 步骤

1. **在线推理 → 创建在线推理**
2. **接入点名称**：如 `shoes-embedding`
3. **推理模式**：**指定单一模型**
4. 点击 **+ 添加模型**
5. 搜索框输入 **`embedding`**
6. 选择 **文本 Embedding** 模型，例如：
   - `doubao-embedding-text-240715`
   - 或名称含 **embedding-text** 的模型
7. 若搜不到：先去 **模型广场** 搜索 `embedding` → **开通/订阅** → 再回到创建页
8. **接入模式**：**按 Token 付费**
9. 点击 **创建并接入**
10. 在 **模型推理接入点** 列表中复制 **接入点 ID**（`ep-xxxxxxxx-xxxxx`）

### 不要混用 LLM 的 ep

`ep-m-xxx`（Seed-2.0-pro）是 LLM，**不能**填到 Embedding 配置里。

### 填入

- 管理页 **Embedding 接入点**，或
- `SHOES_EMBEDDING_MODEL=ep-你的Embedding接入点ID`

### 内置默认（未配置时）

代码默认 `doubao-embedding-text-240715`，但多数账号未开通会报错，**务必在控制台创建接入点并填入真实 `ep-xxx`**。

---

## 4. 在管理页一次性保存

1. 重新构建小程序：`pnpm build:weapp`（若尚未更新 AI 配置页）
2. 微信开发者工具打开 `dist/`，进入 **鞋款管理后台 → AI配置**
3. 填写：

| 输入框 | 填什么 |
|--------|--------|
| API Key | `ark-...`（留空则不改已有 Key） |
| LLM 模型 / 接入点 | 模型 ID 或 `ep-m-xxx` |
| Embedding 接入点 | Embedding 的 `ep-xxx` |

4. 点击 **保存并立即生效**
5. 可选：**测试连接** 验证 Key 是否有效

---

## 5. 换火山账号检查清单

| 步骤 | 操作 |
|------|------|
| 1 | 新账号创建 **API Key** |
| 2 | 新账号开通 **Seed-2.0-pro**（预置或自建） |
| 3 | 新账号 **新建 Embedding 接入点**，拿新 `ep-xxx` |
| 4 | 管理页或 `.env` 更新三项 |
| 5 | 若 Embedding 模型变了，建议 **清空鞋库重新入库**（旧向量不可比） |

同账号只轮换 Key：**只改 API Key**，两个 `ep-xxx` 一般不用动。

---

## 6. 常见问题

**Q：搜图/入库报 Embedding 不可用？**  
A：未配置或配错 Embedding。确认填的是 Embedding 的 `ep-xxx`，不是 LLM 的 `ep-m-xxx`。

**Q：报 127.0.0.1 或本地地址错误？**  
A：本地开发已自动转 base64，若仍报错请确认后端为最新版本并已重启。

**Q：管理页和 `.env` 哪个生效？**  
A：管理页（`runtime-config.json`）**优先**。可点 **清除页面配置** 回退到 `.env`。

**Q：费用怎么算？**  
A：LLM 与 Embedding 均按 Token 计费，记在当前 API Key 所属账号。

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `server/.env.example` | 环境变量模板 |
| `server/data/runtime-config.json` | 管理页保存的配置（自动生成） |
| `server/deploy/README.md` | 单机部署总览 |
