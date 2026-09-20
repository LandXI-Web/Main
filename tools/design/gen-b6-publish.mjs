// B6 카드 발행 관리 — 원판 아트보드 생성기 (2026-09-20, 공통 브리프 docs/superpowers/proto/2026-09-20-b6-common-brief.md)
// 원본: landxi7/admin-publish.html · ai-card.html · ai-card-edit.html · ai-publish-create.html (+ assets/js/ai-project-data.js · page-ai-labeling-core.js · page-ai-publish6.js)
// 이 화면군 = 모델 카드 "검토·승인 데스크". 대시보드 승인 대기 EVIDENCE-PAIR(요청 지역 실크롭 + 빨강 글자 `검토 ›`)의 어휘를 그대로 잇는다.
// 값: 원본 데모 시드(REQUESTS · AI_PROJECTS · AI_TRAIN_RESULTS · AI_PERMISSIONS · AI_MODEL_CARDS) = `시연`, results.js 실측(남원 농지 2,098 필지 · 비닐하우스 1,674 필지) = `실측`. 사람 이름 0(§5).
// usage: node tools/design/gen-b6-publish.mjs   (repo root) — 멱등, 아트보드 전부 다시 쓴다.
// 렌더: node design-canvas/v2/render.mjs B6-Publish-Opt1 …  (notes/B6-publish.md 의 목록)
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
const written = [];
const wr = (name, body) => { fs.writeFileSync(path.join(dir, `${name}.dc.html`), page(body), 'utf8'); written.push(name); };

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const W = 1440, HT = 900, X0 = 128, XR = 1384, CW = 1256;

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const dash = (x, y, w, h, inner = '', extra = '') => div(x, y, w, h, `border:1px dashed ${C};${extra}`, inner);
const t = (x, y, s, o = {}) => `<div class="${o.cls || ''}" style="position:absolute;left:${x}px;top:${y}px;font-size:${o.s || 16}px;line-height:${o.lh || 1.3};letter-spacing:${o.ls || '-.01em'};color:${o.c || INK};white-space:${o.wrap ? 'normal' : 'nowrap'};${o.w ? `width:${o.w}px;` : ''}${o.r ? 'text-align:right;' : ''}${o.ct ? 'text-align:center;' : ''}${o.fw ? `font-weight:${o.fw};` : ''}${o.ell ? 'overflow:hidden;text-overflow:ellipsis;' : ''}${o.x || ''}">${s}</div>\n`;
const n = (x, y, s, o = {}) => t(x, y, s, { cls: 'n', ls: '.01em', s: 15, ...o });
const d = (x, y, s, size, o = {}) => t(x, y, s, { cls: 'd', s: size, lh: 1.1, ...o });
const lab = (x, y, s, o = {}) => t(x, y, s, { s: 14, c: G, ls: '.04em', lh: 1.2, ...o });
const tag = (s = '시연') => `<span class="tag">${s}</span>`;
const svg = (p, size = 16, color = ACC, extra = '') => `<svg style="color:${color};flex:none;display:block;${extra}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">${p}</svg>`;
const ico = (x, y, p, size = 16, color = G) => `<div style="position:absolute;left:${x}px;top:${y}px">${svg(p, size, color)}</div>\n`;
const brk = (x, y, w, h, col = INK, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none"><path d="M.5 ${k}V.5h${k}M${w - k} .5h${k - .5}v${k}M${w - .5} ${h - k}v${k - .5}h-${k}M${k} ${h - .5}H.5v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>\n`;
const chk = (x, y, on, col = INK) => div(x, y, 16, 16, `border:1px solid ${on ? col : C};background:${on ? col : '#FFFFFF'}`, on ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FFFFFF" stroke-width="1.6" style="display:block"><path d="M3 7.2 6 10l5-6"/></svg>` : '');
const radio = (x, y, on) => div(x, y, 16, 16, `border:1px solid ${on ? INK : C};display:flex;align-items:center;justify-content:center`, on ? `<div style="width:8px;height:8px;background:${INK}"></div>` : '');
const cta = (x, y, w, h, s) => div(x, y, w, h, `background:${INK};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500;letter-spacing:-.01em;white-space:nowrap`, s);
const btn2 = (x, y, w, h, s, col = INK) => div(x, y, w, h, `display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500;letter-spacing:-.01em;color:${col};white-space:nowrap`, s) + brk(x, y, w, h, col, 10, 1);
const chev = (col = G) => `<svg width="10" height="7" viewBox="0 0 9 6" fill="none" stroke="${col}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const fld = (x, y, w, h, inner, o = {}) => div(x, y, w, h, `border:1px solid ${o.bc || H};${o.bg ? `background:${o.bg};` : ''}display:flex;align-items:center;padding:0 12px;gap:8px;font-size:15.5px;letter-spacing:-.01em;white-space:nowrap;color:${o.c || INK};overflow:hidden`, inner);
const sel = (x, y, w, h, s, o = {}) => fld(x, y, w, h, `<span>${s}</span><span style="flex:1"></span>${chev(o.c === C ? C : G)}`, o);
const ph = (s) => `<span style="color:${C}">${s}</span>`;
const auto = (x, y, w, h, s) => div(x, y, w, h, `background:${T1};display:flex;align-items:center;padding:0 12px;font-size:15.5px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden`, s);
const flab = (x, y, s, o = {}) => t(x, y, s + (o.req ? ` <span style="color:${ACC}">*</span>` : '') + (o.auto ? ` <span class="tag" style="border-style:solid;border-color:${H}">자동</span>` : ''), { s: 14, c: G, ls: '.02em', lh: 1.2 }) + (o.count ? n(x, y, o.count, { s: 14, c: G, w: o.w, r: 1 }) : '');
const img = (x, y, w, h, src, o = {}) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${INK}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:${o.pos || '50% 50%'};display:block;${o.f || 'filter:saturate(.88) contrast(1.04)'}">${o.over || ''}</div>\n`;
const capbar = (w, h, l, r = '') => `<div style="position:absolute;left:0;bottom:0;width:${w}px;height:28px;background:rgba(1,1,2,.62);display:flex;align-items:center;padding:0 10px;gap:8px;font-size:14px;color:#FFFFFF;letter-spacing:-.01em;white-space:nowrap"><span>${l}</span><span style="flex:1"></span><span style="color:rgba(255,255,255,.78)">${r}</span></div>`;

const IC = {
  mark: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M8.5 8.5h3v3h-3z" fill="currentColor" stroke="none"/>',
  dash: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>',
  data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>',
  proj: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>',
  anal: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>',
  map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>',
  sup: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>',
  pub: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>',
  svc: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>',
  out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  search: '<path d="M3 3h10.5v10.5H3z"/><path d="m13.5 13.5 4 4"/>',
  refresh: '<path d="M16.5 4v4.5H12"/><path d="M16 8.5A6.5 6.5 0 1 0 16.5 12"/>',
  close: '<path d="M4 4l12 12M16 4 4 16"/>',
  rect: '<path d="M3 4h14v12H3z"/>', circle: '<circle cx="10" cy="10" r="6.5"/>', polygon: '<path d="M10 3l7 5-2.5 8h-9L3 8z"/>',
  copy: '<path d="M7 7h10v10H7z"/><path d="M3 13V3h10"/>', undo: '<path d="M7 5 3 9l4 4"/><path d="M3 9h9.5v7H7"/>',
  save: '<path d="M3 3h11l3 3v11H3z"/><path d="M6 3v5h7V3M6 17v-6h8v6"/>',
  plus: '<path d="M10 4v12M4 10h12"/>', minus: '<path d="M4 10h12"/>', lock: '<path d="M5 9h10v8H5z"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  pen: '<path d="M4 16l2-6 7-7 4 4-7 7z"/><path d="M11 5l4 4"/>', up: '<path d="M10 14V4M6 8l4-4 4 4M3 17h14"/>',
  layers: '<path d="M10 3 3 7l7 4 7-4z"/><path d="M3 11l7 4 7-4"/>', ruler: '<path d="M3 13 13 3l4 4L7 17z"/><path d="M8 8l2 2M11 5l2 2M5 11l2 2"/>',
  globe: '<path d="M3 3h14v14H3z"/><path d="M3 10h14M10 3v14"/>',
};

// ---------- 레일 72 (관리자 · 원본 GNB 순서) ----------
function rail(active) {
  const item = (y, label, icon, key) => {
    const on = key === active;
    return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}
${svg(IC[icon], 20, on ? INK : G)}
<div style="font-size:14px;line-height:1.15;letter-spacing:-.04em;text-align:center;white-space:pre-line;color:${on ? INK : G}${on ? ';font-weight:500' : ''}">${label}</div></div>`;
  };
  return `<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:#FFFFFF;z-index:9">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
${svg(IC.mark, 19, INK)}
<div class="d" style="font-size:14px;letter-spacing:0;white-space:nowrap">LAND XI</div></div>
<div style="position:absolute;left:12px;top:58px;width:48px;height:1px;background:${H}"></div>
${item(72, '대시보드', 'dash', 'dash')}
${item(130, '데이터\n관리', 'data', 'data')}
${item(188, '프로젝트', 'proj', 'proj')}
${item(246, '분석 서비스', 'anal', 'anal')}
${item(304, '지도 서비스', 'map', 'map')}
${item(596, '서비스 지원', 'sup', 'sup')}
${item(654, '카드 발행\n관리', 'pub', 'pub')}
${item(712, '서비스 관리', 'svc', 'svc')}
${item(770, 'MY', 'my', 'my')}
${item(828, '로그아웃', 'out', 'out')}
</div>
<div style="position:absolute;left:72px;top:0;width:1px;height:${HT}px;background:${H}"></div>\n`;
}

// ---------- 시드 (원본 admin-publish.html REQUESTS — 시연) ----------
const REQ = [
  { id: 'pa-1', card: '도로안전 정사영상 v2.1', type: '신규 과제', project: '도로안전 정사영상', training: '도로안전 정사영상 v2.1', model: 'v2.1', det: '폴리곤 (Polygon)', data: '정사영상', perms: 'LX 관리자, 남원시청 관리자', date: '2026.06.10 14:30', status: '대기', thumb: 'road' },
  { id: 'pa-2', card: '사료작물(생육기) v3.0', type: '신규 과제', project: '사료작물(생육기) 탐지', training: '사료작물(생육기) v3.0', model: 'v3.0', det: '폴리곤 (Polygon)', data: '정사영상', perms: '남원시청 관리자, 사료작물 분석', date: '2026.06.08 10:15', status: '검토중', thumb: 'forage' },
  { id: 'pa-3', card: '도로안전 카메라 v1.3', type: '신규 과제', project: '도로안전 카메라', training: '도로안전 카메라 v1.3', model: 'v1.3', det: '폴리곤 (Polygon)', data: '이미지셋', perms: '남원시청 관리자', date: '2026.05.28 09:00', status: '승인', thumb: null },
  { id: 'pa-4', card: '비닐하우스 탐지 v1.0', type: '신규 과제', project: '비닐하우스 탐지', training: '비닐하우스 v1.0', model: 'v1.0', det: '폴리곤 (Polygon)', data: '정사영상', perms: '남원시청 관리자', date: '2026.05.25 16:40', status: '반려', thumb: 'gh', reject: '학습 정확도가 기준 미달입니다. F1 0.75 이상 필요' },
  { id: 'pa-5', card: '곤포사일리지 v1.2', type: '신규 과제', project: '곤포사일리지 탐지', training: '곤포사일리지 v1.2', model: 'v1.2', det: '바운딩 박스 (Bounding Box)', data: '정사영상', perms: '사료작물 분석', date: '2026.05.20 11:20', status: '승인', thumb: 'bale' },
  { id: 'pa-6', card: '농지 활용 분석 v2.0', type: '과제 고도화', project: '농지 활용 분석', training: '농지 분류 v2.0', model: 'v2.0', det: '폴리곤 (Polygon)', data: '정사영상', perms: '남원시청 관리자, 농지 활용 분석', date: '2026.05.15 08:50', status: '대기', thumb: 'farm' },
];
const STC = { '대기': WARN, '검토중': ACC, '승인': INK, '반려': G };
const COUNTS = { '전체': 6, '대기': 2, '검토중': 1, '승인': 2, '반려': 1 };

// 실크롭 — pj-map-analysis.jpg(1384×852 · 남원 농경지 정사영상) 위 필지 폴리곤(배치 = 시연, 집계 = results.js 실측)
const FARM = { w: 1384, h: 852, src: 'pj-map-analysis.jpg' };
const FARM_POLY = [
  ['c', '515,70 640,2 700,2 768,145 598,252'], ['c', '592,264 772,152 885,310 742,412'], ['c', '750,428 890,324 985,352 830,590 800,570'],
  ['c', '992,354 1258,294 1150,520 962,750 818,602'], ['c', '367,517 558,570 546,602 392,848 332,848 230,720'], ['c', '567,592 735,674 642,850 402,850'],
  ['c', '1157,602 1382,732 1382,850 1002,850 1012,802'], ['c', '1247,472 1382,547 1382,720 1162,597'], ['c', '2,302 175,402 42,612 2,602'],
  ['n', '2,2 170,2 412,352 392,390 272,377 2,172'], ['n', '832,2 1320,2 1300,122 1180,242 1050,252 932,192'],
];
// view = 원본 이미지 안의 창 [sx, sy, sw] (sh 는 비례) → w×h 판
function farmPlate(x, y, w, h, view, o = {}) {
  const [sx, sy, sw] = view, k = w / sw, sh = h / k;
  const polys = o.clean ? '' : FARM_POLY.map(([c, p]) => `<polygon points="${p}" fill="${c === 'c' ? 'rgba(15,169,160,.13)' : 'none'}" stroke="${TEAL}" stroke-width="${(o.sw || 1.6) / k}" ${c === 'n' ? `stroke-dasharray="${6 / k} ${4 / k}"` : ''}/>`).join('');
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${INK}">
<img src="${FARM.src}" alt="" style="position:absolute;left:${(-sx * k).toFixed(1)}px;top:${(-sy * k).toFixed(1)}px;width:${(FARM.w * k).toFixed(1)}px;height:${(FARM.h * k).toFixed(1)}px;display:block;filter:saturate(.9) contrast(1.04)">
<svg width="${w}" height="${h}" viewBox="${sx} ${sy} ${sw} ${sh.toFixed(1)}" style="position:absolute;left:0;top:0;display:block">${polys}</svg>${o.over || ''}</div>\n`;
}
const HERO = { w: 420, h: 240, pts: ['118.1,51.1 293.3,47.8 295.3,76 112.9,80.6', '112.9,79.3 298.6,75.4 300.6,103.6 116.8,108.2', '115.5,106.9 305.2,103.6 307.1,134.4 118.1,138.4', '131.3,137.1 308.4,138.4 309.8,160.7 134.5,162.7'] };
function ghPlate(x, y, w, h, o = {}) {
  // pj-hero.jpg 840×480 → cover
  const k = Math.max(w / 420, h / 240), iw = 420 * k, ih = 240 * k, ox = (w - iw) / 2, oy = (h - ih) / 2;
  const polys = HERO.pts.map(p => `<polygon points="${p}" fill="rgba(15,169,160,.13)" stroke="${TEAL}" stroke-width="${1.5 / k}"/>`).join('');
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${INK}">
<img src="pj-hero.jpg" alt="" style="position:absolute;left:${ox.toFixed(1)}px;top:${oy.toFixed(1)}px;width:${iw.toFixed(1)}px;height:${ih.toFixed(1)}px;display:block;filter:saturate(.9) contrast(1.04)">
${o.clean ? '' : `<svg width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" viewBox="0 0 420 240" style="position:absolute;left:${ox.toFixed(1)}px;top:${oy.toFixed(1)}px;display:block">${polys}</svg>`}${o.over || ''}</div>\n`;
}
// 요청별 썸네일(실크롭). 이미지셋(도로안전 카메라)은 실사 없음 → 점선 결손
function thumb(r, x, y, w, h, o = {}) {
  if (r.thumb === 'farm') return farmPlate(x, y, w, h, o.view || [430, 120, 900], o);
  if (r.thumb === 'gh') return ghPlate(x, y, w, h, o);
  if (r.thumb === 'road') return img(x, y, w, h, 'b6-publish-road.jpg', o);
  if (r.thumb === 'forage') return img(x, y, w, h, 'tile-farm-clean.jpg', o);
  if (r.thumb === 'bale') return img(x, y, w, h, 'db-vw-silage.jpg', { pos: '30% 60%', ...o });
  return dash(x, y, w, h, `<div style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:14px;color:${G};line-height:1.25;text-align:center"><span>이미지셋</span>${w > 140 ? '<span>정사영상 크롭 없음</span>' : ''}</div>`);
}

