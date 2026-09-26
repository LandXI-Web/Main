/* job-theater.js — 7문법 #2 스캔 프레임(V3). SSE(on) 또는 리플레이(off) 이벤트로만 움직인다 — setInterval 진행률 0.
   AOI 헤어라인 → shard 격자 점선(shards_total) → shard.started 칸 청록 빔 → shard.done 칸 걷힘 + 그 칸 폴리곤 도착(500 · 4단) + 락온
   → HUD 는 job.progress 로만 → job.done 도착 → snapshot.ready 면 GeoJSON 을 PMTiles 소스로 교체(끊김 없이 · opacity 크로스 500).
   어댑터(계약 준수): quoteJob / runJob — on 이면 /jobs/quote · /jobs · SSE, off 면 같은 형식을 실데이터 파일에서 만들어 replay() 로 낸다. */
import { API, api, quote as apiQuote, submit as apiSubmit, sse, replay, env, ApiError } from '../../shared/api-v1.js';
import { D } from './glass.js';
import { lock, clearLocks, setPhase, bboxOf, TEAL } from './arrive.js';

/* ── 기하 ── */
const R = 6371008.8;
export function areaKm2(geom) {
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length, k = Math.cos((lat0 * Math.PI) / 180);
  let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return (Math.abs(a) / 2) * (Math.PI / 180) ** 2 * R * R * k / 1e6;
}
const metersOf = (b) => { const k = Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180); return [((b[2] - b[0]) * Math.PI / 180) * R * k, ((b[3] - b[1]) * Math.PI / 180) * R]; };
export function gridFor(bbox, gsd, { chip = 1024, overlapPx = 128 } = {}) {
  const stride = (chip - overlapPx) * gsd, [w, h] = metersOf(bbox);
  return { cols: Math.max(1, Math.ceil(w / stride)), rows: Math.max(1, Math.ceil(h / stride)), stride };
}
const sidOf = (r, c) => `r${String(r).padStart(3, '0')}c${String(c).padStart(3, '0')}`;
const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
export const inFrame = (frame, pt) => pip(pt, frame.type === 'Polygon' ? frame.coordinates[0] : frame.coordinates[0][0]);

/* ── 어댑터: 견적 ── */
export async function quoteJob(body, { imagery, model, role, today = new Date().toISOString() }) {
  if (API.mode === 'on') {
    try { return { ...(await apiQuote(body)), _via: 'api' }; } catch (e) { if (!(e instanceof ApiError) || e.code !== 'offline') throw e; }
  }
  // off: 계약 §4.4 응답과 같은 키 집합 — 면적·shard 는 이 프레임에서 잰 값, GPU·s 는 bench 전(null)
  const bbox = bboxOf(body.aoi), km2 = areaKm2(body.aoi), g = gridFor(bbox, imagery.gsd_m || 0.25, { chip: body.options.chip, overlapPx: 128 });
  const reasons = [];
  if (km2 > (body.options.max_km2 || 5)) reasons.push('aoi_too_large');
  if (role === 'sales' && !body.demo) reasons.push('demo_required');
  if (model && imagery && model.input && !model.input.includes('ortho') && imagery.kind === 'raster') reasons.push('model_input_mismatch');
  return {
    area_km2: env(+km2.toFixed(3), 'km2', 'measured', '구면 근사(위도 보정) · 프론트 계산'),
    shards: g.cols * g.rows,
    shards_env: env(g.cols * g.rows, 'count', 'measured', `격자(1024 · 겹침 128px · gsd ${imagery.gsd_m} m) · 프론트 계산`, `${g.cols}×${g.rows}`),
    gpu_s: env(null, 'gpu_s', 'estimate', `models.perf(${body.model_id}) 없음 — bench 전`, 'bench 후 채워짐'),
    eta_s: env(null, 's', 'estimate', `models.perf(${body.model_id}) 없음 — bench 전`),
    quota: { tenant_id: role === 'sales' ? 'lx-demo' : 'lx', dim: 'gpu_s_month', remaining: env(null, 'gpu_s', 'measured', role === 'sales' ? 'quotas(lx-demo) · 서버 연결 없음' : 'quotas(lx hard=null)', role === 'sales' ? '시연 계량 · 서버 연결 없음' : '무제한'), policy: 'queue_low' },
    allowed: reasons.length === 0, reasons, pool: 'a6000', _grid: g, _via: 'fixture', _at: today,
  };
}

