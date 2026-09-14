import { fileURLToPath } from 'node:url';
import config from './qvac.config.json' with { type: 'json' };
const cpuFallback = process.env.QVAC_DEVICE === 'cpu';
const modelConfig = cpuFallback
  ? { ...config.serve.models.copago.config, device: 'cpu', gpu_layers: 0 }
  : config.serve.models.copago.config;

export default {
  ...config,
  cacheDirectory: fileURLToPath(new URL('./.cache/models', import.meta.url)),
  serve: { ...config.serve, models: { ...config.serve.models, copago: { ...config.serve.models.copago, config: modelConfig } } }
};
