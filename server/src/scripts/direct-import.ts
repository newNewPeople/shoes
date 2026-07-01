/**
 * 直接批量导入脚本（不依赖 NestJS）
 * 用法：cd server && pnpm build && node dist/src/scripts/direct-import.js [数据目录]
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import {
  createAiClients,
  getLlmInvokeOptions,
  getEmbeddingOptions,
  describeAiConfig,
} from '@/config/ai.config';
import { runMigrations } from '@/storage/database/migrate';
import { ShoesRepository } from '@/storage/database/shoes.repository';
import { LocalFileStorage } from '@/storage/local/local-file-storage';

const envPath = path.resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  loadEnv({ path: envPath });
}

const DATA_PATH = process.argv[2] || '/tmp/双层系列';

console.log(`AI 配置: ${describeAiConfig()}`);

const { llmClient, embeddingClient } = createAiClients();
const fileStorage = new LocalFileStorage();
const shoesRepository = new ShoesRepository();

interface ImportItem {
  seriesName: string;
  sizeRange: string;
  productCode: string;
  imagePath: string;
}

function parseDirectory(basePath: string): ImportItem[] {
  const items: ImportItem[] = [];
  const importedProductCodes = new Set<string>();

  if (!fs.existsSync(basePath)) {
    console.error(`目录不存在: ${basePath}`);
    return items;
  }

  const seriesName = path.basename(basePath);

  const sizeDirs = fs.readdirSync(basePath).filter(f => {
    const fullPath = path.join(basePath, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  for (const sizeRange of sizeDirs) {
    const sizePath = path.join(basePath, sizeRange);

    const productDirs = fs.readdirSync(sizePath).filter(f => {
      const fullPath = path.join(sizePath, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
    });

    for (const productCode of productDirs) {
      if (importedProductCodes.has(productCode)) {
        console.log(`[跳过] 货号 ${productCode} 已存在`);
        continue;
      }

      const productPath = path.join(sizePath, productCode);

      const images = fs.readdirSync(productPath)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('.'))
        .sort();

      if (images.length === 0) {
        console.log(`[警告] 货号 ${productCode} 无图片`);
        continue;
      }

      const firstImage = images[0];
      items.push({
        seriesName,
        sizeRange,
        productCode,
        imagePath: path.join(productPath, firstImage),
      });

      importedProductCodes.add(productCode);
      console.log(`[解析] ${seriesName}/${sizeRange}/${productCode} -> ${firstImage}`);
    }
  }

  return items;
}

async function analyzeShoeUpper(imageUrl: string): Promise<{ description: string; features: Record<string, unknown> }> {
  const PROMPT = `你是一个专业的鞋类识别专家。请分析这张鞋子的图片，**只关注鞋面（鞋帮）部分**，忽略鞋底。

请以JSON格式输出：
{
  "description": "一段自然语言描述，约100-200字",
  "features": {
    "shoe_type": "低帮/高帮/中帮",
    "toe_shape": "圆头/尖头/方头",
    "closure_type": "系带/魔术贴/一脚蹬",
    "upper_material": "主要材质描述",
    "design_style": "运动/休闲/商务/户外等",
    "distinctive_markers": ["独特标识1", "独特标识2"]
  }
}

只输出JSON，不要其他内容。`;

  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: PROMPT },
        {
          type: 'image_url' as const,
          image_url: { url: imageUrl, detail: 'high' as const },
        },
      ],
    },
  ];

  const response = await llmClient.invoke(messages, getLlmInvokeOptions());
  const content = response.content;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || content,
        features: parsed.features || {},
      };
    }
    return { description: content, features: {} };
  } catch {
    return { description: content, features: {} };
  }
}

async function importItem(item: ImportItem): Promise<void> {
  console.log(`[处理] ${item.productCode} - ${item.seriesName}/${item.sizeRange}`);

  const fileBuffer = fs.readFileSync(item.imagePath);
  const fileName = path.basename(item.imagePath);
  const storageKey = `shoes/${item.seriesName}/${item.sizeRange}/${item.productCode}/${Date.now()}_${fileName}`;

  const actualKey = await fileStorage.uploadFile({
    fileContent: fileBuffer,
    fileName: storageKey,
    contentType: 'image/jpeg',
  });

  const imageUrl = fileStorage.getPublicUrl(actualKey);
  console.log(`[上传] ${actualKey}`);

  const { description, features } = await analyzeShoeUpper(imageUrl);
  const embedding = await embeddingClient.embedText(description, getEmbeddingOptions());

  const data = await shoesRepository.insert({
    name: item.productCode,
    productCode: item.productCode,
    sizeRange: item.sizeRange,
    seriesName: item.seriesName,
    imageKey: actualKey,
    description,
    features,
    embedding,
  });

  console.log(`[完成] ${item.productCode} 入库成功，ID: ${data.id}`);
}

async function main() {
  console.log('\n========== 开始批量导入 ==========\n');
  console.log(`数据目录: ${DATA_PATH}`);

  await runMigrations();
  console.log('数据库迁移完成\n');

  const items = parseDirectory(DATA_PATH);
  console.log(`\n共解析 ${items.length} 个货号\n`);

  if (items.length === 0) {
    console.log('无数据可导入，退出');
    return;
  }

  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const item of items) {
    try {
      await importItem(item);
      results.success++;
    } catch (e) {
      results.failed++;
      const errorMsg = `${item.productCode}: ${(e as Error).message}`;
      results.errors.push(errorMsg);
      console.error(`[失败] ${errorMsg}`);
    }
  }

  console.log('\n========== 导入完成 ==========');
  console.log(`成功: ${results.success}`);
  console.log(`失败: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n失败详情:');
    results.errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err}`);
    });
  }
}

main().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});
