const byId = id => document.getElementById(id);
const amount = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = cents => `$${amount.format(cents / 100)}`;
// Spelled out by parts so the demo reads the same wherever the browser's locale data falls back.
const timestamp = new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const ASSISTANT_SOURCE_LABEL = 'Recomendación de tu asistente de cobertura';
const MAX_QUESTIONS = 5;

const STATE_STYLES = {
  ready: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  loading: { pill: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  error: { pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' }
};
const STATE_PILL_CLASSES = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium';
const DOT_CLASSES = 'size-1.5 shrink-0 rounded-full';

let catalog;
let caseId;
let caseCloseToken;
let selectedPlan;
let pendingRecovery;
let awaitingReply = false;
let caseToken = 0;
let latestComparison;

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `La solicitud terminó con estado ${response.status}.`);
  return result;
}

function setAssistantState(state, message) {
  const style = STATE_STYLES[state] ?? STATE_STYLES.error;
  byId('assistant-state').className = `${STATE_PILL_CLASSES} ${style.pill}`;
  byId('state-dot').className = `${DOT_CLASSES} ${style.dot}`;
  byId('status').textContent = message;
}

async function refreshStatus() {
  try {
    const runtimeStatus = await fetchJson('/api/status');
    setAssistantState(runtimeStatus.state === 'ready' ? 'ready' : runtimeStatus.state === 'loading' ? 'loading' : 'error', runtimeStatus.message);
  } catch {
    setAssistantState('error', 'No pudimos comprobar el estado de tu asistente.');
  }
}

function appendToFeed(html) {
  const feed = byId('messages');
  feed.insertAdjacentHTML('beforeend', html);
  feed.scrollTop = feed.scrollHeight;
  return feed.lastElementChild;
}

function addTurn(text, role) {
  return appendToFeed(`<p class="turn ${role === 'user' ? 'turn-user' : 'turn-agent'}">${escapeHtml(text)}</p>`);
}

function addTyping() {
  return appendToFeed(`<p class="turn turn-agent inline-flex items-center gap-2 text-slate-500">
    <span class="size-1.5 animate-pulse rounded-full bg-slate-400" aria-hidden="true"></span>Tu asistente está revisando tu mensaje…
  </p>`);
}

function addQuestionIndex(asked) {
  return appendToFeed(`<p class="text-center text-[11px] font-medium tracking-wide text-slate-500 uppercase">Pregunta ${asked} de ${MAX_QUESTIONS}</p>`);
}

function renderPlans() {
  byId('plan-toggle').innerHTML = catalog.plans.map(plan => {
    const active = plan.id === selectedPlan;
    return `<button type="button" data-plan="${escapeHtml(plan.id)}" aria-pressed="${active}"
      title="${escapeHtml(plan.description)}"
      class="rounded-md px-3 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
        active ? 'bg-white font-medium shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
      }">${escapeHtml(plan.name)}</button>`;
  }).join('');
  renderPlanSummary();
}

// The plan's conditions stay visible while a case is open, not tucked behind a tooltip.
function renderPlanSummary() {
  const plan = catalog.plans.find(candidate => candidate.id === selectedPlan);
  byId('plan-summary').innerHTML = `
    <p class="eyebrow">Tu plan</p>
    <p class="mt-1 font-semibold">${escapeHtml(plan.name)}</p>
    <p class="mt-0.5 text-sm text-slate-600">${escapeHtml(plan.description)}</p>
    <ul class="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
      ${plan.conditions.map(condition => `<li>${escapeHtml(condition)}</li>`).join('')}
    </ul>`;
}

function renderEmpty() {
  byId('results').innerHTML = `<div class="rounded-xl border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center">
    <p class="text-sm font-medium text-slate-700">Tu comparación aparecerá aquí</p>
    <p class="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500">
      Primero conversemos sobre tus molestias. Nunca mostramos precios si hay una posible urgencia.
    </p>
  </div>`;
}

