/**
 * 批量导入鞋子数据脚本
 * 
 * 使用方法：
 * npx ts-node scripts/batch-import.ts /path/to/shoes_folder
 * 
 * 数据目录结构要求：
 * - 系列名（根目录）
 *   - 码段（二级目录）
 *     - 货号（三级目录）
 *       - 图片文件（如 xxx-1.jpg, xxx-2.jpg, xxx-3.jpg）
 */

import * as fs from 'fs';
import * as path from 'path';

interface ImportItem {
  seriesName: string;   // 系列名
  sizeRange: string;    // 码段
  productCode: string;  // 货号
  imagePath: string;    // 图片路径（取第一张）
}

/**
 * 解析目录结构，生成导入数据列表
 * 每个货号只取第一张图片（避免重复）
 */
function parseDirectory(basePath: string): ImportItem[] {
  const items: ImportItem[] = [];
  const importedProductCodes = new Set<string>(); // 防止重复导入同一货号

  // 读取根目录（系列名）
  const seriesDirs = fs.readdirSync(basePath).filter(f => {
    const fullPath = path.join(basePath, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  for (const seriesName of seriesDirs) {
    const seriesPath = path.join(basePath, seriesName);

    // 读取二级目录（码段）
    const sizeDirs = fs.readdirSync(seriesPath).filter(f => {
      const fullPath = path.join(seriesPath, f);
      return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
    });

    for (const sizeRange of sizeDirs) {
      const sizePath = path.join(seriesPath, sizeRange);

      // 读取三级目录（货号）
      const productDirs = fs.readdirSync(sizePath).filter(f => {
        const fullPath = path.join(sizePath, f);
        return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
      });

      for (const productCode of productDirs) {
        // 检查是否已导入过该货号
        if (importedProductCodes.has(productCode)) {
          console.log(`[跳过] 货号 ${productCode} 已存在，跳过重复导入`);
          continue;
        }

        const productPath = path.join(sizePath, productCode);

        // 读取图片文件，取第一张
        const images = fs.readdirSync(productPath)
          .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('.'))
          .sort();

        if (images.length === 0) {
          console.log(`[警告] 货号 ${productCode} 没有图片文件`);
          continue;
        }

        // 只取第一张图片
        const firstImage = images[0];
        const imagePath = path.join(productPath, firstImage);

        items.push({
          seriesName,
          sizeRange,
          productCode,
          imagePath,
        });

        importedProductCodes.add(productCode);
        console.log(`[解析] ${seriesName}/${sizeRange}/${productCode} -> ${firstImage}`);
      }
    }
  }

  return items;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('请指定数据目录路径');
    console.log('用法: npx ts-node scripts/batch-import.ts /path/to/shoes_folder');
    process.exit(1);
  }

  const basePath = args[0];
  if (!fs.existsSync(basePath)) {
    console.error(`目录不存在: ${basePath}`);
    process.exit(1);
  }

  console.log(`\n========== 开始解析目录结构 ==========`);
  console.log(`数据目录: ${basePath}\n`);

  const items = parseDirectory(basePath);

  console.log(`\n========== 解析完成 ==========`);
  console.log(`共解析 ${items.length} 个货号（每个货号只取第一张图片）\n`);

  // 输出 JSON 供后续处理
  const outputPath = '/tmp/batch-import-items.json';
  fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
  console.log(`解析结果已保存至: ${outputPath}`);
  console.log('\n数据预览（前5条）:');
  items.slice(0, 5).forEach((item, i) => {
    console.log(`${i + 1}. 货号: ${item.productCode}, 系列: ${item.seriesName}, 码段: ${item.sizeRange}`);
    console.log(`   图片: ${item.imagePath}`);
  });

  return items;
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});