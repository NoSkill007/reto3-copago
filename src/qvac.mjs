// `QVAC_BASE_URL` existe para apuntar la evaluación o una prueba de humo a una
// instancia distinta de la que sirve la demo; la aplicación usa el puerto fijo.
const base = process.env.QVAC_BASE_URL ?? 'http://127.0.0.1:11435/v1';
const DEVICE_PREFERENCE = 'GPU dedicada → integrada → CPU compatible';

export async function qvacStatus() {
  try {
    const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return statusResult('error', 'Tu asistente de cobertura no está disponible en este momento.');
    const body = await response.json();
    const model = body.data?.find(candidate => candidate.id === 'copago');
    if (!model) return statusResult('unavailable', 'Tu asistente de cobertura no está disponible en este momento.');
    if (model.state === 'ready') return statusResult('ready', 'Tu asistente de cobertura está listo.');
    if (['loading', 'downloading', 'starting'].includes(model.state)) return statusResult('loading', 'Tu asistente de cobertura se está preparando.');
    return statusResult('error', 'Tu asistente de cobertura no está disponible en este momento. Vuelve a intentarlo más tarde.');
  } catch (error) {
    return error?.name === 'TimeoutError'
      ? statusResult('timeout', 'Tu asistente tardó demasiado en responder.')
      : statusResult('unavailable', 'Tu asistente de cobertura no está disponible en este momento.');
  }
}

function statusResult(state, message) {
  return {
    state,
    connected: state === 'ready',
    message,
    devicePreference: DEVICE_PREFERENCE,
    activeDevice: null,
    deviceEvidence: 'El dispositivo activo no está expuesto por la API de QVAC.'
  };
}

// Único transporte hacia QVAC: hace la llamada HTTP y traduce cualquier falla en
// un motivo de recuperación. No decide nada sobre el contenido.
export async function chatCompletion(request, timeoutMs) {
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: 'copago', stream: false, reasoning_budget: 0, remove_thinking_from_context: true, ...request })
    });
    if (!response.ok) return { ok: false, reason: response.status >= 500 ? 'unavailable' : 'error' };
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ?? '';
    return { ok: true, content };
  } catch (error) {
    return { ok: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'unavailable' };
  }
}
