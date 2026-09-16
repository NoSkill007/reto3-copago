import { openCatalogDatabase } from './db/index.mjs';

// Interfaz del catálogo. Detrás hay SQLite; delante, las mismas estructuras que
// `src/estimate.mjs` y `src/tools.mjs` ya consumían, para que el cálculo no
// tenga que saber de dónde salen los datos.
const database = openCatalogDatabase();

const specialtyRows = query('select id, name, scope from specialties order by sort_order');
const hospitalRows = query('select id, name, area from hospitals order by sort_order');
const planRows = query('select id, name, description, copay_cents, coinsurance_percent from plans order by sort_order');
const rateRows = query('select specialty_id, hospital_id, rate_cents from rates');

export const specialtyDefinitions = Object.fromEntries(specialtyRows.map(specialty => [
  specialty.id,
  { name: specialty.name, scope: specialty.scope, rates: ratesBy('specialty_id', specialty.id, 'hospital_id') }
]));

export const specialties = Object.fromEntries(specialtyRows.map(specialty => [specialty.id, specialty.name]));

export const hospitals = hospitalRows.map(hospital => ({
  id: hospital.id,
  name: hospital.name,
  area: hospital.area,
  rates: ratesBy('hospital_id', hospital.id, 'specialty_id')
}));

export const plans = planRows.map(plan => ({
  id: plan.id,
  name: plan.name,
  description: plan.description,
  copay: plan.copay_cents,
  coinsurance: plan.coinsurance_percent,
  network: query('select hospital_id from plan_network join hospitals on hospitals.id = hospital_id where plan_id = ? order by hospitals.sort_order', plan.id).map(row => row.hospital_id),
  conditions: query('select condition from plan_conditions where plan_id = ? order by sort_order', plan.id).map(row => row.condition)
}));

function query(statement, ...parameters) {
  return database.prepare(statement).all(...parameters);
}

function ratesBy(column, id, keyColumn) {
  return Object.fromEntries(rateRows.filter(rate => rate[column] === id).map(rate => [rate[keyColumn], rate.rate_cents]));
}
