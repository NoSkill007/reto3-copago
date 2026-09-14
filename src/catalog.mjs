export const specialties = { general: 'Medicina general', dermatology: 'Dermatología', gastro: 'Gastroenterología', trauma: 'Ortopedia', pediatrics: 'Pediatría', gyn: 'Ginecología/Obstetricia' };
export const plans = [
  { id: 'esencial', name: 'Istmo Esencial', description: 'Copago fijo + 20% del saldo · red de 2 hospitales', copay: 1500, coinsurance: 20, network: ['bahia', 'ceiba'] },
  { id: 'plus', name: 'Istmo Plus', description: 'Copago fijo + 10% del saldo · red de 3 hospitales', copay: 1000, coinsurance: 10, network: ['bahia', 'ceiba', 'canal'] }
];
export const hospitals = [
  { id: 'bahia', name: 'Hospital Bahía Clara', area: 'Ciudad de Panamá · Bella Vista', rates: { general: 4500, dermatology: 8000, gastro: 9000, trauma: 8500, pediatrics: 5000, gyn: 8500 } },
  { id: 'ceiba', name: 'Centro Médico La Ceiba', area: 'Ciudad de Panamá · Betania', rates: { general: 3500, dermatology: 6500, gastro: 7500, trauma: 7000, pediatrics: 4000, gyn: 7000 } },
  { id: 'canal', name: 'Hospital Jardines del Canal', area: 'Ciudad de Panamá · Ancón', rates: { general: 5500, dermatology: 9500, gastro: 10000, trauma: 9000, pediatrics: 6000, gyn: 9800 } }
];
