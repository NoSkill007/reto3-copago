import { plans, specialties, hospitals } from './catalog.mjs';
import { estimate } from './estimate.mjs';

export function toolCatalog() {
  return { specialties: Object.entries(specialties).map(([id, name]) => ({ id, name })) };
}

export function toolCoverage(planId) {
  const plan = plans.find(p => p.id === planId);
  if (!plan) throw new Error('Plan inválido.');
  return {
    id: plan.id,
    name: plan.name,
    copay: plan.copay,
    coinsurance: plan.coinsurance,
    network: plan.network.map(id => hospitals.find(h => h.id === id).name),
    conditions: 'Sin deducible, límite anual ni autorización previa en este plan ficticio.'
  };
}

export function toolCompare(planId, specialty) {
  if (!Object.hasOwn(specialties, specialty)) throw new Error('Especialidad inválida.');
  return { specialty, specialtyName: specialties[specialty], rows: estimate(planId, specialty) };
}