/* ── 어댑터: 실행 — on: POST /jobs + SSE(worker_unavailable → 리플레이 전환) · off: 리플레이 ── */
export const MEM = new Map();   // mem://… polys (합성 리플레이가 쓰는 실데이터 조각)
export async function runJob(body, { onEvent: raw, onState, onSubmitted, synth, replayUrl }) {
  // SSE 는 한 묶음(shard.started ×9 가 5ms 안)으로 올 수 있다 — 도착 순서대로 한 개씩 처리(polys fetch 가 끝난 뒤 다음 이벤트).
  // backlog = 이 이벤트 뒤에 줄 선 이벤트 수(무대의 표시 간격 조절용 · 순서·개수는 그대로)
  let q = Promise.resolve(), pend = 0;
  const onEvent = (name, d, o) => { pend++; q = q.then(() => raw(name, d, { ...o, backlog: pend - 1 })).catch((e) => console.warn('[xi] job event', name, e)).finally(() => { pend--; }); return q; };
  if (API.mode === 'on') {
    try {
      const r = await apiSubmit(body);
      onSubmitted && onSubmitted(r.job);   // 202 응답의 Job(state · pool · shards_total) — SSE 첫 이벤트 전에 HUD 한 줄
      const h = sse(r.events_url.replace(/^\/api\/v1/, ''), { on: (name, d) => onEvent(name, d, { live: true }), onState });
      return { live: true, job: r.job, close: () => h.close() };
    } catch (e) {
      if (!(e instanceof ApiError) || !['worker_unavailable', 'offline'].includes(e.code)) throw e;
      onState && onState('worker_unavailable');
    }
  }
  API.reason = '저장 결과 재생';
  const url = replayUrl || synth();
  const h = replay(url, { on: (name, d) => onEvent(name, d, { live: false }), onState });
  return { live: false, job: null, close: () => h.close(), done: h.done };
}

/** 합성 리플레이(계약 §5.1 형식) — 프레임을 격자로 나누고 저장 결과(실데이터)를 칸마다 도착시킨다. */
export function synthReplay({ frame, grid, features, jobId, resultSet, snapshotUrl, clsKey = 'cls', pace = 1 }) {
  const b = bboxOf(frame), W = (b[2] - b[0]) / grid.cols, H = (b[3] - b[1]) / grid.rows, lines = [];
  const at = (ms) => new Date(Date.now() + ms).toISOString();
  lines.push({ t: 0, event: 'job.queued', data: { job_id: jobId, position: 0, pool: 'a6000', at: at(0) } });
  lines.push({ t: 300, event: 'job.started', data: { job_id: jobId, shards_total: grid.cols * grid.rows, workers: ['a6000-0', 'a6000-1'], at: at(300) } });
  const counts = {}, ids = []; let done = 0, t = 380;
  const n = grid.cols * grid.rows, step = Math.max(2, Math.min(420, Math.round(5200 / n))) * pace, every = Math.max(1, Math.round(n / 40));
  const order = []; for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) order.push([r, c]);
  order.forEach(([r, c], k) => {
    const bb = [b[0] + c * W, b[3] - (r + 1) * H, b[0] + (c + 1) * W, b[3] - r * H].map((v) => +v.toFixed(7));
    const sid = sidOf(r, c), worker = k % 2 ? 'a6000-1' : 'a6000-0';
    const mine = features.filter((f) => f._c[0] >= bb[0] && f._c[0] < bb[2] && f._c[1] >= bb[1] && f._c[1] < bb[3] && inFrame(frame, f._c));
    const cl = {}; for (const f of mine) { const k2 = f.properties[clsKey] || '결과'; cl[k2] = (cl[k2] || 0) + 1; counts[k2] = (counts[k2] || 0) + 1; ids.push(f.properties.id); }
    const url = `mem://${jobId}/${sid}`;
    MEM.set(url, { type: 'FeatureCollection', features: mine.map(({ _c, ...f }) => f) });
    const ts = t + k * step, te = ts + Math.max(D.d120, Math.round(step * 2.2));
    lines.push({ t: ts, event: 'shard.started', data: { job_id: jobId, shard_id: sid, bbox: bb, worker, at: at(ts) } });
    lines.push({ t: te, event: 'shard.done', data: { job_id: jobId, shard_id: sid, bbox: bb, n: mine.length, classes: cl, polys_url: url, ms: null, worker, at: at(te) } });
    done++;
    if (done % every === 0 || done === n) lines.push({ t: te + 1, event: 'job.progress', data: { job_id: jobId, shards_done: done, shards_total: n, counts: { ...counts },
      chips_per_s: { value: null, unit: 'chips_per_s', basis: 'demo', as_of: at(te), source: '합성 리플레이 · 계량 없음' }, elapsed_s: +(te / 1000).toFixed(1), gpu: [], at: at(te + 1) } });
  });
  const tEnd = lines[lines.length - 1].t + 300, total = ids.length;
  lines.push({ t: tEnd, event: 'job.done', data: { job_id: jobId, counts, counts_env: { value: total, unit: 'count', basis: 'demo', as_of: at(tEnd), source: `${resultSet} · 저장 결과`, note: '프레임 안 저장 결과 재생' },
    gpu_s: { value: null, unit: 'gpu_s', basis: 'demo', as_of: at(tEnd), source: '합성 리플레이', note: 'GPU 사용 없음' }, elapsed_s: +(tEnd / 1000).toFixed(1), result_set: resultSet, at: at(tEnd) } });
  lines.push({ t: tEnd + 400, event: 'snapshot.ready', data: { job_id: jobId, set: resultSet, url: snapshotUrl, features: total, ids, at: at(tEnd + 400) } });
  return URL.createObjectURL(new Blob([lines.map((l) => JSON.stringify(l)).join('\n')], { type: 'application/x-ndjson' }));
}