// ---------- 셸 ----------
function mast(crumb, right = '') {
  return `<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:10px;white-space:nowrap;font-size:16px;letter-spacing:-.01em;color:${G}">${crumb}<div style="flex:1"></div>${right || `<span class="mic">기준일 현재</span><span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.08.26</span>`}</div>
<div style="position:absolute;left:72px;top:64px;width:1368px;height:1px;background:${H}"></div>\n`;
}
const h1 = (a, b, sub, y = 88) => `<div style="position:absolute;left:${X0}px;top:${y}px;display:flex;align-items:baseline;gap:16px;white-space:nowrap" data-line><span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">${a}</span>${b}</span>${sub ? `<span style="font-size:16px;color:${G};letter-spacing:-.01em">${sub}</span>` : ''}</div>\n`;
const foot = `<div style="position:absolute;left:72px;top:850px;width:1368px;height:1px;background:${H}"></div>
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:1264px;top:862px;width:120px;display:flex;justify-content:flex-end"><div class="chip">Family Site ▾</div></div>\n`;

// 상태 탭 = 큰 숫자 5 (원본 filter-chip 5 · ?status= 딥링크). 대기 = 조치 필요(빨강 글자)
function statusTabs(active, o = {}) {
  let s = '';
  const TW = o.tw || 104, x0 = (o.xr || XR) - TW * 5;
  ['전체', '대기', '검토중', '승인', '반려'].forEach((k, i) => {
    const on = k === active, x = x0 + i * TW, v = o.zero ? (k === o.zero ? 0 : COUNTS[k]) : COUNTS[k];
    const col = k === '대기' ? WARN : (on ? ACC : INK);
    s += div(x, 80, TW, 66, on ? `background:${T1};border-bottom:2px solid ${INK}` : `border-bottom:1px solid ${H}`);
    s += t(x + 12, 88, k, { s: 14.5, c: on ? INK : G, fw: on ? 500 : 400 });
    s += d(x + 12, 108, String(v), 30, { c: col, ls: '-.02em' }) + t(x + 12 + String(v).length * 19 + 4, 121, '건', { s: 14, c: G });
  });
  return s;
}
function shellAdmin(active, o = {}) {
  return rail('pub') + mast(o.crumb || `${svg(IC.pub, 16, G)}<span>카드 발행 관리</span>`) + h1('카드 발행', ' 관리', o.sub === undefined ? 'AI 전문가의 카드 발행 요청을 검토하고 승인/반려 처리합니다' : o.sub) + statusTabs(active, o) + hl(X0, 158, CW) + foot;
}

// ---------- 요청 큐(좌 344) ----------
const QX = 128, QW = 344, QY = 174;
function queue(selId, o = {}) {
  const list = o.list || REQ;
  let s = d(QX, QY + 2, '발행 요청 목록', 18) + n(QX + 128, QY + 3, String(list.length), { s: 17, c: ACC });
  s += ico(QX + QW - 86, QY + 5, IC.refresh, 16, G) + ico(QX + QW - 56, QY + 5, IC.search, 16, INK) + t(QX + QW - 34, QY + 2, '검색', { s: 15.5 });
  s += hl(QX, QY + 32, QW, INK);
  const RH = 100;
  list.forEach((r, i) => {
    const y = QY + 33 + i * RH, on = r.id === selId;
    if (on) s += div(QX - 8, y, QW + 16, RH - 1, `background:${T1}`) + div(QX - 8, y, 2, RH - 1, `background:${ACC}`);
    s += thumb(r, QX, y + 16, 100, 67, { sw: 1.2 });
    if (on) s += brk(QX - 3, y + 13, 106, 73, ACC, 9, 1.5);
    s += t(QX + 114, y + 13, r.card, { s: 16.5, fw: 500, w: 176, ell: 1 });
    s += t(QX + 114, y + 13, r.status, { s: 15, c: STC[r.status], fw: 500, w: 230, r: 1 });
    s += t(QX + 114, y + 39, `${r.project} · ${r.training}`, { s: 14, c: G, w: 230, ell: 1 });
    s += n(QX + 114, y + 62, r.date, { s: 14, c: G, ls: '.02em' }) + t(QX + 114, y + 61, `요청자 —`, { s: 14, c: G, w: 230, r: 1 });
    s += hl(QX, y + RH - 1, QW);
  });
  return s;
}

// ---------- 상세 공통(우 880) ----------
const DX = 504, DW = 880, EX = 504, EW = 520, RX = 1056, RW = 328, CY = 270;
const TABS = [['개요', ''], ['구성원', 2], ['라벨링', 1], ['학습 결과', ''], ['분석 결과', 2]];
function detailHead(r, tab, o = {}) {
  let s = vl(488, 159, 691);
  s += `<div style="position:absolute;left:${DX}px;top:${QY - 2}px;display:flex;align-items:baseline;gap:14px;white-space:nowrap"><span class="d" style="font-size:26px;line-height:34px">${r.project}</span><span style="font-size:16px;font-weight:500;color:${STC[r.status]}">${r.status}</span><span style="font-size:15px;color:${G};letter-spacing:-.01em">${r.type} · ${r.training}</span></div>
`;
  s += t(XR - 200, QY + 8, '요청', { s: 14, c: G, w: 40 }) + n(XR - 164, QY + 8, r.date, { s: 15, c: G, ls: '.02em' }) + ico(XR - 18, QY + 8, IC.close, 16, G);
  const counts = o.counts || TABS.map(v => v[1]);
  s += `<div style="position:absolute;left:${DX}px;top:${QY + 44}px;height:38px;display:flex;gap:30px;white-space:nowrap">` + TABS.map(([k], i) => { const on = k === tab, c = counts[i]; return `<div style="height:38px;display:flex;align-items:baseline;gap:5px;padding-top:6px;font-size:16.5px;letter-spacing:-.01em;color:${on ? INK : G};font-weight:${on ? 500 : 400};border-bottom:2px solid ${on ? INK : 'transparent'}">${k}${c !== '' ? `<span class="n" style="font-size:14px;color:${on ? ACC : C}">${c}</span>` : ''}</div>`; }).join('') + `</div>
`;
  s += hl(DX, QY + 81, DW);
  return s;
}
const kvRows = (x, y, w, rows, o = {}) => {
  const rh = o.rh || 30, lw = o.lw || 100; let s = '';
  rows.forEach(([k, v, vo], i) => {
    const yy = y + i * rh;
    s += t(x, yy + (rh - 20) / 2, k, { s: 14.5, c: G }) + t(x + lw, yy + (rh - 21) / 2, v, { s: 15.5, w: w - lw, ell: 1, ...(vo || {}) }) + hl(x, yy + rh - 1, w);
  });
  return s;
};
const secH = (x, y, w, title, right = '', ink = true) => d(x, y, title, 18) + (right ? t(x, y + 2, right, { s: 14, c: G, w, r: 1 }) : '') + hl(x, y + 30, w, ink ? INK : H);
const classChips = (x, y, names) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;gap:8px;white-space:nowrap">` + names.map((nm, i) => `<div style="height:28px;border:1px solid ${H};display:flex;align-items:center;gap:8px;padding:0 10px;font-size:15px;letter-spacing:-.01em"><span style="width:10px;height:10px;flex:none;${i === 0 ? `background:${TEAL}` : `border:1.5px dashed ${TEAL}`}"></span>${nm}</div>`).join('') + `</div>\n`;

const P6 = REQ[5], P4 = REQ[3];
const INTRO6 = '고해상도 드론 영상을 기반으로 농지 이용 현황(경작, 비경작)을 자동으로 검출해주는 AI 분석 서비스';
const PURP6 = '드론영상을 기반으로 농지 이용 현황(경작·비경작)을 자동 검출하여 농지이용 실태조사 및 취득자격 심사 업무를 간소화하고 농지 행정 효율화에 기여';
const INTRO4 = '고해상도 드론 영상을 기반으로 비닐하우스(단동/다동)를 자동으로 검출하고, 수량을 산출해주는 AI 분석 서비스';
const PURP4 = '드론영상을 기반으로 비닐하우스(단동/다동)를 자동 검출하여 영농 시설 현황을 정확히 파악하고, 보조금 관리·실태조사 등 데이터 기반 스마트 영농 행정 구현에 기여';

