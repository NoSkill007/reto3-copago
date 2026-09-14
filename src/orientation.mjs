export function orient(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pecho|respirar|desmayo|inconscien|sangrado|convulsion|paralisis|suicid/.test(normalized)) return { urgent: true, message: 'Lo que describes podría requerir atención inmediata. Busca atención de urgencias. Suspendemos la comparación de precios. Esta demo no evalúa ni descarta emergencias.' };
  const specialty = /piel|picazon|sarpullido|acne/.test(normalized) ? 'dermatology' : /estomago|digest|acidez|abdomen/.test(normalized) ? 'gastro' : /rodilla|tobillo|articulacion|hombro/.test(normalized) ? 'trauma' : 'general';
  return { urgent: false, specialty };
}