function hospitalCard(hospital, index) {
  const best = index === 0 && hospital.covered;
  const badge = !hospital.covered
    ? '<span class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">Fuera de red</span>'
    : best
      ? '<span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">Menor gasto</span>'
      : '<span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">En tu red</span>';

  const body = hospital.covered
    ? `<dl class="ledger">
        <div class="ledger-row"><dt>Tarifa de consulta</dt><dd>${money(hospital.rate)}</dd></div>
        <div class="ledger-row"><dt>Copago fijo</dt><dd>${money(hospital.copay)}</dd></div>
        <div class="ledger-row"><dt>Coaseguro sobre el saldo</dt><dd>${money(hospital.coinsurance)}</dd></div>
        <div class="ledger-row"><dt>Aporta el seguro</dt><dd class="text-emerald-700">${money(hospital.insurer)}</dd></div>
      </dl>
      <button type="button" data-select-hospital="${escapeHtml(hospital.id)}"
        class="btn ${best ? 'btn-primary' : 'btn-secondary'} mt-4 w-full">Elegir esta opción</button>`
    : `<p class="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500">Tu plan no cubre este hospital: pagarías la tarifa completa.</p>`;

  return `<article class="${hospital.covered ? 'card' : 'rounded-xl border border-slate-200 bg-slate-50'} p-5 ${best ? 'border-2 border-emerald-500' : ''}">
    <div class="flex items-start justify-between gap-4">
      <div>
        ${badge}
        <h3 class="mt-2 font-semibold ${hospital.covered ? '' : 'text-slate-700'}">${escapeHtml(hospital.name)}</h3>
        <p class="text-sm text-slate-500">${escapeHtml(hospital.area)}</p>
      </div>
      <div class="shrink-0 text-right">
        <p class="text-3xl font-semibold tracking-tight tabular-nums ${hospital.covered ? '' : 'text-slate-700'}">${money(hospital.patient)}</p>
        <p class="text-xs text-slate-500">${hospital.covered ? 'Tu gasto' : 'Tarifa completa'}</p>
      </div>
    </div>
    ${body}
  </article>`;
}

function renderComparison(result) {
  latestComparison = result;
  const generatedAt = result.estimate?.generatedAt ? timestamp.format(new Date(result.estimate.generatedAt)) : '';
  const exclusions = result.estimate?.exclusions?.map(escapeHtml).join(' · ') ?? '';

  byId('results').innerHTML = `
    <div class="space-y-3">
      <div class="card p-5">
        <p class="eyebrow">Especialidad sugerida</p>
        <h3 class="mt-1 text-lg font-semibold">${escapeHtml(result.specialtyName)}</h3>
        <p class="mt-1.5 text-sm leading-relaxed text-slate-600">${escapeHtml(result.explanation.text)}</p>
        <p class="mt-3 border-t border-slate-100 pt-3 text-[11px] font-medium tracking-wide text-slate-500 uppercase">${ASSISTANT_SOURCE_LABEL}</p>
      </div>

      <p class="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-slate-500">
        <span class="font-medium text-slate-700">${escapeHtml(result.estimate?.visitType ?? 'Consulta ambulatoria')}</span>
        ${generatedAt ? `<span>Actualizada: ${escapeHtml(generatedAt)}</span>` : ''}
      </p>

      ${result.rows.map(hospitalCard).join('')}

      <div id="hospital-choice" aria-live="polite"></div>

      <details class="card px-5 py-4 text-sm">
        <summary class="cursor-pointer font-medium text-slate-700 marker:text-slate-400">Antes de usar esta estimación</summary>
        <p class="mt-2 leading-relaxed text-slate-600">${escapeHtml(result.estimate?.confirmation ?? 'Confirma la cobertura con el hospital y la aseguradora antes de atenderte.')}</p>
        <p class="mt-2 leading-relaxed text-slate-600">No incluye: ${exclusions || 'medicamentos, exámenes y procedimientos'}.</p>
      </details>
    </div>`;
}

