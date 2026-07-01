import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { LLMClient, EmbeddingClient } from 'coze-coding-dev-sdk';
import {
  createAiConfig,
  getAiModels,
  getLlmInvokeOptions,
  getEmbeddingOptions,
  describeAiConfig,
} from '@/config/ai.config';
import { ShoesRepository } from '@/storage/database/shoes.repository';
import { LocalFileStorage } from '@/storage/local/local-file-storage';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');

export interface SearchResult {
  id: string;
  name: string | null;
  imageUrl: string;
  description: string | null;
  similarity: number;
  productCode?: string | null;
  sizeRange?: string | null;
  seriesName?: string | null;
}

export interface BatchImportItem {
  productCode: string;
  sizeRange: string;
  seriesName: string;
  imagePath: string;
}

export interface ZipImportResult {
  success: number;
  failed: number;
  errors: string[];
  totalItems: number;
  seriesName: string;
}

export interface ZipValidationError {
  isValid: boolean;
  message: string;
  details: string[];
}

// 异步任务状态
export interface ImportTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  totalItems: number;
  processedItems: number;
  successCount: number;
  failedCount: number;
  seriesName: string;
  errors: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 内存任务存储（生产环境可改用数据库）
const importTasks = new Map<string, ImportTask>();

@Injectable()
export class ShoesService {
  private readonly logger = new Logger(ShoesService.name);
  private llmClient!: LLMClient;
  private embeddingClient!: EmbeddingClient;

  constructor(
    private readonly shoesRepository: ShoesRepository,
    private readonly fileStorage: LocalFileStorage,
  ) {
    this.reloadAiClients();
  }

  /** 重新加载 AI 客户端（页面修改 API Key 后调用） */
  reloadAiClients(): void {
    const config = createAiConfig();
    this.llmClient = new LLMClient(config);
    this.embeddingClient = new EmbeddingClient(config);
    this.logger.log(`AI 配置: ${describeAiConfig()}`);
  }

  /**
   * 上传图片到对象存储，返回 URL + Key
   */
  async uploadTempImage(file: Express.Multer.File): Promise<{ imageUrl: string; imageKey: string }> {
    const fileName = `shoes/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const actualKey = await this.fileStorage.uploadFile({
      fileContent: file.buffer,
      fileName,
      contentType: file.mimetype || 'image/jpeg',
    });

    const imageUrl = await this.fileStorage.generatePresignedUrl({
      key: actualKey,
      expireTime: 86400 * 30, // 30天
    });

    this.logger.log(`图片已上传，key: ${actualKey}`);
    return { imageUrl, imageKey: actualKey };
  }

  /**
   * 上传 base64 图片到存储（自动压缩大图）
   */
  async uploadBase64Image(base64Data: string, fileName?: string): Promise<{ imageUrl: string; imageKey: string }> {
    // 解析 base64 数据
    const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    const contentType = matches ? matches[1] : 'image/jpeg';
    const base64Content = matches ? matches[2] : base64Data;
    
    // 将 base64 转为 Buffer
    let buffer = Buffer.from(base64Content, 'base64');
    
    // 使用 sharp 压缩图片（限制最大尺寸为 1920x1920）
    const sharp = require('sharp');
    try {
      const metadata = await sharp(buffer).metadata();
      const maxDimension = 1920;
      
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        this.logger.log(`图片尺寸过大 (${metadata.width}x${metadata.height})，正在压缩...`);
        buffer = await sharp(buffer)
          .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        this.logger.log(`图片已压缩，新尺寸约 ${maxDimension}px，大小: ${buffer.length}`);
      }
    } catch (e) {
      this.logger.warn(`图片压缩失败，使用原图: ${(e as Error).message}`);
    }
    
    const actualFileName = fileName || `shoes/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const sanitizedFileName = actualFileName.replace(/[^a-zA-Z0-9._/-]/g, '_');
    
    const actualKey = await this.fileStorage.uploadFile({
      fileContent: buffer,
      fileName: sanitizedFileName,
      contentType: 'image/jpeg',
    });

    const imageUrl = await this.fileStorage.generatePresignedUrl({
      key: actualKey,
      expireTime: 86400 * 30, // 30天
    });

    this.logger.log(`Base64图片已上传，key: ${actualKey}, size: ${buffer.length}`);
    return { imageUrl, imageKey: actualKey };
  }

