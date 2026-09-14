import { analyzeContext } from './orientation.mjs';

const FOLLOW_UP_FIELDS = {
  details: { question: '¿Cuál es la molestia principal que quieres explorar?', label: 'la molestia principal' },
  age: { question: '¿Qué edad tiene la persona que presenta las molestias?', label: 'la edad de la persona' },
  pregnancy: { question: '¿Hay un embarazo que debamos considerar en esta orientación?', label: 'si existe un embarazo relevante' },
  duration: { question: '¿Desde cuándo tienes estas molestias?', label: 'la duración de las molestias' },
  severity: { question: '¿Qué tan intensas son las molestias en este momento?', label: 'la intensidad actual' },
  impact: { question: '¿Las molestias te impiden realizar alguna actividad cotidiana?', label: 'el impacto en las actividades cotidianas' }
};

export const QUESTION_FIELDS = Object.keys(FOLLOW_UP_FIELDS);

export function captureFieldAnswer(transcript, text, fieldAnswers) {
  const field = [...transcript].reverse().find(message => message.role === 'agent' && message.field)?.field;
  if (!field || fieldAnswers.has(field)) return;
  const value = text.trim();
  if (field === 'age') {
    const age = Number(value.match(/^(?:tengo|tiene)?\s*(\d{1,3})(?:\s*años?)?\.?$/i)?.[1]);
    if (Number.isInteger(age) && age >= 0 && age <= 120) fieldAnswers.set(field, age);
    return;
  }
  if (field === 'pregnancy') {
    if (/\b(s[ií]|sí|embarazada|embarazo)\b/i.test(value)) fieldAnswers.set(field, true);
    if (/\b(no|ninguno|ninguna)\b/i.test(value)) fieldAnswers.set(field, false);
    return;
  }
  if (value) fieldAnswers.set(field, value);
}

export function conversationContext(transcript, fieldAnswers = new Map()) {
  const text = transcript.filter(message => message.role === 'user').map(message => message.text).join(' ');
  const inferred = analyzeContext(text);
  return {
    ...inferred,
    age: fieldAnswers.get('age') ?? inferred.age,
    pregnancy: fieldAnswers.has('pregnancy') ? fieldAnswers.get('pregnancy') : inferred.pregnancy,
    durationKnown: fieldAnswers.has('duration') || inferred.durationKnown,
    detailsKnown: fieldAnswers.has('details') || inferred.symptomSpecialty !== null || hasConcreteDetail(transcript),
    severityKnown: fieldAnswers.has('severity'),
    impactKnown: fieldAnswers.has('impact')
  };
}

function hasConcreteDetail(transcript) {
  const symptomMarker = /\b(dolor|fiebre|tos|picaz[oó]n|roncha|sarpullido|acn[eé]|acidez|ardor|n[aá]usea|v[oó]mito|diarrea|mareo|sangrado|herida|lesi[oó]n|hinchaz[oó]n|cansancio|deca[ií]do|molestia(?:s)?\s+(?:en|de)|me duele)\b/i;
  return transcript.some(message => message.role === 'user' && symptomMarker.test(message.text));
}

export function followUpFor(field, transcript, askedFields, fieldAnswers) {
  if (!QUESTION_FIELDS.includes(field) || askedFields.has(field)) return null;
  const context = conversationContext(transcript, fieldAnswers);
  const alreadyKnown = field === 'details' ? context.detailsKnown
    : field === 'age' ? context.age !== null
    : field === 'pregnancy' ? context.pregnancy !== null
    : field === 'duration' ? context.durationKnown
    : field === 'severity' ? context.severityKnown
    : context.impactKnown;
  if (alreadyKnown) return null;
  return { field, question: FOLLOW_UP_FIELDS[field].question };
}

export function nextRulesStep(transcript, askedFields, fieldAnswers) {
  const context = conversationContext(transcript, fieldAnswers);
  if (context.symptomSpecialty || context.pregnancy === true || (context.age !== null && context.age < 12)) {
    return { action: 'compare', specialty: context.symptomSpecialty ? context.specialty : initialSpecialty(context) };
  }
  const field = QUESTION_FIELDS.find(candidate => followUpFor(candidate, transcript, askedFields, fieldAnswers));
  return field ? { action: 'ask', ...followUpFor(field, transcript, askedFields, fieldAnswers) } : { action: 'uncertain', specialty: initialSpecialty(context), missing: missingLabels(context, askedFields) };
}

export function uncertainStep(transcript, askedFields, requestedField, fieldAnswers) {
  const context = conversationContext(transcript, fieldAnswers);
  const requested = QUESTION_FIELDS.includes(requestedField) ? [FOLLOW_UP_FIELDS[requestedField].label] : [];
  return {
    specialty: initialSpecialty(context),
    missing: [...new Set([...requested, ...missingLabels(context, askedFields)])]
  };
}

function initialSpecialty(context) {
  if (context.age !== null && context.age < 12) return 'pediatrics';
  if (context.pregnancy === true) return 'gyn';
  return 'general';
}

function missingLabels(context, askedFields) {
  const missing = [];
  if (!context.detailsKnown) missing.push(FOLLOW_UP_FIELDS.details.label);
  if (context.age === null && askedFields.has('age')) missing.push(FOLLOW_UP_FIELDS.age.label);
  if (context.pregnancy === null && askedFields.has('pregnancy')) missing.push(FOLLOW_UP_FIELDS.pregnancy.label);
  if (!context.durationKnown && askedFields.has('duration')) missing.push(FOLLOW_UP_FIELDS.duration.label);
  if (!context.severityKnown && askedFields.has('severity')) missing.push(FOLLOW_UP_FIELDS.severity.label);
  if (!context.impactKnown && askedFields.has('impact')) missing.push(FOLLOW_UP_FIELDS.impact.label);
  return missing.length ? missing : ['el contexto necesario para orientar la especialidad'];
}
