/* opt.js — 선택 경로 호출(F2-A). 다른 에픽이 만들 경로(API · 정적 파일)가 아직 없을 수 있을 때 _lxopt=1 로 부른다 —
   서비스 워커(sw.js)가 오류 상태를 200 + {__lxerr} 로 감싸 콘솔 오류 0 · 여기서 ApiError 로 되돌린다. 워커가 없으면 부르지 않는다(no_sw). */
import { API, session, ApiError } from '../../shared/api-v1.js';

export const hasSW = () => !!navigator.serviceWorker?.controller;
/** 선택 경로 호출(콘솔 오류 0) — 실패는 ApiError(code, status) */
export async function opt(path, { method = 'GET', body, base = null } = {}) {
  if (!hasSW()) throw new ApiError('no_sw', '선택 경로 · 서비스 워커 대기', null, 0);
  const s = session.get();
  const h = { accept: 'application/json' };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (s && !base) h.authorization = 'Bearer ' + s.token;
  const u = (base ?? API.prefix) + path + (path.includes('?') ? '&' : '?') + '_lxopt=1';
  const r = await fetch(u, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const ct = r.headers.get('content-type') || '';
  if (r.status === 204) return null;
  if (!/json/.test(ct)) return r;   // 파일(docx · ndjson)은 Response 그대로
  const j = await r.json().catch(() => null);
  if (j && j.__lxerr) { const e = (j.__lxerr.body && j.__lxerr.body.error) || {}; throw new ApiError(e.code || 'http_' + j.__lxerr.status, e.message || '', e.detail, j.__lxerr.status); }
  return j;
}
/** 같은 출처 정적 파일(다른 에픽이 만들 수도 · 아직 없을 수도) — 없으면 null(콘솔 오류 0) */
export async function optFile(path) {
  if (!hasSW()) return null;
  try { const r = await opt(path, { base: '' }); return r; } catch { return null; }
}

