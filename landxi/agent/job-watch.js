/* job-watch.js — 확인 카드 승인 뒤 실추론 극장(에이전트 쪽 · 브리지만 사용).
   XI 브리지에 극장 함수(XI.watchJob)가 있으면 그것을 쓰고, 없으면 같은 job SSE(§5.1)로:
   레인 미니 격자(shard.done 칸 점등 · 실이벤트) + HUD 124px 누적 탐지(XI.hud.set · 봉투) + GPU0 이용률(공유)·W(job.progress) +
   job.done 뒤 탐지 폴리곤을 XI.arrive 로 도착(스윕·락온·숫자). 같은 job id 로 관제 행(?job=)과 XI맵 극장(?job=)을 잇는다(일원화). */
import { API, sse, session, JOB_EVENTS } from '../shared/api-v1.js';
import { chip, esc } from './answer.js';

export function watchJob(host, XI, a, { onEnd } = {}) {
  const el = document.createElement('section');
  el.className = 'ag-confirm'; el.dataset.job = a.job_id;
  const fb = bboxOf(a.frame);
  el.innerHTML = `<h4>실추론 극장<small>job ${esc(a.job_id.slice(-8))} · GPU0</small></h4>
    <canvas width="388" height="120" style="display:block;width:388px;height:120px;margin-top:8px" aria-label="shard 격자"></canvas>
    <dl><dt>shard</dt><dd class="jw-sh">접수 · 큐 대기</dd><dt>탐지</dt><dd class="jw-n">—</dd><dt>GPU</dt><dd class="jw-g">—</dd><dt>처리량</dt><dd class="jw-t">—</dd></dl>
    <p class="ag-meter"><a href="?job=${encodeURIComponent(a.job_id)}" style="color:var(--ag-ai)">XI맵 극장으로 ›</a> · <a href="http://localhost:8702/landxi/ops/infra.html?job=${encodeURIComponent(a.job_id)}" style="color:#FFFFFF">관제 같은 job ›</a></p>`;
  host.appendChild(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const fx = (x) => ((x - fb[0]) / (fb[2] - fb[0] || 1)) * W, fy = (y) => H - ((y - fb[1]) / (fb[3] - fb[1] || 1)) * H;
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.setLineDash([3, 3]); g.strokeRect(0.5, 0.5, W - 1, H - 1); g.setLineDash([]);
  const feats = [], pend = [];
  let n = 0, total = a.shards_total || null, done = 0;
  const cell = (b, lit) => { if (!b) return; const x = fx(b[0]), y = fy(b[3]), w = fx(b[2]) - x, h = fy(b[1]) - y; g.fillStyle = lit ? 'rgba(43,217,207,.55)' : 'rgba(255,182,51,.5)'; g.fillRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1)); };
  if (fb) XI.flyTo({ bbox: fb, pitch: 0 }, 1600).catch(() => null);
  const s = session.get();
  const h = sse('/events/jobs/' + a.job_id, {
    events: JOB_EVENTS,
    on: async (name, d) => {
      if (!d) return;
      if (name === 'job.started') { total = d.shards_total || total; el.querySelector('.jw-sh').textContent = `0 / ${total} · 워커 ${(d.workers || []).join(', ')}`; }
      if (name === 'shard.started') cell(d.bbox, false);
      if (name === 'shard.done') {
        cell(d.bbox, true); done++; n += d.n || 0;
        el.querySelector('.jw-sh').textContent = `${done} / ${total ?? '—'}`;
        const e = { value: n, unit: 'polygons', basis: 'inferred', as_of: d.at || new Date().toISOString(), source: `SSE shard.done Σn · ${a.job_id}`, note: '검수 전 · 진행 중' };
        el.querySelector('.jw-n').innerHTML = chip(e, { meaning: '누적 탐지', id: 'jw_n' });
        try { await XI.hud.set(e, { scene: '에이전트 · 실추론', title: `${a.model_id} · 프레임`, unit: '개' }); } catch (err) { console.warn('[agent] hud.set', err?.message); }
        if (d.polys_url && s) pend.push(fetch(API.base + d.polys_url, { headers: { authorization: 'Bearer ' + s.token } }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.features) feats.push(...j.features); }).catch(() => null));
      }
      if (name === 'job.progress') {
        const gp = (d.gpu || [])[0];
        if (gp) el.querySelector('.jw-g').textContent = `GPU${gp.index ?? 0} 이용률(공유) ${gp.util_ma5 ?? gp.util_pct ?? '—'}%${gp.power_w != null ? ` · ${typeof gp.power_w === 'object' ? gp.power_w.value : gp.power_w} W` : ''}`;
        if (d.chips_per_s) el.querySelector('.jw-t').innerHTML = d.chips_per_s.value == null ? `칩/s — · ${esc(d.chips_per_s.note || '창 짧음')}` : chip(d.chips_per_s, { meaning: '처리량(창)', id: 'jw_cps' });
      }
      if (name === 'job.done') {
        const cps = nz(d.chips_per_gpu_s, d.shards_total ?? total, d.gpu_s, 'gpu_s'), cpw = nz(d.chips_per_wall_s, d.shards_total ?? total, d.elapsed_s, 'elapsed_s');
        el.querySelector('.jw-t').innerHTML = [cps && cps.value != null ? `GPU 초당 ${chip(cps, { meaning: 'shards ÷ gpu_s', id: 'jw_g' })}` : '', cpw && cpw.value != null ? `벽시계 ${chip(cpw, { meaning: 'shards ÷ elapsed_s', id: 'jw_w' })}` : '', d.gpu_s ? chip(d.gpu_s, { meaning: '이 작업 GPU·s', id: 'jw_gs' }) : ''].filter(Boolean).join(' · ') || '—';
        const ce = d.counts_env || { value: n, unit: 'polygons', basis: 'inferred', as_of: d.at || new Date().toISOString(), source: `job.done · ${a.job_id}`, note: '검수 전' };
        el.querySelector('.jw-n').innerHTML = chip(ce, { meaning: '전역 NMS 뒤 탐지', id: 'jw_done' });
        document.documentElement.dataset.agentJobDone = a.job_id;
        onEnd?.(d);
        await arriveDone(ce);
      }
      if (name === 'job.failed' || name === 'job.cancelled') { el.querySelector('.jw-sh').textContent = `${name} · ${d.error || ''}`; onEnd?.(d); }
      if (['snapshot.ready', 'job.failed', 'job.cancelled'].includes(name)) h.close();
    },
  });
  /** job.done 뒤 도착: shard 폴리곤을 다 받은 뒤(최대 4 s) XI.arrive(스윕 · 락온 · 숫자) → HUD 124px '도착 · N 개'.
   *  폴리곤이 없거나 도착이 실패하면 HUD 에 같은 봉투를 바로 세운다(스캔 중으로 남지 않게) — 결과는 dataset.agentJobArrived. */
  async function arriveDone(ce) {
    const R = document.documentElement.dataset;
    R.agentJobArrive = 'wait';
    await Promise.race([Promise.allSettled(pend), new Promise((r) => setTimeout(r, 4000))]);
    const head = { scene: '에이전트 · 실추론 도착', title: `${a.model_id} · 전역 NMS 뒤`, unit: '개' };
    let how = 'hud';
    if (feats.length) {
      R.agentJobArrive = 'arriving';
      try { await XI.arrive({ bbox: fb, features: { type: 'FeatureCollection', features: feats }, count: ce, label: `에이전트 실행 · ${a.model_id}`, head }); how = 'arrive'; }
      catch (e) { console.warn('[agent] job arrive', e?.message); }
    }
    if (how !== 'arrive') { try { await XI.hud.set(ce, head); } catch (err) { console.warn('[agent] hud.set', err?.message); } }
    R.agentJobArrive = how;
    R.agentJobArrived = String(ce?.value ?? '');
  }
  return { el, close: () => h.close() };
}

/** 영값 실측 금지: 서버 봉투가 0(반올림)인데 분자·분모가 0 이 아니면 유효숫자 2자리로 다시 나눈다 · 못 나누면 값 없음(칩 대신 '—') */
function nz(e, n, den, name) {
  if (!e || e.value == null || e.value !== 0) return e;
  const dv = den && typeof den === 'object' ? den.value : den;
  if (n > 0 && dv > 0) return { ...e, value: +(n / dv).toPrecision(2), source: `에이전트 재계산 · shards ÷ ${name} (${n} ÷ ${dv}) · 서버 값 0(반올림)` };
  return { ...e, value: null };
}

function bboxOf(geom) {
  if (!geom) return null;
  const xs = [], ys = [];
  const walk = (c) => { if (typeof c[0] === 'number') { xs.push(c[0]); ys.push(c[1]); } else c.forEach(walk); };
  walk(geom.coordinates || []);
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
}
