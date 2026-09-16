-- Esquema del catálogo de cobertura. Normaliza lo que antes eran arreglos en
-- JavaScript: la red de cada plan y las tarifas por especialidad y hospital
-- pasan a ser tablas de relación. El cálculo monetario no vive aquí: las
-- cifras se guardan en centavos y `src/estimate.mjs` las combina.
--
-- `sort_order` conserva el orden de presentación, que en JavaScript venía
-- dado por el orden de las claves del objeto.

create table specialties (
  id         text    primary key,
  name       text    not null,
  scope      text    not null,
  sort_order integer not null
);

create table hospitals (
  id         text    primary key,
  name       text    not null,
  area       text    not null,
  sort_order integer not null
);

create table plans (
  id                  text    primary key,
  name                text    not null,
  description         text    not null,
  copay_cents         integer not null,
  coinsurance_percent integer not null,
  sort_order          integer not null
);

create table plan_conditions (
  plan_id    text    not null references plans (id),
  condition  text    not null,
  sort_order integer not null,
  primary key (plan_id, sort_order)
);

create table plan_network (
  plan_id     text not null references plans (id),
  hospital_id text not null references hospitals (id),
  primary key (plan_id, hospital_id)
);

create table rates (
  specialty_id text    not null references specialties (id),
  hospital_id  text    not null references hospitals (id),
  rate_cents   integer not null,
  primary key (specialty_id, hospital_id)
);
