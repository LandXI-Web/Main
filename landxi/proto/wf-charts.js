// 작은 캔버스 차트 4종. ECharts 를 쓰지 않는 이유는 무게가 아니라 통제다 —
// 축·색·클릭 히트영역을 토큰과 정확히 맞춰야 "한 시스템"으로 읽힌다.
// 규칙: 차트는 보고서가 아니라 필터다(Roboflow P3). 막대를 누르면 지도가 반응한다.

import { cssVar } from '../assets/js/tokens.js';
import { classColor, ko } from './wf-data.js';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);
export function fit(c) {
  const r = c.getBoundingClientRect(), d = DPR();
  if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) {
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  return { ctx, w: r.width, h: r.height };
}
const MONO = (s = 9) => `500 ${s}px "IBM Plex Mono",monospace`;

/* ── 신뢰도 히스토그램 ────────────────────────────────────────────────── */
export function histBins(feats, classes, lo = 0, hi = 1, n = 20) {
  const bins = new Array(n).fill(0);
  for (const f of feats) {
    const p = f.properties;
    if (classes && !classes.has(p.cls)) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor(((p.conf - lo) / (hi - lo)) * n)));
    bins[i]++;
  }
  return bins;
}

export function drawHist(c, bins, thr, lo, hi, opt = {}) {
  const { ctx, w, h } = fit(c);
  const pad = { l: 34, r: 6, t: 6, b: 16 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(1, ...bins);
  const bw = iw / bins.length;
  const axis = cssVar('--sl-11', '#D3D8DE');

  ctx.strokeStyle = axis; ctx.lineWidth = 1;
  ctx.font = MONO(8.5); ctx.fillStyle = cssVar('--ink-3', '#7a8496');
  for (let i = 0; i <= 2; i++) {
    const raw = Math.round((max * (2 - i)) / 2);
    const v = raw >= 1000 ? (raw / 1000).toFixed(raw >= 10000 ? 0 : 1) + 'k' : String(raw);
    const y = pad.t + (ih * i) / 2;
    ctx.beginPath(); ctx.moveTo(pad.l, y + 0.5); ctx.lineTo(w - pad.r, y + 0.5); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(v, pad.l - 4, y + 3);
  }

  bins.forEach((v, i) => {
    const x = pad.l + i * bw;
    const bh = (v / max) * ih;
    const c0 = lo + ((hi - lo) * (i + 0.5)) / bins.length;
    const on = c0 >= thr;
    ctx.fillStyle = on ? cssVar('--lx', '#006DF7') : cssVar('--sl-11', '#D3D8DE');
    ctx.globalAlpha = on ? 0.92 : 0.55;
    ctx.fillRect(x + 0.6, pad.t + ih - bh, bw - 1.2, Math.max(bh, v ? 1 : 0));
  });
  ctx.globalAlpha = 1;

  // 임계선
  const tx = pad.l + ((thr - lo) / (hi - lo)) * iw;
  ctx.strokeStyle = cssVar('--s-found', '#F2622A'); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx, pad.t - 2); ctx.lineTo(tx, pad.t + ih + 2); ctx.stroke();
  ctx.fillStyle = cssVar('--s-found', '#F2622A'); ctx.font = MONO(9);
  ctx.textAlign = tx > w - 40 ? 'right' : 'left';
  ctx.fillText(thr.toFixed(2), tx + (tx > w - 40 ? -3 : 3), pad.t + 8);

  ctx.textAlign = 'left'; ctx.fillStyle = cssVar('--ink-3', '#7a8496'); ctx.font = MONO(8.5);
  ctx.fillText(lo.toFixed(2), pad.l, h - 4);
  ctx.textAlign = 'right'; ctx.fillText(hi.toFixed(2), w - pad.r, h - 4);
  if (opt.note) { ctx.textAlign = 'center'; ctx.fillText(opt.note, pad.l + iw / 2, h - 4); }
  c._geom = { pad, iw, ih, n: bins.length, lo, hi };
}

// 히스토그램 클릭 → 그 구간을 임계값으로. 차트가 필터를 겸한다.
export function histValueAt(c, clientX) {
  const g = c._geom; if (!g) return null;
  const r = c.getBoundingClientRect();
  const x = clientX - r.left - g.pad.l;
  if (x < 0 || x > g.iw) return null;
  const i = Math.min(g.n - 1, Math.floor((x / g.iw) * g.n));
  return Math.round((g.lo + ((g.hi - g.lo) * i) / g.n) * 100) / 100;
}

/* ── 슬라이더 위 스파크라인 ──────────────────────────────────────────── */
export function drawSpark(c, bins, thr, lo, hi) {
  const { ctx, w, h } = fit(c);
  const max = Math.max(1, ...bins);
  const bw = w / bins.length;
  bins.forEach((v, i) => {
    const c0 = lo + ((hi - lo) * (i + 0.5)) / bins.length;
    const bh = (v / max) * (h - 3);
    ctx.fillStyle = c0 >= thr ? cssVar('--lx', '#006DF7') : cssVar('--sl-10', '#C5CBD3');
    ctx.globalAlpha = c0 >= thr ? 0.85 : 0.5;
    ctx.fillRect(i * bw + 0.5, h - bh, bw - 1, bh);
  });
  ctx.globalAlpha = 1;
}

