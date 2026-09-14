import { specialtyDefinitions } from './catalog.mjs';

export function analyzeContext(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const urgent = /pecho|respirar|desmayo|inconscien|sangrado|convulsion|paralisis|suicid/.test(normalized);
  const age = extractAge(normalized);
  const pregnancy = extractPregnancy(normalized);
  const symptomSpecialty = Object.entries(specialtyDefinitions).find(([, definition]) => definition.keywords.some(keyword => normalized.includes(keyword)))?.[0] ?? null;
  const specialty = symptomSpecialty
    ?? (pregnancy === true ? 'gyn'
    : age !== null && age < 12 ? 'pediatrics'
    : 'general');
  const durationKnown = /\b(?:desde\s+)?hace\s+(?:\d+|un|una|dos|tres|varios?)\s*(?:horas?|dias?|semanas?|meses?|anos?)\b|\bdesde\s+(?:ayer|hoy|anoche)\b/.test(normalized);
  return { urgent, age, pregnancy, durationKnown, symptomSpecialty, specialty };
}

export function orient(text) {
  const context = analyzeContext(text);
  if (context.urgent) return { urgent: true, message: 'Lo que describes podría requerir atención inmediata. Busca atención de urgencias. Suspendemos la comparación de precios. Esta demo no evalúa ni descarta emergencias.' };
  return { urgent: false, specialty: context.specialty, confident: context.symptomSpecialty !== null || context.pregnancy === true || (context.age !== null && context.age < 12) };
}

// El lookbehind excluye "desde hace 3 años" / "hace 3 años": esa frase da la
// duración del síntoma, no la edad del paciente.
function extractAge(normalized) {
  const years = normalized.match(/(?<!hace )(\d{1,3})\s*(anos|ano)\b/);
  if (years) return parseInt(years[1], 10);
  if (/\b(bebe|lactante|recien nacido|meses de edad|meses de nacid)/.test(normalized)) return 0;
  return null;
}

function extractPregnancy(normalized) {
  if (/\bno\s+(?:estoy|esta|hay|es)\s+(?:embarazad|embarazo|gestante)/.test(normalized)) return false;
  if (/embarazad|embarazo|gestante/.test(normalized)) return true;
  return null;
}
