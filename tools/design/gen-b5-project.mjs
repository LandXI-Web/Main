// B5 프로젝트 4판 — 5차(이미지 우선) 재생성기
// 발주 원문(2026-08-27): "글이 너무 많다. 시각적으로 이미지 중심으로 의사결정이 명확하게 하면 되는건데.
//   글이 잔뜩 있어서 어지럽고 어려운 시스템 처럼 보인다."
// 규칙 — ① 아트보드 안 설계 주석 0(NOTES.md 로) ② 실크롭이 판마다 가장 큰 객체 ③ 화면당 검정 CTA 1
//        ④ Paperlogy 700/800 표시 · Pretendard 본문 · T3 액센트 #006DF7 + 틴트(landxi/proto/fonts-system.css 토큰과 동일값)
//        ⑤ 파리티 = NOTES.md §15.2 표(원본 컨트롤 1회씩)
// usage: node tools/design/gen-b5-project.mjs   (repo root) — 4판을 통째로 다시 쓴다(멱등).
// 레일 72 = tools/design/b5-rail.html(프로젝트 활성) 을 그대로 끼운다.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
const RAIL = fs.readFileSync(path.join(root, 'tools/design/b5-rail.html'), 'utf8').replace(/\r\n/g, '\n');
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0';
const X0 = 128, XR = 904, W = 776;           // 본문 열: 마진 56 · 드로어 960 앞 56
const DX = 960, DW = 480, DI = 984, DIW = 432; // 우 드로어 480 · 안쪽 432

