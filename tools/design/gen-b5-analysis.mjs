// B5 분석 서비스 재생성기 — List(카드 그리드 + 우 정보 패널) · 분석 실행 3화면(Run-Review 실행 검토 · Run-Progress 실행중 · Result 실행 결과)
// 발주 원문(2026-08-27): "프로젝트는 진행하고 분석 서비스로 설계하자. 현재 로그인 대시보드 데이터관리 프로젝트
//   탭별로 구현한 특과 톤앤매너를 유지하고 창의적인 프론트 디자인을 구현하자. 기존 기능은 유지하되"
// 규칙 — ① design/system.md §1–§5 ② 실데이터 = services.js(15 · 부처 6) · results.js(4 산출물) · imagery.js(11)
//        ③ 원본 데모 시드(실행중 3 · 완료 7 · 모델 v1–v5 · 공유 역할 9)는 `시연` ④ 화면당 검정 CTA 1
//        ⑤ 파리티 = NOTES.md §19.1 표 (원본 analysis-ai.html 컨트롤 31 상태 1회씩)
// usage: node tools/design/gen-b5-analysis.mjs   (repo root) — 4판(List · Run-Review · Run-Progress · Result)을 통째로 다시 쓴다(멱등). Run · Run-1…5 는 2026-08-27 폐기(NOTES §19.6).
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
// 레일 72 = tools/design/b5-rail.html(프로젝트 활성) → 분석 서비스 활성으로 바꿔 끼운다
const RAIL0 = fs.readFileSync(path.join(root, 'tools/design/b5-rail.html'), 'utf8').replace(/\r\n/g, '\n');
const RAIL = (() => {
  const items = RAIL0.split('\n<div style="position:absolute;left:0;top:');
  const out = items.map((it, i) => {
    if (i === 0) return it;
    const on = it.startsWith('246px');
    let s = it.replace(/<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"><\/div>\n?/, '')
      .replace(/color:#010102/g, 'color:#686868');
    if (on) s = s.replace(/color:#686868/g, 'color:#010102').replace('gap:6px">', 'gap:6px">\n<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"></div>');
    return s;
  });
  return out.join('\n<div style="position:absolute;left:0;top:');
})();
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B', AMB = '#FFB633';
const X0 = 128, XE = 1384, CW = 1256;   // 본문 열: 마진 56

// ---------- 실데이터 (services.js · results.js · imagery.js 그대로) ----------
const SERVICES = [
  ['marine', '해양쓰레기 실태조사', '해양수산부', 38057, '건', '2026-08-12', true],
  ['farmland', '농지이용·불법건축물', '농림축산식품부', 2098, '필지', '2026-06-08', true],
  ['pothole', '도로안전 다시점 조사', '국토교통부', 1264, '건', '2026-08-19', true],
  ['change', '드론 변화탐지', 'LX 한국국토정보공사', 486, '건', '2026-08-05', true],
  ['greenbelt', '개발제한구역 훼손', '국토교통부', 912, '건', '2026-06-24', false],
  ['solar', '태양광 설비 현황', '산업통상자원부', 3140, '개소', '2026-05-18', false],
  ['feedcrop', '사료작물 재배지', '농림축산식품부', 1785, '필지', '2026-06-02', false],
  ['incinerator', '불법 소각시설', '환경부', 274, '개소', '2026-07-11', false],
  ['building', '건축물 변화 탐지', '국토교통부', 5620, '동', '2026-07-22', false],
  ['silage', '곤포 사일리지 집계', '농림축산식품부', 8934, '개', '2026-06-15', false],
  ['trash', '방치폐기물 탐지', '환경부', 631, '개소', '2026-07-03', false],
  ['river', '하천 불법점용', '환경부', 358, '건', '2026-05-29', false],
  ['greenhouse', '비닐하우스 현황', '농림축산식품부', 9664, '동', '2026-06-06', true],
  ['forest', '산림 훼손 탐지', '산림청', 0, '건', '2026-08-26', false],
  ['carbon', '탄소 흡수량 산정', '산림청', 0, 'tCO₂', '2026-08-26', false],
];
const fmt = n => n.toLocaleString('ko-KR');
const dot = s => s.replace(/-/g, '.');
// results.js namwon-farmland-2025
const FARM = { count: 2098, ha: 315.868, cls: [['경작지', 1291], ['비경작지', 807]], confMean: 0.4465, confMedian: 0.412, hist: [0, 468, 314, 230, 236, 209, 203, 179, 200, 59] };
// imagery.js (11) — label · kind · gsd · captured · 썸네일
const IMAGERY = [
  ['namwon_2504', '남원 농경지 · 2025.04', '드론', '1.08 cm', 'tile-farm-clean.jpg'],
  ['namwon_2506', '남원 농경지 · 2025.06', '드론', '1.69 cm', 'tile-gh-clean.jpg'],
  ['namwon_2508', '남원 농경지 · 2025.08', '드론', '1.54 cm', 'pj-hero.jpg'],
  ['namwon_2510', '남원 농경지 · 2025.10', '드론', '1.68 cm', 'pj-nw2510.jpg'],
  ['kuksan_a68', '국산리 드론 A68 · 2025.08', '드론', '5 cm', 'tile-kuksan-1.jpg'],
  ['kuksan_a71', '국산리 드론 A71 · 2025.08', '드론', '5 cm', 'ev-change.jpg'],
  ['jeju_2022', '제주 항공 정사영상 · 2022.12', '항공', '12 cm', 'tile-arc-jeju.jpg'],
  ['jeju_landcover', '제주 토지형질 세그멘테이션', '항공', '12 cm', 'tile-arc-jeju.jpg'],
  ['jeju_2020', '제주 항공 정사영상 · 2020.12', '항공', '10 cm', 'pj-jeju2020.jpg'],
  ['namwon_city_2510', '남원 전역 · 2025.10', '항공', '2 m', 'tile-ep-4.jpg'],
  ['namwon_city_2504', '남원 전역 · 2025.04', '항공', '2 m', 'tile-ep-4.jpg'],
];

// ---------- 헬멧 ----------
const HELMET = `<helmet><style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
/* Paperlogy 700/800 표시 · Pretendard 본문 · Inter 표 숫자 — T3 (발주 결정 2026-08-27) */
@font-face{font-family:'Paperlogy';font-weight:800;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2') format('woff2')}
@font-face{font-family:'Paperlogy';font-weight:700;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2') format('woff2')}
:root{--ink:#010102;--grey:#686868;--grey-2:#CCCCCC;--line:#DDDDDD;--accent:#006DF7;--tint-1:#E8F1FF;--tint-2:#D6E6FF;--teal:#0FA9A0;--warn:#D1352B;--amber:#FFB633}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:var(--ink);font-family:'Pretendard',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.5;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.015em}
.d8{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:800;letter-spacing:-.02em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:var(--grey);letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:var(--grey)}
.st{font-size:14px;line-height:1.2;color:var(--accent);font-weight:500;letter-spacing:.01em}
.tag{border:1px dotted var(--grey-2);padding:0 5px;font-size:14px;line-height:18px;color:var(--grey);margin-left:6px;display:inline-block;vertical-align:1px;letter-spacing:0;font-weight:400;font-family:'Pretendard',system-ui,sans-serif}
.tb{position:absolute;height:28px;line-height:30px;font-size:15px;letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
.tb.on{background:var(--tint-2);padding:0 10px}
.cta{position:absolute;height:36px;background:var(--ink);color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0 20px;font-size:15px;font-weight:500;letter-spacing:-.01em;white-space:nowrap}
.fld{position:absolute;height:28px;border:1px solid var(--line);display:flex;align-items:center;padding:0 10px;gap:8px;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;color:var(--ink)}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid var(--line);color:var(--ink);font-size:14px;white-space:nowrap;display:inline-block}
.chip.on{border-color:var(--accent);color:var(--accent);background:var(--tint-1)}
.tab{position:absolute;font-size:16px;letter-spacing:-.01em;color:var(--grey);white-space:nowrap;line-height:22px}
.tab .c{font-family:'Inter',system-ui,sans-serif;font-size:14px;color:var(--grey-2);margin-left:5px}
.tab.on{color:var(--ink)}
.tab.on .c{color:var(--accent)}
.det{position:absolute;height:20px;line-height:20px;padding:0 6px;font-family:'Inter',system-ui,sans-serif;font-size:14px;letter-spacing:.06em;color:#FFFFFF;background:var(--teal);white-space:nowrap}
</style></helmet>`;

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const UP = (s) => Math.max(14, s + 2);
const txt = (x, y, t, size = 13, col = INK, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;letter-spacing:-.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const num = (x, y, t, size = 13, col = INK, extra = '') => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;letter-spacing:.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const disp = (x, y, t, size, col = INK, extra = '') => `<div class="d" style="position:absolute;left:${x}px;top:${y}px;font-size:${UP(size)}px;line-height:1.1;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const lab = (x, y, t, extra = '') => `<div class="lab" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const st = (x, y, t, extra = '') => `<div class="st" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const tb = (x, y, t, on = false, extra = '') => `<div class="tb${on ? ' on' : ''}" style="left:${x}px;top:${y}px;${extra}">${t}</div>\n`;
const cta = (x, y, w, t) => `<div class="cta" style="left:${x}px;top:${y}px;width:${w}px">${t}</div>\n`;
const chev = (col = G) => `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${col}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const fld = (x, y, w, inner, extra = '') => `<div class="fld" style="left:${x}px;top:${y}px;width:${w}px;${extra}">${inner}</div>\n`;
const sel = (x, y, w, t, col = INK) => fld(x, y, w, `<span style="color:${col}">${t}</span><span style="flex:1"></span>${chev()}`);
const search = (x, y, w, ph) => fld(x, y, w, `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${G}" stroke-width="1.5" style="flex:none"><circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/></svg><span style="color:${C}">${ph}</span>`);
const chk = (x, y, on) => `<div style="position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border:1px solid ${on ? INK : C};background:${on ? INK : '#FFFFFF'}"></div>` + (on ? `<svg width="14" height="14" viewBox="0 0 14 14" style="position:absolute;left:${x}px;top:${y}px" fill="none" stroke="#FFFFFF" stroke-width="1.5"><path d="M3 7.2 6 10l5-6"/></svg>` : '') + '\n';
const brkIn = (w, h, col = INK, k = 12, sw = 1, x = 0, y = 0) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>`;
const img = (x, y, w, h, src, over = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#FFFFFF;${extra}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block">${over}</div>\n`;
const chip = (x, y, t, on = false) => `<span class="chip${on ? ' on' : ''}" style="position:absolute;left:${x}px;top:${y}px">${t}</span>\n`;
const pager = (x, y, cur = 1, last = 1) => txt(x, y, '처음', 12.5, G) + txt(x + 33, y, '이전', 12.5, G) +
  div(x + 66, y - 3, 20, 20, `border:1px solid ${INK};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:14px">${cur}</span>`) +
  (last > 1 ? num(x + 92, y, String(last), 12.5, G) : '') + txt(x + (last > 1 ? 110 : 94), y, '다음', 12.5, G) + txt(x + (last > 1 ? 143 : 127), y, '마지막', 12.5, G);
const svgPolys = (w, h, pts, fill = .12, sw = 1.2, col = TEAL) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none">` +
  pts.map(p => `<polygon points="${p}" fill="rgba(15,169,160,${fill})" stroke="${col}" stroke-width="${sw}" stroke-linejoin="miter"/>`).join('') + `</svg>`;
const svgDots = (w, h, pts, r = 3) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none">` +
  pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(15,169,160,.25)" stroke="${TEAL}" stroke-width="1"/>`).join('') + `</svg>`;
const det = (x, y, t, col = TEAL) => `<div class="det" style="left:${x}px;top:${y}px;background:${col}${col === AMB ? ';color:#010102' : ''}">${t}</div>`;
const ICONS = {
  close: '<path d="M4 4l12 12M16 4 4 16"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/>',
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c3 3 3 11 0 14M10 3c-3 3-3 11 0 14"/>',
  ruler: '<path d="M3 13 13 3l4 4L7 17z"/><path d="M8 8l2 2M11 5l2 2M5 11l2 2"/>',
  pen: '<path d="M4 16l2-6 7-7 4 4-7 7z"/><path d="M11 5l4 4"/>',
  download: '<path d="M10 3v10M6 9l4 4 4-4M3 17h14"/>',
  layers: '<path d="M10 3 3 7l7 4 7-4z"/><path d="M3 11l7 4 7-4"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',
  share: '<circle cx="5" cy="10" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/>',
  refresh: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M14 2v4h-4"/>',
  user: '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17a6.5 6.5 0 0 1 13 0"/>',
  lock: '<rect x="5" y="9" width="10" height="8"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>',
  edit: '<path d="M4 16l2-6 7-7 4 4-7 7z"/><path d="M11 5l4 4"/>',
  play: '<path d="M6 4l10 6-10 6z"/>',
  map: '<path d="M3 5l5-2 4 2 5-2v12l-5 2-4-2-5 2z"/><path d="M8 3v12M12 5v12"/>',
  move: '<path d="M10 2v16M2 10h16M7 5l3-3 3 3M7 15l3 3 3-3M5 7 2 10l3 3M15 7l3 3-3 3"/>',
  trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
  save: '<path d="M3 3h11l3 3v11H3z"/><path d="M6 3v5h7V3M6 17v-6h8v6"/>',
  chevU: '<path d="M4 12l6-6 6 6"/>',
};
const ico = (k, col = INK, sz = 16) => `<svg width="${sz}" height="${sz}" viewBox="0 0 20 20" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="butt" style="flex:none">${ICONS[k]}</svg>`;
const ibtn = (x, y, w, k, label = '', on = false, h = 32) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid ${on ? INK : H};background:${on ? T2 : '#FFFFFF'};display:flex;align-items:center;justify-content:${label ? 'flex-start' : 'center'};gap:7px;padding:0 ${label ? 9 : 0}px;font-size:14.5px;letter-spacing:-.01em;color:${INK};white-space:nowrap">${ico(k, INK, 15)}${label}</div>\n`;
function mapTools(x, y) {
  let s = '';
  ['search', 'globe', 'ruler', 'pen', 'download', 'layers'].forEach((k, i) => { s += div(x, y + i * 36, 36, 36, `background:#FFFFFF;border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center`, ico(k, INK, 16) + (k === 'layers' ? `<span class="lab" style="position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:14px;color:${INK}">LX</span>` : '')); });
  const y2 = y + 6 * 36 + 12;
  ['plus', 'minus'].forEach((k, i) => { s += div(x, y2 + i * 36, 36, 36, `background:#FFFFFF;border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center`, ico(k, INK, 16)); });
  return s;
}
const mapPlate = (x, y, w, h, src, over = '', oy = 0, ox = 0, title = '') => `<div title="${title}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#EEE"><img src="${src}" alt="" style="position:absolute;left:${ox}px;top:${oy}px;width:1384px;height:852px;display:block">${over}</div>\n`;
const dialog = (x, y, w, h, title, inner, tag = '') => div(x, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`) +
  disp(x + 20, y + 18, title + tag, 16) + `<div style="position:absolute;left:${x + w - 30}px;top:${y + 22}px">${ico('close', G, 12)}</div>\n` + hl(x + 20, y + 50, w - 40) + inner;
// 5단계 진행 틱(원본 대기·전처리중·분석중·후처리중·완료) — 말로 상태, 색은 액센트(진행) · 청록(완료) · warn(실패 = 재실행 조치)
const steps = (x, y, w, step, state = 'run') => {
  let s = div(x, y + 4, w, 1, `background:${H}`);
  const col = state === 'done' ? TEAL : state === 'fail' ? WARN : ACC;
  if (step > 1) s += div(x, y + 3, w * (step - 1) / 4, 3, `background:${col}`);
  for (let i = 0; i < 5; i++) { const cx = x + w * i / 4; const on = i < step; s += div(cx - 3, y + 1, 7, 7, `background:${i + 1 === step ? col : on ? col : '#FFFFFF'};border:1px solid ${on ? col : C}`); }
  return s;
};

// 대한민국 외곽선(landxi/assets/data/geo/korea-outline.geojson) → 등장방형 투영 SVG · 마커 = 아카이브 위치
const KOREA = JSON.parse(fs.readFileSync(path.join(root, 'landxi/assets/data/geo/korea-outline.geojson'), 'utf8')).features[0].geometry.coordinates;
function koreaSvg(w, h, marks) {
  const LON0 = 124.6, LON1 = 131.0, LAT0 = 33.1, LAT1 = 38.7, k = Math.cos(36 * Math.PI / 180);
  const sc = Math.min(w / ((LON1 - LON0) * k), h / (LAT1 - LAT0));
  const ox = (w - (LON1 - LON0) * k * sc) / 2, oy = (h - (LAT1 - LAT0) * sc) / 2;
  const P = ([lo, la]) => [ox + (lo - LON0) * k * sc, oy + (LAT1 - la) * sc];
  let d = '';
  for (const poly of KOREA) for (const ring of poly) {
    if (ring.length < 40) continue;
    d += ring.filter((_, i) => i % 2 === 0).map((c, i) => (i ? 'L' : 'M') + P(c).map(v => v.toFixed(1)).join(' ')).join('') + 'Z';
  }
  let m = '';
  for (const [lo, la, t, on, dx = 10] of marks) { const [x, y] = P([lo, la]); m += `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" fill="${on ? ACC : 'none'}" stroke="${on ? ACC : TEAL}" stroke-width="1.5"/><text x="${(x + dx).toFixed(1)}" y="${(y + 5).toFixed(1)}" font-size="14" font-family="Pretendard,system-ui" fill="${on ? ACC : INK}">${t}</text>`; }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block"><path d="${d}" fill="#FFFFFF" stroke="${G}" stroke-width=".8" stroke-linejoin="miter"/>${m}<text x="10" y="22" font-size="14" font-family="Inter,system-ui" fill="${G}" letter-spacing=".04em">124.6–131.0 E · 33.1–38.7 N</text></svg>`;
}

// ---------- 공통 조각 ----------
const page = (title, body, h = 900) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${HELMET}
<div style="width:1440px;height:${h}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard',system-ui,sans-serif;color:#010102">
${RAIL}${vl(72, 0, h)}${body}</div>
</x-dc>
</body>
</html>
`;
const FOOT = hl(72, 866, 1368) + txt(X0, 876, 'LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부', 12, G);
// 마스트헤드 64 — 대시보드와 같은 공지 스트립 + 기준일
const MAST = `<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
<span class="chip" style="color:${G}">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span class="mic">기준일 현재</span>
<span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.08.27</span>
</div>
` + hl(72, 64, 1368);
// 타이틀 34 + 파랑 룰 4 + 원본 3탭(분석 실행 · 실행중 · 완료)을 세그먼트로 — 서비스 목록 탭 1 추가는 원본 진입점(카드 없음) 대체
const SEGS = [['서비스', '15'], ['분석 실행', ''], ['실행중', '3'], ['완료', '7']];
function segs(x, y, active, right = true) {
  let s = '', cx = x;
  for (const [t, c] of SEGS) {
    const on = t === active;
    const w = t.length * 16 + (c ? 22 : 0) + 4;
    s += `<div class="tab${on ? ' on' : ''}" style="left:${cx}px;top:${y}px">${t}${c ? `<span class="c">${c}</span>` : ''}</div>\n`;
    if (on) s += div(cx, y + 28, w - 4, 2, `background:${INK}`);
    cx += w + 28;
  }
  return s;
}
function head(active, sub) {
  let s = MAST;
  s += `<div style="position:absolute;left:${X0}px;top:92px;display:flex;align-items:baseline;gap:16px"><span class="d" style="font-size:34px;line-height:40px">분석 서비스</span><span style="font-size:17px;color:${G};letter-spacing:-.01em;margin-left:14px">${sub}</span></div>\n`;
  s += div(X0, 140, 118, 4, `background:${ACC}`) + hl(X0, 156, CW);
  s += segs(908, 104, active);
  return s;
}

// ======================================================================
// 1. B5-Analysis-List — 카드 그리드(좌 3열 · 이미지 + 이름 + 부처만) + 우 정보 패널(선택 카드) · 숫자는 우 패널 안에만
// 발주(2026-08-27): "분석서비스 메인은 아래는 이미지와 카드 형태로 한다. 숫자 건 추정 이런 것도 필요 없고.
//   메인은 그냥 카드 서비스만 펼쳐 놓는거다. 그리고 카드를 클릭하면 오른쪽에 카드 정보를 표출한다."
// ======================================================================
// 카드 이미지 — 실측 5 = 결과 크롭(청록 도형은 손으로 옮긴 근사, NOTES §19 유보 ③) · 준비 중 10 = 대상 지역 정사영상 크롭(점선 판 0)
const EV = {
  marine: { src: 'tile-arc-yeosu-air.jpg', over: svgDots(244, 84, [[158, 20], [170, 16], [184, 26], [196, 20], [178, 36], [166, 30], [204, 32], [212, 22], [190, 44], [152, 34], [218, 40], [174, 50], [198, 52]], 3) },
  farmland: { src: 'tile-farm-clean.jpg', over: svgPolys(244, 84, ['22,46 108,14 150,36 62,72', '70,76 160,42 204,64 112,96', '150,6 220,0 244,24 176,42']) },
  pothole: { src: 'pj-road.jpg', over: brkIn(30, 20, TEAL, 6, 1, 98, 40) + brkIn(24, 16, TEAL, 5, 1, 146, 22) + brkIn(26, 18, TEAL, 6, 1, 62, 64) },
  change: { src: 'ev-change.jpg', over: '' },
  greenhouse: { src: 'tile-gh-clean.jpg', over: svgPolys(244, 84, ['76,-10 94,-10 102,106 84,106', '96,-10 114,-10 122,106 104,106', '126,-10 144,-10 151,106 134,106']) },
  greenbelt: { src: 'tile-ep-4.jpg', over: '' },
  solar: { src: 'pj-jeju2020.jpg', over: '' },
  feedcrop: { src: 'crop-farm-1.jpg', over: '' },
  incinerator: { src: 'tile-kuksan-1.jpg', over: '' },
  building: { src: 'tile-ep-2.jpg', over: '' },
  silage: { src: 'crop-farm-6.jpg', over: '' },
  trash: { src: 'tile-arc-a.jpg', over: '' },
  river: { src: 'tile-arc-hid.jpg', over: '' },
  forest: { src: 'tile-ep-1.jpg', over: '' },
  carbon: { src: 'pj-land.jpg', over: '' },
};
// 선택 카드(남원 농지이용) 정보 — results.js namwon-farmland-2025 · dashboard.js backbone XI-VFM v2.1
const SEL = {
  id: 'farmland', name: '농지이용·불법건축물', min: '농림축산식품부',
  what: '농경지 / 비경작지 필지 단위 이용 분류 · 드론 정사영상 + AI 세그멘테이션 · PNU 필지 경계 결합',
  kv: [
    ['모델', 'XI-VFM v2.1 · 서비스 모델 v3'],
    ['입력 영상', '드론 정사영상 · GSD 1.08 cm'],
    ['산출물', 'GeoJSON · GPKG · XLSX(필지 행정정보)'],
    ['최근 실행', '2026.06.08 · 남원 농경지 2025.04'],
    ['결과', '2,098 필지 · 315.9 ha · 경작지 1,291 · 비경작지 807'],
    ['평균 신뢰도', '0.45 · 중앙값 0.41'],
  ],
};
function list() {
  let s = head('서비스', '부처 6 · 서비스 15');
  // 좌 열 128–900(772 · 61 %) · 세로 헤어라인 x 916 · 우 패널 940–1384(444 · 35 %)
  const LW = 772, LX = X0, LE = X0 + LW, PX = 940, PW = 444, TOP = 172;
  // 부처 필터 칩(원본 보기 필터) + 검색 — 칩에 수 0
  const M = ['전체', '농식품부', '국토부', '환경부', '산림청', '해수부', '산업부', 'LX'];   // 부처 약칭(칩) · 카드는 정식 명칭
  let cx = LX;
  M.forEach((m, i) => { s += chip(cx, TOP, m, i === 0); cx += m.length * 14.5 + 28; });
  s += search(LE - 168, TOP - 2, 168, '서비스명 · 부처');
  // 카드 15 — 3열 × 5행 · 244×96 이미지 + 이름 + 부처 (그 외 0)
  const CWd = 244, GX = 20, IH = 84, PITCH = 130, GY = TOP + 36;
  SERVICES.forEach(([id, name, min], i) => {
    const x = LX + (i % 3) * (CWd + GX), y = GY + Math.floor(i / 3) * PITCH, ev = EV[id], on = id === SEL.id;
    if (on) s += div(x - 6, y - 6, CWd + 12, PITCH - 2, `background:${T1}`);
    s += img(x, y, CWd, IH, ev.src, ev.over + (on ? brkIn(CWd, IH, ACC) : ''), `outline:1px solid ${on ? ACC : H}`);
    s += disp(x, y + IH + 7, name, 14, INK, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
    s += txt(x, y + IH + 27, min, 12, G, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
  });
  s += vl(916, TOP - 8, 866 - TOP + 8 - 16);
  // 우 패널 — 선택 카드 정보(선택 0 = `서비스 15` + 점선 틀, 판 미작성 · NOTES §19.2)
  let y = TOP;
  s += lab(PX, y, '선택') + disp(PX + 44, y - 4, SEL.name, 18) ;
  s += txt(PX, y + 28, SEL.min, 13, G);
  y += 58;
  s += img(PX, y, PW, 250, EV[SEL.id].src, `<svg width="${PW}" height="250" viewBox="0 0 244 84" preserveAspectRatio="none" style="position:absolute;left:0;top:0;display:block;pointer-events:none">${EV[SEL.id].over.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>` + brkIn(PW, 250, TEAL, 14, 1, 0, 0), `outline:1px solid ${H}`);
  y += 250 + 14;
  s += txt(PX, y, SEL.what, 12.5, INK, `width:${PW}px;white-space:normal;line-height:1.45`);
  y += 52;
  s += hl(PX, y, PW);
  SEL.kv.forEach(([k, v], i) => {
    const ry = y + 1 + i * 34;
    s += lab(PX, ry + 10, k) + txt(PX + 96, ry + 8, v, 12.5, INK, `width:${PW - 96}px;overflow:hidden;text-overflow:ellipsis`) + hl(PX, ry + 33, PW);
  });
  y += 1 + SEL.kv.length * 34 + 22;
  // 액션 — 헤어라인 2 + 검정 CTA 1(화면당 1 · 툴바 CTA 없음)
  s += div(PX, y, 108, 36, `border:1px solid ${H};display:flex;align-items:center;justify-content:center;font-size:15px;letter-spacing:-.01em`, '결과 보기');
  s += div(PX + 120, y, 108, 36, `border:1px solid ${H};display:flex;align-items:center;justify-content:center;font-size:15px;letter-spacing:-.01em`, '실행 이력');
  s += cta(PX + PW - 120, y, 120, '분석 실행');
  s += FOOT;
  return page('B5 · 분석 서비스 — 서비스', s);
}

// ======================================================================
function result() {
  let s = MAST;
  // 압축 타이틀 행 64–120
  s += disp(X0, 80, '분석 서비스', 20) + txt(X0 + 118, 84, '남원시 농지이용 현황 · 2,098 필지', 13.5, G) + segs(908, 84, '완료') + hl(72, 120, 1368);
  const MY = 121, MH = 745, OY = -60, OX = 0, LW = 360, RW = 400, RX = 1440 - RW;
  // 지도 — 스캔선 x 700(1384 좌표): 왼쪽 = 결과 현상, 오른쪽 = 정사영상만
  const SX = 700;
  const polys = ['520,20 740,10 700,150 620,210', '615,215 700,210 700,350 680,360', '330,500 560,600 500,720 260,650', '20,330 150,400 130,480 0,430', '540,620 700,690 640,830 470,760', '390,300 520,330 480,420 350,390'];
  const cls = [[540, 160, '경작지'], [420, 560, '비경작지'], [400, 350, '경작지'], [560, 700, '경작지']];
  let over = `<svg width="1384" height="852" viewBox="0 0 1384 852" style="position:absolute;left:${OX}px;top:${OY}px;display:block;pointer-events:none">` +
    `<rect x="${SX - 36}" y="0" width="36" height="852" fill="rgba(15,169,160,.10)"/>` +
    `<line x1="${SX}" y1="0" x2="${SX}" y2="852" stroke="${TEAL}" stroke-width="1.5"/>` +
    polys.map(p => `<polygon points="${p}" fill="rgba(15,169,160,.14)" stroke="${TEAL}" stroke-width="1.5" stroke-linejoin="miter"/>`).join('') +
    `</svg>`;
  cls.forEach(([x, y, t]) => { over += `<div class="n" style="position:absolute;left:${x + OX}px;top:${y + OY}px;height:18px;line-height:20px;padding:0 5px;background:${TEAL};color:#FFFFFF;font-size:14px;letter-spacing:.02em;white-space:nowrap">${t}</div>`; });
  // 스캔선을 막 지난 필지 = 브래킷 + 앰버 DETECTED(탐지 순간 380 ms — 이 판은 그 순간의 정지 프레임)
  over += brkIn(100, 160, AMB, 14, 1.5, 605 + OX, 205 + OY) + det(612 + OX, 372 + OY, 'DETECTED', AMB);
  over += brkIn(92, 176, TEAL, 14, 1, 600 + OX, 630 + OY);
  // 스캔선 틱 룰러(진행률)
  over += `<div class="n" style="position:absolute;left:${SX + OX + 8}px;top:${MH - 64}px;font-size:14px;letter-spacing:.06em;color:${TEAL};white-space:nowrap">SCAN 58 %</div>`;
  s += mapPlate(72, MY, 1368, MH, 'pj-map-analysis.jpg', over, OY, OX, '남원 농경지 2025.06 · 드론 · GSD 1.69 cm · 결과 namwon-farmland-2025 (results.js) · 원본 배경 V-World → 정사영상 대체');
  // HUD 카운트업(중간 상태) — 지도 상단 중앙
  const HX = 72 + LW + 24, HY = MY + 16;
  s += div(HX, HY, 1040 - LW - 24 - 36 - 36 - 16, 60, 'pointer-events:none');
  s += tb(HX, HY, '정사영상', false, 'height:32px;line-height:34px;padding:0 12px;background:#FFFFFF;border:1px solid #DDDDDD;color:#686868') + tb(HX + 88, HY, '결과', true, 'height:32px;line-height:34px;padding:0 12px;border:1px solid #D6E6FF');
  s += cta(HX + 156, HY - 2, 92, '결과 편집');
  s += `<div style="position:absolute;left:${HX + 272}px;top:${HY - 2}px;padding:6px 12px 8px;background:#FFFFFF;white-space:nowrap"><div style="display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:30px;line-height:1;color:${ACC}">1,216</span><span class="n" style="font-size:15px;color:${G}">/ 2,098 필지</span></div><div class="lab" style="margin-top:4px">탐지 현상 중 · 58 %</div></div>\n`;
  s += mapTools(RX - 16 - 36, MY + 16);
  // 하단 행정정보 표 띠(원본: 연번 · 시도 · 시군구 · 읍면동 · 리 · 산 · 본번 · 부번 · 탐지 클래스 · 면적 ㎡ · 총 10건 중 1~10행 · 검색 · 접기)
  const BY = MY + MH - 40;
  s += div(72 + LW + 1, BY, 1440 - LW - RW - 1, 40, `background:#FFFFFF;border-top:1px solid ${H}`);
  s += disp(HX, BY + 11, '필지 행정정보', 13) + num(HX + 100, BY + 12, '총 10건 중 1~10행 · 연번 · 시도 · 시군구 · 읍면동 · 본번 · 부번 · 클래스 · 면적 ㎡', 12, G, `width:${RX - 16 - 36 - 130 - HX - 100}px;overflow:hidden;text-overflow:ellipsis`);
  s += txt(RX - 16 - 36 - 120, BY + 11, '검색 · 펼치기 ⌃', 12.5, G);
  // 좌 드로어 360 — 실행중 3 + 완료 7 (원본 2탭을 한 드로어에 적층 · 칩 4 · 소유 토글 · 새로고침 · 검색)
  s += div(72, MY, LW, MH, 'background:#FFFFFF') + vl(72 + LW, MY, MH, INK);
  const LI = 88, LIW = LW - 32;
  s += disp(LI, MY + 18, '실행중', 15) + num(LI + 58, MY + 20, '3', 14, ACC);
  s += ibtn(LI + LIW - 96, MY + 12, 28, 'user', '', false, 28) + ibtn(LI + LIW - 64, MY + 12, 28, 'refresh', '', false, 28) + ibtn(LI + LIW - 32, MY + 12, 28, 'search', '', false, 28);
  let cx = LI;
  [['전체', true], ['대기 중'], ['처리 중'], ['처리 실패']].forEach(([t, on]) => { s += chip(cx, MY + 50, t, on); cx += t.length * 14.5 + 28; });
  const runs = [
    ['2026년 4월 주천면 비닐하우스 현황 조사', '비닐하우스 탐지 · 2026.04.09', 'tile-gh-clean.jpg', 3, 'run', '처리 중 3/5'],
    ['2026년 3월 아영면 농지 활용 분석', '농지 활용 분석 · 2026.04.08', 'tile-farm-clean.jpg', 3, 'fail', '처리 실패'],
    ['2026년 3월 금지면 사료작물 생산 현황', '사료작물(생산기) · 2026.04.03', 'pj-hero.jpg', 1, 'run', '대기 중 1/5'],
  ];
  runs.forEach(([n, m, src, step, stt, word], i) => {
    const y = MY + 96 + i * 78;
    s += img(LI, y, 72, 40, src) + disp(LI + 84, y - 2, n, 13, INK, `width:${LIW - 84}px;overflow:hidden;text-overflow:ellipsis`) + txt(LI + 84, y + 18, m + '<span class="tag">시연</span>', 12, G);
    s += steps(LI + 84, y + 44, LIW - 84 - 96, step, stt) + `<div class="st" style="position:absolute;left:${LI + LIW - 88}px;top:${y + 40}px;width:88px;text-align:right;color:${stt === 'fail' ? WARN : stt === 'done' ? TEAL : ACC}">${word}</div>\n`;
    s += hl(LI, y + 62, LIW);
  });
  const DY = MY + 96 + 3 * 78 + 8;
  s += disp(LI, DY, '완료', 15) + num(LI + 40, DY + 2, '7', 14, ACC) + txt(LI + 60, DY + 3, '내 것 · 공유 받은 것', 12, G);
  s += ibtn(LI + LIW - 96, DY - 6, 28, 'user', '', false, 28) + ibtn(LI + LIW - 64, DY - 6, 28, 'refresh', '', false, 28) + ibtn(LI + LIW - 32, DY - 6, 28, 'search', '', false, 28);
  const dones = [
    ['남원시 농지이용 현황', '농지이용·불법건축물 · 2025.06 · 82분', 'tile-farm-clean.jpg', true, '2,098 필지'],
    ['남원시 비닐하우스 조사', '비닐하우스 현황 · 2025.06 · 58분', 'tile-gh-clean.jpg', false, '1,674 필지'],
    ['여수시 해양쓰레기 조사(항공)', '해양쓰레기 · 2025 · 77분', 'tile-arc-yeosu-air.jpg', false, '1,860 건'],
    ['여수시 해양쓰레기 조사(드론)', '해양쓰레기 · 2026 · 35분', 'tile-yeosu-drone-clean.jpg', false, '2,078 건'],
    ['2026년 4월 도통동 도로 정기 점검', '도로안전 정사영상 · 2026.04.15', 'pj-road.jpg', false, '시연'],
    ['2026년 4월 운봉읍 사료작물 생육 현황', '사료작물(생육기) · 2026.04.10', 'pj-land.jpg', false, '시연'],
    ['2026년 3월 사매면 방치 쓰레기 탐지', '방치 쓰레기 탐지 · 2026.04.07', 'tile-kuksan-1.jpg', false, '시연'],
  ];
  dones.forEach(([n, m, src, on, cnt], i) => {
    const y = DY + 34 + i * 54;
    if (on) s += div(73, y - 7, LW - 1, 54, `background:${T1}`);
    s += img(LI, y, 72, 40, src, on ? brkIn(72, 40, ACC, 8) : '') + disp(LI + 84, y - 1, n, 13, INK, `width:${LIW - 84 - 80}px;overflow:hidden;text-overflow:ellipsis`) + txt(LI + 84, y + 19, m, 11.5, G, `width:${LIW - 84 - 80}px;overflow:hidden;text-overflow:ellipsis`);
    s += (cnt === '시연' ? `<span class="tag" style="position:absolute;left:${LI + LIW - 40}px;top:${y + 12}px">시연</span>\n` : `<div class="st" style="position:absolute;left:${LI + LIW - 80}px;top:${y + 12}px;width:80px;text-align:right;color:${on ? ACC : TEAL}">${cnt}</div>\n`);
    if (i < 6) s += hl(LI + 84, y + 46, LIW - 84);
  });
  // 우 드로어 400 — 결과 요약
  s += div(RX, MY, RW, MH, 'background:#FFFFFF') + vl(RX, MY, MH, INK);
  const RI = RX + 24, RIW = RW - 48;
  s += lab(RI, MY + 16, '분석명') + `<div style="position:absolute;left:${RI + 300}px;top:${MY + 14}px">${ico('edit', G, 14)}</div>\n` + `<div style="position:absolute;left:${RX + RW - 30}px;top:${MY + 16}px">${ico('chevU', G, 12)}</div>\n`;
  s += disp(RI, MY + 34, '남원시 농지이용 현황', 20) + txt(RI, MY + 62, '농지이용·불법건축물 · <span style="color:#0FA9A0">처리 완료</span> · 드론 2025.06', 13, G);
  s += hl(RI, MY + 90, RIW);
  const kv = [['시작 · 종료', '2026.04.22 09:14 → 10:36 <span class="tag">시연</span>'], ['소요', '82분 <span class="tag">시연</span>'], ['공유 권한', 'LX 관리자 · 남원시청 관리자'], ['정사영상', '남원 농경지 2025.06 · 1.69 cm · 0.62 km²']];
  kv.forEach(([k, v], i) => { const y = MY + 102 + i * 28; s += lab(RI, y + 2, k) + txt(RI + 84, y, v, 12.5, INK, `width:${RIW - 84}px;overflow:hidden;text-overflow:ellipsis`); });
  s += hl(RI, MY + 218, RIW);
  // 큰 수 2 — 필지 수 액센트 · 면적 잉크
  s += `<div style="position:absolute;left:${RI}px;top:${MY + 236}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:48px;line-height:1;letter-spacing:-.02em;color:${ACC}">${fmt(FARM.count)}</span><span style="font-size:16px;color:${G}">필지</span></div>\n`;
  s += `<div style="position:absolute;left:${RI + 200}px;top:${MY + 236}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:48px;line-height:1;letter-spacing:-.02em">${FARM.ha.toFixed(1)}</span><span style="font-size:16px;color:${G}">ha</span></div>\n`;
  s += lab(RI, MY + 294, '탐지 필지') + lab(RI + 200, MY + 294, '면적 합계');
  // 클래스 막대(charts.html 헤어라인 문법)
  s += lab(RI, MY + 326, '클래스') + num(RI + 52, MY + 326, '2 · 경작지 61.5 % · 비경작지 38.5 %', 12, C);
  FARM.cls.forEach(([c, n], i) => {
    const y = MY + 350 + i * 30, w = Math.round((RIW - 120) * n / FARM.count);
    s += txt(RI, y, c, 13) + div(RI + 76, y + 8, RIW - 120, 3, `background:${H}`) + div(RI + 76, y + 8, w, 3, `background:${i ? INK : TEAL}`) + num(RI + RIW - 40, y, fmt(n), 13, INK, 'width:40px;text-align:right');
  });
  // 신뢰도 테이프 게이지 — confHist 10빈 · 평균 0.45 액센트 틱 · 중앙값 0.41
  const TY = MY + 420;
  s += lab(RI, TY, '신뢰도') + num(RI + 52, TY, `평균 ${FARM.confMean.toFixed(2)} · 중앙값 ${FARM.confMedian.toFixed(2)} · 0.10–0.97`, 12, C);
  const mx = Math.max(...FARM.hist), bw = (RIW - 9 * 3) / 10;
  FARM.hist.forEach((v, i) => { const h = Math.round(44 * v / mx); s += div(RI + i * (bw + 3), TY + 24 + 44 - h, bw, h, `background:${i >= 4 ? TEAL : H}`); });
  s += div(RI, TY + 68, RIW, 1, `background:${INK}`);
  for (let i = 0; i <= 10; i++) s += div(RI + i * (RIW / 10), TY + 68, 1, i % 5 ? 4 : 8, `background:${INK}`);
  s += num(RI, TY + 78, '0', 11, G) + num(RI + RIW / 2 - 8, TY + 78, '0.5', 11, G) + num(RI + RIW - 12, TY + 78, '1.0', 11, G);
  const mxp = RI + RIW * FARM.confMean; s += div(mxp, TY + 20, 2, 52, `background:${ACC}`) + num(mxp + 6, TY + 22, '0.45', 11, ACC);
  s += hl(RI, TY + 104, RIW);
  // 공유 설정 · 다운로드 · 수정 — 헤어라인 버튼 (원본 공유 모달 · 수정 · 결과 편집 · 하단 표 = 파리티 §19.1)
  s += ibtn(RI, TY + 118, 112, 'share', '공유 설정') + ibtn(RI + 124, TY + 118, 128, 'download', '다운로드') + ibtn(RI + 264, TY + 118, 88, 'edit', '수정');
  s += num(RI, TY + 160, 'GeoJSON · GPKG (EPSG:5186) · 결과 편집 = 지도 상단', 12, C);
  s += txt(RI, TY + 186, '삭제', 12.5, G) + txt(RI + 48, TY + 186, '새로 분석하기 ›', 12.5, G);
  s += FOOT;
  return page('B5 · 분석 서비스 — 결과', s);
}


wr('B5-Analysis-List.dc.html', list());
wr('B5-Analysis-Result.dc.html', result());

// ======================================================================
// 2·3. B5-Analysis-Run-Review · B5-Analysis-Run-Progress — 분석 실행 3화면 중 1 · 2 (3 = Result)
// 발주(2026-08-27): "분석 서비스 실행 검토 실행중 실행결과 3화면 이 있어야 될 것 같고. 영상선택 실행검토 실행중 모두
//   좀 화면이 어지럽다 핵심만 정제되어야 할 것 같다" → 단계 5판(Run-1…5) · 워크플로우 Run 판 폐기, 3화면으로 통합(NOTES §19.6).
//   규칙: 블록당 큰 물체 1 + 한 줄 · 노드 레일 0 · 파라미터 칩 0(원본에 없음) · 지도 0 · 로그 0 · 타일 스트립 0 · 검정 CTA ≤ 1.
// ======================================================================
const hbtn = (x, y, w, t, col = INK, bd = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:36px;border:1px solid ${bd};display:flex;align-items:center;justify-content:center;font-size:15px;letter-spacing:-.01em;color:${col};white-space:nowrap">${t}</div>\n`;
const TAG = (t = '시연') => `<span class="tag">${t}</span>`;
// 선택값 — 원본 픽커 시드 그대로(과제 비닐하우스 · 모델 v5 · 영상 namwon_2506) · 기반 XI-VFM v2.1 = dashboard.js
const TASK = ['greenhouse', '비닐하우스 현황', '농림축산식품부', '동 폴리곤 · 필지 결합 · GPKG', 'tile-gh-clean.jpg'];
const MODEL = ['v5', '단동/연동 분리', '2026.05.20', .82, .87];   // IoU · F1 = 시연(§19.5 유보 ⑪)
const IMG_SEL = { id: 'namwon_2506', label: '남원 농경지 · 2025.06', kind: '드론', gsd: '1.69 cm', src: 'tile-gh-clean.jpg' };   // imagery.js
const AREA = '0.62 km²';                       // imagery.js bounds 0.78 × 0.79 km
const STEPS5 = ['전처리', '추론', '후처리', '벡터화', '저장'];
const LW = 776, RX = 960, RI = 984, RIW = 376;   // 좌 본문 128–904 · 우 패널 960–1384(안쪽 984–1360)
const link = (x, y, t) => txt(x, y, t + ' ›', 13, G, 'text-align:right;width:160px');


// 우 패널 424 — 타이틀 + 상태어 · kv 행(라벨 84 + 값) · 헤어라인
function panel(title, state, rows, y0 = 226) {
  let s = div(RX, 156, 424, 744, 'background:#FFFFFF') + vl(RX, 156, 744, INK);
  s += disp(RI, 178, title, 20) + num(RI + (title.length * 20 + 12), 184, state, 13, ACC) + hl(RI, 214, RIW);
  let y = y0;
  rows.forEach(([k, v]) => { s += lab(RI, y + 1, k) + txt(RI + 84, y - 1, v, 13, INK, `width:${RIW - 84}px;overflow:hidden;text-overflow:ellipsis`) + hl(RI, y + 34, RIW); y += 35; });
  return { s, y };
}

// 회백 베이스맵 소지도 — sigungu.geojson(실좌표) 회백 면 + 흰 경계 + 시군구 라벨 · 풋프린트 = imagery.js bounds (§19.5 Run-3 판에서 복원)
const SIGUNGU = JSON.parse(fs.readFileSync(path.join(root, 'landxi/assets/data/geo/sigungu.geojson'), 'utf8')).features;
function greyMap(w, h, box, foots, labels) {
  const [LON0, LAT0, LON1, LAT1] = box, k = Math.cos(35.6 * Math.PI / 180);
  const sc = Math.min(w / ((LON1 - LON0) * k), h / (LAT1 - LAT0));
  const ox = (w - (LON1 - LON0) * k * sc) / 2, oy = (h - (LAT1 - LAT0) * sc) / 2;
  const P = ([lo, la]) => [ox + (lo - LON0) * k * sc, oy + (LAT1 - la) * sc];
  let d = '';
  for (const f of SIGUNGU) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) for (const ring of poly) {
      if (!ring.some(([lo, la]) => lo > LON0 - .3 && lo < LON1 + .3 && la > LAT0 - .3 && la < LAT1 + .3)) continue;
      d += ring.map((c, i) => (i ? 'L' : 'M') + P(c).map(v => v.toFixed(1)).join(' ')).join('') + 'Z';
    }
  }
  let m = `<path d="${d}" fill="#E6E6E6" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="miter"/>`;
  for (const [lo, la, t] of labels) { const [x, y] = P([lo, la]); m += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="13" font-family="Pretendard,system-ui" fill="#8A8A8A" text-anchor="middle">${t}</text>`; }
  for (const [b, t, kind, dx = 12, dy = 4] of foots) {
    const [x0, y0] = P([b[0], b[3]]), [x1, y1] = P([b[2], b[1]]);
    const bw = Math.max(x1 - x0, 10), bh = Math.max(y1 - y0, 10);
    const col = kind === 'on' ? ACC : kind === 'city' ? G : TEAL;
    m += `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${kind === 'on' ? 'rgba(0,109,247,.9)' : kind === 'city' ? 'none' : 'rgba(15,169,160,.25)'}" stroke="${col}" stroke-width="1.5"${kind === 'city' ? ' stroke-dasharray="4 3"' : ''}/>`;
    const tx = kind === 'city' ? x0 + 6 : kind === 'on' ? x0 : x0 + bw + dx, ty = kind === 'city' ? y0 + bh - 8 : kind === 'on' ? y0 + bh + 18 : y0 + bh / 2 + dy;
    m += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="14" font-family="Pretendard,system-ui" fill="${col}">${t}</text>`;
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block"><rect width="${w}" height="${h}" fill="#F4F4F4"/>${m}<text x="10" y="22" font-size="14" font-family="Inter,system-ui" fill="${G}" letter-spacing=".04em">${LON0}–${LON1} E · ${LAT0}–${LAT1} N</text></svg>`;
}

// 선택 영상 2 — imagery.js namwon_2506 · namwon_2508 (같은 풋프린트 0.78 × 0.79 km = 0.62 km² 씩 · 합 1.24 km²)
const SEL_IDS = ['namwon_2506', 'namwon_2508'];
const SEL_IMGS = SEL_IDS.map(id => { const r = IMAGERY.find(x => x[0] === id); return { id, label: r[1], kind: r[2], gsd: r[3], src: r[4] }; });
const AREA_EACH = 0.62, AREA_SUM = (AREA_EACH * SEL_IMGS.length).toFixed(2) + ' km²';
const NAMWON_MAP = (w, h) => greyMap(w, h, [126.9, 35.2, 127.75, 35.95],
  [[[127.182606, 35.302858, 127.637309, 35.561786], '남원 전역 ×2 · 항공 2 m', 'city'],
   [[126.973996, 35.825613, 126.992145, 35.838284], '국산리 ×2', 'teal', 12, 24],
   [[127.3481, 35.5276, 127.3567, 35.5347], `남원 농경지 ×4 · 선택 ${SEL_IMGS.length}`, 'on']],
  [[127.56, 35.37, '남원시'], [127.28, 35.66, '임실군'], [127.63, 35.78, '장수군'], [127.0, 35.5, '순창군']]);

// 1 · 실행 검토 — 발주(2026-08-27): "분석 실행은 어떤 영상을 넣을거냐 이게 중요한거지. 영상 불러오기 영상 업로드 이런게 필요하지"
//   → 좌 = 01 영상 블록이 첫째·가장 큼(아카이브 픽커 열림: 탭 4 · 검색 · 실썸네일 6/11 · 체크 2 · 페이지 1·2 + 회백 풋프린트 지도 + 영상 업로드 드롭존)
//     02 과제 · 03 모델 = 아래 압축 블록 2(한 줄 + 변경 ›) · 우 = 실행 요약 kv 7 + 검정 CTA 1
function runReview() {
  let s = head('분석 실행', `실행 검토 · ${TASK[1]} · 영상 ${SEL_IMGS.length}`);
  // 01 영상 — 두 입구: 아카이브에서 불러오기(활성 · 픽커 열림) · 영상 업로드(드롭존 · 데이터 관리 업로드와 같은 기능)
  let y = 172;
  s += lab(X0, y, '01 영상') + num(X0 + 58, y - 1, `선택 ${SEL_IMGS.length} · ${AREA_SUM}`, 13, ACC);
  s += tb(X0 + 220, y - 8, '아카이브에서 불러오기', true) + tb(X0 + 384, y - 8, '영상 업로드', false, `color:${G}`);
  s += search(X0 + LW - 168, y - 6, 168, '영상명 · 지역');
  // 픽커(좌 456) — 탭 4 · 썸네일 3열 × 2행(11 중 1~6) · 페이지
  const PY = y + 36, PW = 456;
  ['전체', '최근', '공유', '내 영상'].forEach((t, i) => s += tb(X0 + i * 70, PY, t, i === 0));
  s += num(X0 + PW - 90, PY + 6, '아카이브 11', 12.5, G, 'width:90px;text-align:right');
  s += hl(X0, PY + 34, PW);
  IMAGERY.slice(0, 9).forEach(([id, label, kind, gsd, src], i) => {
    const x = X0 + (i % 3) * 156, ty = PY + 50 + Math.floor(i / 3) * 124, on = SEL_IDS.includes(id);
    if (on) s += div(x - 6, ty - 6, 156, 114, `background:${T1}`);
    s += img(x, ty, 144, 81, src, on ? brkIn(144, 81, ACC) : '', `outline:1px solid ${H}`) + chk(x + 124, ty + 6, on);
    s += txt(x, ty + 86, label, 12, on ? INK : G, 'width:144px;overflow:hidden;text-overflow:ellipsis') + num(x, ty + 104, on ? `${gsd} · ${AREA_EACH} km²` : `${kind} · ${gsd}`, 11, on ? ACC : C);
  });
  const PGY = PY + 50 + 3 * 124 + 4;
  s += hl(X0, PGY, PW) + pager(X0, PGY + 12, 1, 2) + num(X0 + PW - 90, PGY + 12, '11건 중 1~9', 12, G, 'width:90px;text-align:right');
  // 우 296 — 회백 풋프린트 지도 + 영상 업로드 드롭존(데이터 관리 업로드 타일 문법 그대로 · 링크만)
  const MX = X0 + 480, MW = 296, MH = 300;
  s += div(MX, PY, MW, MH, 'overflow:hidden', NAMWON_MAP(MW, MH)) + brkIn(MW, MH, INK, 12, 1, MX, PY);
  s += num(MX, PY + MH + 8, '선택 범위 127.348–127.357 E · 35.528–35.535 N', 11.5, G);
  const UY = PY + MH + 34, UH = PGY + 30 - UY;
  s += div(MX, UY, MW, UH, `border:1px dashed ${C}`, `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center">
<svg width="18" height="18" viewBox="0 0 22 22" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter"><path d="M11 2v13M5.5 9.5 11 15l5.5-5.5"/><path d="M3 19.25h16"/></svg>
<div style="font-size:15px;letter-spacing:-.014em;color:${INK}">영상 업로드 — 끌어다 놓거나 클릭</div>
<div class="n" style="font-size:14px;letter-spacing:.03em;color:${G}">최대 1 TB · ECW TIF · 검증 3</div>
<div class="n" style="font-size:14px;color:${C}">데이터 관리 › 업로드와 같은 기능 ›</div></div>`);
  const HY = PGY + 46;
  s += hl(X0, HY, LW);
  // 02 과제 · 03 모델 — 압축 블록 2(좌우 376 · 한 줄 + 변경 ›)
  const BY = HY + 18, HW = 376;
  s += lab(X0, BY, '02 과제') + link(X0 + HW - 160 - 24, BY - 2, '변경');
  s += img(X0, BY + 26, 128, 72, TASK[4], `<svg width="128" height="72" viewBox="0 0 244 84" preserveAspectRatio="none" style="position:absolute;left:0;top:0;display:block;pointer-events:none">${EV.greenhouse.over.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg>` + brkIn(128, 72, TEAL, 8), `outline:1px solid ${H}`);
  s += disp(X0 + 144, BY + 34, TASK[1], 18) + txt(X0 + 144, BY + 62, `${TASK[2]} · ${TASK[3]}`, 12.5, G, `width:${HW - 144 - 8}px;overflow:hidden;text-overflow:ellipsis`);
  const MX2 = X0 + HW + 24;
  s += vl(X0 + HW + 11, BY - 4, 110);
  s += lab(MX2, BY, '03 모델') + link(MX2 + HW - 160 - 24, BY - 2, '변경');
  s += disp(MX2, BY + 30, MODEL[0], 30, ACC) + disp(MX2 + 56, BY + 38, MODEL[1], 18) + txt(MX2, BY + 72, `XI-VFM v2.1 · ${MODEL[2]}`, 12.5, G);
  s += lab(MX2 + 216, BY + 76, 'IoU') + num(MX2 + 246, BY + 72, MODEL[3].toFixed(2), 13) + lab(MX2 + 296, BY + 76, 'F1') + num(MX2 + 318, BY + 72, MODEL[4].toFixed(2), 13);
  s += hl(X0, BY + 112, LW);
  // 우 요약 kv 7 + CTA
  s += panel('실행 요약', '검토', [
    ['영상', `${SEL_IMGS.length} · 남원 농경지 2025.06 · 2025.08`],
    ['면적', `${AREA_SUM} · ${AREA_EACH} km² × ${SEL_IMGS.length}`],
    ['GSD', SEL_IMGS.map(i => i.gsd).join(' · ') + ' · 드론'],
    ['과제', TASK[1]],
    ['모델', `${MODEL[0]} · ${MODEL[1]} · XI-VFM v2.1`],
    ['산출물', 'GPKG · GeoJSON · XLSX'],
    ['좌표계', 'EPSG:5186 · PNU 결합'],
  ]).s;
  s += cta(RI, 804, RIW, '분석 실행');
  s += FOOT;
  return page('B5 · 분석 실행 1 · 실행 검토', s);
}

// 2 · 실행중 — 발주(2026-08-27): "실행중 화면은 좀 고민을 해서 의미있는 정보가 있는지 좀 더 검토한다. 실행중인 이미지 오른쪽에 분석 실행으로 잘못 되어있다. 실행중으로 바꿔야 한다."
//   → 세그먼트 `실행중 3` 활성 · 우 패널 제목 `실행중` · 좌 = 처리 중 영상(스캔 스트립) + 영상별 진행 행 n(원본 상태어 대기·전처리중·분석중·후처리중·완료) + 레일 1
//     우 = 과제·모델 한 줄 · 누적 합계 4(검출 · 처리 면적 · 경과 · 잔여) · 시작 · 취소 헤어라인 · 검정 CTA 0 · `백그라운드로` 없음(원본 인벤토리 #5 에 없음)
const RUN = { pct: 72, elapsed: 24, start: '13:42', k: 2 };      // 영상 1 = 추론 72 % · 영상 2 = 대기 (시연)
const DET = 1205;                                                   // 검출 누적(시연) — results.js namwon-greenhouse-2025 1,674 필지 × 0.72
const DONE_KM = +(AREA_EACH * RUN.pct / 100).toFixed(2);            // 0.45 km²
const TOTAL_KM = AREA_EACH * SEL_IMGS.length;                       // 1.24 km²
const REMAIN = Math.round((TOTAL_KM - DONE_KM) / (DONE_KM / RUN.elapsed)); // 같은 속도 가정 → 42분
const ALL_PCT = Math.round(DONE_KM / TOTAL_KM * 100);               // 36 %
const WORDS = ['대기', '전처리중', '분석중', '후처리중', '완료'];      // 원본 실행중 카드 5단계 상태어
function runProgress() {
  let s = head('실행중', `${TASK[1]} · 영상 ${SEL_IMGS.length} · ${ALL_PCT} %`);
  const cur = SEL_IMGS[0], PCT = RUN.pct, IY = 172, IH = 360, sx = Math.round(LW * PCT / 100);
  const over = `<svg width="${LW}" height="${IH}" viewBox="0 0 ${LW} ${IH}" style="position:absolute;left:0;top:0;display:block;pointer-events:none"><rect x="0" y="0" width="${sx}" height="${IH}" fill="rgba(15,169,160,.12)"/><rect x="${sx - 28}" y="0" width="28" height="${IH}" fill="rgba(15,169,160,.22)"/><line x1="${sx}" y1="0" x2="${sx}" y2="${IH}" stroke="${TEAL}" stroke-width="1.5"/></svg>` + brkIn(LW, IH, ACC, 16) + det(12, IH - 32, `SCAN ${PCT} %`, AMB);
  s += img(X0, IY, LW, IH, cur.src, over, `outline:1px solid ${H}`);
  s += num(X0, IY + IH + 8, `처리 중 · ${cur.label} · ${cur.kind} ${cur.gsd} · ${AREA_EACH} km² · 1 / ${SEL_IMGS.length}`, 12.5, G);
  // 레일 5단계 1 — 현재 영상 기준 · 이름 위 · 상태 아래(발주 이름 5 = 전처리 · 추론 · 후처리 · 벡터화 · 저장)
  const RY = IY + IH + 66, seg = LW / 5, k = RUN.k;
  s += div(X0, RY + 3, LW, 1, `background:${H}`) + div(X0, RY + 2, seg * (k - 1) + seg * PCT / 100, 3, `background:${ACC}`);
  STEPS5.forEach((t, i) => {
    const x = X0 + i * seg, done = i + 1 < k, on = i + 1 === k, col = done ? TEAL : on ? ACC : C;
    s += div(x, RY, 7, 7, `background:${done || on ? col : '#FFFFFF'};border:1px solid ${col}`);
    s += txt(x + 14, RY - 24, t, 13, done ? TEAL : on ? ACC : G) + lab(x + 14, RY + 14, done ? '완료' : on ? `${PCT} %` : '대기', `color:${col}`);
  });
  // 영상별 진행 표 — 행 n(썸네일 · 이름 · 단계(원본 상태어) · % · 검출)
  const TY = RY + 52;
  s += hl(X0, TY, LW, INK);
  s += lab(X0 + 84, TY + 10, '영상') + lab(X0 + 400, TY + 10, '단계') + lab(X0 + 520, TY + 10, '진행') + lab(X0 + LW - 90, TY + 10, '검출', 'width:90px;text-align:right');
  s += hl(X0, TY + 32, LW);
  SEL_IMGS.forEach((im, i) => {
    const ry = TY + 44 + i * 54, on = i === 0, pct = on ? PCT : 0, word = on ? WORDS[2] : WORDS[0], col = on ? ACC : C;
    s += img(X0, ry, 72, 40, im.src, on ? brkIn(72, 40, ACC, 8) : '', `outline:1px solid ${H}${on ? '' : ';filter:grayscale(1);opacity:.6'}`);
    s += txt(X0 + 84, ry + 1, im.label, 13.5, on ? INK : G) + num(X0 + 84, ry + 21, `${im.kind} · ${im.gsd} · ${AREA_EACH} km²`, 11.5, C);
    s += `<div class="st" style="position:absolute;left:${X0 + 400}px;top:${ry + 10}px;color:${col}">${word}${on ? ` · ${STEPS5[k - 1]}` : ''}</div>\n`;
    s += div(X0 + 520, ry + 18, 96, 3, `background:${H}`) + div(X0 + 520, ry + 18, Math.round(96 * pct / 100), 3, `background:${ACC}`) + num(X0 + 626, ry + 9, `${pct} %`, 12.5, on ? INK : C);
    s += num(X0 + LW - 90, ry + 9, on ? `${fmt(DET)} 필지` : '—', 12.5, on ? INK : C, 'width:90px;text-align:right');
    s += hl(X0 + 84, ry + 47, LW - 84);
  });
  // 우 패널 — 제목 `실행중`(발주 정정) · 과제·모델 한 줄 · 누적 합계 4 · 시작 · 취소
  const p = panel('실행중', `${STEPS5[k - 1]} ${k} / 5 · 영상 1 / ${SEL_IMGS.length}`, [
    ['과제·모델', `${TASK[1]} · ${MODEL[0]} ${MODEL[1]}`],
    ['영상', `${SEL_IMGS.length} · 남원 농경지 2025.06 · 2025.08`],
  ]);
  s += p.s;
  let y = p.y + 18;
  const big = (x, yy, v, unit, col = INK, sub = '') => `<div style="position:absolute;left:${x}px;top:${yy}px;white-space:nowrap"><div style="display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:34px;line-height:1;letter-spacing:-.02em;color:${col}">${v}</span><span style="font-size:15px;color:${G}">${unit}</span></div><div class="lab" style="margin-top:6px">${sub}</div></div>\n`;
  s += lab(RI, y, '누적') + num(RI + 40, y, `전체 ${ALL_PCT} % · 지금까지`, 12.5, G);
  y += 28;
  s += big(RI, y, fmt(DET), '필지', ACC, '검출 ' + TAG());
  s += big(RI + 188, y, `${DONE_KM.toFixed(2)} <span style="font-size:18px;color:${G}">/ ${TOTAL_KM.toFixed(2)}</span>`, 'km²', INK, '처리 면적');
  y += 78;
  s += big(RI, y, `${RUN.elapsed}`, '분', INK, '경과 · 시작 ' + RUN.start + ' ' + TAG());
  s += big(RI + 188, y, `${REMAIN}`, '분', INK, `잔여 · 같은 속도 가정 ${TAG()}`);
  y += 84;
  s += hl(RI, y, RIW);
  s += num(RI, y + 12, `산출물 GPKG · GeoJSON · XLSX · EPSG:5186`, 12, C, `width:${RIW}px;overflow:hidden;text-overflow:ellipsis`);
  s += hbtn(RI, 804, RIW, '취소', G);
  s += FOOT;
  return page('B5 · 분석 실행 2 · 실행중', s);
}

wr('B5-Analysis-Run-Review.dc.html', runReview());
wr('B5-Analysis-Run-Progress.dc.html', runProgress());