const infoRows = (r) => [
  ['상태', r.status, { c: STC[r.status], fw: 500 }], ['과제 유형', r.type], ['과제명', r.card], ['분석 과제', r.project], ['학습 결과', r.training], ['모델명', r.model, { cls: 'n' }],
  ['탐지 형태', r.det], ['데이터 유형', r.data], ['권한', r.perms], ['요청자', `— ${tag()}`, { c: G }], ['요청일', r.date, { cls: 'n', ls: '.02em' }],
];
// 처리 단계 레일(대기 → 검토중 → 승인 / 반려) — 원본 '발행 처리' 라디오 4 의 현재값을 읽기 전용으로
function stageRail(x, y, w, cur) {
  const ks = ['대기', '검토중', '승인', '반려'], sw = (w - 3 * 6) / 4; let s = '';
  ks.forEach((k, i) => {
    const on = k === cur, xx = x + i * (sw + 6);
    s += div(xx, y, sw, 3, on ? `background:${k === '검토중' ? ACC : INK}` : `background:${H}`);
    s += t(xx, y + 9, k, { s: 14.5, c: on ? STC[k] : G, fw: on ? 500 : 400 });
  });
  return s;
}
// 증거 열(좌 520) — 카드 썸네일(실크롭 + 결과 폴리곤) · 대시보드 썸네일 · 소개 · 개발 목적
function evidence(r, o = {}) {
  const farm = r.thumb === 'farm';
  let s = '';
  const over = capbar(EW, 347, '카드 썸네일', farm ? '결과 폴리곤 · 경작지 ━ 비경작지 ┅' : '결과 폴리곤 · 비닐하우스');
  s += farm ? farmPlate(EX, CY, EW, 347, [330, 40, 1054], { over, sw: 2 }) : ghPlate(EX, CY, EW, 347, { over });
  s += brk(EX, CY, EW, 347, '#FFFFFF', 14, 1.5);
  const y2 = CY + 347 + 16;
  s += farm ? farmPlate(EX, y2, 130, 113, [560, 250, 520], { sw: 1.4 }) : ghPlate(EX, y2, 130, 113);
  s += lab(EX, y2 + 120, '대시보드 썸네일');
  const tx = EX + 154, tw = EW - 154;
  s += lab(tx, y2, '소개') + t(tx, y2 + 19, o.intro, { s: 15, lh: '22px', w: tw, wrap: 1 });
  s += lab(tx, y2 + 19 + 66 + 8, '개발 목적') + t(tx, y2 + 19 + 66 + 8 + 19, o.purpose, { s: 15, lh: '22px', w: tw, wrap: 1, x: 'height:66px;overflow:hidden;' });
  return s;
}
function overviewRight(r, classes) {
  let s = secH(RX, CY - 2, RW, '발행 정보', '');
  s += kvRows(RX, CY + 29, RW, infoRows(r));
  const y = CY + 29 + 11 * 30 + 14;
  s += lab(RX, y, '클래스') + classChips(RX, y + 22, classes);
  return s;
}
function decision(r, o = {}) {
  let s = lab(RX, 716, '처리 단계') + stageRail(RX, 738, RW, r.status);
  s += btn2(RX, 790, 96, 44, '수정') + cta(RX + 108, 790, RW - 108, 44, '발행 처리');
  return s;
}

// ======================================================================
// 선택 3(권장) = 분할 검토 데스크 : 큐 344 | 증거 520 | 결정 328
// ======================================================================
function boardOverview(r, o = {}) {
  let s = shellAdmin(o.tab || '전체', { crumb: o.crumb });
  s += queue(r.id) + detailHead(r, '개요', o);
  if (r.reject) {
    // 반려 건 — 원본: 개요 맨 위 '반려 사유' 카드
    s += div(EX, CY, EW, 64, `border:1px solid ${H};border-left:2px solid ${INK}`) + lab(EX + 16, CY + 10, '반려 사유') + t(EX + 16, CY + 32, r.reject, { s: 16 });
    const yy = CY + 80;
    s += ghPlate(EX, yy, EW, 267, { over: capbar(EW, 267, '카드 썸네일', '결과 폴리곤 · 비닐하우스') }) + brk(EX, yy, EW, 267, '#FFFFFF', 14, 1.5);
    const y2 = yy + 267 + 16;
    s += ghPlate(EX, y2, 130, 113) + lab(EX, y2 + 120, '대시보드 썸네일');
    const tx = EX + 154, tw = EW - 154;
    s += lab(tx, y2, '소개') + t(tx, y2 + 19, INTRO4, { s: 15, lh: '22px', w: tw, wrap: 1 });
    s += lab(tx, y2 + 93, '개발 목적') + t(tx, y2 + 112, PURP4, { s: 15, lh: '22px', w: tw, wrap: 1, x: 'height:66px;overflow:hidden;' });
    s += overviewRight(r, ['비닐하우스(단동)', '비닐하우스(다동)']).replace(/비닐하우스\(단동\)<\/div>/, '비닐하우스(단동)</div>');
  } else {
    s += evidence(r, { intro: INTRO6, purpose: PURP6 }) + overviewRight(r, ['경작지', '비경작지']);
  }
  s += decision(r);
  return s;
}

// ---------- 선택 1 = 원장(표) + 우 드로어 ----------
function opt1() {
  const r = P6;
  let s = shellAdmin('전체', { sub: '', xr: 904, tw: 96 });
  const TWd = 776;
  s += d(X0, QY + 2, '발행 요청 목록', 18) + n(X0 + 128, QY + 3, '6', { s: 17, c: ACC }) + ico(X0 + TWd - 86, QY + 5, IC.refresh, 16, G) + ico(X0 + TWd - 56, QY + 5, IC.search, 16, INK) + t(X0 + TWd - 34, QY + 2, '검색', { s: 15.5 });
  const hy = QY + 34;
  s += div(X0, hy, TWd, 34, `background:${T1}`);
  const cols = [[12, '상태'], [72, '과제명'], [364, '학습 결과'], [536, '데이터 유형'], [626, '요청 일시']];
  cols.forEach(([x, k]) => { s += t(X0 + x, hy + 8, k, { s: 14, c: G, ls: '.02em' }); });
  s += hl(X0, hy + 34, TWd, INK);
  const RH1 = 78;
  REQ.forEach((q, i) => {
    const y = hy + 35 + i * RH1, on = q.id === r.id;
    if (on) s += div(X0, y, TWd, RH1 - 1, `background:${T1}`) + div(X0, y, 2, RH1 - 1, `background:${ACC}`);
    s += t(X0 + 12, y + 28, q.status, { s: 15.5, c: STC[q.status], fw: 500 });
    s += thumb(q, X0 + 72, y + 9, 90, 60, { sw: 1 });
    s += t(X0 + 174, y + 16, q.card, { s: 16.5, fw: 500 }) + t(X0 + 174, y + 41, `${q.type} · ${q.det}`, { s: 14, c: G, w: 180, ell: 1 });
    s += t(X0 + 364, y + 28, q.training, { s: 15.5, w: 160, ell: 1 }) + t(X0 + 536, y + 28, q.data, { s: 15.5 }) + n(X0 + 626, y + 29, q.date, { s: 14.5, c: G, ls: '.02em' });
    s += hl(X0, y + RH1 - 1, TWd);
  });
  const by = hy + 35 + 6 * 78 + 16;
  // 표 아래 — 같은 6건의 상태 분포(그래픽 1) : 탭 숫자와 중복되지 않게 막대만
  s += lab(X0, by, '상태 분포 · 6건');
  let bx = X0; const bw = TWd / 6;
  [['대기', 2], ['검토중', 1], ['승인', 2], ['반려', 1]].forEach(([k, v]) => {
    s += div(bx, by + 24, bw * v - 4, 14, k === '대기' ? `border:1.5px solid ${INK}` : k === '검토중' ? `background:${ACC}` : k === '승인' ? `background:${INK}` : `background:${C}`);
    s += t(bx, by + 46, k, { s: 14.5, c: STC[k] }); bx += bw * v;
  });
  // 우 드로어 480
  const X = 960, IX = 984, IW = 400;
  s += div(X, 65, 480, 835, 'background:#FFFFFF;z-index:3') + `<div style="position:absolute;left:${X}px;top:65px;width:1px;height:835px;background:${INK};z-index:4"></div>`;
  let dr = d(IX, 84, r.project, 24) + t(IX + 178, 90, r.status, { s: 16, c: WARN, fw: 500 }) + ico(IX + IW - 18, 90, IC.close, 16, G);
  dr += `<div style="position:absolute;left:${IX}px;top:116px;height:36px;display:flex;gap:22px;white-space:nowrap">` + TABS.map(([k, c], i) => `<div style="height:36px;display:flex;align-items:baseline;gap:4px;padding-top:6px;font-size:15.5px;letter-spacing:-.01em;color:${i ? G : INK};font-weight:${i ? 400 : 500};border-bottom:2px solid ${i ? 'transparent' : INK}">${k}${c !== '' ? `<span class="n" style="font-size:14px;color:${C}">${c}</span>` : ''}</div>`).join('') + `</div>\n`;
  dr += hl(IX, 151, IW);
  dr += farmPlate(IX, 166, IW, 226, [330, 60, 1054], { over: capbar(IW, 226, '카드 썸네일', '경작지 ━ 비경작지 ┅'), sw: 2 }) + brk(IX, 166, IW, 226, '#FFFFFF', 12, 1.5);
  dr += kvRows(IX, 402, IW, infoRows(r).slice(1), { rh: 29 });
  dr += lab(IX, 704, '클래스') + classChips(IX + 60, 698, ['경작지', '비경작지']);
  dr += lab(IX, 744, '처리 단계') + stageRail(IX + 84, 748, IW - 84, r.status);
  dr += btn2(IX, 796, 96, 44, '수정') + cta(IX + 108, 796, IW - 108, 44, '발행 처리');
  s += `<div style="position:absolute;left:0;top:0;width:${W}px;height:${HT}px;z-index:5;pointer-events:none">${dr}</div>`;
  return s;
}

// ---------- 선택 2 = 상태 열 보드(이미지 카드) ----------
function opt2() {
  let s = shellAdmin('전체');
  const colW = 296, gap = 24;
  ['대기', '검토중', '승인', '반려'].forEach((k, ci) => {
    const x = X0 + ci * (colW + gap), list = REQ.filter(r => r.status === k);
    s += d(x, QY + 2, k, 18, { c: STC[k] === G ? INK : STC[k] }) + n(x + k.length * 18 + 8, QY + 3, String(list.length), { s: 17, c: G });
    s += hl(x, QY + 32, colW, INK);
    list.forEach((r, i) => {
      const y = QY + 46 + i * 252, on = r.id === 'pa-6';
      if (on) s += div(x - 8, y - 8, colW + 16, 244, `background:${T1}`);
      s += thumb(r, x, y, colW, 150, { view: [430, 120, 900], sw: 1.6 });
      if (on) s += brk(x - 3, y - 3, colW + 6, 156, ACC, 12, 1.5);
      s += t(x, y + 160, r.card, { s: 17, fw: 500, w: colW, ell: 1 });
      s += t(x, y + 185, `${r.type} · ${r.data}`, { s: 14.5, c: G });
      s += n(x, y + 207, r.date, { s: 14, c: G, ls: '.02em' });
      if (k === '대기' || k === '검토중') s += t(x, y + 206, k === '대기' ? '검토 ›' : '이어서 검토 ›', { s: 15.5, c: k === '대기' ? WARN : ACC, fw: 500, w: colW, r: 1 });
      if (r.reject) s += t(x, y + 206, '반려 사유 1', { s: 14.5, c: G, w: colW, r: 1 });
    });
    if (list.length < 2) s += dash(x, QY + 46 + list.length * 252, colW, 150, `<div style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:14.5px;color:${G}">${k} ${list.length}건 · 끝</div>`);
  });
  // 선택 요약 띠
  const y = 728; const r = P6;
  s += hl(X0, y - 14, CW, INK);
  s += d(X0, y, r.project, 22) + t(X0 + 158, y + 5, '대기', { s: 16, c: WARN, fw: 500 }) + t(X0 + 200, y + 6, `${r.type} · ${r.training}`, { s: 15, c: G });
  const kv = [['탐지 형태', r.det], ['데이터 유형', r.data], ['권한', r.perms], ['요청일', r.date]];
  let kx = X0;
  kv.forEach(([k, v], i) => { const w = [190, 130, 300, 170][i]; s += lab(kx, y + 46, k) + t(kx, y + 66, v, { s: 15.5, cls: i === 3 ? 'n' : '' }); kx += w; });
  s += stageRail(936, y + 8, 220, '대기');
  s += btn2(1180, y + 46, 84, 44, '세부 ›') + cta(1276, y + 46, 108, 44, '발행 처리');
  return s;
}

