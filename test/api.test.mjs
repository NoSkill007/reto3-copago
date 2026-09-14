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

test('detiene las preguntas en cuanto hay información suficiente, antes del máximo', async t => {
  mockQvac([{ action: 'ask', question: '¿Cuál es tu edad?' }, { action: 'compare', specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo picazón en la piel');
    assert.equal(first.body.question, '¿Cuál es tu edad?');
    assert.equal(first.body.questionsAsked, 1);
    assert.equal(first.body.questionsRemaining, 4);
    const second = await sendMessage(base, created.body.caseId, 'Tengo 30 años');
    assert.equal(second.body.specialty, 'dermatology');
    assert.equal(second.body.explanation.source, 'qvac');
  });
});

test('permite hasta cinco preguntas de seguimiento y bloquea un sexto intento sin inventar la especialidad', async t => {
  mockQvac(call => ({ action: 'ask', question: `Pregunta de seguimiento número ${call + 1}` }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    let result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales');
    for (let i = 1; i <= 5; i++) {
      assert.equal(result.body.question, `Pregunta de seguimiento número ${i}`);
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
  mockQvac(() => ({ action: 'ask', question: '¿Algo más?' }));
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
  mockQvac([{ action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo tiene 5 años y está decaído');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'pediatrics');
  });
});

test('modo de reglas orienta a ginecología/obstetricia cuando hay embarazo y no hay síntoma más específico', async t => {
  mockQvac([{ action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Estoy embarazada y tengo molestias generales');
    assert.equal(result.body.explanation.source, 'rules');
    assert.equal(result.body.specialty, 'gyn');
  });
});

test('una duración expresada como "desde hace X años" no se confunde con la edad del paciente', async t => {
  mockQvac([{ action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo molestias generales desde hace 3 años');
    assert.equal(result.body.specialty, 'general');
  });
});

test('el embarazo no fuerza ginecología cuando el síntoma descrito es de otra especialidad', async t => {
  mockQvac([{ action: 'no_permitida' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Estoy embarazada y tengo picazón en la piel');
    assert.equal(result.body.specialty, 'dermatology');
  });
});

test('la oferta de consulta inicial tras agotar preguntas usa el contexto de edad ya aportado, no medicina general a ciegas', async t => {
  mockQvac(() => ({ action: 'ask', question: '¿Algo más?' }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    let result = await sendMessage(base, created.body.caseId, 'Mi hijo de 3 años está decaído');
    for (let i = 0; i < 5; i++) result = await sendMessage(base, created.body.caseId, `Respuesta ${i}`);
    assert.equal(result.body.uncertain, true);
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
    { action: 'ask', question: '¿Edad del caso A?' },
    { action: 'ask', question: '¿Edad del caso B?' },
    { action: 'compare', specialty: 'dermatology' },
    { action: 'compare', specialty: 'gastro' }
  ]);
  await withServer(t, async base => {
    const a = await startCase(base, 'esencial');
    const b = await startCase(base, 'plus');

    const aFirst = await sendMessage(base, a.body.caseId, 'Tengo picazón en la piel');
    assert.equal(aFirst.body.question, '¿Edad del caso A?');
    assert.equal(aFirst.body.questionsAsked, 1);

    const bFirst = await sendMessage(base, b.body.caseId, 'Tengo acidez de estómago');
    assert.equal(bFirst.body.question, '¿Edad del caso B?');
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
