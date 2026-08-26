// B5-Projects · B5-Project-Overview · B5-Project-Data 아트보드 생성기
// 법전: design/system.md · docs/superpowers/proto/2026-08-26-projects-b5-brief.md
// 레일 72 = design-canvas/v2/B5-Dashboard.dc.html 33–83행을 읽어 활성 항목만 프로젝트로 바꾼다.
// 수치 출처: landxi/assets/data/{models,results,imagery}.js — 없는 값은 — 또는 결손 한 줄.
import fs from 'node:fs';
import { MODELS } from '../../landxi/assets/data/models.js';
import { RESULTS } from '../../landxi/assets/data/results.js';
import { IMAGERY } from '../../landxi/assets/data/imagery.js';

const V = 'design-canvas/v2';
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', TEAL = '#0FA9A0', W = '#FFFFFF';

/* ───────── 레일 72 (B5-Dashboard 마크업 복사 · 활성 = 프로젝트) ───────── */
const railSrc = fs.readFileSync(`${V}/B5-Dashboard.dc.html`, 'utf8').split('\n').slice(32, 83).join('\n');
const RAIL = railSrc
  .replace('<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"></div>\n', '')
  .replace('<svg style="color:#010102;flex:none"', '<svg style="color:#686868;flex:none"')
  .replace('color:#010102">대시보드', 'color:#686868">대시보드')
  .replace('left:0;top:188px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">\n\n',
    'left:0;top:188px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">\n<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"></div>\n')
  .replace('<svg style="color:#686868;flex:none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter"><path d="M2.5 2.5h5v5h-5z"',
    '<svg style="color:#010102;flex:none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter"><path d="M2.5 2.5h5v5h-5z"')
  .replace('color:#686868">프로젝트</div>', 'color:#010102">프로젝트</div>');
