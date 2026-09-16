// Comprobación de humo opt-in: confirma que un turno completo llega hasta el
// modelo local y vuelve con una respuesta utilizable. La calidad del
// comportamiento del modelo la mide `npm run eval:extraction`, que es más
// honesto al respecto que una afirmación binaria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/app.mjs';

const enabled = process.env.QVAC_LIVE_TEST === '1';

async function withServer(t, fn) {
  const server = createServer().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  await fn(`http://127.0.0.1:${server.address().port}`);
}

test('humo opt-in: un turno real contra QVAC devuelve orientación o pregunta, nunca una falla', { skip: !enabled && 'Define QVAC_LIVE_TEST=1 con npm start ejecutándose.' }, async t => {
  await withServer(t, async base => {
    const created = await fetch(`${base}/api/case`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'esencial' }) }).then(r => r.json());
    const result = await fetch(`${base}/api/case/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: created.caseId, text: 'Tengo unas ronchas que me pican mucho en el brazo desde ayer', turnId: crypto.randomUUID() })
    }).then(r => r.json());

    assert.equal(result.recovery, undefined);
    assert.ok(result.rows || result.question, 'el turno debe terminar en una comparación o en una pregunta');
    if (result.rows) assert.equal(result.rows.find(row => row.id === 'ceiba').copay, 1500);
  });
});
