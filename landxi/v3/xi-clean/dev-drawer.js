/* dev-drawer.js — 개발자 서랍(?dev=1 · LX 계정만 · ` 키로 여닫기). 사용자 화면에서 뺀 기술 정보는 전부 여기로:
   API 모드·경로 · 세션 · 렌더러 · fps · 카메라 · 조회 시간 · 작업 id · vLLM 모델·지연 · 켜진 층. */
import { API } from '../../shared/api-v1.js';
import { gpuInfo } from '../../xi/engine/tier.js';

const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function devDrawer({ el, map, sess, X }) {
  const gpu = gpuInfo();
  const fps = { n: 0, t0: performance.now(), v: 0, frames: [] };
  const loop = (now) => { fps.frames.push(now); while (fps.frames.length && now - fps.frames[0] > 1000) fps.frames.shift(); fps.v = fps.frames.length; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const row = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
  const draw = () => {
    if (el.hidden) return;
    const c = map.getCenter();
    const q = X.lastQuery || {}, j = X.job || {}, a = X.ask || {};
    el.innerHTML = `<b>개발자 서랍</b> · \` 로 닫기<dl>
      ${row('api', `${API.mode} · ${API.prefix}`)}
      ${row('session', `${sess.realm}/${sess.role}${sess.tenant_id ? ' · ' + sess.tenant_id : ''} · ${sess.me?.user?.name || ''}`)}
      ${row('renderer', gpu.renderer)}
      ${row('fps', fps.v)}
      ${row('camera', `z${map.getZoom().toFixed(2)} · ${c.lng.toFixed(5)}, ${c.lat.toFixed(5)} · p${map.getPitch().toFixed(0)} b${map.getBearing().toFixed(0)}`)}
      ${row('findings', q.path ? `${q.ms} ms (db ${q.db_ms ?? '—'} ms) · total ${q.total} · items ${q.items} · ${q.path}` : '—')}
      ${row('job', j.id ? `${j.id} · ${j.done}/${j.total} · ${j.ms ?? '—'} ms · ${j.state}` : '—')}
      ${row('vllm', a.model ? `${a.model} · ${a.ms} ms · ${a.raw?.slice(0, 160)}` : '—')}
      ${row('layers', (map.getStyle()?.layers || []).filter((l) => /^(sv-|ai-|img-|emd-)/.test(l.id) && map.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id).join(' '))}
      ${row('boot', X.boot ? Object.entries(X.boot).map(([k, v]) => `${k} ${v}`).join(' · ') : '—')}
    </dl>`;
  };
  setInterval(draw, 500);
  addEventListener('keydown', (e) => { if (e.key === '`' && !/input|textarea/i.test(document.activeElement?.tagName || '')) { el.hidden = !el.hidden; draw(); } });
  el.hidden = false; draw();
  return { draw };
}
