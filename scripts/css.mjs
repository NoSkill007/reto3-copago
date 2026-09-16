// Compiles src/styles/app.css into public/style.css. `--watch` rebuilds on every source edit.
//
// Tailwind's own --watch depends on @parcel/watcher, whose native build is blocked wherever npm
// allowScripts is restricted, and it then fails silently. We run one-shot builds and watch here.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const tailwindCli = fileURLToPath(new URL('../node_modules/@tailwindcss/cli/dist/index.mjs', import.meta.url));
const input = fileURLToPath(new URL('../src/styles/app.css', import.meta.url));
const output = fileURLToPath(new URL('../public/style.css', import.meta.url));
const watched = [new URL('../public/', import.meta.url), new URL('../src/styles/', import.meta.url)];
const isGenerated = filename => filename === 'style.css';

export function buildCss() {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [tailwindCli, '--input', input, '--output', output], { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', code => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export async function watchCss() {
  let building = false;
  let queued = false;

  const run = async () => {
    if (building) { queued = true; return; }
    building = true;
    const ok = await buildCss();
    building = false;
    console.log(ok ? '[css] style.css reconstruido' : '[css] no se pudo reconstruir style.css');
    if (queued) { queued = false; await run(); }
  };

  await Promise.all(watched.map(async directory => {
    for await (const event of watch(fileURLToPath(directory), { recursive: true })) {
      if (/\.(html|js|css)$/.test(event.filename ?? '') && !isGenerated(event.filename)) void run();
    }
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await buildCss();
  if (!ok) process.exitCode = 1;
  else console.log('[css] style.css generado');
  if (process.argv.includes('--watch')) await watchCss();
}
