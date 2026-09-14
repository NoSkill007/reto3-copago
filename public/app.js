const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('es-PA',{style:'currency',currency:'USD'}).format(cents/100);
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog, caseId, awaitingReply = false, caseToken = 0;
const empty = $('results').innerHTML;
const sourceLabel = source => source==='qvac' ? 'Respuesta generada por QVAC local' : 'Respuesta de reglas de demostración · Sin IA';

async function status(){try{const s=await fetch('/api/status').then(r=>r.json());$('status').textContent=s.connected?'QVAC conectado · IA local':'QVAC desconectado · Reglas de demo';$('device').textContent=s.device;}catch{$('status').textContent='No se pudo consultar el estado';}}

function addMessage(text, role){
 const div=document.createElement('div');
 div.className = role==='progress' ? 'progress' : role==='user' ? 'message user' : 'message';
 div.textContent = text;
 $('messages').appendChild(div);
}

async function beginCase(){
 const token=++caseToken;
 $('error').textContent='';$('results').innerHTML=empty;$('messages').innerHTML='<div class="message">Hola, soy tu asistente de cobertura. Cuéntame qué molestias tienes y te ayudaré a explorar una especialidad y su gasto estimado.</div>';
 caseId=undefined;
 try{
  const response=await fetch('/api/case',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:$('plan').value})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  if(token!==caseToken) return;
  caseId=result.caseId;
 }catch(error){if(token===caseToken) $('error').textContent=error.message||'No se pudo iniciar el caso.';}
}

function updatePlan(){$('plan-info').textContent=catalog.plans.find(p=>p.id===$('plan').value).description;beginCase();}
$('plan').addEventListener('change',updatePlan);

try{catalog=await fetch('/api/catalog').then(r=>r.json());$('plan').innerHTML=catalog.plans.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');await updatePlan();}catch{$('error').textContent='No se pudo cargar el catálogo. Recarga la página.';}

document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{$('symptoms').value=button.dataset.example;$('symptoms').focus();}));
$('refresh').addEventListener('click',status);

function renderComparison(result){
 const heading = result.uncertain ? 'Sin especialidad definitiva · consulta general inicial' : `Orientación: ${escape(result.specialtyName)}`;
 const uncertainNote = result.uncertain ? '<p class="notice uncertain-note">No fue posible orientar con certeza tras varias preguntas. Esta comparación usa una consulta general inicial como punto de partida, no una especialidad definitiva.</p>' : '';
 $('results').innerHTML=`<div class="summary"><h3>${heading}</h3><div>${escape(result.explanation.text)}</div><span class="source">${sourceLabel(result.explanation.source)}</span></div>`+uncertainNote+result.rows.map((h,i)=>`<article class="hospital ${i===0 && h.covered?'best':''}"><span class="tag">${!h.covered?'FUERA DE RED · SIN COBERTURA':i===0?'MENOR GASTO EN TU RED':'EN TU RED'}</span><div class="hospital-top"><div><h3>${escape(h.name)}</h3><small>${escape(h.area)}</small></div><div><div class="price">${money(h.patient)}</div><small>Tu gasto estimado</small></div></div><div class="breakdown"><span>Tarifa de consulta</span><span>${money(h.rate)}</span><span>Copago fijo</span><span>${money(h.copay)}</span><span>Coaseguro sobre saldo</span><span>${money(h.coinsurance)}</span><span>Aporta el seguro</span><span>${money(h.insurer)}</span></div></article>`).join('')+'<p class="notice">Datos ficticios. Cálculo en centavos: copago + porcentaje del saldo. Fuera de red pagas la tarifa completa. La orientación es ilustrativa y no evalúa la gravedad; consulta a un profesional para confirmar la especialidad.</p>';
}

$('form').addEventListener('submit',async e=>{
 e.preventDefault();
 if(awaitingReply || !$('symptoms').value.trim() || !caseId) return;
 $('error').textContent='';awaitingReply=true;$('submit').disabled=true;$('submit').textContent='Consultando cobertura…';
 const text=$('symptoms').value;
 addMessage(text,'user');
 $('symptoms').value='';
 const controls = [...$('form').querySelectorAll('select, textarea, button')];
 controls.forEach(control => { control.disabled = true; });
 try{
  const response=await fetch('/api/case/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId,text})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  if(result.urgent){addMessage(result.message,'agent');$('results').innerHTML=`<div class="urgent"><strong>Prioriza tu atención</strong><p>${escape(result.message)}</p></div>`;return;}
  if(result.question){addMessage(result.question,'agent');if(typeof result.questionsAsked==='number')addMessage(`Pregunta ${result.questionsAsked} de 5`,'progress');return;}
  addMessage(result.explanation.text,'agent');
  renderComparison(result);
 }catch(error){$('error').textContent=error.message||'No se pudo consultar. Intenta de nuevo.';}
 finally{awaitingReply=false;controls.forEach(control => { control.disabled = false; });$('submit').innerHTML='Explorar mi cobertura <span>→</span>';$('symptoms').focus();status();}
});
status();
