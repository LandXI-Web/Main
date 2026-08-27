// B5 분석 서비스 3판 재생성기 — List(카드 그리드 + 우 정보 패널) · Run(워크플로우) · Result(풀블리드 지도 + 스캔 스트립)
// 발주 원문(2026-08-27): "프로젝트는 진행하고 분석 서비스로 설계하자. 현재 로그인 대시보드 데이터관리 프로젝트
//   탭별로 구현한 특과 톤앤매너를 유지하고 창의적인 프론트 디자인을 구현하자. 기존 기능은 유지하되"
// 규칙 — ① design/system.md §1–§5 ② 실데이터 = services.js(15 · 부처 6) · results.js(4 산출물) · imagery.js(11)
//        ③ 원본 데모 시드(실행중 3 · 완료 7 · 모델 v1–v5 · 공유 역할 9)는 `시연` ④ 화면당 검정 CTA 1
//        ⑤ 파리티 = NOTES.md §19.1 표 (원본 analysis-ai.html 컨트롤 31 상태 1회씩)
// usage: node tools/design/gen-b5-analysis.mjs   (repo root) — 3판 + 단계별 5판(Run-1…5)을 통째로 다시 쓴다(멱등).
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
// 2. B5-Analysis-Run — 워크플로우 4노드(과제 → 모델 → 영상 선택 → 실행) · 영상 픽커 활성 · 우 실행 요약 · CTA
// ======================================================================
function run() {
  let s = head('분석 실행', '비닐하우스 현황 · 남원 농경지 2025.06');
  const NY = 196, NH = 150, NW = 176, GAP = 24;
  s += lab(X0, 174, '워크플로우') + num(X0 + 78, 174, '3 / 4 단계 · 영상 선택', 12, ACC);
  // 노드 4
  const nodes = [
    ['01 분석 과제', '비닐하우스 현황', '농림축산식품부 · 실측', ['과제 8 중 1', '변경 ▾'], 'done'],
    ['02 모델', 'v5 단동/연동 분리', '2026.05.20 · 종속 모델 5', ['v5', 'v4', 'v3', '+2'], 'done'],
    ['03 영상 선택', '남원 농경지 2025.06', '아카이브 · 드론 1.69 cm', ['선택 1', '11건 중'], 'on'],
    ['04 실행', '대기열 등록', '전처리 → 분석 → 후처리', ['5단계'], 'wait'],
  ];
  nodes.forEach(([l, v, m, chips, stt], i) => {
    const x = X0 + i * (NW + GAP);
    const bd = stt === 'on' ? `border:1.5px solid ${ACC};background:${T1}` : stt === 'wait' ? `border:1px dashed ${C}` : `border:1px solid ${INK}`;
    s += div(x, NY, NW, NH, bd);
    s += lab(x + 12, NY + 12, l, stt === 'wait' ? `color:${C}` : '') + (stt === 'done' ? st(x + NW - 40, NY + 12, '완료', `color:${TEAL}`) : stt === 'on' ? st(x + NW - 40, NY + 12, '선택') : '');
    s += disp(x + 12, NY + 34, v, 15, stt === 'wait' ? G : INK, `width:${NW - 24}px;overflow:hidden;text-overflow:ellipsis`) + txt(x + 12, NY + 60, m, 12, G, `width:${NW - 24}px;overflow:hidden;text-overflow:ellipsis`);
    let cx = x + 12;
    chips.forEach((c, j) => { const on = (i === 1 && j === 0) || (i === 2 && j === 0); s += `<span class="chip${on ? ' on' : ''}" style="position:absolute;left:${cx}px;top:${NY + 96}px;height:22px;line-height:20px;${stt === 'wait' ? `color:${C}` : ''}">${c}</span>\n`; cx += c.length * 9.5 + 26; });
    if (i < 3) s += hl(x + NW, NY + NH / 2, GAP, stt === 'on' ? C : INK) + (stt === 'on' ? '' : `<svg width="6" height="8" viewBox="0 0 6 8" style="position:absolute;left:${x + NW + GAP - 6}px;top:${NY + NH / 2 - 4}px"><path d="M0 0l6 4-6 4z" fill="${INK}"/></svg>\n`);
    if (i === 3) s += steps(x + 12, NY + 128, NW - 24, 1, 'run').replace(new RegExp(ACC, 'g'), C);
  });
  s += hl(X0, 372, 776);
  // 영상 선택 — 아카이브 픽커(원본 탭 4 · 목록 · 페이지 2) = 실썸네일 3열 + 우 풋프린트 소지도
  const PY = 392;
  s += disp(X0, PY, '영상 선택', 15) + num(X0 + 76, PY + 2, '아카이브 11', 13, ACC);
  s += search(X0 + 456 - 168, PY - 4, 168, '영상명');
  ['전체', '최근', '공유', '내 영상'].forEach((t, i) => s += tb(X0 + i * 70, PY + 30, t, i === 0));
  s += hl(X0, PY + 62, 456);
  const pick = IMAGERY.slice(0, 6);
  pick.forEach(([id, label, kind, gsd, src], i) => {
    const x = X0 + (i % 3) * 156, y = PY + 78 + Math.floor(i / 3) * 122, on = id === 'namwon_2506';
    if (on) s += div(x - 6, y - 6, 156, 112, `background:${T1}`);
    s += img(x, y, 144, 81, src, on ? brkIn(144, 81, ACC) : '') + (on ? chk(x + 124, y + 6, true) : '');
    s += txt(x, y + 86, label, 12, on ? INK : G, 'width:144px;overflow:hidden;text-overflow:ellipsis') + num(x, y + 104 - 2, `${kind} · ${gsd}`, 11, C);
  });
  s += hl(X0, PY + 322, 456) + pager(X0, PY + 334, 1, 2) + num(X0 + 456 - 80, PY + 334, '11건 중 1~6', 12, G, 'width:80px;text-align:right');
  // 풋프린트 소지도 296×296 — korea-outline.geojson(실데이터) 벡터 + 아카이브 위치 3(imagery.js) · 선택 = 액센트 채움
  const MX = X0 + 480, MW = 296, MH = 296;
  s += div(MX, PY, MW, MH, `background:${T1};overflow:hidden`, koreaSvg(MW, MH, [[127.352, 35.531, '남원 ×6', true], [126.983, 35.832, '국산리 ×2', false], [126.55, 33.4, '제주 ×3', false, -74]]));
  s += brkIn(MW, MH, INK, 12, 1, MX, PY);
  s += lab(MX, PY + MH + 12, '선택 범위') + num(MX + 66, PY + MH + 12, '127.348–127.357 E · 35.528–35.535 N', 12, G);
  s += num(MX + 66, PY + MH + 32, '0.78 × 0.79 km · 남원 농경지 4시점 동일 범위', 12, C);
  // 우 실행 요약 판 424 — kv 6 + 파라미터 칩 + 선택 영상 실크롭 + 단계 5 + CTA
  const RX = 960, RW = 424, RI = 984, RIW = 376;
  s += div(RX, 156, RW, 744, `background:#FFFFFF`) + vl(RX, 156, 744, INK);
  s += disp(RI, 178, '실행 요약', 20) + hl(RI, 214, RIW);
  const kv = [['분석명', '2026년 8월 남원 농경지 비닐하우스 현황 <span class="tag">자동</span>'], ['분석 과제', '비닐하우스 현황'], ['모델', '2026.05.20 v5(단동/연동 분리) <span class="tag">시연</span>'], ['영상', '남원 농경지 2025.06 · 드론'], ['GSD · 범위', '1.69 cm · 0.62 km²'], ['공유 권한', '실행 후 설정 ›']];
  kv.forEach(([k, v], i) => { const y = 228 + i * 34; s += lab(RI, y + 2, k) + txt(RI + 96, y, v, 13.5, k === '공유 권한' ? G : INK, `width:${RIW - 96}px;overflow:hidden;text-overflow:ellipsis`); });
  s += hl(RI, 438, RIW);
  s += lab(RI, 452, '모델 파라미터') + `<span class="tag" style="position:absolute;left:${RI + 96}px;top:${450}px">시연</span>\n`;
  [['클래스 2 · 단동 · 다동', 0], ['입력 640 px', 190], ['임계 0.5', 290]].forEach(([c, dx]) => s += chip(RI + dx, 474, c));
  s += img(RI, 516, RIW, 211, 'tile-gh-clean.jpg', brkIn(RIW, 211, ACC) + det(8, 183, '남원 농경지 2025.06 · 1.69 cm'));
  s += lab(RI, 742, '단계') + num(RI + 40, 742, '대기 · 전처리 · 분석 · 후처리 · 완료', 12, G) + steps(RI, 766, RIW, 0, 'run');
  s += cta(RI, 804, RIW, '분석 실행');
  s += txt(RI, 850, '실행 후 → 실행중 목록 · 진행 오버레이(단계 · % · 필지 진행)', 12, C);
  s += FOOT;
  return page('B5 · 분석 서비스 — 분석 실행', s);
}

