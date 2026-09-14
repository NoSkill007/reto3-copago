import { plans } from './catalog.mjs';
import { orient } from './orientation.mjs';
import { toolCatalog, toolCoverage, toolCompare } from './tools.mjs';
import { decideAction } from './qvac.mjs';
import { closeCaseState, createCaseState, getCaseState } from './case-store.mjs';
import { captureFieldAnswer, followUpFor, nextRulesStep, uncertainStep } from './conversation.mjs';

const MAX_TOOL_STEPS = 3;
const MAX_QUESTIONS = 5;

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

export async function sendMessage(caseId, text, { mode = 'qvac', turnId } = {}) {
  const activeCase = getCaseState(caseId);
  if (typeof text !== 'string' || text.trim().length < 1 || text.length > 2000) throw new Error('Describe tu mensaje (1 a 2000 caracteres).');
  if (!['qvac', 'rules'].includes(mode)) throw new Error('Modo de conversación inválido.');
  if (activeCase.urgent) return { urgent: true, message: activeCase.urgentMessage, source: 'rules' };
  const fingerprint = `${mode}\u0000${text}`;
  const cachedTurn = turnId && activeCase.turnResults.get(turnId);
  if (cachedTurn) {
    if (cachedTurn.fingerprint !== fingerprint) throw new Error('El identificador de turno no coincide con la solicitud.');
    return cachedTurn.result;
  }
  const inFlightTurn = turnId && activeCase.turnRequests.get(turnId);
  if (inFlightTurn) {
    if (inFlightTurn.fingerprint !== fingerprint) throw new Error('El identificador de turno no coincide con la solicitud.');
    return inFlightTurn.promise;
  }
  let resolveTurn;
  if (turnId) {
    const promise = new Promise(resolve => { resolveTurn = resolve; });
    activeCase.turnRequests.set(turnId, { fingerprint, promise });
  }
  const complete = result => {
    const safeResult = activeCase.urgent && !result.urgent
      ? { urgent: true, message: activeCase.urgentMessage, source: 'rules' }
      : result;
    if (turnId) {
      activeCase.turnRequests.delete(turnId);
      if (!safeResult.recovery) activeCase.turnResults.set(turnId, { fingerprint, result: safeResult });
      resolveTurn(safeResult);
    }
    return safeResult;
  };

  const orientation = orient(text);
  if (orientation.urgent) {
    activeCase.transcript.push({ role: 'user', text });
    activeCase.urgent = true;
    activeCase.urgentMessage = orientation.message;
    activeCase.comparison = null;
    activeCase.transcript.push({ role: 'agent', text: orientation.message });
    return complete({ urgent: true, message: orientation.message, source: 'rules' });
  }

  const replayingPendingTurn = activeCase.pendingRetryText === text;
  const userMessage = { role: 'user', text };
  if (!replayingPendingTurn) captureFieldAnswer(activeCase.transcript, text, activeCase.fieldAnswers);
  if (mode === 'rules') {
    activeCase.pendingRetryText = null;
    if (!replayingPendingTurn) activeCase.transcript.push(userMessage);
    return complete(rulesFlow(activeCase));
  }

  return complete(await qvacFlow(activeCase, userMessage, replayingPendingTurn));
}