// ---------- 목록(선택 없음) = 이미지 카드 3×2 + 검색 패널 열림 ----------
function boardList() {
  let s = shellAdmin('전체');
  s += d(X0, QY + 2, '발행 요청 목록', 18) + n(X0 + 128, QY + 3, '6', { s: 17, c: ACC });
  s += ico(XR - 126, QY + 5, IC.refresh, 16, G) + ico(XR - 94, QY + 5, IC.close, 16, INK) + t(XR - 72, QY + 2, '검색 닫기', { s: 15.5 });
  s += hl(X0, QY + 32, CW, INK);
  // 검색 패널(원본: 요청자 · 요청 일시 · 초기화 · 검색)
  const sy = QY + 33;
  s += div(X0, sy, CW, 60, `background:${T1}`);
  s += t(X0 + 16, sy + 20, '요청자', { s: 14.5, c: G }) + fld(X0 + 70, sy + 12, 220, 36, ph('요청자명'), { bg: '#FFFFFF' });
  s += t(X0 + 322, sy + 20, '요청 일시', { s: 14.5, c: G }) + fld(X0 + 392, sy + 12, 160, 36, `<span class="n" style="color:${C}">연도-월-일</span>`, { bg: '#FFFFFF' }) + t(X0 + 560, sy + 19, '~', { s: 15, c: G }) + fld(X0 + 580, sy + 12, 160, 36, `<span class="n" style="color:${C}">연도-월-일</span>`, { bg: '#FFFFFF' });
  s += t(XR - 170, sy + 19, '초기화', { s: 16, c: INK }) + cta(XR - 104, sy + 12, 88, 36, '검색');
  const cw = 402, gx = 25, y0 = sy + 78;
  REQ.forEach((r, i) => {
    const x = X0 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * 270;
    s += thumb(r, x, y, cw, 176, { view: [330, 110, 1054], sw: 1.8 });
    s += div(x, y + 176, cw, 78, `border:1px solid ${H};border-top:0`);
    s += t(x + 14, y + 186, r.card, { s: 17, fw: 500 }) + t(x + 14, y + 186, r.status, { s: 15.5, c: STC[r.status], fw: 500, w: cw - 28, r: 1 });
    s += t(x + 14, y + 212, `${r.project} · ${r.training}`, { s: 14.5, c: G, w: 250, ell: 1 });
    s += n(x + 14, y + 233, r.date, { s: 14, c: G, ls: '.02em' }) + t(x + 156, y + 232, '· 요청자 —', { s: 14, c: G });
    if (r.status === '대기') s += t(x + 14, y + 222, '검토 ›', { s: 16, c: WARN, fw: 500, w: cw - 28, r: 1 });
    else if (r.status === '검토중') s += t(x + 14, y + 222, '이어서 검토 ›', { s: 16, c: ACC, fw: 500, w: cw - 28, r: 1 });
    else s += t(x + 14, y + 222, '열람 ›', { s: 16, c: INK, w: cw - 28, r: 1 });
  });
  return s;
}
// ---------- 목록 · ?status=대기 (대시보드 KPI 진입) = EVIDENCE-PAIR ----------
function boardPending() {
  let s = shellAdmin('대기', { crumb: `${svg(IC.dash, 16, G)}<span>대시보드</span><span style="color:${C}">›</span><span style="color:${INK}">카드 발행 승인 대기</span><span class="n" style="font-size:14.5px;color:${C};letter-spacing:.02em">?status=대기</span>` });
  s += d(X0, QY + 2, '발행 요청 목록', 18) + n(X0 + 128, QY + 3, '2', { s: 17, c: WARN }) + t(X0 + 150, QY + 4, '대기 · 검토가 필요한 요청', { s: 14.5, c: G });
  s += ico(XR - 86, QY + 5, IC.refresh, 16, G) + ico(XR - 56, QY + 5, IC.search, 16, INK) + t(XR - 34, QY + 2, '검색', { s: 15.5 });
  s += hl(X0, QY + 32, CW, INK);
  const pw = 616, y = QY + 50;
  [REQ[0], REQ[5]].forEach((r, i) => {
    const x = X0 + i * (pw + 24);
    const over = capbar(pw, 330, r.thumb === 'farm' ? '결과 폴리곤 · 경작지 ━ 비경작지 ┅' : '요청 지역 정사영상 · 결과 폴리곤 없음', r.thumb === 'farm' ? '남원 농지 · 실측 2,098 필지' : '남원 도로 구간');
    s += thumb(r, x, y, pw, 330, { view: [330, 60, 1054], over, sw: 2 });
    s += div(x, y + 330, pw, 40, `background:${T1}`) + n(x + 14, y + 340, `0${i + 1}`, { s: 14.5, c: G }) + t(x + 44, y + 338, r.card, { s: 17.5, cls: 'd' }) + t(x + 14, y + 339, '승인 대기', { s: 15.5, c: WARN, fw: 500, w: pw - 28, r: 1 });
    s += div(x, y + 370, pw, 206, `border:1px solid ${H};border-top:0`);
    s += kvRows(x + 14, y + 376, 360, [['요청 일시', `${r.date} ${tag()}`, { cls: 'n', ls: '.02em' }], ['과제 유형', r.type], ['학습 결과', r.training], ['탐지 형태', r.det], ['권한', r.perms]], { rh: 32, lw: 92 });
    s += lab(x + 400, y + 386, '처리 단계') + stageRail(x + 400, y + 410, 200, '대기');
    s += t(x + 400, y + 470, '요청자 —', { s: 14.5, c: G });
    s += div(x + 400, y + 514, 200, 44, `display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:500;color:${WARN}`, '검토 ›') + brk(x + 400, y + 514, 200, 44, INK, 10, 1);
  });
  return s;
}
function boardListEmpty() {
  let s = shellAdmin('반려', { zero: '—' });
  s += d(X0, QY + 2, '발행 요청 목록', 18) + n(X0 + 128, QY + 3, '0', { s: 17, c: G }) + t(X0 + 148, QY + 4, '검색 결과', { s: 14.5, c: G });
  s += ico(XR - 126, QY + 5, IC.refresh, 16, G) + ico(XR - 94, QY + 5, IC.close, 16, INK) + t(XR - 72, QY + 2, '검색 닫기', { s: 15.5 });
  s += hl(X0, QY + 32, CW, INK);
  const sy = QY + 33;
  s += div(X0, sy, CW, 60, `background:${T1}`);
  s += t(X0 + 16, sy + 20, '요청자', { s: 14.5, c: G }) + fld(X0 + 70, sy + 12, 220, 36, '도로관리과', { bg: '#FFFFFF', bc: ACC });
  s += t(X0 + 322, sy + 20, '요청 일시', { s: 14.5, c: G }) + fld(X0 + 392, sy + 12, 160, 36, `<span class="n">2026-06-01</span>`, { bg: '#FFFFFF' }) + t(X0 + 560, sy + 19, '~', { s: 15, c: G }) + fld(X0 + 580, sy + 12, 160, 36, `<span class="n">2026-06-30</span>`, { bg: '#FFFFFF' });
  s += t(XR - 170, sy + 19, '초기화', { s: 16, c: INK }) + cta(XR - 104, sy + 12, 88, 36, '검색');
  const cw = 402, gx = 25, y0 = sy + 78;
  for (let i = 0; i < 6; i++) { const x = X0 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * 270; if (i !== 1) s += dash(x, y, cw, 254); }
  s += `<div style="position:absolute;left:${X0 + cw + gx}px;top:${y0}px;width:${cw}px;height:254px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center">${svg(IC.layers, 34, C)}<div class="d" style="font-size:24px">요청이 없습니다</div><div style="font-size:15px;line-height:22px;color:${G}">반려 · 요청자 “도로관리과”<br>2026-06-01 ~ 2026-06-30</div><div style="font-size:16px;color:${INK};border-bottom:1px solid ${INK};margin-top:4px">초기화 ›</div></div>`;
  return s;
}

// ---------- 개요 수정(발행 정보 수정) ----------
function boardEdit() {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + vl(488, 159, 691);
  s += d(DX, QY, '발행 정보 수정', 26) + t(DX + 190, QY + 9, `${r.project} · ${r.status}`, { s: 15, c: G });
  s += hl(DX, QY + 44, DW, INK);
  const y0 = QY + 62;
  // 좌: 썸네일 2 + 소개 + 개발 목적
  s += flab(EX, y0, '카드 썸네일 이미지', { req: 1 }) + farmPlate(EX, y0 + 22, 312, 208, [330, 40, 1054], { sw: 1.8 }) + t(EX, y0 + 240, '이미지 선택 ›', { s: 15.5, fw: 500, x: `border-bottom:1px solid ${INK};` }) + n(EX + 110, y0 + 242, 'JPG, PNG · 권장 크기 480x320', { s: 14, c: G });
  s += flab(EX + 336, y0, '대시보드 썸네일 이미지', { req: 1 }) + farmPlate(EX + 336, y0 + 22, 184, 160, [560, 250, 520], { sw: 1.4 }) + t(EX + 336, y0 + 192, '이미지 선택 ›', { s: 15.5, fw: 500, x: `border-bottom:1px solid ${INK};` }) + n(EX + 336, y0 + 222, 'JPG, PNG · 권장 300x260', { s: 14, c: G });
  const y1 = y0 + 284;
  s += flab(EX, y1, '소개', { count: '53자/500자', w: EW }) + div(EX, y1 + 22, EW, 100, `border:1px solid ${H};padding:10px 12px;font-size:15.5px;line-height:22px;letter-spacing:-.01em`, INTRO6);
  s += flab(EX, y1 + 140, '개발 목적', { count: '80자/500자', w: EW }) + div(EX, y1 + 162, EW, 104, `border:1px solid ${ACC};padding:10px 12px;font-size:15.5px;line-height:22px;letter-spacing:-.01em;overflow:hidden`, PURP6 + `<span style="display:inline-block;width:1px;height:17px;background:${INK};vertical-align:-3px;margin-left:1px"></span>`);
  // 우: 입력 2 + 자동 4 + 클래스
  let y = y0;
  s += flab(RX, y, '과제명', { req: 1 }) + fld(RX, y + 22, RW, 40, r.card); y += 78;
  s += flab(RX, y, '모델명', { req: 1 }) + fld(RX, y + 22, RW, 40, `<span class="n">${r.model}</span>`); y += 78;
  [['분석 과제', r.project], ['학습 결과', r.training], ['탐지 형태', r.det], ['데이터 유형', r.data]].forEach(([k, v]) => { s += flab(RX, y, k, { auto: 1 }) + auto(RX, y + 22, RW, 36, v); y += 74; });
  s += flab(RX, y, '클래스', { auto: 1 }) + classChips(RX, y + 24, ['경작지', '비경작지']);
  s += t(RX + 60, 802, '취소', { s: 16, c: G }) + cta(RX + 108, 790, RW - 108, 44, '저장');
  return s;
}

// ---------- 구성원 ----------
function boardMembers() {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + detailHead(r, '구성원');
  const M = [['관리자', 1240, '2026.05.19 16:20'], ['라벨러', 900, '2026.03.30 14:50']];
  s += secH(EX, CY - 2, EW, '구성원', '읽기 전용 · 초대/내보내기 없음');
  M.forEach(([role, labels, last], i) => {
    const y = CY + 30 + i * 92;
    s += div(EX, y + 16, 56, 56, `border:1px solid ${H};display:flex;align-items:center;justify-content:center`, svg(IC.my, 24, G));
    s += t(EX + 72, y + 16, `구성원 0${i + 1}`, { s: 17, fw: 500 }) + `<div style="position:absolute;left:${EX + 156}px;top:${y + 17}px" class="chip">${role}</div>` + t(EX + 72, y + 46, `이름 — ${tag()}`, { s: 14.5, c: G });
    s += lab(EX + 270, y + 14, '라벨') + d(EX + 270, y + 34, labels.toLocaleString('en-US'), 30, { c: ACC });
    s += lab(EX + 380, y + 14, '마지막 작업') + n(EX + 380, y + 42, last, { s: 14.5, c: G, ls: '.02em' });
    s += hl(EX, y + 91, EW);
  });
  const by = CY + 30 + 2 * 92 + 18;
  s += lab(EX, by, '라벨 기여 · 합계 2,140') + div(EX, by + 24, EW * 1240 / 2140 - 3, 14, `background:${ACC}`) + div(EX + EW * 1240 / 2140, by + 24, EW * 900 / 2140, 14, `background:${T2}`);
  s += t(EX, by + 46, '관리자 58 %', { s: 14.5, c: ACC }) + t(EX + EW * 1240 / 2140, by + 46, '라벨러 42 %', { s: 14.5, c: G });
  // 증거는 남긴다 — 이 요청의 카드 썸네일
  const ey = by + 84;
  s += farmPlate(EX, ey, EW, 834 - ey, [330, 190, 1054], { over: capbar(EW, 834 - ey, '이 요청의 카드 썸네일', '경작지 ━ 비경작지 ┅'), sw: 2 });
  s += overviewRight(r, ['경작지', '비경작지']) + lab(RX, 716, '처리 단계') + stageRail(RX, 738, RW, r.status) + cta(RX, 790, RW, 44, '발행 처리');
  return s;
}