  /**
   * 本地开发时图片 URL 为 127.0.0.1，LLM SDK 禁止访问内网地址，需转为 base64
   */
  private async resolveImageForLlm(imageUrl: string, imageKey?: string): Promise<string> {
    try {
      const parsed = new URL(imageUrl);
      const isLocal =
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '0.0.0.0';

      let key = imageKey;
      if (!key && isLocal) {
        const prefix = '/api/files/';
        const idx = parsed.pathname.indexOf(prefix);
        if (idx !== -1) {
          key = decodeURIComponent(parsed.pathname.slice(idx + prefix.length));
        }
      }

      if (key && (isLocal || imageKey)) {
        const buffer = await this.fileStorage.readFile({ fileKey: key });
        const lower = key.toLowerCase();
        const mime = lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      }
    } catch (e) {
      this.logger.warn(`本地图片转 base64 失败，回退 URL: ${(e as Error).message}`);
    }
    return imageUrl;
  }

  /**
   * 使用 LLM 多模态分析鞋面图片
   */
  private async analyzeShoeUpper(
    imageUrl: string,
    imageKey?: string,
  ): Promise<{ description: string; features: Record<string, any> }> {
    this.logger.log('正在分析鞋面图片...');

    const llmImageUrl = await this.resolveImageForLlm(imageUrl, imageKey);

    const PROMPT = `你是一个专业的鞋类款式识别专家。请分析这张鞋子的图片，**只关注鞋面（鞋帮）的款式结构**。

**重要：完全忽略以下特征，不要在描述中出现：**
- ❌ 颜色（黑色、白色、红色等）
- ❌ 皮革材质类型（真皮、人造皮、网面等）
- ❌ 材质纹理细节

**只关注款式结构特征：**
1. **鞋型轮廓**：低帮/高帮/中帮？鞋头形状（圆头/尖头/方头）？
2. **鞋面结构**：拼接方式？面板分割线条？造型轮廓？
3. **系带系统**：系带/魔术贴/一脚蹬？鞋带孔数量和位置？鞋舌样式？
4. **装饰元素位置**：logo位置、标牌位置、缝线图案位置、冲孔图案位置（不描述颜色）
5. **后跟/领口设计**：后跟加强片形状？领口填充轮廓？
6. **侧边设计**：侧边条纹位置？支撑结构位置？

请以JSON格式输出：
{
  "description": "一段自然语言描述，只描述款式结构特征，不涉及颜色和材质，约100-200字",
  "features": {
    "shoe_type": "低帮/高帮/中帮",
    "toe_shape": "圆头/尖头/方头",
    "closure_type": "系带/魔术贴/一脚蹬",
    "design_style": "运动/休闲/商务/户外等",
    "panel_structure": "面板分割描述",
    "distinctive_markers": ["款式独特标识1", "款式独特标识2"]
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
            image_url: { url: llmImageUrl, detail: 'high' as const },
          },
        ],
      },
    ];

    const response = await this.llmClient.invoke(messages, getLlmInvokeOptions());

    const content = response.content;
    this.logger.log(`LLM 分析结果: ${content.substring(0, 200)}...`);

    // 解析 JSON
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
    } catch (e) {
      this.logger.warn(`JSON 解析失败，使用原始文本: ${(e as Error).message}`);
      return { description: content, features: {} };
    }
  }

  /**
   * 生成文本 embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    this.logger.log(
      `正在生成 embedding，文本长度: ${text.length}，模型: ${getAiModels().embedding}，维度: ${getAiModels().embeddingDimensions}`,
    );
    try {
      const embedding = await this.embeddingClient.embedText(text, getEmbeddingOptions());
      this.logger.log(`Embedding 维度: ${embedding.length}`);
      return embedding;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      this.logger.error(`Embedding 失败: ${msg}`);
      throw new BadRequestException(
        'Embedding 模型不可用。请在火山方舟控制台创建 Embedding 推理接入点，' +
          '然后在管理页「AI配置」或 server/.env 设置 SHOES_EMBEDDING_MODEL=ep-xxx 后保存。',
      );
    }
  }

  /**
   * 计算两个向量的余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  /**
   * 生成可访问的图片 URL
   */
  private async getImageUrl(imageKey: string): Promise<string> {
    return this.fileStorage.getPublicUrl(imageKey);
  }

  /**
   * 添加新鞋入库（支持货号、码段、系列名）
   */
  async addShoe(
    imageKey: string,
    name?: string,
    productCode?: string,
    sizeRange?: string,
    seriesName?: string,
  ): Promise<any> {
    if (!imageKey) {
      throw new BadRequestException('请提供图片存储key');
    }

    const imageUrl = await this.getImageUrl(imageKey);

    // 1. LLM 分析鞋面特征
    const { description, features } = await this.analyzeShoeUpper(imageUrl, imageKey);

    // 2. 生成 description 的文本 embedding
    const embedding = await this.generateEmbedding(description);

    // 3. 存入数据库
    const data = await this.shoesRepository.insert({
      name: name || null,
      productCode: productCode || null,
      sizeRange: sizeRange || null,
      seriesName: seriesName || null,
      imageKey,
      description,
      features,
      embedding,
    });

    const resultId = data.id;
    this.logger.log(`鞋子入库成功，ID: ${resultId}, 货号: ${productCode}, 系列: ${seriesName}`);

    return {
      id: resultId,
      name: data.name,
      productCode: data.productCode,
      sizeRange: data.sizeRange,
      seriesName: data.seriesName,
      imageKey,
      imageUrl,
      description,
      features,
    };
  }

  /**
   * 批量导入鞋子数据（从本地文件系统）
   */
  async batchImportShoes(items: BatchImportItem[]): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const item of items) {
      try {
        this.logger.log(`正在处理: ${item.productCode} - ${item.seriesName}`);

        // 1. 读取图片文件
        const fileBuffer = fs.readFileSync(item.imagePath);
        const fileName = path.basename(item.imagePath);

        // 2. 上传到对象存储
        const storageKey = `shoes/${item.seriesName}/${item.sizeRange}/${item.productCode}/${Date.now()}_${fileName}`;
        const actualKey = await this.fileStorage.uploadFile({
          fileContent: fileBuffer,
          fileName: storageKey,
          contentType: 'image/jpeg',
        });

        // 3. 入库（只使用第一张图片，其余跳过）
        await this.addShoe(
          actualKey,
          item.productCode, // name 用货号
          item.productCode,
          item.sizeRange,
          item.seriesName,
        );

        results.success++;
        this.logger.log(`导入成功: ${item.productCode}`);
      } catch (e) {
        results.failed++;
        const errorMsg = `${item.productCode}: ${(e as Error).message}`;
        results.errors.push(errorMsg);
        this.logger.error(`导入失败: ${errorMsg}`);
      }
    }

    this.logger.log(`批量导入完成，成功 ${results.success}，失败 ${results.failed}`);
    return results;
  }

  /**
   * 搜索相似鞋（以图搜图）
   */
  async searchShoe(imageUrl: string, topK: number = 10, seriesName?: string): Promise<SearchResult[]> {
    if (!imageUrl) {
      throw new BadRequestException('请提供要搜索的鞋面图片URL');
    }

    this.logger.log(`搜索请求: topK=${topK}, seriesName=${seriesName || '全部'}`);

    // 1. LLM 分析查询图片的鞋面特征
    const { description: queryDescription } = await this.analyzeShoeUpper(imageUrl);

    // 2. 生成查询图片的 embedding
    const queryEmbedding = await this.generateEmbedding(queryDescription);

    // 3. 从数据库获取鞋子数据，如果指定系列则先筛选
    const allShoes = await this.shoesRepository.findAllForSearch(seriesName);

    if (allShoes.length === 0) {
      this.logger.log(`没有找到符合条件的记录 (seriesName=${seriesName || '全部'})`);
      return [];
    }

    this.logger.log(`找到 ${allShoes.length} 条记录，开始计算相似度...`);

    // 4. 计算余弦相似度并排序
    const results: { id: string; name: string | null; imageKey: string; description: string | null; similarity: number; productCode?: string | null; sizeRange?: string | null; seriesName?: string | null }[] = [];

    for (const shoe of allShoes) {
      if (!shoe.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, shoe.embedding);

      results.push({
        id: shoe.id,
        name: shoe.name,
        imageKey: shoe.imageKey,
        description: shoe.description,
        similarity,
        productCode: shoe.productCode,
        sizeRange: shoe.sizeRange,
        seriesName: shoe.seriesName,
      });
    }

    // 按相似度降序排列
    results.sort((a, b) => b.similarity - a.similarity);

    // 取 topK 并生成图片 URL
    const topResults = results.slice(0, topK);
    const finalResults: SearchResult[] = [];

    for (const result of topResults) {
      const imgUrl = await this.getImageUrl(result.imageKey);
      finalResults.push({
        id: result.id,
        name: result.name,
        imageUrl: imgUrl,
        description: result.description,
        similarity: result.similarity,
        productCode: result.productCode,
        sizeRange: result.sizeRange,
        seriesName: result.seriesName,
      });
    }

    this.logger.log(`搜索完成，找到 ${finalResults.length} 条相似结果`);

    return finalResults;
  }

  /**
   * 获取鞋库列表
   */
  async listShoes(page: number = 1, pageSize: number = 50): Promise<{ shoes: any[]; total: number }> {
    const total = await this.shoesRepository.countAll();
    const data = await this.shoesRepository.listPaginated(page, pageSize);

    const shoes = await Promise.all(
      data.map(async shoe => {
        const imageUrl = await this.getImageUrl(shoe.imageKey);
        return {
          id: shoe.id,
          name: shoe.name,
          productCode: shoe.productCode,
          sizeRange: shoe.sizeRange,
          seriesName: shoe.seriesName,
          image_key: shoe.imageKey,
          imageUrl,
          description: shoe.description,
          features: shoe.features,
          createdAt: shoe.createdAt,
        };
      }),
    );

    return { shoes, total };
  }

  /**
   * 删除鞋子
   */
  async deleteShoe(id: string): Promise<void> {
    const imageKey = await this.shoesRepository.findImageKeyById(id);

    if (!imageKey) {
      throw new BadRequestException('未找到该鞋子');
    }

    if (imageKey) {
      try {
        await this.fileStorage.deleteFile({ fileKey: imageKey });
      } catch (e) {
        this.logger.warn(`存储图片删除失败: ${(e as Error).message}`);
      }
    }

    const deleted = await this.shoesRepository.deleteById(id);
    if (!deleted) {
      throw new BadRequestException('删除失败');
    }

    this.logger.log(`鞋子 ${id} 已删除`);
  }

  /**
   * 解析 ZIP 文件结构，验证是否符合规则：
   * 根目录/        → 系列名（必须只有一个）
   *   二级目录/    → 码段
   *     三级目录/  → 货号
   *       图片.jpg → 每个货号取第一张图片
   */
  parseAndValidateZip(zipBuffer: Buffer): { validation: ZipValidationError; items: BatchImportItem[] } {
    const validation: ZipValidationError = { isValid: false, message: '', details: [] };
    const items: BatchImportItem[] = [];

    try {
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      // 过滤出有效的目录和文件（排除 __MACOSX 和隐藏文件）
      const validEntries = zipEntries.filter(entry => {
        const name = entry.entryName;
        return !name.includes('__MACOSX') && !name.startsWith('.') && !name.includes('/._');
      });

      // 提取目录结构
      const dirs = validEntries.filter(e => e.isDirectory).map(e => e.entryName.replace(/\/$/, ''));
      const files = validEntries.filter(e => !e.isDirectory).map(e => e.entryName);

      this.logger.log(`ZIP 内目录: ${dirs.length} 个，文件: ${files.length} 个`);

      // 验证根目录（必须只有一个系列目录）
      const rootDirs = dirs.filter(d => !d.includes('/'));
      if (rootDirs.length === 0) {
        validation.message = 'ZIP 文件根目录缺少系列名目录';
        validation.details.push('根目录必须包含一个系列名目录（如"双层系列"）');
        return { validation, items };
      }
      if (rootDirs.length > 1) {
        validation.message = 'ZIP 文件根目录有多个系列名目录，请分开上传';
        validation.details.push(`发现多个根目录: ${rootDirs.join(', ')}`);
        validation.details.push('每个 ZIP 只能包含一个系列');
        return { validation, items };
      }

      const seriesName = rootDirs[0];
      validation.details.push(`系列名: ${seriesName}`);

      // 验证二级目录（码段）
      const seriesPath = `${seriesName}/`;
      const sizeDirs = dirs.filter(d => d.startsWith(seriesPath) && d.split('/').length === 2);
      
      if (sizeDirs.length === 0) {
        validation.message = '缺少码段目录';
        validation.details.push(`在 "${seriesName}" 下需要创建码段目录（如 "40-45"）`);
        return { validation, items };
      }

      validation.details.push(`码段: ${sizeDirs.map(d => d.split('/')[1]).join(', ')}`);

      // 验证三级目录（货号）和图片
      const importedProductCodes = new Set<string>();

      for (const sizeDir of sizeDirs) {
        const sizeRange = sizeDir.split('/')[1];
        const sizePath = `${sizeDir}/`;
        
        // 找到该码段下的货号目录
        const productDirs = dirs.filter(d => d.startsWith(sizePath) && d.split('/').length === 3);

        if (productDirs.length === 0) {
          validation.details.push(`警告: 码段 "${sizeRange}" 下没有货号目录`);
          continue;
        }

        for (const productDir of productDirs) {
          const productCode = productDir.split('/')[2];
          const productPath = `${productDir}/`;

          // 找到该货号下的图片文件
          const productImages = files.filter(f => 
            f.startsWith(productPath) && /\.(jpg|jpeg|png|webp)$/i.test(f)
          );

          if (productImages.length === 0) {
            validation.details.push(`警告: 货号 "${productCode}" 下没有图片文件`);
            continue;
          }

          // 检查货号是否重复
          if (importedProductCodes.has(productCode)) {
            validation.details.push(`货号 "${productCode}" 在不同码段中出现，将只导入一次`);
            continue;
          }

          // 取第一张图片
          const firstImage = productImages.sort()[0];
          
          // 提取图片到临时文件
          const entry = zip.getEntry(firstImage);
          if (!entry) continue;

          const tempDir = `/tmp/zip_import_${Date.now()}`;
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempImagePath = path.join(tempDir, path.basename(firstImage));
          fs.writeFileSync(tempImagePath, entry.getData());

          items.push({
            seriesName,
            sizeRange,
            productCode,
            imagePath: tempImagePath,
          });

          importedProductCodes.add(productCode);
        }
      }

      if (items.length === 0) {
        validation.message = 'ZIP 文件中没有有效的鞋款数据';
        validation.details.push('请确保结构符合：系列名/码段/货号/图片.jpg');
        return { validation, items };
      }

      validation.isValid = true;
      validation.message = `解析成功，共发现 ${items.length} 个货号`;
      validation.details.push(`准备导入: ${items.map(i => i.productCode).join(', ')}`);

      return { validation, items };
    } catch (e) {
      validation.message = `ZIP 解析失败: ${(e as Error).message}`;
      return { validation, items };
    }
  }

  /**
   * 从 ZIP 文件批量导入鞋子数据
   */
  async importFromZip(zipBuffer: Buffer): Promise<ZipImportResult> {
    this.logger.log('开始解析 ZIP 文件...');

    const { validation, items } = this.parseAndValidateZip(zipBuffer);

    if (!validation.isValid) {
      throw new BadRequestException(validation.message + '\n' + validation.details.join('\n'));
    }

    this.logger.log(`ZIP 解析成功，共 ${items.length} 个货号，开始导入...`);

    const result = await this.batchImportShoes(items);

    // 清理临时文件
    for (const item of items) {
      try {
        if (fs.existsSync(item.imagePath)) {
          fs.unlinkSync(item.imagePath);
        }
        const tempDir = path.dirname(item.imagePath);
        if (fs.existsSync(tempDir) && tempDir.startsWith('/tmp/zip_import_')) {
          fs.rmSync(tempDir, { recursive: true });
        }
      } catch (e) {
        this.logger.warn(`清理临时文件失败: ${(e as Error).message}`);
      }
    }

    return {
      success: result.success,
      failed: result.failed,
      errors: result.errors,
      totalItems: items.length,
      seriesName: items[0]?.seriesName || '',
    };
  }

  /**
   * 创建异步导入任务
   */
  async createImportTask(zipBuffer: Buffer): Promise<{ taskId: string; validation: ZipValidationError }> {
    const { validation, items } = this.parseAndValidateZip(zipBuffer);

    if (!validation.isValid) {
      return { taskId: '', validation };
    }

    const taskId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const task: ImportTask = {
      taskId,
      status: 'pending',
      progress: 0,
      totalItems: items.length,
      processedItems: 0,
      successCount: 0,
      failedCount: 0,
      seriesName: items[0]?.seriesName || '',
      errors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    importTasks.set(taskId, task);

    // 异步执行导入（不等待）
    this.executeImportTask(taskId, items).catch(e => {
      this.logger.error(`任务 ${taskId} 执行失败: ${(e as Error).message}`);
    });

    return { taskId, validation };
  }

  /**
   * 获取任务状态
   */
  getImportTaskStatus(taskId: string): ImportTask | null {
    return importTasks.get(taskId) || null;
  }

  /**
   * 异步执行导入任务
   */
  private async executeImportTask(taskId: string, items: BatchImportItem[]): Promise<void> {
    const task = importTasks.get(taskId);
    if (!task) return;

    task.status = 'processing';
    task.updatedAt = new Date();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        // 上传图片
        const imageBuffer = fs.readFileSync(item.imagePath);
        const fileName = `shoes/${Date.now()}_${item.productCode}.jpg`;
        const actualKey = await this.fileStorage.uploadFile({
          fileContent: imageBuffer,
          fileName,
          contentType: 'image/jpeg',
        });
        const imageUrl = await this.fileStorage.generatePresignedUrl({
          key: actualKey,
          expireTime: 86400 * 30,
        });

        // AI 分析
        const { description } = await this.analyzeShoeUpper(imageUrl);

        // Embedding
        const embedding = await this.embeddingClient.embedText(description, getEmbeddingOptions());

        await this.shoesRepository.insert({
          name: item.productCode,
          imageKey: actualKey,
          description,
          embedding,
          productCode: item.productCode,
          sizeRange: item.sizeRange,
          seriesName: item.seriesName,
        });

        task.successCount++;
      } catch (e) {
        task.failedCount++;
        task.errors.push(`${item.productCode}: ${(e as Error).message}`);
      }

      task.processedItems = i + 1;
      task.progress = Math.round((task.processedItems / task.totalItems) * 100);
      task.updatedAt = new Date();
    }

    task.status = task.failedCount === task.totalItems ? 'failed' : 'completed';
    task.updatedAt = new Date();

    // 清理临时文件
    for (const item of items) {
      try {
        if (fs.existsSync(item.imagePath)) {
          fs.unlinkSync(item.imagePath);
        }
        const tempDir = path.dirname(item.imagePath);
        if (fs.existsSync(tempDir) && tempDir.startsWith('/tmp/zip_import_')) {
          fs.rmSync(tempDir, { recursive: true });
        }
      } catch (e) {
        this.logger.warn(`清理临时文件失败: ${(e as Error).message}`);
      }
    }

    // 30分钟后清理任务记录
    setTimeout(() => {
      importTasks.delete(taskId);
    }, 30 * 60 * 1000);
  }

  /**
   * 通过 URL 创建导入任务（两步上传方案）
   */
  async createImportTaskFromUrl(fileUrl: string, fileKey: string): Promise<{ taskId: string; totalItems: number; seriesName: string }> {
    this.logger.log(`从 URL 创建导入任务: ${fileUrl.substring(0, 50)}...`);

    // 从 URL 下载文件
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`下载文件失败: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用现有的 createImportTask 方法
    const { taskId, validation } = await this.createImportTask(buffer);
    if (!taskId) {
      throw new Error(validation.message);
    }

    return { taskId, totalItems: validation.details.length, seriesName: validation.details[0] };
  }

