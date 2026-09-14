import { hospitals, plans, specialties } from './catalog.mjs';
export function estimate(planId, specialty) {
  const plan = plans.find(p => p.id === planId);
  if (!plan || !Object.hasOwn(specialties, specialty)) throw new Error('Plan o especialidad inválidos.');
  return hospitals.map(h => {
    const rate = h.rates[specialty];
    const covered = plan.network.includes(h.id);
    const copay = covered ? Math.min(plan.copay, rate) : 0;
    const coinsurance = covered ? Math.round((rate - copay) * plan.coinsurance / 100) : 0;
    const patient = covered ? copay + coinsurance : rate;
    return { id: h.id, name: h.name, area: h.area, rate, covered, copay, coinsurance, patient, insurer: rate - patient };
  }).sort((a,b) => Number(b.covered) - Number(a.covered) || a.patient - b.patient);
}
