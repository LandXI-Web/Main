// 원장 안의 스탯 타일 3종 — B10 · B11 · B12.
// 규칙(취향 §3-1 / §7): **형태가 서로 달라야 한다.** 균일한 카드 그리드는 거부 목록에 있다.
//   B10 프로젝트 용량 → 랭크드 바   B11 7일 방문 → 스파크라인   B12 스토리지 → 도넛 게이지
// 축·격자 최소, 데이터 잉크만, 액센트 하나. 값은 원본 대시보드의 값 그대로다.
import { nf } from './db-data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** B10 — 랭크드 바. 용량 상위 5개, 이름 / 막대 / 값 세 열. */
export function rankedBar(projects) {
  const top = [...projects].sort((a, b) => b.gb - a.gb).slice(0, 5);
  const W = 328, rowH = 18, H = top.length * rowH;
  const max = Math.max(...top.map((t) => t.gb)) || 1;
  const NAMEW = 128, VALW = 48, TRACK = W - NAMEW - VALW;
  const rows = top.map((t, i) => {
    const y = i * rowH;
    const w = (t.gb / max) * TRACK;
    return `<text class="lbl" x="0" y="${y + 12}">${esc(t.name)}</text>`
      + `<rect class="bar" x="${NAMEW}" y="${y + 4.5}" width="${Math.max(1, w).toFixed(1)}" height="7" opacity="${(1 - i * 0.13).toFixed(2)}"/>`
      + `<text class="val" x="${W}" y="${y + 12}" text-anchor="end">${t.gb}<tspan class="u"> GB</tspan></text>`;
  }).join('');
  return `<svg class="ch ch--rank" viewBox="0 0 ${W} ${H}" role="img" aria-label="프로젝트 데이터 사용량 상위 5">${rows}</svg>`
    + `<p class="caption ch__n">데이터 사용량 상위 <span class="num">5</span> · 전체 <span class="num">${projects.length}</span>과제 <i class="tag tag--demo">시연</i></p>`;
}

/** B11 — 스파크라인. 막대가 아니라 선 하나 + 최고점 하나. */
export function sparkline(visits, total) {
  const W = 328, H = 46, pad = 4;
  const max = Math.max(...visits.map((v) => v.count)) || 1;
  const min = Math.min(...visits.map((v) => v.count));
  const x = (i) => pad + (i / (visits.length - 1)) * (W - pad * 2);
  const y = (v) => H - 12 - ((v - min) / Math.max(1, max - min)) * (H - 22);
  const pts = visits.map((v, i) => `${x(i).toFixed(1)},${y(v.count).toFixed(1)}`).join(' ');
  const area = `${pad},${H - 12} ${pts} ${W - pad},${H - 12}`;
  const hi = visits.findIndex((v) => v.count === max);
  const ticks = visits.map((v, i) => `<text class="lbl" x="${x(i).toFixed(1)}" y="${H - 1}" text-anchor="middle">${esc(v.day)}</text>`).join('');
  return `<svg class="ch ch--spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 7일 방문 ${nf.format(total)}회">
      <polygon class="fill" points="${area}"/>
      <polyline class="line" points="${pts}"/>
      <line class="ax" x1="0" y1="${H - 12}" x2="${W}" y2="${H - 12}"/>
      <circle class="pk" cx="${x(hi).toFixed(1)}" cy="${y(max).toFixed(1)}" r="2.4"/>
      <text class="val" x="${x(hi).toFixed(1)}" y="${(y(max) - 6).toFixed(1)}" text-anchor="middle">${nf.format(max)}</text>
      ${ticks}
    </svg>`
    + `<p class="caption ch__n">7일 합계 <span class="num">${nf.format(total)}</span>회 · 최고 <span class="num">${nf.format(max)}</span> <i class="tag tag--demo">시연</i></p>`;
}

/** B12 — 도넛 게이지. dasharray 스윕으로 값이 도착한다. */
export function donut(storage) {
  const { used, total, parts } = storage;
  const pct = used / total;
  const R = 26, C = 2 * Math.PI * R;
  const legend = parts.map((p, i) => `
    <li><i style="opacity:${(1 - i * 0.18).toFixed(2)}"></i><span>${esc(p.label)}</span><b class="num">${p.tb}<em> TB</em></b></li>`).join('');
  return `<div class="gauge">
      <svg viewBox="0 0 64 64" role="img" aria-label="스토리지 ${used} / ${total} TB">
        <circle class="trk" cx="32" cy="32" r="${R}"/>
        <circle class="arc" cx="32" cy="32" r="${R}" stroke-dasharray="${(C * pct).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 32 32)"/>
        <text class="gv" x="32" y="34" text-anchor="middle">${Math.round(pct * 100)}%</text>
      </svg>
      <ul class="lg">${legend}</ul>
    </div>`
    + `<p class="caption ch__n"><span class="num">${used}</span> / <span class="num">${total}</span> TB 사용 <i class="tag tag--demo">시연</i></p>`;
}
