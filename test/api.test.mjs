import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/app.mjs';

const QVAC_BASE = 'http://127.0.0.1:11435';

function mockQvac(chatResponses) {
  const realFetch = globalThis.fetch;
  let call = 0;
  return mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (String(url).includes('/models')) return Response.json({ data: [{ id: 'copago', state: 'ready' }] });
    const decision = typeof chatResponses === 'function' ? chatResponses(call, init) : chatResponses[Math.min(call, chatResponses.length - 1)];
    call++;
    return Response.json({ choices: [{ message: { content: encodeDecision(decision) } }] });
  });
}

function encodeDecision(decision) {
  if (typeof decision === 'string') return decision;
  if (decision.action === 'ask' && decision.field) return `ASK|${decision.field}`;
  if (decision.action === 'catalog') return 'CATALOG';
  if (decision.action === 'coverage') return 'COVERAGE';
  if (decision.action === 'compare') return `COMPARE|${decision.specialty}`;
  return String(decision.action ?? 'INVALID').toUpperCase();
}

async function withServer(t, fn) {
  const server = createServer().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());
  try { await fn(base); } finally { /* no-op */ }
}

async function startCase(base, plan, previousCase) {
  const previous = previousCase ? { previousCaseId: previousCase.caseId, previousCloseToken: previousCase.closeToken } : {};
  const response = await fetch(`${base}/api/case`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, ...previous }) });
  return { status: response.status, body: await response.json() };
}

