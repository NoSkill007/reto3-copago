// Llamada de extracción usada solo por el arnés de evaluación (docs/tickets/6.md).
// Implementa el contrato de datos del caso descrito en el ticket contra QVAC real,
// por adelantado del módulo de producción que la entrega 3 crea en `src/`.

const QVAC_BASE = 'http://127.0.0.1:11435/v1';

export const RED_FLAGS = [
  'dificultad_respiratoria',
  'labios_azules',
  'convulsion',
  'no_despierta',
  'no_bebe_liquidos',
  'vomito_persistente',
  'sangrado_abundante',
  'deshidratacion'
];

export async function extractCase(transcript, specialties) {
  const specialtyIds = Object.keys(specialties);
  const history = transcript.map(message => `${message.role === 'user' ? 'Paciente' : 'Agente'}: ${message.text}`).join('\n');
  const response = await fetch(`${QVAC_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: 'copago',
      stream: false,
      max_tokens: 200,
      temperature: 0,
      reasoning_budget: 0,
      remove_thinking_from_context: true,
      response_format: { type: 'json_schema', json_schema: buildSchema(specialtyIds) },
      messages: [
        { role: 'system', content: systemPrompt(specialtyIds, specialties) },
        { role: 'user', content: `Conversación:\n${history}` }
      ]
    })
  });
  if (!response.ok) throw new Error(`QVAC respondió ${response.status} en /chat/completions.`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ?? '';
  return validate(parseJson(content), specialtyIds);
}

function systemPrompt(specialtyIds, specialties) {
  const specialtyList = specialtyIds.map(id => `${id}=${specialties[id]}`).join(', ');
  return [
    'Eres un extractor de datos clínicos para una demo de orientación de cobertura en Panamá.',
    'Lee toda la conversación con el paciente y devuelve únicamente los datos del caso en el JSON solicitado.',
    'No inventes información que el paciente no dio.',
    '"specialty" es el identificador de una especialidad de la lista cerrada, o null si no puedes determinarla con lo dicho hasta ahora.',
    'Un paciente menor de 12 años corresponde a pediatría sin importar el síntoma. Un embarazo sin síntoma específico corresponde a ginecología/obstetricia.',
    '"redFlags" solo incluye señales de alarma reales descritas por el paciente, tomadas de la lista cerrada; no la fuerces si no hay evidencia clara.',
    '"followUpQuestion" es la siguiente pregunta en español que le harías al paciente para avanzar, redactada aunque no se vaya a usar en este caso.',
    `Especialidades: ${specialtyList}.`,
    `Señales de alarma: ${RED_FLAGS.join(', ')}.`
  ].join('\n');
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
        redFlags: { type: 'array', items: { type: 'string', enum: RED_FLAGS } },
        followUpQuestion: { type: 'string' }
      },
      required: ['specialty', 'ageYears', 'isPregnant', 'durationDays', 'redFlags', 'followUpQuestion'],
      additionalProperties: false
    }
  };
}

function parseJson(content) {
  try { return JSON.parse(content); } catch { return {}; }
}

// La gramática garantiza la forma, no que los identificadores sigan siendo válidos;
// cada campo inválido degrada a nulo o a arreglo vacío, nunca a excepción.
function validate(raw, specialtyIds) {
  return {
    specialty: typeof raw.specialty === 'string' && specialtyIds.includes(raw.specialty) ? raw.specialty : null,
    ageYears: Number.isInteger(raw.ageYears) ? raw.ageYears : null,
    isPregnant: typeof raw.isPregnant === 'boolean' ? raw.isPregnant : null,
    durationDays: Number.isInteger(raw.durationDays) ? raw.durationDays : null,
    redFlags: Array.isArray(raw.redFlags) ? raw.redFlags.filter(flag => RED_FLAGS.includes(flag)) : [],
    followUpQuestion: typeof raw.followUpQuestion === 'string' ? raw.followUpQuestion : ''
  };
}