function renderUrgent(message) {
  byId('results').innerHTML = `<section class="rounded-xl border-2 border-rose-300 bg-rose-50 p-5">
    <p class="text-xs font-semibold tracking-wide text-rose-700 uppercase">Atención prioritaria</p>
    <h3 class="mt-1 text-lg font-semibold text-rose-900">Prioriza tu atención</h3>
    <p class="mt-1.5 text-sm leading-relaxed text-rose-900">${escapeHtml(message)}</p>
    <p class="mt-3 border-t border-rose-200 pt-3 text-xs leading-relaxed text-rose-800">
      Mientras exista una posible urgencia no mostramos ningún precio.
    </p>
  </section>`;
}

function renderSafetyCheck(question) {
  byId('results').innerHTML = `<section class="rounded-xl border border-amber-300 bg-amber-50 p-5">
    <p class="text-xs font-semibold tracking-wide text-amber-800 uppercase">Comprobación de seguridad</p>
    <h3 class="mt-1 font-semibold text-amber-900">Antes de revisar cobertura</h3>
    <p class="mt-1.5 text-sm leading-relaxed text-amber-900">${escapeHtml(question)}</p>
    <p class="mt-3 border-t border-amber-200 pt-3 text-xs leading-relaxed text-amber-800">
      Esta pregunta no es un diagnóstico. Si te preocupa el estado de la persona, busca atención médica de inmediato.
    </p>
  </section>`;
}

function renderRecovery(result) {
  byId('results').innerHTML = `<section class="card p-5">
    <p class="eyebrow">Verificación detenida</p>
    <h3 class="mt-1 font-semibold">No se generó ningún precio</h3>
    <p class="mt-1.5 text-sm leading-relaxed text-slate-600">${escapeHtml(result.message)}</p>
    <button type="button" data-recovery="retry" class="btn btn-primary mt-4">Volver a intentarlo</button>
    <p class="mt-3 text-xs leading-relaxed text-slate-500">Necesitamos confirmar la orientación antes de mostrar un gasto estimado.</p>
  </section>`;
}

function renderHospitalChoice(hospitalId) {
  const hospital = latestComparison?.rows.find(candidate => candidate.id === hospitalId && candidate.covered);
  if (!hospital) return;
  byId('hospital-choice').innerHTML = `<section class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
    <h3 class="font-semibold text-emerald-900">Elegiste ${escapeHtml(hospital.name)}</h3>
    <p class="mt-1 text-sm text-emerald-900">Tu gasto estimado para esta consulta es ${money(hospital.patient)}.</p>
    <ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-emerald-900 marker:text-emerald-600">
      <li>Confirma que el profesional y la consulta estén dentro de tu red.</li>
      <li>Consulta directamente con el canal oficial del hospital para agendar.</li>
      <li>Antes de atenderte, verifica el beneficio vigente con tu aseguradora.</li>
    </ol>
    <p class="mt-3 text-xs text-emerald-800">Esta demo no está conectada al sistema de citas ni a beneficios reales.</p>
  </section>`;
  byId('hospital-choice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function beginCase() {
  const token = ++caseToken;
  const previousCaseId = caseId;
  const previousCloseToken = caseCloseToken;
  awaitingReply = false;
  pendingRecovery = undefined;
  latestComparison = undefined;
  byId('error').textContent = '';
  renderEmpty();
  byId('messages').innerHTML = '';
  addTurn('Hola, soy tu asistente de cobertura. Cuéntame qué molestias tienes y te ayudaré a explorar una especialidad y su gasto estimado.', 'agent');
  caseId = undefined;
  caseCloseToken = undefined;
  setFormDisabled(false);
  restoreSubmitLabel();
  try {
    const result = await fetchJson('/api/case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan, ...(previousCaseId ? { previousCaseId, previousCloseToken } : {}) })
    });
    if (token === caseToken) {
      caseId = result.caseId;
      caseCloseToken = result.closeToken;
    }
  } catch (error) {
    if (token === caseToken) byId('error').textContent = error.message || 'No se pudo iniciar el caso. Intenta nuevamente.';
  }
}

