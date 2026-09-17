import { createServer } from './src/app.mjs';
createServer().listen(3000, '0.0.0.0', () => console.log('Copago: http://127.0.0.1:3000'));
