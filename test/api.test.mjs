import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/app.mjs';

const QVAC_BASE = 'http://127.0.0.1:11435';
const FOLLOW_UP = '¿En qué parte del cuerpo sientes la molestia?';

// El servidor real se levanta en un puerto efímero y solo se sustituye la
// llamada de red hacia QVAC. Lo simulado son los datos del caso en JSON que
// la extracción recibe del modelo, con la gramática ya aplicada.
function mockQvac(caseDataResponses) {
  const realFetch = globalThis.fetch;
  let call = 0;
  return mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (String(url).includes('/models')) return Response.json({ data: [{ id: 'copago', state: 'ready' }] });
    const caseData = typeof caseDataResponses === 'function'
      ? caseDataResponses(call, init)
      : caseDataResponses[Math.min(call, caseDataResponses.length - 1)];
    call++;
    return Response.json({ choices: [{ message: { content: encodeCaseData(caseData) } }] });
  });
}

function encodeCaseData(caseData) {
  if (typeof caseData === 'string') return caseData;
  return JSON.stringify({ specialty: null, ageYears: null, isPregnant: null, durationDays: null, redFlags: [], followUpQuestion: FOLLOW_UP, ...caseData });
}

async function withServer(t, fn) {
  const server = createServer().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  await fn(`http://127.0.0.1:${server.address().port}`);
}

async function startCase(base, plan, previousCase) {
  const previous = previousCase ? { previousCaseId: previousCase.caseId, previousCloseToken: previousCase.closeToken } : {};
  const response = await fetch(`${base}/api/case`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, ...previous }) });
  return { status: response.status, body: await response.json() };
}

