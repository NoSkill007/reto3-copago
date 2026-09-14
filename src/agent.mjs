import { randomUUID } from 'node:crypto';
import { plans } from './catalog.mjs';
import { orient } from './orientation.mjs';
import { toolCatalog, toolCoverage, toolCompare } from './tools.mjs';
import { decideAction } from './qvac.mjs';

const MAX_TOOL_STEPS = 3;
const MAX_QUESTIONS = 5;
const UNCERTAIN_MESSAGE = 'Después de varias preguntas, la información sigue siendo insuficiente para una orientación segura. Comparamos una consulta inicial como punto de partida según lo que sí compartiste; no es una especialidad definitiva.';
const cases = new Map();

export function startCase(planId) {
  const plan = plans.find(p => p.id === planId);
  if (!plan) throw new Error('Plan inválido.');
  const caseId = randomUUID();
  cases.set(caseId, { planId, transcript: [], urgent: false, comparison: null, questionsAsked: 0 });
  return {
    caseId,
    plan: { id: plan.id, name: plan.name, description: plan.description, copay: plan.copay, coinsurance: plan.coinsurance }
  };
}

function getCase(caseId) {
  const found = cases.get(caseId);
  if (!found) throw new Error('Caso no encontrado.');
  return found;
}

export async function sendMessage(caseId, text) {
  const activeCase = getCase(caseId);
  if (typeof text !== 'string' || text.trim().length < 2 || text.length > 2000) throw new Error('Describe tu mensaje (2 a 2000 caracteres).');
  activeCase.transcript.push({ role: 'user', text });

  if (activeCase.urgent) return { urgent: true, message: activeCase.urgentMessage, source: 'rules' };

  const orientation = orient(text);
  if (orientation.urgent) {
    activeCase.urgent = true;
    activeCase.urgentMessage = orientation.message;
    activeCase.comparison = null;
    activeCase.transcript.push({ role: 'agent', text: orientation.message });
    return { urgent: true, message: orientation.message, source: 'rules' };
  }

  const toolResults = [];
  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const decision = await decideAction({ plan: activeCase.planId, transcript: activeCase.transcript, toolResults, questionsAsked: activeCase.questionsAsked, maxQuestions: MAX_QUESTIONS });
    if (decision.action === 'ask') {
      if (activeCase.questionsAsked >= MAX_QUESTIONS) return presentComparison(activeCase, contextSpecialty(activeCase), UNCERTAIN_MESSAGE, 'rules', true);
      activeCase.questionsAsked++;
      activeCase.transcript.push({ role: 'agent', text: decision.question });
      return { question: decision.question, source: 'qvac', questionsAsked: activeCase.questionsAsked, questionsRemaining: MAX_QUESTIONS - activeCase.questionsAsked };
    }
    if (decision.action === 'catalog') { toolResults.push({ tool: 'catalog', result: toolCatalog() }); continue; }
    if (decision.action === 'coverage') { toolResults.push({ tool: 'coverage', result: toolCoverage(activeCase.planId) }); continue; }
    if (decision.action === 'compare') return presentComparison(activeCase, decision.specialty, sanitizeExplanation(decision.explanation), 'qvac');
    break; // acción no permitida o de fallback: degradar a modo de reglas
  }
  return fallbackFlow(activeCase);
}

function sanitizeExplanation(explanation) {
  return typeof explanation === 'string' && explanation.trim() && !/\d|\$/.test(explanation) ? explanation.trim() : null;
}

function presentComparison(activeCase, specialty, explanationText, source, uncertain = false) {
  const { specialtyName, rows } = toolCompare(activeCase.planId, specialty);
  activeCase.comparison = { specialty, rows };
  const text = explanationText ?? (source === 'qvac'
    ? 'La tabla muestra el gasto estimado de tu consulta con este plan, ordenado primero por menor gasto en tu red.'
    : 'La tabla muestra el gasto estimado de tu consulta con tu plan. QVAC no está disponible: esta respuesta usa el modo de reglas, sin IA.');
  activeCase.transcript.push({ role: 'agent', text });
  return { specialty, specialtyName, rows, explanation: { source, text }, ...(uncertain ? { uncertain: true } : {}) };
}

// Nunca ve urgencia aquí: cualquier mensaje urgente ya interrumpió el caso
// (arriba) en el momento en que se envió, antes de llegar a este punto.
function fallbackFlow(activeCase) {
  return presentComparison(activeCase, contextSpecialty(activeCase), null, 'rules');
}

// Deriva la especialidad de todo lo que el paciente ya escribió (síntomas,
// edad, embarazo), sin inventar nada que no haya sido aportado.
function contextSpecialty(activeCase) {
  const allUserText = activeCase.transcript.filter(m => m.role === 'user').map(m => m.text).join(' ');
  return orient(allUserText).specialty;
}
