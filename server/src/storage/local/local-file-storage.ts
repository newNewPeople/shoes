import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';
import { getPublicBaseUrl } from '@/storage/database/database.config';

@Injectable()
export class LocalFileStorage {
  private readonly logger = new Logger(LocalFileStorage.name);
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = resolve(process.cwd(), 'data/uploads');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
    this.logger.log(`本地存储目录: ${this.uploadDir}`);
  }

  private resolveSafePath(fileKey: string): string {
    const normalized = normalize(fileKey).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = resolve(this.uploadDir, normalized);
    if (!fullPath.startsWith(this.uploadDir)) {
      throw new Error('非法文件路径');
    }
    return fullPath;
  }

  async uploadFile(options: {
    fileContent: Buffer;
    fileName: string;
    contentType?: string;
  }): Promise<string> {
    const filePath = this.resolveSafePath(options.fileName);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, options.fileContent);
    return options.fileName;
  }

  getPublicUrl(key: string): string {
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${getPublicBaseUrl()}/api/files/${encoded}`;
  }

  /** 兼容原 S3Storage 调用 */
  async generatePresignedUrl(options: { key: string; expireTime?: number }): Promise<string> {
    void options.expireTime;
    return this.getPublicUrl(options.key);
  }

  async deleteFile(options: { fileKey: string }): Promise<void> {
    const filePath = this.resolveSafePath(options.fileKey);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  async readFile(options: { fileKey: string }): Promise<Buffer> {
    const filePath = this.resolveSafePath(options.fileKey);
    return readFileSync(filePath);
  }
}