if (!/top:188px[\s\S]{0,200}background:#010102/.test(RAIL)) throw new Error('rail: 프로젝트 활성 표식 실패');
if (RAIL.split('#006DF7').length > 1) throw new Error('rail: 액센트 유입');

/* ───────── 원시 재료 ───────── */
const hl = (x, y, w, c = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:1px;background:${c}"></div>`;
const vl = (x, y, h, c = H) => `<div style="position:absolute;left:${x}px;top:${y}px;width:1px;height:${h}px;background:${c}"></div>`;
const box = (x, y, w, h, c = H, dash = false) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px ${dash ? 'dashed' : 'solid'} ${c}"></div>`;
const bracket = (w, h, color, k = 12, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none"><path d="M0 ${k}V0h${k}M${w - k} 0h${k}v${k}M${w} ${h - k}v${k}h-${k}M${k} ${h}H0v-${k}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
const t = (x, y, s, style = '') => `<div style="position:absolute;left:${x}px;top:${y}px;${style}">${s}</div>`;
const tag = (s) => `<span class="tag">${s}</span>`;
const mic = (x, y, s, w = 0, c = G) => `<div class="mic" style="position:absolute;left:${x}px;top:${y}px;${w ? `width:${w}px;` : 'white-space:nowrap;'}color:${c}">${s}</div>`;
const lab = (x, y, s, style = '') => `<div class="lab" style="position:absolute;left:${x}px;top:${y}px;white-space:nowrap;${style}">${s}</div>`;

// 폼 컨트롤
const field = (x, y, w, h, inner, active = false) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid ${active ? INK : H};display:flex;align-items:center;padding:0 11px;gap:8px">${inner}</div>`;
const caret = (c = G) => `<svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="${c}" stroke-width="1.25" style="flex:none"><path d="M.5.5 4.5 5 8.5.5"/></svg>`;
const btnO = (x, y, w, h, s, ink = false) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid ${ink ? INK : H};display:flex;align-items:center;justify-content:center;font-size:12.5px;letter-spacing:-.014em;color:${ink ? INK : G};white-space:nowrap">${s}</div>`;
const btnFill = (x, y, w, h, s, fs = 13) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${INK};display:flex;align-items:center;justify-content:center;gap:8px;font-size:${fs}px;letter-spacing:-.014em;color:${W};white-space:nowrap">${s}</div>`;
const chip = (s, c = G) => `<span class="chip" style="color:${c};border-color:${c === INK ? INK : H}">${s}</span>`;

// 결손 액자 (system §5: 점선 무채 + 이유 한 줄)
const gap = (x, y, w, lines) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;border-left:1px dotted ${C};padding-left:10px">` +
  lines.map((l) => `<div class="mic" style="color:${G};line-height:17px">${l}</div>`).join('') + '</div>';

// 결과 지오메트리 (청록) — 실사 크롭 위 실제 탐지 도형을 옮긴 것
const poly = (w, h, polys, sw = 1.1) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none">` +
  polys.map(p => `<polygon points="${p.map(([a, b]) => `${a},${b}`).join(' ')}" fill="rgba(15,169,160,.10)" stroke="${TEAL}" stroke-width="${sw}" stroke-linejoin="miter"/>`).join('') + '</svg>';

// 사진 판
const plate = (x, y, w, h, src, over = '') =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;background:${W}">
<img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;object-fit:cover;display:block;">${over}</div>`;

/* ───────── 실측 도형 (원본 크롭의 파란 폴리곤을 좌표로 옮긴 값) ───────── */
// greenhouse/1-clean — 비닐하우스 3동 (세로 스트립), 원본 640×420 기준
const GH1 = (w, h) => { // w,h = 표시 크기, 소스 640×420 커버 크롭
  const s = Math.max(w / 640, h / 420), oy = (420 * s - h) / 2 / s, ox = (640 * s - w) / 2 / s;
  const P = (x, y) => [+(((x - ox) * s)).toFixed(1), +(((y - oy) * s)).toFixed(1)];
  return [
    [P(200, 0), P(248, 0), P(270, 420), P(222, 420)],
    [P(252, 0), P(300, 0), P(322, 420), P(275, 420)],
    [P(332, 0), P(380, 0), P(400, 420), P(353, 420)],
  ];
};
// greenhouse/3-clean — 비닐하우스 4동 (가로 폴리곤)
const GH3 = (w, h) => {
  const s = Math.max(w / 640, h / 420), oy = (420 * s - h) / 2 / s, ox = (640 * s - w) / 2 / s;
  const P = (x, y) => [+(((x - ox) * s)).toFixed(1), +(((y - oy) * s)).toFixed(1)];
  return [
    [P(180, 105), P(447, 100), P(450, 143), P(172, 150)],
    [P(172, 148), P(455, 142), P(458, 185), P(178, 192)],
    [P(176, 190), P(465, 185), P(468, 232), P(180, 238)],
    [P(200, 236), P(470, 238), P(472, 272), P(205, 275)],
  ];
};
// farmland/2-clean — 농지 필지 3
const FM2 = (w, h) => {
  const s = Math.max(w / 640, h / 420), oy = (420 * s - h) / 2 / s, ox = (640 * s - w) / 2 / s;
  const P = (x, y) => [+(((x - ox) * s)).toFixed(1), +(((y - oy) * s)).toFixed(1)];
  return [
    [P(233, 208), P(262, 172), P(330, 152), P(432, 150), P(468, 180), P(452, 203), P(388, 232), P(300, 262), P(255, 268)],
    [P(232, 300), P(258, 300), P(300, 352), P(285, 368), P(240, 395), P(180, 368), P(178, 350)],
    [P(330, 368), P(348, 330), P(430, 318), P(482, 332), P(490, 360), P(470, 390), P(390, 398), P(340, 392)],
  ];
};
// farmland/1-clean — 농지 필지 2
const FM1 = (w, h) => {
  const s = Math.max(w / 640, h / 420), oy = (420 * s - h) / 2 / s, ox = (640 * s - w) / 2 / s;
  const P = (x, y) => [+(((x - ox) * s)).toFixed(1), +(((y - oy) * s)).toFixed(1)];
  return [
    [P(470, 12), P(106, 252), P(242, 356), P(552, 146)],
    [P(560, 155), P(638, 210), P(470, 395), P(400, 310)],
  ];
};

/* ───────── 데이터 ───────── */
const M = Object.fromEntries(MODELS.map(m => [m.id, m]));
const GHR = RESULTS.find(r => r.id === 'namwon-greenhouse-2025');
const ORTHO = IMAGERY.filter(i => i.kind === 'ortho');           // 10 도엽 (landcover 1 제외)
const TASK = { detect: 'Object Detection', segment: 'Segmentation', obb: 'OBB' };
const nf = (n) => n.toLocaleString('en-US');

// 프로젝트 8건 = models.js 10종 − 범용 사전학습 2종(yolo11n · yolo11x-obb, 기반 모델이지 프로젝트가 아니다)
// 정렬 = 최근 학습 내림차순 → 파일 크기 내림차순 (B2 §5 선례)
const PJ = ['best-road', 'best-vinylhouse', 'best-house', 'best-car',
  'model-segformer-land', 'model-landuse-epoch000', 'model-yolo-illegal-building', 'model-yolo-illegal']
  .map(id => M[id]);

const shellStyle = `@import url("https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css");
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','SUIT',system-ui,sans-serif;font-weight:400;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'SUIT','Pretendard',system-ui,sans-serif;font-weight:500;letter-spacing:-.01em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:12px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:12px;line-height:1.35;color:#686868}
.chip{height:22px;line-height:20px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:12px;white-space:nowrap;display:inline-block}
.tag{border:1px dotted #CCCCCC;padding:0 5px;font-size:12px;line-height:16px;color:#686868;margin-left:5px;display:inline-block;vertical-align:1px;font-family:'Pretendard',system-ui,sans-serif;letter-spacing:0}`;

const page = (body) => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>
${shellStyle}
</style></helmet>
<div style="width:1440px;height:900px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','SUIT',system-ui,sans-serif;color:#010102">
${RAIL}
${body}
</div>
</x-dc>
</body>
</html>
`;

const footer = (w = 1368, colo = true) => hl(72, 866, w) +
  `<div class="mic" style="position:absolute;left:128px;top:876px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>` +
  (colo ? `<div class="mic" style="position:absolute;left:820px;top:876px;width:564px;text-align:right;color:#CCCCCC;white-space:nowrap">출처 표기 — 태그 없음 = 측정 · <span style="color:#686868">시연</span> = 원본 데모 시드 · <span style="color:#686868">추정</span> = 우리가 이은 값</div>` : '');

/* ══════════════════════════════════════════════════════════════════
   A. B5-Projects — ① 프로젝트 목록 + ② 만들기 드로어(열림)
   ══════════════════════════════════════════════════════════════════ */
function artboardProjects() {
  const P = [];
  const GRIDR = 960;   // 드로어 왼쪽 경계

  // 마스트헤드 64
  P.push(`<div style="position:absolute;left:128px;top:12px;width:${GRIDR - 128 - 12}px;height:42px;display:flex;align-items:baseline;gap:14px">
<span class="d" style="font-size:32px;line-height:40px">프로젝트</span>
<span style="font-size:13.5px;letter-spacing:-.01em;color:${G}">학습 데이터 구성부터 라벨링 · 학습 · 분석 · 발행까지 한 프로젝트에서</span>
<span style="flex:1"></span>
<span class="n" style="font-size:13.5px;letter-spacing:.02em;white-space:nowrap">총 8건 중 1–8행</span></div>`);
  P.push(hl(72, 64, 1368));

  /* CHIP-RAIL — 원본 ① 컨트롤 전량 */
  const cy = 78, ch = 28;
  P.push(field(128, cy, 176, ch, `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${G}" stroke-width="1.5" style="flex:none"><circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/></svg><span style="font-size:12.5px;color:${C}">프로젝트명</span>`));
  P.push(btnO(312, cy, 52, ch, '초기화'));
  P.push(btnO(372, cy, 52, ch, '검색', true));
  P.push(vl(440, cy + 4, 20));
  P.push(lab(452, cy + 8, '페이지 크기'));
  P.push(field(524, cy, 54, ch, `<span class="n" style="font-size:12.5px;color:${INK}">10</span><span style="flex:1"></span>${caret()}`));
  P.push(mic(586, cy + 8, '20 · 50', 0, C));
  P.push(vl(638, cy + 4, 20));
  const pag = [['처음', 650], ['이전', 683], ['다음', 745], ['마지막', 778]];
  P.push(pag.map(([s, x]) => t(x, cy + 7, s, `font-size:12.5px;letter-spacing:-.014em;color:${G};white-space:nowrap`)).join(''));
  P.push(`<div style="position:absolute;left:717px;top:${cy + 4}px;width:20px;height:20px;border:1px solid ${INK};display:flex;align-items:center;justify-content:center"><span class="n" style="font-size:12px">1</span></div>`);
  // 화면 유일의 채움 버튼
  P.push(btnFill(828, cy, 120, ch, `프로젝트 만들기`, 12.5));
  P.push(hl(128, 120, GRIDR - 128 - 12));

  /* 카드 그리드 — 3열 402 × 2행. 3열째는 드로어 뒤 */
  const CW = 402, CH2 = 226, COLX = [128, 554, 980], ROWY = [140, 456];
  function card(i, x, y, src, over, opts = {}) {
    const p = PJ[i];
    const cls = p.classes.length;
    const labeled = opts.labeled;
    const s = [];
    s.push(plate(x, y, CW, CH2, src, over + (opts.sel ? bracket(CW, CH2, ACC, 14, 1.5) : '')));
    s.push(t(x, y + CH2 + 8, `<span class="d" style="font-size:16px;line-height:20px">${p.name}</span>${p.inferred ? tag('추정') : ''}${opts.sel ? `<span class="n" style="font-size:13px;color:${ACC};margin-left:10px">열기 ›</span>` : ''}`,
      `width:${CW}px;white-space:nowrap;overflow:hidden`));
    s.push(`<div class="n" style="position:absolute;left:${x}px;top:${y + CH2 + 32}px;width:${CW}px;font-size:12px;line-height:16px;letter-spacing:.01em;white-space:nowrap;overflow:hidden">${TASK[p.task]} · 클래스 ${cls} · ${p.sizeMB.toFixed(1)} MB · 최근 학습 ${p.trainedAt}</div>`);
    s.push(`<div class="n" style="position:absolute;left:${x}px;top:${y + CH2 + 50}px;width:${CW}px;font-size:12px;line-height:16px;letter-spacing:.01em;color:${G};white-space:nowrap;overflow:hidden">학습데이터 정사영상 · 등록일 — · 라벨링 ${labeled || '—'} · 학습 1 · 구성원 —</div>`);
    return s.join('');
  }
  // r1c1 도로망 세그멘테이션 — 결과 없음(청록 0)
  P.push(card(0, COLX[0], ROWY[0], 'pj-road.jpg', ''));
  // r1c2 비닐하우스 탐지 — results.js 남원시 비닐하우스 조사 2025 · 선택(호버) = 화면 유일 액센트
  P.push(card(1, COLX[1], ROWY[0], 'pj-greenhouse.jpg', poly(CW, CH2, GH1(CW, CH2)), { sel: true, labeled: nf(GHR.stats.count) }));
  // r2c1 차량·교통량 탐지
  P.push(card(3, COLX[0], ROWY[1], 'pj-car.jpg', ''));
  // r2c2 토지형질 SegFormer
  P.push(card(4, COLX[1], ROWY[1], 'pj-land.jpg', ''));

  P.push(hl(128, 768, GRIDR - 128 - 12));
  P.push(gap(128, 778, 800, [
    `프로젝트 8건 = 학습 모델 대장 10종에서 범용 사전학습 2종(yolo11n · yolo11x-obb — 기반 모델)을 뺀 값 · 정렬 = 최근 학습 내림차순`,
    `담당자명 · 활동 기록 없음(콘티 원칙). 라벨링 n 은 결과 대장에서 셀 수 있는 1건만 숫자, 나머지는 — · 학습 n = 모델 파일 수 · 구성원 n 은 운영 데이터라 비움`,
    `카드 썸네일 = 우리 실자산 크롭 · 청록 도형은 결과가 있는 프로젝트에만(남원시 비닐하우스 조사 2025 · 1,674 필지 · 측정)`,
  ]));
  P.push(mic(128, 838, `일탈 1회 — 만들기 드로어가 우·하 마진을 뚫고 3열째(프로젝트 03 · 06)를 덮는다 · 3행(07 · 08)은 스크롤 아래`, 0, C));
  P.push(footer(888, false));

  /* ② 만들기 드로어 480 (열린 상태) */
  const D = [];
  const dx = 960, ix = 984, iw = 432;
  D.push(`<div style="position:absolute;left:${dx}px;top:64px;width:480px;height:836px;background:${W}"></div>`);
  D.push(vl(dx, 64, 836, INK));
  D.push(t(ix, 82, `<span class="d" style="font-size:20px;line-height:26px">프로젝트 만들기</span>`));
  D.push(t(ix + iw - 12, 86, `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.3"><path d="M.75.75l10.5 10.5M11.25.75.75 11.25"/></svg>`));
  D.push(mic(ix, 114, `원본 ② <span class="n">ai-project-create.html</span> — 목록 우상단 CTA 가 여는 드로어`, iw));
  D.push(hl(ix, 138, iw));

  D.push(lab(ix, 152, '프로젝트명 <span style="color:#010102">*</span>'));
  D.push(field(ix, 172, iw, 36, `<span style="font-size:13.5px;letter-spacing:-.01em">남원 비닐하우스 2026</span><span style="flex:1"></span><span class="n" style="font-size:12px;color:${G}">13/100</span>`, true));

  D.push(lab(ix, 226, '탐지유형 <span style="color:#010102">*</span>'));
  const rw = 204;
  const radio = (x, src, over, name, sub, on) => {
    const s = [];
    s.push(plate(x, 246, rw, 115, src, over + (on ? bracket(rw, 115, INK, 12, 1.5) : '')));
    s.push(t(x, 370, `<span style="display:inline-flex;align-items:center;gap:7px"><span style="width:11px;height:11px;border:1px solid ${on ? INK : C};display:inline-block;position:relative">${on ? `<span style="position:absolute;left:2px;top:2px;width:5px;height:5px;background:${INK};display:block"></span>` : ''}</span><span class="d" style="font-size:13.5px;color:${on ? INK : G}">${name}</span></span>`));
    s.push(mic(x, 392, sub, rw, C));
    return s.join('');
  };
  D.push(radio(ix, 'pj-radio-det.jpg', poly(rw, 115, GH3(rw, 115), .9), 'Object Detection', '경계 상자 · 개체 수 집계', true));
  D.push(radio(ix + 228, 'pj-radio-seg.jpg', poly(rw, 115, FM2(rw, 115), .9), 'Segmentation', '폴리곤 · 면적 집계', false));

  D.push(lab(ix, 430, '학습 데이터 유형 <span style="color:#010102">*</span>'));
  D.push(field(ix, 450, iw, 36, `<span style="font-size:13.5px;letter-spacing:-.01em">정사영상 (ortho)</span><span style="flex:1"></span>${caret()}`));
  D.push(lab(ix, 504, '권장 해상도 <span style="color:#010102">*</span>'));
  D.push(field(ix, 524, iw, 36, `<span class="n" style="font-size:13.5px">0.02 m/px 이하</span>${tag('추정')}<span style="flex:1"></span>${caret()}`));
  D.push(lab(ix, 578, '클래스'));
  D.push(field(ix, 598, iw, 36, `<span style="font-size:13.5px;letter-spacing:-.01em;color:${C}">클래스명 입력 후 Enter</span>`));
  D.push(`<div style="position:absolute;left:${ix}px;top:646px;width:${iw}px;display:flex;gap:8px">${chip('비닐하우스_단동 ×', INK)}${chip('비닐하우스_다동 ×', INK)}</div>`);
  D.push(hl(ix, 690, iw));
  D.push(gap(ix, 702, iw, [
    `클래스 2 = 결과 대장 남원시 비닐하우스 조사 2025 의 실제 분류(측정) · 모델 대장의 클래스는 Vinylhouse 1`,
    `권장 해상도는 대장에 없는 값 — 남원 도엽 GSD 0.011–0.017 m 에서 이었다`,
  ]));
  D.push(mic(ix, 762, `이 판이 표기만 하는 상태 — <span style="color:#010102">만들기 → 목록 복귀</span> · 이름 중복 검사 · 필수 3필드 미입력 시 만들기 비활성`, iw));
  D.push(t(ix, 845, `<span style="font-size:13.5px;line-height:18px;letter-spacing:-.014em;color:${G}">목록</span>`));
  D.push(t(ix + 50, 845, `<span style="font-size:13.5px;line-height:18px;letter-spacing:-.014em;color:${G}">취소</span>`));
  D.push(btnO(ix + iw - 108, 836, 108, 36, '만들기', true));

  return page(P.join('\n') + '\n' + D.join('\n'));
}

/* ══════════════════════════════════════════════════════════════════
   B. B5-Project-Overview — ③ 개요 (수정 · 초대는 상태 표기)
   ══════════════════════════════════════════════════════════════════ */
const TABS = [['개요', ''], ['데이터', '10'], ['라벨링', '3'], ['학습', '5'], ['분석', ''], ['배포', '1']];
function tabStrip(y, active, note) {
  const s = [];
  let x = 128;
  TABS.forEach(([name, n], i) => {
    const on = i === active;
    const w = name.length * 15 + (n ? String(n).length * 8 + 8 : 0) + 34;
    s.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:44px;display:flex;align-items:center;justify-content:center;gap:7px">
<span class="d" style="font-size:14.5px;color:${on ? INK : G}">${name}</span>${n ? `<span class="n" style="font-size:12px;letter-spacing:.02em;color:${on ? INK : C}">${n}</span>` : ''}</div>`);
    if (on) s.push(`<div style="position:absolute;left:${x}px;top:${y + 42}px;width:${w}px;height:2px;background:${INK}"></div>`);
    x += w;
  });
  s.push(mic(1384 - 620, y + 15, note, 620, G).replace('left:', 'text-align:right;left:'));
  s.push(hl(128, y + 44, 1256));
  return s.join('');
}

function artboardOverview() {
  const P = [];
  const p = M['best-vinylhouse'], st = GHR.stats;

  // 마스트헤드 64 — 원본 ⑫ 사이드바의 `< 프로젝트 목록`
  P.push(`<div style="position:absolute;left:128px;top:12px;width:1256px;height:40px;display:flex;align-items:center;gap:10px">
<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${INK}" stroke-width="1.5" style="flex:none"><path d="M11.5 4 6 10l5.5 6"/></svg>
<span style="font-size:13.5px;letter-spacing:-.01em">프로젝트 목록</span>
<span style="flex:1"></span>
<span class="n" style="font-size:13.5px;letter-spacing:.02em;color:${G}">기준일 현재 2026.08.26</span></div>`);
  P.push(hl(72, 64, 1368));

  /* 고정 헤더 (프로젝트명 48 + 히어로 420×240) */
  P.push(t(128, 84, `<span class="d" style="font-size:48px;line-height:55px;letter-spacing:-.018em">${p.name}</span>`, 'width:812px;white-space:nowrap'));
  P.push(`<div class="n" style="position:absolute;left:128px;top:156px;width:812px;font-size:14px;line-height:20px;letter-spacing:.01em;white-space:nowrap">${TASK[p.task]}<span style="color:${C}"> · </span>정사영상 (ortho)<span style="color:${C}"> · </span>GSD 0.011 – 2.00 m/px<span style="color:${C}"> · </span>최근 학습 ${p.trainedAt}</div>`);
  P.push(btnFill(128, 196, 160, 38, '라벨링 이어하기'));
  P.push(`<div style="position:absolute;left:304px;top:196px;height:38px;display:flex;align-items:center;gap:0;font-size:13.5px;letter-spacing:-.014em">
<span>수정</span><span style="color:${C};padding:0 10px">·</span><span>구성원 초대</span><span style="color:${C};padding:0 10px">·</span><span>목록</span><span style="color:${C};padding:0 10px">·</span><span>삭제</span></div>`);
  P.push(gap(128, 252, 812, [
    `상태 표기 — 수정: 인라인 편집 폼(프로젝트명 · 탐지유형 · 학습데이터 유형 · 권장 해상도)으로 이 자리를 교체`,
    `구성원 초대: 모달(아이디 확인 → 이름 자동 · 역할 편집자 / 뷰어) · 구성원 삭제: 행 액션`,
    `삭제: 확인 모달 — 원본의 빨강은 쓰지 않는다(상태색 규칙, 잉크로)`,
  ]));
  P.push(plate(964, 72, 420, 240, 'pj-hero.jpg', poly(420, 240, GH3(420, 240)) + bracket(420, 240, INK, 14, 1)));
  P.push(`<div class="n" style="position:absolute;left:964px;top:318px;width:420px;font-size:12px;line-height:15px;letter-spacing:.02em;color:${G};white-space:nowrap">남원 드론 정사영상 · 비닐하우스 4동 · 결과 도형 = 남원시 비닐하우스 조사 2025</div>`);
  P.push(hl(128, 340, 1256));

  /* 탭 6 + 배지 */
  P.push(tabStrip(340, 0, '배지 — 데이터 10 = 정사영상 도엽(측정) · 라벨링 3 · 학습 5 · 배포 1 = 원본 시드(시연)'));

  /* 좌 스탯 패널 288 */
  const LX = 128, LW = 288;
  P.push(lab(LX, 400, '프로젝트 정보'));
  P.push(hl(LX, 418, LW));
  const kv = [
    ['프로젝트명', p.name, ''],
    ['탐지유형', TASK[p.task], ''],
    ['학습데이터 유형', '정사영상(ortho)', '추정'],
    ['권장 해상도', '≤ 0.02 m/px', '추정'],
    ['등록일시', '—', ''],
    ['최근 학습', p.trainedAt, ''],
  ];
  kv.forEach(([k, v, g], i) => {
    const y = 424 + i * 28;
    P.push(t(LX, y + 6, `<span style="font-size:12px;letter-spacing:-.01em;color:${G}">${k}</span>`));
    P.push(`<div class="n" style="position:absolute;left:${LX}px;top:${y + 5}px;width:${LW}px;text-align:right;font-size:12.5px;letter-spacing:.01em;white-space:nowrap">${v}${g ? tag(g) : ''}</div>`);
    P.push(hl(LX, y + 28, LW));
  });

  // 세로 미니 막대 4×24 — 신뢰도 (결과 대장 측정). 액센트 1곳 = 평균 막대
  P.push(lab(LX, 606, `신뢰도 · n=${nf(st.confN)}`));
  const bars = [['최소', st.confMin, false], ['평균', st.confMean, true], ['최대', st.confMax, false]];
  bars.forEach(([n, v, on], i) => {
    const gx = LX + i * 96, by = 626, bh = 24;
    P.push(`<div style="position:absolute;left:${gx}px;top:${by}px;width:4px;height:${bh}px;background:${H}"></div>`);
    P.push(`<div style="position:absolute;left:${gx}px;top:${(by + bh - bh * v).toFixed(1)}px;width:4px;height:${(bh * v).toFixed(1)}px;background:${on ? ACC : INK}"></div>`);
    P.push(`<div class="n" style="position:absolute;left:${gx + 12}px;top:${by + 4}px;font-size:15px;line-height:16px;letter-spacing:.01em;color:${on ? ACC : INK};white-space:nowrap">${v.toFixed(3).slice(1)}</div>`);
    P.push(mic(gx, by + 30, n, 0, G));
  });
  P.push(gap(LX, 676, LW, [
    `mAP@50 · Precision · Recall`,
    `학습 결과 없음 — 모델 대장에 성능 지표가 없다`,
  ]));
  P.push(hl(LX, 726, LW));
  P.push(lab(LX, 736, `CLASSES (${Object.keys(st.classes).length})`));
  P.push(`<div style="position:absolute;left:${LX}px;top:756px;width:${LW}px;display:flex;flex-wrap:wrap;gap:8px">${Object.entries(st.classes).map(([k, v]) => chip(`${k} <span class="n" style="color:#010102">${nf(v)}</span>`, G)).join('')}</div>`);
  P.push(gap(LX, 816, LW, [
    `원본 클래스 5는 다른 프로젝트의 데모 시드 —`,
    `이 판은 결과 대장의 실제 분류 2를 쓴다`,
  ]));

  /* 우 928 */
  const RX = 456, RW = 928;
  P.push(t(RX, 398, `<span class="d" style="font-size:16px;line-height:22px">구성원</span><span class="mic" style="margin-left:10px">3명</span>`));
  P.push(`<div style="position:absolute;left:${RX}px;top:400px;width:${RW}px;text-align:right;font-size:13px;letter-spacing:-.014em;color:${INK};white-space:nowrap">구성원 초대 <span style="color:${C}">·</span> 삭제 <span style="color:${G}">›</span></div>`);
  P.push(hl(RX, 430, RW));
  // 결손 액자 — 이름 · 역할 · 라벨 수 · 날짜는 운영 데이터
  P.push(box(RX, 440, RW, 138, C, true));
  const cols = [[RX + 16, 60, '초성'], [RX + 92, 220, '이름'], [RX + 328, 140, '역할'], [RX + 484, 160, '라벨 수'], [RX + 660, 240, '날짜']];
  cols.forEach(([x, w, s]) => P.push(lab(x, 452, s)));
  P.push(hl(RX + 16, 470, RW - 32));
  for (let i = 0; i < 3; i++) {
    const y = 478 + i * 26;
    P.push(box(RX + 16, y + 1, 20, 20, C, true));
    P.push(`<div class="n" style="position:absolute;left:${RX + 92}px;top:${y + 3}px;font-size:13px;color:${C}">—</div>`);
    P.push(`<div class="n" style="position:absolute;left:${RX + 328}px;top:${y + 3}px;font-size:13px;color:${C}">—</div>`);
    P.push(`<div class="n" style="position:absolute;left:${RX + 484}px;top:${y + 3}px;font-size:13px;color:${C}">—</div>`);
    P.push(`<div class="n" style="position:absolute;left:${RX + 660}px;top:${y + 3}px;font-size:13px;color:${C}">—</div>`);
    if (i < 2) P.push(hl(RX + 16, y + 25, RW - 32));
  }
  P.push(mic(RX + 16, 558, `구성원 3의 이름 · 역할 · 라벨 수 · 날짜는 운영 데이터 — 콘티 원칙에 따라 비운다(원본 초성 타일도 폐기)`, RW - 32, G));

  /* 최근 학습 결과 (Roboflow TRY THIS MODEL 자리) */
  P.push(t(RX, 596, `<span class="d" style="font-size:16px;line-height:22px">최근 학습 결과</span><span class="mic" style="margin-left:10px"><span class="n">best(Vinylhouse).pt</span> · ${TASK[p.task]} · 클래스 ${p.classes.length} · <span class="n">${p.sizeMB.toFixed(1)} MB</span> · <span class="n">${p.trainedAt}</span></span>`));
  P.push(`<div style="position:absolute;left:${RX}px;top:598px;width:${RW}px;text-align:right;font-size:13px;letter-spacing:-.014em;white-space:nowrap">학습 이력 <span class="n">5</span>${tag('시연')} <span style="color:${G}">›</span></div>`);
  P.push(hl(RX, 628, RW));

  // 좌 — 클래스별 탐지 + 평균 신뢰도 (측정)
  P.push(lab(RX, 640, '클래스별 탐지 · 평균 신뢰도 — 남원시 비닐하우스 조사 2025'));
  const maxC = Math.max(...Object.values(st.classes));
  Object.entries(st.classes).forEach(([k, v], i) => {
    const y = 664 + i * 32, bw = 190;
    P.push(t(RX, y + 1, `<span style="font-size:12.5px;letter-spacing:-.01em;white-space:nowrap">${k}</span>`));
    P.push(`<div style="position:absolute;left:${RX + 116}px;top:${y}px;width:${bw}px;height:16px;border-bottom:1px solid ${H}"></div>`);
    P.push(`<div style="position:absolute;left:${RX + 116}px;top:${y}px;width:${(bw * v / maxC).toFixed(1)}px;height:16px;background:${i ? G : INK}"></div>`);
    P.push(`<div class="n" style="position:absolute;left:${RX + 314}px;top:${y + 1}px;width:56px;text-align:right;font-size:13px;letter-spacing:.01em">${nf(v)}</div>`);
    P.push(`<div class="n" style="position:absolute;left:${RX + 378}px;top:${y + 2}px;width:44px;text-align:right;font-size:12px;letter-spacing:.02em;color:${G}">${st.classMeanConf[k].toFixed(3).slice(1)}</div>`);
  });
  P.push(mic(RX, 732, `막대 = 필지 수 · 우측 값 = 클래스 평균 신뢰도 · 합계 ${nf(st.count)} 필지 · ${st.areaHa} ha`, 444));

  // 우 — 신뢰도 분포 10구간 (측정)
  const HX = 924, HW = 460;
  P.push(lab(HX, 640, `신뢰도 분포 10구간 · 중앙값 ${st.confMedian.toFixed(3).slice(1)}`));
  const hmax = Math.max(...st.confHist), bw2 = 38, gp = (HW - 10 * bw2) / 9;
  st.confHist.forEach((v, i) => {
    const x = HX + i * (bw2 + gp), h = v === 0 ? 0 : Math.max(2, 80 * v / hmax), y = 664 + 80 - h;
    if (v === 0) P.push(`<div style="position:absolute;left:${x.toFixed(1)}px;top:${664 + 78}px;width:${bw2}px;height:2px;background:${H}"></div>`);
    else P.push(`<div style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${bw2}px;height:${h.toFixed(1)}px;background:${i >= 8 ? INK : G}"></div>`);
    if (v > 0) P.push(`<div class="n" style="position:absolute;left:${x.toFixed(1)}px;top:${(y - 16).toFixed(1)}px;width:${bw2}px;text-align:center;font-size:12px;letter-spacing:.02em;color:${i >= 8 ? INK : G}">${v}</div>`);
  });
  P.push(hl(HX, 744, HW));
  [0, 3, 5, 7, 9].forEach(i => {
    const x = HX + i * (bw2 + gp);
    P.push(`<div class="n" style="position:absolute;left:${x.toFixed(1)}px;top:750px;width:${bw2}px;text-align:center;font-size:12px;letter-spacing:.02em;color:${G}">${st.confBins[i].toFixed(1)}</div>`);
  });
  P.push(mic(HX, 732 - 0, '', 0));
  P.push(gap(RX, 776, RW, [
    `혼동행렬 · 클래스별 F1 — 학습 결과 없음: 모델 대장에 오분류 · 클래스 성능 지표가 없다`,
    `원본 ⑦ 학습 결과 드로어(학습 정보 · 설정 · 결과 · 클래스별 성능 · 오분류 행렬)의 값은 데모 시드라 옮기지 않았다 — 학습 탭에서 다룬다`,
  ]));
  P.push(mic(RX, 830, `Data source: 신뢰도 · 클래스 · 필지 수 = 결과 대장 남원시 비닐하우스 조사 2025(측정 · 분석 2026-06-06) · GSD = 정사영상 대장 남원 도엽 10`, RW));
  P.push(footer());
  return page(P.join('\n'));
}

/* ══════════════════════════════════════════════════════════════════
   C. B5-Project-Data — ④ 파일 + ⑥ 데이터셋 (데이터 탭 · 세그먼트 2)
   ══════════════════════════════════════════════════════════════════ */
function artboardData() {
  const P = [];
  const p = M['best-vinylhouse'], st = GHR.stats;

  P.push(`<div style="position:absolute;left:128px;top:12px;width:1256px;height:40px;display:flex;align-items:center;gap:10px">
<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${INK}" stroke-width="1.5" style="flex:none"><path d="M11.5 4 6 10l5.5 6"/></svg>
<span style="font-size:13.5px;letter-spacing:-.01em">프로젝트 목록</span>
<span style="flex:1"></span>
<span class="n" style="font-size:13.5px;letter-spacing:.02em;color:${G}">기준일 현재 2026.08.26</span></div>`);
  P.push(hl(72, 64, 1368));

  /* 접힌 헤더 96 — 프로젝트명 24 + 탭 */
  P.push(t(128, 78, `<span class="d" style="font-size:24px;line-height:30px">${p.name}</span><span class="mic" style="margin-left:12px">개요 ›</span>`));
  P.push(`<div class="n" style="position:absolute;left:128px;top:84px;width:1256px;text-align:right;font-size:13px;letter-spacing:.01em;color:${G};white-space:nowrap">${TASK[p.task]} · 정사영상 · 도엽 ${ORTHO.length} · 결과 ${nf(st.count)} 필지</div>`);
  P.push(tabStrip(116, 1, '헤더 접힘 96 — 프로젝트명 24 + 탭만(원본 3겹 레일 667px → 레일 72 한 겹)'));

  /* 툴바 — 세그먼트 2 + 필터 + 액션 */
  const ty = 176, th = 28;
  const seg = (x, w, s, n, on) => `<div style="position:absolute;left:${x}px;top:${ty}px;width:${w}px;height:${th}px;border:1px solid ${on ? INK : H};display:flex;align-items:center;justify-content:center;gap:7px">
<span class="d" style="font-size:12.5px;color:${on ? INK : G}">${s}</span><span class="n" style="font-size:12px;letter-spacing:.02em;color:${on ? INK : C}">${n}</span></div>`;
  P.push(seg(128, 88, '파일', ORTHO.length, true));
  P.push(seg(215, 104, '데이터셋', 2, false));
  P.push(vl(336, ty + 4, 20));
  P.push(field(352, ty, 96, th, `<span style="font-size:12.5px;color:${G}">전체</span><span style="flex:1"></span>${caret()}`));
  P.push(field(456, ty, 112, th, `<span style="font-size:12.5px;color:${G}">데이터명</span><span style="flex:1"></span>${caret()}`));
  P.push(field(576, ty, 180, th, `<span style="font-size:12.5px;color:${C}">검색어</span>`));
  P.push(btnO(764, ty, 52, th, '초기화'));
  P.push(btnO(824, ty, 52, th, '검색', true));
  P.push(mic(1000, ty + 8, '0건 선택', 0, C));
  P.push(btnO(1074, ty, 84, th, '선택 제외'));
  P.push(btnO(1166, ty, 100, th, '파일 추가', true));
  // 그리드 / 리스트 토글
  P.push(`<div style="position:absolute;left:1332px;top:${ty}px;width:52px;height:${th}px;border:1px solid ${H};display:flex">
<div style="width:26px;height:26px;background:${INK};display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${W}" stroke-width="1.2"><path d="M.75.75h4.5v4.5H.75zM6.75.75h4.5v4.5h-4.5zM.75 6.75h4.5v4.5H.75zM6.75 6.75h4.5v4.5h-4.5z"/></svg></div>
<div style="width:25px;height:26px;display:flex;align-items:center;justify-content:center"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="${G}" stroke-width="1.2"><path d="M.75 1.75h10.5M.75 6h10.5M.75 10.25h10.5"/></svg></div></div>`);
  P.push(hl(128, 216, 1256));

  /* 5열 240×147 gap 12 (NOTES §13.1 값 그대로) */
  const COLS = [128, 380, 632, 884, 1136], ROWS = [232, 428], TW = 240, TH = 147;
  const TILES = [
    { im: 'namwon_2504', src: 'tile-arc-a.jpg', geo: FM1 },
    { im: 'namwon_2506', src: 'tile-gh-clean.jpg', geo: GH1, sel: true },
    { im: 'namwon_2508', src: 'tile-farm-clean.jpg', geo: FM2 },
    { im: 'namwon_2510', src: 'pj-nw2510.jpg', geo: GH3 },
    { im: 'namwon_city_2504', src: 'tile-ep-1.jpg' },
    { im: 'namwon_city_2510', src: 'tile-ep-4.jpg' },
    { im: 'kuksan_a68', src: 'tile-kuksan-1.jpg' },
    { im: 'kuksan_a71', src: 'tile-pub-3.jpg' },
    { im: 'jeju_2022', src: 'tile-arc-jeju.jpg' },
    { im: 'jeju_2020', src: 'pj-jeju2020.jpg' },
  ];
  TILES.forEach((tl, i) => {
    const im = IMAGERY.find(a => a.id === tl.im);
    const x = COLS[i % 5], y = ROWS[Math.floor(i / 5)];
    const over = (tl.geo ? poly(TW, TH, tl.geo(TW, TH), .9) : '') + (tl.sel ? bracket(TW, TH, ACC, 14, 1.5) : '');
    P.push(plate(x, y, TW, TH, tl.src, over));
    if (tl.sel) P.push(`<div class="n" style="position:absolute;left:${x + 8}px;top:${y + 8}px;font-size:11px;letter-spacing:.08em;color:${W}">선택</div>`);
    P.push(`<div class="n" style="position:absolute;left:${x}px;top:${y + TH + 5}px;width:${TW}px;font-size:11px;line-height:14px;letter-spacing:-.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${im.label.replace(' · ', ' ')}</div>`);
    P.push(`<div class="n" style="position:absolute;left:${x}px;top:${y + TH + 19}px;width:${TW}px;font-size:11px;line-height:14px;letter-spacing:.01em;color:${G};white-space:nowrap;overflow:hidden">${im.gsd < 1 ? im.gsd.toFixed(3) : im.gsd.toFixed(2)} m/px · 라벨 — · ${im.captured}</div>`);
  });
  P.push(hl(128, 626, 1256));

  /* 데이터셋 2 */
  P.push(t(128, 634, `<span class="d" style="font-size:16px;line-height:22px">데이터셋</span><span class="mic" style="margin-left:10px">2건</span>`));
  P.push(`<div style="position:absolute;left:128px;top:636px;width:1256px;text-align:right;font-size:13px;letter-spacing:-.014em;white-space:nowrap">선택 삭제 <span style="color:${C}">·</span> 데이터셋 만들기 <span style="color:${G}">›</span></div>`);
  P.push(hl(128, 664, 1256));
  const dcol = [[128, 520, '데이터셋명', 'left'], [672, 120, '버전', 'left'], [812, 240, '라벨링 데이터', 'right'], [1084, 300, '만든 날짜', 'right']];
  dcol.forEach(([x, w, s, a]) => P.push(`<div class="lab" style="position:absolute;left:${x}px;top:672px;width:${w}px;text-align:${a};white-space:nowrap">${s}</div>`));
  P.push(hl(128, 688, 1256));
  const DS = [
    ['비닐하우스 단동 라벨셋', 'v1.0', nf(st.classes['비닐하우스_단동']), st.analyzedAt],
    ['비닐하우스 다동 라벨셋', 'v1.0', nf(st.classes['비닐하우스_다동']), st.analyzedAt],
  ];
  DS.forEach((r, i) => {
    const y = 694 + i * 28;
    P.push(t(128, y + 3, `<span style="font-size:13.5px;letter-spacing:-.01em">${r[0]}</span>${tag('추정')}`, 'width:520px;white-space:nowrap;overflow:hidden'));
    P.push(`<div class="n" style="position:absolute;left:672px;top:${y + 3}px;width:120px;font-size:13.5px;letter-spacing:.01em;color:${G}">${r[1]}</div>`);
    P.push(`<div class="n" style="position:absolute;left:812px;top:${y + 3}px;width:240px;text-align:right;font-size:13.5px;letter-spacing:.01em">${r[2]}</div>`);
    P.push(`<div class="n" style="position:absolute;left:1084px;top:${y + 3}px;width:300px;text-align:right;font-size:13.5px;letter-spacing:.01em;color:${G}">${r[3]}</div>`);
    P.push(hl(128, y + 26, 1256));
  });

  /* 상태 표기 + 출처 */
  P.push(gap(128, 762, 620, [
    `이 판이 표기만 하는 상태 — <span style="color:#010102">파일 추가</span>: 모달(아카이브 목록 8건 표 + 검색 + 페이지네이션 + 취소/추가)`,
    `<span style="color:#010102">데이터셋 만들기</span>: 페이지(데이터셋명 · 버전 + 라벨링 데이터 선택 3건 체크 표 + 취소/만들기)`,
    `<span style="color:#010102">리스트 뷰</span>: 우상단 토글 오른쪽 칸 · 페이지네이션은 그리드 스크롤로 대신한다`,
  ]));
  P.push(gap(788, 762, 596, [
    `파일 = 정사영상 대장 도엽 ${ORTHO.length}건(측정 · 세그멘테이션 도엽 1건 제외) — 원본 시드 3건을 실자산으로 갈음`,
    `라벨 n 은 도엽 단위 집계가 없어 전부 — (결과 대장은 프로젝트 단위 ${nf(st.count)} 필지)`,
    `청록 주석 = 남원 도엽 4장의 실제 결과 도형 · 데이터셋 2 = 결과 대장 클래스 2(측정), 이름 · 버전은 추정`,
  ]));
  P.push(footer());
  return page(P.join('\n'));
}

/* ───────── 쓰기 + 게이트 ───────── */
const OUT = [
  ['B5-Projects', artboardProjects()],
  ['B5-Project-Overview', artboardOverview()],
  ['B5-Project-Data', artboardData()],
];
for (const [name, html] of OUT) {
  const acc = (html.match(/#006DF7/g) || []).length;
  const bad = ['border-radius', 'box-shadow', 'gradient', 'backdrop', '#FFB633'].filter(k => html.includes(k));
  fs.writeFileSync(`${V}/${name}.dc.html`, html);
  console.log(`${name}.dc.html  ${html.length}B  accent=${acc}  teal=${(html.match(/#0FA9A0/g) || []).length}${bad.length ? '  VIOLATION:' + bad.join(',') : ''}`);
}