// ---------- 라벨링(라벨링 모드) · 클래스 일괄 변경 모달 ----------
function boardLabeling(modal) {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + detailHead(r, '라벨링');
  const CX = 504, CWd = 612, SX = 1132, SW = 252, y0 = CY - 6;
  // 도구줄
  const tools = [['rect', '사각형'], ['circle', '원형'], ['polygon', '폴리곤', 1], ['copy', '도형 복사', 0, 1]];
  let tx = CX;
  tools.forEach(([ic, k, on, dis]) => { const w = k.length * 15 + 36; s += div(tx, y0, w, 36, `${on ? `background:${T2};` : ''}border:1px solid ${on ? ACC : H};display:flex;align-items:center;gap:5px;padding:0 8px;font-size:15px;color:${dis ? C : (on ? ACC : INK)};white-space:nowrap`, svg(IC[ic], 16, dis ? C : (on ? ACC : INK)) + k); tx += w + 6; });
  s += vl(tx + 4, y0 + 6, 24); tx += 16;
  s += div(tx, y0, 96, 36, `display:flex;align-items:center;gap:6px;font-size:15px;color:${C};white-space:nowrap`, svg(IC.undo, 16, C) + '실행 취소'); tx += 94;
  s += cta(tx, y0, 62, 36, '저장'); tx += 72;
  s += div(tx, y0, 60, 36, `display:flex;align-items:center;gap:6px;font-size:15px;white-space:nowrap`, svg(IC.close, 14, INK) + '닫기');
  // 캔버스
  const cy = y0 + 46, ch = 834 - cy;
  const labels = FARM_POLY.slice(0, 9).map(([c, p], i) => {
    const sel = [1, 2, 3].includes(i);
    return `<polygon points="${p}" fill="${sel ? 'rgba(0,109,247,.22)' : 'rgba(15,169,160,.16)'}" stroke="${sel ? ACC : TEAL}" stroke-width="${sel ? 3.4 : 2.4}"/>`;
  }).join('');
  const k = Math.max(CWd / 1100, ch / 852), vw = CWd / k;
  s += `<div style="position:absolute;left:${CX}px;top:${cy}px;width:${CWd}px;height:${ch}px;overflow:hidden;background:${INK}"><img src="pj-map-analysis.jpg" alt="" style="position:absolute;left:${(-300 * k).toFixed(1)}px;top:0;width:${(1384 * k).toFixed(1)}px;height:${(852 * k).toFixed(1)}px;display:block;filter:saturate(.9) contrast(1.04)">
<svg width="${CWd}" height="${ch}" viewBox="300 0 ${vw.toFixed(1)} ${(ch / k).toFixed(1)}" style="position:absolute;left:0;top:0">${labels}</svg>
<div style="position:absolute;left:10px;bottom:10px;height:32px;background:#FFFFFF;display:flex;align-items:center;gap:10px;padding:0 10px;font-size:14.5px;white-space:nowrap">${svg(IC.minus, 14, INK)}<span class="n">100 %</span>${svg(IC.plus, 14, INK)}<span style="width:1px;height:16px;background:${H}"></span>${svg(IC.refresh, 14, INK)}<span class="n" style="color:${G}">GSD 12 cm/px</span></div>
<div style="position:absolute;right:10px;bottom:10px;height:32px;background:rgba(1,1,2,.62);color:#FFFFFF;display:flex;align-items:center;padding:0 10px;font-size:14px;white-space:nowrap">우클릭 드래그로 화면 이동</div>
<div style="position:absolute;left:10px;top:10px;height:28px;background:rgba(1,1,2,.62);color:#FFFFFF;display:flex;align-items:center;padding:0 10px;font-size:14px;white-space:nowrap">금지면 정사영상 · NW_ortho_202603_farm_01.tif</div></div>\n`;
  // 사이드 패널: 라벨링 데이터 1 + 클래스/라벨 탭
  s += div(SX - 8, y0, SW + 16, 64, `background:${T1}`) + div(SX - 8, y0, 2, 64, `background:${ACC}`);
  s += t(SX + 4, y0 + 9, '금지면 정사영상', { s: 16, fw: 500 }) + t(SX + 4, y0 + 10, '라벨링됨', { s: 14.5, c: ACC, w: SW - 8, r: 1 });
  s += t(SX + 4, y0 + 35, '라벨', { s: 14, c: G }) + n(SX + 34, y0 + 35, '310', { s: 14.5 }) + n(SX + 4, y0 + 35, '2026.03.30 15:05', { s: 14, c: G, w: SW - 8, r: 1, ls: '.02em' });
  const ty = y0 + 80;
  s += t(SX, ty, '클래스', { s: 16, c: G }) + n(SX + 50, ty + 2, '2', { s: 14, c: C }) + t(SX + 84, ty, '라벨', { s: 16, fw: 500 }) + n(SX + 118, ty + 2, '310', { s: 14, c: ACC }) + div(SX + 84, ty + 28, 62, 2, `background:${INK}`) + hl(SX, ty + 29, SW);
  const rows = [['경작지 #1', 0], ['경작지 #2', 1], ['경작지 #3', 1], ['경작지 #4', 1], ['경작지 #5', 0], ['경작지 #6', 0], ['비경작지 #7', 0], ['경작지 #8', 0], ['경작지 #9', 0]];
  rows.forEach(([nm, on], i) => {
    const y = ty + 36 + i * 34;
    if (on) s += div(SX - 8, y, SW + 16, 33, `background:${T1}`);
    s += chk(SX, y + 9, on) + div(SX + 28, y + 12, 10, 10, nm.startsWith('비') ? `border:1.5px dashed ${TEAL}` : `background:${TEAL}`) + t(SX + 48, y + 6, nm, { s: 15.5 }) + t(SX, y + 7, '폴리곤', { s: 14, c: G, w: SW - 22, r: 1 }) + ico(SX + SW - 14, y + 10, IC.close, 12, C) + hl(SX, y + 33, SW);
  });
  s += n(SX, ty + 36 + 9 * 34 + 8, '… 310 행 · 스크롤', { s: 14, c: C });
  // 일괄 변경 막대(원본 train-batch-bar)
  s += hl(SX, 780, SW, INK) + chk(SX, 800, false) + t(SX + 24, 797, '전체 선택', { s: 15 }) + (modal ? btn2(SX + 100, 790, SW - 100, 44, '일괄 변경 (3건)', G) : cta(SX + 100, 790, SW - 100, 44, '클래스 일괄 변경 (3건)').replace('font-size:16px', 'font-size:14.5px'));
  if (modal) {
    s += div(72, 0, 1368, HT, 'background:rgba(1,1,2,.38);z-index:20');
    const mx = 520, my = 270, mw = 400, mh = 330;
    let m = div(mx, my, mw, mh, `background:#FFFFFF;border:1px solid ${INK}`) + d(mx + 24, my + 22, '클래스 일괄 변경', 22) + ico(mx + mw - 40, my + 26, IC.close, 16, G) + hl(mx + 24, my + 64, mw - 48, INK);
    m += t(mx + 24, my + 78, '선택한 라벨 3건의 클래스를 바꿉니다', { s: 15, c: G });
    [['경작지', 0], ['비경작지', 1]].forEach(([nm, on], i) => {
      const y = my + 112 + i * 52;
      m += div(mx + 24, y, mw - 48, 44, `border:1px solid ${on ? ACC : H};${on ? `background:${T1}` : ''}`) + radio(mx + 38, y + 14, on) + div(mx + 68, y + 17, 10, 10, i ? `border:1.5px dashed ${TEAL}` : `background:${TEAL}`) + t(mx + 90, y + 11, nm, { s: 16.5, fw: on ? 500 : 400 });
    });
    m += t(mx + 24, my + 222, '저장하면 라벨 #2 · #3 · #4 가 비경작지로 바뀝니다', { s: 14, c: G });
    m += hl(mx + 24, my + 256, mw - 48) + t(mx + mw - 190, my + 283, '취소', { s: 16, c: G }) + cta(mx + mw - 134, my + 270, 110, 44, '저장');
    s += `<div style="position:absolute;left:0;top:0;width:${W}px;height:${HT}px;z-index:21">${m}</div>`;
  }
  return s;
}

// ---------- 학습 결과 ----------
function boardTrain() {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + detailHead(r, '학습 결과');
  // 큰 숫자 4 (원본 '학습 결과' KPI: IOU · F1 · Recall · Precision)
  const K = [['영역 일치도 (IOU)', '0.83', ACC], ['종합 정확도 (F1)', '0.88', INK], ['검출율 (Recall)', '0.86', INK], ['정밀도 (Precision)', '0.89', INK]];
  K.forEach(([k, v, col], i) => { const x = EX + i * 130; s += lab(x, CY, k, { ls: '0' }) + d(x, CY + 22, v, i === 0 ? 50 : 40, { c: col, ls: '-.02em', x: i ? 'padding-top:9px;' : '' }); if (i) s += vl(x - 12, CY, 78); });
  s += hl(EX, CY + 92, EW);
  // 클래스별 성능 — 원본 식(seed = IoU + 0.03·i → 정밀도 +0.05 · 재현율 −0.03)
  const PERF = [['경작지', .88, .80, .84], ['비경작지', .91, .83, .87]];
  let y = CY + 108;
  s += secH(EX, y, EW, '클래스별 성능', `<span style="display:inline-flex;gap:14px;align-items:center"><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${INK};display:inline-block"></span>정밀도</span><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${C};display:inline-block"></span>재현율</span><span style="display:inline-flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${ACC};display:inline-block"></span>F1</span></span>`, false);
  PERF.forEach(([nm, p, rc, f], i) => {
    const yy = y + 42 + i * 84;
    s += div(EX, yy + 5, 10, 10, i ? `border:1.5px dashed ${TEAL}` : `background:${TEAL}`) + t(EX + 20, yy - 2, nm, { s: 16, fw: 500 });
    [[p, INK], [rc, C], [f, ACC]].forEach(([v, col], j) => {
      const by = yy + 26 + j * 16; s += div(EX, by, (EW - 60) * v, 10, `background:${col}`) + n(EX + (EW - 60) * v + 8, by - 5, v.toFixed(2), { s: 14, c: col === C ? G : col });
    });
  });
  s += vl(EX + (EW - 60), y + 40, 2 * 84 - 14, H) + n(EX + EW - 60 - 14, y + 42 + 2 * 84 - 10, '1.00', { s: 14, c: G });
  // 오분류 행렬 — 원본은 Math.random() 데모 → 값 결손
  y = y + 42 + 2 * 84 + 22;
  s += secH(EX, y, EW, '오분류 행렬', '행: 실제 클래스, 열: 예측 클래스. 대각선이 높을수록 정확', false);
  const mx = EX + 96, cwid = 120;
  ['경작지', '비경작지'].forEach((nm, i) => { s += t(mx + i * cwid, y + 40, nm, { s: 14.5, c: G, w: cwid, ct: 1 }) + t(EX, y + 72 + i * 40, nm, { s: 14.5, c: G }); });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) s += div(mx + j * cwid, y + 64 + i * 40, cwid - 6, 34, i === j ? `background:${T1};border:1px dashed ${ACC}` : `border:1px dashed ${C}`, `<div style="text-align:center;line-height:32px;font-size:15px;color:${i === j ? ACC : C}" class="n">—</div>`);
  s += t(mx + 2 * cwid + 12, y + 70, '원본 값 = 난수 데모', { s: 14, c: G }) + t(mx + 2 * cwid + 12, y + 92, '학습 서버 연결 시 표시', { s: 14, c: G }) + t(mx + 2 * cwid + 12, y + 114, '대각선 = 틴트 칸', { s: 14, c: G });
  // 우: 학습 정보 · 학습 설정
  s += secH(RX, CY - 2, RW, '학습 정보', tag());
  s += kvRows(RX, CY + 29, RW, [['학습명', r.training], ['상태', '완료', { c: ACC, fw: 500 }], ['학습 시작 일시', '2026.03.30 09:14', { cls: 'n', ls: '.02em' }], ['소요 시간', '1시간 22분'], ['라벨 수', '4,200', { cls: 'n' }], ['클래스 수', '2', { cls: 'n' }]], { rh: 28, lw: 130 });
  const y2 = CY + 29 + 6 * 28 + 16;
  s += secH(RX, y2, RW, '학습 설정', '');
  s += kvRows(RX, y2 + 31, RW, [['기반 모델 (백본)', 'XI-VFM v2.1', { cls: 'n' }], ['입력 크기', '640 x 640', { cls: 'n' }], ['이전 학습 이어가기', '없음 (새로 시작)'], ['탐지 형태', r.det], ['학습 : 검증 비율', '80 : 20', { cls: 'n' }], ['배치 크기', '16', { cls: 'n' }], ['에폭 (Epochs)', '100', { cls: 'n' }], ['IoU 임계값', '0.5', { cls: 'n' }], ['Confidence 임계값', '0.25', { cls: 'n' }]], { rh: 28, lw: 150 });
  s += cta(RX, 790, RW, 44, '발행 처리');
  return s;
}