// ---------- 헬멧 ----------
const HELMET = `<helmet><style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
/* Paperlogy 700/800 표시 · Pretendard 본문 · Inter 표 숫자 — T3 (발주 결정 2026-08-27) */
@font-face{font-family:'Paperlogy';font-weight:800;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2') format('woff2')}
@font-face{font-family:'Paperlogy';font-weight:700;font-display:swap;src:url('https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2') format('woff2')}
/* 토큰 = landxi/proto/fonts-system.css (--accent · --tint-1 · --tint-2) 와 같은 값 */
:root{--ink:#010102;--grey:#686868;--grey-2:#CCCCCC;--line:#DDDDDD;--accent:#006DF7;--tint-1:#E8F1FF;--tint-2:#D6E6FF;--teal:#0FA9A0}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:var(--ink);font-family:'Pretendard',system-ui,sans-serif;font-weight:400;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.015em}
.d8{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:800;letter-spacing:-.02em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:12px;line-height:1.2;color:var(--grey);letter-spacing:.04em}
.st{font-size:12px;line-height:1.2;color:var(--accent);font-weight:500;letter-spacing:.01em}
.tag{border:1px dotted var(--grey-2);padding:0 5px;font-size:12px;line-height:16px;color:var(--grey);margin-left:6px;display:inline-block;vertical-align:1px;letter-spacing:0;font-weight:400}
.tb{position:absolute;height:28px;line-height:28px;font-size:13px;letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
.tb.on{background:var(--tint-2);padding:0 10px}
.cta{position:absolute;height:36px;background:var(--ink);color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0 20px;font-size:13px;font-weight:500;letter-spacing:-.01em;white-space:nowrap}
.fld{position:absolute;height:28px;border:1px solid var(--line);display:flex;align-items:center;padding:0 10px;gap:8px;font-size:12.5px;letter-spacing:-.01em;white-space:nowrap;color:var(--ink)}
.chip{height:22px;line-height:20px;padding:0 9px;border:1px solid var(--line);color:var(--ink);font-size:12px;white-space:nowrap;display:inline-block}
.tab{position:absolute;font-size:14px;letter-spacing:-.01em;color:var(--grey);white-space:nowrap;line-height:20px}
.tab b{font-weight:400;color:var(--ink)}
.tab .c{font-family:'Inter',system-ui,sans-serif;font-size:12px;color:var(--grey-2);margin-left:5px}
.tab.on{color:var(--ink)}
.tab.on .c{color:var(--accent)}
</style></helmet>`;

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const txt = (x, y, t, size = 13, col = INK, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;letter-spacing:-.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const num = (x, y, t, size = 13, col = INK, extra = '') => `<div class="n" style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;letter-spacing:.01em;color:${col};white-space:nowrap;line-height:1.3;${extra}">${t}</div>\n`;
const disp = (x, y, t, size, col = INK, extra = '') => `<div class="d" style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;line-height:1.1;color:${col};white-space:nowrap;${extra}">${t}</div>\n`;
const lab = (x, y, t, extra = '') => `<div class="lab" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const st = (x, y, t, extra = '') => `<div class="st" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${extra}">${t}</div>\n`;
const tb = (x, y, t, on = false, extra = '') => `<div class="tb${on ? ' on' : ''}" style="left:${x}px;top:${y}px;${extra}">${t}</div>\n`;
const cta = (x, y, w, t) => `<div class="cta" style="left:${x}px;top:${y}px;width:${w}px">${t}</div>\n`;
const chev = (col = G) => `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${col}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const fld = (x, y, w, inner, extra = '') => `<div class="fld" style="left:${x}px;top:${y}px;width:${w}px;${extra}">${inner}</div>\n`;
const sel = (x, y, w, t, col = INK) => fld(x, y, w, `<span style="color:${col}">${t}</span><span style="flex:1"></span>${chev()}`);
const search = (x, y, w, ph) => fld(x, y, w, `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${G}" stroke-width="1.5" style="flex:none"><circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/></svg><span style="color:${C}">${ph}</span>`);
const chk = (x, y, on) => `<div style="position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;border:1px solid ${on ? INK : C};background:${on ? INK : '#FFFFFF'}"></div>` + (on ? `<svg width="14" height="14" viewBox="0 0 14 14" style="position:absolute;left:${x}px;top:${y}px" fill="none" stroke="#FFFFFF" stroke-width="1.5"><path d="M3 7.2 6 10l5-6"/></svg>` : '') + '\n';
const brk = (x, y, w, h, col = INK, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>\n`;
const img = (x, y, w, h, src, over = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#FFFFFF;${extra}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block">${over}</div>\n`;
const pager = (x, y, cur = 1) => txt(x, y, '처음', 12.5, G) + txt(x + 33, y, '이전', 12.5, G) +
  div(x + 66, y - 3, 20, 20, `border:1px solid ${INK};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:12px">${cur}</span>`) +
  txt(x + 94, y, '다음', 12.5, G) + txt(x + 127, y, '마지막', 12.5, G);

// 청록 결과 폴리곤 — 기준 크기의 좌표를 목표 크기로 스케일(pj-greenhouse 402×226 · pj-hero 420×240)
const GH = { w: 402, h: 226, pts: ['125.6,-18.9 155.8,-18.9 169.6,244.9 139.4,244.9', '158.3,-18.9 188.4,-18.9 202.3,244.9 172.7,244.9', '208.5,-18.9 238.7,-18.9 251.3,244.9 221.7,244.9'] };
const HERO = { w: 420, h: 240, pts: ['118.1,51.1 293.3,47.8 295.3,76 112.9,80.6', '112.9,79.3 298.6,75.4 300.6,103.6 116.8,108.2', '115.5,106.9 305.2,103.6 307.1,134.4 118.1,138.4', '131.3,137.1 308.4,138.4 309.8,160.7 134.5,162.7'] };
const DET = { w: 204, h: 115, pts: ['57.4,24 142.5,22.4 143.4,36.1 54.8,38.4', '54.8,37.7 145,35.8 146,49.5 56.7,51.8', '56.1,51.1 148.2,49.5 149.2,64.5 57.4,66.4', '63.7,65.8 149.8,66.4 150.4,77.3 65.3,78.2'] };
const SEG = { w: 204, h: 115, pts: ['74.3,56.9 83.5,45.4 105.2,39 137.7,38.4 149.2,47.9 144.1,55.3 123.7,64.5 95.6,74.1 81.3,76', '73.9,86.2 82.2,86.2 95.6,102.8 90.8,107.9 76.5,116.5 57.4,107.9 56.7,102.1', '105.2,107.9 110.9,95.7 137.1,91.9 153.6,96.4 156.2,105.3 149.8,114.9 124.3,117.4 108.4,115.5'] };
function poly(w, h, base, sw = 1.1) {
  const sx = w / base.w, sy = h / base.h;
  const ps = base.pts.map(p => p.split(' ').map(q => { const [a, b] = q.split(',').map(Number); return `${(a * sx).toFixed(1)},${(b * sy).toFixed(1)}`; }).join(' '));
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none">` +
    ps.map(p => `<polygon points="${p}" fill="rgba(15,169,160,.10)" stroke="${TEAL}" stroke-width="${sw}" stroke-linejoin="miter"/>`).join('') + `</svg>`;
}
const brkIn = (w, h, col = INK, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>`;

// ---------- 공통 조각 ----------
const page = (title, body) => `<!doctype html>
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
<div style="width:1440px;height:900px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard',system-ui,sans-serif;color:#010102">
${RAIL}${vl(72, 0, 900)}${body}</div>
</x-dc>
</body>
</html>
`;
const FOOT = hl(72, 866, 888) + txt(X0, 876, 'LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부', 12, G);
const drawer = (title) => div(DX, 64, DW, 836, 'background:#FFFFFF') + vl(DX, 64, 836, INK) +
  disp(DI, 86, title, 20) +
  `<div style="position:absolute;left:1404px;top:90px"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.3"><path d="M.75.75l10.5 10.5M11.25.75.75 11.25"/></svg></div>\n` +
  hl(DI, 122, DIW);
const back = () => txt(X0, 22, '‹ 프로젝트 목록', 13, G) + hl(72, 64, 1368);
// 탭 6 — 배지 = 건수. 위치 고정(개요 · 데이터 10 · 라벨링 3 · 학습 5 · 분석 · 배포 1)
const TABS = [['개요', '', 128, 28], ['데이터', '10', 184, 62], ['라벨링', '3', 274, 56], ['학습', '5', 358, 44], ['분석', '', 430, 28], ['배포', '1', 486, 44]];
function tabs(y, active) {
  let s = '';
  for (const [t, c, x, w] of TABS) {
    const on = t === active;
    s += `<div class="tab${on ? ' on' : ''}" style="left:${x}px;top:${y}px">${t}${c ? `<span class="c">${c}</span>` : ''}</div>\n`;
    if (on) s += div(x, y + 28, w, 2, `background:${INK}`);
  }
  return s + hl(72, y + 30, 888);
}
// 접힌 헤더 96(데이터 · 학습 탭) — 이름 24 + 탭
const headCollapsed = (active) => back() + disp(X0, 82, '비닐하우스 탐지', 24) + st(X0 + 176, 92, '학습 완료 · IoU 0.82') + tabs(130, active);

// ======================================================================
// 1. B5-Projects — 목록 · 실크롭 카드 402×240 × 2열 · 만들기 드로어
// ======================================================================
function projects() {
  let s = '';
  s += disp(X0, 16, '프로젝트', 32) + num(1384 - 480 - 56 - 100, 30, '총 8건 중 1–8행', 12.5, G, 'text-align:right;width:100px') + hl(72, 64, 1368);
  // 툴바 y 80 — 원본 컨트롤: 검색 · 초기화 · 검색 · 페이지 크기 · 페이지네이션 · 만들기(드로어 열림 = 틴트 활성)
  const ty = 80;
  s += search(X0, ty, 176, '프로젝트명') + tb(316, ty, '초기화', false, `color:${G}`) + tb(364, ty, '검색') + vl(404, ty + 4, 20) +
    lab(416, ty + 8, '페이지 크기') + sel(484, ty, 54, '10') + vl(552, ty + 4, 20) + pager(564, ty + 7) +
    tb(XR - 110, ty, '프로젝트 만들기', true, 'width:110px;text-align:center');
  s += hl(X0, 120, W);
  // 카드 8 — 2열 402 · 이미지 240(79 %) · 이름 / 메타 1줄 / 상태어 1
  const cards = [
    ['비닐하우스 탐지', 'pj-greenhouse.jpg', '객체 탐지 · 클래스 1 · 236.7 MB', '학습 완료 · 2025-07', true],
    ['도로망 세그멘테이션', 'pj-road.jpg', '세그멘테이션 · 클래스 1 · 249.2 MB', '학습 완료 · 2025-08'],
    ['차량·교통량 탐지', 'pj-car.jpg', '객체 탐지 · 클래스 4 · 114.4 MB', '학습 완료 · 2025-07'],
    ['토지형질 SegFormer<span class="tag">추정</span>', 'pj-land.jpg', '세그멘테이션 · 클래스 6 · 15.0 MB', '학습 완료 · 2023-12'],
    [null, 'pj-jeju2020.jpg'], [null, 'pj-nw2510.jpg'],
  ];
  const CW = 372, CH = 224, GAP = W - CW * 2;
  cards.forEach(([name, src, meta, status, hover], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = X0 + col * (CW + GAP), y = 136 + row * 306;
    let over = '';
    if (hover) over = poly(CW, CH, GH) + brkIn(CW, CH, ACC) + `<div style="position:absolute;right:10px;bottom:8px;font-size:12px;color:#FFFFFF;letter-spacing:-.01em">변경 ›</div>`;
    s += img(x, y, CW, name ? CH : Math.min(CH, 856 - y), src, over, hover ? `outline:12px solid ${T1};outline-offset:0` : '');
    if (!name) return;                       // 3행 = 스크롤(이미지만 보인다)
    s += disp(x, y + CH + 12, name, 17) + num(x, y + CH + 38, meta, 12, G) + st(x, y + CH + 58, status);
    if (hover) s += txt(x + CW - 40, y + CH + 12, '열기 ›', 13, INK);
  });
  // 우 드로어 — 원본 ② 만들기 폼(프로젝트명 · 탐지유형 카드 2 · 학습 데이터 유형 · 권장 해상도 · 클래스 · 목록/취소/만들기)
  s += drawer('프로젝트 만들기');
  s += lab(DI, 140, '프로젝트명') + fld(DI, 160, DIW, `<span style="font-size:13.5px">남원 비닐하우스 2026</span><span style="flex:1"></span><span class="n" style="font-size:12px;color:${G}">13/100</span>`, `height:36px;border-color:${INK}`);
  s += lab(DI, 214, '탐지유형');
  s += img(DI, 234, 208, 117, 'pj-radio-det.jpg', poly(208, 117, DET, .9) + brkIn(208, 117, INK, 12, 1.5)) + img(DI + 224, 234, 208, 117, 'pj-radio-seg.jpg', poly(208, 117, SEG, .9));
  s += txt(DI, 358, '객체 탐지', 13) + txt(DI + 224, 358, '세그멘테이션', 13, G);
  s += lab(DI, 400, '학습 데이터 유형') + sel(DI, 420, DIW, '정사영상 (ortho)');
  s += lab(DI, 466, '권장 해상도<span class="tag">추정</span>') + sel(DI, 486, DIW, '≤ 0.02 m/px');
  s += lab(DI, 532, '클래스') + fld(DI, 552, DIW, `<span class="chip">비닐하우스_단동</span><span class="chip">비닐하우스_다동</span><span style="color:${C}">+</span>`, 'height:36px');
  s += hl(DI, 818, DIW) + tb(DI, 830, '목록', false, `color:${G}`) + tb(DI + 48, 830, '취소', false, `color:${G}`) + cta(1416 - 120, 826, 120, '프로젝트 만들기');
  s += FOOT;
  return page('B5 · 프로젝트 — 목록', s);
}

// ======================================================================
// 2. B5-Project-Overview — 히어로 776×436 + 큰 수 4 · 정보/구성원 = 드로어
// ======================================================================
function overview() {
  let s = back();
  s += disp(X0, 80, '비닐하우스 탐지', 40) + st(X0 + 4, 130, '학습 완료 · 다음 할 일 = 라벨링 3/10');
  // 원본 ③ 컨트롤 — 수정 · 구성원 초대 · 삭제(텍스트) · 목록(= ‹ 프로젝트 목록) · CTA 1 = 다음 할 일
  s += tb(XR - 300, 92, '수정', false, `color:${G}`) + tb(XR - 300 + 44, 92, '구성원 초대', false, `color:${G}`) + tb(XR - 300 + 128, 92, '삭제', false, `color:${G}`) + cta(XR - 128, 88, 128, '라벨링 이어하기');
  s += tabs(160, '개요');
  // 히어로 = 대표 이미지(도엽 1 AOI 크롭 · 자동) + 결과 폴리곤 + 캡션 · 변경 ›
  const HY = 212, HH = 436;
  s += img(X0, HY, W, HH, 'pj-hero.jpg', poly(W, HH, HERO, 1.2) + brkIn(W, HH, INK, 14));
  s += num(X0, HY + HH + 10, '남원 농경지 2025.06 · 도엽 1 · GSD 0.017 m/px', 12, G) + txt(XR - 100, HY + HH + 8, '대표 이미지 변경 ›', 13, INK, 'width:100px;text-align:right');
  // 큰 수 4 — 결과 필지(액센트) · IoU · 도엽 · 데이터셋
  const ky = 688, kw = W / 4;
  [['1,674', '탐지 필지', ACC], ['0.82', 'IoU · 최근 학습', INK], ['10', '정사영상 도엽', INK], ['2', '데이터셋', INK]].forEach(([n, l, col], i) => {
    const x = X0 + i * kw;
    if (i) s += vl(x - 16, ky + 4, 64);
    s += `<div class="d8" style="position:absolute;left:${x}px;top:${ky}px;font-size:48px;line-height:1;color:${col};font-variant-numeric:tabular-nums">${n}</div>\n` + lab(x + 2, ky + 58, l);
  });
  // 드로어 = 프로젝트 정보(kv 6) + 구성원 3 + 초대 인라인 + 최근 활동 2
  s += drawer('프로젝트 정보');
  const kv = [['프로젝트명', '비닐하우스 탐지'], ['탐지유형', '객체 탐지'], ['학습데이터 유형', '정사영상 (ortho)'], ['권장 해상도', '≤ 0.02 m/px<span class="tag">추정</span>'], ['등록일시', '—'], ['최근 학습', '2025-07 · best(Vinylhouse).pt']];
  kv.forEach(([k, v], i) => { const y = 140 + i * 30; s += lab(DI, y + 3, k) + txt(DI + 120, y, v, 13) + hl(DI, y + 26, DIW); });
  s += lab(DI, 336, 'CLASSES 2') + `<div style="position:absolute;left:${DI}px;top:${356}px;display:flex;gap:6px"><span class="chip">비닐하우스_단동 <span class="n" style="color:${ACC}">1,469</span></span><span class="chip">비닐하우스_다동 <span class="n" style="color:${ACC}">205</span></span></div>\n`;
  s += hl(DI, 400, DIW) + disp(DI, 416, '구성원 3', 15) + txt(1416 - 30, 418, '삭제 ›', 12, G);
  for (let i = 0; i < 3; i++) { const y = 452 + i * 34; s += chk(DI, y + 6, false) + div(DI + 26, y, 26, 26, `border:1px solid ${H}`) + txt(DI + 62, y + 4, '—', 13, G) + txt(DI + 250, y + 4, ['소유자', '편집자', '편집자'][i], 12.5, G) + hl(DI, y + 32, DIW); }
  // 초대 인라인 행(원본 모달 3필드: 아이디 확인 → 이름 자동 · 역할)
  const iy = 566;
  s += div(DI, iy - 8, DIW, 44, `background:${T1}`) + fld(DI + 8, iy, 168, `<span style="color:${C}">아이디(이메일)</span>`) + tb(DI + 184, iy, '확인') + txt(DI + 224, iy + 7, '이름 —', 12.5, G) + sel(DI + 290, iy, 86, '편집자') + tb(DI + 386, iy, '초대', false, `color:${ACC}`);
  s += hl(DI, 630, DIW) + disp(DI, 646, '최근 활동', 15);
  [['2026-06-06', '라벨 1,674 필지 저장'], ['2025-07', '학습 완료 · best(Vinylhouse).pt']].forEach(([d, t], i) => { const y = 680 + i * 28; s += num(DI, y, d, 12, G) + txt(DI + 92, y, t, 13); });
  s += FOOT;
  return page('B5 · 프로젝트 — 개요', s);
}

// ======================================================================
// 3. B5-Project-Data — 파일 그리드 3열 248×150 · 데이터셋 띠 · 파일 추가 드로어
// ======================================================================
function data() {
  let s = headCollapsed('데이터');
  // 세그먼트 2 + 원본 ④ 툴바 7종(유형 · 검색필드 · 검색어 · 초기화 · 검색 · 체크/선택 제외 · 파일 추가)
  const sy = 176;
  s += `<div class="tab on" style="left:${X0}px;top:${sy + 4}px">파일<span class="c">10</span></div>\n` + div(X0, sy + 32, 44, 2, `background:${INK}`) +
    `<div class="tab" style="left:${X0 + 72}px;top:${sy + 4}px">데이터셋<span class="c">2</span></div>\n`;
  s += sel(X0 + 176, sy, 78, '전체', G) + sel(X0 + 262, sy, 88, '데이터명', G) + search(X0 + 358, sy, 128, '검색어') + tb(X0 + 494, sy, '초기화', false, `color:${G}`) + tb(X0 + 540, sy, '검색') +
    chk(X0 + 592, sy + 7, false) + tb(X0 + 612, sy, '선택 제외', false, `color:${G}`) + tb(XR - 70, sy, '파일 추가', true, 'width:70px;text-align:center');
  s += hl(X0, sy + 34, W);
  // 타일 3열 — 이미지 248×150 + 이름 / 상태어(라벨 수) · 선택 = 틴트 띠 + 액센트 브래킷
  const files = [
    ['남원 농경지 2025.04', '0.011 m/px', 'pj-hero.jpg', '라벨 —'], ['남원 농경지 2025.06', '0.017 m/px', 'tile-gh-clean.jpg', '라벨 1,674', true], ['남원 농경지 2025.08', '0.015 m/px', 'tile-farm-clean.jpg', '라벨 —'],
    ['남원 농경지 2025.10', '0.017 m/px', 'pj-nw2510.jpg', '라벨 —'], ['남원 전역 2025.04', '2.00 m/px', 'tile-arc-a.jpg', '라벨 —'], ['남원 전역 2025.10', '2.00 m/px', 'tile-ep-4.jpg', '라벨 —'],
    ['국산리 드론 A68 2025.08', '0.050 m/px', 'tile-kuksan-1.jpg', '라벨 —'], ['국산리 드론 A71 2025.08', '0.050 m/px', 'tile-ep-1.jpg', '라벨 —'], ['제주 항공 정사영상 2022.12', '0.120 m/px', 'tile-arc-jeju.jpg', '+1'],
  ];
  const TW = 248, TH = 140, TG = (W - TW * 3) / 2, RH = 184, GY = 224;
  files.forEach(([name, gsd, src, lb, on], i) => {
    const x = X0 + (i % 3) * (TW + TG), y = GY + Math.floor(i / 3) * RH;
    if (on) s += div(x - 8, y - 8, TW + 16, RH, `background:${T1}`);
    const more = lb === '+1' ? `<div style="position:absolute;inset:0;background:rgba(1,1,2,.45)"></div><div class="d8" style="position:absolute;right:14px;bottom:8px;font-size:32px;color:#FFFFFF">+1</div>` : '';
    s += img(x, y, TW, TH, src, more + (on ? brkIn(TW, TH, ACC) : ''));
    s += txt(x, y + TH + 8, name, 13, INK, `width:${TW - 80}px;overflow:hidden;text-overflow:ellipsis`);
    if (lb !== '+1' && lb !== '라벨 —') s += st(x + TW - 80, y + TH + 10, lb, 'width:80px;text-align:right');
  });
  // 데이터셋 띠(원본 ⑥: 표 · 선택 삭제 · 데이터셋 만들기)
  const dy = 778;
  s += hl(X0, dy, W) + disp(X0, dy + 10, '데이터셋 2', 14) + txt(XR - 176, dy + 11, '선택 삭제', 12.5, G) + txt(XR - 96, dy + 11, '데이터셋 만들기 ›', 13, INK, 'width:96px;text-align:right');
  [['비닐하우스 단동 라벨셋', 'v1.0', '1,469', '2026-06-06'], ['비닐하우스 다동 라벨셋', 'v1.0', '205', '2026-06-06']].forEach((r, i) => {
    const y = dy + 38 + i * 22;
    s += chk(X0, y + 2, false) + txt(X0 + 24, y, r[0] + '<span class="tag">추정</span>', 12.5) + num(X0 + 300, y, r[1], 12, G) + num(X0 + 380, y, '라벨 ' + r[2], 12, ACC) + num(X0 + 500, y, r[3], 12, G);
  });
  // 드로어 = 파일 추가(원본 모달 → 드로어): 유형 · 검색 · 초기화/검색 · 아카이브 8건(썸네일 96×54 · 체크) · 페이지네이션 · 취소 / 추가
  s += drawer('파일 추가');
  s += sel(DI, 136, 96, '전체', G) + search(DI + 104, 136, 200, '검색어') + tb(DI + 312, 136, '초기화', false, `color:${G}`) + tb(DI + 360, 136, '검색');
  const arc = [
    ['남원 정사영상 2026-04 A구역', '2026.04 · 1.08 cm', 'tile-arc-a.jpg', 'on', '시연'], ['운봉읍 드론 정사영상 2026-04', '2026.04 · 1.69 cm', 'tile-arc-hid.jpg', 'on', '시연'],
    ['남원 전역 2025.10', '2025.10 · 2.00 m/px', 'tile-ep-4.jpg', 'added'], ['국산리 드론 A68 2025.08', '2025.08 · 0.05 m/px', 'tile-kuksan-1.jpg', 'added'],
    ['남원 도로파손 라벨 셰입 2026-04', '2026.04 · 미리보기 없음', null, '', '시연'], ['순찰차량 도로영상 2026-04', '2026.04 · 4,820장', 'pj-car.jpg', '', '시연'],
    ['여수 해양쓰레기 조사 2026', '2026 · 86 셀', 'tile-arc-yeosu.jpg', ''], ['제주 항공 정사영상 2020.12', '2020.12 · 0.10 m/px', 'pj-jeju2020.jpg', 'added'],
  ];
  arc.forEach(([n, m, src, state, tg], i) => {
    const y = 182 + i * 72, dim = state === 'added';
    if (state === 'on') s += div(DX + 1, y - 6, DW - 1, 70, `background:${T1}`);
    s += chk(DI, y + 20, state === 'on');
    s += src ? img(DI + 26, y, 96, 54, src, '', dim ? 'opacity:.45' : '') : div(DI + 26, y, 96, 54, `border:1px dotted ${C}`);
    s += txt(DI + 134, y + 18, n + (tg ? `<span class="tag">${tg}</span>` : ''), 13, dim ? C : INK);
    s += hl(DI, y + 64, DIW);
  });
  s += pager(DI, 768);
  s += hl(DI, 818, DIW) + st(DI, 838, '선택 2건') + tb(DI + 300, 830, '취소', false, `color:${G}`) + cta(1416 - 84, 826, 84, '파일 추가');
  s += FOOT;
  return page('B5 · 프로젝트 — 데이터', s);
}

// ======================================================================
// 4. B5-Project-Train — 상태 열 4 · 결과 크롭 96 카드 5 · 결과 드로어(크롭 432×243 + 큰 수 2)
// ======================================================================
function train() {
  let s = headCollapsed('학습');
  const sy = 176;
  s += search(X0, sy, 200, '학습명') + cta(XR - 112, sy - 4, 112, '새로 학습하기');
  s += hl(X0, sy + 34, W);
  // 상태 열 4 — 대기 2 / 진행 2 / 완료 1 / 실패 0 (원본 시드 5건 · 시연)
  const cols = [['대기', 2], ['진행', 2], ['완료', 1], ['실패', 0]];
  const CW = 182, CG = (W - CW * 4) / 3, CY = 226;
  const runs = [
    [0, '학습 #5', 'tile-gh-clean.jpg', '라벨 4,200 · 2026.06.11', '대기'], [0, '비닐하우스 v1.0', 'pj-hero.jpg', 'IoU 0.71 · F1 0.76', '대기 · 재학습'],
    [1, '학습 #4', 'tile-farm-clean.jpg', '라벨 4,200 · 2026.06.11', '진행 중'], [1, '비닐하우스 v2.0', 'pj-nw2510.jpg', 'IoU 0.78 · F1 0.83', '진행 중 · 35 m'],
    [2, '비닐하우스 v2.1', 'pj-greenhouse.jpg', 'IoU 0.82 · F1 0.87', '완료 · 1 h 35 m', true],
  ];
  cols.forEach(([t, c], i) => {
    const x = X0 + i * (CW + CG);
    s += disp(x, CY, t, 15) + num(x + 34, CY + 1, String(c), 14, c ? ACC : C) + hl(x, CY + 28, CW);
    if (!c) s += div(x, CY + 44, CW, 96, `border:1px dotted ${C}`);
  });
  const per = [0, 0, 0, 0];
  runs.forEach(([col, name, src, meta, status, sel]) => {
    const x = X0 + col * (CW + CG), y = CY + 44 + per[col]++ * 176;
    if (sel) s += div(x - 8, y - 8, CW + 16, 168, `background:${T1}`);
    const over = (col === 2 ? poly(CW, 96, GH, 1) : '') + (col === 1 ? `<div style="position:absolute;left:0;bottom:0;height:2px;width:${name.includes('#4') ? 12 : 58}%;background:${ACC}"></div>` : '') + (sel ? brkIn(CW, 96, ACC) : '');
    s += img(x, y, CW, 96, src, over) + disp(x, y + 106, name, 14) + num(x, y + 126, meta, 12, G) + st(x, y + 144, status, col === 0 ? `color:${G}` : '');
  });
  // 드로어 = 학습 결과 5섹션(정보 · 설정 · 결과 · 클래스별 · 행렬) — 이미지 먼저
  s += drawer('비닐하우스 v2.1<span class="tag">시연</span><span class="st" style="font-size:13px;margin-left:10px;vertical-align:3px">완료</span>');
  s += img(DI, 136, DIW, 243, 'pj-greenhouse.jpg', poly(DIW, 243, GH, 1.1) + brkIn(DIW, 243, INK));
  s += num(DI, 386, '남원 농경지 2025.06 · 검증 셋 20 %', 12, G);
  s += `<div class="d8" style="position:absolute;left:${DI}px;top:412px;font-size:56px;line-height:1;color:${ACC};font-variant-numeric:tabular-nums">0.82</div>\n` + lab(DI + 2, 474, 'IoU 영역 일치도');
  s += `<div class="d8" style="position:absolute;left:${DI + 216}px;top:412px;font-size:56px;line-height:1;color:${INK};font-variant-numeric:tabular-nums">0.87</div>\n` + lab(DI + 218, 474, 'F1 종합 정확도') + num(DI + 340, 476, 'v2.0 +0.04', 12, G);
  s += hl(DI, 500, DIW);
  // 학습 정보 + 설정 = 새로 학습하기 폼과 같은 필드(학습명 · 기반 모델 · 데이터셋 · 이미지 크기 · 학습:검증 · 에폭 · 배치 · IoU/Conf)
  const kv = [['학습 시작', '2026.05.18 07:40'], ['소요', '1시간 35분'], ['라벨', '3,842'], ['데이터셋', '남원 농경지 2025.04 · 06 · 08'], ['기반 모델', 'XI-VFM v2.1'], ['이미지 크기', '640 × 640'], ['학습 : 검증', '80 : 20'], ['에폭 · 배치', '100 · 16'], ['IoU · Conf', '0.5 · 0.25']];
  kv.forEach(([k, v], i) => { const col = i % 2, row = Math.floor(i / 2); const x = DI + col * 216, y = 514 + row * 40; s += lab(x, y, k) + num(x, y + 16, v, 13); });
  // 클래스별 성능(헤어라인 막대 · 전체 F1 만 값) + 오분류 행렬 3×3(값 없음)
  const py = 720;
  s += hl(DI, py - 6, DIW) + lab(DI, py + 4, '클래스별 F1');
  [['전체', .87, '0.87'], ['비닐하우스_단동', 0, '—'], ['비닐하우스_다동', 0, '—']].forEach(([k, v, t], i) => {
    const y = py + 26 + i * 20;
    s += txt(DI, y, k, 12, G) + div(DI + 116, y + 8, 120, 1, `background:${H}`) + (v ? div(DI + 116, y + 7, 120 * v, 3, `background:${INK}`) : '') + num(DI + 244, y, t, 12, v ? INK : C);
  });
  const mx = DI + 300, my = py + 4;
  s += lab(mx, my, '오분류 행렬');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += div(mx + c * 44, my + 20 + r * 20, 44, 20, `border:1px solid ${H};display:flex;align-items:center;justify-content:center;font-size:12px;color:${C}`, '—');
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + txt(1416 - 140, 836, '배포 탭에서 이 결과 발행 ›', 13, INK, 'width:140px;text-align:right');
  s += FOOT;
  return page('B5 · 프로젝트 — 학습', s);
}

wr('B5-Projects.dc.html', projects());
wr('B5-Project-Overview.dc.html', overview());
wr('B5-Project-Data.dc.html', data());
wr('B5-Project-Train.dc.html', train());
