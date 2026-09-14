import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const qvacCli = fileURLToPath(new URL('../node_modules/@qvac/cli/dist/index.js', import.meta.url));
const qvacConfig = fileURLToPath(new URL('../qvac.config.mjs', import.meta.url));
const webServer = fileURLToPath(new URL('../server.mjs', import.meta.url));
const children = new Set();
const qvacBase = 'http://127.0.0.1:11435/v1';
const qvacStartupTimeoutMs = 95_000;
let shuttingDown = false;

console.log('[inicio] Iniciando la aplicación en http://127.0.0.1:3000');
const webProcess = launch('la aplicación web', process.execPath, [webServer]);
webProcess.on('exit', code => {
  children.delete(webProcess);
  if (!shuttingDown) shutdown(code ?? 1);
});
webProcess.on('error', error => {
  children.delete(webProcess);
  if (!shuttingDown) {
    console.error(`[inicio] No se pudo iniciar la aplicación web: ${error.message}`);
    shutdown(1);
  }
});

let qvacProcess = null;
if (await ensureDependencies()) {
  if (await qvacIsReady()) {
    console.log('[inicio] QVAC ya está disponible en 127.0.0.1:11435; se reutilizará.');
  } else {
    void startQvacWithFallback();
  }
} else {
  console.warn('[inicio] QVAC no está disponible. La web seguirá activa, pero no orientará ni calculará precios.');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function ensureDependencies() {
  try {
    await access(qvacCli);
    return true;
  } catch {
    console.log('[inicio] Instalando dependencias con npm ci...');
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
      const code = await run(npmCommand, ['ci'], { shell: process.platform === 'win32' });
      if (code === 0) return true;
      console.warn(`[inicio] npm ci terminó con código ${code}.`);
    } catch (error) {
      console.warn(`[inicio] No se pudieron instalar las dependencias de QVAC: ${error.message}`);
    }
    return false;
  }
}

async function qvacModelState() {
  try {
    const response = await fetch(`${qvacBase}/models`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return 'unavailable';
    const body = await response.json();
    return body.data?.find(model => model.id === 'copago')?.state ?? 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function qvacIsReady() {
  return (await qvacModelState()) === 'ready';
}

async function startQvacWithFallback() {
  const gpuReady = await startAndWaitForQvac('gpu');
  if (gpuReady || shuttingDown) return;
  console.warn('[inicio] QVAC no pudo iniciar con GPU. Reintentando una vez con CPU compatible...');
  await stopQvac();
  const cpuReady = await startAndWaitForQvac('cpu');
  if (!cpuReady && !shuttingDown) console.error('[inicio] QVAC no pudo iniciar ni con GPU ni con CPU. Ejecuta `npm run qvac:doctor -- --deep --verbose`.');
}

async function startAndWaitForQvac(device) {
  console.log(`[inicio] Iniciando QVAC con ${device === 'cpu' ? 'CPU compatible' : 'preferencia GPU'}...`);
  qvacProcess = launch('QVAC', process.execPath, [qvacCli, 'serve', '--openai', '--port', '11435', '--config', qvacConfig], { env: { ...process.env, QVAC_DEVICE: device } });
  qvacProcess.on('exit', code => {
    children.delete(qvacProcess);
    if (!shuttingDown) console.warn(`[inicio] QVAC terminó con código ${code ?? 'desconocido'}.`);
  });
  const deadline = Date.now() + qvacStartupTimeoutMs;
  while (!shuttingDown && Date.now() < deadline) {
    const state = await qvacModelState();
    if (state === 'ready') {
      console.log(`[inicio] QVAC y el modelo copago están listos (${device}).`);
      return true;
    }
    if (state === 'error') {
      console.warn(`[inicio] El modelo copago informó error durante el arranque (${device}).`);
      return false;
    }
    await delay(1000);
  }
  console.warn(`[inicio] QVAC no quedó listo en ${qvacStartupTimeoutMs / 1000} segundos (${device}).`);
  return false;
}

async function stopQvac() {
  if (!qvacProcess) return;
  qvacProcess.kill('SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && (await qvacModelState()) !== 'unavailable') await delay(200);
  children.delete(qvacProcess);
  qvacProcess = null;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function launch(name, command, args, options = {}) {
  const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
  child.once('error', error => console.error(`[inicio] Error al iniciar ${name}: ${error.message}`));
  children.add(child);
  return child;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = exitCode;
}
