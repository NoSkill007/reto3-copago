import { randomUUID } from 'node:crypto';

const CASE_TTL_MS = 30 * 60 * 1000;
const cases = new Map();

function removeExpired(now = Date.now()) {
  for (const [caseId, activeCase] of cases) {
    if (now - activeCase.updatedAt >= CASE_TTL_MS) cases.delete(caseId);
  }
}

const cleanup = setInterval(removeExpired, 60_000);
cleanup.unref();

export function createCaseState(planId) {
  removeExpired();
  const caseId = randomUUID();
  const closeToken = randomUUID();
  const now = Date.now();
  cases.set(caseId, {
    planId,
    transcript: [],
    urgent: false,
    comparison: null,
    questionsAsked: 0,
    askedFields: new Set(),
    fieldAnswers: new Map(),
    pendingRetryText: null,
    turnResults: new Map(),
    turnRequests: new Map(),
    closeToken,
    createdAt: now,
    updatedAt: now
  });
  return { caseId, closeToken };
}

export function closeCaseState(caseId, closeToken) {
  removeExpired();
  const activeCase = cases.get(caseId);
  if (!activeCase || activeCase.closeToken !== closeToken) return false;
  cases.delete(caseId);
  return true;
}

export function getCaseState(caseId) {
  removeExpired();
  const activeCase = cases.get(caseId);
  if (!activeCase) throw new Error('Caso no encontrado o vencido.');
  activeCase.updatedAt = Date.now();
  return activeCase;
}
