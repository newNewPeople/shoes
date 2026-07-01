import { Controller, Post, Get, Delete, Param, UseInterceptors, UploadedFile, Body, Query, HttpCode } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ShoesService, BatchImportItem, ZipImportResult, ZipValidationError } from './shoes.service';

@Controller('shoes')
export class ShoesController {
  constructor(private readonly shoesService: ShoesService) {}

  /**
   * 上传图片/文件，返回可访问 URL + 存储 Key
   */
  @Post('upload-temp')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadTemp(@UploadedFile() file: Express.Multer.File) {
    console.log('[ShoesController] uploadTemp - 收到文件:', file?.originalname, 'size:', file?.buffer?.length);
    if (!file || !file.buffer) {
      return { code: 400, msg: '请上传文件', data: null };
    }
    const result = await this.shoesService.uploadTempImage(file);
    return { code: 200, msg: '上传成功', data: result };
  }

  /**
   * 上传 base64 图片，返回可访问 URL + 存储 Key
   * 用于前端解压ZIP后直接发送图片数据
   */
  @Post('upload-base64')
  @HttpCode(200)
  async uploadBase64(@Body() body: { base64Data: string; fileName?: string }) {
    console.log('[ShoesController] uploadBase64 - 收到 base64 图片:', body.fileName, '数据长度:', body.base64Data?.length);
    if (!body.base64Data) {
      return { code: 400, msg: '请提供图片 base64 数据', data: null };
    }
    const result = await this.shoesService.uploadBase64Image(body.base64Data, body.fileName);
    return { code: 200, msg: '上传成功', data: result };
  }

  /**
   * 拍照入库 - 添加新鞋（支持货号、码段、系列名）
   */
  @Post('add')
  @HttpCode(200)
  async addShoe(
    @Body() body: { imageKey: string; name?: string; productCode?: string; sizeRange?: string; seriesName?: string },
  ) {
    console.log('[ShoesController] addShoe - 收到入库请求', {
      name: body.name,
      productCode: body.productCode,
      sizeRange: body.sizeRange,
      seriesName: body.seriesName,
      imageKey: body.imageKey?.substring(0, 30),
    });
    if (!body.imageKey) {
      return { code: 400, msg: '请提供图片存储key', data: null };
    }
    const result = await this.shoesService.addShoe(
      body.imageKey,
      body.name,
      body.productCode,
      body.sizeRange,
      body.seriesName,
    );
    return { code: 200, msg: '入库成功', data: result };
  }

  /**
   * 异步入库单个鞋款（立即返回任务ID，后台处理）
   * 用于避免前端请求超时
   */
  @Post('add-async')
  @HttpCode(200)
  async addShoeAsync(@Body() body: { imageUrl: string; name?: string; productCode?: string; sizeRange?: string; seriesName?: string }) {
    console.log('[ShoesController] addShoeAsync - 收到请求:', body.productCode, body.seriesName);
    if (!body.imageUrl) {
      return { code: 400, msg: '请提供图片URL', data: null };
    }
    const result = await this.shoesService.addShoeAsync(
      body.imageUrl,
      body.name,
      body.productCode,
      body.sizeRange,
      body.seriesName,
    );
    return { code: 200, msg: '已创建入库任务', data: result };
  }

  /**
   * 查询异步入库任务状态
   */
  @Get('add-status/:taskId')
  async getAddShoeStatus(@Param('taskId') taskId: string) {
    const status = this.shoesService.getAddShoeTaskStatus(taskId);
    if (!status) {
      return { code: 404, msg: '任务不存在', data: null };
    }
    return { code: 200, msg: '查询成功', data: status };
  }

  /**
   * ZIP 文件批量导入
   * 结构要求：根目录（系列名）→ 二级目录（码段）→ 三级目录（货号）→ 图片
   */
  @Post('import-zip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  }))
  async importZip(@UploadedFile() file: Express.Multer.File): Promise<{ code: number; msg: string; data: ZipImportResult | ZipValidationError | null }> {
    console.log('[ShoesController] importZip - 收到 ZIP 文件:', file?.originalname, 'size:', file?.buffer?.length);
    
    if (!file || !file.buffer) {
      return { code: 400, msg: '请上传 ZIP 文件', data: null };
    }

    // 检查是否是 ZIP 文件
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      return { code: 400, msg: '请上传 ZIP 格式文件', data: null };
    }

    try {
      // 先解析和验证结构
      const { validation } = this.shoesService.parseAndValidateZip(file.buffer);
      
      if (!validation.isValid) {
        // 结构不符合，返回详细错误信息
        return {
          code: 400,
          msg: validation.message,
          data: {
            isValid: false,
            message: validation.message,
            details: validation.details,
          },
        };
      }

      // 结构正确，执行导入
      const result = await this.shoesService.importFromZip(file.buffer);
      
      return {
        code: 200,
        msg: `导入完成，成功 ${result.success} 条，失败 ${result.failed} 条`,
        data: result,
      };
    } catch (e) {
      console.error('[ShoesController] importZip - 导入失败:', (e as Error).message);
      return {
        code: 500,
        msg: `导入失败: ${(e as Error).message}`,
        data: null,
      };
    }
  }

