/* cmdk.js — 물어보기(⌘K): 온프레미스 vLLM 에이전트(POST /agent/runs · SSE /events/agent/{id}) 실연결.
   계획은 사용자 말 한 줄씩 · 숫자는 봉투에서만 · 지도 동작(ui_actions)은 이 판에서 바로 실행. 녹음 재생 없음. */
import { sse } from '../../shared/api-v1.js';
import { D, call, n, esc, mk } from './data.js';
import * as M from './map.js';

const SAY = {
  survey_stats: '건수 확인', survey_findings: '의심 필지 찾기', survey_parcel: '필지 대장 대조', results_stats: 'AI 결과 집계',
  results_features: 'AI 결과 가져오기', parcel_at: '필지 조회', results_parcels_join: '필지와 결합', catalog_layers: '영상 확인',
  jobs_quote: '분석 견적', jobs_submit: '분석 실행', survey_state: '상태 변경', map_arrive: '지도에 표시', map_flyto: '필지로 이동',
  map_on: '층 켜기', map_frame: '범위 표시', drawer_open: '목록 열기', parcel_card: '필지 카드',
};

export function mountCmdk(ui) {
  const box = document.getElementById('cmdk'), form = document.getElementById('cmdkForm'), inp = document.getElementById('cmdkIn');
  const plan = document.getElementById('cmdkPlan'), ans = document.getElementById('cmdkAns');
  let stream = null;
  const open = () => { box.hidden = false; inp.focus(); inp.select(); };
  const close = () => { box.hidden = true; };
  ui.onClear = () => { ranks.forEach((m) => m.remove()); ranks = []; };
  document.getElementById('askOpen').addEventListener('click', () => (box.hidden ? open() : close()));
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.hidden ? open() : close(); }
    if (e.key === 'Escape' && !box.hidden) close();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = inp.value.trim(); if (!msg) return;
    stream?.close(); plan.innerHTML = ''; ans.textContent = '생각 중…';
    const b = ui.map.getBounds();
    let r;
    try {
      r = await call('/agent/runs', { method: 'POST', body: { message: msg, mode: 'map', context: { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: ui.map.getZoom() } } });
    } catch (err) { ans.textContent = err.code === 'llm_unavailable' ? '지금은 답할 수 없습니다.' : (err.message || '보내지 못했습니다.'); return; }
    D.lastRun = r.run.id; D.onlog?.();
    let buf = '';
    stream = sse(r.events_url.replace(/^\/api\/v1/, ''), {
      events: ['agent.route', 'agent.plan', 'agent.tool.call', 'agent.tool.result', 'agent.token', 'agent.done', 'agent.failed', 'agent.rejected', 'agent.confirm'],
      on: (name, d) => {
        if (name === 'agent.plan') {
          plan.innerHTML = (d.steps || []).slice(0, 4).map((s) => `<li data-i="${s.i}"><i class="num">${s.i}</i>${esc(SAY[s.tool] || '확인')}</li>`).join('');
          ans.textContent = '';
        }
        if (name === 'agent.tool.result') {
          plan.querySelector(`li[data-i="${d.i}"]`)?.classList.add('is-done');
          for (const a of d.ui_actions || []) act(ui, a);
        }
        if (name === 'agent.token') { buf += d.delta || ''; ans.textContent = strip(buf); }
        if (name === 'agent.done') { ans.innerHTML = fill(d.answer_md || buf, d.envelopes || {}); stream.close(); }
        if (name === 'agent.failed' || name === 'agent.rejected') { ans.textContent = d?.message || '답하지 못했습니다.'; stream.close(); }
      },
    });
  });
  return { open, close };
}

let ranks = [];
function act(ui, a) {
  if (a.op === 'map_arrive' && a.features?.length) {
    const fc = { type: 'FeatureCollection', features: a.features };
    M.clear(ui.map, ['agent']);
    M.setData(ui.map, 'agent', fc);
    ranks.forEach((m) => m.remove());
    ranks = a.features.map((f, i) => {
      const b = M.bboxOf(f), el = document.createElement('span');
      el.className = 'rank-m'; el.title = f.properties?.addr || '';
      el.innerHTML = `<span class="rank" style="animation-delay:${i * 120}ms">${i + 1}</span>`;
      return new window.maplibregl.Marker({ element: el }).setLngLat([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]).addTo(ui.map);
    });
    const box = document.getElementById('cmdk').getBoundingClientRect();
    const drawer = document.body.classList.contains('has-drawer');
    M.fly(ui.map, a.bbox || M.bboxOf(fc), { maxZoom: 15, ms: 2400, pad: { top: Math.max(230, box.bottom + 96), bottom: 150, left: 110, right: drawer ? 490 : 140 } });
    ui.hud({ v: n(a.features.length), l: '필지 표시' });
  }
  if (a.op === 'map_frame' && a.geojson) M.setData(ui.map, 'focus', { type: 'Feature', properties: {}, geometry: a.geojson });
}

const strip = (s) => s.replace(/\{\{env:e\d+\}\}/g, '…').replace(/\s*\[\d+\]/g, '');
function fill(md, envs) {
  return esc(md).replace(/\{\{env:(e\d+)\}\}/g, (_, k) => { const e = envs[k]; if (!e) return '—'; const u = { count: '건', m2: '㎡', ratio: '' }[e.unit] ?? e.unit; return `<b>${n(e.value)}${esc(u)}</b>${mk(e)}`; })
    .replace(/\s*\[\d+\]/g, '').replace(/\*\*(.+?)\*\*/g, '$1');
}
