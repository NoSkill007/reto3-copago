import { fileURLToPath } from 'node:url';
import config from './qvac.config.json' with { type: 'json' };
export default { ...config, cacheDirectory: fileURLToPath(new URL('./.cache/models', import.meta.url)) };
