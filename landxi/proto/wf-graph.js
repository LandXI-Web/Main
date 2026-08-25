/* wf-graph.js — 액자 6개와 그것들을 잇는 선
   노드는 카드가 아니라 액자다(D1). 각 액자 안에는 그 단계가 지금 실제로 보고 있는 픽셀이 있고,
   텍스트는 액자 바깥 위쪽 12px 캡션으로 강등된다.
   액자는 남원 정사영상 위 실제 지리 앵커(탐지 밀도 상위 셀)에 매여 있고,
   헤어라인 리더선이 액자와 그 좌표를 잇는다.
*/

import { C } from './wf-data.js';
import {
  crop, drawDets, drawSlices, drawSliceProgress, drawTileGrid,
  drawModelCard, bracketRect,
} from './wf-thumb.js';

export const STAGES = [
  { id: 'source', no: '01', kind: 'SOURCE', ko: '영상' },
  { id: 'tile',   no: '02', kind: 'TILE',   ko: '타일 분할' },
  { id: 'model',  no: '03', kind: 'MODEL',  ko: '모델' },
  { id: 'detect', no: '04', kind: 'DETECT', ko: '탐지' },
  { id: 'post',   no: '05', kind: 'POST',   ko: '후처리' },
  { id: 'mapout', no: '06', kind: 'MAP',    ko: '지도' },
];

/* 액자 배치 = 항공측량의 왕복 항로(boustrophedon). 위 줄을 서→동으로 훑고
   끝에서 한 칸 내려와 동→서로 되돌아온다. 실제 촬영 항로의 모양 그대로다.
   [열, 행] */
