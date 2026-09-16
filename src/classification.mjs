const PEDIATRIC_AGE_LIMIT = 12;

// Función pura sobre los datos del caso, sin entrada ni salida. Su orden es
// obligatorio: primero señales de alarma, después la especialidad faltante,
// después comparar. Invertirlo interrogaría a alguien que acaba de describir
// una convulsión. El razonamiento está en docs/adr/0001-extraccion-y-clasificacion.md.
export function classify(caseData, { questionsAsked, maxQuestions }) {
  if (caseData.redFlags.length > 0) return { action: 'stop', redFlags: caseData.redFlags };
  if (caseData.specialty === null) {
    if (questionsAsked >= maxQuestions) return { action: 'compare', specialty: 'general', approximate: true };
    return { action: 'ask', question: caseData.followUpQuestion };
  }
  return { action: 'compare', specialty: pediatricOverride(caseData), approximate: false };
}

// El umbral pediátrico es una regla sobre un entero, no comprensión del
// lenguaje: aplicarla aquí la hace fiable. El prompt también la pide, pero el
// modelo extrae la edad corregida y luego conserva la especialidad del síntoma.
function pediatricOverride(caseData) {
  return caseData.ageYears !== null && caseData.ageYears < PEDIATRIC_AGE_LIMIT ? 'pediatrics' : caseData.specialty;
}