async function sendMessage(base, caseId, text, mode, turnId) {
  const response = await fetch(`${base}/api/case/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, text, ...(mode ? { mode } : {}), ...(turnId ? { turnId } : {}) }) });
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
  mockQvac([{ action: 'ask', field: 'age' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias en la rodilla');
    assert.equal(result.status, 200);
    assert.equal(result.body.question, '¿Qué edad tiene la persona que presenta las molestias?');
    assert.equal(result.body.field, 'age');
    assert.equal(result.body.source, 'qvac');
    assert.equal(result.body.rows, undefined);
  });
});

test('la API conserva tarifas, red y cálculo determinista de las seis especialidades', async t => {
  const expected = { general: 3500, dermatology: 6500, gastro: 7500, trauma: 7000, pediatrics: 4000, gyn: 7000 };
  const specialties = Object.keys(expected);
  mockQvac(call => ({ action: 'compare', specialty: specialties[Math.floor(call / 2)] }));
  await withServer(t, async base => {
    for (const specialty of specialties) {
      const created = await startCase(base, 'esencial');
      const result = await sendMessage(base, created.body.caseId, 'Quiero explorar una consulta');
      const ceiba = result.body.rows.find(row => row.id === 'ceiba');
      const canal = result.body.rows.find(row => row.id === 'canal');
      assert.equal(result.body.specialty, specialty);
      assert.equal(ceiba.rate, expected[specialty]);
      assert.equal(ceiba.covered, true);
      assert.equal(canal.covered, false);
      assert.equal(canal.patient, canal.rate);
    }
  });
});

test('una pregunta libre o agrupada del modelo se rechaza fuera del modelo', async t => {
  mockQvac([{ action: 'ask', question: '¿Qué edad tienes y desde cuándo te duele?' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales');
    assert.equal(result.body.recovery.reason, 'invalid_response');
    assert.equal(result.body.question, undefined);
    assert.equal(result.body.rows, undefined);
  });
});

test('un campo repetido se rechaza y no consume otra pregunta', async t => {
  mockQvac([{ action: 'ask', field: 'age' }, { action: 'ask', field: 'age' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo molestias generales');
    assert.equal(first.body.questionsAsked, 1);
    const second = await sendMessage(base, created.body.caseId, 'Prefiero no decirlo');
    assert.equal(second.body.recovery.reason, 'invalid_response');
    assert.equal(second.body.rows, undefined);
  });
});

test('el modelo no puede preguntar un dato que el paciente ya aportó', async t => {
  mockQvac([{ action: 'ask', field: 'age' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo 30 años y molestias generales');
    assert.equal(result.body.recovery.reason, 'invalid_response');
    assert.equal(result.body.question, undefined);
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

test('la explicación económica es determinista aunque el modelo envíe texto adicional', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology', explanation: 'Este hospital garantiza cobertura total.' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.explanation.source, 'qvac');
    assert.doesNotMatch(result.body.explanation.text, /garantiza cobertura total/i);
    assert.match(result.body.explanation.text, /cálculo determinista/i);
  });
});

test('acción no permitida del modelo se rechaza sin generar precios', async t => {
  mockQvac([{ action: 'delete_everything' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.status, 200);
    assert.equal(result.body.recovery.reason, 'invalid_response');
    assert.equal(result.body.rows, undefined);
    assert.equal(result.body.specialty, undefined);
  });
});

test('especialidad inválida propuesta por el modelo se rechaza sin precios', async t => {
  mockQvac([{ action: 'compare', specialty: 'cardiologia' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.recovery.reason, 'invalid_response');
    assert.equal(result.body.rows, undefined);
  });
});

test('respuesta malformada (no JSON) se rechaza sin precios', async t => {
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (String(url).includes('/models')) return Response.json({ data: [] });
    return Response.json({ choices: [{ message: { content: 'esto no es json' } }] });
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.recovery.reason, 'invalid_response');
    assert.equal(result.body.rows, undefined);
  });
});

test('QVAC indisponible ofrece recuperación sin activar reglas automáticamente', async t => {
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    throw new Error('conexión rechazada');
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.recovery.reason, 'unavailable');
    assert.equal(result.body.recovery.canUseRules, true);
    assert.equal(result.body.rows, undefined);

    const rulesResult = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'rules');
    assert.equal(rulesResult.body.explanation.source, 'rules');
    assert.equal(rulesResult.body.specialty, 'dermatology');
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
  mockQvac([{ action: 'ask', field: 'age' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(first.body.field, 'age');
    const second = await sendMessage(base, created.body.caseId, 'Tengo 30 años', 'rules');
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

test('detiene las preguntas en cuanto hay información suficiente, antes del máximo', async t => {
  mockQvac([{ action: 'ask', field: 'age' }, { action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(first.body.field, 'age');
    assert.equal(first.body.questionsAsked, 1);
    assert.equal(first.body.questionsRemaining, 4);
    const second = await sendMessage(base, created.body.caseId, 'Tengo 30 años');
    assert.equal(second.body.specialty, 'dermatology');
    assert.equal(second.body.explanation.source, 'qvac');
  });
});

test('permite hasta cinco preguntas de seguimiento y bloquea un sexto intento sin inventar la especialidad', async t => {
  const fields = ['details', 'age', 'pregnancy', 'duration', 'severity', 'impact'];
  mockQvac(call => ({ action: 'ask', field: fields[call] }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    let result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales');
    for (let i = 1; i <= 5; i++) {
      assert.equal(result.body.field, fields[i - 1]);
      assert.equal(typeof result.body.question, 'string');
      assert.equal(result.body.questionsAsked, i);
      assert.equal(result.body.questionsRemaining, 5 - i);
      result = await sendMessage(base, created.body.caseId, `Respuesta ${i}`);
    }
    // El sexto intento del modelo de seguir preguntando se rechaza fuera del modelo.
    assert.equal(result.status, 200);
    assert.equal(result.body.question, undefined);
    assert.equal(result.body.uncertain, true);
    assert.equal(result.body.specialty, 'general');
    assert.equal(result.body.explanation.source, 'rules');
    assert.ok(result.body.rows.length > 0);
  });
});

test('una urgencia previa en el caso bloquea permanentemente mensajes posteriores, incluso al agotar las cinco preguntas', async t => {
  mockQvac(() => ({ action: 'ask', field: 'details' }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo dolor de pecho');
    assert.equal(first.body.urgent, true);
    for (let i = 0; i < 6; i++) {
      const next = await sendMessage(base, created.body.caseId, `Mensaje de seguimiento ${i}`);
      assert.equal(next.status, 200);
      assert.equal(next.body.urgent, true);
      assert.equal(next.body.message, first.body.message);
      assert.equal(next.body.rows, undefined);
      assert.equal(next.body.uncertain, undefined);
    }
  });
});

test('regresión: pediatría en Esencial ordena La Ceiba primero y deja Canal fuera de red', async t => {
  mockQvac([{ action: 'compare', specialty: 'pediatrics' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo de 5 años tiene fiebre');
    assert.equal(result.body.specialty, 'pediatrics');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    const bahia = result.body.rows.find(r => r.id === 'bahia');
    const canal = result.body.rows.find(r => r.id === 'canal');
    assert.equal(ceiba.patient, 2000);
    assert.equal(bahia.patient, 2200);
    assert.equal(canal.covered, false);
    assert.equal(canal.patient, 6000);
    assert.equal(result.body.rows[0].id, 'ceiba');
  });
});

test('regresión: ginecología/obstetricia en Plus calcula los tres hospitales en red', async t => {
  mockQvac([{ action: 'compare', specialty: 'gyn' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'plus');
    const result = await sendMessage(base, created.body.caseId, 'Estoy embarazada y quiero un control');
    assert.equal(result.body.specialty, 'gyn');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    const bahia = result.body.rows.find(r => r.id === 'bahia');
    const canal = result.body.rows.find(r => r.id === 'canal');
    assert.equal(ceiba.patient, 1600);
    assert.equal(bahia.patient, 1750);
    assert.equal(canal.patient, 1880);
    assert.ok(canal.covered);
  });
});

test('modo de reglas orienta a pediatría cuando el paciente es un niño y no hay síntoma más específico', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo tiene 5 años y está decaído', 'rules');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'pediatrics');
  });
});

test('modo de reglas orienta a ginecología/obstetricia cuando hay embarazo y no hay síntoma más específico', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Estoy embarazada y tengo molestias generales', 'rules');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'gyn');
  });
});

test('un reintento de red con el mismo turno devuelve el resultado sin mutar el caso', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const turnId = 'turno-reintentable';
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', turnId);
    const retried = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', turnId);
    assert.deepEqual(retried.body, first.body);
    assert.equal(retried.body.specialty, 'dermatology');
  });
});

test('un turno de recuperación no queda cacheado y permite reintentar QVAC', async t => {
  mockQvac(['INVALID', { action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const turnId = 'turno-recuperable';
    const failed = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', turnId);
    assert.ok(failed.body.recovery);
    const retried = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', turnId);
    assert.equal(retried.body.specialty, 'dermatology');
  });
});

test('solicitudes simultáneas con el mismo turno comparten una sola mutación', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const requests = await Promise.all([
      sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', 'turno-simultáneo'),
      sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', 'turno-simultáneo')
    ]);
    assert.deepEqual(requests[1].body, requests[0].body);
    assert.equal(requests[0].body.specialty, 'dermatology');
  });
});

test('modo de reglas pide un dato faltante en vez de inventar medicina general', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales', 'rules');
    assert.equal(result.body.field, 'details');
    assert.equal(result.body.source, 'rules');
    assert.equal(result.body.specialty, undefined);
    assert.equal(result.body.rows, undefined);
  });
});

test('un saludo o mensaje vago mantiene pendiente la molestia principal', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Hola, necesito ayuda', 'rules');
    assert.equal(result.body.field, 'details');
  });
});

test('las respuestas cortas se vinculan a la pregunta previa y no se repiten', async t => {
  await withServer(t, async base => {
    const childCase = await startCase(base, 'esencial');
    let result = await sendMessage(base, childCase.body.caseId, 'Tengo molestias generales', 'rules');
    assert.equal(result.body.field, 'details');
    result = await sendMessage(base, childCase.body.caseId, 'Fiebre desde ayer', 'rules');
    assert.equal(result.body.field, 'age');
    result = await sendMessage(base, childCase.body.caseId, '5', 'rules');
    assert.equal(result.body.specialty, 'pediatrics');

    const adultCase = await startCase(base, 'esencial');
    result = await sendMessage(base, adultCase.body.caseId, 'Tengo molestias generales', 'rules');
    result = await sendMessage(base, adultCase.body.caseId, 'Molestias leves', 'rules');
    assert.equal(result.body.field, 'age');
    result = await sendMessage(base, adultCase.body.caseId, '30', 'rules');
    assert.equal(result.body.field, 'pregnancy');
    result = await sendMessage(base, adultCase.body.caseId, 'No', 'rules');
    assert.equal(result.body.field, 'duration');
  });
});

test('una duración expresada como "desde hace X años" no se confunde con la edad del paciente', async t => {
  mockQvac([{ action: 'ask', field: 'age' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales desde hace 3 años');
    assert.equal(result.body.field, 'age');
    assert.equal(result.body.specialty, undefined);
  });
});

test('el embarazo no fuerza ginecología cuando el síntoma descrito es de otra especialidad', async t => {
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Estoy embarazada y tengo picazón en la piel', 'rules');
    assert.equal(result.body.specialty, 'dermatology');
  });
});

test('la edad aportada en el mensaje inicial orienta pediatría sin preguntas redundantes', async t => {
  mockQvac([{ action: 'compare', specialty: 'pediatrics' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo de 3 años está decaído');
    assert.equal(result.body.question, undefined);
    assert.equal(result.body.specialty, 'pediatrics');
  });
});

test('una urgencia sobrevenida tras mostrar una comparación retira los precios y bloquea el resto del caso', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.ok(first.body.rows.length > 0);
    assert.equal(first.body.urgent, undefined);

    const second = await sendMessage(base, created.body.caseId, 'Ahora tengo dolor de pecho');
    assert.equal(second.body.urgent, true);
    assert.equal(second.body.rows, undefined);
    assert.match(second.body.message, /atención/i);

    // La interrupción persiste: no se generan nuevas comparaciones ni se
    // vuelve a consultar al modelo aunque el paciente siga escribiendo.
    const third = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel otra vez');
    assert.equal(third.body.urgent, true);
    assert.equal(third.body.rows, undefined);
  });
});

test('los casos concurrentes no comparten preguntas ni resultados entre sí', async t => {
  mockQvac([
    { action: 'ask', field: 'age' },
    { action: 'ask', field: 'age' },
    { action: 'compare', specialty: 'dermatology' },
    { action: 'compare', specialty: 'dermatology' },
    { action: 'compare', specialty: 'gastro' },
    { action: 'compare', specialty: 'gastro' }
  ]);
  await withServer(t, async base => {
    const a = await startCase(base, 'esencial');
    const b = await startCase(base, 'plus');

    const aFirst = await sendMessage(base, a.body.caseId, 'Tengo picazón en la piel');
    assert.equal(aFirst.body.field, 'age');
    assert.equal(aFirst.body.questionsAsked, 1);

    const bFirst = await sendMessage(base, b.body.caseId, 'Tengo acidez de estómago');
    assert.equal(bFirst.body.field, 'age');
    assert.equal(bFirst.body.questionsAsked, 1); // no arrastra el contador del caso A

    const aSecond = await sendMessage(base, a.body.caseId, 'Tengo 30 años');
    assert.equal(aSecond.body.specialty, 'dermatology');

    const bSecond = await sendMessage(base, b.body.caseId, 'Tengo 40 años');
    assert.equal(bSecond.body.specialty, 'gastro');
  });
});

test('una urgencia en un caso no afecta a otro caso independiente', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const urgent = await startCase(base, 'esencial');
    const calm = await startCase(base, 'esencial');

    const urgentResult = await sendMessage(base, urgent.body.caseId, 'Tengo dolor de pecho');
    assert.equal(urgentResult.body.urgent, true);

    const calmResult = await sendMessage(base, calm.body.caseId, 'Tengo picazón en la piel');
    assert.equal(calmResult.body.urgent, undefined);
    assert.ok(calmResult.body.rows.length > 0);

    const urgentAgain = await sendMessage(base, urgent.body.caseId, 'Tengo picazón en la piel');
    assert.equal(urgentAgain.body.urgent, true);
  });
});

test('reiniciar explícitamente el caso (mismo plan) permite un caso independiente tras una urgencia', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const urgentResult = await sendMessage(base, first.body.caseId, 'Tengo dolor de pecho');
    assert.equal(urgentResult.body.urgent, true);

    const restarted = await startCase(base, 'esencial');
    assert.notEqual(restarted.body.caseId, first.body.caseId);
    const result = await sendMessage(base, restarted.body.caseId, 'Tengo picazón en la piel');
    assert.equal(result.body.urgent, undefined);
    assert.ok(result.body.rows.length > 0);
  });
});

test('una respuesta cacheada no puede restaurar precios después de una urgencia', async t => {
  mockQvac([{ action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', 'comparación-anterior');
    assert.ok(first.body.rows.length > 0);
    const urgent = await sendMessage(base, created.body.caseId, 'Tengo dolor de pecho', 'qvac', 'urgencia');
    assert.equal(urgent.body.urgent, true);
    const staleRetry = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel', 'qvac', 'comparación-anterior');
    assert.equal(staleRetry.body.urgent, true);
    assert.equal(staleRetry.body.rows, undefined);
  });
});

test('reiniciar elimina explícitamente el caso anterior', async t => {
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const restarted = await startCase(base, 'plus', first.body);
    assert.notEqual(restarted.body.caseId, first.body.caseId);
    const oldCase = await sendMessage(base, first.body.caseId, 'Tengo picazón en la piel', 'rules');
    assert.equal(oldCase.status, 404);
    assert.match(oldCase.body.error, /vencido|no encontrado/i);
  });
});

test('un token ajeno no puede reemplazar ni eliminar un caso existente', async t => {
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const attempted = await fetch(`${base}/api/case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'plus', previousCaseId: first.body.caseId, previousCloseToken: 'token-ajeno' })
    });
    assert.equal(attempted.status, 400);
    const oldCase = await sendMessage(base, first.body.caseId, 'Tengo picazón en la piel', 'rules');
    assert.equal(oldCase.status, 200);
  });
});

test('el catálogo expone todas las condiciones simplificadas del plan', async t => {
  await withServer(t, async base => {
    const response = await fetch(`${base}/api/catalog`);
    const body = await response.json();
    assert.deepEqual(body.plans[0].conditions, ['Sin deducible', 'Sin límite anual', 'Sin autorización previa']);
  });
});

test('el estado de QVAC distingue listo y cargando con evidencia separada', async t => {
  const realFetch = globalThis.fetch;
  let state = 'ready';
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    return Response.json({ data: [{ id: 'copago', state }] });
  });
  await withServer(t, async base => {
    let response = await fetch(`${base}/api/status`);
    let body = await response.json();
    assert.equal(body.state, 'ready');
    assert.equal(body.connected, true);
    assert.equal(body.activeDevice, null);
    assert.match(body.deviceEvidence, /no está expuesto/i);

    state = 'loading';
    response = await fetch(`${base}/api/status`);
    body = await response.json();
    assert.equal(body.state, 'loading');
    assert.equal(body.connected, false);
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
