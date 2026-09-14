import { specialties } from './catalog.mjs';
import { QUESTION_FIELDS } from './conversation.mjs';

const base = 'http://127.0.0.1:11435/v1';
const DEVICE_PREFERENCE = 'GPU dedicada → integrada → CPU compatible';

export async function qvacStatus() {
  try {
    const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return statusResult('error', 'Tu asistente de cobertura no está disponible en este momento.');
    const body = await response.json();
    const model = body.data?.find(candidate => candidate.id === 'copago');
    if (!model) return statusResult('unavailable', 'Tu asistente de cobertura no está disponible en este momento.');
    if (model.state === 'ready') return statusResult('ready', 'Tu asistente de cobertura está listo.');
    if (['loading', 'downloading', 'starting'].includes(model.state)) return statusResult('loading', 'Tu asistente de cobertura se está preparando.');
    return statusResult('error', 'Tu asistente de cobertura no está disponible en este momento. Vuelve a intentarlo más tarde.');
  } catch (error) {
    return error?.name === 'TimeoutError'
      ? statusResult('timeout', 'Tu asistente tardó demasiado en responder.')
      : statusResult('unavailable', 'Tu asistente de cobertura no está disponible en este momento.');
  }
}

function statusResult(state, message) {
  return {
    state,
    connected: state === 'ready',
    message,
    devicePreference: DEVICE_PREFERENCE,
    activeDevice: null,
    deviceEvidence: 'El dispositivo activo no está expuesto por la API de QVAC.'
  };
}

export async function decideAction({ plan, transcript, toolResults, questionsAsked = 0, maxQuestions = 5 }) {
  try {
    const specialtyList = Object.entries(specialties).map(([id, name]) => `${id}=${name}`).join(', ');
    const history = transcript.map(message => `${message.role === 'user' ? 'Paciente' : 'Agente'}: ${message.text}`).join('\n');
    const tools = toolResults.map(toolResult => `Herramienta ${toolResult.tool}: ${JSON.stringify(toolResult.result)}`).join('\n');
    const remaining = Math.max(0, maxQuestions - questionsAsked);
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: 'copago', stream: false, max_tokens: 32, temperature: 0.1, reasoning_budget: 0, remove_thinking_from_context: true,
        messages: [
          { role: 'system', content: `Return exactly one line and no explanation. Formats: COMPARE|specialty, ASK|field, CATALOG, COVERAGE. Specialties: ${Object.keys(specialties).join(', ')}. Fields: ${QUESTION_FIELDS.join(', ')}. Spanish mappings: piel or picazón -> dermatology; estómago or acidez -> gastro; rodilla or articulación -> trauma; child without specific symptom -> pediatrics; pregnancy without specific symptom -> gyn. If symptoms identify a specialty, return COMPARE with its specialty. Never ask for information already present. Example input: Paciente: Tengo picazón en la piel desde hace tres días. Example output: COMPARE|dermatology. Plan: ${plan}. Questions: ${questionsAsked}/${maxQuestions}; remaining: ${remaining}. Catalog: ${specialtyList}. /no_think` },
          { role: 'user', content: `Historial:\n${history || '(vacío)'}\n${tools ? `Herramientas consultadas:\n${tools}\n` : ''}Opción:` }
        ]
      })
    });
    if (!response.ok) return failure(response.status >= 500 ? 'unavailable' : 'error');
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return parseDecision(content);
  } catch (error) {
    return failure(error?.name === 'TimeoutError' ? 'timeout' : 'unavailable');
  }
}

function parseDecision(content) {
  if (!content) return failure('invalid_response');
  const normalized = content.trim().toUpperCase();
  if (normalized === 'CATALOG') return { action: 'catalog' };
  if (normalized === 'COVERAGE') return { action: 'coverage' };
  const ask = normalized.match(/^ASK\|([A-Z_]+)$/);
  if (ask) {
    const field = ask[1].toLowerCase();
    return QUESTION_FIELDS.includes(field) ? { action: 'ask', field } : failure('invalid_response');
  }
  const compare = normalized.match(/^COMPARE\|([A-Z_]+)$/);
  if (compare) {
    const specialty = compare[1].toLowerCase();
    return Object.hasOwn(specialties, specialty) ? { action: 'compare', specialty } : failure('invalid_response');
  }
  return failure('invalid_response');
}

function failure(reason) {
  return { action: 'failure', reason };
}