function selectPlan(planId) {
  if (planId === selectedPlan) return;
  selectedPlan = planId;
  renderPlans();
  beginCase();
}

function setFormDisabled(disabled) {
  [...byId('form').querySelectorAll('button, textarea')].forEach(control => { control.disabled = disabled; });
}

function restoreSubmitLabel() {
  byId('submit-label').textContent = 'Enviar';
}

async function submitTurn(text, { appendUser = true, turnId = crypto.randomUUID() } = {}) {
  if (awaitingReply || !text.trim() || !caseId) return;
  const token = caseToken;
  const requestCaseId = caseId;
  byId('error').textContent = '';
  awaitingReply = true;
  byId('submit-label').textContent = 'Pensando…';
  if (appendUser) {
    addTurn(text, 'user');
    byId('symptoms').value = '';
  }
  setFormDisabled(true);
  const typingMessage = addTyping();
  try {
    const result = await fetchJson('/api/case/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: requestCaseId, text, turnId })
    });
    if (token !== caseToken) return;
    if (result.urgent) {
      pendingRecovery = undefined;
      addTurn(result.message, 'agent');
      renderUrgent(result.message);
      return;
    }
    if (result.safety) {
      pendingRecovery = undefined;
      addTurn(result.question, 'agent');
      renderSafetyCheck(result.question);
      return;
    }
    if (result.recovery) {
      pendingRecovery = { text };
      addTurn(result.message, 'agent');
      renderRecovery(result);
      return;
    }
    pendingRecovery = undefined;
    if (result.question) {
      addTurn(result.question, 'agent');
      if (typeof result.questionsAsked === 'number') addQuestionIndex(result.questionsAsked);
      return;
    }
    addTurn(result.explanation.text, 'agent');
    renderComparison(result);
  } catch (error) {
    if (token === caseToken) {
      pendingRecovery = { text, turnId };
      renderRecovery({ message: `${error.message || 'No se pudo completar la consulta.'} Tu mensaje se conserva para reintentar.` });
    }
  } finally {
    typingMessage.remove();
    if (token === caseToken) {
      awaitingReply = false;
      setFormDisabled(false);
      restoreSubmitLabel();
      byId('symptoms').focus();
    }
    refreshStatus();
  }
}

byId('plan-toggle').addEventListener('click', event => {
  const button = event.target.closest('[data-plan]');
  if (button) selectPlan(button.dataset.plan);
});

byId('results').addEventListener('click', event => {
  const action = event.target.closest('[data-recovery]')?.dataset.recovery;
  if (action === 'retry' && pendingRecovery) submitTurn(pendingRecovery.text, { appendUser: false, ...(pendingRecovery.turnId ? { turnId: pendingRecovery.turnId } : {}) });
  const hospitalId = event.target.closest('[data-select-hospital]')?.dataset.selectHospital;
  if (hospitalId) renderHospitalChoice(hospitalId);
});

byId('examples').addEventListener('click', event => {
  const example = event.target.closest('[data-example]')?.dataset.example;
  if (!example) return;
  byId('symptoms').value = example;
  byId('symptoms').focus();
});

byId('restart').addEventListener('click', beginCase);
byId('refresh').addEventListener('click', refreshStatus);

byId('form').addEventListener('submit', event => {
  event.preventDefault();
  submitTurn(byId('symptoms').value);
});

byId('symptoms').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitTurn(byId('symptoms').value);
  }
});

renderEmpty();

try {
  catalog = await fetchJson('/api/catalog');
  selectedPlan = catalog.plans[0].id;
  renderPlans();
  await beginCase();
} catch {
  byId('error').textContent = 'No se pudo cargar el catálogo. Comprueba que la aplicación esté iniciada y recarga la página.';
}

refreshStatus();
