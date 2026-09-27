/* K14 dev-drawer.js — 개발자 서랍. `?dev=1` + LX realm 만 · ` 키로 여닫기.
   사용자 화면에서 뺀 기술 정보(금지어 전부)는 여기로만: API 모드·경로 · 세션 · 렌더러 · fps · 카메라 · 조회 ms · 작업 id · vLLM 원문.
   devDrawer({ stage, who }) — 조건이 안 맞으면 아무것도 그리지 않는다(null).
   devlog('job', 'j_123') — 다른 부품·화면이 서랍에 한 줄 남긴다(개발 모드가 아니면 버린다). */
import { API, session, esc, isDev } from './util.js';
import { t } from './i18n.js';

const LOG = new Map();
export function devlog(k, v) { if (isDev()) LOG.set(k, v); }

let installed = false;
function tapFetch() {
  if (installed) return; installed = true;
  const f0 = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url, t0 = performance.now();
    try { const r = await f0(input, init); if (url.includes('/api/v1/')) devlog('last api', `${(init?.method || 'GET')} ${url.replace(/^.*\/api\/v1/, '')} · ${r.status} · ${Math.round(performance.now() - t0)} ms`); return r; }
    catch (e) { devlog('last api', `${url} · 실패`); throw e; }
  };
}

export function devDrawer({ stage = null, who = null } = {}) {
  const s = session.get();
  const realm = who?.me?.realm || s?.realm;
  if (!isDev() || realm !== 'lx') return null;
  tapFetch();
  const el = document.createElement('aside');
  el.className = 'k-dev'; el.hidden = true; el.setAttribute('aria-label', t('dev.title'));
  document.body.appendChild(el);
  let renderer = '—';
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); const x = gl?.getExtension('WEBGL_debug_renderer_info'); renderer = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || '—'; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* */ }
  const fr = [];
  const loop = (n) => { fr.push(n); while (fr.length && n - fr[0] > 1000) fr.shift(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '—')}</dd>`;
  const draw = () => {
    if (el.hidden) return;
    const m = stage?.map, c = m?.getCenter();
    el.innerHTML = `<h2>${esc(t('dev.title'))}</h2><dl>
      ${row('api', `${API.mode} · ${API.prefix}`)}
      ${row('session', s ? `${s.realm}/${s.role}${s.tenant_id ? ' · ' + s.tenant_id : ''} · 만료 ${s.expires_at}` : '없음')}
      ${row('renderer', renderer)}
      ${row('fps', fr.length)}
      ${m ? row('camera', `z${m.getZoom().toFixed(2)} · ${c.lng.toFixed(5)}, ${c.lat.toFixed(5)} · p${m.getPitch().toFixed(0)} b${m.getBearing().toFixed(0)}`) : ''}
      ${[...LOG].map(([k, v]) => row(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 400))).join('')}
    </dl>`;
  };
  setInterval(draw, 500);
  addEventListener('keydown', (e) => { if (e.key === '`' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { el.hidden = !el.hidden; draw(); } });
  return { el, draw, open() { el.hidden = false; draw(); } };
}