/* ── 무대 ── */
let GEO_CACHE = new Map();
async function polysOf(url) {
  if (!url) return { type: 'FeatureCollection', features: [] };
  if (MEM.has(url)) return MEM.get(url);
  const m = /^(\/landxi\/[^?]+\.geojson)\?bbox=([-\d.,]+)$/.exec(url);
  if (m) {
    if (!GEO_CACHE.has(m[1])) GEO_CACHE.set(m[1], fetch(m[1]).then((r) => r.json()).catch(() => ({ features: [] })));
    const all = await GEO_CACHE.get(m[1]), bb = m[2].split(',').map(Number);
    return { type: 'FeatureCollection', features: all.features.filter((f) => { const c = bboxOf(f.geometry); const x = (c[0] + c[2]) / 2, y = (c[1] + c[3]) / 2; return x >= bb[0] && x < bb[2] && y >= bb[1] && y < bb[3]; }) };
  }
  if (url.startsWith('/api/v1/')) { try { return await api(url.slice('/api/v1'.length)); } catch { return { type: 'FeatureCollection', features: [] }; } }
  try { const r = await fetch(url); return r.ok ? await r.json() : { features: [] }; } catch { return { features: [] }; }
}

export function theater(ctx, { frame, hud, onDone, clsLabel = (k) => k }) {
  const { A, stageEl } = ctx;
  const S = { cells: new Map(), running: new Map(), done: 0, total: 0, ids: [], raf: 0, fid: 0, res: { type: 'FeatureCollection', features: [] }, live: false, snap: false, log: [], shown: [], nextAt: 0 };
  /* 표시 큐(2차 판정 '극장이 연극이 아님'): 게이트웨이는 작은 작업의 shard 이벤트를 한 묶음으로 보낸다 — 칸이 0.5 s 안에 한꺼번에 켜지고 끝났다.
     이벤트의 순서·개수는 그대로 두고, 칸을 켜고 걷는 표시 사이에 최소 D.d120 · 걷힘은 그 칸 빔이 D.d500 이상 보인 뒤.
     이벤트 없이는 아무 칸도 움직이지 않는다(리플레이 pace 와 같은 규칙). 줄이 길면(> 24 · 큰 작업) 간격을 D.d40 으로 좁혀 실시간을 따라간다. */
  const gate = async (kind, sid, backlog = 0) => {
    const now = performance.now(), gap = backlog > 24 ? D.d40 : D.d120;
    let t = Math.max(now, S.nextAt);
    if (kind === 'done') { const r = S.running.get(sid); if (r) t = Math.max(t, r.t0 + (backlog > 24 ? D.d120 : D.d500)); }
    if (t > now + 1) await new Promise((res) => setTimeout(res, t - now));
    S.nextAt = performance.now() + gap;
  };
  const fc = () => ({ type: 'FeatureCollection', features: [...S.cells.values()].map((c) => c.f) });
  const cellFeature = (sid, bb, i) => ({ type: 'Feature', id: i, properties: { sid }, geometry: { type: 'Polygon', coordinates: [[[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]] } });
  // 층: 격자(대기 점선 · 실행 청록 · 완료 걷힘) · 결과(GeoJSON · 4단 현상)
  for (const id of ['th-res-fill', 'th-res-line', 'th-cell-fill', 'th-cell-line']) if (A.getLayer(id)) A.removeLayer(id);
  for (const id of ['th-cells', 'th-res']) if (A.getSource(id)) A.removeSource(id);
  A.addSource('th-cells', { type: 'geojson', data: fc() });
  A.addSource('th-res', { type: 'geojson', data: S.res });
  const st = ['coalesce', ['feature-state', 'st'], 0], a = ['coalesce', ['feature-state', 'a'], 0], gone = ['coalesce', ['feature-state', 'gone'], 0];
  A.addLayer({ id: 'th-res-fill', type: 'fill', source: 'th-res', paint: { 'fill-color': TEAL, 'fill-opacity': ['*', 0.2, a] } }, 'slot-overlay');
  A.addLayer({ id: 'th-res-line', type: 'line', source: 'th-res', layout: { 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': 1.4, 'line-opacity': ['*', 0.95, a] } }, 'slot-overlay');
  A.addLayer({ id: 'th-cell-fill', type: 'fill', source: 'th-cells', paint: { 'fill-color': TEAL, 'fill-opacity': ['match', st, 1, 0.12, 0] } }, 'slot-overlay');
  A.addLayer({ id: 'th-cell-line', type: 'line', source: 'th-cells', layout: { 'line-join': 'miter' },
    paint: { 'line-color': ['match', st, 1, TEAL, '#FFFFFF'], 'line-width': ['match', st, 1, 1.6, 1], 'line-dasharray': [3, 3], 'line-opacity': ['match', st, 2, ['*', 0.7, ['-', 1, gone]], 0.75] } }, 'slot-overlay');
  // 빔(실행 칸의 청록 스캔 선 · rAF — 이벤트가 켠 칸만)
  const beamHost = document.createElement('div'); beamHost.className = 'xi-beams'; stageEl.appendChild(beamHost);
  const fades = [];   // [kind, key, t0]
  const tick = (now) => {
    for (const [sid, r] of S.running) {
      const c = S.cells.get(sid); if (!c) continue;
      const p1 = A.project([c.bb[0], c.bb[3]]), p2 = A.project([c.bb[2], c.bb[1]]);
      const x = p1.x + ((now - r.t0) % D.d1000) / D.d1000 * (p2.x - p1.x);
      r.el.style.transform = `translate(${x.toFixed(1)}px, ${p1.y.toFixed(1)}px)`; r.el.style.height = Math.max(0, p2.y - p1.y).toFixed(1) + 'px';
    }
    for (let i = fades.length - 1; i >= 0; i--) {
      const [kind, key, t0] = fades[i], x = Math.min(1, (now - t0) / D.d500), q = x >= 1 ? 1 : Math.ceil(x * 4) / 4;
      if (kind === 'res') A.setFeatureState({ source: 'th-res', id: key }, { a: q }); else A.setFeatureState({ source: 'th-cells', id: key }, { gone: q });
      if (x >= 1) fades.splice(i, 1);
    }
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
  const ensureCell = (sid, bb) => {
    if (S.cells.has(sid)) return S.cells.get(sid);
    const i = S.cells.size + 1, c = { sid, bb, i, f: cellFeature(sid, bb, i) };
    S.cells.set(sid, c); A.getSource('th-cells').setData(fc()); return c;
  };
  /** 격자 미리 긋기(shards_total · 프레임 bbox) — 이벤트의 bbox 가 오면 그 칸으로 바뀐다 */
  const pregrid = (rows, cols) => {
    const b = bboxOf(frame), W = (b[2] - b[0]) / cols, H = (b[3] - b[1]) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ensureCell(sidOf(r, c), [b[0] + c * W, b[3] - (r + 1) * H, b[0] + (c + 1) * W, b[3] - r * H]);
  };
  const on = async (name, d, { live, backlog = 0 }) => {
    if (S.closed) return;
    if (name === 'shard.started') await gate('start', d.shard_id, backlog);
    else if (name === 'shard.done' || name === 'shard.failed') await gate('done', d.shard_id, backlog);
    if (S.closed) return;
    S.live = live; S.log.push([name, Math.round(performance.now())]);
    document.documentElement.dataset.job = name;
    if (name === 'job.queued') { hud.jobState(`큐 대기 · 순번 ${d.position ?? '—'} · ${d.pool || ''}`, { live }); setPhase('job-queued'); }
    else if (name === 'job.started') {
      S.total = d.shards_total;
      const g = ctx.grid || { rows: Math.round(Math.sqrt(d.shards_total)), cols: Math.ceil(d.shards_total / Math.round(Math.sqrt(d.shards_total))) };
      if (g.rows * g.cols === d.shards_total) pregrid(g.rows, g.cols);
      hud.jobState(`워커 배정 · shard ${d.shards_total} · ${(d.workers || []).join(' · ')}`, { live }); setPhase('job-started');
    } else if (name === 'shard.started') {
      const c = ensureCell(d.shard_id, d.bbox);
      A.setFeatureState({ source: 'th-cells', id: c.i }, { st: 1 });
      S.shown.push(['on', d.shard_id, Math.round(performance.now())]);
      const el = document.createElement('i'); el.className = 'xi-beam'; beamHost.appendChild(el);
      S.running.set(d.shard_id, { el, t0: performance.now() });
    } else if (name === 'shard.done' || name === 'shard.failed') {
      const c = ensureCell(d.shard_id, d.bbox || [0, 0, 0, 0]);
      const r = S.running.get(d.shard_id); if (r) { r.el.remove(); S.running.delete(d.shard_id); }
      A.setFeatureState({ source: 'th-cells', id: c.i }, { st: 2 });
      S.shown.push(['done', d.shard_id, Math.round(performance.now())]);
      fades.push(['cell', c.i, performance.now()]);
      if (name === 'shard.failed') return;
      S.done++; S.nSum = (S.nSum || 0) + (d.n || 0);   // shard 합(전역 NMS 전) — job.progress 가 성기게 와도 정확
      const g = await polysOf(d.polys_url);
      const base = S.res.features.length;
      g.features.forEach((f, k) => { S.res.features.push({ ...f, id: base + k + 1 }); S.ids.push(f.properties?.id); });
      A.getSource('th-res').setData(S.res);
      g.features.forEach((f, k) => fades.push(['res', base + k + 1, performance.now()]));
      if (d.n > 0) {
        clearLocks(2);
        lock(stageEl, A, { lngLat: [(c.bb[0] + c.bb[2]) / 2, (c.bb[1] + c.bb[3]) / 2], bbox: c.bb, html: `<b>${d.shard_id}</b>도착 ${d.n}` });
      }
    } else if (name === 'job.progress') {
      if (S.finished) return;   // job.done 뒤에 늦게 온 progress 는 최종 줄을 덮지 않는다
      hud.job(d, { live });
      // 칸이 다 걷혔는데 job.done 이 늦으면(서버 전역 NMS·PMTiles 굽기 · CPU 워커 큐) 그 사실을 한 줄로 — 숫자는 그대로
      clearTimeout(S.stall);
      if (live && d.shards_done >= d.shards_total) { const t0 = performance.now(); S.stall = setTimeout(function tick() { if (S.finished) return; hud.jobNote(`병합 대기 · 전역 NMS·스냅샷(서버 CPU 워커) ${Math.round((performance.now() - t0) / 1000)}s`); S.stall = setTimeout(tick, D.d1000); }, D.d2400); }
    }
    else if (name === 'job.done') {
      S.finished = true; clearTimeout(S.stall); hud.jobNote('');
      for (const r of S.running.values()) r.el.remove(); S.running.clear();
      setPhase('job-done');
      await hud.count(d.counts_env, { scene: '프레임 분석', title: live ? '실행 결과 · 실측' : '시연 · 저장 결과 재생', unit: '건', done: `완료 · ${d.elapsed_s}s` },
        Object.entries(d.counts || {}).map(([k, v]) => `${clsLabel(k)} <span class="n">${v.toLocaleString('ko-KR')}</span>`));
      hud.jobFinal && hud.jobFinal(d.counts_env, { shardSum: S.nSum || 0, shardsDone: S.done, shardsTotal: S.total || S.done, live, gpuS: d.gpu_s, elapsedS: d.elapsed_s, jobId: d.job_id });
      onDone && onDone(d);
    } else if (name === 'snapshot.ready') await swapSnapshot(d);
    else if (name === 'job.failed' || name === 'job.cancelled') { hud.jobState(name === 'job.failed' ? `실패 · ${d.error || ''}` : '취소됨'); setPhase(name); }
  };
  async function swapSnapshot(d) {
    // 계약 §4.5 snapshot.ready.url = 게이트웨이 PMTiles http URL(범위 요청) — MapLibre 에는 pmtiles:// 프로토콜로 넘긴다(TileJSON 아님)
    const url = !d.url ? null : d.url.startsWith('pmtiles:///') ? 'pmtiles://' + location.origin + d.url.slice('pmtiles://'.length)
      : /^https?:.*\.pmtiles(\?|$)/.test(d.url) ? 'pmtiles://' + d.url : d.url;
    const ids = (d.ids || S.ids).filter(Boolean);
    const layer = ctx.snapshotLayer ? ctx.snapshotLayer(d.set) : null;
    if (!url || !layer) return;
    if (!A.getSource('th-snap')) A.addSource('th-snap', { type: 'vector', url, promoteId: 'id' });
    const shared = /namwon-(landcover|farmland)/.test(d.set || '');   // 공유 저장 세트면 이 작업의 id 만 · 작업 스냅샷이면 전부
    const filt = shared ? { filter: ['in', ['get', 'id'], ['literal', ids]] } : {};
    A.addLayer({ id: 'th-snap-fill', type: 'fill', source: 'th-snap', 'source-layer': layer, ...filt, paint: { 'fill-color': TEAL, 'fill-opacity': 0, 'fill-opacity-transition': { duration: D.d500, delay: 0 } } }, 'th-res-fill');
    A.addLayer({ id: 'th-snap-line', type: 'line', source: 'th-snap', 'source-layer': layer, ...filt, layout: { 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': 1.4, 'line-opacity': 0, 'line-opacity-transition': { duration: D.d500, delay: 0 } } }, 'th-res-fill');
    await new Promise((r) => { A.once('idle', r); A.triggerRepaint(); setTimeout(r, D.d2400); });   // 타일이 늦어도 교체는 진행(끊김 없이 · 크로스 500)
    A.setPaintProperty('th-res-fill', 'fill-opacity-transition', { duration: D.d500, delay: 0 }); A.setPaintProperty('th-res-line', 'line-opacity-transition', { duration: D.d500, delay: 0 });
    A.setPaintProperty('th-snap-fill', 'fill-opacity', 0.2); A.setPaintProperty('th-snap-line', 'line-opacity', 0.95);
    A.setPaintProperty('th-res-fill', 'fill-opacity', 0); A.setPaintProperty('th-res-line', 'line-opacity', 0);
    S.snap = true; document.documentElement.dataset.snapshot = d.set || '1';
    setPhase('snapshot', { set: d.set });
  }
  return {
    S, on,
    close() {
      S.closed = true;
      cancelAnimationFrame(S.raf); clearTimeout(S.stall); S.finished = true; beamHost.remove(); clearLocks();
      for (const id of ['th-snap-fill', 'th-snap-line', 'th-res-fill', 'th-res-line', 'th-cell-fill', 'th-cell-line']) if (A.getLayer(id)) A.removeLayer(id);
      for (const id of ['th-snap', 'th-cells', 'th-res']) if (A.getSource(id)) A.removeSource(id);
    },
  };
}
