import { specialtyDefinitions } from './catalog.mjs';
import { chatCompletion } from './qvac.mjs';

const EXTRACTION_TIMEOUT_MS = 120000;
const DEFAULT_FOLLOW_UP = '¿Puedes contarme un poco más sobre la molestia que quieres explorar?';

// Cada señal de alarma va acompañada de cómo la describe un paciente, porque el
// modelo tiene que reconocerla en el lenguaje propio y no en la etiqueta. No es
// una lista de palabras clave: nada de esto se busca en el texto.
const RED_FLAG_CUES = {
  dificultad_respiratoria: 'le cuesta respirar, respira muy rápido o agitado, se hunden las costillas al respirar, no puede hablar de corrido',
  labios_azules: 'labios, cara o uñas morados, azulados o grises',
  convulsion: 'convulsión, ataque, temblores sin control, se puso tieso, ojos en blanco',
  no_despierta: 'no reacciona a nada, imposible de despertar, desmayado, inconsciente; estar decaído o dormir más de lo normal no basta',
  no_bebe_liquidos: 'lleva horas rechazando todo líquido, el pecho, el agua o el biberón; no querer comer sólidos no cuenta',
  vomito_persistente: 'vomita todo lo que toma, vomita repetidamente o cada pocos minutos u horas, no retiene nada',
  sangrado_abundante: 'sangra mucho, no para de sangrar, sangrado que empapa, hemorragia',
  deshidratacion: 'boca o lengua muy seca, llora sin lágrimas, no orina o casi no orina, ojos hundidos, piel sin elasticidad'
};

export const RED_FLAGS = Object.keys(RED_FLAG_CUES);

// Una sola llamada por turno: recibe la transcripción completa y devuelve los
// datos del caso, que se reemplazan por completo en cada turno. La gramática de
// `response_format` restringe la forma; `validate` protege el significado.
export async function extractCase(transcript) {
  const specialtyIds = Object.keys(specialtyDefinitions);
  const history = transcript.map(message => `${message.role === 'user' ? 'Paciente' : 'Agente'}: ${message.text}`).join('\n');
  const completion = await chatCompletion({
    max_tokens: 200,
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: buildSchema(specialtyIds) },
    messages: [
      { role: 'system', content: systemPrompt(specialtyIds) },
      { role: 'user', content: `Conversación:\n${history}` }
    ]
  }, EXTRACTION_TIMEOUT_MS);
  if (!completion.ok) return completion;
  return { ok: true, caseData: validate(parseJson(completion.content), specialtyIds) };
}

function systemPrompt(specialtyIds) {
  const specialtyList = specialtyIds.map(id => `- ${id} (${specialtyDefinitions[id].name}): ${specialtyDefinitions[id].scope}`).join('\n');
  const redFlagList = RED_FLAGS.map(flag => `- ${flag}: ${RED_FLAG_CUES[flag]}`).join('\n');
  return [
    'Eres un extractor de datos clínicos para una demo de orientación de cobertura en Panamá.',
    'Lee toda la conversación con el paciente y devuelve únicamente los datos del caso en el JSON solicitado.',
    'Deriva cada dato desde la conversación entera: si el paciente corrige algo que dijo antes, vale el dato corregido y no el original.',
    'Nunca inventes un dato que el paciente no dio: si no lo dijo, el campo va en null.',
    '',
    'Una conversación puede recorrer varias molestias y varias personas. Todos los campos describen la molestia que el paciente quiere costear ahora, que es la última que planteó.',
    'Si la última molestia es de otra persona, vuelve a derivar todos los campos para esa persona y descarta los de la anterior.',
    '',
    'specialty: el identificador cuyo alcance describa la molestia que el paciente quiere costear ahora.',
    'Si planteó a la vez dos molestias que corresponderían a especialidades distintas y no se puede saber cuál quiere costear, devuelve null y pregunta cuál de las dos quiere revisar primero.',
    'Varios síntomas de una misma molestia no son ambigüedad: orienta la especialidad que les corresponde.',
    'La edad manda sobre el síntoma: si la persona con esta molestia tiene menos de 12 años, la especialidad es pediatrics aunque el síntoma apunte a otra, como una garganta, un oído, una barriga o la piel.',
    'Un embarazo sin síntoma específico corresponde a gyn.',
    'Usa general solo cuando el paciente describió una molestia concreta que no tiene foco en ningún órgano o sistema.',
    'Usa null cuando todavía no describió lo suficiente para saberlo: un malestar difuso, sin ningún síntoma ni parte del cuerpo identificable, es null y no general.',
    'Nunca uses general para expresar duda: la duda se expresa con null.',
    '',
    'ageYears: la edad de la persona que tiene la molestia que se está costeando ahora; un bebé es 0.',
    'Si esa persona no dio su edad, null, aunque otra persona mencionada antes en la conversación sí la haya dado.',
    'isPregnant: true o false solo si el paciente lo mencionó de la persona con esta molestia. Si no, null.',
    'durationDays: los días que lleva esta molestia si el paciente lo dijo; "desde ayer" es 1 y "desde hoy" es 0. Si no lo dijo, null.',
    '',
    'redFlags: en la enorme mayoría de los casos es el arreglo vacío [].',
    'Incluye una señal solo si el paciente describió exactamente eso y la persona necesita una sala de urgencias ahora mismo.',
    'Reconócela por su significado y no por la frase exacta: un vómito "cada 30 minutos" es vomito_persistente igual que "vomita todo".',
    'Una molestia común como picazón, acidez, una torcedura, dolor de garganta o ardor al orinar no lleva ninguna señal.',
    'No enumeres la lista: selecciona únicamente lo que el paciente contó.',
    'Antes de escribir redFlags pregúntate si esta persona debería estar en una sala de urgencias en este momento. Si la respuesta es no, escribe [].',
    '',
    'followUpQuestion: la siguiente pregunta en español que le harías al paciente para avanzar, sobre lo que acaba de contar y sin repetir lo que ya respondió.',
    'followUpOptions: las respuestas entre las que el paciente elige, si tu pregunta es cerrada.',
    'Usa ["Sí", "No"] si se responde con sí o no, o las opciones textuales si le pides elegir entre varias, copiadas cortas y tal como él las diría.',
    'Deja el arreglo vacío si la pregunta es abierta, como las que piden una parte del cuerpo, una fecha o una edad.',
    '',
    `Especialidades:\n${specialtyList}`,
    '',
    `Señales de alarma:\n${redFlagList}`,
    '',
    'Ejemplos:',
    example('Paciente: Me salió hongo en las uñas de los pies y se están poniendo amarillas.',
      { specialty: 'dermatology', followUpQuestion: '¿Las uñas te duelen o solo cambiaron de color?' }),
    example('Paciente: Tengo un dolor raro.',
      { followUpQuestion: '¿En qué parte del cuerpo sientes el dolor y desde cuándo?' }),
    example('Paciente: Me duele el hombro cuando levanto el brazo, ya van dos semanas.',
      { specialty: 'trauma', durationDays: 14, followUpQuestion: '¿El dolor apareció después de un golpe o esfuerzo?' }),
    example('Paciente: A mi hijo le duele el oído.\nAgente: ¿Qué edad tiene?\nPaciente: Tiene 9, me equivoqué cuando dije 19.',
      { specialty: 'pediatrics', ageYears: 9, followUpQuestion: '¿Le ha salido líquido del oído o ha tenido fiebre?' }),
    example('Paciente: A mi hija de 6 años le duele la garganta desde el lunes.',
      { specialty: 'pediatrics', ageYears: 6, durationDays: 3, followUpQuestion: '¿Ha tenido fiebre junto con el dolor de garganta?', followUpOptions: ['Sí', 'No'] }),
    example('Paciente: Se cortó la mano y la venda ya está empapada de sangre.',
      { redFlags: ['sangrado_abundante'], followUpQuestion: '¿Lograste detener el sangrado haciendo presión?' }),
    example('Paciente: A mi hijo de 5 años le dio fiebre.\nPaciente: Y a mí me está saliendo una picazón en la espalda.',
      { specialty: 'dermatology', followUpQuestion: '¿La picazón te empezó de repente o llevas días con ella?' }),
    example('Paciente: Me duele la garganta y además tengo la rodilla hinchada desde el sábado.',
      { followUpQuestion: '¿Cuál de las dos molestias quieres revisar primero, la garganta o la rodilla?', followUpOptions: ['La garganta', 'La rodilla'] }),
    example('Paciente: Me siento mal desde el fin de semana.',
      { followUpQuestion: '¿Tienes alguna molestia en una parte concreta del cuerpo?', followUpOptions: ['Sí', 'No'] })
  ].join('\n');
}

