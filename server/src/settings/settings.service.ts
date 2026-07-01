import { Injectable, Logger } from '@nestjs/common';
import { describeAiConfig, getAiModels } from '@/config/ai.config';
import {
  clearRuntimeAiConfig,
  getRuntimeAiApiKey,
  getRuntimeEmbeddingModel,
  getRuntimeLlmModel,
  hasRuntimeAiOverride,
  maskApiKey,
  reloadRuntimeConfig,
  resolveAiApiKey,
  resolveEmbeddingModel,
  resolveLlmModel,
  setRuntimeAiApiKey,
  setRuntimeEmbeddingModel,
  setRuntimeLlmModel,
} from '@/config/runtime-config.store';
import { ShoesService } from '@/shoes/shoes.service';

export interface AiSettingsView {
  apiKeyMasked: string;
  apiKeyConfigured: boolean;
  source: 'runtime' | 'env' | 'none';
  sourceLabel: string;
  hasRuntimeOverride: boolean;
  hasRuntimeKeyOverride: boolean;
  hasRuntimeLlmOverride: boolean;
  hasRuntimeEmbeddingOverride: boolean;
  modelBaseUrl: string;
  llmModel: string;
  llmModelSource: 'runtime' | 'env' | 'default';
  llmModelSourceLabel: string;
  embeddingModel: string;
  embeddingModelSource: 'runtime' | 'env' | 'default';
  embeddingModelSourceLabel: string;
  embeddingDimensions: number;
}

export interface UpdateAiSettingsInput {
  apiKey?: string;
  llmModel?: string;
  embeddingModel?: string;
  clearRuntime?: boolean;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly shoesService: ShoesService) {}

  private modelSourceLabels = {
    runtime: '页面配置（优先）',
    env: '环境变量',
    default: '内置默认',
  } as const;

  getAiSettings(): AiSettingsView {
    const { key, source } = resolveAiApiKey();
    const llm = resolveLlmModel();
    const embedding = resolveEmbeddingModel();
    const sourceLabels = {
      runtime: '页面配置（优先）',
      env: '环境变量 SHOES_AI_API_KEY',
      none: '未配置',
    };

    return {
      apiKeyMasked: key ? maskApiKey(key) : '',
      apiKeyConfigured: Boolean(key),
      source,
      sourceLabel: sourceLabels[source],
      hasRuntimeOverride: hasRuntimeAiOverride(),
      hasRuntimeKeyOverride: Boolean(getRuntimeAiApiKey()),
      hasRuntimeLlmOverride: Boolean(getRuntimeLlmModel()),
      hasRuntimeEmbeddingOverride: Boolean(getRuntimeEmbeddingModel()),
      modelBaseUrl:
        process.env.SHOES_AI_MODEL_BASE_URL ||
        'https://ark.cn-beijing.volces.com/api/v3',
      llmModel: llm.value,
      llmModelSource: llm.source,
      llmModelSourceLabel: this.modelSourceLabels[llm.source],
      embeddingModel: embedding.value,
      embeddingModelSource: embedding.source,
      embeddingModelSourceLabel: this.modelSourceLabels[embedding.source],
      embeddingDimensions: getAiModels().embeddingDimensions,
    };
  }

  updateAiSettings(input: UpdateAiSettingsInput): AiSettingsView {
    if (input.clearRuntime) {
      clearRuntimeAiConfig();
    } else {
      if (input.apiKey !== undefined) {
        setRuntimeAiApiKey(input.apiKey || undefined);
      }
      if (input.llmModel !== undefined) {
        setRuntimeLlmModel(input.llmModel || undefined);
      }
      if (input.embeddingModel !== undefined) {
        setRuntimeEmbeddingModel(input.embeddingModel || undefined);
      }
    }

    reloadRuntimeConfig();
    this.shoesService.reloadAiClients();
    this.logger.log(`AI 配置已更新: ${describeAiConfig()}`);
    return this.getAiSettings();
  }

  async testAiConnection(): Promise<{ ok: boolean; message: string }> {
    const { key } = resolveAiApiKey();
    if (!key) {
      return { ok: false, message: '未配置 API Key' };
    }

    try {
      const response = await fetch('https://ark.cn-beijing.volces.com/ping', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, message: `连接失败 (${response.status}): ${text}` };
      }
      return { ok: true, message: text || '连接成功' };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }
}