/* ── 클래스별 막대 ────────────────────────────────────────────────────── */
export function drawClassBars(c, rows) {
  const { ctx, w, h } = fit(c);
  if (!rows.length) return;
  const rowH = Math.min(20, h / rows.length);
  const labelW = Math.min(96, w * 0.42);
  const max = Math.max(1, ...rows.map((r) => r.all));
  ctx.font = MONO(9.5);
  rows.forEach((r, i) => {
    const y = i * rowH + rowH / 2;
    ctx.textAlign = 'left'; ctx.fillStyle = r.on ? cssVar('--ink-2', '#3c4757') : cssVar('--ink-3', '#98a1ae');
    const name = ko(r.cls);
    ctx.fillText(name.length > 11 ? name.slice(0, 10) + '…' : name, 2, y + 3.4);
    const bx = labelW, bw = w - labelW - 46;
    ctx.fillStyle = cssVar('--sl-13', '#E5E8EB');
    ctx.fillRect(bx, y - 4.5, (r.all / max) * bw, 9);
    ctx.fillStyle = classColor(r.cls);
    ctx.globalAlpha = r.on ? 1 : 0.2;
    ctx.fillRect(bx, y - 4.5, (r.n / max) * bw, 9);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.fillStyle = cssVar('--ink', '#111C2D');
    ctx.fillText(r.n.toLocaleString(), w - 2, y + 3.4);
    if (!r.on) { ctx.strokeStyle = cssVar('--sl-9', '#ABB3BF'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2, y + 0.5); ctx.lineTo(labelW - 6, y + 0.5); ctx.stroke(); }
  });
  c._rows = { rowH, rows };
}
export function classAt(c, clientY) {
  const g = c._rows; if (!g) return null;
  const r = c.getBoundingClientRect();
  const i = Math.floor((clientY - r.top) / g.rowH);
  return g.rows[i] ? g.rows[i].cls : null;
}

/* ── 학습 곡선 ────────────────────────────────────────────────────────── */
export function drawCurve(c, curve, label) {
  const { ctx, w, h } = fit(c);
  const pad = { l: 24, r: 24, t: 8, b: 14 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  ctx.strokeStyle = cssVar('--sl-12', '#DCE0E5'); ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const y = pad.t + (ih * i) / 2;
    ctx.beginPath(); ctx.moveTo(pad.l, y + 0.5); ctx.lineTo(w - pad.r, y + 0.5); ctx.stroke();
  }
  const line = (arr, color, norm) => {
    ctx.beginPath();
    arr.forEach((v, i) => {
      const x = pad.l + (iw * i) / (arr.length - 1);
      const y = pad.t + ih * (1 - norm(v));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
  };
  line(curve.map50, cssVar('--ai', '#0FA9A0'), (v) => v);
  line(curve.loss, cssVar('--s-found', '#F2622A'), (v) => Math.min(1, v / 3));
  ctx.font = MONO(8.5);
  ctx.textAlign = 'left'; ctx.fillStyle = cssVar('--ai', '#0FA9A0'); ctx.fillText('mAP50', pad.l, pad.t + 8);
  ctx.fillStyle = cssVar('--s-found', '#F2622A'); ctx.fillText('loss', pad.l + 40, pad.t + 8);
  ctx.fillStyle = cssVar('--ink-3', '#98a1ae');
  ctx.fillText('1', pad.l, h - 3);
  ctx.textAlign = 'right'; ctx.fillText(`${curve.map50.length} epoch`, w - pad.r, h - 3);
  ctx.textAlign = 'center'; ctx.fillText(label, pad.l + iw / 2, h - 3);
}

/* ── 실측 지연시간 ────────────────────────────────────────────────────── */
export function drawLatency(c, runs, steps) {
  const { ctx, w, h } = fit(c);
  if (!steps.length) {
    ctx.font = MONO(10); ctx.fillStyle = cssVar('--ink-3', '#98a1ae'); ctx.textAlign = 'center';
    ctx.fillText('실행하면 블록별 실측 소요가 여기에 쌓인다', w / 2, h / 2);
    return;
  }
  const total = steps.reduce((s, x) => s + x.ms, 0) || 1;
  // 블록별 소요를 100% 스택 바로 — 어디서 시간이 갔는지가 한눈에 보여야 한다.
  let x = 0;
  const barY = 6, barH = Math.min(20, h * 0.3);
  ctx.font = MONO(8.5);
  for (const s of steps) {
    const bw = (s.ms / total) * w;
    ctx.fillStyle = s.cached ? cssVar('--sl-11', '#D3D8DE') : cssVar(s.tone, '#006DF7');
    ctx.fillRect(x, barY, Math.max(1, bw - 1), barH);
    if (bw > 34) {
      ctx.fillStyle = s.cached ? cssVar('--ink-2', '#3c4757') : '#fff';
      ctx.textAlign = 'left'; ctx.fillText(Math.round(s.ms) + 'ms', x + 4, barY + barH / 2 + 3);
    }
    x += bw;
  }
  // 최근 실행 총소요 추세
  const hist = runs.slice(-14);
  if (hist.length > 1) {
    const max = Math.max(...hist), y0 = barY + barH + 12, ih = h - y0 - 12;
    ctx.strokeStyle = cssVar('--lx', '#006DF7'); ctx.lineWidth = 1.4;
    ctx.beginPath();
    hist.forEach((v, i) => {
      const px = (w * i) / (hist.length - 1), py = y0 + ih * (1 - v / max);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = cssVar('--ink-3', '#98a1ae'); ctx.font = MONO(8.5); ctx.textAlign = 'left';
    ctx.fillText(`최근 ${hist.length}회 총소요`, 2, h - 2);
    ctx.textAlign = 'right'; ctx.fillText(Math.round(max) + 'ms', w - 2, y0 + 6);
  }
}