  /**
   * 批量导入鞋子数据（用于内部调用）
   */
  @Post('batch-import')
  @HttpCode(200)
  async batchImport(@Body() body: { items: BatchImportItem[] }) {
    console.log('[ShoesController] batchImport - 收到批量导入请求，数量:', body.items?.length);
    if (!body.items || body.items.length === 0) {
      return { code: 400, msg: '请提供导入数据', data: null };
    }
    const result = await this.shoesService.batchImportShoes(body.items);
    return { code: 200, msg: '批量导入完成', data: result };
  }

  /**
   * 以图搜图 - 搜索相似鞋
   */
  @Post('search')
  @HttpCode(200)
  async searchShoe(@Body() body: { imageUrl: string; topK?: number; seriesName?: string }) {
    console.log('[ShoesController] searchShoe - 收到搜索请求, seriesName:', body.seriesName);
    if (!body.imageUrl) {
      return { code: 400, msg: '请提供图片URL', data: null };
    }
    const results = await this.shoesService.searchShoe(body.imageUrl, body.topK || 10, body.seriesName);
    return { code: 200, msg: '搜索完成', data: results };
  }

  /**
   * 获取鞋库列表
   */
  @Get('list')
  @HttpCode(200)
  async listShoes(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    console.log('[ShoesController] listShoes - 收到列表请求, page:', page, 'pageSize:', pageSize);
    const p = page ? parseInt(page, 10) : 1;
    const s = pageSize ? parseInt(pageSize, 10) : 50;
    const result = await this.shoesService.listShoes(p, s);
    return { code: 200, msg: 'success', data: result };
  }

  /**
   * 删除鞋子
   */
  @Delete(':id')
  @HttpCode(200)
  async deleteShoe(@Param('id') id: string) {
    console.log('[ShoesController] deleteShoe - 收到删除请求, id:', id);
    await this.shoesService.deleteShoe(id);
    return { code: 200, msg: '删除成功' };
  }

  /**
   * 异步导入 ZIP 文件（避免超时）
   */
  @Post('import-zip-async')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async importZipAsync(@UploadedFile() file: Express.Multer.File) {
    console.log('[ShoesController] importZipAsync - 收到异步导入请求');
    if (!file) {
      return { code: 400, msg: '请上传 ZIP 文件', data: null };
    }

    try {
      const { taskId, validation } = await this.shoesService.createImportTask(file.buffer);

      if (!taskId) {
        return {
          code: 400,
          msg: validation.message,
          data: {
            isValid: false,
            message: validation.message,
            details: validation.details,
          },
        };
      }

      return {
        code: 200,
        msg: '任务已创建，正在后台处理',
        data: { taskId, totalItems: validation.details.length, seriesName: validation.details[0] },
      };
    } catch (e) {
      console.error('[ShoesController] importZipAsync - 创建任务失败:', (e as Error).message);
      return { code: 500, msg: `创建任务失败: ${(e as Error).message}`, data: null };
    }
  }

  /**
   * 查询导入任务状态
   */
  @Get('import-status/:taskId')
  async getImportStatus(@Param('taskId') taskId: string) {
    console.log('[ShoesController] getImportStatus - 查询任务状态:', taskId);
    const task = this.shoesService.getImportTaskStatus(taskId);

    if (!task) {
      return { code: 404, msg: '任务不存在或已过期', data: null };
    }

    return { code: 200, msg: '查询成功', data: task };
  }

  /**
   * 通过 URL 异步导入 ZIP（两步上传方案）
   * 先用 upload-temp 上传 ZIP 获取 URL，再调用此接口处理
   */
  @Post('import-zip-url')
  @HttpCode(200)
  async importZipByUrl(@Body() body: { fileUrl: string; fileKey: string }) {
    console.log('[ShoesController] importZipByUrl - 收到URL:', body.fileUrl?.substring(0, 50));
    if (!body.fileUrl || !body.fileKey) {
      return { code: 400, msg: '请提供 fileUrl 和 fileKey', data: null };
    }
    try {
      const result = await this.shoesService.createImportTaskFromUrl(body.fileUrl, body.fileKey);
      return { code: 200, msg: '任务已创建', data: result };
    } catch (e) {
      console.error('[ShoesController] importZipByUrl - 创建任务失败:', (e as Error).message);
      return { code: 500, msg: `创建任务失败: ${(e as Error).message}`, data: null };
    }
  }
}