import { specialties } from './catalog.mjs';
import { estimate } from './estimate.mjs';

export function toolCompare(planId, specialty) {
  if (!Object.hasOwn(specialties, specialty)) throw new Error('Especialidad inválida.');
  return { specialty, specialtyName: specialties[specialty], rows: estimate(planId, specialty) };
}
