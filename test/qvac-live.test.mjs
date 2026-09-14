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

async function startCase(base) {
  const response = await fetch(`${base}/api/case`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'esencial' }) });
  return response.json();
}

async function send(base, caseId, text) {
  const response = await fetch(`${base}/api/case/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, text, turnId: crypto.randomUUID() }) });
  return response.json();
}

test('contrato opt-in: QVAC local maneja escenarios críticos sin filtrar precios inseguros', { skip: !enabled && 'Define QVAC_LIVE_TEST=1 con npm start ejecutándose.' }, async t => {
  await withServer(t, async base => {
    const skinCase = await startCase(base);
    const skin = await send(base, skinCase.caseId, 'Tengo picazón en la piel desde hace tres días');
    assert.notEqual(skin.recovery?.reason, 'invalid_response');
    assert.equal(skin.urgent, undefined);

    const childCase = await startCase(base);
    const safety = await send(base, childCase.caseId, 'Mi hijo de 5 años tiene fiebre');
    assert.equal(safety.safety?.kind, 'child_fever');
    const child = await send(base, childCase.caseId, 'No tiene dificultad para respirar, no ha convulsionado y toma líquidos.');
    assert.notEqual(child.urgent, true);
    assert.notEqual(child.recovery?.reason, 'invalid_response');

    const urgentCase = await startCase(base);
    const urgent = await send(base, urgentCase.caseId, 'Tengo dolor de pecho y me cuesta respirar');
    assert.equal(urgent.urgent, true);
    assert.equal(urgent.rows, undefined);
  });
});
