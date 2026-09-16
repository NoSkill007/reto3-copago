import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from './qvac.config.json' with { type: 'json' };

const MODEL_FILE = 'Qwen3-4B-Q4_K_M.gguf';
const cacheDirectory = fileURLToPath(new URL('./.cache/models', import.meta.url));
const localModel = fileURLToPath(new URL(`./.cache/models/${MODEL_FILE}`, import.meta.url));

const { model, config: declaredConfig, ...sharedModelOptions } = config.serve.models.copago;
const modelConfig = process.env.QVAC_DEVICE === 'cpu'
  ? { ...declaredConfig, device: 'cpu', gpu_layers: 0 }
  : declaredConfig;

// Un `src` sin barra se resuelve contra `cacheDirectory` y evita la descarga;
// `preload` no vale `true` por omisión en esa forma, a diferencia de `model`.
const copago = existsSync(localModel)
  ? { ...sharedModelOptions, type: 'llm', src: MODEL_FILE, preload: true, config: modelConfig }
  : { ...sharedModelOptions, model, config: modelConfig };

export default {
  ...config,
  cacheDirectory,
  serve: { ...config.serve, models: { ...config.serve.models, copago } }
};