async function sendMessage(base, caseId, text, turnId) {
  const response = await fetch(`${base}/api/case/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId, text, ...(turnId ? { turnId } : {}) }) });
  return { status: response.status, body: await response.json() };
}

test('regresión: Esencial/dermatología/La Ceiba cuesta USD 25 y ordena la red por menor gasto', async t => {
  mockQvac([{ specialty: 'dermatology', durationDays: 1 }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    assert.equal(created.status, 201);
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican desde ayer');
    assert.equal(result.status, 200);
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 2500);
    assert.equal(ceiba.copay, 1500);
    assert.equal(ceiba.coinsurance, 1000);
    assert.equal(ceiba.insurer, 4000);
    assert.equal(result.body.rows[0].id, 'ceiba');
  });
});

test('regresión: Plus/dermatología/La Ceiba cuesta USD 15.50', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'plus');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 1550);
    assert.equal(ceiba.copay, 1000);
    assert.equal(ceiba.coinsurance, 550);
  });
});

test('regresión: Jardines del Canal queda fuera de red con Esencial y cuesta USD 95', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    const canal = result.body.rows.find(r => r.id === 'canal');
    assert.equal(canal.covered, false);
    assert.equal(canal.patient, 9500);
  });
});

test('la API conserva tarifas, red y cálculo determinista de las diez especialidades', async t => {
  const expected = { general: 3500, dermatology: 6500, gastro: 7500, trauma: 7000, pediatrics: 4000, gyn: 7000, ent: 5000, ophthalmology: 6000, urology: 7200, endocrinology: 6500 };
  const specialties = Object.keys(expected);
  mockQvac(call => ({ specialty: specialties[call] }));
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

test('regresión: ginecología/obstetricia en Plus calcula los tres hospitales en red', async t => {
  mockQvac([{ specialty: 'gyn', isPregnant: true }]);
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

test('una señal de alarma detiene la estimación sin precios ni orientación de especialidad', async t => {
  mockQvac([{ specialty: 'pediatrics', ageYears: 3, redFlags: ['vomito_persistente'] }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo tiene fiebre y vomita cada 30 minutos');
    assert.equal(result.status, 200);
    assert.equal(result.body.urgent, true);
    assert.match(result.body.message, /urgencias/i);
    assert.equal(result.body.rows, undefined);
    assert.equal(result.body.specialty, undefined);
  });
});

test('la señal de alarma tiene precedencia sobre cualquier campo faltante', async t => {
  mockQvac([{ specialty: null, redFlags: ['convulsion'] }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hija empezó a temblar sin control');
    assert.equal(result.body.urgent, true);
    assert.equal(result.body.question, undefined);
    assert.equal(result.body.rows, undefined);
  });
});

test('una urgencia previa bloquea permanentemente el resto del caso', async t => {
  mockQvac(call => (call === 0 ? { redFlags: ['dificultad_respiratoria'] } : { specialty: 'dermatology' }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'A mi papá le cuesta mucho respirar');
    assert.equal(first.body.urgent, true);
    for (let i = 0; i < 3; i++) {
      const next = await sendMessage(base, created.body.caseId, `Mensaje de seguimiento ${i}`);
      assert.equal(next.status, 200);
      assert.equal(next.body.urgent, true);
      assert.equal(next.body.message, first.body.message);
      assert.equal(next.body.rows, undefined);
    }
  });
});

test('una urgencia sobrevenida tras mostrar una comparación retira los precios', async t => {
  mockQvac(call => (call === 0 ? { specialty: 'dermatology' } : { redFlags: ['sangrado_abundante'] }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.ok(first.body.rows.length > 0);
    assert.equal(first.body.urgent, undefined);

    const second = await sendMessage(base, created.body.caseId, 'Me corté y no para de sangrar');
    assert.equal(second.body.urgent, true);
    assert.equal(second.body.rows, undefined);
  });
});

test('el agente pregunta cuando no puede determinar la especialidad', async t => {
  mockQvac([{ specialty: null, followUpQuestion: '¿Desde cuándo te sientes así y qué molestia notas más?' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'No me siento bien');
    assert.equal(result.status, 200);
    assert.equal(result.body.question, '¿Desde cuándo te sientes así y qué molestia notas más?');
    assert.equal(result.body.questionsAsked, 1);
    assert.equal(result.body.questionsRemaining, 4);
    assert.equal(result.body.rows, undefined);
    assert.equal(result.body.specialty, undefined);
  });
});

test('la pregunta de seguimiento la redacta el modelo y no un catálogo de campos fijos', async t => {
  mockQvac([{ specialty: null, followUpQuestion: '¿El ardor aparece después de comer o también en ayunas?' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Siento un ardor raro');
    assert.match(result.body.question, /ayunas/);
  });
});

test('llega a la comparación en el turno siguiente a una pregunta', async t => {
  mockQvac([{ specialty: null }, { specialty: 'gastro', durationDays: 3 }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'No me siento bien');
    assert.equal(first.body.questionsAsked, 1);
    const second = await sendMessage(base, created.body.caseId, 'Me arde el estómago después de comer');
    assert.equal(second.body.specialty, 'gastro');
    assert.equal(second.body.approximate, false);
    assert.ok(second.body.rows.length > 0);
  });
});

test('una corrección en un turno posterior manda sobre el dato anterior', async t => {
  // La extracción vuelve a derivar los datos desde la conversación entera, así
  // que el agente recibe la transcripción completa en cada turno.
  mockQvac((call, init) => {
    const conversation = JSON.parse(init.body).messages.at(-1).content;
    if (call === 0) return { specialty: 'ent', ageYears: 14 };
    assert.match(conversation, /Tiene 14 años/);
    assert.match(conversation, /tiene 4 años/);
    return { specialty: 'pediatrics', ageYears: 4 };
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tiene 14 años y le duele mucho la garganta');
    assert.equal(first.body.specialty, 'ent');
    const corrected = await sendMessage(base, created.body.caseId, 'Perdón, tiene 4 años, no 14');
    assert.equal(corrected.body.specialty, 'pediatrics');
    assert.equal(corrected.body.understood.ageYears, 4);
    const ceiba = corrected.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 2000);
  });
});

test('una edad menor de doce años orienta pediatría aunque el modelo proponga otra especialidad', async t => {
  mockQvac([{ specialty: 'ent', ageYears: 4 }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tiene 4 años y le duele mucho la garganta');
    assert.equal(result.body.specialty, 'pediatrics');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 2000);
  });
});

test('una edad de doce años o más conserva la especialidad del síntoma', async t => {
  mockQvac([{ specialty: 'ent', ageYears: 14 }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tiene 14 años y le duele mucho la garganta');
    assert.equal(result.body.specialty, 'ent');
  });
});

test('el agente muestra qué entendió del caso en cada turno', async t => {
  mockQvac([{ specialty: 'pediatrics', ageYears: 5, isPregnant: false, durationDays: 2 }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Mi hijo de 5 años lleva dos días con tos');
    assert.deepEqual(result.body.understood, { specialty: 'pediatrics', ageYears: 5, isPregnant: false, durationDays: 2 });
  });
});

test('agotar el tope de preguntas compara con medicina general y lo declara aproximado', async t => {
  mockQvac(() => ({ specialty: null }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    let result = await sendMessage(base, created.body.caseId, 'Tengo un malestar general');
    for (let i = 1; i <= 5; i++) {
      assert.equal(result.body.questionsAsked, i);
      assert.equal(result.body.questionsRemaining, 5 - i);
      assert.equal(typeof result.body.question, 'string');
      result = await sendMessage(base, created.body.caseId, `Respuesta ${i}`);
    }
    assert.equal(result.status, 200);
    assert.equal(result.body.question, undefined);
    assert.equal(result.body.recovery, undefined);
    assert.equal(result.body.specialty, 'general');
    assert.equal(result.body.approximate, true);
    assert.match(result.body.explanation.text, /aproximada/i);
    assert.ok(result.body.rows.length > 0);
  });
});

test('una especialidad inexistente en el catálogo degrada a pregunta sin inventar precios', async t => {
  mockQvac([{ specialty: 'cardiologia' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo una molestia');
    assert.equal(result.status, 200);
    assert.equal(result.body.specialty, undefined);
    assert.equal(result.body.rows, undefined);
    assert.equal(typeof result.body.question, 'string');
  });
});

test('una señal de alarma inexistente en la lista cerrada no detiene la conversación', async t => {
  mockQvac([{ specialty: 'dermatology', redFlags: ['dolor_de_pecho'] }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(result.body.urgent, undefined);
    assert.equal(result.body.specialty, 'dermatology');
  });
});

test('una respuesta que no es JSON degrada a pregunta en vez de romper el turno', async t => {
  mockQvac(['esto no es json']);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.question, 'string');
    assert.equal(result.body.rows, undefined);
  });
});

test('QVAC indisponible ofrece recuperación sin orientar ni mostrar precios', async t => {
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    throw new Error('conexión rechazada');
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(result.body.recovery.reason, 'unavailable');
    assert.equal(result.body.recovery.canRetry, true);
    assert.doesNotMatch(result.body.message, /QVAC/i);
    assert.equal(result.body.rows, undefined);
  });
});

test('un turno fallido se puede reintentar sin duplicar el mensaje en la conversación', async t => {
  const realFetch = globalThis.fetch;
  let failed = false;
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).startsWith(QVAC_BASE)) return realFetch(url, init);
    if (!failed) { failed = true; throw new Error('conexión rechazada'); }
    const conversation = JSON.parse(init.body).messages.at(-1).content;
    assert.equal(conversation.match(/ronchas/g).length, 1);
    return Response.json({ choices: [{ message: { content: encodeCaseData({ specialty: 'dermatology' }) } }] });
  });
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const turnId = 'turno-recuperable';
    const first = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', turnId);
    assert.ok(first.body.recovery);
    const retried = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', turnId);
    assert.equal(retried.body.specialty, 'dermatology');
  });
});

test('un reintento de red con el mismo turno devuelve el resultado sin mutar el caso', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const turnId = 'turno-reintentable';
    const first = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', turnId);
    const retried = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', turnId);
    assert.deepEqual(retried.body, first.body);
    assert.equal(retried.body.specialty, 'dermatology');
  });
});

test('solicitudes simultáneas con el mismo turno comparten una sola mutación', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const requests = await Promise.all([
      sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', 'turno-simultáneo'),
      sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', 'turno-simultáneo')
    ]);
    assert.deepEqual(requests[1].body, requests[0].body);
    assert.equal(requests[0].body.specialty, 'dermatology');
  });
});

test('una respuesta cacheada no puede restaurar precios después de una urgencia', async t => {
  mockQvac(call => (call === 0 ? { specialty: 'dermatology' } : { redFlags: ['no_despierta'] }));
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const first = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', 'comparación-anterior');
    assert.ok(first.body.rows.length > 0);
    const urgent = await sendMessage(base, created.body.caseId, 'Mi hijo no despierta', 'urgencia');
    assert.equal(urgent.body.urgent, true);
    const staleRetry = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican', 'comparación-anterior');
    assert.equal(staleRetry.body.urgent, true);
    assert.equal(staleRetry.body.rows, undefined);
  });
});

test('los casos concurrentes no comparten preguntas ni resultados entre sí', async t => {
  mockQvac([{ specialty: null }, { specialty: null }, { specialty: 'dermatology' }, { specialty: 'gastro' }]);
  await withServer(t, async base => {
    const a = await startCase(base, 'esencial');
    const b = await startCase(base, 'plus');

    const aFirst = await sendMessage(base, a.body.caseId, 'No me siento bien');
    assert.equal(aFirst.body.questionsAsked, 1);
    const bFirst = await sendMessage(base, b.body.caseId, 'Tengo un malestar');
    assert.equal(bFirst.body.questionsAsked, 1); // no arrastra el contador del caso A

    const aSecond = await sendMessage(base, a.body.caseId, 'Me pica la piel');
    assert.equal(aSecond.body.specialty, 'dermatology');
    const bSecond = await sendMessage(base, b.body.caseId, 'Me arde el estómago');
    assert.equal(bSecond.body.specialty, 'gastro');
  });
});

test('una urgencia en un caso no afecta a otro caso independiente', async t => {
  mockQvac(call => (call === 0 ? { redFlags: ['labios_azules'] } : { specialty: 'dermatology' }));
  await withServer(t, async base => {
    const urgent = await startCase(base, 'esencial');
    const calm = await startCase(base, 'esencial');

    const urgentResult = await sendMessage(base, urgent.body.caseId, 'Mi hijo tiene los labios morados');
    assert.equal(urgentResult.body.urgent, true);

    const calmResult = await sendMessage(base, calm.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(calmResult.body.urgent, undefined);
    assert.ok(calmResult.body.rows.length > 0);

    const urgentAgain = await sendMessage(base, urgent.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(urgentAgain.body.urgent, true);
  });
});

test('reiniciar explícitamente el caso permite un caso independiente tras una urgencia', async t => {
  mockQvac(call => (call === 0 ? { redFlags: ['deshidratacion'] } : { specialty: 'dermatology' }));
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const urgentResult = await sendMessage(base, first.body.caseId, 'Lleva dos días con diarrea y la boca seca');
    assert.equal(urgentResult.body.urgent, true);

    const restarted = await startCase(base, 'esencial');
    assert.notEqual(restarted.body.caseId, first.body.caseId);
    const result = await sendMessage(base, restarted.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(result.body.urgent, undefined);
    assert.ok(result.body.rows.length > 0);
  });
});

test('reiniciar elimina explícitamente el caso anterior', async t => {
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const restarted = await startCase(base, 'plus', first.body);
    assert.notEqual(restarted.body.caseId, first.body.caseId);
    const oldCase = await sendMessage(base, first.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(oldCase.status, 404);
    assert.match(oldCase.body.error, /vencido|no encontrado/i);
  });
});

test('un token ajeno no puede reemplazar ni eliminar un caso existente', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const first = await startCase(base, 'esencial');
    const attempted = await fetch(`${base}/api/case`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'plus', previousCaseId: first.body.caseId, previousCloseToken: 'token-ajeno' })
    });
    assert.equal(attempted.status, 400);
    const oldCase = await sendMessage(base, first.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(oldCase.status, 200);
  });
});

test('cambiar de plan requiere un caso nuevo y no reutiliza la comparación previa', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const esencial = await startCase(base, 'esencial');
    await sendMessage(base, esencial.body.caseId, 'Tengo unas ronchas que me pican');
    const plus = await startCase(base, 'plus');
    assert.notEqual(plus.body.caseId, esencial.body.caseId);
    const result = await sendMessage(base, plus.body.caseId, 'Tengo unas ronchas que me pican');
    const ceiba = result.body.rows.find(r => r.id === 'ceiba');
    assert.equal(ceiba.patient, 1550);
  });
});

test('toda estimación declara que es una demostración y cuándo se generó', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.equal(result.body.estimate.source, 'demo');
    assert.match(result.body.estimate.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(result.body.estimate.exclusions.join(' '), /medicamentos/i);
  });
});

test('la explicación menciona la especialidad y el gasto estimado antes de cualquier cifra', async t => {
  mockQvac([{ specialty: 'dermatology' }]);
  await withServer(t, async base => {
    const created = await startCase(base, 'esencial');
    const result = await sendMessage(base, created.body.caseId, 'Tengo unas ronchas que me pican');
    assert.match(result.body.explanation.text, /Dermatología/);
    assert.match(result.body.explanation.text, /gasto estimado/i);
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
    const result = await sendMessage(base, 'caso-fantasma', 'Tengo unas ronchas que me pican');
    assert.equal(result.status, 404);
  });
});