// ======================================================================
// 3. B5-Analysis-Result — 풀블리드 지도(남원 드론 정사영상 + 청록 결과) · 스캔 스트립 → 브래킷 → DETECTED → 카운트업(중간 상태)
//    좌 드로어 360 = 실행중 3 / 완료 7 · 우 드로어 400 = 결과 요약(큰 수 · 클래스 막대 · 신뢰도 테이프) · 공유/다운로드 헤어라인 · 토글 정사영상↔결과
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
wr('B5-Analysis-Run.dc.html', run());
wr('B5-Analysis-Result.dc.html', result());

// ======================================================================
// 4. B5-Analysis-Run-1…5 — 단계별 상세 5판 (발주 2026-08-27: "분석 실행 워크플로우 단계별로 세부 실행이 조금 더 디테일하게
//    프론트 화면이 필요할 것 같다. 각 단계별 아래 정보와 오른쪽 정보가 잘 고민이 되어야 한다.")
//    기능은 원본 픽커와 1:1(과제 8 · 모델 v1–v5 종속 · 영상 탭 4 + 페이지 · 실행 · 진행 오버레이 5단계) — 서버 기능 추가 0, 선택값의 표현만.
// ======================================================================
const dash = (x, y, w, h, inner = '') => div(x, y, w, h, `border:1px dashed ${C}`, inner);
const hbtn = (x, y, w, t, col = INK, bd = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:36px;border:1px solid ${bd};display:flex;align-items:center;justify-content:center;font-size:15px;letter-spacing:-.01em;color:${col};white-space:nowrap">${t}</div>\n`;
const TAG = (t = '시연') => `<span class="tag">${t}</span>`;
// 원본 과제 8(인벤토리 §2 #2) → services.js 명칭·부처로 (#2 도로안전 카메라 · #4 사료작물 생산기는 서비스 항목이 없어 원본 이름 + `시연`)
const TASKS = [
  ['pothole', '도로안전 다시점 조사', '국토교통부', '포트홀 점 · GeoJSON', 'pj-road.jpg', '정사영상'],
  ['pothole-cam', '도로안전 카메라', '국토교통부', '포트홀 점 · GeoJSON', 'pj-car.jpg', '차량 영상', true],
  ['feedcrop', '사료작물 재배지 · 생육기', '농림축산식품부', '필지 폴리곤 · GPKG', 'crop-farm-1.jpg', '드론'],
  ['feedcrop2', '사료작물 재배지 · 생산기', '농림축산식품부', '필지 폴리곤 · GPKG', 'crop-farm-6.jpg', '드론', true],
  ['silage', '곤포 사일리지 집계', '농림축산식품부', '개체 점 · XLSX', 'pj-land.jpg', '드론'],
  ['greenhouse', '비닐하우스 현황', '농림축산식품부', '동 폴리곤 · 필지 결합 · GPKG', 'tile-gh-clean.jpg', '드론'],
  ['farmland', '농지이용·불법건축물', '농림축산식품부', '필지 폴리곤 · GeoJSON · XLSX', 'tile-farm-clean.jpg', '드론'],
  ['trash', '방치폐기물 탐지', '환경부', '개소 점 · GeoJSON', 'tile-arc-hid.jpg', '드론'],
];
const TASK = TASKS[5];
// 원본 모델 목록 5(과제 종속 · 시드 그대로) + 표시용 지표(학습 데이터 · IoU · F1 · 권장 GSD = `시연`, 기반 = dashboard.js XI-VFM v2.1)
const MODELS = [
  ['v5', '단동/연동 분리', '2026.05.20', 3842, 1674, .82, .87, '1–2 cm', '최신'],
  ['v4', '반사광 보정', '2026.04.30', 3410, 1512, .79, .84, '1–2 cm', '이전'],
  ['v3', '군집 분리', '2026.04.09', 2960, 1320, .76, .81, '1–3 cm', '이전'],
  ['v2', '경계 정밀', '2026.03.21', 2210, 980, .72, .78, '1–3 cm', '이전'],
  ['v1', '기본', '2026.02.15', 1480, 640, .66, .72, '2–5 cm', '이전'],
];
const MODEL = MODELS[0];
const IMG_SEL = { id: 'namwon_2506', label: '남원 농경지 · 2025.06', gsd: 0.0169 };   // imagery.js · bounds 127.3481–127.3567 · 35.5276–35.5347
const AREA = '0.62 km²', EST = '58분';          // 면적 = imagery.js bounds · 예상 = 원본 완료 시드(비닐하우스 운봉읍·인월면 58분) → `시연`
const PARAMS = ['클래스 2 · 단동 · 다동', '입력 640 px', '임계 0.5'];
const PARAMW = [150, 100, 78];   // 칩 실폭(렌더 측정) + 사이 8   // Run 판과 같은 3(원본에 파라미터 없음 → `시연`)
const STEPS5 = ['전처리', '추론', '후처리', '벡터화', '저장'];
const SUBS = ['비닐하우스 현황', '비닐하우스 현황 · v5', '비닐하우스 현황 · 남원 농경지 2025.06', '비닐하우스 현황 · 남원 농경지 2025.06 · 실행 검토', '비닐하우스 현황 · 남원 농경지 2025.06 · 실행중'];

// 노드 레일 4 — 단계 k(1–4) 활성, 앞은 완료, 뒤는 점선 대기. 5(실행중)는 04 진행
function nodeRail(k) {
  let s = '';
  const NY = 196, NH = 150, NW = 176, GAP = 24;
  const names = ['01 분석 과제', '02 모델', '03 영상 선택', '04 실행'];
  const filled = [
    [TASK[1], TASK[2] + ' · 실측', ['과제 8 중 1']],
    [`${MODEL[0]} ${MODEL[1]}`, `${MODEL[2]} · 종속 모델 5`, [MODEL[0], 'v4', 'v3', '+2']],
    [IMG_SEL.label.replace(' · ', ' '), `아카이브 · 드론 ${(IMG_SEL.gsd * 100).toFixed(2)} cm`, ['선택 1', '11건 중']],
    [k >= 5 ? '실행중' : '실행 검토', k >= 5 ? '추론 2 / 5 · 42 %' : '전처리 → 저장 · 5단계', k >= 5 ? ['2 / 5'] : ['5단계']],
  ];
  const empty = [['과제 선택', '8 중 —', ['—']], ['모델 선택', '과제 종속 · —', ['—']], ['영상 선택', '아카이브 11 · —', ['—']], ['실행', '5단계', ['대기']]];
  const stt = i => (i + 1 < k ? 'done' : i + 1 === k ? 'on' : 'wait');
  s += lab(X0, 174, '워크플로우') + num(X0 + 78, 174, k >= 5 ? '4 / 4 단계 · 실행중' : `${k} / 4 단계 · ${names[k - 1].slice(3)}`, 12, ACC);
  for (let i = 0; i < 4; i++) {
    const x = X0 + i * (NW + GAP), st_ = k >= 5 ? (i < 3 ? 'done' : 'on') : stt(i);
    const [v, m, chips] = st_ === 'wait' ? empty[i] : filled[i];
    const bd = st_ === 'on' ? `border:1.5px solid ${ACC};background:${T1}` : st_ === 'wait' ? `border:1px dashed ${C}` : `border:1px solid ${INK}`;
    s += div(x, NY, NW, NH, bd);
    s += lab(x + 12, NY + 12, names[i], st_ === 'wait' ? `color:${C}` : '') + (st_ === 'done' ? st(x + NW - 40, NY + 12, '완료', `color:${TEAL}`) : st_ === 'on' ? st(x + NW - 40, NY + 12, k >= 5 ? '진행' : '선택') : '');
    s += disp(x + 12, NY + 34, v, 15, st_ === 'wait' ? C : INK, `width:${NW - 24}px;overflow:hidden;text-overflow:ellipsis`) + txt(x + 12, NY + 60, m, 12, st_ === 'wait' ? C : G, `width:${NW - 24}px;overflow:hidden;text-overflow:ellipsis`);
    let cx = x + 12;
    chips.forEach((c, j) => { const on = st_ !== 'wait' && j === 0 && i !== 3; s += `<span class="chip${on ? ' on' : ''}" style="position:absolute;left:${cx}px;top:${NY + 96}px;height:22px;line-height:20px;${st_ === 'wait' ? `color:${C}` : ''}">${c}</span>\n`; cx += c.length * 9.5 + 26; });
    if (i < 3) s += hl(x + NW, NY + NH / 2, GAP, st_ === 'done' ? INK : C) + (st_ === 'done' ? `<svg width="6" height="8" viewBox="0 0 6 8" style="position:absolute;left:${x + NW + GAP - 6}px;top:${NY + NH / 2 - 4}px"><path d="M0 0l6 4-6 4z" fill="${INK}"/></svg>\n` : '');
    if (i === 3) s += (k >= 5 ? steps(x + 12, NY + 128, NW - 24, 2, 'run') : steps(x + 12, NY + 128, NW - 24, 1, 'run').replace(new RegExp(ACC, 'g'), C));
  }
  return s + hl(X0, 372, 776);
}

// 헤어라인 지표 막대(0–1) — Result 클래스 막대 문법
const bar = (x, y, w, v, col = TEAL, h = 3) => div(x, y, w, h, `background:${H}`) + div(x, y, Math.round(w * v), h, `background:${col}`);

// 우 실행 요약 판 — 채운 단계는 값, 나머지는 점선 `대기` 행
function summary(k) {
  const RX = 960, RW = 424, RI = 984, RIW = 376;
  let s = div(RX, 156, RW, 744, 'background:#FFFFFF') + vl(RX, 156, 744, INK);
  s += disp(RI, 178, '실행 요약', 20) + num(RI + 100, 184, `${Math.min(k, 4)} / 4`, 13, ACC) + hl(RI, 214, RIW);
  let y = 226;
  const row = (n, title, inner, h) => { s += lab(RI, y, n) + disp(RI + 28, y - 4, title, 14) + inner(y + 26); y += h; s += hl(RI, y - 12, RIW); };
  const wait = (n, title, hint) => { s += lab(RI, y, n, `color:${C}`) + disp(RI + 28, y - 4, title, 14, C) + txt(RI + RIW - 60, y - 2, '대기', 12, C, 'width:60px;text-align:right') + dash(RI, y + 24, RIW, 28, `<span class="mic" style="position:absolute;left:10px;top:4px;color:${C}">${hint}</span>`); y += 66; s += hl(RI, y - 12, RIW); };
  const kvs = (y0, arr, lw = 84) => arr.map(([kk, v], i) => lab(RI, y0 + i * 26 + 2, kk) + txt(RI + lw, y0 + i * 26, v, 12.5, INK, `width:${RIW - lw}px;overflow:hidden;text-overflow:ellipsis`)).join('');
  // 01 과제
  if (k >= 1) {
    const big = k === 1, ih = big ? 160 : 72, iw = big ? RIW : 128;
    row('01', '분석 과제', (yy) => {
      let t = img(RI, yy, iw, ih, TASK[4], brkIn(iw, ih, TEAL, 10), `outline:1px solid ${H}`);
      if (big) {
        t += disp(RI, yy + ih + 12, TASK[1], 17) + txt(RI + 150, yy + ih + 15, TASK[2], 12.5, G);
        t += kvs(yy + ih + 44, [['산출물', TASK[3]], ['입력 요건', `${TASK[5]} 정사영상 · GSD 1–5 cm ${TAG()}`], ['참조', '실측 · 남원 1,674 필지 · 2025.06']]);
      } else t += disp(RI + 140, yy - 2, TASK[1], 15) + txt(RI + 140, yy + 22, TASK[2], 12.5, G) + txt(RI + 140, yy + 44, TASK[3], 12, C, `width:${RIW - 140}px;overflow:hidden;text-overflow:ellipsis`);
      return t;
    }, big ? ih + 44 + 26 * 3 + 40 : ih + 44);
  }
  // 02 모델
  if (k >= 2) {
    const big = k === 2;
    row('02', '모델', (yy) => {
      let t = disp(RI, yy - 2, `${MODEL[0]} · ${MODEL[1]}`, 15) + txt(RI + 150, yy + 1, `${MODEL[2]} · XI-VFM v2.1 ${TAG()}`, 12.5, G);
      const b0 = yy + 28;
      t += lab(RI, b0, 'IoU') + bar(RI + 40, b0 + 6, 110, MODEL[5]) + num(RI + 156, b0 - 1, MODEL[5].toFixed(2), 12.5);
      t += lab(RI + 200, b0, 'F1') + bar(RI + 232, b0 + 6, 96, MODEL[6], INK) + num(RI + 334, b0 - 1, MODEL[6].toFixed(2), 12.5);
      if (big) t += kvs(b0 + 30, [['학습 데이터', `${fmt(MODEL[3])} 장 · ${fmt(MODEL[4])} 필지 ${TAG()}`], ['권장 GSD', MODEL[7]], ['상태', MODEL[8] + ' · 종속 모델 5 중']]);
      return t;
    }, big ? 28 + 30 + 26 * 3 + 30 : 28 + 26 + 30);
  }
  // 03 영상
  if (k >= 3) {
    const big = k === 3;
    row('03', '영상', (yy) => {
      let t = img(RI, yy, big ? RIW : 128, big ? 150 : 72, 'tile-gh-clean.jpg', brkIn(big ? RIW : 128, big ? 150 : 72, ACC, 10) + (big ? det(8, 122, `${IMG_SEL.label} · ${(IMG_SEL.gsd * 100).toFixed(2)} cm`) : ''), `outline:1px solid ${H}`);
      const y2 = big ? yy + 162 : yy;
      const x2 = big ? RI : RI + 140;
      t += lab(x2, y2 + 2, '선택 1') + txt(x2 + 52, y2, `${IMG_SEL.label} · 드론`, 12.5, INK, `width:${RIW - (big ? 52 : 192)}px;overflow:hidden;text-overflow:ellipsis`);
      t += lab(x2, y2 + 28, '면적') + num(x2 + 52, y2 + 26, `${AREA} · 0.78 × 0.79 km`, 12.5);
      t += lab(x2, y2 + 54, '예상') + num(x2 + 52, y2 + 52, `${EST} ${TAG()}`, 12.5);
      return t;
    }, big ? 162 + 80 + 40 : 124);
  }
  // 04 실행(파라미터 + 예상 결과)
  if (k >= 4) {
    row('04', '실행', (yy) => {
      let t = `<span class="tag" style="position:absolute;left:${RI + 64}px;top:${yy - 28}px">시연</span>\n`, cx = RI;
      PARAMS.forEach((c, i) => { t += chip(cx, yy - 2, c); cx += PARAMW[i] + 8; });
      t += kvs(yy + 34, [['산출물', 'GPKG · GeoJSON · XLSX'], ['좌표계', 'EPSG:5186'], ['저장 위치', '완료 목록 · 내 것']]);
      return t;
    }, 26 + 34 + 26 * 3 + 16);
  }
  // 대기 행
  if (k < 2) wait('02', '모델', '과제 종속 · v1–v5');
  if (k < 3) wait('03', '영상', '아카이브 11 · 탭 4');
  if (k < 4) wait('04', '실행', '전처리 · 추론 · 후처리 · 벡터화 · 저장');
  return { s, y, RI, RIW };
}

// 회백 베이스맵 소지도 — sigungu.geojson(실좌표) 회백 면 + 흰 경계 + 시군구 라벨 · 풋프린트 = imagery.js bounds
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

// 실행 카드(04 · 실행중 공용) — 과제 → 모델 → 영상 n 판 3 + 파라미터 + 예상 결과 표
function runCard(live) {
  const Y = 392, W = 776, IH = live ? 80 : 120;
  let s = disp(X0, Y, live ? '실행중' : '실행 검토', 15) + num(X0 + (live ? 60 : 84), Y + 2, '2026년 8월 남원 농경지 비닐하우스 현황 ' + TAG('자동'), 13, G);
  s += div(X0, Y + 34, W, 1, `background:${INK}`);
  const PW = 240, PG = (W - PW * 3) / 2, PY = Y + 52;
  const plates = [
    ['01 분석 과제', TASK[4], TASK[1], `${TASK[2]} · ${TASK[3]}`, TEAL],
    ['02 모델', null, `${MODEL[0]} · ${MODEL[1]}`, `${MODEL[2]} · IoU ${MODEL[5].toFixed(2)} · F1 ${MODEL[6].toFixed(2)}`, INK],
    ['03 영상 1', 'tile-gh-clean.jpg', IMG_SEL.label, `드론 ${(IMG_SEL.gsd * 100).toFixed(2)} cm · ${AREA}`, ACC],
  ];
  plates.forEach(([l, src, t, m, col], i) => {
    const x = X0 + i * (PW + PG);
    s += lab(x, PY, l);
    if (src) s += img(x, PY + 22, PW, IH, src, brkIn(PW, IH, col, 10), `outline:1px solid ${H}`);
    else {
      // 모델 판 = 큰 수 2(IoU 액센트 · F1 잉크) + 학습 데이터 — 그림 대신 수치 판
      const bs = live ? 26 : 34;
      s += div(x, PY + 22, PW, IH, `border:1px solid ${H}`);
      s += `<div class="d" style="position:absolute;left:${x + 14}px;top:${PY + 34}px;font-size:${bs}px;line-height:1;color:${ACC}">${MODEL[5].toFixed(2)}</div>\n` + lab(x + 14, PY + 34 + bs + 6, 'IoU');
      s += `<div class="d" style="position:absolute;left:${x + 124}px;top:${PY + 34}px;font-size:${bs}px;line-height:1">${MODEL[6].toFixed(2)}</div>\n` + lab(x + 124, PY + 34 + bs + 6, 'F1');
      if (!live) s += num(x + 14, PY + 100, `학습 ${fmt(MODEL[3])} 장 · ${fmt(MODEL[4])} 필지 ${TAG()}`, 11.5, G);
    }
    s += disp(x, PY + 22 + IH + 10, t, 14, INK, `width:${PW}px;overflow:hidden;text-overflow:ellipsis`) + txt(x, PY + 22 + IH + 32, m, 12, G, `width:${PW}px;overflow:hidden;text-overflow:ellipsis`);
    if (i < 2) s += hl(x + PW + 4, PY + 22 + IH / 2, PG - 8, INK) + `<svg width="6" height="8" viewBox="0 0 6 8" style="position:absolute;left:${x + PW + PG - 10}px;top:${PY + 22 + IH / 2 - 4}px"><path d="M0 0l6 4-6 4z" fill="${INK}"/></svg>\n`;
  });
  if (live) return { s, RY: PY + 22 + IH + 66 };
  // 파라미터 칩 행 + 예상 결과 3열 행
  const TY = PY + 22 + IH + 66;
  s += hl(X0, TY - 8, W);
  s += lab(X0, TY + 6, '파라미터') + `<span class="tag" style="position:absolute;left:${X0 + 64}px;top:${TY + 4}px">시연</span>\n`;
  let cx = X0 + 120; PARAMS.forEach((c, i) => { s += chip(cx, TY + 2, c); cx += PARAMW[i] + 8; });
  const EY = TY + 40;
  s += lab(X0, EY + 6, '예상 결과');
  [['산출물', 'GPKG · GeoJSON · XLSX'], ['좌표계', 'EPSG:5186 · PNU 결합'], ['저장 위치', '완료 목록 · 내 것']].forEach(([kk, v], i) => { const ex = X0 + 120 + i * 226; s += lab(ex, EY + 6, kk) + txt(ex + 64, EY + 4, v, 12.5, INK, 'width:158px;overflow:hidden;text-overflow:ellipsis'); });
  return { s, RY: EY + 44 };
}
// 5단계 레일 — 대기(k=0) 또는 진행(k · pct)
function rail5(y, k, pct = 0) {
  const W = 776, seg = W / 5;
  let s = hl(X0, y - 8, W) + lab(X0, y + 4, '단계') + num(X0 + 40, y + 4, k ? `${k} / 5 · ${STEPS5[k - 1]} 진행` : '5 · 대기', 12.5, k ? ACC : G);
  const ry = y + 50;
  s += div(X0, ry + 3, W, 1, `background:${H}`);
  if (k) s += div(X0, ry + 2, seg * (k - 1) + seg * pct / 100, 3, `background:${ACC}`);
  STEPS5.forEach((t, i) => {
    const x = X0 + i * seg, done = i + 1 < k, on = i + 1 === k;
    s += div(x, ry, 7, 7, `background:${done ? TEAL : on ? ACC : '#FFFFFF'};border:1px solid ${done ? TEAL : on ? ACC : C}`);
    s += txt(x + 14, ry - 24, t, 13, k ? (done ? TEAL : on ? ACC : C) : G) + lab(x + 14, ry + 14, done ? '완료' : on ? `${pct} %` : '대기', done ? `color:${TEAL}` : on ? `color:${ACC}` : `color:${C}`);
  });
  return s;
}

function runStep(k) {
  let s = head('분석 실행', SUBS[k - 1]) + nodeRail(k);
  const BY = 392, W = 776;
  if (k === 1) {
    s += disp(X0, BY, '분석 과제', 15) + num(X0 + 76, BY + 2, '8 · 부처 3', 13, ACC) + search(X0 + W - 168, BY - 4, 168, '과제명 · 부처');
    s += hl(X0, BY + 34, W);
    const CWd = 179, GX = 20, IH = 100, PITCH = 196;
    TASKS.forEach(([id, name, min, out, src, kind, demo], i) => {
      const x = X0 + (i % 4) * (CWd + GX), y = BY + 52 + Math.floor(i / 4) * PITCH, on = id === TASK[0];
      if (on) s += div(x - 6, y - 6, CWd + 12, PITCH - 8, `background:${T1}`);
      s += img(x, y, CWd, IH, src, on ? brkIn(CWd, IH, ACC, 10) : '', `outline:1px solid ${on ? ACC : H}`);
      s += disp(x, y + IH + 8, name, 13.5, INK, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
      s += txt(x, y + IH + 30, min + (demo ? TAG() : ''), 12, G, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
      s += txt(x, y + IH + 50, out, 11.5, C, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
    });
    s += hl(X0, BY + 52 + 2 * PITCH - 4, W) + num(X0, BY + 52 + 2 * PITCH + 6, '선택 1 · 과제 8 중', 12, G) + txt(X0 + W - 260, BY + 52 + 2 * PITCH + 6, '원본 옵션 카드 8 · 선택 → 종속 모델', 12, C, 'width:260px;text-align:right');
  }
  if (k === 2) {
    s += disp(X0, BY, '모델', 15) + num(X0 + 40, BY + 2, '5 · 과제 종속', 13, ACC) + num(X0 + 150, BY + 2, `기반 XI-VFM v2.1 · 지표 ${TAG()}`, 12.5, G);
    s += txt(X0 + W - 120, BY + 2, '최신순 ▾', 12.5, G, 'width:120px;text-align:right');
    const cols = [[0, '버전'], [56, '이름'], [190, '학습일'], [290, '학습 데이터'], [430, 'IoU'], [550, 'F1'], [676, '권장 GSD']];
    const HY = BY + 36;
    s += hl(X0, HY - 4, W);
    cols.forEach(([dx, t]) => s += lab(X0 + dx, HY + 6, t));
    s += div(X0, HY + 28, W, 1, `background:${INK}`);
    const RH = 62;
    MODELS.forEach(([v, n, dt, imgs, parc, iou, f1, gsd, stt], i) => {
      const y = HY + 30 + i * RH, on = i === 0;
      if (on) s += div(X0, y, W, RH - 1, `background:${T1}`) + brkIn(W, RH - 1, ACC, 10, 1, X0, y);
      s += disp(X0 + 12, y + 20, v, 15, on ? ACC : INK);
      s += txt(X0 + 56, y + 12, n, 13.5, INK) + txt(X0 + 56, y + 34, 'XI-VFM v2.1', 11.5, C);
      s += num(X0 + 190, y + 20, dt, 12.5, G);
      s += num(X0 + 290, y + 12, `${fmt(imgs)} 장`, 12.5) + num(X0 + 290, y + 34, `${fmt(parc)} 필지`, 11.5, C);
      s += bar(X0 + 430, y + 24, 66, iou, TEAL) + num(X0 + 502, y + 15, iou.toFixed(2), 12.5);
      s += bar(X0 + 550, y + 24, 66, f1, INK) + num(X0 + 622, y + 15, f1.toFixed(2), 12.5);
      s += num(X0 + 676, y + 20, gsd, 12.5, G);
      s += `<div class="st" style="position:absolute;left:${X0 + W - 40}px;top:${y + 21}px;width:40px;text-align:right;color:${stt === '최신' ? ACC : C}">${stt}</div>\n`;
      s += hl(X0, y + RH - 1, W);
    });
    const EY = HY + 30 + 5 * RH + 14;
    s += num(X0, EY, '선택 v5 · 최신 · 이전 4 = 재현용', 12, G) + txt(X0 + W - 320, EY, 'IoU 청록 · F1 잉크 · 막대 0–1 · 학습 데이터 = 라벨 장 · 필지', 12, C, 'width:320px;text-align:right');
  }
  if (k === 3) {
    const PY = BY;
    s += disp(X0, PY, '영상 선택', 15) + num(X0 + 76, PY + 2, '아카이브 11', 13, ACC);
    s += search(X0 + 456 - 168, PY - 4, 168, '영상명');
    ['전체', '최근', '공유', '내 영상'].forEach((t, i) => s += tb(X0 + i * 70, PY + 30, t, i === 0));
    s += hl(X0, PY + 62, 456);
    IMAGERY.slice(0, 6).forEach(([id, label, kind, gsd, src], i) => {
      const x = X0 + (i % 3) * 156, y = PY + 78 + Math.floor(i / 3) * 122, on = id === 'namwon_2506';
      if (on) s += div(x - 6, y - 6, 156, 112, `background:${T1}`);
      s += img(x, y, 144, 81, src, on ? brkIn(144, 81, ACC) : '') + chk(x + 124, y + 6, on);
      s += txt(x, y + 86, label, 12, on ? INK : G, 'width:144px;overflow:hidden;text-overflow:ellipsis') + num(x, y + 102, `${kind} · ${gsd}`, 11, C);
    });
    s += hl(X0, PY + 322, 456) + pager(X0, PY + 334, 1, 2) + num(X0 + 456 - 80, PY + 334, '11건 중 1~6', 12, G, 'width:80px;text-align:right');
    const SY = PY + 366;
    s += lab(X0, SY, '선택 목록') + num(X0 + 66, SY, '1', 12.5, ACC);
    s += hl(X0, SY + 22, 456) + img(X0, SY + 30, 56, 32, 'tile-gh-clean.jpg') + txt(X0 + 66, SY + 28, IMG_SEL.label, 12.5) + num(X0 + 66, SY + 46, `드론 · 1.69 cm · ${AREA}`, 11.5, G) + `<div style="position:absolute;left:${X0 + 456 - 16}px;top:${SY + 38}px">${ico('close', G, 11)}</div>\n`;
    s += hl(X0, SY + 70, 456) + lab(X0, SY + 80, '합계') + num(X0 + 66, SY + 78, `${AREA} · 1건`, 12.5, INK) + num(X0 + 456 - 150, SY + 78, `예상 ${EST} ${TAG()}`, 12.5, G, 'width:150px;text-align:right');
    const MX = X0 + 480, MW = 296, MH = 296;
    s += div(MX, PY, MW, MH, 'overflow:hidden', greyMap(MW, MH, [126.9, 35.2, 127.75, 35.95],
      [[[127.182606, 35.302858, 127.637309, 35.561786], '남원 전역 ×2 · 항공 2 m', 'city'],
       [[126.973996, 35.825613, 126.992145, 35.838284], '국산리 ×2', 'teal'],
       [[127.3481, 35.5276, 127.3567, 35.5347], '남원 농경지 ×4 · 선택 1', 'on']],
      [[127.5, 35.40, '남원시'], [127.28, 35.66, '임실군'], [127.63, 35.75, '장수군'], [127.0, 35.5, '순창군'], [127.55, 35.28, '구례군'], [127.15, 35.85, '완주군']]));
    s += brkIn(MW, MH, INK, 12, 1, MX, PY);
    s += lab(MX, PY + MH + 12, '선택 범위') + num(MX + 66, PY + MH + 12, '127.348–127.357 E · 35.528–35.535 N', 12, G);
    s += num(MX + 66, PY + MH + 32, '0.78 × 0.79 km · 남원 농경지 4시점 동일 범위', 12, C);
    s += num(MX, PY + MH + 58, '제주 ×3 · 범위 밖(33.5 N) ↓', 12, C) + num(MX, PY + MH + 78, '회백 = 시군구 경계 · 점선 = 항공 · 채움 = 선택', 11.5, C);
  }
  if (k === 4) {
    const rc = runCard(false); s += rc.s + rail5(rc.RY, 0);
  }
  const sm = summary(k); s += sm.s;
  const ctaT = ['다음 · 모델', '다음 · 영상', '다음 · 실행', '분석 실행'][k - 1];
  const cy = 804;
  s += hbtn(sm.RI, cy, 100, k === 1 ? '취소' : '이전', G) + cta(sm.RI + 112, cy, sm.RIW - 112, ctaT);
  s += txt(sm.RI, 850, k === 4 ? '실행 → 실행중 목록 · 진행 5단계' : `단계 ${k} / 4 · 선택 후 다음`, 12, C);
  s += FOOT;
  return page(`B5 · 분석 서비스 — 분석 실행 ${k} / 4`, s);
}

// 5. 실행중 — 같은 실행 카드 + 레일 진행(추론 2 / 5 · 42 %) + 처리 중 타일 스캔 스트립 · 우 요약 + 로그
function runLive() {
  let s = head('분석 실행', SUBS[4]) + nodeRail(5);
  const rc = runCard(true); s += rc.s;
  const RY = rc.RY;
  s += rail5(RY, 2, 42);
  const GY = RY + 92;
  s += hl(X0, GY - 8, 776);
  s += `<div style="position:absolute;left:${X0}px;top:${GY}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:40px;line-height:1;color:${ACC}">42</span><span style="font-size:15px;color:${G}">%</span></div>\n` + lab(X0, GY + 46, '추론 · 2 / 5');
  const TX = X0 + 110, TW = 356;
  s += div(TX, GY + 12, TW, 10, `background:${H}`) + div(TX, GY + 12, Math.round(TW * .42), 10, `background:${ACC}`);
  s += div(TX, GY + 26, TW, 1, `background:${INK}`);
  for (let i = 0; i <= 20; i++) s += div(TX + i * TW / 20, GY + 26, 1, i % 5 ? 4 : 8, `background:${INK}`);
  s += num(TX, GY + 38, '0', 11, G) + num(TX + TW / 2 - 8, GY + 38, '50', 11, G) + num(TX + TW - 20, GY + 38, '100 %', 11, G);
  [['경과', '24분 ' + TAG()], ['잔여', '34분 ' + TAG()]].forEach(([kk, v], i) => { s += lab(X0 + 480, GY + 2 + i * 24, kk) + num(X0 + 520, GY + i * 24, v, 12.5); });
  [['필지', '702 / 1,674 ' + TAG()], ['시작', '13:42']].forEach(([kk, v], i) => { s += lab(X0 + 604, GY + 2 + i * 24, kk) + num(X0 + 644, GY + i * 24, v, 12.5, i ? G : INK); });
  const TY = GY + 76, TH = 60;
  ['tile-gh-clean.jpg', 'tile-done-2.jpg', 'tile-done-ecw.jpg', 'tile-done-x.jpg'].forEach((src, i) => {
    const x = X0 + i * 196, done = i < 1, on = i === 1;
    let over = '';
    if (done) over = svgPolys(180, TH, ['40,-6 56,-6 62,70 46,70', '70,-6 86,-6 92,70 76,70', '104,-6 120,-6 126,70 110,70'], .18, 1.2) + det(6, TH - 22, '완료');
    if (on) over = `<svg width="180" height="${TH}" viewBox="0 0 180 ${TH}" style="position:absolute;left:0;top:0;display:block"><rect x="0" y="0" width="76" height="${TH}" fill="rgba(15,169,160,.10)"/><rect x="60" y="0" width="16" height="${TH}" fill="rgba(15,169,160,.18)"/><line x1="76" y1="0" x2="76" y2="${TH}" stroke="${TEAL}" stroke-width="1.5"/></svg>` + brkIn(180, TH, ACC, 10) + det(6, TH - 22, 'SCAN 42 %', AMB);
    s += img(x, TY, 180, TH, src, over, `outline:1px solid ${H}${on || done ? '' : ';filter:grayscale(1);opacity:.55'}`);
    s += num(x, TY + TH + 4, `타일 ${i + 1} / 4 · ${done ? '완료' : on ? '추론 중' : '대기'}`, 11.5, done ? TEAL : on ? ACC : C);
  });
  const RX = 960, RW = 424, RI = 984, RIW = 376;
  s += div(RX, 156, RW, 744, 'background:#FFFFFF') + vl(RX, 156, 744, INK);
  s += disp(RI, 178, '실행 요약', 20) + num(RI + 100, 184, '실행중', 13, ACC) + hl(RI, 214, RIW);
  let y = 226;
  [['과제', TASK[1] + ' · ' + TASK[2]], ['모델', `${MODEL[0]} · ${MODEL[1]} · ${MODEL[2]}`], ['영상', `${IMG_SEL.label} · 1.69 cm · ${AREA}`], ['파라미터', PARAMS.join(' · ') + ' ' + TAG()], ['산출물', 'GPKG · GeoJSON · XLSX · EPSG:5186']].forEach(([kk, v]) => { s += lab(RI, y + 2, kk) + txt(RI + 76, y, v, 12.5, INK, `width:${RIW - 76}px;overflow:hidden;text-overflow:ellipsis`); y += 28; });
  s += hl(RI, y + 4, RIW);
  y += 20;
  s += disp(RI, y, '실행 로그', 15) + num(RI + 70, y + 3, '시각 · 단계 · 상태', 12, G);
  s += `<div style="position:absolute;left:${RI + RIW - 16}px;top:${y + 4}px">${ico('refresh', G, 13)}</div>\n`;
  y += 30;
  s += hl(RI, y, RIW);
  const LOG = [
    ['13:42:00', '대기열 등록', '완료', TEAL], ['13:42:31', '전처리', '시작', TEAL], ['13:51:08', '전처리', '완료 · 타일 4', TEAL],
    ['13:51:10', '추론', '시작 · v5', ACC], ['14:06:12', '추론', '타일 1 / 4 완료', ACC], ['14:06:40', '추론', '타일 2 / 4 · 42 %', ACC],
    ['—', '후처리', '대기', C], ['—', '벡터화', '대기', C], ['—', '저장', '대기', C],
  ];
  LOG.forEach(([t, st_, w, col], i) => {
    const ry = y + 1 + i * 30;
    s += num(RI, ry + 8, t, 12, col === C ? C : G) + txt(RI + 84, ry + 7, st_, 12.5, col === C ? C : INK) + `<div class="st" style="position:absolute;left:${RI + 160}px;top:${ry + 9}px;width:${RIW - 160}px;text-align:right;color:${col}">${w}</div>\n` + hl(RI, ry + 29, RIW);
  });
  y += 1 + LOG.length * 30 + 8;
  s += num(RI, y, '시연 · 원본 상태어 = 대기 · 전처리중 · 분석중 · 후처리중 · 완료', 11.5, C);
  const cy = 804;
  s += hbtn(RI, cy, 88, '취소', WARN, WARN) + hbtn(RI + 100, cy, 128, '새로 분석하기', G);
  s += `<div style="position:absolute;left:${RI + 240}px;top:${cy}px;width:${RIW - 240}px;height:36px;border:1px dashed ${C};display:flex;align-items:center;justify-content:center;font-size:15px;color:${C}">결과 보기</div>\n`;
  s += txt(RI, 850, '완료 → 결과 보기 활성 · 실행중 목록 = 세그먼트 실행중 3', 12, C);
  s += FOOT;
  return page('B5 · 분석 서비스 — 분석 실행 · 실행중', s);
}

for (let k = 1; k <= 4; k++) wr(`B5-Analysis-Run-${k}.dc.html`, runStep(k));
wr('B5-Analysis-Run-5.dc.html', runLive());
