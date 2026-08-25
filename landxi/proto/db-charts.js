// 원장 안의 미니 차트 — 방문(7일)·스토리지. 둘 다 원형 프로토타입의 시연 목업이라
// 꼬리표를 달고 작게 둔다. 축·격자 최소, 데이터 잉크만, 액센트 하나.
import { VISITS, VISITS_TOTAL, STORAGE, PROJECTS, nf } from './db-data.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 7일 방문 — 막대 7개, 최대값만 진하게. */
function visitsSVG() {
  const W = 336, H = 62, pad = 14;
  const max = Math.max(...VISITS.map((v) => v.count));
  const bw = (W - pad) / VISITS.length;
  const bars = VISITS.map((v, i) => {
    const h = (v.count / max) * (H - 20);
    const x = i * bw;
    return `<rect class="bar${v.count === max ? '' : ' dim'}" x="${x.toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${h.toFixed(1)}"/>`
      + `<text class="lbl" x="${(x + (bw - 6) / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${v.day}</text>`
      + (v.count === max ? `<text class="val" x="${(x + (bw - 6) / 2).toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" text-anchor="middle">${nf.format(v.count)}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="7일 방문 ${nf.format(VISITS_TOTAL)}회"><line class="ax" x1="0" y1="${H - 14}" x2="${W - pad}" y2="${H - 14}"/>${bars}</svg>`;
}

/** 스토리지 — 한 줄 누적 막대(도넛 대신 자 위에 눕힌다). */
function storageSVG() {
  const W = 336, H = 26;
  const used = STORAGE.used, total = STORAGE.total;
  let x = 0;
  const segs = STORAGE.parts.map((p, i) => {
    const w = (p.tb / total) * W;
    const r = `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(0.8, w - 1).toFixed(1)}" height="9" fill="${i ? '#D3DEF2' : '#006DF7'}" opacity="${i ? 1 - i * 0.16 : 1}"/>`;
    x += w;
    return r;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="스토리지 ${used}TB / ${total}TB">`
    + `<rect x="0" y="0" width="${W}" height="9" fill="#F1F2F4"/>${segs}`
    + `<text class="val" x="0" y="22">${used} TB</text>`
    + `<text class="lbl" x="${W}" y="22" text-anchor="end">전체 ${total} TB · ${((used / total) * 100).toFixed(0)}%</text></svg>`;
}

/** AI 개발 프로젝트 현황 — 원본의 가로 막대 Top 5(용량 GB). 축·격자 없이 값만. */
function projectsSVG() {
  const top = [...PROJECTS].sort((a, b) => b.gb - a.gb).slice(0, 5);
  const W = 336, rowH = 19, H = top.length * rowH;
  const max = Math.max(...top.map((t) => t.gb));
  const NAMEW = 132, VALW = 46, TRACK = W - NAMEW - VALW;
  const rows = top.map((t, i) => {
    const y = i * rowH;
    const w = (t.gb / max) * TRACK;
    return `<text class="lbl" x="0" y="${y + 12}">${esc(t.name)}</text>`
      + `<rect x="${NAMEW}" y="${y + 4}" width="${Math.max(1, w).toFixed(1)}" height="8" fill="#006DF7" opacity="${(1 - i * 0.14).toFixed(2)}"/>`
      + `<text class="val" x="${W}" y="${y + 12}" text-anchor="end">${t.gb} GB</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="프로젝트 용량 Top 5">${rows}</svg>`;
}

export function drawMinis(host) {
  host.innerHTML = `
    <div class="mini">${projectsSVG()}
      <p class="caption" style="margin-top:6px">데이터 사용량 상위 <span class="num">5</span> · 전체 <span class="num">${PROJECTS.length}</span>과제</p>
    </div>
    <div class="mini">${visitsSVG()}
      <p class="caption" style="margin-top:6px">7일 방문 합계 <span class="num">${nf.format(VISITS_TOTAL)}</span>회</p>
    </div>
    <div class="mini" style="padding-top:0">${storageSVG()}
      <p class="caption" style="margin-top:6px">${STORAGE.parts.map((p) => `${esc(p.label)} <span class="num">${p.tb}</span>TB`).join(' · ')}</p>
    </div>`;
}