  // 单个鞋款入库任务存储
  private addShoeTasks = new Map<string, { status: string; result?: any; error?: string }>();

  /**
   * 异步入库单个鞋款（立即返回任务ID，后台处理AI分析和入库）
   */
  async addShoeAsync(
    imageUrl: string,
    name?: string,
    productCode?: string,
    sizeRange?: string,
    seriesName?: string,
  ): Promise<{ taskId: string }> {
    const taskId = `add_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // 初始化任务状态
    this.addShoeTasks.set(taskId, { status: 'pending' });
    
    // 后台异步处理
    this.processAddShoeAsync(taskId, imageUrl, name, productCode, sizeRange, seriesName).catch(err => {
      this.logger.error(`异步入库失败: ${err.message}`);
      this.addShoeTasks.set(taskId, { status: 'failed', error: err.message });
    });
    
    return { taskId };
  }

  /**
   * 后台处理入库
   */
  private async processAddShoeAsync(
    taskId: string,
    imageUrl: string,
    name?: string,
    productCode?: string,
    sizeRange?: string,
    seriesName?: string,
  ): Promise<void> {
    this.addShoeTasks.set(taskId, { status: 'processing' });
    
    try {
      const prefix = '/api/files/';
      let imageKey = `uploaded_${Date.now()}.jpg`;
      try {
        const urlObj = new URL(imageUrl);
        const idx = urlObj.pathname.indexOf(prefix);
        imageKey =
          idx !== -1
            ? decodeURIComponent(urlObj.pathname.slice(idx + prefix.length))
            : urlObj.pathname.split('/').pop()?.split('?')[0] || imageKey;
      } catch {
        imageKey = imageUrl.split('/').pop()?.split('?')[0] || imageKey;
      }

      // 1. LLM 分析鞋面特征
      this.logger.log(`[${taskId}] 正在分析鞋面图片...`);
      const { description, features } = await this.analyzeShoeUpper(imageUrl, imageKey);
      
      // 2. 生成 embedding
      this.logger.log(`[${taskId}] 正在生成 embedding...`);
      const embedding = await this.generateEmbedding(description);
      
      // 3. 存入数据库
      this.logger.log(`[${taskId}] 正在存入数据库...`);
      const data = await this.shoesRepository.insert({
        name: name || null,
        productCode: productCode || null,
        sizeRange: sizeRange || null,
        seriesName: seriesName || null,
        imageKey,
        description,
        features,
        embedding,
      });

      const resultId = data.id;
      this.logger.log(`[${taskId}] 入库成功，ID: ${resultId}`);

      this.addShoeTasks.set(taskId, {
        status: 'completed',
        result: {
          id: resultId,
          name: data.name,
          productCode: data.productCode,
          sizeRange: data.sizeRange,
          seriesName: data.seriesName,
          imageKey,
          imageUrl,
          description,
        },
      });
    } catch (err: any) {
      this.addShoeTasks.set(taskId, { status: 'failed', error: err.message });
    }
    
    // 30分钟后清理任务记录
    setTimeout(() => {
      this.addShoeTasks.delete(taskId);
    }, 30 * 60 * 1000);
  }

  /**
   * 查询单鞋入库任务状态
   */
  getAddShoeTaskStatus(taskId: string): { status: string; result?: any; error?: string } | null {
    return this.addShoeTasks.get(taskId) || null;
  }
}