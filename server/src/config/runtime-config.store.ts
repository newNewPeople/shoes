import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

interface RuntimeConfig {
  shoesAiApiKey?: string;
  shoesLlmModel?: string;
  shoesEmbeddingModel?: string;
}

const CONFIG_PATH = resolve(process.cwd(), 'data/runtime-config.json');

const DEFAULT_LLM_MODEL = 'doubao-seed-2-0-pro-260215';
const DEFAULT_EMBEDDING_MODEL = 'doubao-embedding-text-240715';

let cache: RuntimeConfig | null = null;

function ensureConfigDir(): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readConfigFile(): RuntimeConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as RuntimeConfig;
  } catch {
    return {};
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  if (!cache) {
    cache = readConfigFile();
  }
  return cache;
}

export function reloadRuntimeConfig(): RuntimeConfig {
  cache = readConfigFile();
  return cache;
}

export function getRuntimeAiApiKey(): string | undefined {
  const key = loadRuntimeConfig().shoesAiApiKey?.trim();
  return key || undefined;
}

export function getRuntimeLlmModel(): string | undefined {
  const value = loadRuntimeConfig().shoesLlmModel?.trim();
  return value || undefined;
}

export function getRuntimeEmbeddingModel(): string | undefined {
  const value = loadRuntimeConfig().shoesEmbeddingModel?.trim();
  return value || undefined;
}

export function hasRuntimeAiOverride(): boolean {
  const config = loadRuntimeConfig();
  return Boolean(
    config.shoesAiApiKey?.trim() ||
      config.shoesLlmModel?.trim() ||
      config.shoesEmbeddingModel?.trim(),
  );
}

function writeConfig(config: RuntimeConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cache = { ...config };
}

export function setRuntimeAiApiKey(apiKey: string | undefined): void {
  const config = loadRuntimeConfig();
  const trimmed = apiKey?.trim();
  if (trimmed) {
    config.shoesAiApiKey = trimmed;
  } else {
    delete config.shoesAiApiKey;
  }
  writeConfig(config);
}

export function setRuntimeLlmModel(model: string | undefined): void {
  const config = loadRuntimeConfig();
  const trimmed = model?.trim();
  if (trimmed) {
    config.shoesLlmModel = trimmed;
  } else {
    delete config.shoesLlmModel;
  }
  writeConfig(config);
}

export function setRuntimeEmbeddingModel(model: string | undefined): void {
  const config = loadRuntimeConfig();
  const trimmed = model?.trim();
  if (trimmed) {
    config.shoesEmbeddingModel = trimmed;
  } else {
    delete config.shoesEmbeddingModel;
  }
  writeConfig(config);
}

export function clearRuntimeAiConfig(): void {
  writeConfig({});
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '***';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export type AiKeySource = 'runtime' | 'env' | 'none';
export type AiModelSource = 'runtime' | 'env' | 'default';

export function resolveAiApiKey(): { key: string; source: AiKeySource } {
  const runtimeKey = getRuntimeAiApiKey();
  if (runtimeKey) {
    return { key: runtimeKey, source: 'runtime' };
  }
  if (process.env.SHOES_AI_API_KEY?.trim()) {
    return { key: process.env.SHOES_AI_API_KEY.trim(), source: 'env' };
  }
  return { key: '', source: 'none' };
}

export function resolveLlmModel(): { value: string; source: AiModelSource } {
  const runtime = getRuntimeLlmModel();
  if (runtime) {
    return { value: runtime, source: 'runtime' };
  }
  if (process.env.SHOES_LLM_MODEL?.trim()) {
    return { value: process.env.SHOES_LLM_MODEL.trim(), source: 'env' };
  }
  return { value: DEFAULT_LLM_MODEL, source: 'default' };
}

export function resolveEmbeddingModel(): { value: string; source: AiModelSource } {
  const runtime = getRuntimeEmbeddingModel();
  if (runtime) {
    return { value: runtime, source: 'runtime' };
  }
  if (process.env.SHOES_EMBEDDING_MODEL?.trim()) {
    return { value: process.env.SHOES_EMBEDDING_MODEL.trim(), source: 'env' };
  }
  return { value: DEFAULT_EMBEDDING_MODEL, source: 'default' };
}
