import { createServer } from './src/app.mjs';
const extraOrigins = (process.env.EXTRA_ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
const allowedOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000', ...extraOrigins];
createServer({ allowedOrigins }).listen(3000, '0.0.0.0', () => console.log('Copago: http://127.0.0.1:3000'));