const SLOTS = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]];
const FW = 216, FH = 138, BLOCK = 194;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGraph(opt) {
  const { host, edgesCanvas, mapc, data, hooks = {} } = opt;
  const map = mapc.map;
  const nodes = STAGES.map((s, i) => ({
    ...s, i,
    anchor: (data.anchors[i] || data.anchors[0]).c,
    cell: data.anchors[i] || data.anchors[0],
    slot: SLOTS[i], side: SLOTS[i][1] === 0 ? 1 : -1,
    x: 0, y: 0, dirty: true, live: false, prog: 0,
  }));

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  host.innerHTML = '';
  for (const n of nodes) {
    const el = document.createElement('article');
    el.className = 'node' + (n.id === 'mapout' ? ' is-window' : '');
    el.dataset.id = n.id;
    el.dataset.side = n.side > 0 ? 'r' : 'l';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${n.no} ${n.ko} 단계`);
    el.innerHTML = `
      <div class="cap"><span class="no">${n.no}</span><span class="kind">${n.kind}</span><span class="art" data-art>—</span></div>
      <div class="frame">
        ${n.id === 'mapout' ? '' : `<canvas width="${FW * 2}" height="${FH * 2}"></canvas>`}
        <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
        <span class="badge num" data-badge></span>
        <span class="flag">▣ 지도에 표시 중</span>
        <span class="prog"><i></i></span>
      </div>
      <div class="foot"><span data-foot>—</span></div>
      <b class="port in"></b><b class="port out"></b>`;
    n.el = el;
    n.canvas = el.querySelector('canvas');
    n.ctx = n.canvas ? n.canvas.getContext('2d', { willReadFrequently: false }) : null;
    if (n.ctx) { n.ctx.__s = 2; n.ctx.scale(2, 2); }
    n.badge = el.querySelector('[data-badge]');
    n.art = el.querySelector('[data-art]');
    n.foot = el.querySelector('[data-foot]');
    n.progEl = el.querySelector('.prog i');
    el.addEventListener('click', () => hooks.onPickNode?.(n.id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hooks.onPickNode?.(n.id); }
    });
    el.addEventListener('pointerenter', () => { n.hover = true; setLive(); hooks.onHoverNode?.(n.id); });
    el.addEventListener('pointerleave', () => { n.hover = false; setLive(); hooks.onHoverNode?.(null); });
    el.addEventListener('focus', () => { n.hover = true; setLive(); });
    el.addEventListener('blur', () => { n.hover = false; setLive(); });
    host.appendChild(el);
  }

  const ctx = edgesCanvas.getContext('2d');
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const r = host.getBoundingClientRect();
    edgesCanvas.width = Math.round(r.width * dpr);
    edgesCanvas.height = Math.round(r.height * dpr);
    edgesCanvas.style.width = r.width + 'px';
    edgesCanvas.style.height = r.height + 'px';
    layout();
  }

  /* ── 배치 ────────────────────────────────────────────────────────────
     액자는 항로 슬롯에 서고, 지도를 움직이면 자기 앵커 쪽으로 시차(parallax)만큼
     따라 움직인다. 정확한 좌표는 액자가 아니라 리더선 끝의 십자가 말한다. */
  function layout() {
    const r = host.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const padR = opt.safeRight ?? 356;
    const colW = Math.min(300, Math.max(FW + 30, (r.width - padR - 28) / 3));
    const rowH = Math.max(216, Math.min(250, (r.height - BLOCK - 150)));
    const y0 = 46;
    for (const n of nodes) {
      const p = map.project(n.anchor);
      n.ax = p.x; n.ay = p.y;
      const sx = 24 + n.slot[0] * colW;
      const sy = y0 + n.slot[1] * rowH;
      const dx = clamp((p.x - cx) * 0.08, -70, 70);
      const dy = clamp((p.y - cy) * 0.08, -46, 46);
      n.x = clamp(sx + dx, 16, r.width - padR - FW);
      n.y = clamp(sy + dy, 20, r.height - BLOCK - 24);
      n.el.style.transform = `translate3d(${Math.round(n.x)}px,${Math.round(n.y)}px,0)`;
    }
    drawEdges();
  }

  /* ── 엣지 — 거리에 비례해 처지는 케이블 + 펄스 1개(D4/D5) ─────────────── */
  let pulse = 0;         // 0..(nodes-1) 구간을 흐르는 광자 하나. 속도 = 실제 처리량.
  let tps = 0;           // tiles/sec (실측)
  const state = { running: false, viewer: 'detect', zoomBand: 'mid' };

  // 위 줄은 오른쪽으로 나가고, 아래 줄은 왼쪽으로 나간다(항로가 되돌아오므로).
  function ports(n) {
    const y = n.y + 26 + FH / 2;
    return n.side > 0
      ? { out: [n.x + FW, y], outDir: 1, in: [n.x, y], inDir: -1 }
      : { out: [n.x, y], outDir: -1, in: [n.x + FW, y], inDir: 1 };
  }
  function bez(pa, pb) {
    const a = pa.out, b = pb.in;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = clamp(d * 0.45, 46, 150);
    const sag = clamp(d * 0.1, 6, 46);
    return [a, [a[0] + pa.outDir * k, a[1] + sag], [b[0] + pb.inDir * k, b[1] + sag], b];
  }
  const at = (p, t) => {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ];
  };

  function drawEdges() {
    const r = host.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);

    // 리더선 — 액자와 그 액자가 서 있는 실제 좌표를 잇는다.
    // 밝은 정사영상 위에서도 읽히도록 어두운 밑선을 한 번 깔고 흰 선을 얹는다.
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(1,1,2,.45)';
    for (const n of nodes) {
      const px = n.x + FW / 2;
      const py = n.y + 26 + (n.ay > n.y + 26 + FH / 2 ? FH : 0);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(n.ax, n.ay); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const px = n.x + FW / 2;
      const py = n.y + 26 + (n.ay > n.y + 26 + FH / 2 ? FH : 0);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(n.ax, n.ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(n.ax - 5, n.ay); ctx.lineTo(n.ax + 5, n.ay);
      ctx.moveTo(n.ax, n.ay - 5); ctx.lineTo(n.ax, n.ay + 5); ctx.stroke();
      ctx.strokeRect(n.ax - 2.5, n.ay - 2.5, 5, 5);
    }
    ctx.restore();

    if (state.zoomBand === 'far') return;

    // 파이프라인 케이블 — 어두운 밑선 + 밝은 선 2겹
    for (let i = 0; i < nodes.length - 1; i++) {
      const p = bez(ports(nodes[i]), ports(nodes[i + 1]));
      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
      };
      trace(); ctx.strokeStyle = 'rgba(1,1,2,.5)'; ctx.lineWidth = 3.5; ctx.stroke();
      trace(); ctx.strokeStyle = state.running ? 'rgba(15,169,160,.95)' : 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1.2; ctx.stroke();
    }

    // 광자 하나 — 실행 중이면 실제 tiles/sec, 유휴면 마지막 실측값으로 아주 느리게.
    const seg = Math.floor(pulse);
    if (seg < nodes.length - 1) {
      const p = bez(ports(nodes[seg]), ports(nodes[seg + 1]));
      const q = at(p, pulse - seg);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 9);
      g.addColorStop(0, state.running ? 'rgba(255,182,51,.95)' : 'rgba(15,169,160,.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, 7); ctx.fill();
      ctx.restore();
    }

    // 락온 3비트 (180 / 80 / 120ms) — "AI가 방금 판단했다"
    if (lock) drawLock();
  }

  /* ── 락온 ────────────────────────────────────────────────────────────── */
  let lock = null;
  function lockOn(pt, label) {
    lock = { pt, label, t0: performance.now() };
  }
  function drawLock() {
    const e = performance.now() - lock.t0;
    if (e > 1900) { lock = null; return; }
    const [x, y] = lock.pt();
    if (!Number.isFinite(x)) { lock = null; return; }
    // 비트1 수렴 180ms → 비트2 확정(두께) 80ms → 비트3 라벨 120ms. 총 380ms.
    const b1 = Math.min(1, e / 180);
    const eased = 1 - (1 - b1) ** 3;
    const spread = 96 - 54 * eased;
    const lw = e > 180 ? (e > 260 ? 2 : 1.2 + 0.8 * ((e - 180) / 80)) : 1.2;
    const fade = e > 1500 ? Math.max(0, 1 - (e - 1500) / 400) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    bracketRect(ctx, x - spread, y - spread * 0.72, spread * 2, spread * 1.44, C.amber, 16, lw);
    if (e > 260) {
      const a = Math.min(1, (e - 260) / 120);
      ctx.globalAlpha = a * fade;
      ctx.font = '400 12px Inter, system-ui, sans-serif';
      const tx = x - spread + (1 - a) * 10, ty = y - spread * 0.72 - 10;
      const w = ctx.measureText(lock.label).width;
      ctx.fillStyle = 'rgba(1,1,2,.72)';
      ctx.fillRect(tx - 5, ty - 12, w + 10, 17);
      ctx.fillStyle = C.amber;
      ctx.fillText(lock.label, tx, ty);
    }
    ctx.restore();
  }

  /* ── 라이브 썸네일 예산 — 동시에 움직이는 액자는 최대 3개 (D2) ─────────── */
  function setLive() {
    let budget = 3;
    for (const n of nodes) {
      const want = (n.running || n.hover || n.id === state.viewer) && budget > 0;
      if (want) budget--;
      n.live = want;
      n.el.classList.toggle('is-live', !!want);
    }
  }

  /* ── 액자 렌더 — 여기서 실제 픽셀이 들어온다 ──────────────────────────── */
  let renderSeq = 0;
  async function renderAll(ss) {
    const seq = ++renderSeq;
    for (const n of nodes) {
      if (seq !== renderSeq) return;
      await renderNode(n, ss);
    }
    hooks.onThumbs?.(nodes.filter((n) => n.painted).length);
  }

  function fmt(v) { return v.toLocaleString('ko-KR'); }

  async function renderNode(n, ss) {
    const { center, feats, thr, epoch, classes } = ss;
    const img = data.img;
    const test = (p) => p.conf >= thr && classes.has(p.cls);
    n.el.classList.remove('is-void');

    if (n.id === 'mapout') {
      // 액자가 비어 있는 것이 아니라 **지도 그 자체가 액자 안**이다.
      n.painted = true;
      const c = ss.counts;
      n.art.textContent = data.res.geojson.split('/').pop();
      n.badge.textContent = `${fmt(c.obj)} ${data.unit === '필지' ? '동' : '건'}`;
      n.foot.textContent = `남원시 전역 · ${fmt(c.shown)}/${fmt(c.total)} ${data.unit} · ${data.areaHa.toLocaleString()} ha`;
      return;
    }

    const ctx2 = n.ctx;
    if (!ctx2) return;
    ctx2.setTransform(2, 0, 0, 2, 0, 0);
    ctx2.clearRect(0, 0, FW, FH);

    const epochImg = epoch.cityImg || img;
    let box = null;

    if (n.id === 'source') {
      box = await crop(ctx2, epochImg, ss.satUrl, center, 16);
      n.art.textContent = box.ortho ? epochImg.id : 'V-World Satellite';
      n.badge.textContent = box.mpp.toFixed(2) + ' m/px';
      n.foot.textContent = box.ortho
        ? `${epochImg.label} · 원본 GSD ${(epochImg.sourceGsd ?? epochImg.gsd).toFixed(4)} m · 타일 ${box.tiles}장`
        : `${box.src} · 고해상 도엽은 금지·송동 코어에만 있다`;
    } else if (n.id === 'tile') {
      // 모델이 실제로 보는 축척까지 확대한다 — 보간 없이(nearest) 픽셀 그대로.
      box = await crop(ctx2, epochImg, ss.satUrl, center, 17);
      const srcGsd = box.ortho ? (epochImg.sourceGsd ?? epochImg.gsd) : null;
      const sl = { slice: data.preset.slice, overlap: data.preset.overlap, srcGsd };
      let g;
      if (srcGsd) {
        g = drawSlices(ctx2, box, sl);
        if (n.running || n.prog > 0) drawSliceProgress(ctx2, box, sl, n.prog);
        n.art.textContent = `SAHI ${data.preset.slice}px · ${Math.round(data.preset.overlap * 100)}%`;
        n.badge.textContent = `${g.cols}×${g.rows}`;
        n.foot.textContent = `슬라이스 지상폭 ${g.stepM.toFixed(1)} m (원본 GSD ${srcGsd} m) · 중첩 ${Math.round(data.preset.overlap * 100)}% · z${box.zoom}`;
      } else {
        g = drawTileGrid(ctx2, box);
        n.art.textContent = `웹 타일 256px`;
        n.badge.textContent = `z${box.zoom}`;
        n.foot.textContent = `원본 GSD 미상 — 실제 웹 타일 경계만 표시 · ${g.cols}×${g.rows} 타일`;
      }
    } else if (n.id === 'model') {
      drawModelCard(ctx2, data.mdl, data.classes);
      n.art.textContent = data.mdl ? data.mdl.file : '없음';
      n.badge.textContent = data.mdl ? `${data.mdl.classes.length}클래스` : '결손';
      n.foot.textContent = data.mdl
        ? `${data.mdl.name} · ${data.mdl.task} · ${data.mdl.sizeMB} MB · ${data.mdl.trainedAt} 학습`
        : '저장소에 이 과업의 학습 모델(.pt)이 없다 — 산출물만 존재';
      if (!data.mdl) n.el.classList.add('is-void');
      n.painted = true;
      return;
    } else if (n.id === 'detect') {
      box = await crop(ctx2, epochImg, ss.satUrl, center, 17);
      const r = drawDets(ctx2, box, feats, { test: () => true, fill: 0.22, lw: 1.3, bracket: true });
      n.art.textContent = data.mdl ? data.mdl.file : data.res.src;
      n.badge.textContent = `${fmt(r.drawn)} ${data.unit}`;
      n.foot.textContent = `${data.res.title} · 원본 ${data.res.src} · ${data.analyzedAt} 분석`;
    } else if (n.id === 'post') {
      box = await crop(ctx2, epochImg, ss.satUrl, center, 17);
      const r = drawDets(ctx2, box, feats, { test, fill: 0.24, lw: 1.4 });
      n.art.textContent = `conf ≥ ${thr.toFixed(2)}`;
      n.badge.textContent = `${fmt(r.drawn)} / ${fmt(r.drawn + r.dimmed)}`;
      n.foot.textContent = `임계 미만 ${fmt(r.dimmed)}건은 삭제가 아니라 감쇠 · PNU 필지 union`;
    }

    // 액자 안 헤어라인 스케일바 — 사람 척도로 읽히는 길이 하나(장치 8)
    if (box && box.mpp) scaleBar(ctx2, box.mpp);
    n.painted = true;
    n.box = box;
  }

  function scaleBar(ctx2, mpp) {
    const [hm, hlabel] = data.preset.humanScale || [100, null];
    const targets = [10, 20, hm, 100, 200, 500];
    const want = FW * 0.28 * mpp;
    const m = targets.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
    const w = m / mpp;
    ctx2.save();
    ctx2.strokeStyle = 'rgba(255,255,255,.8)'; ctx2.lineWidth = 1;
    const y = FH - 12;
    ctx2.beginPath(); ctx2.moveTo(10, y); ctx2.lineTo(10 + w, y);
    ctx2.moveTo(10, y - 3); ctx2.lineTo(10, y + 3);
    ctx2.moveTo(10 + w, y - 3); ctx2.lineTo(10 + w, y + 3);
    ctx2.stroke();
    ctx2.font = '400 9px Inter, system-ui, sans-serif';
    ctx2.fillStyle = 'rgba(255,255,255,.8)';
    ctx2.fillText(m === hm && hlabel ? `${m} m · ${hlabel}` : `${m} m`, 10, y - 6);
    ctx2.restore();
  }

  /* ── 시맨틱 줌 (D8) — 줌이 상세도 다이얼이다 ──────────────────────────── */
  function setZoomBand() {
    const z = map.getZoom();
    const band = z < 12.9 ? 'far' : z > 15.4 ? 'near' : 'mid';
    if (band === state.zoomBand) return;
    state.zoomBand = band;
    host.dataset.band = band;
    hooks.onBand?.(band);
  }

  /* ── 애니메이션 루프 ─────────────────────────────────────────────────── */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(80, now - last) / 1000;
    last = now;
    if (!reduce) {
      // 광자 속도 = 실측 tiles/sec. 유휴면 마지막 실측값으로 아주 느리게(주기 ≥ 6s).
      const v = state.running ? Math.max(0.35, Math.min(3.2, tps / 6)) : 0.16;
      pulse = (pulse + dt * v) % (nodes.length - 1);
    }
    drawEdges();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  map.on('move', layout);
  map.on('zoom', setZoomBand);
  window.addEventListener('resize', resize);
  resize();
  setZoomBand();
  setLive();

  return {
    nodes, layout, resize, renderAll, lockOn,
    setViewer(id) {
      state.viewer = id;
      for (const n of nodes) n.el.classList.toggle('is-viewer', n.id === id);
      setLive();
    },
    setRunning(on) { state.running = on; setLive(); },
    setNodeRun(id, p) {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      n.running = p != null && p < 1;
      n.prog = p ?? 0;
      if (n.progEl) n.progEl.style.transform = `scaleX(${p ?? 0})`;
      setLive();
    },
    setTps(v) { tps = Math.max(0, Math.min(60, v)); },
    get band() { return state.zoomBand; },
    thumbs() { return nodes.filter((n) => n.painted).length; },
    node(id) { return nodes.find((n) => n.id === id); },
  };
}

export { FW, FH };
