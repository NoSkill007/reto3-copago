const byId = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(cents / 100);
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const ASSISTANT_SOURCE_LABEL = 'Recomendación de tu asistente de cobertura';

let catalog;
let caseId;
let caseCloseToken;
let selectedPlan;
let pendingRecovery;
let awaitingReply = false;
let caseToken = 0;
let latestComparison;
const emptyResults = byId('results').innerHTML;

async function fetchJson(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `La solicitud terminó con estado ${response.status}.`);
  return result;
}

async function refreshStatus() {
  const statusPill = document.querySelector('.status-pill');
  try {
    const runtimeStatus = await fetchJson('/api/status');
    statusPill.dataset.state = runtimeStatus.state;
    byId('status').textContent = runtimeStatus.message;
    byId('device').textContent = runtimeStatus.state === 'ready'
      ? 'Tus datos se procesan de forma privada en esta computadora.'
      : 'Puedes volver a intentarlo en unos momentos.';
  } catch {
    statusPill.dataset.state = 'error';
    byId('status').textContent = 'No pudimos comprobar el estado de tu asistente.';
    byId('device').textContent = 'Puedes continuar usando la interfaz y volver a intentarlo.';
  }
}

function addMessage(text, role) {
  const message = document.createElement('div');
  message.className = role === 'progress' ? 'progress' : role === 'user' ? 'message user' : 'message';
  message.textContent = text;
  byId('messages').appendChild(message);
}

function renderPlans() {
  byId('plan-toggle').innerHTML = catalog.plans.map(plan => `
    <button type="button" class="plan-card" data-plan="${escapeHtml(plan.id)}" aria-pressed="${plan.id === selectedPlan}">
      <span class="plan-name">${escapeHtml(plan.name)}</span>
      <span class="plan-detail">${escapeHtml(plan.description)}</span>
    </button>`).join('');
  const plan = catalog.plans.find(candidate => candidate.id === selectedPlan);
  byId('plan-conditions').innerHTML = plan.conditions.map(condition => `<span>${escapeHtml(condition)}</span>`).join('');
}

async function beginCase() {
  const token = ++caseToken;
  const previousCaseId = caseId;
  const previousCloseToken = caseCloseToken;
  awaitingReply = false;
  pendingRecovery = undefined;
  latestComparison = undefined;
  byId('error').textContent = '';
  byId('results').innerHTML = emptyResults;
  byId('messages').innerHTML = '<div class="message">Hola, soy tu asistente de cobertura. Cuéntame qué molestias tienes y te ayudaré a explorar una especialidad y su gasto estimado.</div>';
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
  byId('submit').textContent = 'Explorar mi cobertura';
}

