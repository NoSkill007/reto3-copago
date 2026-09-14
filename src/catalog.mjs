export const specialtyDefinitions = {
  general: { name: 'Medicina general', keywords: [], rates: { bahia: 4500, ceiba: 3500, canal: 5500 } },
  dermatology: { name: 'Dermatología', keywords: ['piel', 'picazon', 'sarpullido', 'acne'], rates: { bahia: 8000, ceiba: 6500, canal: 9500 } },
  gastro: { name: 'Gastroenterología', keywords: ['estomago', 'digest', 'acidez', 'abdomen'], rates: { bahia: 9000, ceiba: 7500, canal: 10000 } },
  trauma: { name: 'Ortopedia', keywords: ['rodilla', 'tobillo', 'articulacion', 'hombro'], rates: { bahia: 8500, ceiba: 7000, canal: 9000 } },
  pediatrics: { name: 'Pediatría', keywords: [], rates: { bahia: 5000, ceiba: 4000, canal: 6000 } },
  gyn: { name: 'Ginecología/Obstetricia', keywords: ['control prenatal'], rates: { bahia: 8500, ceiba: 7000, canal: 9800 } }
};

export const specialties = Object.fromEntries(Object.entries(specialtyDefinitions).map(([id, definition]) => [id, definition.name]));
export const plans = [
  { id: 'esencial', name: 'Istmo Esencial', description: 'Copago fijo + 20% del saldo · red de 2 hospitales', copay: 1500, coinsurance: 20, network: ['bahia', 'ceiba'], conditions: ['Sin deducible', 'Sin límite anual', 'Sin autorización previa'] },
  { id: 'plus', name: 'Istmo Plus', description: 'Copago fijo + 10% del saldo · red de 3 hospitales', copay: 1000, coinsurance: 10, network: ['bahia', 'ceiba', 'canal'], conditions: ['Sin deducible', 'Sin límite anual', 'Sin autorización previa'] }
];
const hospitalDefinitions = [
  { id: 'bahia', name: 'Hospital Bahía Clara', area: 'Ciudad de Panamá · Bella Vista' },
  { id: 'ceiba', name: 'Centro Médico La Ceiba', area: 'Ciudad de Panamá · Betania' },
  { id: 'canal', name: 'Hospital Jardines del Canal', area: 'Ciudad de Panamá · Ancón' }
];

export const hospitals = hospitalDefinitions.map(hospital => ({
  ...hospital,
  rates: Object.fromEntries(Object.entries(specialtyDefinitions).map(([id, definition]) => [id, definition.rates[hospital.id]]))
}));
