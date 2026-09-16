// Arnés de evaluación (docs/tickets/6.md). Llama a la extracción contra el
// modelo real y produce mediciones, no afirmaciones: sin umbral de aprobación
// y sin papel en la corrida normal de pruebas (`npm test`). Ejecutar con
// `npm run eval:extraction` mientras `npm start` (o `npm run qvac:start`)
// mantiene QVAC activo en el puerto 11435.

import { specialties } from '../src/catalog.mjs';
import { cases } from './dataset.mjs';
import { extractCase } from './extraction.mjs';
import { classify } from './classify.mjs';

const MAX_QUESTIONS = 5;

async function runCase(testCase) {
  const transcript = [];
  let questionsAsked = 0;
  let caseData = null;
  let outcome = null;

  for (let turn = 0; turn < testCase.messages.length; turn++) {
    transcript.push({ role: 'user', text: testCase.messages[turn] });
    caseData = await extractCase(transcript, specialties);
    const decision = classify(caseData, { questionsAsked, maxQuestions: MAX_QUESTIONS });

    if (decision.action === 'stop') { outcome = { action: 'stop', turns: turn + 1 }; break; }
    if (decision.action === 'compare') { outcome = { action: 'compare', specialty: decision.specialty, approximate: decision.approximate, turns: turn + 1 }; break; }

    questionsAsked++;
    outcome = { action: 'ask', turns: turn + 1, question: caseData.followUpQuestion };
    transcript.push({ role: 'agent', text: caseData.followUpQuestion || '(el modelo no redactó una pregunta)' });
  }

  return { case: testCase, outcome, caseData };
}

function report(results) {
  const resolvable = results.filter(r => r.case.kind === 'resolvable' || r.case.kind === 'correction');
  const urgent = results.filter(r => r.case.kind === 'urgent');
  const vague = results.filter(r => r.case.kind === 'vague');

  console.log('\n=== Casos resolubles y de corrección ===');
  let orientedCorrectly = 0;
  let reachedComparison = 0;
  let turnsSum = 0;
  for (const { case: testCase, outcome } of resolvable) {
    const ok = outcome.action === 'compare' && outcome.specialty === testCase.expectedSpecialty;
    if (ok) orientedCorrectly++;
    if (outcome.action === 'compare') { reachedComparison++; turnsSum += outcome.turns; }
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${testCase.id}: esperado=${testCase.expectedSpecialty}, obtenido=${outcome.action === 'compare' ? outcome.specialty : outcome.action} (turnos=${outcome.turns})`);
  }

  console.log('\n=== Casos de señal de alarma ===');
  let redFlagsStopped = 0;
  for (const { case: testCase, outcome, caseData } of urgent) {
    const ok = outcome.action === 'stop';
    if (ok) redFlagsStopped++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${testCase.id}: esperado=stop (${testCase.expectedRedFlags.join(', ')}), obtenido=${outcome.action}${caseData ? ` (redFlags detectadas: ${caseData.redFlags.join(', ') || 'ninguna'})` : ''}`);
  }

  console.log('\n=== Casos vagos (deben preguntar, no adivinar) ===');
  let vagueAsked = 0;
  for (const { case: testCase, outcome } of vague) {
    const ok = outcome.action === 'ask';
    if (ok) vagueAsked++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${testCase.id}: obtenido=${outcome.action}${outcome.action === 'ask' ? ` — pregunta generada: "${outcome.question}"` : ''}`);
  }

  const orientationAccuracy = resolvable.length ? orientedCorrectly / resolvable.length : null;
  const redFlagCoverage = urgent.length ? redFlagsStopped / urgent.length : null;
  const avgTurnsToComparison = reachedComparison ? turnsSum / reachedComparison : null;

  console.log('\n=== Métricas ===');
  console.log(`Precisión de orientación: ${formatPct(orientationAccuracy)} (${orientedCorrectly}/${resolvable.length})`);
  console.log(`Cobertura de señales de alarma: ${formatPct(redFlagCoverage)} (${redFlagsStopped}/${urgent.length})`);
  console.log(`Turnos promedio hasta la comparación: ${avgTurnsToComparison === null ? 'sin datos' : avgTurnsToComparison.toFixed(2)} (sobre ${reachedComparison} caso(s) que llegaron a comparar)`);
  console.log(`Casos vagos que preguntaron en vez de adivinar: ${vagueAsked}/${vague.length}`);
  console.log('\nSin umbral de aprobación: estas cifras son insumo para decidir cambios, no una condición de éxito.\n');
}

function formatPct(ratio) {
  return ratio === null ? 'sin datos' : `${(ratio * 100).toFixed(0)}%`;
}

async function main() {
  const results = [];
  for (const testCase of cases) {
    try {
      results.push(await runCase(testCase));
    } catch (error) {
      console.error(`No se pudo evaluar "${testCase.id}": ${error.message}`);
      console.error('¿Está QVAC activo en el puerto 11435? Ejecuta `npm start` o `npm run qvac:start` primero.');
      process.exit(1);
    }
  }
  report(results);
}

main();
