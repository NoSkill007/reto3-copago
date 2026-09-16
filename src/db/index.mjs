import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// La base de datos se genera al arrancar desde el esquema y la semilla
// versionados. Vive en memoria porque el catálogo es de solo lectura y no hay
// nada que sobreviva al proceso: así no existe un archivo que pueda quedar
// desincronizado de la semilla que sí se versiona.
export function openCatalogDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(sql('schema.sql'));
  database.exec(sql('seed.sql'));
  return database;
}

function sql(name) {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}
