/* api-agent.js — 에이전트 API 래퍼(F1-CONTRACT v1.1-23~27 · api-v1.js 는 수정하지 않고 import 만).
   base = localStorage.lx_agent_base(개발 :8703) || API.base(:8700 · F2-B 확장 훅이 /api/v1/agent/* 를 붙인다).
   off 모드(API.mode==='off')에서는 네트워크 0 — 호출부가 replay.js 로 간다. */
import { API, probe, session } from '../shared/api-v1.js';

const LS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const base = () => LS('lx_agent_base') || API.base;
export const prefix = () => base() + '/api/v1';

export class AgentError extends Error { constructor(code, message, detail, status) { super(message || code); this.code = code; this.detail = detail; this.status = status; } }

async function call(path, { method = 'GET', body, raw = false } = {}) {
  const s = session.get();
  const h = { accept: 'application/json' };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (s) h.authorization = 'Bearer ' + s.token;
  let r;
  try { r = await fetch(prefix() + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }); }
  catch { throw new AgentError('network', '게이트웨이 연결 없음', null, 0); }
  if (raw) return r;
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) { const e = (j && j.error) || {}; throw new AgentError(e.code || 'http_' + r.status, e.message, e.detail, r.status); }
  return j;
}

export async function mode() { const p = await probe(); return p.mode; }
export const models = () => call('/agent/models');
export const alive = () => call('/agent/alive').catch(() => ({ alive: null, tried: [] }));
export const startRun = (message, context, mode = 'map') => call('/agent/runs', { method: 'POST', body: { message, context, mode } });
export const startDraft = (body) => call('/agent/report/draft', { method: 'POST', body: { template: 'survey-emd', ...body } });
export const confirm = (runId, confirmId, decision) => call(`/agent/runs/${runId}/confirm`, { method: 'POST', body: { confirm_id: confirmId, decision } });
export const clientMs = (runId, i, ms) => call(`/agent/runs/${runId}/client`, { method: 'POST', body: { i, ms } }).catch(() => null);
export const getRun = (runId) => call(`/agent/runs/${runId}`);

export const EVENTS = ['agent.route', 'agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.tool.progress', 'agent.tool.client', 'agent.confirm', 'agent.confirm.decided',
  'agent.token', 'agent.fallback', 'agent.done', 'agent.failed', 'agent.rejected'];
const TERMINAL = new Set(['agent.done', 'agent.failed', 'agent.rejected']);

/** SSE — 헤더를 못 넣으므로 access_token 쿼리(계약 §3). 끝 이벤트 뒤 닫는다. 끊기면 Last-Event-ID 로 재개. */
export function events(runId, on) {
  let es = null, closed = false, last = null, tries = 0;
  const open = () => {
    if (closed) return;
    const u = new URL(prefix() + '/events/agent/' + runId);
    const s = session.get(); if (s) u.searchParams.set('access_token', s.token);
    if (last) u.searchParams.set('last_event_id', last);
    es = new EventSource(u.toString());
    for (const name of EVENTS) es.addEventListener(name, (ev) => {
      last = ev.lastEventId || last; let d = null; try { d = JSON.parse(ev.data); } catch { /* */ }
      on(name, d);
      if (TERMINAL.has(name)) { closed = true; es.close(); }
    });
    es.onerror = () => { es.close(); if (!closed && tries++ < 6) setTimeout(open, 600 * tries); };
  };
  open();
  return { close() { closed = true; es && es.close(); } };
}

/** 초안 .docx — Bearer 로 받아 blob 저장(브라우저 다운로드 · 파일명 = 서버 Content-Disposition) */
export async function downloadDocx(url, fallbackName) {
  const s = session.get();
  const r = await fetch(base() + url, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
  if (!r.ok) throw new AgentError('docx_' + r.status, '초안 파일을 받지 못함');
  const cd = r.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const blob = await r.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { name, bytes: blob.size };
}
