/**
 * 直接批量导入脚本
 * 用于从本地文件系统批量导入鞋子数据到数据库
 * 
 * 运行方式：cd /workspace/projects/server && npx ts-node scripts/run-import.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ShoesService, BatchImportItem } from '../src/shoes/shoes.service';
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = '/tmp/双层系列'; // 解压后的数据目录

function parseDirectory(basePath: string): BatchImportItem[] {
  const items: BatchImportItem[] = [];
  const importedProductCodes = new Set<string>();

  if (!fs.existsSync(basePath)) {
    console.error(`目录不存在: ${basePath}`);
    return items;
  }

  // 根目录就是系列名
  const seriesName = path.basename(basePath);

  // 读取码段目录
  const sizeDirs = fs.readdirSync(basePath).filter(f => {
    const fullPath = path.join(basePath, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  for (const sizeRange of sizeDirs) {
    const sizePath = path.join(basePath, sizeRange);

    // 读取货号目录
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

      // 读取图片文件，只取第一张
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
      console.log(`[解析] ${seriesName}/${sizeRange}/${productCode} -> ${firstImage} (${images.length}张可选，取第1张)`);
    }
  }

  return items;
}

async function bootstrap() {
  console.log('\n========== 开始批量导入 ==========\n');

  // 解析目录
  const items = parseDirectory(DATA_PATH);
  console.log(`\n共解析 ${items.length} 个货号\n`);

  if (items.length === 0) {
    console.log('无数据可导入，退出');
    return;
  }

  // 创建 NestJS 应用
  const app = await NestFactory.createApplicationContext(AppModule);
  const shoesService = app.get(ShoesService);

  console.log('NestJS 应用已初始化，开始导入...\n');

  // 执行批量导入
  const result = await shoesService.batchImportShoes(items);

  console.log('\n========== 导入完成 ==========');
  console.log(`成功: ${result.success}`);
  console.log(`失败: ${result.failed}`);
  
  if (result.errors.length > 0) {
    console.log('\n失败详情:');
    result.errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err}`);
    });
  }

  await app.close();
}

bootstrap().catch(err => {
  console.error('导入失败:', err);
  process.exit(1);
});