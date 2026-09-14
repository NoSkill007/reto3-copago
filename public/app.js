const byId = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(cents / 100);
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const QVAC_SOURCE_LABEL = 'Orientación coordinada por QVAC local';

let catalog;
let caseId;
let caseCloseToken;
let selectedPlan;
let pendingRecovery;
let awaitingReply = false;
let caseToken = 0;
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
    byId('device').textContent = runtimeStatus.activeDevice
      ? `Dispositivo activo: ${runtimeStatus.activeDevice}`
      : `Preferencia: ${runtimeStatus.devicePreference}. ${runtimeStatus.deviceEvidence}`;
  } catch {
    statusPill.dataset.state = 'error';
    byId('status').textContent = 'No se pudo consultar el estado de QVAC.';
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
  const heading = `Orientación: ${escapeHtml(result.specialtyName)}`;
  const hospitals = result.rows.map((hospital, index) => `
    <article class="hospital ${index === 0 && hospital.covered ? 'best' : ''}">
      <span class="tag">${!hospital.covered ? 'FUERA DE RED · SIN COBERTURA' : index === 0 ? 'MENOR GASTO EN TU RED' : 'EN TU RED'}</span>
      <div class="hospital-top"><div><h3>${escapeHtml(hospital.name)}</h3><small>${escapeHtml(hospital.area)}</small></div><div class="patient-cost"><div class="price">${money(hospital.patient)}</div><small>Tu gasto estimado</small></div></div>
      <div class="breakdown"><span>Tarifa de consulta</span><span>${money(hospital.rate)}</span><span>Copago fijo</span><span>${money(hospital.copay)}</span><span>Coaseguro sobre saldo</span><span>${money(hospital.coinsurance)}</span><span>Aporta el seguro</span><span>${money(hospital.insurer)}</span></div>
    </article>`).join('');
  byId('results').innerHTML = `<div class="summary"><h3>${heading}</h3><div>${escapeHtml(result.explanation.text)}</div><span class="source">${QVAC_SOURCE_LABEL}</span></div>${hospitals}<p class="notice">Cálculo en centavos: copago + porcentaje del saldo. Fuera de red pagas la tarifa completa. La orientación es ilustrativa y no evalúa la gravedad; consulta a un profesional para confirmar la especialidad.</p>`;
}

function renderRecovery(result) {
  byId('results').innerHTML = `
    <div class="recovery" role="status">
      <span class="state-label">Verificación detenida</span>
      <h3>No se generó ningún precio</h3>
      <p>${escapeHtml(result.message)}</p>
      <div class="recovery-actions"><button type="button" class="primary compact" data-recovery="retry">Reintentar con QVAC</button></div>
      <small>Solo QVAC puede orientar la especialidad. No se generó ningún precio.</small>
    </div>`;
}

async function submitTurn(text, { appendUser = true, turnId = crypto.randomUUID() } = {}) {
  if (awaitingReply || !text.trim() || !caseId) return;
  const token = caseToken;
  const requestCaseId = caseId;
  byId('error').textContent = '';
  awaitingReply = true;
  byId('submit').textContent = 'Consultando QVAC…';
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
  if (!action || !pendingRecovery) return;
  if (action === 'retry') submitTurn(pendingRecovery.text, { appendUser: false, ...(pendingRecovery.turnId ? { turnId: pendingRecovery.turnId } : {}) });
});

byId('restart').addEventListener('click', beginCase);
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
