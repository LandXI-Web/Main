/* 운영 현황(index) — F2-C.
 * 반전 경로(login.html flip): 셸·판을 카메라 이동과 **같은 1600** 안에 세우고(검정 공백 0), 같은 지도가 남원 z12 → 전국으로 easeTo 1600 --e-cam,
 *   이어서 배포 밀집 bbox(호남)로 1250 초점 이동 + 전국 인셋 → 배포 점이 앰버 락온 → 청록으로 도착한 뒤에 data-flip=grown(F1-C must_fix 1·3).
 * 직접 로드: 데이터가 오면 처음부터 배포 밀집 카메라.
 * 기관 카드: 실태조사 open/assigned/inspected/closed/dismissed 미니 막대 — finding.state(F2-S · ops 스트림)가 오면 40ms 현상(값이 바뀔 때만). */
import { h, t, hhmmss, get, prov, setText, fmt, SRC, tag, api, unveil } from './boot.js';
import { ring } from './rings.js';
import { alertStrip } from './alerts.js';
import { connect, utilOf } from './telemetry.js';
import { createMap, DeployLayer, Globe, globePoints, centroid, inKorea, fitCamera, KOREA, legend, STAGE_COLOR, sized, eCam, panel, loadLibs } from './deploy-map.js';

const IMAGERY_KO = { 'axis-iksan-hwangdeung': '익산 황등', 'ap25-namwon-2023': '남원 25cm', 'a01-namwon-unbong': '남원 운봉' };
const FSTATES = ['open', 'assigned', 'inspected', 'closed', 'dismissed'];
const FCOLOR = { open: '#8F99A8', assigned: '#4E9BFF', inspected: '#ABB3BF', closed: '#2BD9CF', dismissed: '#5F6B7C' };   // 앰버는 Ops 주의 전용 — 상태색으로 쓰지 않는다

/** 배포 밀집 bbox — 국내 배포본 중심 + 최근 작업 AOI 중심(국내) · 여백 0.45° · 최소 폭 2.2°×1.6° */
export function denseBounds(deploys = [], jobs = []) {
  const pts = [...deploys.map((d) => centroid(d.aoi)), ...jobs.map((j) => centroid(j.aoi))].filter((c) => c && inKorea(c));
  if (!pts.length) return KOREA;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const w = Math.max(2.2, x1 - x0 + 0.9), hh = Math.max(1.6, y1 - y0 + 0.9);
  return [cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2];
}
const easeP = (map, cam, ms) => new Promise((res) => { map.once('moveend', res); map.easeTo({ ...cam, duration: ms, easing: eCam }); setTimeout(res, ms + 400); });

