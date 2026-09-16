export const specialtyDefinitions = {
  general: { name: 'Medicina general', keywords: [], rates: { bahia: 4500, ceiba: 3500, canal: 5500, delmar: 4000, roble: 5000 } },
  dermatology: { name: 'Dermatología', keywords: ['piel', 'picazon', 'sarpullido', 'acne'], rates: { bahia: 8000, ceiba: 6500, canal: 9500, delmar: 7200, roble: 8800 } },
  gastro: { name: 'Gastroenterología', keywords: ['estomago', 'digest', 'acidez', 'abdomen'], rates: { bahia: 9000, ceiba: 7500, canal: 10000, delmar: 8200, roble: 9600 } },
  trauma: { name: 'Ortopedia', keywords: ['rodilla', 'tobillo', 'articulacion', 'hombro'], rates: { bahia: 8500, ceiba: 7000, canal: 9000, delmar: 7700, roble: 8800 } },
  pediatrics: { name: 'Pediatría', keywords: [], rates: { bahia: 5000, ceiba: 4000, canal: 6000, delmar: 4500, roble: 5500 } },
  gyn: { name: 'Ginecología/Obstetricia', keywords: ['control prenatal'], rates: { bahia: 8500, ceiba: 7000, canal: 9800, delmar: 7700, roble: 9200 } },
  ent: { name: 'Otorrinolaringología', keywords: ['garganta', 'oido', 'ronquera', 'nariz tapada'], rates: { bahia: 6200, ceiba: 5000, canal: 7400, delmar: 5600, roble: 6800 } },
  ophthalmology: { name: 'Oftalmología', keywords: ['ojo', 'vista', 'ojo rojo', 'vision borrosa'], rates: { bahia: 7200, ceiba: 6000, canal: 8400, delmar: 6600, roble: 7800 } },
  urology: { name: 'Urología', keywords: ['orinar', 'prostata', 'ardor al orinar'], rates: { bahia: 8600, ceiba: 7200, canal: 10000, delmar: 7900, roble: 9300 } },
  endocrinology: { name: 'Endocrinología', keywords: ['diabetes', 'azucar alta', 'tiroides'], rates: { bahia: 7700, ceiba: 6500, canal: 8900, delmar: 7100, roble: 8300 } }
};

export const specialties = Object.fromEntries(Object.entries(specialtyDefinitions).map(([id, definition]) => [id, definition.name]));
export const plans = [
  { id: 'esencial', name: 'Istmo Esencial', description: 'Copago fijo + 20% del saldo · red de 2 hospitales', copay: 1500, coinsurance: 20, network: ['bahia', 'ceiba'], conditions: ['Sin deducible', 'Sin límite anual', 'Sin autorización previa'] },
  { id: 'plus', name: 'Istmo Plus', description: 'Copago fijo + 10% del saldo · red de 5 hospitales', copay: 1000, coinsurance: 10, network: ['bahia', 'ceiba', 'canal', 'delmar', 'roble'], conditions: ['Sin deducible', 'Sin límite anual', 'Sin autorización previa'] }
];
const hospitalDefinitions = [
  { id: 'bahia', name: 'Hospital Bahía Clara', area: 'Ciudad de Panamá · Bella Vista' },
  { id: 'ceiba', name: 'Centro Médico La Ceiba', area: 'Ciudad de Panamá · Betania' },
  { id: 'canal', name: 'Hospital Jardines del Canal', area: 'Ciudad de Panamá · Ancón' },
  { id: 'delmar', name: 'Clínica del Mar', area: 'Ciudad de Panamá · San Francisco' },
  { id: 'roble', name: 'Hospital El Roble', area: 'Ciudad de Panamá · Costa del Este' }
];

export const hospitals = hospitalDefinitions.map(hospital => ({
  ...hospital,
  rates: Object.fromEntries(Object.entries(specialtyDefinitions).map(([id, definition]) => [id, definition.rates[hospital.id]]))
}));
