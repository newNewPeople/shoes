import { Config, EmbeddingClient, LLMClient } from 'coze-coding-dev-sdk';
import {
  maskApiKey,
  resolveAiApiKey,
  resolveEmbeddingModel,
  resolveLlmModel,
} from '@/config/runtime-config.store';

const DEFAULT_ARK_HOST = 'https://ark.cn-beijing.volces.com';
const DEFAULT_MODEL_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_EMBEDDING_DIMENSIONS = 2048;

/** 火山方舟 AI 配置（页面配置 > 环境变量 > 默认值） */
export function createAiConfig(): Config {
  const { key: apiKey } = resolveAiApiKey();
  const modelBaseUrl =
    process.env.SHOES_AI_MODEL_BASE_URL || DEFAULT_MODEL_BASE_URL;
  return new Config({
    apiKey,
    baseUrl: process.env.SHOES_AI_BASE_URL || DEFAULT_ARK_HOST,
    modelBaseUrl,
    timeout: Number(process.env.SHOES_AI_TIMEOUT ?? 120_000),
  });
}

export function getAiModels() {
  const llm = resolveLlmModel();
  const embedding = resolveEmbeddingModel();
  return {
    llm: llm.value,
    llmSource: llm.source,
    embedding: embedding.value,
    embeddingSource: embedding.source,
    embeddingDimensions: Number(
      process.env.SHOES_EMBEDDING_DIMENSIONS ?? DEFAULT_EMBEDDING_DIMENSIONS,
    ),
  };
}

export function getLlmInvokeOptions() {
  const models = getAiModels();
  return {
    model: models.llm,
    temperature: Number(process.env.SHOES_LLM_TEMPERATURE ?? 0.1),
  };
}

export function getEmbeddingOptions():
  | { model?: string; dimensions?: number }
  | undefined {
  const models = getAiModels();
  const options: { model?: string; dimensions?: number } = {};
  if (models.embedding) {
    options.model = models.embedding;
  }
  if (models.embeddingDimensions > 0) {
    options.dimensions = models.embeddingDimensions;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

export function createAiClients(): {
  config: Config;
  llmClient: LLMClient;
  embeddingClient: EmbeddingClient;
} {
  const config = createAiConfig();
  return {
    config,
    llmClient: new LLMClient(config),
    embeddingClient: new EmbeddingClient(config),
  };
}

const modelSourceLabels = {
  runtime: '页面配置',
  env: '环境变量',
  default: '内置默认',
} as const;

const keySourceLabels = {
  runtime: '页面配置',
  env: 'SHOES_AI_API_KEY',
  none: '未配置',
} as const;

/** 启动日志用，不输出完整 Key */
export function describeAiConfig(): string {
  const { key: apiKey, source: keySource } = resolveAiApiKey();
  const models = getAiModels();
  const maskedKey = apiKey ? maskApiKey(apiKey) : '无';

  return [
    `AI Key 来源: ${keySourceLabels[keySource]} (${maskedKey})`,
    `modelBaseUrl: ${process.env.SHOES_AI_MODEL_BASE_URL || DEFAULT_MODEL_BASE_URL}`,
    `LLM: ${models.llm} (${modelSourceLabels[models.llmSource]})`,
    `Embedding: ${models.embedding} (${modelSourceLabels[models.embeddingSource]})`,
    `Embedding 维度: ${models.embeddingDimensions}`,
  ].join(', ');
}
