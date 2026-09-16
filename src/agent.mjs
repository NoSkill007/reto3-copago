import { plans } from './catalog.mjs';
import { toolCompare } from './tools.mjs';
import { explainComparison, templateText } from './explanation.mjs';
import { extractCase } from './extraction.mjs';
import { classify } from './classification.mjs';
import { closeCaseState, createCaseState, getCaseState } from './case-store.mjs';

const MAX_QUESTIONS = 5;
const URGENT_MESSAGE = 'Por las señales que describes, busca atención de urgencias ahora. No mostraremos precios ni intentaremos orientar una especialidad. Esta herramienta no evalúa ni descarta una emergencia.';

export function startCase(planId, previousCaseId, previousCloseToken) {
  const plan = plans.find(candidate => candidate.id === planId);
  if (!plan) throw new Error('Plan inválido.');
  if (previousCaseId && !closeCaseState(previousCaseId, previousCloseToken)) throw new Error('No se pudo reemplazar el caso anterior.');
  const { caseId, closeToken } = createCaseState(planId);
  return {
    caseId,
    closeToken,
    plan: { id: plan.id, name: plan.name, description: plan.description, copay: plan.copay, coinsurance: plan.coinsurance, conditions: plan.conditions }
  };
}

export function changePlan(caseId, planId) {
  const activeCase = getCaseState(caseId);
  const plan = plans.find(candidate => candidate.id === planId);
  if (!plan) throw new Error('Plan inválido.');
  if (activeCase.urgent) return urgentResult();

  activeCase.planId = planId;
  // Los resultados cacheados llevan las cifras del plan anterior: reproducir un
  // turno con su identificador devolvería precios que ya no corresponden.
  activeCase.turnResults.clear();
  if (!activeCase.comparison) return { plan: planId };

  const { specialty, approximate } = activeCase.comparison;
  const { specialtyName, rows } = toolCompare(planId, specialty);
  activeCase.comparison = { specialty, approximate, rows };
  return {
    plan: planId,
    specialty,
    specialtyName,
    approximate,
    rows,
    understood: understood(activeCase.caseData ?? emptyCaseData(), specialty),
    // Recalcular no llama al modelo, así que la prosa es la plantilla: el
    // paciente ve los importes nuevos de inmediato y no una explicación que
    // todavía cita las cifras del plan anterior.
    explanation: { source: 'template', text: templateText(specialtyName, approximate) },
    estimate: estimateNote()
  };
}

export async function sendMessage(caseId, text, { turnId } = {}) {
  const activeCase = getCaseState(caseId);
  if (typeof text !== 'string' || text.trim().length < 1 || text.length > 2000) throw new Error('Describe tu mensaje (1 a 2000 caracteres).');
  if (activeCase.urgent) return urgentResult();

  const cachedTurn = turnId && activeCase.turnResults.get(turnId);
  if (cachedTurn) {
    if (cachedTurn.text !== text) throw new Error('El identificador de turno no coincide con la solicitud.');
    return cachedTurn.result;
  }
  const inFlightTurn = turnId && activeCase.turnRequests.get(turnId);
  if (inFlightTurn) {
    if (inFlightTurn.text !== text) throw new Error('El identificador de turno no coincide con la solicitud.');
    return inFlightTurn.promise;
  }

  let resolveTurn;
  let rejectTurn;
  if (turnId) {
    const promise = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
    promise.catch(() => {});
    activeCase.turnRequests.set(turnId, { text, promise });
  }

  try {
    const result = await runTurn(activeCase, text);
    const safeResult = activeCase.urgent && !result.urgent ? urgentResult() : result;
    if (turnId) {
      activeCase.turnRequests.delete(turnId);
      if (!safeResult.recovery) activeCase.turnResults.set(turnId, { text, result: safeResult });
      resolveTurn(safeResult);
    }
    return safeResult;
  } catch (error) {
    if (turnId) {
      activeCase.turnRequests.delete(turnId);
      rejectTurn(error);
    }
    throw error;
  }
}

