import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { plans, specialties } from './catalog.mjs';
import { startCase, sendMessage, changePlan } from './agent.mjs';
import { qvacStatus } from './qvac.mjs';

const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:3000', 'http://localhost:3000'];
const CATALOG_NOTE = 'La consulta no incluye medicamentos, exámenes ni procedimientos. Datos ficticios: no representan pólizas ni tarifas reales.';

const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const originOk = (req, allowedOrigins) => !req.headers.origin || allowedOrigins.includes(req.headers.origin);

async function readJsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Se requiere JSON.'), { status: 415 });
  let input = '';
  for await (const chunk of req) { input += chunk; if (input.length > 12000) throw Object.assign(new Error('Solicitud demasiado larga.'), { status: 413 }); }
  try { return JSON.parse(input); } catch { throw Object.assign(new Error('Solicitud inválida.'), { status: 400 }); }
}

export function createServer({ allowedOrigins = DEFAULT_ALLOWED_ORIGINS } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/api/catalog') return json(res, 200, { plans, specialties, note: CATALOG_NOTE });
      if (req.method === 'GET' && req.url === '/api/status') return json(res, 200, await qvacStatus());

      if (req.method === 'POST' && (req.url === '/api/case' || req.url === '/api/case/message' || req.url === '/api/case/plan')) {
        if (!originOk(req, allowedOrigins)) return json(res, 403, { error: 'Origen no permitido.' });
        let body;
        try { body = await readJsonBody(req); } catch (err) { return json(res, err.status ?? 400, { error: err.message }); }

        if (req.url === '/api/case') {
          if (!body || typeof body.plan !== 'string') return json(res, 400, { error: 'Selecciona un plan.' });
          if (body.previousCaseId !== undefined && (typeof body.previousCaseId !== 'string' || typeof body.previousCloseToken !== 'string')) return json(res, 400, { error: 'El caso anterior no es válido.' });
          try { return json(res, 201, startCase(body.plan, body.previousCaseId, body.previousCloseToken)); }
          catch (err) { return json(res, 400, { error: err.message }); }
        }

        if (req.url === '/api/case/plan') {
          if (!body || typeof body.caseId !== 'string' || typeof body.plan !== 'string') return json(res, 400, { error: 'Falta el caso o el plan.' });
          try { return json(res, 200, changePlan(body.caseId, body.plan)); }
          catch (err) { return json(res, err.message.startsWith('Caso no encontrado') ? 404 : 400, { error: err.message }); }
        }

        if (!body || typeof body.caseId !== 'string' || typeof body.text !== 'string') return json(res, 400, { error: 'Falta el caso o el mensaje.' });
        if (body.turnId !== undefined && (typeof body.turnId !== 'string' || body.turnId.length > 100)) return json(res, 400, { error: 'Identificador de turno inválido.' });
        try { return json(res, 200, await sendMessage(body.caseId, body.text, { turnId: body.turnId })); }
        catch (err) { return json(res, err.message.startsWith('Caso no encontrado') ? 404 : 400, { error: err.message }); }
      }

      if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
        const [name, type] = assets[req.url];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        return res.end(await readFile(new URL(`../public/${name}`, import.meta.url)));
      }
      json(res, 404, { error: 'No encontrado.' });
    } catch { json(res, 500, { error: 'No se pudo completar la solicitud.' }); }
  });
}