// ---------- 분석 결과 (지도 오버레이 + 세부) ----------
function boardAnalysis() {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + detailHead(r, '분석 결과');
  const MW = 552, MH = 834 - CY;
  const tool = (i, ic) => `<div style="position:absolute;right:10px;top:${10 + i * 37}px;width:36px;height:36px;background:#FFFFFF;border:1px solid ${H};display:flex;align-items:center;justify-content:center">${svg(IC[ic], 17, INK)}</div>`;
  const over = [0, 1, 2, 3].map(i => tool(i, ['search', 'globe', 'ruler', 'layers'][i])).join('') + tool(4.4, 'plus') + tool(5.4, 'minus')
    + `<div style="position:absolute;left:10px;top:10px;background:#FFFFFF;padding:10px 12px;width:260px"><div style="font-size:14px;color:${G};letter-spacing:.02em">탐지결과 오버레이</div>
<div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:15.5px;white-space:nowrap"><span style="width:12px;height:12px;background:rgba(15,169,160,.3);border:1.5px solid ${TEAL};flex:none"></span>경작지<span style="flex:1"></span><span class="n">1,291</span><span style="font-size:14px;color:${G}">필지</span></div>
<div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:15.5px;white-space:nowrap"><span style="width:12px;height:12px;border:1.5px dashed ${TEAL};flex:none"></span>비경작지<span style="flex:1"></span><span class="n">807</span><span style="font-size:14px;color:${G}">필지</span></div>
<div style="font-size:14px;color:${G};margin-top:6px;line-height:1.35">results.js 실측 · 분석 2026-06-08<br>평균 신뢰도 0.45 · 폴리곤 배치 시연</div></div>`
    + capbar(MW, MH, '남원시 농지이용 현황 2025 · 드론 정사영상', '127.4214 E · 35.4320 N');
  s += farmPlate(EX, CY, MW, MH, [250, 0, 852 * MW / MH], { over, sw: 2.2 });
  // 우: 분석 결과 목록 2 + 세부
  const AX = 1080, AW = 304;
  s += secH(AX, CY - 2, AW, '분석 결과', '2건');
  [['농지 활용 분석 #1', '2,098', '필지', '실측', '2026.06.08', 1], ['농지 활용 분석 #4', '58', '건', '시연', '2026.06.13', 0]].forEach(([nm, v, u, tg, dt, on], i) => {
    const y = CY + 29 + i * 58;
    if (on) s += div(AX - 8, y, AW + 16, 57, `background:${T1}`) + div(AX - 8, y, 2, 57, `background:${ACC}`);
    s += t(AX + 2, y + 7, nm, { s: 16, fw: on ? 500 : 400 }) + t(AX, y + 8, '완료', { s: 14.5, c: TEAL, w: AW - 2, r: 1, fw: 500 });
    s += t(AX + 2, y + 31, `탐지 <span class="n" style="color:${INK}">${v}</span> ${u} ${tag(tg)}`, { s: 14.5, c: G }) + n(AX, y + 32, dt, { s: 14, c: G, w: AW - 2, r: 1, ls: '.02em' }) + hl(AX, y + 57, AW);
  });
  let y = CY + 29 + 116 + 12;
  const sec = (title, rows, lw = 84) => { let o = t(AX, y, title, { s: 15, fw: 500 }) + (title === '기본 정보' ? t(AX, y, tag(), { s: 14, w: AW, r: 1 }) : '') + hl(AX, y + 24, AW, INK); o += kvRows(AX, y + 25, AW, rows, { rh: 25, lw }); y += 25 + rows.length * 25 + 10; return o; };
  s += sec('기본 정보', [['분석명 · 과제', '농지 활용 분석 #1 · 농지 활용 분석', { s: 14.5 }]], 100);
  s += sec('처리 정보', [['상태', '처리 완료', { c: TEAL, fw: 500 }], ['시작 · 종료', '2026.05.10 09:14 – 10:36', { cls: 'n', s: 14.5 }], ['소요 · 실행자', '90분 · —']], 100);
  s += sec('정사 영상', [['기준 · 크기', '2026.05.10 · 28.4 GB', { cls: 'n', s: 14.5 }], ['데이터명', '농지 활용 분석_20260510'], ['출처', '남원시 농정과 드론 촬영']]);
  s += sec('분석 범위', [['범위 유형', '분석 구역 · 6.2 KB'], ['데이터명', '농지 활용 분석 범위']]);
  s += cta(AX, 790, AW, 44, '발행 처리');
  return s;
}

// ---------- 발행 처리(상태 변경 + 권한 선택) · 반려 사유 ----------
const PERMS = [['LX 한국국토정보공사', 'LX 관리자'], ['LX 한국국토정보공사', 'LX 일반 사용자'], ['LX 한국국토정보공사', 'LX 하천 관리'], ['남원시청', '남원시청 관리자'], ['남원시청', '사료작물 분석'], ['남원시청', '농지 활용 분석'], ['남원시청', '영농 정보 분석'], ['남원시청', '일반사용자'], ['전라남도', '전라남도 관리자'], ['전라남도', '해운항만과'], ['전라남도', '신안군'], ['전라남도', '완도군'], ['전라남도', '전라남도 사용자']];
function boardProcess(reject) {
  const r = P6;
  let s = shellAdmin('전체') + queue(r.id) + detailHead(r, '개요');
  s += `<div style="opacity:.5">` + evidence(r, { intro: INTRO6, purpose: PURP6 }) + `</div>`;
  // 우 열 = 발행 처리 패널(잉크 테두리)
  const PX = 1040, PW = 344, IX = PX + 20, IW = PW - 40, py = CY - 12;
  s += div(PX, py, PW, 842 - py, `background:#FFFFFF;border:1px solid ${INK}`);
  s += d(IX, py + 16, '발행 처리', 22) + ico(IX + IW - 16, py + 20, IC.close, 16, G) + hl(IX, py + 54, IW, INK);
  let y = py + 68;
  s += flab(IX, y, '상태 변경', { req: 1 }); y += 24;
  const cur = reject ? '반려' : '승인', sw = (IW - 18) / 4;
  ['대기', '검토중', '승인', '반려'].forEach((k, i) => {
    const x = IX + i * (sw + 6), on = k === cur;
    s += div(x, y, sw, 56, `border:1px solid ${on ? INK : H};${on ? `background:${T1}` : ''}`) + radio(x + 8, y + 9, on) + t(x + 8, y + 30, k, { s: 15.5, fw: on ? 500 : 400, c: on ? INK : G });
    if (i < 2) s += t(x + sw - 2, y + 17, '›', { s: 15, c: C, w: 10, ct: 1 });
  });
  s += t(IX, y + 62, '현재 대기 → ' + cur + (reject ? ' · 사유가 요청자에게 전달됩니다' : ' · 승인하면 카드가 발행됩니다'), { s: 14, c: G });
  y += 90;
  let shown = 10, from = 0;
  if (reject) {
    s += flab(IX, y, '반려 사유', { req: 1, count: '0자/500자', w: IW });
    s += div(IX, y + 22, IW, 72, `border:1px solid ${ACC};padding:10px 12px;font-size:15.5px;color:${C}`, `<span style="display:inline-block;width:1px;height:17px;background:${INK};vertical-align:-3px;margin-right:2px"></span>반려 사유를 입력해 주세요`);
    s += t(IX, y + 100, '반려 사유를 입력해 주세요', { s: 14.5, c: WARN });
    y += 130; shown = 5; from = 3;
  }
  s += flab(IX, y, '권한 선택', { req: 1 }) + t(IX, y, `선택 <span class="n" style="color:${ACC}">2</span> / 13 · ${reject ? '↑ 3 · ↓ 5 스크롤' : '↓ 3 스크롤'}`, { s: 14, c: G, w: IW, r: 1 }); y += 22;
  s += div(IX, y, IW, 30, `background:${T1}`) + chk(IX + 8, y + 7, false) + t(IX + 36, y + 6, '기관명', { s: 14, c: G }) + t(IX + 176, y + 6, '권한명', { s: 14, c: G }) + hl(IX, y + 30, IW, INK);
  const on = ['남원시청 관리자', '농지 활용 분석'];
  PERMS.slice(from, from + shown).forEach(([org, role], i) => {
    const yy = y + 31 + i * 27, c = on.includes(role);
    if (c) s += div(IX, yy, IW, 26, `background:${T1}`);
    s += chk(IX + 8, yy + 5, c) + t(IX + 36, yy + 4, org, { s: 14.5, c: G, w: 134, ell: 1 }) + t(IX + 176, yy + 3, role, { s: 15, fw: c ? 500 : 400 }) + hl(IX, yy + 26, IW);
  });
  s += hl(IX, 778, IW) + t(IX + 120, 802, '취소', { s: 16, c: G }) + cta(IX + 168, 790, IW - 168, 44, '확인');
  return s;
}

