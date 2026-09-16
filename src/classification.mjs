// Función pura sobre los datos del caso, sin entrada ni salida. Su orden es
// obligatorio: primero señales de alarma, después la especialidad faltante,
// después comparar. Invertirlo interrogaría a alguien que acaba de describir
// una convulsión. El razonamiento está en docs/adr/0001-extraccion-y-clasificacion.md.
//
// La especialidad es del modelo. El umbral pediátrico se intentó aquí como
// regla sobre `ageYears` y se retiró: la edad no dice de quién es, y en una
// conversación que pasa de un niño a otra persona la regla orientaba a
// pediatría la molestia de un adulto. Una regla determinista sobre un dato
// ambiguo es peor que ninguna.
export function classify(caseData, { questionsAsked, maxQuestions }) {
  if (caseData.redFlags.length > 0) return { action: 'stop', redFlags: caseData.redFlags };
  if (caseData.specialty === null) {
    if (questionsAsked >= maxQuestions) return { action: 'compare', specialty: 'general', approximate: true };
    return { action: 'ask', question: caseData.followUpQuestion, options: caseData.followUpOptions };
  }
  return { action: 'compare', specialty: caseData.specialty, approximate: false };
}
