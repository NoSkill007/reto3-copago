export function orient(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pecho|respirar|desmayo|inconscien|sangrado|convulsion|paralisis|suicid/.test(normalized)) return { urgent: true, message: 'Lo que describes podría requerir atención inmediata. Busca atención de urgencias. Suspendemos la comparación de precios. Esta demo no evalúa ni descarta emergencias.' };
  const age = extractAge(normalized);
  const pregnant = /embarazad|embarazo|gestante/.test(normalized);
  const specialty = /piel|picazon|sarpullido|acne/.test(normalized) ? 'dermatology'
    : /estomago|digest|acidez|abdomen/.test(normalized) ? 'gastro'
    : /rodilla|tobillo|articulacion|hombro/.test(normalized) ? 'trauma'
    : pregnant ? 'gyn'
    : age !== null && age < 12 ? 'pediatrics'
    : 'general';
  return { urgent: false, specialty };
}

// El lookbehind excluye "desde hace 3 años" / "hace 3 años": esa frase da la
// duración del síntoma, no la edad del paciente.
function extractAge(normalized) {
  const years = normalized.match(/(?<!hace )(\d{1,3})\s*(anos|ano)\b/);
  if (years) return parseInt(years[1], 10);
  if (/\b(bebe|lactante|recien nacido|meses de edad|meses de nacid)/.test(normalized)) return 0;
  return null;
}
