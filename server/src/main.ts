import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import * as express from 'express';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { HttpStatusInterceptor } from '@/interceptors/http-status.interceptor';
import { describeAiConfig } from '@/config/ai.config';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

function parsePort(): number {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('-p');
  if (portIndex !== -1 && args[portIndex + 1]) {
    const port = parseInt(args[portIndex + 1], 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      return port;
    }
  }
  return 3000;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const uploadDir = resolve(process.cwd(), 'data/uploads');
  app.use('/api/files', express.static(uploadDir));

  app.setGlobalPrefix('api');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 全局拦截器：统一将 POST 请求的 201 状态码改为 200
  app.useGlobalInterceptors(new HttpStatusInterceptor());
  // 1. 开启优雅关闭 Hooks (关键!)
  app.enableShutdownHooks();

  // 2. 解析端口
  const port = parsePort();
  try {
    await app.listen(port);
    console.log(`Server running on http://localhost:${port}`);
    console.log(`AI 配置: ${describeAiConfig()}`);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ 端口 ${port} 被占用! 请运行 'npx kill-port ${port}' 然后重试。`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}
bootstrap();