async function runTurn(activeCase, text) {
  recordPatientMessage(activeCase, text);

  const extraction = await extractCase(activeCase.transcript);
  if (!extraction.ok) return recoveryResult(extraction.reason);

  activeCase.caseData = extraction.caseData;
  const decision = classify(extraction.caseData, { questionsAsked: activeCase.questionsAsked, maxQuestions: MAX_QUESTIONS });
  if (decision.action === 'stop') return stopForUrgency(activeCase);
  if (decision.action === 'ask') return presentQuestion(activeCase, decision);
  return await presentComparison(activeCase, decision.specialty, decision.approximate);
}

// La transcripción contiene solo evidencia sobre el paciente: lo que dijo y las
// preguntas a las que responde. Las conclusiones del agente se quedan fuera a
// propósito. Cuando estaban dentro, la extracción las leía de vuelta y repetía
// la especialidad ya anunciada, así que una corrección de la edad no llegaba a
// cambiar nada: un "perdón, tiene 22 años" seguía saliendo en pediatría.
function recordPatientMessage(activeCase, text) {
  if (activeCase.transcript.at(-1)?.text !== text) activeCase.transcript.push({ role: 'user', text });
}

function stopForUrgency(activeCase) {
  activeCase.urgent = true;
  activeCase.comparison = null;
  return urgentResult();
}

function urgentResult() {
  return { urgent: true, message: URGENT_MESSAGE, source: 'safety' };
}

function presentQuestion(activeCase, { question, options }) {
  activeCase.questionsAsked++;
  activeCase.transcript.push({ role: 'agent', text: question });
  return {
    question,
    message: question,
    source: 'qvac',
    understood: understood(activeCase.caseData),
    // La interfaz pinta un botón por respuesta rápida sin interpretar la
    // pregunta: quien sabe si es cerrada es el modelo que la redactó.
    ...(options.length ? { quickAnswers: options } : {}),
    questionsAsked: activeCase.questionsAsked,
    questionsRemaining: MAX_QUESTIONS - activeCase.questionsAsked
  };
}

async function presentComparison(activeCase, specialty, approximate) {
  const { specialtyName, rows } = toolCompare(activeCase.planId, specialty);
  activeCase.comparison = { specialty, approximate, rows };
  const plan = plans.find(candidate => candidate.id === activeCase.planId);
  const explanation = await explainComparison({ plan, specialtyName, rows, caseData: activeCase.caseData, approximate });
  return {
    specialty,
    specialtyName,
    approximate,
    rows,
    understood: understood(activeCase.caseData, specialty),
    explanation,
    estimate: estimateNote()
  };
}

function estimateNote() {
  return {
    source: 'demo',
    generatedAt: new Date().toISOString(),
    visitType: 'Consulta ambulatoria inicial',
    exclusions: ['Medicamentos, exámenes y procedimientos', 'Deducibles, límites o autorizaciones que puedan existir en una póliza real'],
    confirmation: 'Para confirmar una cobertura real, el hospital y la aseguradora deben validar la consulta y el beneficio vigente.'
  };
}

function emptyCaseData() {
  return { specialty: null, ageYears: null, isPregnant: null, durationDays: null };
}

// Lo que el agente entendió del caso, para que el paciente detecte a tiempo un
// error. La interfaz lo presenta como fichas. La especialidad es la que la
// clasificación acabó usando, no la que el modelo propuso, para que las fichas
// no contradigan la orientación que el paciente está leyendo.
function understood(caseData, specialty = caseData.specialty) {
  return { specialty, ageYears: caseData.ageYears, isPregnant: caseData.isPregnant, durationDays: caseData.durationDays };
}

function recoveryResult(reason) {
  const messages = {
    timeout: 'Tu asistente tardó demasiado en responder. No mostraremos precios para este turno.',
    unavailable: 'Tu asistente no está disponible en este momento. No mostraremos precios para este turno.',
    error: 'No pudimos completar la orientación. No mostraremos precios para este turno.'
  };
  return {
    recovery: { reason, canRetry: true },
    message: messages[reason] ?? messages.error,
    source: 'qvac'
  };
}