async function qvacFlow(activeCase, userMessage, retryingQvac) {
  const transcript = retryingQvac ? activeCase.transcript : [...activeCase.transcript, userMessage];
  const toolResults = [];
  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const decision = await decideAction({ plan: activeCase.planId, transcript, toolResults, questionsAsked: activeCase.questionsAsked, maxQuestions: MAX_QUESTIONS });
    if (decision.action === 'failure') {
      if (!retryingQvac) activeCase.transcript.push(userMessage);
      activeCase.pendingRetryText = userMessage.text;
      return recoveryResult(decision.reason);
    }
    if (decision.action === 'ask') {
      if (activeCase.questionsAsked >= MAX_QUESTIONS) {
        activeCase.transcript.push(userMessage);
        return presentUncertain(activeCase, uncertainStep(activeCase.transcript, activeCase.askedFields, decision.field, activeCase.fieldAnswers));
      }
      const followUp = followUpFor(decision.field, transcript, activeCase.askedFields, activeCase.fieldAnswers);
      if (!followUp) return failQvacTurn(activeCase, userMessage, retryingQvac, 'invalid_response');
      if (!retryingQvac) activeCase.transcript.push(userMessage);
      activeCase.pendingRetryText = null;
      return presentQuestion(activeCase, followUp, 'qvac');
    }
    if (decision.action === 'catalog') {
      if (hasToolResult(toolResults, 'catalog')) return failQvacTurn(activeCase, userMessage, retryingQvac, 'invalid_response');
      toolResults.push({ tool: 'catalog', result: toolCatalog() });
      continue;
    }
    if (decision.action === 'coverage') {
      if (hasToolResult(toolResults, 'coverage')) return failQvacTurn(activeCase, userMessage, retryingQvac, 'invalid_response');
      toolResults.push({ tool: 'coverage', result: toolCoverage(activeCase.planId) });
      continue;
    }
    if (decision.action === 'compare') {
      if (!hasToolResult(toolResults, 'catalog') || !hasToolResult(toolResults, 'coverage')) {
        if (!hasToolResult(toolResults, 'catalog')) toolResults.push({ tool: 'catalog', result: toolCatalog() });
        if (!hasToolResult(toolResults, 'coverage')) toolResults.push({ tool: 'coverage', result: toolCoverage(activeCase.planId) });
        continue;
      }
      if (!retryingQvac) activeCase.transcript.push(userMessage);
      activeCase.pendingRetryText = null;
      return presentComparison(activeCase, decision.specialty, 'qvac');
    }
  }
  return failQvacTurn(activeCase, userMessage, retryingQvac, 'invalid_response');
}

function failQvacTurn(activeCase, userMessage, retryingQvac, reason) {
  if (!retryingQvac) activeCase.transcript.push(userMessage);
  activeCase.pendingRetryText = userMessage.text;
  return recoveryResult(reason);
}

function hasToolResult(toolResults, tool) {
  return toolResults.some(result => result.tool === tool);
}

function rulesFlow(activeCase) {
  const step = nextRulesStep(activeCase.transcript, activeCase.askedFields, activeCase.fieldAnswers);
  if (step.action === 'compare') return presentComparison(activeCase, step.specialty, 'rules');
  if (step.action === 'ask' && activeCase.questionsAsked < MAX_QUESTIONS) return presentQuestion(activeCase, step, 'rules');
  return presentUncertain(activeCase, step.action === 'uncertain' ? step : uncertainStep(activeCase.transcript, activeCase.askedFields, step.field, activeCase.fieldAnswers));
}

function presentQuestion(activeCase, followUp, source) {
  activeCase.questionsAsked++;
  activeCase.askedFields.add(followUp.field);
  activeCase.transcript.push({ role: 'agent', text: followUp.question, field: followUp.field });
  return {
    question: followUp.question,
    field: followUp.field,
    source,
    questionsAsked: activeCase.questionsAsked,
    questionsRemaining: MAX_QUESTIONS - activeCase.questionsAsked
  };
}

function presentUncertain(activeCase, uncertainty) {
  const missingText = uncertainty.missing.join(', ');
  return presentComparison(activeCase, uncertainty.specialty, 'rules', {
    uncertain: true,
    missing: uncertainty.missing,
    text: `No fue posible confirmar una especialidad porque todavía falta ${missingText}. La tabla compara una consulta inicial apropiada al contexto compartido; no es una especialidad definitiva.`
  });
}

function presentComparison(activeCase, specialty, source, options = {}) {
  const { specialtyName, rows } = toolCompare(activeCase.planId, specialty);
  activeCase.comparison = { specialty, rows };
  const text = options.text ?? (source === 'qvac'
    ? 'QVAC orientó la especialidad. La tabla usa exclusivamente el catálogo y el cálculo determinista del plan seleccionado.'
    : 'Esta orientación usa reglas de demostración, sin IA. Los importes provienen exclusivamente del cálculo determinista del plan seleccionado.');
  activeCase.transcript.push({ role: 'agent', text });
  return {
    specialty,
    specialtyName,
    rows,
    explanation: { source, text },
    ...(options.uncertain ? { uncertain: true, missing: options.missing } : {})
  };
}

function recoveryResult(reason) {
  const messages = {
    invalid_response: 'QVAC devolvió una respuesta que no superó nuestras validaciones. No mostramos precios para este turno.',
    timeout: 'QVAC tardó demasiado en responder. No mostramos precios para este turno.',
    unavailable: 'QVAC no está disponible. No mostramos precios para este turno.',
    error: 'QVAC no pudo completar la solicitud. No mostramos precios para este turno.'
  };
  return {
    recovery: { reason, canRetry: true, canUseRules: true },
    message: messages[reason] ?? messages.error,
    source: 'qvac'
  };
}