function example(conversation, fields) {
  return `${conversation}\n${JSON.stringify({ specialty: null, ageYears: null, isPregnant: null, durationDays: null, redFlags: [], followUpOptions: [], ...fields })}`;
}

function buildSchema(specialtyIds) {
  return {
    name: 'case_data',
    schema: {
      type: 'object',
      properties: {
        specialty: { type: ['string', 'null'], enum: [...specialtyIds, null] },
        ageYears: { type: ['integer', 'null'] },
        isPregnant: { type: ['boolean', 'null'] },
        durationDays: { type: ['integer', 'null'] },
        redFlags: { type: 'array', items: { type: 'string', enum: RED_FLAGS }, uniqueItems: true },
        followUpQuestion: { type: 'string' },
        followUpOptions: { type: 'array', items: { type: 'string' }, maxItems: 4 }
      },
      required: ['specialty', 'ageYears', 'isPregnant', 'durationDays', 'redFlags', 'followUpQuestion', 'followUpOptions'],
      additionalProperties: false
    }
  };
}

function parseJson(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

// Una opción de respuesta se convierte en un botón, así que tiene que caber en
// uno: se recortan las vacías, las repetidas, las largas y las que sobran.
function followUpOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const options = raw
    .filter(option => typeof option === 'string')
    .map(option => option.trim())
    .filter(option => option.length > 0 && option.length <= 40);
  return [...new Set(options)].slice(0, 4);
}

// La gramática garantiza la forma, no que un identificador siga existiendo en el
// catálogo: cada campo inválido degrada a nulo o a arreglo vacío, nunca a excepción.
function validate(raw, specialtyIds) {
  return {
    specialty: typeof raw.specialty === 'string' && specialtyIds.includes(raw.specialty) ? raw.specialty : null,
    ageYears: Number.isInteger(raw.ageYears) && raw.ageYears >= 0 && raw.ageYears <= 120 ? raw.ageYears : null,
    isPregnant: typeof raw.isPregnant === 'boolean' ? raw.isPregnant : null,
    durationDays: Number.isInteger(raw.durationDays) && raw.durationDays >= 0 ? raw.durationDays : null,
    redFlags: Array.isArray(raw.redFlags) ? [...new Set(raw.redFlags.filter(flag => RED_FLAGS.includes(flag)))] : [],
    followUpQuestion: typeof raw.followUpQuestion === 'string' && raw.followUpQuestion.trim() ? raw.followUpQuestion.trim() : DEFAULT_FOLLOW_UP,
    followUpOptions: followUpOptions(raw.followUpOptions)
  };
}