// ======================================================================
// ai-card.html — 발행된 카드 목록 · 빈 상태
// ======================================================================
const CARDS = [
  ['도로안전 정사영상', '2026.05.19 10:00', 1, 'road'], ['도로안전 카메라', '2026.05.16 14:30', 1, null], ['사료작물(생육기) 탐지', '2026.05.11 09:00', 1, 'forage'], ['사료작물(생산기) 탐지', '2026.04.30 09:00', 1, 'forage2'],
  ['곤포사일리지 탐지', '2026.04.21 11:00', 1, 'bale'], ['비닐하우스 탐지', '2026.04.16 10:00', 1, 'gh'], ['농지 활용 분석', '2026.04.01 14:00', 1, 'farm'], ['방치 쓰레기 탐지', '2026.04.05 16:00', 0, 'trash'],
];
const cardThumb = (k, x, y, w, h) => k === 'forage2' ? img(x, y, w, h, 'pj-car.jpg') : k === 'trash' ? img(x, y, w, h, 'b6-publish-trash.jpg') : thumb({ thumb: k }, x, y, w, h, { view: [430, 150, 900], sw: 1.6 });
function cardsShell(n8) {
  let s = rail('pub') + mast(`${svg(IC.pub, 16, G)}<span>카드 발행 관리</span><span style="color:${C}">›</span><span style="color:${INK}">카드 발행</span>`) + h1('카드', ' 발행', '학습 완료된 모델을 AI 분석 과제로 발행하고 관리합니다') + foot;
  // 우: 큰 수(목록 건수 · 공개 여부) — 대시보드 KPI '발행 분석 카드' 와 같은 값
  const K = n8 ? [['발행 카드', '8', ACC], ['공개', '7', INK], ['비공개', '1', INK]] : [['발행 카드', '0', G], ['공개', '0', G], ['비공개', '0', G]];
  K.forEach(([k, v, col], i) => { const x = XR - 3 * 104 + i * 104; s += t(x + 12, 88, k, { s: 14.5, c: G }) + d(x + 12, 108, v, 30, { c: col }) + t(x + 36, 121, '건', { s: 14, c: G }) + (i ? vl(x, 88, 52) : ''); });
  s += hl(X0, 158, CW);
  // 검색 툴바
  const y = 174;
  s += t(X0, y + 10, '검색어', { s: 14.5, c: G }) + sel(X0 + 54, y, 130, 40, '전체') + fld(X0 + 190, y, 300, 40, ph('검색어'));
  s += t(X0 + 522, y + 10, '공개 여부', { s: 14.5, c: G }) + sel(X0 + 592, y, 130, 40, '전체');
  s += t(X0 + 754, y + 9, '초기화', { s: 16 }) + btn2(X0 + 816, y, 80, 40, '검색');
  s += cta(XR - 132, y, 132, 40, `${svg(IC.plus, 14, '#FFFFFF', 'margin-right:6px')}카드 발행`);
  s += d(X0, y + 62, '발행 카드 목록', 18) + n(X0 + 128, y + 63, n8 ? '8' : '0', { s: 17, c: n8 ? ACC : G }) + hl(X0, y + 94, CW, INK);
  return s;
}
const pager = (y, total) => {
  let s = hl(X0, y - 14, CW);
  s += t(X0, y, '처음', { s: 15, c: C }) + t(X0 + 44, y, '이전', { s: 15, c: C }) + div(X0 + 88, y - 4, 28, 28, `border:1px solid ${INK};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:15px">1</span>`) + t(X0 + 130, y, '다음', { s: 15, c: C }) + t(X0 + 174, y, '마지막', { s: 15, c: C });
  s += sel(X0 + 250, y - 5, 72, 30, `<span class="n">15</span>`) + t(X0 + 330, y, '페이지 크기', { s: 14.5, c: G });
  s += t(X0, y, `총 <span class="n" style="color:${INK}">${total}</span>건 중 1~<span class="n">${total}</span>행`, { s: 15, c: G, w: CW, r: 1 });
  return s;
};
function boardCards() {
  let s = cardsShell(true);
  const cw = 296, gap = 24, y0 = 284;
  CARDS.forEach(([nm, dt, pub, k], i) => {
    const x = X0 + (i % 4) * (cw + gap), y = y0 + Math.floor(i / 4) * 258, hov = i === 6;
    s += cardThumb(k, x, y, cw, 168);
    s += div(x, y + 168, cw, 72, `border:1px solid ${hov ? ACC : H};border-top:0;${hov ? `background:${T1}` : ''}`);
    if (hov) s += brk(x - 3, y - 3, cw + 6, 174, ACC, 12, 1.5);
    s += t(x + 14, y + 178, nm, { s: 17, fw: 500, w: cw - 28, ell: 1 });
    s += t(x + 14, y + 208, pub ? '공개' : '비공개', { s: 15, c: pub ? ACC : G, fw: 500 }) + n(x + 14, y + 209, dt, { s: 14, c: G, w: cw - 28, r: 1, ls: '.02em' });
    if (hov) s += t(x + 70, y + 208, '열람 ›', { s: 15, c: INK });
  });
  s += pager(818, 8);
  return s;
}
function boardCardsEmpty() {
  let s = cardsShell(false);
  s += dash(X0, 284, CW, 360, `<div style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">${svg(IC.layers, 36, C)}<div class="d" style="font-size:26px">발행된 카드가 없습니다</div><div style="font-size:16px;color:${G}">프로젝트에서 학습을 완료한 후 결과를 카드로 발행하세요</div></div>`);
  s += cta(X0 + CW / 2 - 76, 560, 152, 44, `${svg(IC.plus, 14, '#FFFFFF', 'margin-right:6px')}카드 발행`);
  // 발행 흐름 3칸 — ai-card-edit 의 3단계를 그대로 예고(기능 추가 없음)
  const st = [['1', '프로젝트 선택', '학습을 마친 AI 개발 프로젝트'], ['2', '학습 결과 선택', '이미 발행된 학습 결과는 선택할 수 없습니다'], ['3', '정보 입력', '모델 명 · 도커 이미지 · 탐지 형태 · 타일링 크기']];
  st.forEach(([no, k, sub], i) => { const x = X0 + i * (402 + 25), y = 668; s += hl(x, y, 402, INK) + d(x, y + 14, no, 30, { c: ACC }) + t(x + 34, y + 18, k, { s: 17.5, cls: 'd' }) + t(x + 34, y + 46, sub, { s: 14.5, c: G }); });
  s += pager(818, 0);
  return s;
}

// ======================================================================
// ai-card-edit.html — 카드 발행(3단계) · 카드 수정(잠금)
// ======================================================================
const PROJ = [['도로안전 정사영상', 'road'], ['도로안전 카메라', null], ['사료작물(생육기) 탐지', 'forage'], ['사료작물(생산기) 탐지', 'forage2'], ['곤포사일리지 탐지', 'bale'], ['비닐하우스 탐지', 'gh'], ['농지 활용 분석', 'farm'], ['방치 쓰레기 탐지', 'trash']];
function editForm(x, w, y0, v, o = {}) {
  let s = '', y = y0; const RS = 92, g = 20, w3 = (w - 2 * g) / 3, w2 = (w - g) / 2;
  const inp = (xx, ww, val, phd, oo = {}) => fld(xx, y + 24, ww, 46, val ? (oo.num ? `<span class="n">${val}</span>` : val) : ph(phd), oo);
  s += flab(x, y, '모델 명', { req: 1, count: `${(v.nm || '').length}자/200자`, w }) + inp(x, w, v.nm, '예: v1', { bc: o.focus ? ACC : H, num: 1 }); y += RS;
  s += flab(x, y, '모델 유형', { req: 1 }) + sel(x, y + 24, w3, 46, v.type || ph('선택'));
  s += flab(x + w3 + g, y, '알고리즘', { req: 1 }) + sel(x + w3 + g, y + 24, w3, 46, v.algo ? `<span class="n">${v.algo}</span>` : ph('선택'));
  s += flab(x + 2 * (w3 + g), y, '사용 여부', { req: 1 }) + sel(x + 2 * (w3 + g), y + 24, w3, 46, v.use, o.lockUse ? { bg: '#F4F4F4', c: G } : {});
  if (o.lockUse) s += ico(x + w - 50, y + 39, IC.lock, 14, G);
  y += RS;
  s += flab(x, y, '모델 설명', { count: `${(v.desc || '').length}자/500자`, w }) + inp(x, w, v.desc, '모델 설명을 입력해 주세요.'); y += RS;
  s += flab(x, y, '도커 이미지 명', { req: 1, count: `${(v.img || '').length}자/200자`, w: w2 }) + inp(x, w2, v.img, '도커 이미지 명을 입력해 주세요.', { num: 1 });
  s += flab(x + w2 + g, y, '도커 이미지 태그', { req: 1, count: `${(v.tg || '').length}자/100자`, w: w2 }) + fld(x + w2 + g, y + 24, w2, 46, v.tg ? `<span class="n">${v.tg}</span>` : ph('도커 이미지 태그를 입력해 주세요.')); y += RS;
  s += flab(x, y, '탐지 형태', { req: 1 }) + sel(x, y + 24, w2, 46, v.det || ph('선택'));
  s += flab(x + w2 + g, y, '타일링 크기(pixel)', { req: 1 }) + fld(x + w2 + g, y + 24, w2, 46, v.tile ? `<span class="n">${v.tile}</span>` : `<span class="n" style="color:${C}">64 ~ 8192</span>`); y += RS;
  s += flab(x, y, '모델 설명 화면', { req: 1, count: `${(v.scrn || '').length}자/200자`, w }) + inp(x, w, v.scrn, '예: /jn/aidetect/sea_trash_drone.html', { num: 1 });
  return s;
}
const stepHead = (x, y, w, no, title, on = true) => d(x, y, String(no), 30, { c: on ? ACC : C }) + t(x + 30, y + 5, title, { s: 18, cls: 'd', c: on ? INK : G }) + hl(x, y + 40, w, on ? INK : H);
function boardCardEdit() {
  let s = rail('pub') + mast(`${svg(IC.pub, 16, G)}<span>카드 발행 관리</span><span style="color:${C}">›</span><span>카드 발행</span><span style="color:${C}">›</span><span style="color:${INK}">새 카드</span>`) + h1('카드', ' 발행', '프로젝트와 학습 결과를 선택하고 모델 정보를 입력해 발행합니다') + hl(X0, 148, CW) + foot;
  const y0 = 166, c1 = X0, w1 = 316, c2 = X0 + 340, w2 = 300, c3 = X0 + 664, w3 = CW - 664;
  s += stepHead(c1, y0, w1, 1, '프로젝트 선택');
  PROJ.forEach(([nm, k], i) => {
    const y = y0 + 50 + i * 72, on = i === 5;
    if (on) s += div(c1 - 8, y, w1 + 16, 71, `background:${T1}`) + div(c1 - 8, y, 2, 71, `background:${ACC}`);
    s += cardThumb(k, c1, y + 8, 84, 55).replace('<span>정사영상 크롭 없음</span>', '');
    if (on) s += brk(c1 - 3, y + 5, 90, 61, ACC, 9, 1.5);
    s += t(c1 + 98, y + 14, nm, { s: 16.5, fw: on ? 500 : 400 }) + t(c1 + 98, y + 39, ['학습 3 · 폴리곤', '학습 2 · 이미지셋', '학습 3 · 폴리곤', '학습 2 · 폴리곤', '학습 2 · 바운딩 박스', '학습 2 · 폴리곤', '학습 3 · 폴리곤', '학습 1 · 바운딩 박스'][i], { s: 14, c: G });
    s += hl(c1, y + 71, w1);
  });
  s += stepHead(c2, y0, w2, 2, '학습 결과 선택');
  s += t(c2, y0 + 50, '이미 발행된 학습 결과는 선택할 수 없습니다.', { s: 14, c: G });
  const RES = [['v4(반사광 보정)', '2026.04.30 10:00', 1], ['v3(군집 분리)', '2026.04.09 10:00'], ['v2(경계 정밀)', '2026.03.21 10:00'], ['v1(기본)', '2026.02.15 09:00'], ['v5(단동/연동 분리)', '2026.05.20 09:00', 0, 1]];
  RES.forEach(([nm, dt, on, pub], i) => {
    const y = y0 + 78 + i * 62;
    if (on) s += div(c2 - 8, y, w2 + 16, 61, `background:${T1}`) + div(c2 - 8, y, 2, 61, `background:${ACC}`);
    s += radio(c2 + 4, y + 22, on).replace(`border:1px solid ${C}`, `border:1px solid ${pub ? H : C}`) + t(c2 + 32, y + 9, nm, { s: 16.5, fw: on ? 500 : 400, c: pub ? C : INK }) + n(c2 + 32, y + 34, dt, { s: 14, c: pub ? C : G, ls: '.02em' });
    if (pub) s += `<div class="chip" style="position:absolute;left:${c2 + w2 - 62}px;top:${y + 18}px">발행됨</div>`;
    s += hl(c2, y + 61, w2);
  });
  // 선택한 결과의 증거 — 비닐하우스 결과 크롭(results.js 실측)
  const ey = y0 + 78 + 5 * 62 + 18;
  s += ghPlate(c2, ey, w2, 834 - ey - 48, { over: capbar(w2, 0, '비닐하우스 · 결과 폴리곤') });
  s += t(c2, 792, `남원 비닐하우스 <span class="n" style="color:${INK}">1,674</span> 필지 · 실측 2026-06-06`, { s: 14, c: G }) + t(c2, 812, `단동 <span class="n">1,469</span> · 다동 <span class="n">205</span> · 평균 신뢰도 <span class="n">0.79</span>`, { s: 14, c: G });
  s += stepHead(c3, y0, w3, 3, '정보 입력');
  s += editForm(c3, w3, y0 + 56, { nm: 'v4', type: '비닐하우스 탐지결과', use: '사용' }, { focus: 1, lockUse: 1 });
  s += t(c3, 802, '발행 모드 · 사용 여부는 ‘사용’ 고정', { s: 14, c: G }) + t(XR - 190, 802, '취소', { s: 16, c: G }) + cta(XR - 140, 790, 140, 44, '발행');
  s += vl(c2 - 12, y0, 668) + vl(c3 - 12, y0, 668);
  return s;
}
function boardCardEditLocked() {
  let s = rail('pub') + mast(`${svg(IC.pub, 16, G)}<span>카드 발행 관리</span><span style="color:${C}">›</span><span>카드 발행</span><span style="color:${C}">›</span><span style="color:${INK}">비닐하우스 탐지 · v5</span><span class="n" style="font-size:14.5px;color:${C};letter-spacing:.02em">?cid=6&amp;mc=0</span>`) + h1('카드', ' 수정', '발행된 AI 카드 정보를 수정합니다') + hl(X0, 148, CW) + foot;
  const y0 = 166, c1 = X0, w1 = 592, c3 = X0 + 664, w3 = CW - 664;
  s += ghPlate(c1, y0, w1, 360, { over: capbar(w1, 0, '비닐하우스 탐지 · 결과 폴리곤', '남원 · 실측 1,674 필지') }) + brk(c1, y0, w1, 360, '#FFFFFF', 14, 1.5);
  const ly = y0 + 380, hw = (w1 - 24) / 2;
  s += stepHead(c1, ly, hw, 1, '프로젝트 선택', false) + div(c1, ly + 50, hw, 60, `background:${T1}`) + ico(c1 + 14, ly + 72, IC.lock, 16, G) + t(c1 + 42, ly + 68, '비닐하우스 탐지', { s: 16.5, fw: 500 });
  s += stepHead(c1 + hw + 24, ly, hw, 2, '학습 결과 선택', false) + div(c1 + hw + 24, ly + 50, hw, 60, `background:${T1}`) + ico(c1 + hw + 38, ly + 72, IC.lock, 16, G) + t(c1 + hw + 66, ly + 60, 'v5(단동/연동 분리)', { s: 16.5, fw: 500 }) + n(c1 + hw + 66, ly + 84, '2026.05.20 09:00', { s: 14, c: G, ls: '.02em' });
  s += t(c1, ly + 122, '수정 시 변경할 수 없습니다.', { s: 14.5, c: G }) + t(c1 + hw + 24, ly + 122, '수정 시 변경할 수 없습니다.', { s: 14.5, c: G });
  s += kvRows(c1, ly + 158, w1, [['발행', `2026.05.20 09:00 · 발행자 — ${tag()}`, { cls: 'n', ls: '.01em' }], ['최종 수정', '2026.05.21 16:40 · 수정자 —', { cls: 'n', ls: '.01em' }], ['이 프로젝트의 카드', 'v5 사용 · v4 · v3 · v2 · v1 미사용']], { rh: 32, lw: 150 });
  s += stepHead(c3, y0, w3, 3, '정보 입력');
  s += editForm(c3, w3, y0 + 56, { nm: 'v5', type: '비닐하우스 탐지결과', algo: 'YOLO v11-seg', use: '사용', desc: '단동/연동 분리', img: 'landxi/greenhouse', tg: '5.0', det: '폴리곤(Polygon)', tile: '1024', scrn: '/jn/aidetect/greenhouse.html' });
  s += t(XR - 190, 802, '취소', { s: 16, c: G }) + cta(XR - 140, 790, 140, 44, '저장');
  s += vl(c3 - 36, y0, 668);
  return s;
}

