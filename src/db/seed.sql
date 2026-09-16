-- Semilla del catálogo de cobertura: diez especialidades, cinco hospitales y
-- dos planes ficticios. Datos de demostración, no tarifas reales.
-- Las cifras están en centavos de dólar.

insert into specialties (id, name, scope, sort_order) values
  ('general', 'Medicina general', 'síntoma concreto que no apunta a ningún órgano o sistema: fiebre sin otra molestia, cansancio persistente, pérdida de apetito', 0),
  ('dermatology', 'Dermatología', 'piel, ronchas, salpullido, picazón, granos, manchas, hongos, caída del pelo, uñas', 1),
  ('gastro', 'Gastroenterología', 'estómago, acidez, ardor al comer, gastritis, barriga, diarrea, estreñimiento, hígado', 2),
  ('trauma', 'Ortopedia', 'huesos, articulaciones, torceduras, rodilla, tobillo, hombro, espalda, fracturas, golpes al hacer deporte', 3),
  ('pediatrics', 'Pediatría', 'cualquier molestia de un menor de 12 años: hijo, hija, bebé, nene, chiquillo', 4),
  ('gyn', 'Ginecología/Obstetricia', 'embarazo, control prenatal, regla, menstruación, flujo, molestias vaginales, planificación', 5),
  ('ent', 'Otorrinolaringología', 'garganta, amígdalas, voz ronca, oído, oídos tapados, nariz tapada, sinusitis, gripe con dolor de garganta', 6),
  ('ophthalmology', 'Oftalmología', 'ojos, vista, ojo rojo, ver borroso, lagañas, ardor en los ojos, lentes', 7),
  ('urology', 'Urología', 'orinar, ardor al orinar, riñones, próstata, ganas frecuentes de ir al baño, sangre en la orina', 8),
  ('endocrinology', 'Endocrinología', 'azúcar alta, diabetes, tiroides, hormonas, subir o bajar de peso sin explicación', 9);

insert into hospitals (id, name, area, sort_order) values
  ('bahia', 'Hospital Bahía Clara', 'Ciudad de Panamá · Bella Vista', 0),
  ('ceiba', 'Centro Médico La Ceiba', 'Ciudad de Panamá · Betania', 1),
  ('canal', 'Hospital Jardines del Canal', 'Ciudad de Panamá · Ancón', 2),
  ('delmar', 'Clínica del Mar', 'Ciudad de Panamá · San Francisco', 3),
  ('roble', 'Hospital El Roble', 'Ciudad de Panamá · Costa del Este', 4);

insert into plans (id, name, description, copay_cents, coinsurance_percent, sort_order) values
  ('esencial', 'Istmo Esencial', 'Copago fijo + 20% del saldo · red de 2 hospitales', 1500, 20, 0),
  ('plus', 'Istmo Plus', 'Copago fijo + 10% del saldo · red de 5 hospitales', 1000, 10, 1);

insert into plan_conditions (plan_id, condition, sort_order) values
  ('esencial', 'Sin deducible', 0),
  ('esencial', 'Sin límite anual', 1),
  ('esencial', 'Sin autorización previa', 2),
  ('plus', 'Sin deducible', 0),
  ('plus', 'Sin límite anual', 1),
  ('plus', 'Sin autorización previa', 2);

insert into plan_network (plan_id, hospital_id) values
  ('esencial', 'bahia'),
  ('esencial', 'ceiba'),
  ('plus', 'bahia'),
  ('plus', 'ceiba'),
  ('plus', 'canal'),
  ('plus', 'delmar'),
  ('plus', 'roble');

insert into rates (specialty_id, hospital_id, rate_cents) values
  ('general', 'bahia', 4500),
  ('general', 'ceiba', 3500),
  ('general', 'canal', 5500),
  ('general', 'delmar', 4000),
  ('general', 'roble', 5000),
  ('dermatology', 'bahia', 8000),
  ('dermatology', 'ceiba', 6500),
  ('dermatology', 'canal', 9500),
  ('dermatology', 'delmar', 7200),
  ('dermatology', 'roble', 8800),
  ('gastro', 'bahia', 9000),
  ('gastro', 'ceiba', 7500),
  ('gastro', 'canal', 10000),
  ('gastro', 'delmar', 8200),
  ('gastro', 'roble', 9600),
  ('trauma', 'bahia', 8500),
  ('trauma', 'ceiba', 7000),
  ('trauma', 'canal', 9000),
  ('trauma', 'delmar', 7700),
  ('trauma', 'roble', 8800),
  ('pediatrics', 'bahia', 5000),
  ('pediatrics', 'ceiba', 4000),
  ('pediatrics', 'canal', 6000),
  ('pediatrics', 'delmar', 4500),
  ('pediatrics', 'roble', 5500),
  ('gyn', 'bahia', 8500),
  ('gyn', 'ceiba', 7000),
  ('gyn', 'canal', 9800),
  ('gyn', 'delmar', 7700),
  ('gyn', 'roble', 9200),
  ('ent', 'bahia', 6200),
  ('ent', 'ceiba', 5000),
  ('ent', 'canal', 7400),
  ('ent', 'delmar', 5600),
  ('ent', 'roble', 6800),
  ('ophthalmology', 'bahia', 7200),
  ('ophthalmology', 'ceiba', 6000),
  ('ophthalmology', 'canal', 8400),
  ('ophthalmology', 'delmar', 6600),
  ('ophthalmology', 'roble', 7800),
  ('urology', 'bahia', 8600),
  ('urology', 'ceiba', 7200),
  ('urology', 'canal', 10000),
  ('urology', 'delmar', 7900),
  ('urology', 'roble', 9300),
  ('endocrinology', 'bahia', 7700),
  ('endocrinology', 'ceiba', 6500),
  ('endocrinology', 'canal', 8900),
  ('endocrinology', 'delmar', 7100),
  ('endocrinology', 'roble', 8300);
