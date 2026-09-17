import { chatCompletion } from './qvac.mjs';

const EXPLANATION_TIMEOUT_MS = 90000;

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
    'Lo que tu explicación tiene que lograr, en dos o tres oraciones seguidas, sin listas ni saludos:',
    'que entienda qué especialidad le toca y por qué, antes de cualquier cifra;',
    'que sepa cuánto le costaría la opción más conveniente de su red y en qué hospital;',
    'y lo que los datos te indiquen sobre los hospitales fuera de su red.',
    '',
    'Escríbelo con tus palabras y apóyate en lo que este caso tenga de particular:',
    'los días que lleva la molestia, la edad, el plan que tiene, cuánto le ahorra el seguro o la diferencia con el hospital más caro.',
    'No sigas una fórmula fija: dos casos distintos no deberían leerse igual.',
    'Háblale de tú, sin empezar las oraciones con el pronombre "tú", y nunca escribas en primera persona sobre sus molestias ni su edad.',
    'Preséntalo como una orientación y no como una orden: le corresponde o le conviene una consulta, no "tienes que ir".',
    '',
    'Reglas que no puedes romper:',
    'La especialidad es exactamente la que te doy en "Especialidad": cópiala tal cual y no nombres ninguna otra, aunque los datos del caso te sugieran otra.',
    'Copia únicamente las cifras que te entrego, tal como te las entrego. Nunca calcules, estimes ni redondees una cifra propia.',
    'Cada cifra significa lo que dice su etiqueta y nada más: el gasto estimado es lo que paga el paciente; el copago y el coaseguro son las dos partes de ese gasto y las paga él; lo que cubre el seguro es lo que él no paga; y la consulta es la tarifa completa.',
    'No redistribuyas ni recombines esas cifras, y no expliques una como si fuera otra.',
    'No digas que ya le contaste algo antes ni te refieras a turnos anteriores de la conversación.',
    'Sobre los hospitales fuera de la red di exactamente lo que te indiquen los datos: si te dicen que no hay ninguno, no los menciones.',
    'No digas nunca que la consulta es urgente, grave o prioritaria, ni cuándo debe atenderse: esta herramienta no evalúa urgencias.',
    'No des un diagnóstico, no nombres enfermedades y no prometas cobertura garantizada: esto orienta un gasto, no diagnostica.'
  ].join('\n');
}

function userPrompt({ plan, specialtyName, rows, caseData, approximate }) {
  const inNetwork = rows.filter(row => row.covered);
  const outOfNetwork = rows.filter(row => !row.covered);
  return [
    `Plan: ${plan.name}, copago ${money(plan.copay)} y coaseguro ${plan.coinsurance}% del saldo.`,
    `Especialidad: ${specialtyName}.`,
    `Lo que contó el paciente: ${reason(caseData, approximate)}`,
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

// Los datos del caso se entregan como hechos y nunca nombran una especialidad.
// Esta función afirmaba "y por eso corresponde pediatría" en cuanto la edad
// bajaba de doce, y el modelo lo copiaba: escribía Pediatría sobre una tabla
// de Dermatología, con las cifras de dermatología al lado.
function reason(caseData, approximate) {
  if (approximate) return 'no se pudo precisar la especialidad con lo que contaste, así que la orientación es aproximada; dilo con claridad y sin inventar un motivo.';
  const details = [
    caseData.ageYears !== null ? `la persona con esta molestia tiene ${caseData.ageYears} año(s)` : null,
    caseData.isPregnant === true ? 'hay un embarazo' : null
  ].filter(Boolean);
  return details.length ? `la molestia que describiste, y ${details.join(', y ')}.` : 'la molestia que describiste.';
}

function money(cents) {
  return `USD ${(cents / 100).toFixed(2)}`;
}
