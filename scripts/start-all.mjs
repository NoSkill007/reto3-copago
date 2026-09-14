import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const qvacCli = fileURLToPath(new URL('../node_modules/@qvac/cli/dist/index.js', import.meta.url));
const qvacConfig = fileURLToPath(new URL('../qvac.config.mjs', import.meta.url));
const webServer = fileURLToPath(new URL('../server.mjs', import.meta.url));
const children = new Set();
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
  if (await qvacIsReachable()) {
    console.log('[inicio] QVAC ya está disponible en 127.0.0.1:11435; se reutilizará.');
  } else {
    console.log('[inicio] Iniciando QVAC. La primera ejecución puede descargar el modelo...');
    qvacProcess = launch('QVAC', process.execPath, [qvacCli, 'serve', '--openai', '--port', '11435', '--config', qvacConfig]);
    qvacProcess.on('exit', code => {
      children.delete(qvacProcess);
      if (!shuttingDown) console.warn(`[inicio] QVAC terminó con código ${code ?? 'desconocido'}. La web continuará en modo de reglas.`);
    });
    qvacProcess.on('error', error => {
      children.delete(qvacProcess);
      if (!shuttingDown) console.warn(`[inicio] No se pudo iniciar QVAC: ${error.message}. La web continuará en modo de reglas.`);
    });
  }
} else {
  console.warn('[inicio] QVAC no está disponible. La web continuará en modo de reglas.');
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

async function qvacIsReachable() {
  try {
    const response = await fetch('http://127.0.0.1:11435/v1/models', { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const body = await response.json();
    return body.data?.some(model => model.id === 'copago') === true;
  } catch {
    return false;
  }
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