function renderComparison(result) {
  latestComparison = result;
  const heading = `Especialidad sugerida: ${escapeHtml(result.specialtyName)}`;
  const hospitals = result.rows.map((hospital, index) => `
    <article class="hospital ${index === 0 && hospital.covered ? 'best' : ''}">
      <span class="tag">${!hospital.covered ? 'FUERA DE RED · SIN COBERTURA' : index === 0 ? 'MENOR GASTO EN TU RED' : 'EN TU RED'}</span>
      <div class="hospital-top"><div><h3>${escapeHtml(hospital.name)}</h3><small>${escapeHtml(hospital.area)}</small></div><div class="patient-cost"><div class="price">${money(hospital.patient)}</div><small>Tu gasto estimado</small></div></div>
      <div class="breakdown"><span>Tarifa de consulta</span><span>${money(hospital.rate)}</span><span>Copago fijo</span><span>${money(hospital.copay)}</span><span>Coaseguro sobre saldo</span><span>${money(hospital.coinsurance)}</span><span>Aporta el seguro</span><span>${money(hospital.insurer)}</span></div>
      ${hospital.covered ? `<button type="button" class="secondary choose-hospital" data-select-hospital="${escapeHtml(hospital.id)}" aria-label="Elegir ${escapeHtml(hospital.name)}">Elegir esta opción</button>` : ''}
    </article>`).join('');
  const generatedAt = result.estimate?.generatedAt ? new Intl.DateTimeFormat('es-PA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.estimate.generatedAt)) : '';
  const exclusions = result.estimate?.exclusions?.map(escapeHtml).join(' · ') ?? '';
  byId('results').innerHTML = `<div class="summary"><h3>${heading}</h3><div>${escapeHtml(result.explanation.text)}</div><span class="source">${ASSISTANT_SOURCE_LABEL}</span></div><div class="estimate-context"><strong>Estimación ilustrativa</strong><span>${escapeHtml(result.estimate?.visitType ?? 'Consulta ambulatoria')}</span><span>${generatedAt ? `Actualizada: ${escapeHtml(generatedAt)}` : ''}</span></div>${hospitals}<div id="hospital-choice" aria-live="polite"></div><details class="estimate-help"><summary>Antes de usar esta estimación</summary><p>${escapeHtml(result.estimate?.confirmation ?? 'Confirma la cobertura con el hospital y la aseguradora antes de atenderte.')}</p><p>No incluye: ${exclusions || 'medicamentos, exámenes y procedimientos'}.</p></details><p class="notice">El gasto estimado incluye copago y coaseguro. Fuera de red pagarías la tarifa completa. Esta orientación es ilustrativa y no reemplaza la evaluación de un profesional.</p>`;
}

function renderRecovery(result) {
  byId('results').innerHTML = `
    <div class="recovery" role="status">
      <span class="state-label">Verificación detenida</span>
      <h3>No se generó ningún precio</h3>
      <p>${escapeHtml(result.message)}</p>
      <div class="recovery-actions"><button type="button" class="primary compact" data-recovery="retry">Volver a intentarlo</button></div>
      <small>Necesitamos confirmar la orientación antes de mostrar un gasto estimado.</small>
    </div>`;
}

function renderHospitalChoice(hospitalId) {
  const hospital = latestComparison?.rows.find(candidate => candidate.id === hospitalId && candidate.covered);
  if (!hospital) return;
  byId('hospital-choice').innerHTML = `<section class="hospital-choice"><h3>Elegiste ${escapeHtml(hospital.name)}</h3><p>Tu gasto estimado para esta consulta es ${money(hospital.patient)}.</p><ol><li>Confirma que el profesional y la consulta estén dentro de tu red.</li><li>Consulta directamente con el canal oficial del hospital para agendar.</li><li>Antes de atenderte, verifica el beneficio vigente con tu aseguradora.</li></ol><p class="choice-note">Esta demo no está conectada al sistema de citas ni a beneficios reales.</p></section>`;
  byId('hospital-choice').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitTurn(text, { appendUser = true, turnId = crypto.randomUUID() } = {}) {
  if (awaitingReply || !text.trim() || !caseId) return;
  const token = caseToken;
  const requestCaseId = caseId;
  byId('error').textContent = '';
  awaitingReply = true;
  byId('submit').textContent = 'Consultando a tu asistente…';
  if (appendUser) {
    addMessage(text, 'user');
    byId('symptoms').value = '';
  }
  setFormDisabled(true);
  try {
    const result = await fetchJson('/api/case/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: requestCaseId, text, turnId })
    });
    if (token !== caseToken) return;
    if (result.urgent) {
      pendingRecovery = undefined;
      addMessage(result.message, 'agent');
      byId('results').innerHTML = `<div class="urgent"><strong>Prioriza tu atención</strong><p>${escapeHtml(result.message)}</p></div>`;
      return;
    }
    if (result.safety) {
      pendingRecovery = undefined;
      addMessage(result.question, 'agent');
      byId('results').innerHTML = `<div class="safety-check" role="status"><span class="state-label">Comprobación de seguridad</span><h3>Antes de revisar cobertura</h3><p>${escapeHtml(result.question)}</p><small>Esta pregunta no es un diagnóstico. Si te preocupa el estado de la persona, busca atención médica de inmediato.</small></div>`;
      return;
    }
    if (result.recovery) {
      pendingRecovery = { text };
      addMessage(result.message, 'agent');
      renderRecovery(result);
      return;
    }
    pendingRecovery = undefined;
    if (result.question) {
      addMessage(result.question, 'agent');
      if (typeof result.questionsAsked === 'number') addMessage(`Pregunta ${result.questionsAsked} de 5`, 'progress');
      return;
    }
    addMessage(result.explanation.text, 'agent');
    renderComparison(result);
  } catch (error) {
    if (token === caseToken) {
      pendingRecovery = { text, turnId };
      renderRecovery({ message: `${error.message || 'No se pudo completar la consulta.'} Tu mensaje se conserva para reintentar.` });
    }
  } finally {
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
  const button = event.target.closest('.plan-card');
  if (button) selectPlan(button.dataset.plan);
});

byId('results').addEventListener('click', event => {
  const action = event.target.closest('[data-recovery]')?.dataset.recovery;
  if (action === 'retry' && pendingRecovery) submitTurn(pendingRecovery.text, { appendUser: false, ...(pendingRecovery.turnId ? { turnId: pendingRecovery.turnId } : {}) });
  const hospitalId = event.target.closest('[data-select-hospital]')?.dataset.selectHospital;
  if (hospitalId) renderHospitalChoice(hospitalId);
});

byId('restart')?.addEventListener('click', beginCase);
byId('refresh').addEventListener('click', refreshStatus);
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  byId('symptoms').value = button.dataset.example;
  byId('symptoms').focus();
}));

byId('form').addEventListener('submit', event => {
  event.preventDefault();
  submitTurn(byId('symptoms').value);
});

try {
  catalog = await fetchJson('/api/catalog');
  selectedPlan = catalog.plans[0].id;
  renderPlans();
  await beginCase();
} catch {
  byId('error').textContent = 'No se pudo cargar el catálogo. Comprueba que la aplicación esté iniciada y recarga la página.';
}

refreshStatus();
