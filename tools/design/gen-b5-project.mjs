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
body{margin:0;background:#FFFFFF;color:var(--ink);font-family:'Pretendard',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.5;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.015em}
.d8{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:800;letter-spacing:-.02em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:var(--grey);letter-spacing:.04em}
.st{font-size:14px;line-height:1.2;color:var(--accent);font-weight:500;letter-spacing:.01em}
.tag{border:1px dotted var(--grey-2);padding:0 5px;font-size:14px;line-height:18px;color:var(--grey);margin-left:6px;display:inline-block;vertical-align:1px;letter-spacing:0;font-weight:400}
.tb{position:absolute;height:28px;line-height:30px;font-size:15px;letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
.tb.on{background:var(--tint-2);padding:0 10px}
.cta{position:absolute;height:36px;background:var(--ink);color:#FFFFFF;display:flex;align-items:center;justify-content:center;padding:0 20px;font-size:15px;font-weight:500;letter-spacing:-.01em;white-space:nowrap}
.fld{position:absolute;height:28px;border:1px solid var(--line);display:flex;align-items:center;padding:0 10px;gap:8px;font-size:14.5px;letter-spacing:-.01em;white-space:nowrap;color:var(--ink)}
.chip{height:22px;line-height:22px;padding:0 9px;border:1px solid var(--line);color:var(--ink);font-size:14px;white-space:nowrap;display:inline-block}
.tab{position:absolute;font-size:16px;letter-spacing:-.01em;color:var(--grey);white-space:nowrap;line-height:22px}
.tab b{font-weight:400;color:var(--ink)}
.tab .c{font-family:'Inter',system-ui,sans-serif;font-size:14px;color:var(--grey-2);margin-left:5px}
.tab.on{color:var(--ink)}
.tab.on .c{color:var(--accent)}
</style></helmet>`;

// ---------- 프리미티브 ----------
const div = (x, y, w, h, extra = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">${inner}</div>\n`;
const hl = (x, y, w, col = H) => div(x, y, w, 1, `background:${col}`);
const vl = (x, y, h, col = H) => div(x, y, 1, h, `background:${col}`);
const UP = (s) => Math.max(14, s + 2);   // 2026-08-27 클라이언트 "글자 2포인트 키우기" — 호출부 수치는 그대로, 출력만 +2(바닥 14)
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
const brk = (x, y, w, h, col = INK, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:${x}px;top:${y}px;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${col}" stroke-width="${sw}"/></svg>\n`;
const img = (x, y, w, h, src, over = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#FFFFFF;${extra}"><img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block">${over}</div>\n`;
const pager = (x, y, cur = 1) => txt(x, y, '처음', 12.5, G) + txt(x + 33, y, '이전', 12.5, G) +
  div(x + 66, y - 3, 20, 20, `border:1px solid ${INK};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:14px">${cur}</span>`) +
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
// 1. B5-Projects — 목록 · 실크롭 카드 372×224 × 2열 · 우 패널 = 프로젝트 조회(선택 카드)
//    발주(2026-08-27): "첫번째 화면은 프로젝트 목록이고 오른쪽은 만들기가 아니라 프로젝트 조회여야 한다"
//    선택 없음 = 목록 현황판(행 8 · B5-DataMgmt 완료 현황과 같은 문법) — 이 판은 선택 있음(비닐하우스 탐지)
// ======================================================================
function projects() {
  let s = '';
  s += disp(X0, 16, '프로젝트', 32) + num(1384 - 480 - 56 - 100, 30, '총 8건 중 1–8행', 12.5, G, 'text-align:right;width:100px') + hl(72, 64, 1368);
  // 툴바 y 80 — 원본 컨트롤: 검색 · 초기화 · 검색 · 페이지 크기 · 페이지네이션 · 프로젝트 만들기(= 판의 검정 CTA 1 → 판 1)
  const ty = 80;
  s += search(X0, ty, 176, '프로젝트명') + tb(316, ty, '초기화', false, `color:${G}`) + tb(364, ty, '검색') + vl(404, ty + 4, 20) +
    lab(416, ty + 8, '페이지 크기') + sel(484, ty, 54, '10') + vl(552, ty + 4, 20) + pager(564, ty + 7) +
    cta(XR - 120, ty - 4, 120, '프로젝트 만들기');
  s += hl(X0, 120, W);
  // 카드 8 — 2열 372 · 이미지 224(79 %) · 이름 / 메타 1줄 / 상태어 1 · 선택 = 틴트 아웃라인 + 액센트 브래킷(열기·변경은 우 패널로)
  const cards = [
    ['비닐하우스 탐지', 'pj-greenhouse.jpg', '객체 탐지 · 클래스 1 · 236.7 MB', '학습 완료 · 2025-07', true],
    ['도로망 세그멘테이션', 'pj-road.jpg', '세그멘테이션 · 클래스 1 · 249.2 MB', '학습 완료 · 2025-08'],
    ['차량·교통량 탐지', 'pj-car.jpg', '객체 탐지 · 클래스 4 · 114.4 MB', '학습 완료 · 2025-07'],
    ['토지형질 SegFormer<span class="tag">추정</span>', 'pj-land.jpg', '세그멘테이션 · 클래스 6 · 15.0 MB', '학습 완료 · 2023-12'],
    [null, 'pj-jeju2020.jpg'], [null, 'pj-nw2510.jpg'],
  ];
  const CW = 372, CH = 224, GAP = W - CW * 2;
  cards.forEach(([name, src, meta, status, on], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = X0 + col * (CW + GAP), y = 136 + row * 306;
    const over = on ? poly(CW, CH, GH) + brkIn(CW, CH, ACC) : '';
    s += img(x, y, CW, name ? CH : Math.min(CH, 856 - y), src, over, on ? `outline:12px solid ${T1};outline-offset:0` : '');
    if (!name) return;                       // 3행 = 스크롤(이미지만 보인다)
    s += disp(x, y + CH + 12, name, 17) + num(x, y + CH + 38, meta, 12, G) + st(x, y + CH + 58, status);
  });
  // ── 우 패널 480 = 프로젝트 조회(선택 카드) — 데이터관리 우 패널과 같은 조회 문법:
  //    대표 이미지 · 이름 + 상태어 · 주요 정보 kv 5 · 구성원 · 데이터 요약 · 헤어라인 액션 `열기 › · 수정 · 삭제`
  s += div(DX, 64, DW, 836, 'background:#FFFFFF') + vl(DX, 64, 836, INK);
  s += disp(DI, 86, '프로젝트 조회', 20) + num(1416 - 80, 92, '1 / 8 선택', 12.5, G, 'width:80px;text-align:right') + hl(DI, 122, DIW);
  s += img(DI, 138, DIW, 243, 'pj-greenhouse.jpg', poly(DIW, 243, GH) + brkIn(DIW, 243, ACC));
  s += lab(DI, 392, '대표 이미지 · 자동(첫 도엽 AOI)') + txt(1416 - 60, 390, '변경 ›', 12.5, G, 'width:60px;text-align:right');
  s += disp(DI, 418, '비닐하우스 탐지', 22) + st(DI, 452, '학습 완료 · 2025-07 · IoU 0.82');
  s += hl(DI, 478, DIW);
  // 주요 정보 kv 5 — 행 30
  const kv = [['탐지유형', '객체 탐지'], ['학습데이터 유형', '정사영상 (ortho)'], ['권장 해상도', '≤ 0.02 m/px<span class="tag">추정</span>'], ['등록일시', '2025-06-12 14:30<span class="tag">시연</span>'], ['최근 학습', '비닐하우스 v2.1 · 2025-07-21']];
  kv.forEach(([k, v], i) => { const y = 492 + i * 30; s += lab(DI, y + 4, k) + txt(DI + 140, y, v, 13) + hl(DI, y + 26, DIW); });
  // 구성원 · 데이터 요약 — 큰 수 3(Paperlogy 800 28) + 부제 1줄
  const by = 660;
  [['3', '구성원', '소유자 1 · 편집자 2'], ['10', '파일', '도엽 10 · 1.08 cm'], ['2', '데이터셋', '라벨 1,674']].forEach(([n, k, sub], i) => {
    const x = DI + i * 144;
    s += `<div class="d8 n" style="position:absolute;left:${x}px;top:${by}px;font-size:28px;line-height:1;color:${i === 2 ? ACC : INK}">${n}</div>\n` + lab(x + (n.length > 1 ? 40 : 24), by + 12, k) + txt(x, by + 40, sub, 12.5, G);
  });
  s += hl(DI, 728, DIW);
  // 액션 행 — 열기(허브 개요) · 수정 · 삭제 = 헤어라인 텍스트(검정 CTA 는 툴바 `프로젝트 만들기` 1)
  s += tb(DI, 742, '열기 ›', true, 'width:88px;text-align:center') + tb(DI + 104, 742, '수정', false, `color:${G}`) + tb(DI + 152, 742, '삭제', false, `color:${G}`);
  s += hl(DI, 818, DIW) + txt(DI, 830, '개요 · 데이터 10 · 라벨링 3 · 학습 5 · 분석 · 배포 1', 12.5, G);
  s += FOOT;
  return page('B5 · 프로젝트 — 목록', s);
}

// ======================================================================
// 2. B5-Project-Overview — 히어로 776×436 + 큰 수 4 · 정보/구성원 = 드로어
// ======================================================================
function overviewBody() {
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
    s += `<div class="d8" style="position:absolute;left:${x}px;top:${ky}px;font-size:50px;line-height:1;color:${col};font-variant-numeric:tabular-nums">${n}</div>\n` + lab(x + 2, ky + 58, l);
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
  return s;
}
const overview = () => page('B5 · 프로젝트 — 개요', overviewBody());

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
    const more = lb === '+1' ? `<div style="position:absolute;inset:0;background:rgba(1,1,2,.45)"></div><div class="d8" style="position:absolute;right:14px;bottom:8px;font-size:34px;color:#FFFFFF">+1</div>` : '';
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
// 4. B5-Project-Train — 7차: 학습 = 워크플로우 캔버스(노드 6 · 포트 · 헤어라인 연결) + 학습 곡선(에폭 눈금자 · 현재 에폭 테이프) + 이력 띠 + 결과 드로어
//    파라미터는 원본 10필드 그대로(학습명 · 기반 모델 · 이전 학습 이어가기 · 데이터셋 · 탐지 형태 · 이미지 크기 · 학습:검증 · 에폭 · 배치 · IoU/Conf) — 증강은 원본에 없어 `증강 없음` 판
// ======================================================================
// 노드 — 헤어라인 판 + 좌우 포트(6px 사각) · 상태어 위 · 이름 Paperlogy · 몸체 = 픽셀(실크롭) 또는 칩
const port = (x, y, on = true) => div(x - 3, y - 3, 6, 6, `background:${on ? INK : '#FFFFFF'};border:1px solid ${on ? INK : C}`);
const nchip = (x, y, t, fixed = false) => `<div style="position:absolute;left:${x}px;top:${y}px;height:22px;line-height:20px;padding:0 7px;border:1px ${fixed ? 'dotted' : 'solid'} ${fixed ? C : H};font-size:14px;white-space:nowrap;color:${fixed ? G : INK};letter-spacing:-.01em">${t}</div>\n`;
function node(x, y, w, h, name, state, stCol, inner, dotted = false, first = false, last = false) {
  let s = div(x, y, w, h, `border:1px ${dotted ? 'dotted' : 'solid'} ${dotted ? C : INK};background:#FFFFFF`);
  s += st(x + 10, y + 10, state, `color:${stCol}`) + disp(x + 10, y + 28, name, 14, dotted ? G : INK);
  s += inner;
  if (!first) s += port(x, y + h / 2, !dotted);
  if (!last) s += port(x + w, y + h / 2, !dotted);
  return s;
}
// 학습 곡선 — charts.html 문법(잉크 폴리라인 1.5 + #CCC 오프셋 그림자 · 헤어라인 눈금 · 예측 = 점선 고스트)
function trainChart(x, y) {
  const W = 776, Hh = 172, px0 = 40, px1 = 656, py0 = 14, py1 = 122;
  const ex = e => px0 + (px1 - px0) * e / 100, ey = v => py1 - (py1 - py0) * v;
  const loss = e => 0.19 + 0.74 * Math.exp(-e / 20) + 0.02 * Math.sin(e * 1.7) * Math.exp(-e / 40);
  const prec = e => 0.87 - 0.62 * Math.exp(-e / 16) - 0.02 * Math.sin(e * 1.3) * Math.exp(-e / 50);
  const prec2 = e => 0.83 - 0.62 * Math.exp(-e / 19) - 0.02 * Math.sin(e * 1.1) * Math.exp(-e / 50);
  const pts = (f, a, b) => { const o = []; for (let e = a; e <= b; e++) o.push(`${ex(e).toFixed(1)},${ey(f(e)).toFixed(1)}`); return o.join(' '); };
  const T = (tx, ty, t, col, anchor = 'middle', extra = '') => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="Inter,Pretendard,sans-serif" font-size="14" fill="${col}" ${extra}>${t}</text>`;
  let g = '';
  [0, .5, 1].forEach(v => { g += `<line x1="${px0}" x2="${px1}" y1="${ey(v)}" y2="${ey(v)}" stroke="${H}"/>` + T(px0 - 8, ey(v) + 5, v.toFixed(1), G, 'end'); });
  // 에폭 눈금자 0–100 · 10마다 긴 눈금 + 숫자
  for (let e = 0; e <= 100; e++) { const l = e % 10 ? 4 : 9; g += `<line x1="${ex(e).toFixed(1)}" x2="${ex(e).toFixed(1)}" y1="${py1 + 8}" y2="${py1 + 8 + l}" stroke="${e % 10 ? C : INK}"/>`; if (!(e % 10)) g += T(ex(e), py1 + 34, e, G); }
  g += `<line x1="${px0}" x2="${px1}" y1="${py1 + 8}" y2="${py1 + 8}" stroke="${INK}"/>`;
  // v2.1 완료 — loss 잉크 · precision 액센트
  g += `<polyline points="${pts(loss, 0, 100)}" fill="none" stroke="${C}" stroke-width="1" transform="translate(1,1)"/>`;
  g += `<polyline points="${pts(loss, 0, 100)}" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
  g += `<polyline points="${pts(prec, 0, 100)}" fill="none" stroke="${ACC}" stroke-width="1.5"/>`;
  // v2.0 진행 중 — 58 에폭까지 회색 실선, 이후 점선 고스트
  g += `<polyline points="${pts(prec2, 0, 58)}" fill="none" stroke="${G}" stroke-width="1.5"/>`;
  g += `<polyline points="${pts(prec2, 58, 100)}" fill="none" stroke="${C}" stroke-width="1" stroke-dasharray="2 3"/>`;
  // 현재 에폭 테이프 — 세로 액센트선 + 눈금자 위 창
  const gx = ex(58).toFixed(1);
  g += `<line x1="${gx}" x2="${gx}" y1="${py0}" y2="${py1 + 18}" stroke="${ACC}" stroke-width="1"/>`;
  g += `<rect x="${ex(58) - 19}" y="${py1 + 2}" width="38" height="22" fill="#FFFFFF" stroke="${ACC}"/>` + T(gx, py1 + 17, '58', ACC, 'middle', 'font-weight="500"');
  g += `<circle cx="${gx}" cy="${ey(prec2(58)).toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="${G}" stroke-width="1.5"/>`;
  // 끝값
  g += `<circle cx="${ex(100)}" cy="${ey(loss(100)).toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="${INK}" stroke-width="1.5"/>` + T(px1 + 10, ey(loss(100)) + 5, 'loss 0.19', INK, 'start');
  g += `<circle cx="${ex(100)}" cy="${ey(prec(100)).toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="${ACC}" stroke-width="1.5"/>` + T(px1 + 10, ey(prec(100)) + 5, 'precision 0.87', ACC, 'start');
  g += T(ex(58) + 8, ey(prec2(58)) - 8, 'v2.0 0.80', G, 'start');
  return `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" style="position:absolute;left:${x}px;top:${y}px;display:block">${g}</svg>\n`;
}
function train() {
  let s = headCollapsed('학습');
  const sy = 176;
  s += search(X0, sy, 200, '학습명') + cta(XR - 96, sy - 4, 96, '학습 시작');
  s += hl(X0, sy + 34, W);
  // 워크플로우 캔버스 — 노드 6 · x 축 = 의존 순서(Roboflow 블록 문법 · radius 0)
  const NY = 238, NH = 150;
  s += lab(X0, 218, '워크플로우 · 비닐하우스 v2.1') + st(XR - 160, 218, '완료 · 1 h 35 m · 2026.05.18', 'width:160px;text-align:right');
  const ws = [128, 96, 116, 148, 134, 74], gap = 16;
  const xs = []; let cx = X0; ws.forEach(w => { xs.push(cx); cx += w + gap; });
  // 연결선 — 완료 구간 잉크
  for (let i = 0; i < 5; i++) s += hl(xs[i] + ws[i] + 3, NY + NH / 2, gap - 6, i === 0 || i === 1 ? C : INK);
  // 1 데이터셋(픽셀 몸체) · 원본: 데이터셋 select
  let x = xs[0], w = ws[0];
  s += node(x, NY, w, NH, '데이터셋 v2', 'Cached', ACC,
    img(x + 1, NY + 50, w - 2, 58, 'tile-gh-clean.jpg', brkIn(w - 2, 58, INK, 8)) + nchip(x + 10, NY + 116, '1,674 라벨') + nchip(x + 84, NY + 116, '▾'), false, true);
  // 2 증강 — 원본 폼에 없음 → 점선 `증강 없음`
  x = xs[1]; w = ws[1];
  s += node(x, NY, w, NH, '증강 없음', '—', C, txt(x + 10, NY + 54, '원본 옵션 없음', 12, C) + nchip(x + 10, NY + 116, '추가 안 함', true), true);
  // 3 기반 모델 — 원본: 기반 모델(고정) · 이전 학습 이어가기
  x = xs[2]; w = ws[2];
  s += node(x, NY, w, NH, 'XI-VFM v2.1', 'Cached', ACC,
    nchip(x + 10, NY + 54, `${ico('lock', G, 12)} YOLO11`, true) + nchip(x + 10, NY + 82, '이어가기 없음') + nchip(x + 10, NY + 116, '객체 탐지', true));
  // 4 학습 — 원본: 학습명 · 이미지 크기 · 학습:검증 · 에폭 · 배치
  x = xs[3]; w = ws[3];
  s += node(x, NY, w, NH, '학습 v2.1', '완료 100 / 100', ACC,
    nchip(x + 10, NY + 54, '에폭 100') + nchip(x + 80, NY + 54, '배치 16') + nchip(x + 10, NY + 82, '640 px') + nchip(x + 76, NY + 82, '80 : 20') +
    div(x + 10, NY + 118, w - 20, 3, `background:${H}`) + div(x + 10, NY + 118, w - 20, 3, `background:${ACC}`) + num(x + 10, NY + 126, '1 h 35 m', 11.5, G));
  // 5 검증 — 원본: IoU · Conf 임계값 → 결과 IoU/F1
  x = xs[4]; w = ws[4];
  s += node(x, NY, w, NH, '검증 20 %', '완료', ACC,
    img(x + 1, NY + 50, w - 2, 44, 'pj-greenhouse.jpg', poly(w - 2, 44, GH, .9)) + st(x + 10, NY + 100, 'IoU 0.82 · F1 0.87', `color:${INK};letter-spacing:-.02em`) + nchip(x + 10, NY + 118, '임계 0.5 · 0.25'));
  // 6 결과 → 배포
  x = xs[5]; w = ws[5];
  s += node(x, NY, w, NH, '결과', '완료', ACC, img(x + 1, NY + 50, w - 2, 58, 'pj-hero.jpg', poly(w - 2, 58, HERO, .8)) + txt(x + 10, NY + 118, '배포 ›', 13, ACC), false, false, true);
  // 학습 곡선 — 완료 v2.1 + 진행 중 v2.0(58/100 · 테이프)
  const CY = 404;
  s += lab(X0, CY, '학습 곡선 · 에폭') + `<div style="position:absolute;left:${X0 + 120}px;top:${CY - 1}px;display:flex;gap:16px;font-size:14px;color:${G};white-space:nowrap"><span><span style="display:inline-block;width:14px;height:2px;background:${INK};vertical-align:4px;margin-right:5px"></span>loss v2.1</span><span><span style="display:inline-block;width:14px;height:2px;background:${ACC};vertical-align:4px;margin-right:5px"></span>precision v2.1</span><span><span style="display:inline-block;width:14px;height:2px;background:${G};vertical-align:4px;margin-right:5px"></span>precision v2.0 <b style="font-weight:500;color:${ACC}">진행 중 58 / 100</b></span></div>\n`;
  s += trainChart(X0, CY + 22);
  // 이력 5 — 상태 열 4 를 띠로 접음(대기 2 · 진행 2 · 완료 1 · 실패 0) + 행 5(썸네일 · 이름 · 상태어 · 라벨 · IoU · F1 · 시작)
  const LY = 612;
  s += hl(X0, LY - 8, W) + disp(X0, LY, '학습 이력', 14) + num(X0 + 70, LY + 1, '5', 13, ACC);
  const seg = [['대기', 2, '#FFFFFF', G], ['진행', 2, T2, ACC], ['완료', 1, TEAL, TEAL], ['실패', 0, null, C]];
  let sx = X0 + 300;
  seg.forEach(([t, c, bg, col]) => { const w = Math.max(c, .5) * 56; s += div(sx, LY + 8, w, 6, bg ? `background:${bg};border:1px solid ${col}` : `border:1px dotted ${C}`) + txt(sx, LY + 18, `${t} <span class="n" style="color:${c ? col === TEAL ? INK : col : C}">${c}</span>`, 12, G); sx += w + 12; });
  s += hl(X0, LY + 44, W);
  const runs = [
    ['비닐하우스 v2.1', 'pj-greenhouse.jpg', '완료 · 1 h 35 m', '3,842', '0.82', '0.87', '2026.05.18 07:40', true],
    ['비닐하우스 v2.0', 'pj-nw2510.jpg', '진행 중 · 58 / 100', '2,800', '—', '—', '2026.05.10 14:30'],
    ['학습 #4', 'tile-farm-clean.jpg', '진행 중 · 12 / 100', '4,200', '—', '—', '2026.06.11 21:45'],
    ['학습 #5', 'tile-gh-clean.jpg', '대기', '4,200', '—', '—', '2026.06.11 22:30'],
    ['비닐하우스 v1.0', 'pj-hero.jpg', '대기 · 재학습', '1,560', '0.71', '0.76', '2026.04.15 11:10'],
  ];
  runs.forEach(([n, src, stt, lb, iou, f1, d, on], i) => {
    const y = LY + 52 + i * 38;
    if (on) s += div(X0 - 8, y - 5, W + 16, 38, `background:${T1}`);
    s += img(X0, y, 48, 28, src, on ? brkIn(48, 28, ACC, 6) : '') + disp(X0 + 60, y + 4, n, 14) + st(X0 + 250, y + 7, stt, stt.startsWith('대기') ? `color:${G}` : '');
    s += num(X0 + 400, y + 5, lb, 12, G) + num(X0 + 470, y + 5, iou, 12, iou === '—' ? C : INK) + num(X0 + 530, y + 5, f1, 12, f1 === '—' ? C : INK) + num(XR - 140, y + 5, d + (i < 4 ? '' : ''), 12, G, 'width:140px;text-align:right');
    s += hl(X0, y + 33, W);
  });
  s += `<span class="tag" style="position:absolute;left:${X0 + 620}px;top:${LY + 1}px">시연</span>\n`;
  // 드로어 = 학습 결과 5섹션(정보 · 설정 · 결과 · 클래스별 · 행렬) — 이미지 먼저
  s += drawer('비닐하우스 v2.1<span class="tag">시연</span><span class="st" style="font-size:15px;margin-left:10px;vertical-align:3px">완료</span>');
  s += img(DI, 136, DIW, 243, 'pj-greenhouse.jpg', poly(DIW, 243, GH, 1.1) + brkIn(DIW, 243, INK));
  s += num(DI, 386, '남원 농경지 2025.06 · 검증 셋 20 %', 12, G);
  s += `<div class="d8" style="position:absolute;left:${DI}px;top:412px;font-size:58px;line-height:1;color:${ACC};font-variant-numeric:tabular-nums">0.82</div>\n` + lab(DI + 2, 474, 'IoU 영역 일치도');
  s += `<div class="d8" style="position:absolute;left:${DI + 216}px;top:412px;font-size:58px;line-height:1;color:${INK};font-variant-numeric:tabular-nums">0.87</div>\n` + lab(DI + 218, 474, 'F1 종합 정확도') + num(DI + 340, 476, 'v2.0 +0.04', 12, G);
  s += hl(DI, 500, DIW);
  const kv = [['학습 시작', '2026.05.18 07:40'], ['소요', '1시간 35분'], ['라벨', '3,842'], ['데이터셋', '남원 농경지 2025.04 · 06 · 08'], ['기반 모델', 'XI-VFM v2.1'], ['이미지 크기', '640 × 640'], ['학습 : 검증', '80 : 20'], ['에폭 · 배치', '100 · 16'], ['IoU · Conf', '0.5 · 0.25']];
  kv.forEach(([k, v], i) => { const col = i % 2, row = Math.floor(i / 2); const x = DI + col * 216, y = 514 + row * 40; s += lab(x, y, k) + num(x, y + 16, v, 13); });
  const py = 720;
  s += hl(DI, py - 6, DIW) + lab(DI, py + 4, '클래스별 F1');
  [['전체', .87, '0.87'], ['비닐하우스_단동', .89, '0.89'], ['비닐하우스_다동', .74, '0.74']].forEach(([k, v, t], i) => {
    const y = py + 26 + i * 20;
    s += txt(DI, y, k, 12, G) + div(DI + 116, y + 8, 120, 1, `background:${H}`) + div(DI + 116, y + 7, 120 * v, 3, `background:${i ? ACC : INK}`) + num(DI + 244, y, t, 12, INK);
  });
  const mx = DI + 300, my = py + 4;
  s += lab(mx, my, '오분류 행렬');
  const M = [['1,318', '41', '—'], ['29', '176', '—'], ['—', '—', '']];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const v = M[r][c], diag = r === c && r < 2; s += div(mx + c * 44, my + 20 + r * 20, 44, 20, `border:1px solid ${H};background:${diag ? T1 : '#FFFFFF'};display:flex;align-items:center;justify-content:center;font-size:12px;color:${v === '—' || !v ? C : diag ? ACC : INK}`, `<span class="n">${v || ''}</span>`); }
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + txt(1416 - 140, 836, '배포 탭에서 이 결과 발행 ›', 13, INK, 'width:140px;text-align:right');
  s += FOOT;
  return page('B5 · 프로젝트 — 학습', s);
}

// ======================================================================
// 6차 — 남은 하위 화면 4판 (라벨링 편집 · 분석 · 배포 · 삭제 확인) — 같은 규칙(이미지 우선 · 주석 0 · 검정 CTA 1)
// 풀블리드 지도 = design-canvas/v2/img/pj-map-*.jpg (tools/design/map-crops-b5.py · namwon_2506 z19 로컬 타일 1384×852)
// ======================================================================
const ICONS = {
  rect: '<rect x="3" y="4" width="14" height="12"/>',
  circle: '<circle cx="10" cy="10" r="6.5"/>',
  polygon: '<path d="M10 3l7 5-2.5 8h-9L3 8z"/>',
  copy: '<path d="M7 7h10v10H7z"/><path d="M3 13V3h10"/>',
  import: '<path d="M10 3v10M6 9l4 4 4-4M3 17h14"/>',
  undo: '<path d="M7 5 3 9l4 4"/><path d="M3 9h9a5 5 0 0 1 0 10"/>',
  close: '<path d="M4 4l12 12M16 4 4 16"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/>',
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c3 3 3 11 0 14M10 3c-3 3-3 11 0 14"/>',
  ruler: '<path d="M3 13 13 3l4 4L7 17z"/><path d="M8 8l2 2M11 5l2 2M5 11l2 2"/>',
  pen: '<path d="M4 16l2-6 7-7 4 4-7 7z"/><path d="M11 5l4 4"/>',
  download: '<path d="M10 3v10M6 9l4 4 4-4M3 17h14"/>',
  layers: '<path d="M10 3 3 7l7 4 7-4z"/><path d="M3 11l7 4 7-4"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',
  save: '<path d="M3 3h11l3 3v11H3z"/><path d="M6 3v5h7V3M6 17v-6h8v6"/>',
  lock: '<rect x="5" y="9" width="10" height="8"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>',
  chevL: '<path d="M12 4 6 10l6 6"/>',
};
const ico = (k, col = INK, sz = 16) => `<svg width="${sz}" height="${sz}" viewBox="0 0 20 20" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="butt" style="flex:none">${ICONS[k]}</svg>`;
// 아이콘 버튼(헤어라인) — 라벨 있으면 가로형
const ibtn = (x, y, w, k, label = '', on = false) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:32px;border:1px solid ${on ? INK : H};background:${on ? T2 : '#FFFFFF'};display:flex;align-items:center;justify-content:${label ? 'flex-start' : 'center'};gap:7px;padding:0 ${label ? 9 : 0}px;font-size:14.5px;letter-spacing:-.01em;color:${INK};white-space:nowrap">${ico(k, INK, 15)}${label}</div>\n`;
// 지도 우측 플로팅 툴바(원본 8: 검색 · 지구 · 측정 · 그리기 · 다운로드 · LX 레이어 · + · −)
function mapTools(x, y) {
  let s = '';
  const g1 = ['search', 'globe', 'ruler', 'pen', 'download', 'layers'];
  g1.forEach((k, i) => { s += div(x, y + i * 36, 36, 36, `background:#FFFFFF;border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center`, ico(k, INK, 16) + (k === 'layers' ? `<span class="lab" style="position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:14px;color:${INK}">LX</span>` : '')); });
  const y2 = y + 6 * 36 + 12;
  ['plus', 'minus'].forEach((k, i) => { s += div(x, y2 + i * 36, 36, 36, `background:#FFFFFF;border:1px solid ${H};border-top-width:${i ? 0 : 1}px;display:flex;align-items:center;justify-content:center`, ico(k, INK, 16)); });
  return s;
}
// 풀블리드 지도(1384×852 원판을 박스에 맞춰 잘라 넣음) + SVG 오버레이
const mapPlate = (x, y, w, h, src, over = '', oy = 0, ox = 0) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#EEE"><img src="${src}" alt="" style="position:absolute;left:${ox}px;top:${oy}px;width:1384px;height:852px;display:block">${over}</div>\n`;
const tealPolys = (pts, oy = 0, fill = .12, ox = 0) => `<svg width="1384" height="852" viewBox="0 0 1384 852" style="position:absolute;left:${ox}px;top:${oy}px;display:block;pointer-events:none">` +
  pts.map(p => `<polygon points="${p}" fill="rgba(15,169,160,${fill})" stroke="${TEAL}" stroke-width="1.5" stroke-linejoin="miter"/>`).join('') + `</svg>`;
const mapTag = (x, y, t, oy = 0, ox = 0) => `<div class="n" style="position:absolute;left:${x + ox}px;top:${y + oy}px;height:18px;line-height:21px;padding:0 5px;background:${TEAL};color:#FFFFFF;font-size:14px;letter-spacing:.02em;white-space:nowrap">${t}</div>`;
// 작은 대화상자(헤어라인 잉크 테두리)
const dialog = (x, y, w, h, title, inner, tag = '') => div(x, y, w, h, `background:#FFFFFF;border:1px solid ${INK}`) +
  disp(x + 20, y + 18, title + tag, 16) + `<div style="position:absolute;left:${x + w - 30}px;top:${y + 22}px">${ico('close', G, 12)}</div>\n` + hl(x + 20, y + 50, w - 40) + inner;
// 라벨 폴리곤(pj-map-label 1384×852 좌표) — 파란 지붕 장동 1 · 소형 2 · 이랑 하우스 2
const LABEL_PTS = ['158,486 388,336 468,410 244,566', '800,320 838,318 842,362 806,364', '736,182 792,186 796,300 742,302', '744,306 800,308 802,430 748,432', '716,132 748,130 750,178 718,180'];
// 분석 결과 폴리곤(pj-map-analysis) — 하우스 이랑 4 (오프셋 -70 은 호출부에서)
function stripPolys() {
  const A = [175, 435], B = [335, 510], C = [85, 610], D = [240, 700];
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4 + .02, t1 = (i + 1) / 4 - .02;
    const a = lerp(A, B, t0), b = lerp(A, B, t1), c = lerp(C, D, t1), d = lerp(C, D, t0);
    out.push([a, b, c, d].map(p => p.map(v => v.toFixed(0)).join(',')).join(' '));
  }
  return out;
}

// ======================================================================
// 5. B5-Project-Labeling — `&did=` 편집 모드(풀블리드): 헤더 48 · 지도 1368 · 좌 영상 320 · 우 라벨 320
// ======================================================================
function labeling() {
  let s = '';
  // 헤더 48 — 프로젝트명 · 라벨링 · 영상명 · 닫기
  s += txt(88, 15, '‹ 비닐하우스 탐지', 13, G) + disp(212, 13, '라벨링', 16) + txt(276, 16, '남원 농경지 2025.06 · 도엽 1 · 0.017 m/px', 12.5, G) + txt(1400, 15, '닫기', 13, G) + hl(72, 48, 1368);
  // 지도 = 남원 2025.06 정사영상 실판 + 라벨 폴리곤(청록) + 번호표
  const MY = 49, MH = 851;
  const OX = 160, tags = [[244, 448, '#1 단동'], [748, 300, '#2 단동'], [796, 166, '#3 단동'], [802, 412, '#4 단동'], [750, 112, '#5 다동']];
  s += mapPlate(72, MY, 1368, MH, 'pj-map-label.jpg', tealPolys(LABEL_PTS, 0, .12, OX) + tags.map(([x, y, t]) => mapTag(x, y, t, 0, OX)).join(''), 0, OX);
  // 상단 툴바(원본 8) — 좌 드로어 오른쪽 408 부터 · 저장 = 판의 검정 CTA 1
  const ty = 64;
  s += ibtn(408, ty, 74, 'rect', '사각형', true) + ibtn(490, ty, 62, 'circle', '원형') + ibtn(560, ty, 74, 'polygon', '폴리곤') + ibtn(642, ty, 86, 'copy', '도형 복사') + ibtn(736, ty, 128, 'import', '공간 정보 불러오기') +
    vl(876, ty + 4, 24) + ibtn(888, ty, 86, 'undo', '실행 취소') + cta(982, ty, 56, '저장') + ibtn(1046, ty, 56, 'close', '닫기');
  // 지도 툴바 — 우 드로어 앞 1072
  s += mapTools(1072, 116);
  // 좌 드로어 320 — 영상 3(이름 · GSD · 라벨 수 · 날짜 · 상태어 · 복제) · 접기
  s += div(72, MY, 320, MH, 'background:#FFFFFF') + vl(392, MY, MH, INK);
  s += disp(88, 66, '영상', 15) + num(128, 68, '3', 14, ACC) + `<div style="position:absolute;left:366px;top:66px">${ico('chevL', G, 14)}</div>\n` + hl(88, 96, 288);
  const imgs = [
    ['남원 농경지 2025.04', 'tile-farm-clean.jpg', '0.011 m/px · 라벨 — · 2026.05.18', '마감', false, '시연'],
    ['남원 농경지 2025.06', 'tile-gh-clean.jpg', '0.017 m/px · 라벨 1,674 · 2026.06.06', '라벨링됨', true],
    ['남원 농경지 2025.10', 'pj-nw2510.jpg', '0.017 m/px · 라벨 0 · —', '미작업', false],
  ];
  imgs.forEach(([n, src, meta, stt, on, tg], i) => {
    const y = 108 + i * 236;
    if (on) s += div(80, y - 8, 304, 228, `background:${T1}`);
    s += img(88, y, 288, 140, src, on ? brkIn(288, 140, ACC) : '');
    s += disp(88, y + 150, n, 14) + num(88, y + 170, meta, 12, G) + st(88, y + 192, stt + (tg ? `<span class="tag">${tg}</span>` : ''), on ? '' : `color:${G}`) + txt(336, y + 190, '복제 ›', 12.5, INK);
  });
  // 우 드로어 320 — 7차: 위 = 클래스 편집기(색 · 이름 인라인 편집 · 단축키 · 수 · ↑↓ · × · 클래스 추가) / 아래 = 라벨 목록(검색 · 체크 · 클래스 · 이름 #n · 작성자 · 형태 · ×) · 전체 선택 · 클래스 일괄 변경
  s += div(1120, MY, 320, MH, 'background:#FFFFFF') + vl(1120, MY, MH, INK);
  s += disp(1136, 66, '클래스', 15) + num(1188, 68, '2', 14, ACC) + hl(1136, 96, 288);
  const classes = [['비닐하우스_단동', true, '1', '1,469', true], ['비닐하우스_다동', false, '2', '205', false]];
  classes.forEach(([n, fill, key, cnt, on], i) => {
    const y = 104 + i * 36;
    if (on) s += div(1121, y, 319, 36, `background:${T1}`) + div(1121, y, 2, 36, `background:${ACC}`);
    s += div(1136, y + 12, 12, 12, `border:1px solid ${TEAL};background:${fill ? TEAL : '#FFFFFF'}`);
    s += txt(1158, y + 8, n, 13, INK, on ? `border-bottom:1px solid ${INK};padding-bottom:1px` : '');
    s += div(1290, y + 9, 18, 18, `border:1px solid ${on ? INK : H};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:14px;color:${on ? INK : G}">${key}</span>`);
    s += num(1316, y + 9, cnt, 12, ACC, 'width:52px;text-align:right');
    s += `<div style="position:absolute;left:1378px;top:${y + 11}px;font-size:14px;line-height:1;color:${i ? INK : C}">↑</div><div style="position:absolute;left:1392px;top:${y + 11}px;font-size:14px;line-height:1;color:${i ? C : INK}">↓</div>\n`;
    s += `<div style="position:absolute;left:1408px;top:${y + 12}px">${ico('close', C, 11)}</div>\n` + hl(1136, y + 36, 288);
  });
  s += div(1136, 184, 288, 28, `border:1px dotted ${C};display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px;color:${G}`, `${ico('plus', G, 12)}클래스 추가`);
  s += hl(1136, 226, 288);
  s += disp(1136, 240, '라벨', 15) + num(1176, 242, '1,674', 14, ACC) + search(1136, 268, 288, '라벨 검색') + hl(1136, 304, 288);
  for (let i = 0; i < 10; i++) {
    const y = 312 + i * 32, multi = i % 5 === 4, on = i === 2 || i === 3 || i === 4;
    if (on) s += div(1121, y, 319, 32, `background:${T1}`);
    s += chk(1136, y + 9, on) + div(1160, y + 10, 12, 12, `border:1px solid ${TEAL};background:${multi ? '#FFFFFF' : TEAL}`);
    s += txt(1182, y + 7, `${multi ? '비닐하우스_다동' : '비닐하우스_단동'} <span class="n" style="color:${G}">#${i + 1}</span>`, 12.5) + txt(1318, y + 8, '—', 12, C) + txt(1346, y + 8, i % 3 === 1 ? '폴리곤' : '사각형', 12, G) + `<div style="position:absolute;left:1408px;top:${y + 10}px">${ico('close', C, 11)}</div>\n`;
    s += hl(1136, y + 32, 288);
  }
  s += num(1136, 642, '… 1,674 행 · 스크롤', 12, C);
  s += hl(1136, 818, 288) + chk(1136, 836, false) + txt(1158, 832, '전체 선택', 12.5, G) + st(1230, 836, '선택 3') + txt(1424 - 96, 832, '클래스 일괄 변경 ›', 13, INK, 'width:96px;text-align:right');
  // 클래스 일괄 변경 — 작은 대화상자(원본 모달)
  const dx = 768, dy = 604;
  s += dialog(dx, dy, 320, 176, '클래스 일괄 변경',
    lab(dx + 20, dy + 66, '선택 3건 → 클래스') + sel(dx + 20, dy + 86, 280, '비닐하우스_다동') +
    hl(dx + 20, dy + 130, 280) + tb(dx + 190, dy + 140, '취소', false, `color:${G}`) + tb(dx + 244, dy + 140, '변경'));
  return page('B5 · 프로젝트 — 라벨링 편집', s);
}

// ======================================================================
// 6. B5-Project-Analysis — 분석 탭: 지도 풀블리드 + 좌 드로어(세그먼트 3 · 픽커 3단 · CTA) + 우 실행 목록 + 공유 설정
// ======================================================================
function analysis() {
  let s = headCollapsed('분석');
  const MY = 161, MH = 705, OY = -70, OX = 320;
  // 지도 = 남원 2025.06 정사영상 + 선택한 완료 항목(#1)의 결과 폴리곤
  const strips = stripPolys();
  s += mapPlate(72, MY, 1368, MH, 'pj-map-analysis.jpg', tealPolys(strips, OY, .12, OX) + mapTag(346, 496, '#1 · 단동 4', OY, OX), OY, OX);
  s += mapTools(1072, MY + 16);
  // 좌 드로어 320 — 세그먼트 3 → `분석 실행`: 과제(고정) → 모델(종속) → 영상 픽커(실썸네일) → CTA
  s += div(72, MY, 320, MH, 'background:#FFFFFF') + vl(392, MY, MH, INK);
  const sy = 176;
  s += `<div class="tab on" style="left:88px;top:${sy}px">분석 실행</div>\n` + div(88, sy + 28, 56, 2, `background:${INK}`) +
    `<div class="tab" style="left:${168}px;top:${sy}px">실행중<span class="c">2</span></div>\n` + `<div class="tab" style="left:${244}px;top:${sy}px">완료<span class="c">1</span></div>\n` + hl(88, sy + 30, 288);
  s += lab(88, 224, '1 · 분석 과제') + fld(88, 244, 288, `${ico('lock', G, 13)}<span>비닐하우스 탐지</span>`, `background:${T1};border-color:${T1}`);
  s += lab(88, 290, '2 · 모델') + sel(88, 310, 288, '비닐하우스 v2.1 · F1 0.87');
  s += lab(88, 356, '3 · 영상 · 아카이브');
  const th = [['남원 농경지 2025.06', 'tile-gh-clean.jpg', true], ['남원 농경지 2025.04', 'tile-farm-clean.jpg'], ['남원 농경지 2025.08', 'pj-hero.jpg'], ['남원 농경지 2025.10', 'pj-nw2510.jpg'], ['남원 전역 2025.10', 'tile-ep-4.jpg'], ['국산리 드론 A68', 'tile-kuksan-1.jpg']];
  th.forEach(([n, src, on], i) => {
    const x = 88 + (i % 2) * 152, y = 376 + Math.floor(i / 2) * 108;
    if (on) s += div(x - 6, y - 6, 148, 106, `background:${T1}`);
    s += img(x, y, 136, 78, src, on ? brkIn(136, 78, ACC) : '') + txt(x, y + 84, n, 12, on ? INK : G, 'width:136px;overflow:hidden;text-overflow:ellipsis');
    if (on) s += chk(x + 116, y + 6, true);
  });
  s += hl(88, 806, 288) + st(88, 782, '선택 1 · 남원 농경지 2025.06') + cta(88, 818, 288, '분석 실행');
  // 우 드로어 320 — 실행 목록(실행중 2 · 완료 1) · 행 = 실썸네일 96×54 + 이름 + 상태어 · 5단계 진행선 · 완료 선택 = 지도 결과
  s += div(1120, MY, 320, MH, 'background:#FFFFFF') + vl(1120, MY, MH, INK);
  s += disp(1136, 178, '실행 목록', 15) + num(1210, 180, '3', 14, ACC) + hl(1136, 208, 288);
  const runs = [
    ['비닐하우스 탐지 #3', 'tile-farm-clean.jpg', '남원 농경지 2025.04', '분석중 · 3/5', 3, false, '시연'],
    ['비닐하우스 탐지 #4', 'pj-nw2510.jpg', '남원 농경지 2025.10', '대기 · 1/5', 1, false, '시연'],
    ['비닐하우스 탐지 #1', 'tile-gh-clean.jpg', '남원 농경지 2025.06 · 82분', '완료 · 단동 4', 5, true, '시연'],
  ];
  runs.forEach(([n, src, meta, stt, step, on, tg], i) => {
    const y = 220 + i * 98;
    if (on) s += div(1121, y - 8, 319, 96, `background:${T1}`);
    s += img(1136, y, 96, 54, src, on ? poly(96, 54, GH, .8) + brkIn(96, 54, ACC) : '');
    s += disp(1244, y, n, 13) + num(1244, y + 20, meta + (tg ? `<span class="tag">${tg}</span>` : ''), 12, G) + st(1244, y + 40, stt, step === 1 ? `color:${G}` : '');
    s += div(1136, y + 64, 288, 1, `background:${H}`) + div(1136, y + 63, 288 * step / 5, 3, `background:${step === 5 ? TEAL : ACC}`);
    s += hl(1136, y + 82, 288);
  });
  s += lab(1136, 522, '단계') + num(1176, 522, '대기 · 전처리 · 분석 · 후처리 · 완료', 12, G);
  s += txt(1136, 556, '결과 다운로드 ›', 13, INK) + txt(1250, 556, '공유 설정 ›', 13, INK);
  // 공유 설정 — 작은 대화상자(원본 모달: 기관·역할 체크 9 · 취소/저장)
  const dx = 700, dy = 420;
  const roles = [['LX 한국국토정보공사', 'LX 관리자', true], ['LX 한국국토정보공사', 'LX 일반 사용자', false], ['남원시청', '남원시청 관리자', true], ['남원시청', '사료작물 분석', false], ['남원시청', '농지 활용 분석', false], ['전라남도', '전라남도 관리자', false]];
  let inner = txt(dx + 20, dy + 62, '분석 결과를 공유할 기관·역할을 선택하세요.', 12.5, G);
  roles.forEach(([org, role, on], i) => { const y = dy + 92 + i * 28; inner += chk(dx + 20, y + 3, on) + txt(dx + 44, y, role, 13, on ? INK : G) + txt(dx + 204, y + 1, org, 12, C) + hl(dx + 20, y + 24, 320); });
  inner += num(dx + 20, dy + 262, '+3 · 스크롤', 12, C) + hl(dx + 20, dy + 286, 320) + tb(dx + 250, dy + 296, '취소', false, `color:${G}`) + tb(dx + 304, dy + 296, '저장');
  s += dialog(dx, dy, 360, 336, '공유 설정', inner, '<span class="st" style="font-size:14px;margin-left:10px;vertical-align:2px">비닐하우스 탐지 #1</span>');
  s += FOOT;
  return page('B5 · 프로젝트 — 분석', s);
}

// ======================================================================
// 7. B5-Project-Deploy — 배포 탭: 세그먼트 2(발행 요청 1 · 모델 등록 0) + 우 드로어 720 = 발행 폼 13필드 + 학습 결과 픽커
// ======================================================================
function deploy() {
  let s = headCollapsed('배포');
  const W2 = 536, XR2 = X0 + W2;   // 본문 열 536(드로어 720 앞)
  const sy = 176;
  s += `<div class="tab on" style="left:${X0}px;top:${sy + 4}px">발행 요청<span class="c">1</span></div>\n` + div(X0, sy + 32, 58, 2, `background:${INK}`) +
    `<div class="tab" style="left:${X0 + 92}px;top:${sy + 4}px">모델 등록<span class="c">0</span></div>\n` +
    tb(XR2 - 96, sy, '카드 발행 요청', true, 'width:96px;text-align:center');
  s += hl(X0, sy + 34, W2);
  // 표 1행(원본 7열: 상태 · 과제명 · 학습 결과 · 모델명 · 과제 유형 · 요청자 · 요청일) — 좁은 열이라 2줄 행
  const ry = 226;
  s += st(X0, ry + 4, '대기') + disp(X0 + 48, ry, '비닐하우스 탐지 v2.1', 15) + num(XR2 - 100, ry + 3, '2026.06.08', 12, G, 'width:100px;text-align:right');
  [['학습 결과', '비닐하우스 v2.1'], ['모델명', 'v2.1'], ['과제 유형', '신규 과제'], ['요청자', '—']].forEach(([k, v], i) => { const x = X0 + 48 + i * 122; s += lab(x, ry + 30, k) + txt(x, ry + 46, v, 12.5, i === 3 ? C : INK); });
  s += hl(X0, ry + 74, W2) + `<span class="tag" style="position:absolute;left:${XR2 - 34}px;top:${ry + 46}px">시연</span>\n`;
  // 모델 등록 0 — 빈 판(원본 "등록된 모델이 없습니다")
  const ey = 340;
  s += disp(X0, ey, '모델 등록', 14) + num(X0 + 70, ey + 1, '0', 13, C);
  s += div(X0, ey + 30, W2, 300, `border:1px dotted ${C};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px`, ico('layers', C, 40) + `<span style="font-size:15px;color:${G}">등록된 모델이 없습니다</span>`);
  // 우 드로어 720 — 발행 폼(원본 ai-publish-create.html 13필드 1:1)
  const DX2 = 720, DI2 = 744, DIW2 = 672, CW = 320, C2 = DI2 + 352;
  s += div(DX2, 64, 720, 836, 'background:#FFFFFF') + vl(DX2, 64, 836, INK) + disp(DI2, 86, '카드 발행 요청', 20) + `<div style="position:absolute;left:1404px;top:90px">${ico('close', G, 12)}</div>\n` + hl(DI2, 122, DIW2);
  const auto = '<span class="tag">자동</span>';
  const radio = (x, y, t, on) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center;gap:7px;font-size:15px;color:${on ? INK : G}"><span style="width:14px;height:14px;border:1px solid ${on ? INK : C};display:inline-block;position:relative">${on ? `<span style="position:absolute;left:3px;top:3px;width:6px;height:6px;background:${INK}"></span>` : ''}</span>${t}</div>\n`;
  // 1행 — 과제 유형(라디오) · 모델명
  s += lab(DI2, 138, '과제 유형') + radio(DI2, 160, '신규 과제', true) + radio(DI2 + 100, 160, '과제 고도화', false);
  s += lab(C2, 138, '모델명') + fld(C2, 156, CW, '<span>v2.1</span>', `border-color:${INK}`);
  // 2행 — 과제명(자동) · 학습 결과 선택(픽커)
  s += lab(DI2, 200, '과제명' + auto) + fld(DI2, 218, CW, '<span>비닐하우스 탐지</span>', `background:${T1};border-color:${T1}`);
  s += lab(C2, 200, '학습 결과') + fld(C2, 218, CW, `<span>비닐하우스 v2.1 · F1 0.87</span><span style="flex:1"></span><span style="color:${ACC}">선택 ›</span>`, `border-color:${ACC}`);
  // 3행 — 탐지 형태(자동) · 데이터 유형(자동)
  s += lab(DI2, 262, '탐지 형태' + auto) + fld(DI2, 280, CW, '<span>객체 탐지</span>', `background:${T1};border-color:${T1}`);
  s += lab(C2, 262, '데이터 유형' + auto) + fld(C2, 280, CW, '<span>정사영상 (ortho)</span>', `background:${T1};border-color:${T1}`);
  // 4행 — 클래스(자동 칩) · 권장 해상도
  s += lab(DI2, 324, '클래스' + auto) + `<div style="position:absolute;left:${DI2}px;top:344px;display:flex;gap:6px"><span class="chip" style="background:${T1};border-color:${T1}">비닐하우스_단동</span><span class="chip" style="background:${T1};border-color:${T1}">비닐하우스_다동</span></div>\n`;
  s += lab(C2, 324, '권장 해상도<span class="tag">추정</span>') + sel(C2, 342, CW, '≤ 0.02 m/px');
  // 5·6행 — 소개 · 개발 목적(textarea)
  s += lab(DI2, 388, '소개') + div(DI2, 406, DIW2, 52, `border:1px solid ${H};padding:8px 10px;font-size:13px;line-height:1.5`, '남원 농경지 정사영상에서 비닐하우스(단동·다동)를 자동 탐지');
  s += lab(DI2, 474, '개발 목적') + div(DI2, 492, DIW2, 52, `border:1px solid ${H};padding:8px 10px;font-size:13px;color:${C}`, '개발 목적 입력');
  // 7행 — 대시보드 썸네일 · 카드 썸네일(이미지 선택 ×2 · 실크롭)
  s += lab(DI2, 562, '대시보드 썸네일 이미지') + img(DI2, 582, CW, 180, 'pj-hero.jpg', poly(CW, 180, HERO, 1) + brkIn(CW, 180, INK)) + txt(DI2, 770, '이미지 선택 ›', 12.5, INK) + num(DI2 + 100, 771, 'JPG · PNG · 300×260', 12, G);
  s += lab(C2, 562, '카드 썸네일 이미지') + img(C2, 582, CW, 180, 'pj-greenhouse.jpg', poly(CW, 180, GH, 1)) + txt(C2, 770, '이미지 선택 ›', 12.5, INK) + num(C2 + 100, 771, 'JPG · PNG · 300×260', 12, G);
  s += hl(DI2, 818, DIW2) + tb(DI2, 830, '목록', false, `color:${G}`) + tb(DI2 + 48, 830, '취소', false, `color:${G}`) + cta(1416 - 96, 826, 96, '발행 요청');
  // 학습 결과 선택 — 작은 대화상자(원본 모달 픽커 3행)
  const dx = 1000, dy = 236;
  let inner = '';
  [['비닐하우스 v2.1', '2026.05.18 · IoU 0.82 · F1 0.87', true], ['비닐하우스 v2.0', '2026.05.10 · IoU 0.78 · F1 0.83'], ['비닐하우스 v1.0', '2026.04.15 · IoU 0.71 · F1 0.76']].forEach(([n, m, on], i) => {
    const y = dy + 64 + i * 52;
    if (on) inner += div(dx + 1, y - 8, 358, 50, `background:${T1}`);
    inner += chk(dx + 20, y + 6, !!on) + disp(dx + 44, y, n, 13) + num(dx + 44, y + 20, m, 12, G) + hl(dx + 20, y + 42, 320);
  });
  s += dialog(dx, dy, 360, 236, '학습 결과 선택', inner, '<span class="tag">시연</span>');
  s += FOOT;
  return page('B5 · 프로젝트 — 배포', s);
}

// ======================================================================
// 8. B5-Project-Delete — 개요 위 삭제 확인(원본 NotifyUI.confirm 문구 그대로)
// ======================================================================
function del() {
  let s = overviewBody();
  s += div(72, 0, 1368, 900, 'background:rgba(1,1,2,.54)');
  const w = 440, h = 196, x = 72 + (1368 - w) / 2, y = (900 - h) / 2;
  s += div(x, y, w, h, 'background:#FFFFFF');
  s += disp(x + 24, y + 22, '프로젝트 삭제', 18) + txt(x + 24, y + 66, '“비닐하우스 탐지” 프로젝트를 삭제할까요?', 14) + txt(x + 24, y + 92, '삭제 후에는 복구할 수 없습니다.', 13, G);
  s += hl(x + 24, y + 136, w - 48) + tb(x + w - 24 - 72 - 40, y + 150, '취소', false, `color:${G}`) + cta(x + w - 24 - 72, y + 146, 72, '삭제');
  return page('B5 · 프로젝트 — 삭제 확인', s);
}


// ---------- 회백 벡터 지도 — sigungu.geojson(시군구 249 · 4 % 단순화) 을 판에 투영(equirect · cos φ 보정) ----------
const SIGUNGU = JSON.parse(fs.readFileSync(path.join(root, 'landxi/assets/data/geo/sigungu.geojson'), 'utf8')).features;
function vmap(x, y, w, h, cLon, cLat, latSpan, inner, label = '남원시') {
  const k = Math.cos(cLat * Math.PI / 180), lonSpan = latSpan * (w / h) / k;
  const px = (lon) => (lon - (cLon - lonSpan / 2)) / lonSpan * w, py = (lat) => ((cLat + latSpan / 2) - lat) / latSpan * h;
  const rings = (g) => g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
  let paths = '', lbl = '';
  for (const f of SIGUNGU) {
    const rs = rings(f.geometry);
    let d = '', hit = false;
    for (const r of rs) {
      let last = '';
      r.forEach(([lon, lat], i) => {
        const X = px(lon), Y = py(lat);
        if (X > -20 && X < w + 20 && Y > -20 && Y < h + 20) hit = true;
        const pt = `${X.toFixed(1)} ${Y.toFixed(1)}`;
        if (pt === last) return; last = pt;
        d += (i ? 'L' : 'M') + pt;
      });
      d += 'Z';
    }
    if (!hit) continue;
    const me = f.properties.name === label;
    paths += `<path d="${d}" fill="${me ? '#E9E9E9' : '#F4F4F4'}" stroke="#CCCCCC" stroke-width="1"/>`;
    if (me) {
      const pts = rs[0]; const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      lbl = `<div style="position:absolute;left:${(px(cx) - 30).toFixed(0)}px;top:${(py(cy) - 30).toFixed(0)}px;font-size:14px;letter-spacing:.04em;color:${G}">${label}</div>`;
    }
  }
  const rect = (a, b, c, d2) => `<rect x="${px(a).toFixed(1)}" y="${py(d2).toFixed(1)}" width="${(px(c) - px(a)).toFixed(1)}" height="${(py(b) - py(d2)).toFixed(1)}" fill="rgba(0,109,247,.10)" stroke="${ACC}" stroke-width="1"/>`;
  const tag = (lon, lat, t) => `<div class="n" style="position:absolute;left:${px(lon).toFixed(0)}px;top:${(py(lat) - 20).toFixed(0)}px;height:18px;line-height:20px;padding:0 5px;background:${ACC};color:#FFFFFF;font-size:14px">${t}</div>`;
  const { svg, html } = inner(rect, tag);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:#FAFAFA;border:1px solid ${H}"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block">${paths}${svg}</svg>${lbl}${html}</div>\n`;
}

// ======================================================================
// 9. B5-Project-Create — 발주(2026-08-27): "오른쪽에서 프로젝트 명을 치고 탐지 유형을 정리하고 학습데이터 유형과
//    영상 불러오기 · 불러오기에 따른 권장 해상도 · 학습데이터 불러오기 · 구성원 초대" → 우 패널 480 = 폼(위→아래 그 순서)
//    좌 776 = 현재 단계(03 영상 불러오기)의 픽커 크게 · 단계 레일 5 = 진행(폼 절 01–05)
// ======================================================================
function create() {
  let s = '';
  s += txt(X0, 22, '‹ 프로젝트 목록', 13, G) + hl(72, 64, 1368);
  s += disp(X0, 80, '프로젝트 만들기', 32);
  // 단계 레일 — 판 5(136×64) + 헤어라인 연결 + 포트 · 상태어(완료 / 진행 / 대기) = 우 폼의 절 01–05
  const steps = [['01', '프로젝트명', '완료'], ['02', '탐지 유형', '완료'], ['03', '영상 불러오기', '진행'], ['04', '학습데이터', '대기'], ['05', '구성원 초대', '대기']];
  const SW = 136, SG = 24, SY = 140, SH = 64;
  steps.forEach(([n, t, stt], i) => {
    const x = X0 + i * (SW + SG), done = stt === '완료', on = stt === '진행';
    s += div(x, SY, SW, SH, `border:${on ? 1.5 : 1}px solid ${on || done ? INK : H};background:${on ? T1 : '#FFFFFF'}`);
    s += num(x + 12, SY + 10, n, 12, on || done ? ACC : C) + st(x + SW - 12, SY + 10, done ? '완료 ✓' : stt, `right:auto;transform:translateX(-100%);color:${done || on ? ACC : C}`);
    s += disp(x + 12, SY + 34, t, 15, on || done ? INK : G);
    if (i) s += div(x - 3, SY + SH / 2 - 3, 6, 6, `background:${on || done ? INK : '#FFFFFF'};border:1px solid ${on || done ? INK : C}`);
    if (i < 4) s += div(x + SW - 3, SY + SH / 2 - 3, 6, 6, `background:${done ? INK : '#FFFFFF'};border:1px solid ${done ? INK : C}`) + hl(x + SW + 3, SY + SH / 2, SG - 6, done ? INK : H);
  });
  // 좌 — 현재 단계 03 영상 불러오기 = 아카이브 픽커(원본 파일 추가 모달: 유형 · 검색 · 초기화/검색 · 목록 8 · 페이지네이션)
  const TY = 232;
  s += disp(X0, TY, '03 · 영상 불러오기', 22) + st(XR - 200, TY + 10, '아카이브 8건 · 선택 2', 'width:200px;text-align:right');
  const ty = 272;
  s += sel(X0, ty, 96, '전체', G) + search(X0 + 104, ty, 200, '검색어') + tb(X0 + 312, ty, '초기화', false, `color:${G}`) + tb(X0 + 360, ty, '검색') + pager(XR - 160, ty + 7);
  s += hl(X0, ty + 34, W);
  const arc = [
    ['남원 정사영상 2026-04 A구역', '2026.04 · 1.08 cm', 'tile-arc-a.jpg', true, '시연'], ['운봉읍 드론 정사영상 2026-04', '2026.04 · 1.69 cm', 'tile-arc-hid.jpg', true, '시연'], ['남원 전역 2025.10', '2025.10 · 2.00 m/px', 'tile-ep-4.jpg'],
    ['국산리 드론 A68 2025.08', '2025.08 · 0.05 m/px', 'tile-kuksan-1.jpg'], ['순찰차량 도로영상 2026-04', '2026.04 · 4,820장', 'pj-car.jpg', false, '시연'], ['제주 항공 정사영상 2020.12', '2020.12 · 0.10 m/px', 'pj-jeju2020.jpg'],
  ];
  const TW = 240, TH = 136, TG = (W - TW * 3) / 2, RH = 180, GY = 322;
  arc.forEach(([n, m, src, on, tg], i) => {
    const x = X0 + (i % 3) * (TW + TG), y = GY + Math.floor(i / 3) * RH;
    if (on) s += div(x - 8, y - 8, TW + 16, RH - 4, `background:${T1}`);
    s += img(x, y, TW, TH, src, on ? brkIn(TW, TH, ACC) : '');
    if (on) s += chk(x + TW - 22, y + 8, true);
    s += txt(x, y + TH + 8, n + (tg ? `<span class="tag">${tg}</span>` : ''), 13, INK, `width:${TW}px;overflow:hidden;text-overflow:ellipsis`) + num(x, y + TH + 28, m, 12, G);
  });
  // 풋프린트 — 회백 벡터 지도(sigungu.geojson · 남원 중심) 위 선택 2건의 범위 = 헤어라인 사각 + 번호표(1 A구역 = ortho_z15 범위 안 · 2 운봉읍)
  const MY2 = 690, MH2 = 146;
  s += vmap(X0, MY2, W, MH2, 127.43, 35.41, 0.30, (rect, tag) => ({
    svg: rect(127.29, 35.33, 127.37, 35.39) + rect(127.50, 35.42, 127.56, 35.47),
    html: tag(127.29, 35.39, '1 · A구역') + tag(127.50, 35.47, '2 · 운봉읍'),
  }));
  s += num(X0, MY2 + MH2 + 6, '남원 · 선택 영상 범위 · 시군구 경계 = 행정안전부', 12, G) + txt(XR - 240, MY2 + MH2 + 6, '‹ 이전 02 · 다음 04 ›', 13, INK, 'width:240px;text-align:right');
  // ── 우 패널 480 = 폼(위→아래: 프로젝트명 → 탐지 유형 → 학습데이터 유형 → 영상 불러오기 → 권장 해상도 → 학습데이터 불러오기 → 구성원 초대 → CTA)
  s += div(DX, 64, DW, 836, 'background:#FFFFFF') + vl(DX, 64, 836, INK);
  s += disp(DI, 86, '새 프로젝트', 20) + num(1416 - 80, 92, '03 / 05', 12.5, G, 'width:80px;text-align:right') + hl(DI, 122, DIW);
  const sec = (y, n, t, on = false, wait = false) => num(DI, y, n, 12, wait ? C : ACC) + lab(DI + 24, y, t, on ? `color:${INK}` : (wait ? `color:${C}` : ''));
  // 01 프로젝트명
  s += sec(136, '01', '프로젝트명') + fld(DI, 156, DIW, `<span style="font-size:15.5px">남원 비닐하우스 2026</span><span style="flex:1"></span><span class="n" style="font-size:14px;color:${G}">13/100</span>`, `height:36px;border-color:${INK}`);
  // 02 탐지 유형 — 타일 2(208×84) + 학습데이터 유형 select
  s += sec(208, '02', '탐지 유형');
  s += img(DI, 228, 208, 84, 'pj-radio-det.jpg', poly(208, 84, DET, .9) + brkIn(208, 84, INK, 12, 1.5)) + img(DI + 224, 228, 208, 84, 'pj-radio-seg.jpg', poly(208, 84, SEG, .9));
  s += txt(DI, 318, 'Object Detection', 13) + txt(DI + 224, 318, 'Segmentation', 13, G);
  s += lab(DI + 24, 352, '학습데이터 유형') + sel(DI, 372, DIW, '정사영상 (ortho)');
  // 03 영상 불러오기(진행 = 틴트 띠) — 버튼 `아카이브에서 선택` + 선택 2 썸네일 + 권장 해상도(GSD 에서 자동)
  s += div(DX + 1, 412, DW - 1, 176, `background:${T1}`) + div(DX + 1, 412, 2, 176, `background:${INK}`);
  s += sec(424, '03', '영상 불러오기', true);
  s += `<div class="fld" style="left:${DI}px;top:444px;width:160px;height:32px;border-color:${INK};background:#FFFFFF;justify-content:center">${ico('import', INK, 14)}아카이브에서 선택</div>\n`;
  s += img(DI + 172, 444, 56, 32, 'tile-arc-a.jpg', brkIn(56, 32, ACC, 6)) + img(DI + 236, 444, 56, 32, 'tile-arc-hid.jpg', brkIn(56, 32, ACC, 6)) + txt(DI + 304, 448, '선택 2', 13) + num(DI + 304, 468, '1.08 – 1.69 cm', 12, G);
  s += lab(DI + 24, 496, '권장 해상도') + `<span class="tag" style="position:absolute;left:${DI + 24 + 74}px;top:494px;border-color:${ACC};color:${ACC}">자동</span>\n`;
  s += sel(DI, 516, DIW, '≤ 0.02 m/px') + num(DI, 552, '선택 영상 GSD 1.08 – 1.69 cm → 2 cm 급', 12, G);
  // 04 학습데이터 불러오기
  s += sec(608, '04', '학습데이터 불러오기', false, true);
  s += `<div class="fld" style="left:${DI}px;top:628px;width:200px;height:32px;justify-content:center;color:${G}">${ico('layers', G, 14)}데이터셋 · 라벨링 데이터</div>\n` + txt(DI + 212, 634, '선택 0', 13, C);
  // 05 구성원 초대 — 아이디 확인 → 역할(원본 모달 3필드) + 소유자 행
  s += sec(684, '05', '구성원 초대', false, true);
  s += fld(DI, 704, 196, `<span style="color:${C}">아이디</span>`) + tb(DI + 204, 704, '확인', false, `color:${G}`) + sel(DI + 252, 704, 180, '편집자', G);
  s += hl(DI, 748, DIW) + txt(DI, 756, '소유자 · 내 계정', 13) + num(1416 - 80, 756, '1 명', 12.5, G, 'width:80px;text-align:right') + hl(DI, 782, DIW);
  s += hl(DI, 818, DIW) + tb(DI, 830, '목록', false, `color:${G}`) + tb(DI + 48, 830, '취소', false, `color:${G}`) + cta(1416 - 120, 826, 120, '프로젝트 만들기');
  s += FOOT;
  return page('B5 · 프로젝트 — 만들기', s);
}

wr('B5-Project-Create.dc.html', create());
wr('B5-Projects.dc.html', projects());
wr('B5-Project-Overview.dc.html', overview());
wr('B5-Project-Data.dc.html', data());
wr('B5-Project-Train.dc.html', train());
wr('B5-Project-Labeling.dc.html', labeling());
wr('B5-Project-Analysis.dc.html', analysis());
wr('B5-Project-Deploy.dc.html', deploy());
wr('B5-Project-Delete.dc.html', del());
