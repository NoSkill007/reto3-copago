import { chatCompletion } from './qvac.mjs';

const EXPLANATION_TIMEOUT_MS = 20000;

// Segunda llamada al modelo, solo en el turno final. Recibe las cifras ya
// calculadas y las copia: no genera ninguna. Si falla o tarda, se usa la
// plantilla, que convierte una falla del modelo en una prosa más pobre en vez
// de una respuesta rota. No se verifica que las cifras del texto coincidan con
// las calculadas: la tabla contigua es la fuente autoritativa.
export async function explainComparison({ plan, specialtyName, rows, caseData, approximate }) {
  const fallback = templateText(specialtyName, approximate);
  const completion = await chatCompletion({
    max_tokens: 320,
    temperature: 0.6,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt({ plan, specialtyName, rows, caseData, approximate }) }
    ]
  }, EXPLANATION_TIMEOUT_MS);
  if (!completion.ok) return { source: 'template', text: fallback };
  const text = completion.content.trim();
  return text ? { source: 'qvac', text } : { source: 'template', text: fallback };
}

export function templateText(specialtyName, approximate) {
  return approximate
    ? `No logramos precisar la especialidad con lo que nos contaste, así que te orientamos con ${specialtyName} y esta estimación es aproximada. Aquí puedes comparar el gasto estimado de una consulta en cada hospital.`
    : `Con base en lo que nos contaste, te sugerimos consultar con ${specialtyName}. Aquí puedes comparar el gasto estimado de una consulta en cada hospital.`;
}

function systemPrompt() {
  return [
    'Eres el asistente de cobertura y le hablas al paciente en una demo de Panamá.',
    'Usa español de Panamá, cercano y sin jerga aseguradora. Trátalo de tú.',
    '',
    'Le hablas a él: nunca escribas en primera persona sobre sus molestias ni sobre su edad.',
    'No repitas sus datos como si fueran tuyos ni los enumeres; úsalos solo para decir por qué corresponde esa especialidad.',
    '',
    'Escribe dos o tres oraciones seguidas, sin listas, sin títulos, sin saludo y sin despedida.',
    'Empieza por la especialidad que le corresponde y por qué, antes de cualquier cifra.',
    'Menciona el hospital en red más conveniente con su gasto estimado.',
    'Sobre los hospitales fuera de la red, di exactamente lo que te indiquen los datos y nada más: si te dicen que no hay ninguno, no los menciones.',
    '',
    'Copia únicamente las cifras que te entrego, tal como te las entrego. Nunca calcules, estimes ni redondees una cifra propia.',
    'No digas nunca que la consulta es urgente, grave o prioritaria, ni cuándo debe atenderse: esta herramienta no evalúa urgencias.',
    'No des un diagnóstico, no nombres enfermedades y no prometas cobertura garantizada: esto orienta un gasto, no diagnostica.',
    '',
    'Ejemplo del tono y la forma que se esperan:',
    '"Por la molestia en la piel que nos describiste, la consulta que te corresponde es con Dermatología. En Centro Médico La Ceiba tu gasto estimado es de USD 25.00, que es la opción más conveniente de tu red. Si vas a un hospital fuera de tu red, como Hospital Jardines del Canal, pagarías la tarifa completa de USD 95.00."'
  ].join('\n');
}

function userPrompt({ plan, specialtyName, rows, caseData, approximate }) {
  const inNetwork = rows.filter(row => row.covered);
  const outOfNetwork = rows.filter(row => !row.covered);
  return [
    `Plan: ${plan.name}, copago ${money(plan.copay)} y coaseguro ${plan.coinsurance}% del saldo.`,
    `Especialidad: ${specialtyName}.`,
    `Motivo de la orientación: ${reason(caseData, approximate)}`,
    'Hospitales en red, del más conveniente al menos conveniente:',
    ...inNetwork.map(row => `- ${row.name}: gasto estimado ${money(row.patient)} (copago ${money(row.copay)} + coaseguro ${money(row.coinsurance)}); el seguro cubre ${money(row.insurer)} de una consulta de ${money(row.rate)}.`),
    ...networkInstruction(outOfNetwork),
    'Escribe la explicación.'
  ].join('\n');
}

// Con Istmo Plus la red cubre los cinco hospitales del catálogo. Sin decírselo,
// el modelo copiaba la forma del ejemplo e inventaba un hospital fuera de la
// red, poniéndole como tarifa completa el precio de consulta de uno que sí
// estaba cubierto.
function networkInstruction(outOfNetwork) {
  if (!outOfNetwork.length) {
    return ['Este plan cubre en su red todos los hospitales del catálogo: no menciones hospitales fuera de la red ni tarifas completas, porque no hay ninguno.'];
  }
  return [
    'Hospitales fuera de la red, donde paga la tarifa completa:',
    ...outOfNetwork.map(row => `- ${row.name}: ${money(row.patient)}.`),
    'Menciona que fuera de la red paga la tarifa completa, citando uno de esos hospitales con su cifra.'
  ];
}

function reason(caseData, approximate) {
  if (approximate) return 'no se pudo precisar la especialidad con lo que contaste, así que la orientación es aproximada; dilo con claridad y sin inventar un motivo.';
  const details = [
    caseData.ageYears !== null && caseData.ageYears < 12 ? 'se trata de un menor de edad, y por eso corresponde pediatría' : null,
    caseData.isPregnant === true ? 'hay un embarazo' : null
  ].filter(Boolean);
  return details.length ? `la molestia que describiste y que ${details.join(', y que ')}.` : 'la molestia que describiste.';
}

function money(cents) {
  return `USD ${(cents / 100).toFixed(2)}`;
}