// ======================================================================
// ai-publish-create.html (전역 진입 · pid 없음) — 과제 고도화 + 분석 결과 선택 모달
//   프로젝트 스코프(?pid=N · 신규 과제 · 학습 결과 선택)는 B5-Project-Deploy 가 이미 그린다 → 여기서는 다른 점만.
// ======================================================================
function boardRequest() {
  let s = rail('proj') + mast(`<span>‹ AI 개발 프로젝트</span><span style="color:${C}">·</span><span style="color:${INK};border-bottom:2px solid ${INK};line-height:26px">카드 발행 요청</span>`) + h1('카드 발행', ' 요청', '분석 과제(프로젝트)와 학습 결과를 선택하고 모델 세부 정보를 입력해 발행을 요청합니다') + hl(X0, 148, CW) + foot;
  const y0 = 166, pw = 402, gx = 25;
  // 선택 카드 3 (내 프로젝트 · 학습 결과 · 분석 결과)
  const picks = [['1', '내 프로젝트', '필수', '농지 활용 분석', '폴리곤 (Polygon) · 정사영상', 1], ['2', '학습 결과', '필수', '농지 분류 v2.0', 'IoU 0.83 · F1 0.88 · 2026.03.30', 1], ['3', '분석 결과', '선택', '1건 선택됨', '잘 된 분석 결과를 선택해 주세요', 2]];
  picks.forEach(([no, k, meta, v, sub, st], i) => {
    const x = X0 + i * (pw + gx);
    s += div(x, y0, pw, 96, `border:1px solid ${st === 2 ? ACC : H};${st === 2 ? `background:${T1}` : ''}`);
    s += i === 0 ? farmPlate(x + 1, y0 + 1, 120, 94, [430, 150, 700], { sw: 1.4 }) : i === 1 ? farmPlate(x + 1, y0 + 1, 120, 94, [760, 260, 560], { sw: 1.6 }) : farmPlate(x + 1, y0 + 1, 120, 94, [250, 0, 1100], { sw: 1.4 });
    s += lab(x + 136, y0 + 12, `${no} · ${k}`) + t(x + 136, y0 + 12, meta, { s: 14, c: meta === '필수' ? ACC : G, w: pw - 150, r: 1 }) + t(x + 136, y0 + 34, v, { s: 18, cls: 'd' }) + t(x + 136, y0 + 64, sub, { s: 14.5, c: G, cls: i === 1 ? 'n' : '' }) + t(x + 136, y0 + 64, '변경 ›', { s: 14.5, c: INK, w: pw - 150, r: 1 });
  });
  // 과제 유형 · 고도화 폼
  let y = y0 + 118;
  s += flab(X0, y, '과제 유형') + radio(X0, y + 28, false) + t(X0 + 24, y + 25, '신규 과제', { s: 16, c: G }) + radio(X0 + 120, y + 28, true) + t(X0 + 144, y + 25, '과제 고도화', { s: 16, fw: 500 });
  s += flab(X0 + 300, y, '과제명', { req: 1 }) + sel(X0 + 300, y + 22, 420, 40, '농지 활용 분석') + flab(X0 + 744, y, '모델명', { req: 1 }) + fld(X0 + 744, y + 22, 200, 40, `<span class="n">v2.0</span>`);
  s += t(X0 + 300, y + 70, '선택한 과제의 정보를 재사용하며, 새 모델만 추가합니다. 과제 정보 변경이 필요하면 아래 [과제 정보 수정]을 열어 주세요.', { s: 14.5, c: G });
  y += 106;
  s += div(X0, y, CW, 44, `border:1px solid ${H};display:flex;align-items:center;padding:0 16px;font-size:16px;font-weight:500`, `과제 정보 수정<span style="flex:1"></span><span style="font-size:14.5px;color:${G};font-weight:400;margin-right:10px">탐지 형태 · 데이터 유형 · 소개 · 개발 목적 · 썸네일 2 · 클래스 — 기존 값 유지</span>${chev(INK)}`);
  y += 60;
  // 접힌 아코디언 아래 — 재사용되는 과제 정보(읽기)
  s += flab(X0, y, '탐지 형태', { auto: 1 }) + auto(X0, y + 22, 300, 34, '폴리곤 (Polygon)') + flab(X0 + 324, y, '데이터 유형', { auto: 1 }) + auto(X0 + 324, y + 22, 300, 34, '정사영상') + flab(X0 + 648, y, '클래스', { auto: 1 }) + classChips(X0 + 648, y + 24, ['경작지', '비경작지']);
  y += 76;
  s += flab(X0, y, '대시보드 썸네일 이미지') + farmPlate(X0, y + 22, 196, 170, [560, 250, 520], { sw: 1.4 }) + flab(X0 + 220, y, '카드 썸네일 이미지') + farmPlate(X0 + 220, y + 22, 255, 170, [330, 40, 1054], { sw: 1.6 }) + t(X0, y + 200, '기존 이미지 · 고도화 시 자동 프리필', { s: 14, c: G });
  s += flab(X0 + 500, y, '소개') + t(X0 + 500, y + 22, INTRO6, { s: 15.5, lh: '23px', w: 440, wrap: 1, c: G }) + flab(X0 + 500, y + 100, '개발 목적') + t(X0 + 500, y + 122, PURP6, { s: 15.5, lh: '23px', w: 440, wrap: 1, c: G });
  s += hl(X0, 776, CW) + t(X0, 802, '목록', { s: 16 }) + t(XR - 200, 802, '취소', { s: 16, c: G }) + cta(XR - 150, 790, 150, 44, '발행 요청');
  // 분석 결과 선택 모달(우측 정렬 · 다중 체크)
  const mx = 536, my = 276, mw = 440, mh = 552;
  let m = div(mx, my, mw, mh, `background:#FFFFFF;border:1px solid ${INK}`) + d(mx + 24, my + 22, '분석 결과', 22) + `<div style="position:absolute;left:${mx + 116}px;top:${my + 24}px">${tag()}</div>` + ico(mx + mw - 40, my + 26, IC.close, 16, G) + hl(mx + 24, my + 64, mw - 48, INK);
  m += t(mx + 24, my + 76, '잘 된 분석 결과를 선택해 관리자가 검증할 수 있도록 해 주세요.', { s: 14.5, c: G });
  const AN = [['농지 활용 분석 분석 #1', '운봉읍 일대 · 2026.05.12 · 201건 탐지', 1, [330, 40, 700]], ['농지 활용 분석 분석 #2', '인월면 일대 · 2026.05.04 · 58건 탐지', 0, [700, 300, 684]], ['농지 활용 분석 분석 #3', '산내면 일대 · 2026.04.27 · 95건 탐지', 0, [0, 330, 700]], ['농지 활용 분석 분석 #4', '주천면 일대 · 2026.04.20 · 132건 탐지', 0, [600, 0, 784]], ['농지 활용 분석 분석 #5', '아영면 일대 · 2026.04.12 · 169건 탐지', 0, [200, 380, 700]]];
  AN.forEach(([nm, meta, on, view], i) => {
    const yy = my + 108 + i * 74;
    if (on) m += div(mx + 16, yy, mw - 32, 73, `background:${T1}`);
    m += chk(mx + 28, yy + 28, on) + farmPlate(mx + 58, yy + 9, 84, 55, view, { sw: 1.2 }) + t(mx + 156, yy + 13, nm, { s: 16.5, fw: on ? 500 : 400 }) + t(mx + 156, yy + 39, meta, { s: 14, c: G, cls: 'n', ls: '0' }) + hl(mx + 24, yy + 73, mw - 48);
  });
  m += t(mx + 24, my + mh - 46, `선택 <span class="n" style="color:${ACC}">1</span>건`, { s: 15 }) + t(mx + mw - 190, my + mh - 47, '취소', { s: 16, c: G }) + cta(mx + mw - 134, my + mh - 60, 110, 44, '선택');
  s += div(72, 0, 1368, HT, 'background:rgba(1,1,2,.38);z-index:20') + `<div style="position:absolute;left:0;top:0;width:${W}px;height:${HT}px;z-index:21">${m}</div>`;
  return s;
}

// ---------- 페이지 래퍼 ----------
function page(body) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block;letter-spacing:-.01em}
.tag{border:1px dotted #CCCCCC;padding:0 5px;font-size:14px;line-height:18px;color:#686868;margin-left:6px;display:inline-block;vertical-align:1px;letter-spacing:0;font-weight:400;font-family:'Pretendard',system-ui,sans-serif}
[data-line]{clip-path:inset(-5px 0px);overflow:clip;display:block}
@keyframes lineIn{from{transform:translateY(20px)}to{transform:translateY(0)}}
.in [data-line]>*{animation:lineIn 600ms cubic-bezier(.15,1,.3,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${body}</div>
</x-dc>
</body>
</html>
`;
}

wr('B6-Publish-Opt1', opt1());
wr('B6-Publish-Opt2', opt2());
wr('B6-Publish-Opt3', boardOverview(P6, { crumb: `${svg(IC.dash, 16, G)}<span>대시보드</span><span style="color:${C}">›</span><span style="color:${INK}">카드 발행 승인 대기 · 검토</span><span class="n" style="font-size:14.5px;color:${C};letter-spacing:.02em">?open=pa-6</span>` }));
wr('B6-Publish-List', boardList());
wr('B6-Publish-List-Pending', boardPending());
wr('B6-Publish-List-Empty', boardListEmpty());
wr('B6-Publish-Review-Edit', boardEdit());
wr('B6-Publish-Review-Rejected', boardOverview(P4, { counts: ['', 3, 2, '', 1] }));
wr('B6-Publish-Review-Members', boardMembers());
wr('B6-Publish-Review-Labeling', boardLabeling(false));
wr('B6-Publish-Review-ClassModal', boardLabeling(true));
wr('B6-Publish-Review-Train', boardTrain());
wr('B6-Publish-Review-Analysis', boardAnalysis());
wr('B6-Publish-Review-Process', boardProcess(false));
wr('B6-Publish-Review-Reject', boardProcess(true));
wr('B6-Publish-Cards', boardCards());
wr('B6-Publish-Cards-Empty', boardCardsEmpty());
wr('B6-Publish-Card-Edit', boardCardEdit());
wr('B6-Publish-Card-Edit-Locked', boardCardEditLocked());
wr('B6-Publish-Request', boardRequest());
console.log('wrote', written.length, 'artboards');
console.log(written.join(' '));
