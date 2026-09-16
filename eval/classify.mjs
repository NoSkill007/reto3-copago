// Función pura de clasificación usada solo por el arnés de evaluación.
// Replica el orden obligatorio descrito en docs/tickets/6.md: primero señales
// de alarma, después campos faltantes, después comparar. La entrega 3 la
// formaliza como módulo de producción; aquí mide el comportamiento del modelo
// por adelantado.

export function classify(caseData, { questionsAsked, maxQuestions }) {
  if (caseData.redFlags.length > 0) return { action: 'stop' };
  if (caseData.specialty === null) {
    if (questionsAsked >= maxQuestions) return { action: 'compare', specialty: 'general', approximate: true };
    return { action: 'ask' };
  }
  return { action: 'compare', specialty: caseData.specialty, approximate: false };
}
