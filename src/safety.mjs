import { analyzeContext } from './orientation.mjs';

const CHILD_FEVER_QUESTION = 'Antes de explorar la cobertura: ¿tiene dificultad para respirar, labios o cara azulados, convulsiones, está muy somnoliento o difícil de despertar, no puede beber, vomita todo o muestra signos de deshidratación? Responde sí, no o cuéntame qué observas.';
const CHILD_FEVER_URGENT = 'Por las señales que describes, busca atención de urgencias ahora. No mostraremos precios ni intentaremos orientar una especialidad. Esta herramienta no evalúa ni descarta una emergencia.';

export function childFeverSafetyCheck(text) {
  const context = analyzeContext(text);
  const normalized = normalize(text);
  if (context.age !== null && context.age < 12 && /\bfiebre|calentura|temperatura\b/.test(normalized)) {
    return { kind: 'child_fever', question: CHILD_FEVER_QUESTION };
  }
  return null;
}

export function resolveChildFeverSafety(text) {
  const normalized = normalize(text);
  if (hasDangerSign(normalized)) return { urgent: true, message: CHILD_FEVER_URGENT };
  if (/\b(no|ninguna|ninguno|sin)\b/.test(normalized)) return { cleared: true };
  return { question: CHILD_FEVER_QUESTION };
}

function hasDangerSign(text) {
  return /dificultad\s+(?:para\s+)?respirar|cuesta\s+respirar|respira\s+(?:muy\s+)?rapido|labios?\s+(?:azules?|morados?)|cara\s+(?:azul|morada)|convulsion|no\s+(?:puede|quiere)\s+(?:beber|tomar)|vomita\s+todo|no\s+orina|sin\s+lagrimas|muy\s+(?:somnolient|decaid)|dificil\s+de\s+despertar|inconsciente/.test(text);
}

function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
