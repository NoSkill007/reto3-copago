import { specialties } from './catalog.mjs';

const base = 'http://127.0.0.1:11434/v1';
const ACTIONS = new Set(['ask', 'catalog', 'coverage', 'compare']);

export async function qvacStatus() {
  try {
    const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error('No disponible');
    const body = await response.json();
    return { connected: body.data?.some(m => m.id === 'copago' && m.state === 'ready') === true, device: 'Preferencia automática: GPU dedicada → integrada → CPU. Dispositivo activo no expuesto por la API.' };
  } catch { return { connected: false, device: 'Inferencia no iniciada' }; }
}

// Decide la siguiente acción del coordinador conversacional. Nunca devuelve
// precios: solo una intención que el llamador valida y ejecuta contra las
// herramientas deterministas. Cualquier fallo (red, JSON, acción o
// identificador inválido) degrada a { action: 'fallback' } para el modo de reglas.
export async function decideAction({ plan, transcript, toolResults, questionsAsked = 0, maxQuestions = 5 }) {
  try {
    const specialtyList = Object.entries(specialties).map(([id, name]) => `${id}=${name}`).join(', ');
    const history = transcript.map(m => `${m.role === 'user' ? 'Paciente' : 'Agente'}: ${m.text}`).join('\n');
    const tools = toolResults.map(t => `Herramienta ${t.tool}: ${JSON.stringify(t.result)}`).join('\n');
    const remaining = Math.max(0, maxQuestions - questionsAsked);
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: 'copago', stream: false, max_tokens: 200, temperature: 0.1,
        messages: [
          { role: 'system', content: `Eres el coordinador de una demo de cobertura médica ficticia en Panamá. Respondes EXCLUSIVAMENTE con un objeto JSON de una línea, sin texto adicional, con una de estas acciones:
{"action":"ask","question":"..."} pide UN solo dato faltante y específico (edad, contexto, duración de las molestias). Nunca combines varias preguntas en una ni repitas un dato que el paciente ya dio en el historial.
{"action":"catalog"} consulta el catálogo de especialidades disponibles.
{"action":"coverage"} consulta las condiciones del plan del caso.
{"action":"compare","specialty":"<id>","explanation":"..."} compara el gasto, donde <id> es uno de: ${specialtyList}.
El alcance incluye adultos, niños y embarazo. Considera pediatría cuando el paciente sea un niño y ginecología/obstetricia cuando haya embarazo, pero no asumas ninguna de las dos solo por la edad o el embarazo: un síntoma concreto (piel, estómago, articulación) sigue orientando a esa especialidad aunque la paciente esté embarazada o el paciente sea menor. No asumas una edad o un embarazo que el paciente no haya mencionado.
Nunca inventes precios ni coberturas: los montos los calculan únicamente las herramientas. La explicación no debe incluir cifras ni el símbolo $. El plan de este caso es ${plan}. Ya hiciste ${questionsAsked} de ${maxQuestions} preguntas de seguimiento posibles; te quedan ${remaining}. En cuanto tengas información suficiente, usa "compare" en vez de seguir preguntando; si no te queda ninguna pregunta disponible, usa "compare" con la especialidad más razonable en vez de "ask". /no_think` },
          { role: 'user', content: `Historial de la conversación:\n${history || '(sin mensajes aún)'}\n${tools ? `Resultados de herramientas ya consultadas:\n${tools}\n` : ''}Decide la siguiente acción en JSON.` }
        ]
      })
    });
    if (!response.ok) throw new Error('QVAC rechazó la solicitud');
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!content) throw new Error('Respuesta vacía');
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Sin JSON');
    const decision = JSON.parse(match[0]);
    if (!decision || typeof decision !== 'object' || !ACTIONS.has(decision.action)) throw new Error('Acción inválida');
    if (decision.action === 'ask' && (typeof decision.question !== 'string' || !decision.question.trim())) throw new Error('Pregunta inválida');
    if (decision.action === 'compare' && !Object.hasOwn(specialties, decision.specialty)) throw new Error('Especialidad inválida');
    return decision;
  } catch {
    return { action: 'fallback' };
  }
}
