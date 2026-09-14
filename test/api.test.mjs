import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/app.mjs';

const QVAC_BASE = 'http://127.0.0.1:11434';

function mockQvac(chatResponses) {
  const realFetch = globalThis.fetch;
  let call = 0;
  return mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (String(url).includes('/models')) return Response.json({ data: [{ id: 'copago', state: 'ready' }] });
    const content = typeof chatResponses === 'function' ? chatResponses(call) : chatResponses[Math.min(call, chatResponses.length - 1)];
    call++;
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  });
}

async function withServer(t, fn) {
  const server = createServer().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());
  try { await fn(base); } finally { /* no-op */ }
}

async function startCase(base, plan) {
  const response = await fetch(`${base}/api/case`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
  return { status: response.status, body: await response.json() };
}

async function sendMessage(base, caseId, text) {
  const response = await fetch(`${base}/api/case/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, text }) });
  return { status: response.status, body: await response.json() };
}

test('regresión: Esencial/dermatología/La Ceiba cuesta USD 25 y ordena la red por menor gasto', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology', explanation: 'Comparamos tu orientación y estimación.' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    assert.equal(created.status, 201);
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.status, 200);
    assert.equal(result.body.explanation.source, 'qvac');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 2500);
    assert.equal(ceiba.copay, 1500);
    assert.equal(ceiba.coinsurance, 1000);
    assert.equal(ceiba.insurer, 4000);
    assert.equal(result.body.rows[0].id, 'ceiba');
  });
});

test('regresión: Plus/dermatología/La Ceiba cuesta USD 15.50', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'plus');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 1550);
    assert.equal(ceiba.copay, 1000);
    assert.equal(ceiba.coinsurance, 550);
  });
});

test('regresión: Jardines del Canal queda fuera de red con Esencial y cuesta USD 95', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    const canal = result.body.rows.find(r => r.id === 'canal');
    assert.equal(canal.covered, false);
    assert.equal(canal.patient, 9500);
  });
});

test('el modelo puede pedir información antes de comparar', async t => {
  mockQvac([{ action: 'ask', question: '¿Qué edad tiene el paciente?' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias en la rodilla');
    assert.equal(result.status, 200);
    assert.equal(result.body.question, '¿Qué edad tiene el paciente?');
    assert.equal(result.body.source, 'qvac');
    assert.equal(result.body.rows, undefined);
  });
});

test('el modelo puede consultar catálogo y cobertura antes de comparar', async t => {
  mockQvac([{ action: 'catalog' }, { action: 'coverage' }, { action: 'compare', specialty: 'gastro' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'plus');
    const result = await sendMessage(base, created.body.caseId, 'Tengo acidez de estómago');
    assert.equal(result.status, 200);
    assert.equal(result.body.specialty, 'gastro');
    assert.equal(result.body.explanation.source, 'qvac');
  });
});

test('acción no permitida del modelo degrada a modo de reglas sin inventar precios', async t => {
  mockQvac([{ action: 'delete_everything' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.status, 200);
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'dermatology');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 2500);
  });
});

test('especialidad inválida propuesta por el modelo degrada a modo de reglas', async t => {
  mockQvac([{ action: 'compare', specialty: 'cardiologia' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'dermatology');
  });
});

test('respuesta malformada (no JSON) degrada a modo de reglas', async t => {
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (String(url).includes('/models')) return Response.json({ data: [] });
    return Response.json({ choices: [{ message: { content: 'esto no es json' } }] });
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.explanation.source, 'rules');
  });
});

test('QVAC indisponible degrada a modo de reglas', async t => {
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    throw new Error('conexión rechazada');
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'dermatology');
  });
});

test('una posible urgencia interrumpe la comparación desde el primer mensaje', async t => {
  mockQvac([{ action: 'compare', specialty: 'general' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo dolor de pecho');
    assert.equal(result.status, 200);
    assert.equal(result.body.urgent, true);
    assert.equal(result.body.rows, undefined);
  });
});

test('el modo de reglas usa todo el historial del paciente, no solo el último mensaje', async t => {
  mockQvac([{ action: 'ask', question: '¿Cuál es tu edad?' }, { action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(first.body.question, '¿Cuál es tu edad?');
    const second = await sendMessage(base, created.body.caseId, 'Tengo 30 años');
    assert.equal(second.body.explanation.source, 'rules');
    assert.equal(second.body.specialty, 'dermatology');
  });
});

test('un mensaje posterior no urgente que degrada a reglas no revienta si el historial ya tenía una urgencia', async t => {
  mockQvac([{ action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo dolor de pecho');
    assert.equal(first.body.urgent, true);
    const second = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(second.status, 200);
    assert.equal(second.body.urgent, true);
    assert.equal(second.body.rows, undefined);
  });
});

test('plan inválido al iniciar un caso', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'inexistente');
    assert.equal(created.status, 400);
  });
});

test('caso inexistente al enviar un mensaje', async t => {
  await withServer(t, async base => {
    const result = await sendMessage(base, 'caso-fantasma', 'Tengo picazón en la piel');
    assert.equal(result.status, 404);
  });
});

test('cambiar de plan requiere un caso nuevo y no reutiliza la comparación previa', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const esencial = await startCase(base, 'esencial');
    await sendMessage(base, esencial.body.caseId, 'Tengo picazón en la piel');
    const plus = await startCase(base, 'plus');
    assert.notEqual(plus.body.caseId, esencial.body.caseId);
    const result = await sendMessage(base, plus.body.caseId, 'Tengo picazón en la piel');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 1550);
  });
});