/* ── 전국 인셋(2D 캔버스 · 시도 헤어라인 · 현재 보이는 범위 사각형 · 클릭 = 전국 ↔ 밀집 토글) ─────────── */
let sidoP = null;
const sido = () => sidoP || (sidoP = fetch('/landxi/assets/data/geo/sido.geojson').then((r) => r.json()).catch(() => null));
class Inset {
  constructor(host, { onToggle } = {}) {
    this.W = 132; this.H = 168; this.dpr = Math.min(2, devicePixelRatio || 1); this.b = [124.5, 33.0, 131.0, 38.75];
    this.cv = h('canvas', { width: this.W * this.dpr, height: this.H * this.dpr, 'aria-hidden': 'true' }); this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.btn = h('button', { class: 'dm-inset-t', type: 'button', onclick: () => onToggle && onToggle() }, '전국 보기');
    this.el = h('div', { class: 'dm-inset', 'data-k': 'inset' }, h('div', { class: 'og-lbl' }, '전국 인셋'), this.cv, this.btn); host.append(this.el);
    this.ctx = this.cv.getContext('2d'); this.view = null; this.pts = []; this.geo = null;
    sido().then((g) => { this.geo = g; this.draw(); });
  }
  xy([lon, lat]) { const [x0, y0, x1, y1] = this.b; return [((lon - x0) / (x1 - x0)) * this.W, this.H - ((lat - y0) / (y1 - y0)) * this.H]; }
  draw() {
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.W, this.H);
    if (this.geo) {
      c.strokeStyle = 'rgba(255,255,255,.34)'; c.lineWidth = 0.6; c.fillStyle = 'rgba(255,255,255,.035)';
      for (const f of this.geo.features) {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        for (const poly of polys) { c.beginPath(); poly[0].forEach((p, i) => { const [x, y] = this.xy(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.fill(); c.stroke(); }
      }
    }
    for (const p of this.pts) { const [x, y] = this.xy(p.lnglat); c.fillStyle = p.color; c.fillRect(x - 2, y - 2, 4, 4); }
    if (this.view) { const [a, b] = [this.xy([this.view[0], this.view[3]]), this.xy([this.view[2], this.view[1]])]; c.strokeStyle = '#FFB633'; c.lineWidth = 1.2; c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
  }
  set({ view, pts, national }) { if (view) this.view = view; if (pts) this.pts = pts; this.btn.textContent = national ? '배포 밀집 보기' : '전국 보기'; this.el.dataset.national = national ? '1' : '0'; this.draw(); }
}

/* ── 실태조사 상태 막대(기관 카드) ───────────────────────────────────────── */
async function surveyCounts() {
  const opt = SRC.health?.gateway?.opt || {};
  if (SRC.kind === 'gateway' && opt.survey === 200) {
    try { const j = await api('/survey/findings?limit=1'); if (j?.counts) return { counts: { ...j.counts }, total: j.total, basis: j.total?.basis || 'inferred', source: 'GET /survey/findings(F2-S)', live: true }; } catch { /* 파일 폴백 */ }
  }
  try {
    const d = await (await fetch('/landxi/data/survey/namwon-parcel-emd-summary.json', { cache: 'no-store' })).json();
    const n = d?.totals?.suspects;
    if (n) return { counts: { open: n, assigned: 0, inspected: 0, closed: 0, dismissed: 0 }, total: { value: n, unit: 'count', basis: 'inferred', as_of: '2026-09-24', source: 'survey/namwon-parcel-emd-summary.json', note: '상태 저장 전 — 파일 합계 = 전부 미조치 · AI 추론 · 결과 확인 전' }, basis: 'inferred', source: 'survey/namwon-parcel-emd-summary.json', live: false };
  } catch { /* */ }
  return null;
}
function surveyBar(sc) {
  const bar = h('div', { class: 'sv-bar', role: 'img' }); const nums = h('div', { class: 'sv-nums' });
  const seg = {}; const num = {};
  for (const k of FSTATES) { seg[k] = h('i', { 'data-s': k, style: { background: FCOLOR[k] } }); bar.append(seg[k]); num[k] = h('b', { 'data-k': 'sv-' + k }); nums.append(h('span', { 'data-s': k }, h('em', { style: { background: FCOLOR[k] } }), t('finding_state.' + k, k), ' ', num[k])); }
  const box = h('div', { class: 'sv', 'data-k': 'survey' }, h('div', { class: 'sv-head' }, h('span', { class: 'og-lbl' }, '실태조사 · 남원 의심'), h('span', { class: 'og-num-s', 'data-k': 'sv-total' }), h('span', { class: 'og-tag', 'data-basis': sc.live ? 'measured' : 'inferred', title: sc.total?.note || sc.source }, sc.live ? '실시간' : '파일 합계')), bar, nums);
  const draw = () => {
    const tot = FSTATES.reduce((a, k) => a + (sc.counts[k] || 0), 0) || 1;
    for (const k of FSTATES) { seg[k].style.width = ((sc.counts[k] || 0) / tot * 100) + '%'; setText(num[k], fmt(sc.counts[k] || 0)); }
    setText(box.querySelector('[data-k="sv-total"]'), `${fmt(tot)}건`);
    bar.setAttribute('aria-label', FSTATES.map((k) => `${t('finding_state.' + k, k)} ${sc.counts[k] || 0}`).join(' · '));
  };
  draw();
  return { el: box, event(ev) {
    const from = ev.from || ev.prev_state; const to = ev.to || ev.state; if (!to || from === to) return;
    if (from && sc.counts[from] > 0) sc.counts[from]--; sc.counts[to] = (sc.counts[to] || 0) + 1; draw();
    box.classList.remove('is-lock'); void box.offsetWidth; box.classList.add('is-lock'); box.dataset.last = `${ev.id || ''} ${from || ''}→${to}`;
  } };
}

/* ══ 조립 ══════════════════════════════════════════════════════════════ */
export async function mountOverview(frame, { map = null, fly = null, mapEl = null } = {}) {
  const { main } = frame; const flip = !!fly;
  const dataP = Promise.all([get('deploys'), get('approvals'), get('nodes'), get('gpus'), get('alerts'), get('storage'), get('jobs')]);
  const svP = surveyCounts();

  // ── 골격(동기) — 반전 1600 안에 판이 선다
  const L = h('div', { class: 'ov-l' }), C = h('div', { class: 'ov-c' }), R = h('div', { class: 'ov-r' });
  main.append(h('div', { class: 'ov' }, L, C, R));
  const apK = h('div', { class: 'og-kpi og-kpi-xl', 'data-k': 'approvals' }, '—'); const apList = h('div', { class: 'og-note' }, '—'); const apWhy = h('div');
  L.append(panel('결재 대기', '실카운트', h('a', { class: 'og-lbl', href: '/landxi/ops/deploys.html' }, '배포 제어 →'),
    h('div', { class: 'og-body' }, h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px' } }, apK, h('span', { class: 'og-lbl' }, '건')), apList, apWhy)));
  const stageBox = h('div', { class: 'ov-stage' }); const stageSub = h('span', {}, '배포본 —');
  L.append(panel('배포 단계', stageSub, tag('history', '이력 시드'), h('div', { class: 'og-body' }, stageBox)));
  const jobBox = h('div', { class: 'ov-jobs' }, h('div', { class: 'og-note', 'data-empty': '' }, '작업 불러오는 중'));
  L.append(panel('작업', 'job.state', h('a', { class: 'og-lbl', href: '/landxi/ops/infra.html' }, '대기열 →'), h('div', { class: 'og-body', style: { paddingTop: '4px' } }, jobBox)));
  const tBox = h('div', { class: 'ov-ten' }); const svHost = h('div');
  L.append(panel('기관별 배포 · 실태조사', '6기관', h('a', { class: 'og-lbl', href: '/landxi/ops/tenants.html' }, '할당 →'), h('div', { class: 'og-body', style: { paddingTop: '6px' } }, tBox, svHost)));

  const nodeBox = h('div', { class: 'ov-nodes' }); const gpuProv = h('div', { style: { marginTop: '10px' } }); const gpuRings = new Map();
  for (const index of [0, 1]) {
    const host = h('div', { class: 'ov-gpu', 'data-gpu': index });
    const r = ring(host, { size: 64, stroke: 6, label: `GPU${index} VRAM` }); r.center.append(h('b', { 'data-k': 'vpct' }, '—'));
    host.append(h('div', {}, h('div', { class: 'og-lbl' }, `GPU ${index} · A6000`), h('div', {}, h('span', { class: 'og-num', 'data-k': 'util' }, '—'), h('span', { class: 'og-lbl', title: 'nvidia-smi -lms 100 · 최근 10 s 추세(util_ma10) — 인프라 GPU 행 큰 숫자와 같은 값' }, ' 이용률(10 s 추세) · '), h('span', { class: 'og-num', 'data-k': 'pw' }, '—')),
      h('div', { class: 'og-num-s', 'data-k': 'why' })));
    nodeBox.append(host); gpuRings.set(index, { r, host });
  }
  const a100Box = h('div', { class: 'ov-nodes' });
  R.append(panel('노드', 'node-tr3995wx', h('a', { class: 'og-lbl', href: '/landxi/ops/infra.html' }, '인프라 →'), h('div', { class: 'og-body' }, nodeBox, a100Box, gpuProv)));
  const alBox = h('div', {}); const strip = alertStrip(alBox, { compact: true });
  R.append(panel('최근 경보', '임계 [목표]', null, h('div', { class: 'og-body' }, alBox)));
  const stBox = h('div', { class: 'og-body' }, h('div', { class: 'cw-void' }, '스토리지 불러오는 중'));
  R.append(panel('스토리지', 'E · D · C', null, stBox));

  const slot = h('div', { class: 'ov-slot dm-wrap' });
  const kpi = h('span', { class: 'og-kpi', 'data-k': 'deploys' }, '—');
  const densCap = h('span', { class: 'og-num-s', 'data-k': 'dens' });
  const over = h('div', { class: 'dm-over' }, h('span', { class: 'og-lbl' }, '배포본'), kpi, densCap);
  C.append(panel('배포 지도', '잉크 · 시도·시군구 헤어라인 · 배포 밀집', h('span', { class: 'og-lbl' }, '점 = 배포본 · ▪ = 작업 · 빛 = 실태조사 의심'), slot));
  slot.append(over, h('div', { class: 'dm-scalebar dm-legbox' }, legend()));
  [...main.querySelectorAll('.og-panel')].forEach((p, i) => p.style.setProperty('--i', i));

  // ── 지도: 반전 경로는 같은 지도를 1600 안에 판 자리로 옮기며 남원 z12 → 전국
  const size = () => [slot.clientWidth || 640, slot.clientHeight || 700];
  let D, approvals, nodes, gpus, alerts, storage, jobs;
  if (flip) {
    const r = slot.getBoundingClientRect();
    // ResizeObserver 는 rAF 렌더 뒤에 돈다 → resize 가 캔버스를 지운 채 그 프레임이 칠해지면 검정. 곧바로 동기 redraw 로 채운다(검정 프레임 0)
    const redraw = () => { map.resize(); try { map.redraw(); } catch { /* 구판 */ } };
    const ro = new ResizeObserver(redraw); ro.observe(fly);
    const cam = fitCamera(r.width, r.height, KOREA, 20);
    requestAnimationFrame(() => { Object.assign(fly.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); });
    map.easeTo({ ...cam, duration: 1600, easing: eCam });
    document.documentElement.dataset.cam = 'national';
    await new Promise((res) => { const done = (e) => { if (e.target === fly && e.propertyName === 'width') { fly.removeEventListener('transitionend', done); res(); } }; fly.addEventListener('transitionend', done); setTimeout(res, 1800); });
    ro.disconnect(); mapEl.className = 'dm-map'; slot.prepend(mapEl); fly.remove(); redraw();
    new ResizeObserver(redraw).observe(slot);
    for (const id of ['farm-fill', 'farm-line']) map.setLayoutProperty(id, 'visibility', 'none');
    map.dragPan.enable(); map.scrollZoom.enable();
    [D, approvals, nodes, gpus, alerts, storage, jobs] = await dataP;
  } else {
    [D, approvals, nodes, gpus, alerts, storage, jobs] = await dataP;
    await sized(slot);
    mapEl = h('div', { class: 'dm-map' }); slot.prepend(mapEl);
    const [W, H] = size();
    map = await createMap(mapEl, { face: false, ...fitCamera(W, H, denseBounds(D?.items || [], jobs?.items || []), 36) });
    new ResizeObserver(() => map.resize()).observe(slot);
  }
  D = D?.items || [];
  const J = jobs?.items || [];
  map.getCanvas().setAttribute('aria-label', '배포 지도');

  // ── 판 채우기(값이 오면)
  const pend = (approvals?.items || []).filter((a) => a.decision == null);
  setText(apK, String(pend.length)); apList.textContent = pend.length ? pend.map((a) => `${a.subject_type} · ${a.subject_id}`).join(' / ') : '0 · 대기 없음';
  if (approvals?._fallback) apWhy.replaceChildren(h('div', { class: 'og-why', style: { marginTop: '8px' } }, '결재 목록 읽기 실패 — 픽스처'));
  else if (approvals?.source) apWhy.replaceChildren(h('div', { class: 'og-why', style: { marginTop: '8px' }, title: approvals.source }, `정본 approvals ${fmt(approvals.total ?? (approvals.items || []).length)}행 · 읽기만`));
  const drawStages = (list) => {
    stageSub.textContent = `배포본 ${list.length}`;
    stageBox.replaceChildren(...['draft', 'shadow', 'canary', 'ga', 'rolled_back'].flatMap((s) => { const n = list.filter((d) => d.stage === s).length;
      return [h('span', { class: 'dm-leg', 'data-stage': s }, h('i'), t('stage.' + s, s)), h('div', { class: 'og-bar' }, h('i', { style: { width: (list.length ? (n / list.length) * 100 : 0) + '%', background: STAGE_COLOR[s] } })), h('span', { class: 'og-num-s', 'data-stage-n': s }, String(n))]; }));
  };
  drawStages(D);
  const jobRow = (j) => h('a', { class: 'ov-job', 'data-job': j.job_id || j.id, href: '/landxi/ops/infra.html?job=' + encodeURIComponent(j.job_id || j.id) },
    h('span', { class: 'og-num-s', style: { color: 'var(--cw-ink)' } }, (j.job_id || j.id).slice(0, 18)), h('span', { class: 'og-lbl', 'data-s': j.state }, t('job_state.' + j.state, j.state)),
    h('span', { class: 'og-note' }, `${j.tenant_id} · ${IMAGERY_KO[j.imagery_id] || j.model_id || j.pool}${j.label ? ' · ' + j.label : ''}${j.reason === 'recovered' ? ' · 복구' : ''}`), h('span', { class: 'og-num-s' }, hhmmss(j.at || j.finished_at || j.created_at)));
  jobBox.replaceChildren(...(J.length ? J.slice(0, 4).map(jobRow) : [h('div', { class: 'og-note', 'data-empty': '' }, '작업 0 · 대기열 비어 있음')]));
  const drawTen = (list) => { const m = new Map(); for (const d of list) { if (!m.has(d.tenant_id)) m.set(d.tenant_id, []); m.get(d.tenant_id).push(d); }
    tBox.replaceChildren(...['lx', 'namwon', 'gwangju-jeonnam', 'kgz-agri', 'kgz-land', 'lx-demo'].map((tid) => { const ds = m.get(tid) || [];
      return h('a', { class: 'ov-ten-r', 'data-t': tid, href: '/landxi/ops/tenants.html?tenant=' + tid }, h('span', { class: 'og-lbl' }, t('tenant_short.' + tid, tid)), h('span', { class: 'ov-ten-d' }, ...ds.slice(0, 9).map((d) => h('i', { 'data-stage': d.stage, title: `${d.id} · ${t('stage.' + d.stage)}` })), ds.length > 9 ? h('span', { class: 'og-num-s' }, `+${ds.length - 9}`) : null), h('span', { class: 'og-num-s' }, String(ds.length))); })); };
  drawTen(D);
  if (!flip) unveil();   // 판이 실값으로 섰다 — 골격을 걷고 지도 점 도착(락온)은 보이는 채로
  let sv = null; svP.then((sc) => { if (!sc) return; sv = surveyBar(sc); svHost.replaceChildren(sv.el); });

  for (const n of (nodes?.items || []).filter((x) => x.state === 'pending')) a100Box.append(h('div', { class: 'ov-a100' }, h('span', { class: 'og-lbl' }, n.id + ' · A100 80GB×4'), h('span', { class: 'og-tag', 'data-dashed': '' }, '등록 대기')));
  strip.load(alerts);
  const renderStorage = (st) => {
    if (!st?.volumes) { stBox.replaceChildren(h('div', { class: 'cw-void' }, '스토리지 폴러 첫 수집 전')); return; }
    stBox.replaceChildren(...st.volumes.map((v) => h('div', { style: { display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '10px', alignItems: 'center', padding: '6px 0' } },
      h('span', { class: 'og-num' }, v.mount), h('div', { class: 'og-bar', 'data-caution': v.free_gb.value != null && v.total_gb.value && v.free_gb.value / v.total_gb.value < 0.2 ? '1' : '0' }, h('i', { style: { width: v.total_gb.value ? ((1 - v.free_gb.value / v.total_gb.value) * 100).toFixed(1) + '%' : '0%' } })),
      h('span', { class: 'og-num-s' }, `${fmt(v.free_gb)} GB 여유`))), h('div', { style: { marginTop: '8px' } }, prov(st.volumes[0].free_gb, { short: true })));
  };
  renderStorage(storage);
  const drawGpu = (s) => {
    for (const g of s.gpus || []) {
      const x = gpuRings.get(g.index); if (!x) continue;
      const tot = g.mem_total_mib.value || 1; const ext = g.external_used_mib?.value ?? 0; const used = g.mem_used_mib.value ?? 0;
      const fault = used / tot >= 0.95; const caution = !fault && used / tot >= 0.76;   // 링 = VRAM — 전력·이용률 주의는 아래 사유 줄(caution_why)로
      x.r.set({ segs: [{ id: 'ext', kind: 'ext', from: 0, to: ext / tot, title: `외부 점유 ${fmt(ext)} MiB` }, { id: 'wk', kind: 'ai', from: ext / tot, to: used / tot }], ticks: [{ kind: 'caution', at: 0.76 }] }).state({ caution, fault });
      setText(x.r.center.querySelector('[data-k="vpct"]'), `${Math.round(used / tot * 100)}%`);
      setText(x.host.querySelector('[data-k="util"]'), `${fmt(utilOf(g))}%`); setText(x.host.querySelector('[data-k="pw"]'), `${fmt(g.power_w, 0)} W`);
      const why = x.host.querySelector('[data-k="why"]'); setText(why, (g.caution_why || []).length ? `주의 · ${g.caution_why[0]}` : '정상'); why.classList.toggle('og-caution', !!(g.caution || caution) && !(g.fault || fault)); why.classList.toggle('og-fault', !!(g.fault || fault));
    }
    if (s.gpus?.[0]) gpuProv.replaceChildren(prov(utilOf(s.gpus[0]), { short: true }));
  };
  if (gpus?.gpus) drawGpu(gpus);
  frame.setMeta('nodes', String((nodes?.items || []).filter((n) => n.state !== 'pending').length)); frame.setMeta('gpus', String(gpus?.gpus?.length ?? 2)); frame.setMeta('queued', '0');

  // ── 지도 층: 실태조사 의심 밀도(빛) · 작업 점 · 배포 점
  try {
    const dj = await (await fetch('/landxi/ops/data/survey-density.json')).json();
    map.addSource('dens', { type: 'geojson', data: { type: 'FeatureCollection', features: dj.cells.map(([x, y, n, a]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { n, a } })) } });
    map.addLayer({ id: 'dens-heat', type: 'heatmap', source: 'dens', maxzoom: 12, paint: { 'heatmap-weight': ['interpolate', ['linear'], ['get', 'n'], 0, 0, 60, 1], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 1.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 7, 7, 9, 16, 11, 30], 'heatmap-opacity': 0.85,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(43,217,207,0)', 0.2, 'rgba(43,217,207,.25)', 0.5, 'rgba(43,217,207,.6)', 0.8, 'rgba(160,240,235,.85)', 1, 'rgba(255,255,255,.95)'] } }, 'emd-line');
    setText(densCap, `빛 = 실태조사 의심 ${fmt(dj.total)}건 · 남원`); densCap.title = `${dj.source} · ${dj.note}`;
  } catch { /* 밀도 층 없음 — 점만 */ }
  const layer = new DeployLayer(map, { onPick: (id) => { location.href = '/landxi/ops/deploys.html?deploy=' + id; } });
  // 작업 점(최근 작업 AOI 중심 · 같은 영상 묶음) — 실행 중은 job.state 로 따로(락온)
  const jobGroups = new Map();
  for (const j of J) { const c = centroid(j.aoi); if (!c || !inKorea(c)) continue; const k = c.map((v) => v.toFixed(2)).join(','); if (!jobGroups.has(k)) jobGroups.set(k, { c, list: [] }); jobGroups.get(k).list.push(j); }
  const ml = await loadLibs();
  for (const [, g] of jobGroups) {
    const j0 = g.list[0]; const nm = IMAGERY_KO[j0.imagery_id] || (j0.tenant_id === 'lx' ? j0.model_id : j0.tenant_id);
    const west = D.some((d) => { const c = centroid(d.aoi); return c && Math.abs(c[0] - g.c[0]) < 0.25 && Math.abs(c[1] - g.c[1]) < 0.25; });   // 배포 무리 곁이면 서쪽에 이름표(겹침 0)
    const el = h('a', { class: 'dm-jobs' + (west ? ' is-west' : ''), href: '/landxi/ops/infra.html?job=' + encodeURIComponent(j0.id), title: `${nm} · 최근 작업 ${g.list.length}건 · ${g.list.slice(0, 4).map((j) => j.id.slice(-6) + ' ' + j.state).join(' · ')}` }, h('i'), h('span', {}, `${nm} · 작업 ${g.list.length}`));
    new ml.Marker({ element: el, anchor: west ? 'right' : 'left', offset: [west ? 5 : -5, 0] }).setLngLat(g.c).addTo(map);
  }
  kpi.textContent = String(D.length);
  const globe = new Globe(slot, { size: 150 });
  const gp = () => [...globePoints(D.filter((d) => { const c = centroid(d.aoi); return c && !inKorea(c); })), { id: 'kr', lnglat: [127.6, 36.2], color: '#ABB3BF' }];
  globe.setPoints(gp()); globe.rot = [-98, -32]; globe.draw();

  // ── 초점: 전국 → 배포 밀집(1250) + 전국 인셋
  const dense = denseBounds(D, J);
  let national = false;
  const inset = new Inset(slot, { onToggle: async () => { national = !national; const [W, H] = size(); await easeP(map, fitCamera(W, H, national ? KOREA : dense, national ? 20 : 36), 1250); inset.set({ view: national ? null : dense, national }); document.documentElement.dataset.cam = national ? 'national' : 'dense'; } });
  inset.set({ view: dense, pts: D.filter((d) => { const c = centroid(d.aoi); return c && inKorea(c); }).map((d) => ({ lnglat: centroid(d.aoi), color: STAGE_COLOR[d.stage] })), national: false });
  if (flip) { const [W, H] = size(); await easeP(map, fitCamera(W, H, dense, 36), 1250); }
  document.documentElement.dataset.cam = 'dense';
  // ── 점 도착(앰버 락온 380 → 청록) — 첫 점이 선 뒤에 grown
  layer.set(D, { arrive: true });
  const first = [...layer.m.values()].map((r) => r.arrived).filter(Boolean)[0];
  if (first) await first;
  document.documentElement.dataset.pointsAt = String(Math.round(performance.now()));

  // ── 텔레메트리
  const tel = connect({
    onGpu: (s) => { drawGpu(s); frame.tick(false); },
    onQueue: (q) => { frame.setMeta('queued', String((q.pools?.a6000?.queued || 0) + (q.pools?.cpu?.queued || 0))); },
    onAlert: (a) => strip.event(a),
    onJob: (ev) => {
      layer.job(ev);
      jobBox.querySelector('[data-empty]')?.remove();
      const old = jobBox.querySelector(`[data-job="${ev.job_id}"]`); const row = jobRow(ev);
      if (old) old.replaceWith(row); else { row.classList.add('is-new'); jobBox.prepend(row); }
      while (jobBox.children.length > 4) jobBox.lastChild.remove();
    },
    onFinding: (ev) => { sv && sv.event(ev); },
    onDeploy: async (ev) => {
      const j = await get('deploys'); D = j.items || D;
      layer.set(D); drawTen(D); drawStages(D); if (ev.action === 'rollback') layer.lock(ev.deploy_id, ev.stage);
      setText(kpi, String(D.length)); globe.setPoints(gp());
    },
    onState: (st, age) => { if (st === 'stale') frame.tick(true, age / 1000); },
  });
  if (SRC.kind !== 'off') setInterval(async () => { renderStorage(await get('storage')); }, 60000);
  return { map, layer, globe, tel, inset };
}
