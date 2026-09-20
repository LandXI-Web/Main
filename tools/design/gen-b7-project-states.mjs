// B7 — 프로젝트 · 분석 서비스 원판의 "안 그려진 상태" 묶음 (감사 2026-09-20 P4m · P5m · P6m · P7m · P10m · A1m · A4m · §0 15–25행)
// 규칙 — 선택 1·2·3 없음: 이미 설계된 화면의 빠진 상태이므로 B5 원판과 같은 어휘여야 한다.
//   → 부품(프리미티브 · 셸 · 탭 · 드로어 · 대화상자 · 노드 · 지도 판)은 gen-b5-project.mjs / gen-b5-analysis.mjs 의 **코드를 그대로 불러** 쓴다
//     (두 생성기는 import 하면 B5 파일을 다시 쓰므로, 소스를 읽어 `wr(...)` 줄만 떼고 함수 범위로 평가한다 — B5 파일은 건드리지 않는다).
//   → 레일은 tools/design/b5-rail.html 에서 직접 조립(활성 막대 1개 — P2m 이중 활성 없음 · 마크 14px — P1m/법전 바닥 14).
// usage: node tools/design/gen-b7-project-states.mjs   (repo root · 멱등 · B7-*.dc.html 전부 다시 씀)
// render: PLAYWRIGHT_BROWSERS_PATH=… node tools/design/render-b7.mjs <이름들>   (render-b6-account.mjs 와 같은 코드 · 임시 폴더만 _tmp-b7-states)
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'design-canvas/v2');
const wr = (f, s) => { fs.writeFileSync(path.join(dir, f), s, 'utf8'); console.log('wrote', f, s.length); };

// ---------- B5 생성기에서 부품 불러오기 (부작용 없이) ----------
function load(file, names) {
  const src = fs.readFileSync(path.join(root, 'tools/design', file), 'utf8').replace(/\r\n/g, '\n')
    .replace(/^import .*$/gm, '').replace(/^wr\('.*$/gm, '');
  return new Function('fs', 'path', `${src}\nreturn {${names.join(',')}};`)(fs, path);
}
const P = load('gen-b5-project.mjs', ['HELMET', 'RAIL', 'FOOT', 'div', 'hl', 'vl', 'txt', 'num', 'disp', 'lab', 'st', 'tb', 'cta', 'chev', 'fld', 'sel', 'search', 'chk', 'img', 'pager', 'poly', 'brkIn',
  'GH', 'HERO', 'DET', 'SEG', 'ico', 'ibtn', 'mapTools', 'mapPlate', 'tealPolys', 'mapTag', 'dialog', 'LABEL_PTS', 'back', 'tabs', 'headCollapsed', 'drawer', 'node', 'port', 'nchip', 'deploy']);
const A = load('gen-b5-analysis.mjs', ['HELMET', 'RAIL', 'FOOT', 'MAST', 'head', 'segs', 'SERVICES', 'EV', 'FARM', 'fmt', 'chip', 'ico', 'ibtn', 'mapTools', 'mapPlate', 'steps', 'hbtn', 'svgPolys', 'runReview', 'TASK', 'MODEL']);
const { div, hl, vl, txt, num, disp, lab, st, tb, cta, chev, fld, sel, search, chk, img, pager, poly, brkIn, GH, HERO, DET, SEG, ico, ibtn, mapTools, mapPlate, tealPolys, mapTag, LABEL_PTS, back, tabs, headCollapsed, drawer, node, nchip, FOOT } = P;

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const X0 = 128, XR = 904, W = 776, DX = 960, DW = 480, DI = 984, DIW = 432;

// ---------- 레일 — b5-rail.html 을 항목 단위로 다시 조립 (활성 1) ----------
const RAIL0 = fs.readFileSync(path.join(root, 'tools/design/b5-rail.html'), 'utf8').replace(/\r\n/g, '\n');
function rail(activeTop) {
  let s = RAIL0.replace(/<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"><\/div>\n?/g, '')
    .replace('font-size:11px;letter-spacing:.18em;margin-right:-.18em;white-space:nowrap">LAND XI', 'font-size:14px;letter-spacing:.06em;line-height:16px;white-space:nowrap">LAND XI');
  const parts = s.split('\n<div style="position:absolute;left:0;top:');
  return parts.map((it, i) => {
    if (i === 0) return it;
    let o = it.replace(/color:#010102/g, 'color:#686868');
    if (it.startsWith(activeTop + 'px')) o = o.replace(/color:#686868/g, 'color:#010102').replace('gap:6px">', 'gap:6px">\n<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:#010102"></div>');
    return o;
  }).join('\n<div style="position:absolute;left:0;top:');
}
const RAIL_PJ = rail(188), RAIL_AN = rail(246);

const page = (title, body, kind = 'pj') => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
${kind === 'an' ? A.HELMET : P.HELMET}
<div style="width:1440px;height:900px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard',system-ui,sans-serif;color:#010102">
${kind === 'an' ? RAIL_AN : RAIL_PJ}${vl(72, 0, 900)}${body}</div>
</x-dc>
</body>
</html>
`;
// B5 판을 밑그림으로 — 루트 div 안쪽만 꺼내고 레일·72 세로선은 뗀다(page() 가 다시 끼운다)
function under(html, mod) {
  const m = /<div style="width:1440px;height:900px;[^>]*>\n([\s\S]*)<\/div>\n<\/x-dc>/.exec(html);
  return m[1].replace(mod.RAIL, '').replace(vl(72, 0, 900), '').replace(/font-size="13"/g, 'font-size="14"');
}

// ---------- B7 공용 조각 ----------
const TAG = (t = '시연') => `<span class="tag">${t}</span>`;
const SCRIM = div(72, 0, 1368, 900, 'background:rgba(1,1,2,.54)');
// 모달 — B5-Project-Delete 의 그릇(흰 판 · 제목 Paperlogy 20 · 바닥 헤어라인 · 취소 텍스트 + 잉크 CTA)
function modal(w, h, title, body, { foot = null, y = null, tag = '' } = {}) {
  const x = 72 + Math.round((1368 - w) / 2), yy = y ?? Math.round((900 - h) / 2);
  let s = SCRIM + div(x, yy, w, h, 'background:#FFFFFF');
  s += disp(x + 24, yy + 22, title + tag, 18) + `<div style="position:absolute;left:${x + w - 38}px;top:${yy + 26}px">${ico('close', G, 13)}</div>\n` + hl(x + 24, yy + 60, w - 48);
  s += body(x + 24, yy + 60, w - 48);
  if (foot) {
    const [left, cancel, ok, okW, cW = 48] = foot;
    s += hl(x + 24, yy + h - 60, w - 48) + (left ? st(x + 24, yy + h - 38, left) : '') + tb(x + w - 24 - okW - cW, yy + h - 46, cancel, false, `color:${G}`) + cta(x + w - 24 - okW, yy + h - 50, okW, ok);
  }
  return s;
}
// 폼 필드 — 라벨(14 회색) 위 · 입력 36
const F = (x, y, w, label, val, { req = false, ph = false, auto = false, ink = false, err = '', right = '', h = 36, tagT = '' } = {}) =>
  lab(x, y, label + (req ? ` <span style="color:${ACC}">*</span>` : '') + (auto ? TAG('자동') : '') + (tagT ? TAG(tagT) : ''), err ? `color:${INK}` : '') +
  fld(x, y + 20, w, `<span style="font-size:15.5px;color:${ph ? C : INK}">${val}</span><span style="flex:1"></span>${right}`, `height:${h}px;${auto ? `background:${T1};border-color:${T1}` : ink || err ? `border-color:${INK}` : ''}`) +
  (err ? `<div style="position:absolute;left:${x}px;top:${y + 20 + h + 6}px;font-size:14px;color:${WARN};letter-spacing:-.01em;white-space:nowrap">${err}</div>\n` : '');
const FS = (x, y, w, label, val, o = {}) => F(x, y, w, label, val, { ...o, right: chev() });
const big = (x, y, n, l, col = INK, size = 50) => `<div class="d8" style="position:absolute;left:${x}px;top:${y}px;font-size:${size}px;line-height:1;color:${col};font-variant-numeric:tabular-nums">${n}</div>\n` + lab(x + 2, y + size + 8, l);
const radio = (x, y, t, on, dis = false) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center;gap:7px;font-size:15px;color:${dis ? C : on ? INK : G};white-space:nowrap"><span style="width:14px;height:14px;border:1px ${dis ? 'dotted' : 'solid'} ${on ? INK : C};display:inline-block;position:relative;flex:none">${on ? `<span style="position:absolute;left:3px;top:3px;width:6px;height:6px;background:${INK}"></span>` : ''}</span>${t}</div>\n`;
const grey = 'filter:grayscale(1);opacity:.55';
const brkAt = (x, y, w, h, col = INK, k = 12) => brkIn(w, h, col, k).replace('left:0;top:0', `left:${x}px;top:${y}px`);
const ghost = (x, y, w, h, inner = '') => div(x, y, w, h, `border:1px dotted ${C}`, inner);
const segTabs = (y, items, active, x0 = X0) => { let s = '', x = x0; for (const [t, c] of items) { const on = t === active, w = t.length * 15.5 + (c !== '' ? 18 : 0); s += `<div class="tab${on ? ' on' : ''}" style="left:${x}px;top:${y + 4}px">${t}${c !== '' ? `<span class="c">${c}</span>` : ''}</div>\n` + (on ? div(x, y + 32, Math.round(w), 2, `background:${INK}`) : ''); x += Math.round(w) + 28; } return s; };

// 파일 · 영상 시드 — 이름은 B5-Project-Data 와 같고, 썸네일은 선명한 실크롭(b7-states-*)으로 교체(P8m · A5m 흐림 대응)
const FILES = [
  ['남원 농경지 2025.04', '1.08 cm', 'b7-states-farm2.jpg'], ['남원 농경지 2025.06', '1.69 cm', 'b7-states-gh1.jpg', '라벨 1,674'], ['남원 농경지 2025.08', '1.54 cm', 'b7-states-gh3.jpg'],
  ['남원 농경지 2025.10', '1.68 cm', 'b7-states-gh7.jpg'], ['남원 전역 2025.04', '2 m', 'db-vw-farmland.jpg'], ['남원 전역 2025.10', '2 m', 'db-vw-greenhouse.jpg'],
  ['국산리 드론 A68 2025.08', '5 cm', 'b7-states-kuk1.jpg'], ['국산리 드론 A71 2025.08', '5 cm', 'b7-states-kuk3.jpg'], ['제주 항공 정사영상 2022.12', '12 cm', 'b7-states-jeju1.jpg'],
];

// ======================================================================
// 1 · 2. 목록 0건 / 검색 0건 — 원본 문구 `프로젝트가 없어요`(page-ai-project6-list.js:64)
// ======================================================================
function listShell(total, q = '') {
  let s = disp(X0, 16, '프로젝트', 32) + num(1384 - 480 - 56 - 100, 30, total, 12.5, G, 'text-align:right;width:100px') + hl(72, 64, 1368);
  const ty = 80;
  s += (q ? fld(X0, ty, 176, `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="${INK}" stroke-width="1.5" style="flex:none"><circle cx="8.5" cy="8.5" r="5.75"/><path d="m12.75 12.75 4 4"/></svg><span>${q}</span><span style="flex:1"></span>${ico('close', G, 10)}`, `border-color:${INK}`) : search(X0, ty, 176, '프로젝트명')) +
    tb(316, ty, '초기화', false, `color:${q ? INK : G}`) + tb(364, ty, '검색') + vl(404, ty + 4, 20) + lab(416, ty + 8, '페이지 크기') + sel(484, ty, 54, '10') + vl(552, ty + 4, 20) + pager(564, ty + 7);
  return s + hl(X0, 120, W);
}
function projectsEmpty() {
  let s = listShell('총 0건');
  s += cta(XR - 120, 76, 120, '프로젝트 만들기');
  // 좌 — 카드 자리 4(점선 고스트 372×224) · 첫 칸이 빈 상태 문구와 진입점
  // 좌 — 빈 상태 판(점선 + 브래킷 · 원본 문구) → 프로젝트 하나에 담기는 것(탭 5 · 실크롭) → 불러올 수 있는 아카이브 8(파일 추가 모달과 같은 목록)
  s += ghost(X0, 136, W, 196) + brkAt(X0, 136, W, 196);
  s += disp(X0 + 32, 136 + 46, '프로젝트가 없어요', 26) + txt(X0 + 32, 136 + 94, '정사영상을 불러와 라벨링 · 학습 · 분석 · 배포까지 한 프로젝트로', 14, G) +
    txt(X0 + 32, 136 + 140, '프로젝트 만들기 ›', 14, INK, `border-bottom:1px solid ${INK};padding-bottom:2px`);
  s += lab(X0, 356, '프로젝트 하나에 담기는 것 · 탭 5');
  const TW5 = 145, steps5 = [['데이터', '정사영상 · 데이터셋', 'b7-states-farm2.jpg', ''], ['라벨링', '클래스 · 도형', 'b7-states-gh1.jpg', poly(TW5, 200, GH, 1)], ['학습', '워크플로우 · 곡선', 'b7-states-gh2.jpg', brkIn(TW5, 200, ACC, 10)], ['분석', '결과 폴리곤', 'pj-hero.jpg', poly(TW5, 200, HERO, 1)], ['배포', '모델 등록 · 카드 발행', 'b7-states-gh7.jpg', '']];
  steps5.forEach(([t, d, src, over], i) => { const x = X0 + i * (TW5 + 12.75); s += img(Math.round(x), 380, TW5, 200, src, over) + num(Math.round(x), 591, '0' + (i + 1), 12, ACC) + disp(Math.round(x) + 26, 589, t, 15) + txt(Math.round(x), 613, d, 12.5, G); if (i < 4) s += hl(Math.round(x) + TW5 + 2, 480, 9, INK); });
  s += hl(X0, 652, W) + lab(X0, 668, '불러올 수 있는 영상 · 데이터 관리 아카이브') + num(X0 + 290, 667, '8', 13, ACC) + txt(XR - 140, 666, '데이터 관리 ›', 13, INK, 'width:140px;text-align:right');
  ARC.forEach(([n, , , , , src], i) => { const x = X0 + i * 98; s += src ? img(x, 696, 90, 64, src, '', `outline:1px solid ${H}`) : ghost(x, 696, 90, 64, `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:${G}">SHP</div>`); });
  s += txt(X0, 772, '남원 정사영상 2026-04 A구역 · 운봉읍 드론 · 남원 전역 2025.10 · 국산리 A68 · 외 4건', 12.5, G) + `<span class="tag" style="position:absolute;left:${X0 + 540}px;top:772px">시연 4</span>\n`;
  // 우 — 조회할 것이 없으므로 `새 프로젝트에 정하는 것`(B5-Project-Create 폼 7필드의 목차 · 실크롭 2)
  s += div(DX, 64, DW, 836, 'background:#FFFFFF') + vl(DX, 64, 836, INK);
  s += disp(DI, 86, '프로젝트 조회', 20) + num(1416 - 80, 92, '0 / 0 선택', 12.5, G, 'width:80px;text-align:right') + hl(DI, 122, DIW);
  s += lab(DI, 138, '새 프로젝트에 정하는 것 · 7');
  s += img(DI, 162, 208, 150, 'pj-radio-det.jpg', poly(208, 150, DET, .9) + brkIn(208, 150, INK)) + img(DI + 224, 162, 208, 150, 'pj-radio-seg.jpg', poly(208, 150, SEG, .9));
  s += txt(DI, 320, 'Object Detection', 13) + txt(DI + 224, 320, 'Segmentation', 13, G);
  const rows = [['01', '프로젝트명', '100자 이내'], ['02', '탐지 유형', 'Object Detection · Segmentation'], ['03', '학습데이터 유형', '정사영상 · 이미지셋'], ['04', '영상 불러오기', '아카이브에서 선택'], ['05', '권장 해상도', '선택 영상 GSD 에서 자동'], ['06', '학습데이터 불러오기', '데이터셋 · 라벨링 데이터'], ['07', '구성원 초대', '아이디 확인 → 역할']];
  rows.forEach(([n, k, v], i) => { const y = 366 + i * 62; s += hl(DI, y, DIW) + num(DI, y + 12, n, 12, ACC) + txt(DI + 36, y + 10, k, 15) + txt(DI + 36, y + 34, v, 12.5, G); });
  s += hl(DI, 818, DIW) + txt(DI, 834, '클래스는 라벨링 탭에서 등록', 12.5, G);
  return page('B7 · 프로젝트 — 목록 0건', s + FOOT);
}
function projectsNoResult() {
  let s = listShell('총 8건 중 0행', '태양광');
  s += cta(XR - 120, 76, 120, '프로젝트 만들기');
  // 빈 결과 판 — 점선 + 문구 + 초기화(원본 컨트롤) · 아래 = 검색어를 지우면 보이는 8건(무채 썸네일)
  s += ghost(X0, 136, W, 232) + brkAt(X0, 136, W, 232);
  s += `<div style="position:absolute;left:${X0 + 32}px;top:${136 + 44}px">${ico('search', C, 44)}</div>\n`;
  s += disp(X0 + 104, 136 + 46, '검색 조건에 맞는 프로젝트가 없어요', 22) + txt(X0 + 104, 136 + 88, '프로젝트명 <b style="font-weight:500">“태양광”</b> · 8건 중 0건', 14, G);
  s += txt(X0 + 104, 136 + 150, '초기화 ›', 14, INK, `border-bottom:1px solid ${INK};padding-bottom:2px`) + txt(X0 + 188, 136 + 150, '프로젝트 만들기 ›', 14, G);
  s += hl(X0, 400, W) + lab(X0, 414, '전체 프로젝트') + num(X0 + 96, 413, '8', 13, ACC);
  const all = [['비닐하우스 탐지', 'pj-greenhouse.jpg'], ['도로망 세그멘테이션', 'pj-road.jpg'], ['차량·교통량 탐지', 'pj-car.jpg'], ['토지형질 SegFormer', 'pj-land.jpg'], ['', 'pj-jeju2020.jpg'], ['', 'pj-nw2510.jpg'], ['', 'b7-states-farm3.jpg'], ['', 'b7-states-yeosu5.jpg']];
  all.forEach(([n, src], i) => {
    const x = X0 + (i % 4) * 197, y = 446 + Math.floor(i / 4) * 196;
    s += img(x, y, 185, 112, src, '', `${grey};outline:1px solid ${H}`) + (n ? txt(x, y + 120, n, 13, G, 'width:185px;overflow:hidden;text-overflow:ellipsis') : div(x, y + 126, 120, 10, 'background:#F2F2F2'));
  });
  s += div(DX, 64, DW, 836, 'background:#FFFFFF') + vl(DX, 64, 836, INK);
  s += disp(DI, 86, '프로젝트 조회', 20) + num(1416 - 80, 92, '0 / 0 선택', 12.5, G, 'width:80px;text-align:right') + hl(DI, 122, DIW);
  s += ghost(DI, 138, DIW, 243, `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:${G}">선택한 프로젝트 없음</div>`);
  s += lab(DI, 392, '검색 결과 0건 — 조회할 카드가 없음');
  ['탐지유형', '학습데이터 유형', '권장 해상도', '등록일시', '최근 학습'].forEach((k, i) => { const y = 432 + i * 30; s += lab(DI, y + 4, k, `color:${C}`) + div(DI + 140, y + 8, 120 - i * 10, 8, 'background:#F2F2F2') + hl(DI, y + 26, DIW); });
  s += hl(DI, 728, DIW) + tb(DI, 742, '열기 ›', false, `color:${C}`) + tb(DI + 64, 742, '수정', false, `color:${C}`) + tb(DI + 112, 742, '삭제', false, `color:${C}`);
  return page('B7 · 프로젝트 — 검색 0건', s + FOOT);
}

// ======================================================================
// 3–6. 개요 — 구성원 영역 개정안(A12 선택 2) · 수정(인라인) · 구성원 초대 모달 / 오류
// ======================================================================
const MEMBERS = [['내 계정', '소유자', true], ['편집자 A', '편집자'], ['편집자 B', '편집자']];
function infoDrawer(members = MEMBERS, hi = -1) {
  let s = drawer('프로젝트 정보');
  const kv = [['프로젝트명', '비닐하우스 탐지'], ['탐지유형', '객체 탐지'], ['학습데이터 유형', '정사영상 (ortho)'], ['권장 해상도', '≤ 0.02 m/px' + TAG('추정')], ['등록일시', '2025-06-12 14:30' + TAG()], ['최근 학습', '2025-07 · best(Vinylhouse).pt']];
  kv.forEach(([k, v], i) => { const y = 140 + i * 30; s += lab(DI, y + 3, k) + txt(DI + 120, y, v, 13) + hl(DI, y + 26, DIW); });
  s += lab(DI, 336, 'CLASSES 2') + `<div style="position:absolute;left:${DI}px;top:356px;display:flex;gap:6px"><span class="chip">비닐하우스_단동 <span class="n" style="color:${ACC}">1,469</span></span><span class="chip">비닐하우스_다동 <span class="n" style="color:${ACC}">205</span></span></div>\n`;
  s += hl(DI, 400, DIW) + disp(DI, 416, `구성원 ${members.length}`, 15) + txt(1416 - 40, 418, '삭제 ›', 12, G, 'width:40px;text-align:right');
  members.forEach(([n, role, me, fresh], i) => {
    const y = 452 + i * 38;
    if (i === hi) s += div(DX + 1, y - 3, DW - 1, 38, `background:${T1}`);
    s += me ? '' : chk(DI, y + 8, false);
    s += div(DI + 26, y + 2, 26, 26, `border:1px solid ${me ? INK : H};background:${me ? INK : '#FFFFFF'};display:flex;align-items:center;justify-content:center`, me ? P.ico('lock', '#FFFFFF', 12).replace(/<rect[^>]*\/><path[^>]*\/>/, '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17a6.5 6.5 0 0 1 13 0"/>') : `<span class="n" style="font-size:14px;color:${G}">${n.slice(-1)}</span>`);
    s += txt(DI + 62, y + 6, n + (me ? '' : TAG(fresh ? '초대됨' : '시연')), 13.5, INK) + txt(DI + 292, y + 7, role, 12.5, me ? INK : G) + (me ? st(1416 - 40, y + 9, '본인', 'width:40px;text-align:right') : '') + hl(DI, y + 34, DIW);
  });
  const iy = 452 + members.length * 38 + 10;
  s += div(DI, iy, DIW, 32, `border:1px dotted ${C};display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px;color:${G}`, `${ico('plus', G, 12)}구성원 초대`);
  const ay = iy + 56;
  s += hl(DI, ay, DIW) + disp(DI, ay + 16, '최근 활동', 15);
  [['2026-06-06', '라벨 1,674 필지 저장'], ['2025-07', '학습 완료 · best(Vinylhouse).pt']].forEach(([d, t], i) => { const y = ay + 50 + i * 30; s += num(DI, y, d, 12, G) + txt(DI + 108, y, t, 13); });
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`);
  return s;
}
function ovHead(state, actions = true) {
  let s = back() + disp(X0, 80, '비닐하우스 탐지', 40) + st(X0 + 4, 130, state);
  if (actions) s += tb(XR - 300, 92, '수정', false, `color:${G}`) + tb(XR - 300 + 44, 92, '구성원 초대', false, `color:${G}`) + tb(XR - 300 + 128, 92, '삭제', false, `color:${G}`) + cta(XR - 128, 88, 128, '라벨링 이어하기');
  return s + tabs(160, '개요');
}
function ovBody() {
  const HY = 212, HH = 436;
  let s = img(X0, HY, W, HH, 'pj-hero.jpg', poly(W, HH, HERO, 1.2) + brkIn(W, HH, INK, 14));
  s += num(X0, HY + HH + 10, '남원 농경지 2025.06 · 도엽 1 · GSD 0.017 m/px', 12, G) + txt(XR - 120, HY + HH + 8, '대표 이미지 변경 ›', 13, INK, 'width:120px;text-align:right');
  const ky = 688, kw = W / 4;
  [['1,674', '탐지 필지', ACC], ['0.82', 'IoU · 최근 학습', INK], ['10', '정사영상 도엽', INK], ['2', '데이터셋', INK]].forEach(([n, l, col], i) => { const x = X0 + i * kw; if (i) s += vl(x - 16, ky + 4, 64); s += big(x, ky, n, l, col); });
  return s;
}
const overviewMembers = () => page('B7 · 프로젝트 — 개요 · 구성원 개정', ovHead('학습 완료 · 다음 할 일 = 라벨링 3/10') + ovBody() + infoDrawer() + FOOT);
function overviewEdit() {
  let s = ovHead('수정 중', false);
  s += F(X0, 212, W, '프로젝트명', '비닐하우스 탐지', { req: true, ink: true, right: `<span class="n" style="font-size:14px;color:${G}">8/100</span>`, h: 40 });
  // 대표 이미지 — 원본 안내문 그대로
  s += lab(X0, 292, '대표 이미지') + img(X0, 312, 248, 142, 'pj-hero.jpg', poly(248, 142, HERO, .9) + brkIn(248, 142, INK));
  s += txt(X0 + 272, 316, '자동 · 남원 농경지 2025.06 도엽 1 AOI', 14) + txt(X0 + 272, 346, '프로젝트 목록 카드와 개요에 표시되는 대표 이미지 · jpg · jpeg · png · gif', 12.5, G, 'white-space:normal;width:420px;line-height:1.5');
  s += div(X0 + 272, 418, 112, 36, `border:1px solid ${H};display:flex;align-items:center;justify-content:center;font-size:15px`, '이미지 선택') + tb(X0 + 400, 422, '자동으로 되돌리기', false, `color:${G}`);
  // 탐지유형 카드 2 — 원본 라벨 · 설명
  s += lab(X0, 468, `탐지유형 <span style="color:${ACC}">*</span>`);
  const cw = 380, ch = 214;
  s += div(X0 - 8, 492, cw + 16, ch + 68, `background:${T1}`);
  s += img(X0, 500, cw, ch, 'pj-hero.jpg', poly(cw, ch, HERO, 1.1) + brkIn(cw, ch, ACC)) + img(X0 + cw + 16, 500, cw, ch, 'b7-states-farm2.jpg', A.svgPolys(cw, ch, ['30,150 170,70 250,120 110,208', '150,40 300,10 340,60 200,96', '250,130 370,96 380,190 290,214'], .12, 1.1));
  s += chk(X0 + cw - 24, 510, true);
  s += disp(X0, 500 + ch + 8, 'Object Detection', 15) + txt(X0, 500 + ch + 30, '바운딩 박스로 객체 위치 탐지', 12.5, G);
  s += disp(X0 + cw + 16, 500 + ch + 8, 'Segmentation', 15, G) + txt(X0 + cw + 16, 500 + ch + 30, '폴리곤으로 정밀 윤곽 탐지', 12.5, G);
  s += hl(X0, 800, W) + tb(XR - 72 - 56, 816, '취소', false, `color:${G}`) + cta(XR - 72, 812, 72, '저장');
  return page('B7 · 프로젝트 — 개요 수정', s + infoDrawer() + FOOT);
}
function inviteBody(err) {
  return (x, y, w) => {
    let s = '';
    if (err) {
      s += F(x, y + 24, w - 84, '아이디 (이메일)', '예: sylee@namwon.go.kr', { req: true, ph: true, err: '아이디를 확인해 주세요.', h: 40 }) + div(x + w - 72, y + 44, 72, 40, `border:1px solid ${INK};display:flex;align-items:center;justify-content:center;font-size:15px`, '확인');
      s += lab(x, y + 130, '이름') + div(x, y + 150, w, 40, `border:1px dotted ${C};display:flex;align-items:center;padding:0 10px;font-size:15.5px;color:${G}`, '아이디 확인 후 자동 입력');
      s += lab(x, y + 212, '역할', `color:${C}`) + radio(x, y + 236, '편집자', false, true) + radio(x + 96, y + 236, '뷰어', false, true);
    } else {
      s += F(x, y + 24, w - 84, '아이디 (이메일)', 'sylee@namwon.go.kr' + TAG(), { req: true, ink: true, h: 40 }) + div(x + w - 72, y + 44, 72, 40, `border:1px solid ${H};display:flex;align-items:center;justify-content:center;font-size:15px;color:${G}`, '확인');
      s += st(x, y + 92, '확인됨 · 남원시청');
      s += F(x, y + 130, w, '이름', 'sylee', { auto: true, h: 40 });
      s += lab(x, y + 212, '역할') + radio(x, y + 236, '편집자', true) + radio(x + 96, y + 236, '뷰어', false) + txt(x + 190, y + 235, '라벨링 · 학습 · 분석 실행', 12.5, G);
    }
    return s;
  };
}
const invite = (err) => page(`B7 · 프로젝트 — 구성원 초대${err ? ' 오류' : ''}`, ovHead('학습 완료 · 다음 할 일 = 라벨링 3/10') + ovBody() + infoDrawer() + FOOT +
  modal(480, 392, '구성원 초대', inviteBody(err), { foot: [err ? '' : '초대 후 구성원 4', '취소', '구성원 초대', 108] }));

// ======================================================================
// 7–9. 데이터 탭 — 파일 추가 모달(아카이브 8건 표) · 추가 진행 · 추가 실패
// ======================================================================
function dataHead(seg) {
  let s = headCollapsed('데이터');
  return s + segTabs(176, [['파일', seg.files ?? '10'], ['데이터셋', seg.ds ?? '2']], seg.on);
}
const dataToolbar = (active = false) => { const sy = 176; return sel(X0 + 176, sy, 78, '전체', G) + sel(X0 + 262, sy, 88, '데이터명', G) + search(X0 + 358, sy, 128, '검색어') + tb(X0 + 494, sy, '초기화', false, `color:${G}`) + tb(X0 + 540, sy, '검색') + chk(X0 + 592, sy + 7, false) + tb(X0 + 612, sy, '선택 제외', false, `color:${G}`) + tb(XR - 70, sy, '파일 추가', active, active ? 'width:70px;text-align:center' : 'width:70px;text-align:right') + hl(X0, sy + 34, W); };
// 타일 — state: '' | 'on' | ['run', pct] | 'wait' | 'done' | 'fail'
function tiles(list, more = '') {
  const TW = 248, TH = 140, TG = (W - TW * 3) / 2, RH = 184, GY = 224;
  let s = '';
  list.forEach(([name, , src, lb, state], i) => {
    const x = X0 + (i % 3) * (TW + TG), y = GY + Math.floor(i / 3) * RH, run = Array.isArray(state), last = i === list.length - 1 && more;
    if (state === 'on' || state === 'fail' || run) s += div(x - 8, y - 8, TW + 16, RH, `background:${T1}`);
    let over = '', ext = '';
    if (run) { const pw = Math.round(TW * state[1] / 100); over = `<div style="position:absolute;left:${pw}px;top:0;width:${TW - pw}px;height:${TH}px;overflow:hidden"><img src="${src}" alt="" style="position:absolute;left:${-pw}px;top:0;width:${TW}px;height:${TH}px;object-fit:cover;filter:grayscale(1);opacity:.4"><div style="position:absolute;inset:0;background:rgba(255,255,255,.35)"></div></div><div style="position:absolute;left:${pw}px;top:0;width:1px;height:${TH}px;background:${ACC}"></div><div style="position:absolute;left:0;bottom:0;width:${pw}px;height:3px;background:${ACC}"></div>` + brkIn(TW, TH, ACC); }
    if (state === 'wait') ext = grey;
    if (state === 'fail') { ext = `${grey};outline:1px dotted ${G}`; over = brkIn(TW, TH, INK); }
    if (state === 'on') over = brkIn(TW, TH, ACC);
    if (last) over = `<div style="position:absolute;inset:0;background:rgba(1,1,2,.45)"></div><div class="d8" style="position:absolute;right:14px;bottom:8px;font-size:34px;color:#FFFFFF">${more}</div>`;
    const word = run ? `추가 중 ${state[1]} %` : state === 'wait' ? '대기' : state === 'done' ? '추가됨' : state === 'fail' ? '추가 실패 · 좌표계 없음' : '';
    // 상태어 = 이미지 좌하단 흰 판 위(영상 위 글자 가독 — 감사 S8) · 이름은 전폭
    if (word) over += `<div class="st" style="position:absolute;left:0;bottom:${run ? 3 : 0}px;height:24px;line-height:25px;padding:0 8px;background:#FFFFFF;white-space:nowrap;color:${state === 'fail' ? WARN : state === 'wait' ? G : ACC}">${word}</div>`;
    s += ext ? div(x, y, TW, TH, `overflow:hidden;background:#FFFFFF${state === 'fail' ? `;outline:1px dotted ${G}` : ''}`, `<img src="${src}" alt="" style="position:absolute;left:0;top:0;width:${TW}px;height:${TH}px;object-fit:cover;display:block;${grey}">${over}`) : img(x, y, TW, TH, src, over);
    s += txt(x, y + TH + 8, name, 13, state === 'wait' ? G : INK, `width:${lb && !last ? TW - 92 : TW}px;overflow:hidden;text-overflow:ellipsis`);
    if (lb && !last && !word) s += st(x + TW - 92, y + TH + 10, lb, 'width:92px;text-align:right');
  });
  return s;
}
const dsStrip = () => { const dy = 778; let s = hl(X0, dy, W) + disp(X0, dy + 10, '데이터셋 2', 14) + txt(XR - 176, dy + 11, '선택 삭제', 12.5, G) + txt(XR - 110, dy + 11, '데이터셋 만들기 ›', 13, INK, 'width:110px;text-align:right'); [['비닐하우스 단동 라벨셋', 'v1.0', '1,469', '2026-06-06'], ['비닐하우스 다동 라벨셋', 'v1.0', '205', '2026-06-06']].forEach((r, i) => { const y = dy + 38 + i * 22; s += chk(X0, y + 2, false) + txt(X0 + 24, y, r[0] + TAG('추정'), 12.5) + num(X0 + 300, y, r[1], 12, G) + num(X0 + 380, y, '라벨 ' + r[2], 12, ACC) + num(X0 + 500, y, r[3], 12, G); }); return s; };
// 우 패널 — 선택 파일 조회(데이터 관리 우 패널 문법: 큰 이미지 · 이름 + 상태어 · kv · 헤어라인 액션)
function filePanel() {
  let s = drawer('파일 조회');
  s += img(DI, 138, DIW, 243, 'b7-states-gh1.jpg', poly(DIW, 243, GH) + brkIn(DIW, 243, ACC));
  s += disp(DI, 398, '남원 농경지 2025.06', 22) + st(DI, 432, '라벨 1,674 · 라벨링됨');
  s += hl(DI, 458, DIW);
  [['유형', '정사영상 (ortho) · 드론'], ['GSD', '1.69 cm'], ['촬영', '2025-06'], ['범위', '127.348–127.357 E · 35.528–35.535 N'], ['타일', 'z 12–19 · webp']].forEach(([k, v], i) => { const y = 472 + i * 30; s += lab(DI, y + 4, k) + num(DI + 120, y + 1, v, 13) + hl(DI, y + 26, DIW); });
  s += hl(DI, 818, DIW) + tb(DI, 830, '라벨링 열기 ›', true) + tb(DI + 124, 830, '선택 제외', false, `color:${G}`);
  return s;
}
const ARC = [
  ['남원 정사영상 2026-04 A구역', '정사영상', '2026.04', '1.08 cm', '55.4 GB', 'b7-states-farm1.jpg', 'on', 1], ['운봉읍 드론 정사영상 2026-04', '정사영상', '2026.04', '1.69 cm', '51.0 GB', 'b7-states-farm4.jpg', 'on', 1],
  ['남원 전역 2025.10', '정사영상', '2025.10', '2 m', '—', 'db-vw-greenhouse.jpg', 'added'], ['국산리 드론 A68 2025.08', '정사영상', '2025.08', '5 cm', '—', 'b7-states-kuk1.jpg', 'added'],
  ['남원 도로파손 라벨 셰입 2026-04', '공간정보', '2026.04', '—', '48.2 MB', null, '', 1], ['순찰차량 도로영상 2026-04', '이미지셋', '2026.04', '4,820장', '18.7 GB', 'pj-car.jpg', '', 1],
  ['여수 해양쓰레기 조사 2026', '정사영상', '2026', '86 셀', '—', 'b7-states-yeosu5.jpg', ''], ['제주 항공 정사영상 2020.12', '정사영상', '2020.12', '10 cm', '—', 'b7-states-jeju4.jpg', 'added'],
];
function fileAdd() {
  let s = dataHead({ on: '파일' }) + dataToolbar(true) + tiles(FILES.map((f, i) => [...f.slice(0, 4), i === 1 ? 'on' : '']), '+1') + dsStrip() + filePanel() + FOOT;
  s += modal(920, 724, '파일 추가', (x, y, w) => {
    let m = '';
    m += sel(x, y + 16, 110, '전체', G) + search(x + 118, y + 16, 260, '검색어') + tb(x + 390, y + 16, '초기화', false, `color:${G}`) + tb(x + 440, y + 16, '검색') + num(x + w - 200, y + 22, '아카이브 8건 중 1~8행', 12.5, G, 'width:200px;text-align:right');
    const hy = y + 56, cols = [0, 34, 124, 470, 570, 660, 760];
    m += div(x, hy, w, 30, `background:${T1}`) + chk(x + 10, hy + 8, false);
    ['미리보기', '데이터명', '유형', '촬영', 'GSD · 규모', '용량'].forEach((t, i) => m += lab(x + cols[i + 1], hy + 8, t, `color:${INK}`));
    m += lab(x + w - 60, hy + 8, '상태', `color:${INK};width:60px;text-align:right`);
    ARC.forEach(([n, kind, cap, gsd, size, src, state, demo], i) => {
      const ry = hy + 30 + i * 58, dim = state === 'added', col = dim ? C : INK;
      if (state === 'on') m += div(x, ry, w, 58, `background:${T1}`) + div(x, ry, 2, 58, `background:${ACC}`);
      m += dim ? div(x + 10, ry + 22, 14, 14, `border:1px dotted ${C}`) : chk(x + 10, ry + 22, state === 'on');
      m += src ? img(x + cols[1], ry + 7, 78, 44, src, state === 'on' ? brkIn(78, 44, ACC, 7) : '', dim ? grey : '') : div(x + cols[1], ry + 7, 78, 44, `border:1px dotted ${C};display:flex;align-items:center;justify-content:center;font-size:14px;color:${G}`, 'SHP');
      m += txt(x + cols[2], ry + 18, n + (demo ? TAG() : ''), 13.5, col) + txt(x + cols[3], ry + 19, kind, 12.5, dim ? C : G) + num(x + cols[4], ry + 19, cap, 12.5, dim ? C : G) + num(x + cols[5], ry + 19, gsd, 12.5, dim ? C : G) + num(x + cols[6], ry + 19, size, 12.5, dim ? C : G);
      m += dim ? txt(x + w - 80, ry + 19, '추가됨', 12.5, G, 'width:80px;text-align:right') : state === 'on' ? st(x + w - 80, ry + 21, '선택', 'width:80px;text-align:right') : '';
      m += hl(x, ry + 58, w);
    });
    m += pager(x, hy + 30 + 8 * 58 + 18);
    return m;
  }, { foot: ['선택 2건 · 106.4 GB', '취소', '파일 추가', 96] });
  return page('B7 · 프로젝트 — 파일 추가 모달', s);
}
function progressPanel(fail) {
  let s = drawer(fail ? '추가 현황' : '추가 현황');
  s += num(1416 - 200, 92, fail ? '2건 · 완료 1 · 실패 1' : '2건 · 진행 중 1', 12.5, G, 'width:172px;text-align:right');
  const src = fail ? 'b7-states-farm4.jpg' : 'b7-states-farm1.jpg';
  if (fail) s += img(DI, 138, DIW, 243, src, brkIn(DIW, 243, INK), `${grey};outline:1px dotted ${G}`);
  else { const pw = Math.round(DIW * .63); s += img(DI, 138, DIW, 243, src, `<div style="position:absolute;left:${pw}px;top:0;width:${DIW - pw}px;height:243px;overflow:hidden"><img src="${src}" alt="" style="position:absolute;left:${-pw}px;top:0;width:${DIW}px;height:243px;object-fit:cover;filter:grayscale(1);opacity:.4"></div><div style="position:absolute;left:${pw}px;top:0;width:1px;height:243px;background:${ACC}"></div>` + brkIn(DIW, 243, ACC)); }
  s += disp(DI, 398, fail ? '운봉읍 드론 정사영상 2026-04' : '남원 정사영상 2026-04 A구역', 20) + st(DI, 430, fail ? '추가 실패 · 좌표계 없음' : '추가 중 · 63 %', fail ? `color:${WARN}` : '') + `<span class="tag" style="position:absolute;left:${DI + (fail ? 168 : 110)}px;top:427px">시연</span>\n`;
  // 진행 표 — 데이터 관리 업로드 `진행 현황`과 같은 열(상태 · 진행률 · 크기 · 잔여)
  const ty = 466;
  s += hl(DI, ty, DIW, INK) + lab(DI, ty + 10, '파일') + lab(DI + 196, ty + 10, '상태') + lab(DI + 262, ty + 10, '진행률') + lab(DI + DIW - 56, ty + 10, '잔여', 'width:56px;text-align:right') + hl(DI, ty + 34, DIW);
  const rows = fail ? [['남원 정사영상 A구역', '추가됨', 100, '0', ACC, 'b7-states-farm1.jpg'], ['운봉읍 드론 정사영상', '실패', 41, '30.1 GB', WARN, 'b7-states-farm4.jpg']] : [['남원 정사영상 A구역', '추가 중', 63, '20.5 GB', ACC, 'b7-states-farm1.jpg'], ['운봉읍 드론 정사영상', '대기', 0, '51.0 GB', G, 'b7-states-farm4.jpg']];
  rows.forEach(([n, w, pct, left, col, src], i) => {
    const y = ty + 52 + i * 56;
    s += img(DI, y - 8, 56, 36, src, '', col === ACC ? '' : grey) + txt(DI + 66, y, n, 13, INK, 'width:126px;overflow:hidden;text-overflow:ellipsis') + st(DI + 196, y + 3, w, `color:${col}`) + div(DI + 262, y + 7, 64, 7, `border:1px solid ${H}`) + div(DI + 262, y + 7, Math.round(64 * pct / 100), 7, `background:${col === WARN ? C : ACC}`) + num(DI + 332, y + 1, pct + '%', 12, col === G ? G : INK) + num(DI + DIW - 70, y + 1, left, 12, G, 'width:70px;text-align:right') + hl(DI, y + 38, DIW);
  });
  const ky = ty + 52 + 2 * 56 + 8;
  const kv = fail ? [['사유', '좌표계 없음 — EPSG 미지정 TIF'], ['조치', '데이터 관리 › 발행에서 좌표계 지정 후 다시 추가'], ['크기', '51.0 GB · 41 % 에서 멈춤'], ['추가 후 파일', '11 / 12']] : [['원본', '데이터 관리 › 아카이브'], ['크기', '55.4 GB · 잔여 20.5 GB'], ['좌표계', 'EPSG:5186'], ['추가 후 파일', '12']];
  kv.forEach(([k, v], i) => { const y = ky + i * 30; s += lab(DI, y + 4, k) + txt(DI + 120, y + 1, v, 13, INK, `width:${DIW - 120}px;overflow:hidden;text-overflow:ellipsis`) + hl(DI, y + 26, DIW); });
  s += hl(DI, 818, DIW);
  s += fail ? tb(DI, 830, '선택 제외', false, `color:${G}`) + txt(DI + 84, 835, '좌표계 지정 ›', 13, INK) + cta(1416 - 96, 826, 96, '다시 시도') : tb(DI, 830, '일시정지', false, `color:${G}`) + tb(DI + 72, 830, '취소', false, `color:${G}`) + txt(1416 - 200, 835, '끝나면 파일 12 · 라벨링 가능', 12.5, G, 'width:200px;text-align:right');
  return s;
}
function fileState(fail) {
  const added = [['남원 정사영상 2026-04 A구역', '', 'b7-states-farm1.jpg', '', fail ? 'done' : ['run', 63]], ['운봉읍 드론 정사영상 2026-04', '', 'b7-states-farm4.jpg', '', fail ? 'fail' : 'wait']];
  const list = [...added, ...FILES.slice(0, 7).map(f => [...f.slice(0, 4), ''])];
  let s = dataHead({ on: '파일', files: fail ? '11' : '12' }).replace('데이터<span class="c">10', `데이터<span class="c">${fail ? 11 : 12}`) + dataToolbar(false) + tiles(list, '+3') + dsStrip() + progressPanel(fail) + FOOT;
  return page(`B7 · 프로젝트 — 파일 추가 ${fail ? '실패' : '진행'}`, s);
}

// ======================================================================
// 10 · 11. 데이터셋 만들기 / 상세 — 원본 page-ai-project7-dataset.js(이름 · 버전 · 라벨링 데이터 선택 + 데이터셋 설정 자동 제안)
// ======================================================================
const LABELED = [   // 라벨링 데이터 3 — GSD = imagery.js · 라벨 1,674 = results.js · 240 / 88 = 원본 pid 6 시드(시연)
  ['남원 농경지 2025.04', 'namwon_2504 · 드론', '1.08 cm', '240', '2026.05.18', 'b7-states-farm2.jpg', true],
  ['남원 농경지 2025.06', 'namwon_2506 · 드론', '1.69 cm', '1,674', '2026.06.06', 'b7-states-gh1.jpg', false],
  ['남원 농경지 2025.08', 'namwon_2508 · 드론', '1.54 cm', '88', '2026.06.02', 'b7-states-gh3.jpg', true],
];
const NOPOLY = { w: 1, h: 1, pts: [] };
const bigU = (x, y, n, u, l, col = INK, size = 36) => `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:baseline;gap:5px;white-space:nowrap"><span class="d8" style="font-size:${size}px;line-height:1;color:${col}">${n}</span><span style="font-size:15px;color:${G}">${u}</span></div>\n` + lab(x + 2, y + size + 10, l);
function datasetCreate() {
  let s = dataHead({ on: '데이터셋' });
  s += txt(XR - 200, 183, '‹ 데이터셋 목록', 13, G, 'width:200px;text-align:right') + hl(X0, 210, W);
  s += disp(X0, 226, '데이터셋 만들기', 22) + st(X0 + 176, 236, '라벨링 데이터 3건 선택');
  s += F(X0, 270, 480, '데이터셋명', '비닐하우스 통합 라벨셋', { req: true, ink: true, right: `<span class="n" style="font-size:14px;color:${G}">11/100</span>` }) + F(X0 + 504, 270, 272, '버전', 'v1.0', { req: true });
  // 라벨링 데이터 선택 — 행 = 실크롭 176×99 + 이름 · 파일 · GSD · 라벨 · 최근 작업
  const ty = 346;
  s += lab(X0, ty, `라벨링 데이터 선택 <span style="color:${ACC}">*</span>`) + num(XR - 200, ty - 1, '3건 중 3 선택', 12.5, ACC, 'width:200px;text-align:right');
  s += div(X0, ty + 24, W, 30, `background:${T1}`) + chk(X0 + 10, ty + 32, true);
  [['라벨링 데이터', 34], ['GSD', 470], ['라벨', 560], ['최근 작업', 660]].forEach(([t, dx]) => s += lab(X0 + dx, ty + 32, t, `color:${INK}`));
  LABELED.forEach(([n, f, gsd, lb, last, src, demo], i) => {
    const y = ty + 54 + i * 106;
    s += chk(X0 + 10, y + 45, true) + img(X0 + 34, y + 8, 160, 90, src, poly(160, 90, i === 1 ? GH : NOPOLY) + brkIn(160, 90, ACC, 10));
    s += disp(X0 + 210, y + 26, n, 16) + num(X0 + 210, y + 52, f, 12, G);
    s += num(X0 + 470, y + 40, gsd, 13) + num(X0 + 560, y + 40, lb + (demo ? TAG() : ''), 13, ACC) + num(X0 + 660, y + 40, last, 13, G);
    s += hl(X0, y + 105, W);
  });
  const by = ty + 54 + 3 * 106 + 12;
  s += txt(X0, by, '공간정보(shp)는 데이터셋 생성 대상에서 제외', 12.5, G) + pager(XR - 170, by + 2);
  s += hl(X0, 756, W);
  s += bigU(X0, 772, '3', '건', '라벨링 데이터') + vl(X0 + 178, 774, 58) + bigU(X0 + 194, 772, '2,002', '개', '라벨 합계', ACC) + vl(X0 + 372, 774, 58) + bigU(X0 + 388, 772, '3', '시점', '2025.04 – 2025.08') + vl(X0 + 566, 774, 58) + bigU(X0 + 582, 778, '1.08–1.69', 'cm', 'GSD 범위', INK, 28).replace(`top:${778 + 28 + 10}px`, 'top:818px');
  // 우 드로어 — 데이터셋 설정(자동 제안) · 원본 문구
  s += drawer('데이터셋 설정' + TAG('자동 제안'));
  const tw = DIW, th = 243;
  let grid = `<svg width="${tw}" height="${th}" viewBox="0 0 ${tw} ${th}" style="position:absolute;left:0;top:0;display:block">`;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) { const gx = 6 + c * 100, gy = 4 + r * 112, on = c === 1 && r === 0; grid += `<rect x="${gx}" y="${gy}" width="122" height="122" fill="${on ? 'rgba(0,109,247,.16)' : 'none'}" stroke="${on ? ACC : '#FFFFFF'}" stroke-width="${on ? 1.5 : 1}" stroke-opacity="${on ? 1 : .85}"/>`; }
  grid += `</svg>`;
  s += img(DI, 138, tw, th, 'b7-states-gh1.jpg', grid + brkIn(tw, th, INK));
  s += num(DI, 388, '타일 1024 px · 이웃 타일과 20 % 겹침', 12, G);
  const ky = 420;
  [['1.54', 'cm', '기준 해상도', ACC], ['1024', 'px', '타일 크기', INK], ['20', '%', '겹침 비율', INK]].forEach(([n, u, l, col], i) => { const x = DI + i * 148; if (i) s += vl(x - 14, ky + 2, 58); s += bigU(x, ky, n, u, l, col); });
  s += hl(DI, 498, DIW) + lab(DI, 512, '근거 · 선택 영상 해상도') + num(1416 - 120, 511, '중앙값 1.54 cm', 12.5, ACC, 'width:120px;text-align:right');
  [['2025.04', 1.08], ['2025.06', 1.69], ['2025.08', 1.54]].forEach(([k, v], i) => {
    const y = 540 + i * 28, bw = Math.round(230 * v / 2);
    s += num(DI, y, k, 12.5, G) + div(DI + 84, y + 9, 230, 1, `background:${H}`) + div(DI + 84, y + 8, bw, 3, `background:${v === 1.54 ? ACC : INK}`) + num(DI + 326, y, v.toFixed(2) + ' cm', 12.5, INK) + (v === 1.54 ? st(DI + 398, y + 3, '기준') : '');
  });
  s += hl(DI, 632, DIW) + txt(DI, 646, '모든 선택 영상을 기준 해상도로 통일한 뒤 타일 크기로 잘라 학습 이미지를 만듭니다', 12.5, G, `white-space:normal;width:${DIW}px;line-height:1.5`);
  s += txt(DI, 708, '데이터셋 설정 수정 ›', 13, INK) + txt(DI + 150, 708, '제안값 복원', 13, G);
  s += hl(DI, 818, DIW) + tb(DI, 830, '목록', false, `color:${G}`) + tb(DI + 48, 830, '취소', false, `color:${G}`) + cta(1416 - 84, 826, 84, '만들기');
  return page('B7 · 프로젝트 — 데이터셋 만들기', s + FOOT);
}
function datasetDetail() {
  let s = dataHead({ on: '데이터셋' });
  const sy = 176;
  s += sel(X0 + 176, sy, 104, '데이터셋명', G) + search(X0 + 288, sy, 150, '검색어') + tb(X0 + 446, sy, '초기화', false, `color:${G}`) + tb(X0 + 492, sy, '검색') + tb(X0 + 552, sy, '선택 삭제', false, `color:${G}`) + tb(XR - 110, sy, '데이터셋 만들기', false, 'width:110px;text-align:right') + hl(X0, sy + 34, W);
  // 데이터셋 카드 2 — 샘플 4장 띠 + 이름 · 버전 · 라벨 · 생성일
  const sets = [
    ['비닐하우스 단동 라벨셋', 'v1.0', '1,469', '2026-06-06', ['b7-states-gh1.jpg', 'b7-states-gh2.jpg', 'b7-states-gh6.jpg', 'b7-states-gh3.jpg'], true],
    ['비닐하우스 다동 라벨셋', 'v1.0', '205', '2026-06-06', ['b7-states-gh7.jpg', 'pj-greenhouse.jpg', 'tile-pub-fail.jpg', 'b6-publish-gh2.jpg'], false],
  ];
  sets.forEach(([n, v, lb, d, srcs, on], i) => {
    const y = 228 + i * 190;
    if (on) s += div(X0 - 8, y - 8, W + 16, 182, `background:${T1}`);
    srcs.forEach((src, k) => { s += img(X0 + k * 197, y, 185, 112, src, on && k === 0 ? poly(185, 112, GH, .9) + brkIn(185, 112, ACC, 10) : ''); });
    s += chk(X0, y + 128, false) + disp(X0 + 26, y + 124, n + TAG('추정'), 17) + num(X0 + 26, y + 150, `${v} · 생성 ${d} · 내 계정`, 12, G) + st(XR - 120, y + 130, `라벨 ${lb}`, 'width:120px;text-align:right');
  });
  // 라벨링 데이터 3 — 어느 데이터셋에 들어갔는가
  const ly = 612;
  s += hl(X0, ly, W) + disp(X0, ly + 14, '라벨링 데이터', 15) + num(X0 + 100, ly + 16, '3', 14, ACC);
  LABELED.forEach(([n, , gsd, lb, last, src, demo], i) => {
    const y = ly + 48 + i * 52;
    s += img(X0, y, 72, 40, src) + txt(X0 + 86, y + 9, n, 13.5) + num(X0 + 290, y + 10, gsd, 12.5, G) + num(X0 + 370, y + 10, '라벨 ' + lb + (demo ? TAG() : ''), 12.5, i === 1 ? ACC : G) + txt(XR - 220, y + 10, i === 1 ? '단동 · 다동 라벨셋에 포함' : '데이터셋 없음', 12.5, i === 1 ? INK : G, 'width:220px;text-align:right') + hl(X0 + 86, y + 46, W - 86);
  });
  s += pager(X0, 826);
  // 우 드로어 — 데이터셋 정보
  s += drawer('데이터셋 정보');
  s += img(DI, 138, DIW, 243, 'b7-states-gh1.jpg', poly(DIW, 243, GH) + brkIn(DIW, 243, ACC));
  s += disp(DI, 398, '비닐하우스 단동 라벨셋', 22) + st(DI, 432, 'v1.0 · 라벨 1,469' + TAG('추정'));
  s += hl(DI, 458, DIW);
  [['라벨링 데이터', '남원 농경지 2025.06'], ['생성', '2026-06-06 · 내 계정'], ['기준 해상도', '1.69 cm'], ['타일 · 겹침', '1024 px · 20 %'], ['학습에 사용', '비닐하우스 v2.1' + TAG()]].forEach(([k, v], i) => { const y = 472 + i * 30; s += lab(DI, y + 4, k) + txt(DI + 120, y + 1, v, 13) + hl(DI, y + 26, DIW); });
  s += lab(DI, 636, '클래스');
  [['비닐하우스_단동', 1469, true], ['비닐하우스_다동', 205, false]].forEach(([k, v, inc], i) => { const y = 660 + i * 28; s += txt(DI, y, k, 12.5, inc ? INK : G) + div(DI + 130, y + 10, 200, 1, `background:${H}`) + div(DI + 130, y + 9, Math.round(200 * v / 1674), 3, `background:${inc ? TEAL : C}`) + num(DI + 342, y, A.fmt(v), 12.5, inc ? INK : G) + (inc ? '' : txt(DI + 392, y, '제외', 12, G)); });
  s += lab(DI, 728, '샘플');
  ['b7-states-gh2.jpg', 'b7-states-gh6.jpg', 'b7-states-gh3.jpg'].forEach((src, i) => s += img(DI + i * 148, 750, 136, 56, src));
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + tb(DI + 48, 830, '삭제', false, `color:${G}`) + txt(1416 - 170, 836, '이 데이터셋으로 학습 ›', 13, INK, 'width:170px;text-align:right');
  return page('B7 · 프로젝트 — 데이터셋 상세', s + FOOT);
}

// ======================================================================
// 12 · 13 · 24. 학습 — 새로 학습하기 폼 · 학습 진행 중 · Train-Fix(P5m 보정)
// ======================================================================
const loss = e => 0.19 + 0.74 * Math.exp(-e / 20) + 0.02 * Math.sin(e * 1.7) * Math.exp(-e / 40);
const prec = e => 0.87 - 0.62 * Math.exp(-e / 16) - 0.02 * Math.sin(e * 1.3) * Math.exp(-e / 50);
const prec2 = e => 0.83 - 0.62 * Math.exp(-e / 19) - 0.02 * Math.sin(e * 1.1) * Math.exp(-e / 50);
const loss4 = e => 0.21 + 0.76 * Math.exp(-e / 22) + 0.02 * Math.sin(e * 1.5) * Math.exp(-e / 40);
const prec4 = e => 0.85 - 0.64 * Math.exp(-e / 17) - 0.02 * Math.sin(e * 1.2) * Math.exp(-e / 50);
function chart(x, y, mode) {
  const CW = 776, Hh = 172, px0 = 40, px1 = 656, py0 = 14, py1 = 122;
  const ex = e => px0 + (px1 - px0) * e / 100, ey = v => py1 - (py1 - py0) * v;
  const pts = (f, a, b) => { const o = []; for (let e = a; e <= b; e++) o.push(`${ex(e).toFixed(1)},${ey(f(e)).toFixed(1)}`); return o.join(' '); };
  const T = (tx, ty, t, col, anchor = 'middle', extra = '') => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="Inter,Pretendard,sans-serif" font-size="14" fill="${col}" ${extra}>${t}</text>`;
  const halo = (tx, ty, t, col) => `<text x="${tx}" y="${ty}" font-family="Inter,Pretendard,sans-serif" font-size="14" fill="${col}" stroke="#FFFFFF" stroke-width="4" paint-order="stroke" stroke-linejoin="miter">${t}</text>`;
  let g = '';
  [0, .5, 1].forEach(v => { g += `<line x1="${px0}" x2="${px1}" y1="${ey(v)}" y2="${ey(v)}" stroke="${H}"/>` + T(px0 - 8, ey(v) + 5, v.toFixed(1), G, 'end'); });
  for (let e = 0; e <= 100; e++) { const l = e % 10 ? 4 : 9; g += `<line x1="${ex(e).toFixed(1)}" x2="${ex(e).toFixed(1)}" y1="${py1 + 8}" y2="${py1 + 8 + l}" stroke="${e % 10 ? C : INK}"/>`; if (!(e % 10)) g += T(ex(e), py1 + 34, e, G); }
  g += `<line x1="${px0}" x2="${px1}" y1="${py1 + 8}" y2="${py1 + 8}" stroke="${INK}"/>`;
  const tape = (e) => { const gx = ex(e).toFixed(1); return `<line x1="${gx}" x2="${gx}" y1="${py0}" y2="${py1 + 18}" stroke="${ACC}" stroke-width="1"/><rect x="${ex(e) - 19}" y="${py1 + 2}" width="38" height="22" fill="#FFFFFF" stroke="${ACC}"/>` + T(gx, py1 + 17, e, ACC, 'middle', 'font-weight="500"'); };
  const dotAt = (e, f, col) => `<circle cx="${ex(e).toFixed(1)}" cy="${ey(f(e)).toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="${col}" stroke-width="1.5"/>`;
  if (mode === 'run') {
    // 완료 v2.1 = 옅은 참조선 · 학습 #4 = 12 에폭까지 실선, 이후 점선 고스트(§5 예측 = 점선)
    g += `<polyline points="${pts(loss, 0, 100)}" fill="none" stroke="${C}" stroke-width="1"/><polyline points="${pts(prec, 0, 100)}" fill="none" stroke="${C}" stroke-width="1"/>`;
    g += `<polyline points="${pts(loss4, 12, 100)}" fill="none" stroke="${G}" stroke-width="1" stroke-dasharray="2 3"/><polyline points="${pts(prec4, 12, 100)}" fill="none" stroke="${ACC}" stroke-width="1" stroke-dasharray="2 3" stroke-opacity=".6"/>`;
    g += `<polyline points="${pts(loss4, 0, 12)}" fill="none" stroke="${INK}" stroke-width="1.5"/><polyline points="${pts(prec4, 0, 12)}" fill="none" stroke="${ACC}" stroke-width="1.5"/>`;
    g += tape(12) + dotAt(12, loss4, INK) + dotAt(12, prec4, ACC);
    g += halo(ex(12) + 12, ey(loss4(12)) - 10, `loss ${loss4(12).toFixed(2)}`, INK) + halo(ex(12) + 12, ey(prec4(12)) + 22, `precision ${prec4(12).toFixed(2)}`, ACC);
    g += T(px1 + 10, ey(prec(100)) + 5, 'v2.1 · 0.87', G, 'start') + T(px1 + 10, ey(loss(100)) + 5, 'v2.1 · 0.19', G, 'start');
  } else {
    g += `<polyline points="${pts(loss, 0, 100)}" fill="none" stroke="${C}" stroke-width="1" transform="translate(1,1)"/><polyline points="${pts(loss, 0, 100)}" fill="none" stroke="${INK}" stroke-width="1.5"/><polyline points="${pts(prec, 0, 100)}" fill="none" stroke="${ACC}" stroke-width="1.5"/>`;
    if (mode === 'fix') {
      g += `<polyline points="${pts(prec2, 0, 58)}" fill="none" stroke="${G}" stroke-width="1.5"/><polyline points="${pts(prec2, 58, 100)}" fill="none" stroke="${C}" stroke-width="1" stroke-dasharray="2 3"/>`;
      g += tape(58) + dotAt(58, prec2, G) + halo(ex(58) + 10, ey(prec2(58)) + 24, 'v2.0 · 0.80', G);   // P5m: 곡선 위가 아니라 점 아래 빈 자리 + 흰 헤일로
    }
    g += dotAt(100, loss, INK) + T(px1 + 10, ey(loss(100)) + 5, 'loss 0.19', INK, 'start') + dotAt(100, prec, ACC) + T(px1 + 10, ey(prec(100)) + 5, 'precision 0.87', ACC, 'start');
  }
  return `<svg width="${CW}" height="${Hh}" viewBox="0 0 ${CW} ${Hh}" style="position:absolute;left:${x}px;top:${y}px;display:block">${g}</svg>\n`;
}
const legend = (items) => `<div style="position:absolute;left:${X0 + 120}px;top:403px;display:flex;gap:16px;font-size:14px;color:${G};white-space:nowrap">${items.map(([c, t, dash]) => `<span><span style="display:inline-block;width:14px;height:0;border-top:2px ${dash ? 'dotted' : 'solid'} ${c};vertical-align:4px;margin-right:5px"></span>${t}</span>`).join('')}</div>\n`;
const RUNS = [
  ['비닐하우스 v2.1', 'b7-states-gh1.jpg', '완료 · 1 h 35 m', '3,842', '0.82', '0.87', '2026.05.18 07:40'],
  ['비닐하우스 v2.0', 'b7-states-gh7.jpg', '진행 중 · 58 / 100', '2,800', '—', '—', '2026.05.10 14:30'],
  ['학습 #4', 'b7-states-farm2.jpg', '진행 중 · 12 / 100', '4,200', '—', '—', '2026.06.11 21:45'],
  ['학습 #5', 'b7-states-gh2.jpg', '대기', '4,200', '—', '—', '2026.06.11 22:30'],
  ['비닐하우스 v1.0', 'b7-states-gh3.jpg', '대기 · 재학습', '1,560', '0.71', '0.76', '2026.04.15 11:10'],
];
function trainLeft(mode) {
  const isNew = mode === 'new', run = mode === 'run';
  let s = headCollapsed('학습');
  const sy = 176;
  s += search(X0, sy, 200, '학습명') + (isNew ? tb(XR - 106, sy, '새로 학습하기', true, 'width:106px;text-align:center') : cta(XR - 96, sy - 4, 96, '학습 시작')) + hl(X0, sy + 34, W);
  const NY = 238, NH = 150;
  const name = isNew ? '학습 #6' : run ? '학습 #4' : '비닐하우스 v2.1';
  s += lab(X0, 218, `워크플로우 · ${name}`) + st(XR - 320, 218, isNew ? '설정 중' : run ? '진행 중 · 12 / 100 · 2026.06.11 21:45' : '완료 · 1 h 35 m · 2026.05.18', `width:320px;text-align:right${isNew ? `;color:${G}` : ''}`);
  const ws = [128, 96, 116, 148, 134, 74], gap = 16, xs = []; let cx = X0; ws.forEach(w => { xs.push(cx); cx += w + gap; });
  const doneTo = isNew ? 3 : run ? 3 : 5;
  for (let i = 0; i < 5; i++) s += hl(xs[i] + ws[i] + 3, NY + NH / 2, gap - 6, i === 0 || i === 1 || i >= doneTo ? C : INK);
  let x = xs[0], w = ws[0];
  s += node(x, NY, w, NH, '데이터셋 v2', isNew ? '선택됨' : 'Cached', ACC, img(x + 1, NY + 50, w - 2, 58, 'b7-states-gh1.jpg', brkIn(w - 2, 58, INK, 8)) + nchip(x + 10, NY + 116, `${run ? '4,200' : '1,674'} 라벨`) + nchip(x + 92, NY + 116, '▾'), false, true);
  x = xs[1]; w = ws[1];
  s += node(x, NY, w, NH, '증강 없음', '—', C, txt(x + 10, NY + 54, '원본 옵션', 12, G) + txt(x + 10, NY + 74, '없음', 12, G) + nchip(x + 10, NY + 116, '추가 안 함', true), true);
  x = xs[2]; w = ws[2];
  s += node(x, NY, w, NH, 'XI-VFM v2.1', 'Cached', ACC, nchip(x + 10, NY + 54, `${ico('lock', G, 12)} YOLO11`, true) + nchip(x + 10, NY + 82, '이어가기 없음') + nchip(x + 10, NY + 116, '객체 탐지', true));
  x = xs[3]; w = ws[3];
  const pw = isNew ? 0 : run ? .12 : 1;
  s += node(x, NY, w, NH, isNew ? '학습 #6' : run ? '학습 #4' : '학습 v2.1', isNew ? '설정 중' : run ? '진행 중 12 / 100' : '완료 100 / 100', ACC,
    nchip(x + 10, NY + 54, '에폭 100') + nchip(x + 80, NY + 54, '배치 16') + nchip(x + 10, NY + 82, '640 px') + nchip(x + 76, NY + 82, '80 : 20') +
    div(x + 10, NY + 118, w - 20, 3, `background:${H}`) + div(x + 10, NY + 118, Math.round((w - 20) * pw), 3, `background:${ACC}`) + num(x + 10, NY + 126, isNew ? '시작 전' : run ? '경과 11 m' : '1 h 35 m', 11.5, G));
  if (isNew) s += brkAt(x - 6, NY - 6, w + 12, NH + 12, ACC, 10);
  x = xs[4]; w = ws[4];
  s += (isNew || run)
    ? node(x, NY, w, NH, '검증 20 %', '대기', G, ghost(x + 10, NY + 54, w - 20, 40) + nchip(x + 10, NY + 116, '임계 0.5 · 0.25'), true)
    : node(x, NY, w, NH, '검증 20 %', '완료', ACC, img(x + 1, NY + 50, w - 2, 44, 'pj-greenhouse.jpg', poly(w - 2, 44, GH, .9)) + st(x + 10, NY + 99, 'IoU 0.82 · F1 0.87', `color:${INK};letter-spacing:-.02em`) + nchip(x + 10, NY + 120, '임계 0.5 · 0.25'));
  x = xs[5]; w = ws[5];
  s += (isNew || run)
    ? node(x, NY, w, NH, '결과', '대기', G, ghost(x + 10, NY + 54, w - 20, 54), true, false, true)
    : node(x, NY, w, NH, '결과', '완료', ACC, img(x + 1, NY + 50, w - 2, 58, 'pj-hero.jpg', poly(w - 2, 58, HERO, .8)) + txt(x + 10, NY + 118, '배포 ›', 13, ACC), false, false, true);
  // 곡선
  s += lab(X0, 404, '학습 곡선 · 에폭');
  s += run ? legend([[INK, 'loss 학습 #4'], [ACC, `precision 학습 #4 <b style="font-weight:500;color:${ACC}">진행 중 12 / 100</b>`], [C, '예측 · v2.1 참조', true]])
    : isNew ? legend([[INK, 'loss v2.1'], [ACC, 'precision v2.1'], [C, '학습 #6 · 시작 후 표시', true]])
      : legend([[INK, 'loss v2.1'], [ACC, 'precision v2.1'], [G, `precision v2.0 <b style="font-weight:500;color:${ACC}">진행 중 58 / 100</b>`]]);
  s += chart(X0, 426, mode);
  // 이력 — P5m: `시연` 칩은 제목 옆(세그먼트 띠와 겹치지 않게)
  const LY = 612;
  s += hl(X0, LY - 8, W) + disp(X0, LY, '학습 이력', 14) + num(X0 + 70, LY + 1, '5', 13, ACC) + `<span class="tag" style="position:absolute;left:${X0 + 92}px;top:${LY + 1}px">시연</span>\n`;
  let sx = X0 + 300;
  [['대기', 2, '#FFFFFF', G], ['진행', 2, T2, ACC], ['완료', 1, TEAL, TEAL], ['실패', 0, null, C]].forEach(([t, c, bg, col]) => { const bw = Math.max(c, .5) * 56; s += div(sx, LY + 8, bw, 6, bg ? `background:${bg};border:1px solid ${col}` : `border:1px dotted ${C}`) + txt(sx, LY + 18, `${t} <span class="n" style="color:${c ? col === TEAL ? INK : col : G}">${c}</span>`, 12, G); sx += Math.max(bw, 44) + 12; });
  s += hl(X0, LY + 44, W);
  const sel2 = run ? 2 : isNew ? -1 : 0;
  RUNS.forEach(([n, src, stt, lb, iou, f1, d], i) => {
    const y = LY + 52 + i * 38, on = i === sel2;
    if (on) s += div(X0 - 8, y - 5, W + 16, 38, `background:${T1}`);
    s += img(X0, y, 48, 28, src, on ? brkIn(48, 28, ACC, 6) : '') + disp(X0 + 60, y + 4, n, 14) + st(X0 + 250, y + 7, stt, stt.startsWith('대기') ? `color:${G}` : '');
    s += num(X0 + 400, y + 5, lb, 12, G) + num(X0 + 470, y + 5, iou, 12, iou === '—' ? C : INK) + num(X0 + 530, y + 5, f1, 12, f1 === '—' ? C : INK) + num(XR - 150, y + 5, d, 12, G, 'width:150px;text-align:right') + hl(X0, y + 33, W);
  });
  return s + FOOT;
}
function trainFix() {
  let s = trainLeft('fix');
  s += drawer('비닐하우스 v2.1' + TAG() + '<span class="st" style="font-size:15px;margin-left:10px;vertical-align:3px">완료</span>');
  s += img(DI, 136, DIW, 243, 'b7-states-gh1.jpg', poly(DIW, 243, GH, 1.1) + brkIn(DIW, 243, INK));
  s += num(DI, 386, '남원 농경지 2025.06 · 검증 셋 20 %', 12, G);
  s += big(DI, 412, '0.82', 'IoU 영역 일치도', ACC, 58).replace('top:478px', 'top:474px') + big(DI + 216, 412, '0.87', 'F1 종합 정확도', INK, 58).replace('top:478px', 'top:474px') + num(DI + 340, 476, 'v2.0 +0.04', 12, G);
  s += hl(DI, 500, DIW);
  const kv = [['학습 시작', '2026.05.18 07:40'], ['소요', '1시간 35분'], ['라벨', '3,842'], ['데이터셋', '남원 농경지 2025.04 · 06 · 08'], ['기반 모델', 'XI-VFM v2.1'], ['이미지 크기', '640 × 640'], ['학습 : 검증', '80 : 20'], ['에폭 · 배치', '100 · 16'], ['IoU · Conf', '0.5 · 0.25']];
  kv.forEach(([k, v], i) => { const col = i % 2, row = Math.floor(i / 2); const x = DI + col * 216, y = 514 + row * 40; s += lab(x, y, k) + num(x, y + 16, v, 13); });
  const py = 720;
  s += hl(DI, py - 6, DIW) + lab(DI, py + 4, '클래스별 F1');
  [['전체', .87, '0.87'], ['비닐하우스_단동', .89, '0.89'], ['비닐하우스_다동', .74, '0.74']].forEach(([k, v, t], i) => { const y = py + 28 + i * 22; s += txt(DI, y, k, 12, G) + div(DI + 116, y + 9, 100, 1, `background:${H}`) + div(DI + 116, y + 8, 100 * v, 3, `background:${i ? ACC : INK}`) + num(DI + 224, y, t, 12, INK); });
  // P5m: 오분류 행렬 12px → 14px · 셀 48×22
  const mx = DI + 288, my = py + 4;
  s += lab(mx, my, '오분류 행렬');
  const M = [['1,318', '41', '—'], ['29', '176', '—'], ['—', '—', '']];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const v = M[r][c], diag = r === c && r < 2; s += div(mx + c * 48, my + 24 + r * 22, 48, 22, `border:1px solid ${H};background:${diag ? T1 : '#FFFFFF'};display:flex;align-items:center;justify-content:center;font-size:14px;color:${v === '—' || !v ? C : diag ? ACC : INK}`, `<span class="n">${v || ''}</span>`); }
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + txt(1416 - 180, 836, '배포 탭에서 이 결과 발행 ›', 13, INK, 'width:180px;text-align:right');
  return page('B7 · 프로젝트 — 학습 (P5m 보정)', s);
}
function trainNew() {
  let s = trainLeft('new');
  s += drawer('새로 학습하기');
  let y = 138;
  s += F(DI, y, DIW, '학습명', '학습 #6', { req: true, ink: true, right: `<span class="n" style="font-size:14px;color:${G}">5/100</span>` }); y += 70;
  // 기반 모델(백본) — 고정 · 원본 문구
  s += lab(DI, y, '기반 모델 (백본)') + div(DI, y + 20, DIW, 52, `background:${T1}`) + `<div style="position:absolute;left:${DI + 12}px;top:${y + 36}px">${ico('layers', INK, 20)}</div>\n` + disp(DI + 44, y + 26, 'XI-VFM v2.1', 15) + `<div style="position:absolute;left:${DI + 150}px;top:${y + 30}px">${ico('lock', G, 13)}</div>\n` + txt(DI + 44, y + 48, '이 분석 과제는 위 기반 모델 위에서 학습됩니다', 12, G); y += 86;
  s += FS(DI, y, DIW, '이전 학습 이어가기', '없음 (새로 시작)') + txt(DI, y + 62, '이 과제의 이전 학습 결과를 이어받아 추가 학습 (선택)', 12, G); y += 94;
  s += FS(DI, y, DIW, '데이터셋', '비닐하우스 단동 라벨셋 v1.0', { req: true });
  s += num(DI, y + 62, '승계 · 기준 해상도 1.69 cm · 타일 1024 px · 겹침 20 %', 12, G); y += 94;
  s += lab(DI, y, '탐지 형태') + fld(DI, y + 20, 208, `${ico('lock', G, 12)}<span style="font-size:15.5px;color:${G}">객체 탐지</span>`, `height:36px;border-style:dotted;border-color:${C}`) + FS(DI + 224, y, 208, '이미지 크기', '640 × 640') + txt(DI, y + 62, '프로젝트 설정을 따름 (변경 불가)', 12, G); y += 96;
  s += hl(DI, y, DIW) + lab(DI, y + 12, '고급 옵션') + `<div style="position:absolute;left:${1416 - 12}px;top:${y + 16}px;transform:rotate(180deg)">${chev()}</div>\n`; y += 40;
  s += FS(DI, y, 208, '학습 : 검증 비율', '80 : 20') + FS(DI + 224, y, 208, '배치 크기', '16'); y += 70;
  s += F(DI, y, 136, '에폭 (Epochs)', '100') + F(DI + 148, y, 136, 'IoU 임계값', '0.5') + F(DI + 296, y, 136, 'Conf 임계값', '0.25');
  s += hl(DI, 818, DIW) + tb(DI + DIW - 96 - 48, 830, '취소', false, `color:${G}`) + cta(1416 - 96, 826, 96, '학습 시작');
  return page('B7 · 프로젝트 — 새로 학습하기', s);
}
function trainRunning() {
  let s = trainLeft('run');
  s += drawer('학습 #4' + TAG() + '<span class="st" style="font-size:15px;margin-left:10px;vertical-align:3px">진행 중</span>');
  const pw = Math.round(DIW * .12);
  s += img(DI, 136, DIW, 243, 'b7-states-farm2.jpg', brkIn(DIW, 243, ACC));
  s += div(DI, 379, DIW, 3, `background:${H}`) + div(DI, 379, pw, 3, `background:${ACC}`);
  s += num(DI, 390, '남원 농경지 2025.04 · 학습 셋 80 %', 12, G);
  s += `<div style="position:absolute;left:${DI}px;top:416px;display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span class="d8" style="font-size:58px;line-height:1;color:${ACC}">12</span><span class="n" style="font-size:22px;color:${G}">/ 100</span></div>\n` + lab(DI + 2, 480, '에폭');
  s += ghost(DI + 216, 420, 120, 50) + lab(DI + 218, 480, 'IoU · 검증 후 표시');
  s += hl(DI, 506, DIW);
  const kv = [['학습 시작', '2026.06.11 21:45'], ['경과', '11분'], ['현재 loss', loss4(12).toFixed(2) + TAG('견본')], ['현재 precision', prec4(12).toFixed(2) + TAG('견본')], ['라벨', '4,200'], ['기반 모델', 'XI-VFM v2.1'], ['이미지 크기', '640 × 640'], ['학습 : 검증', '80 : 20'], ['에폭 · 배치', '100 · 16'], ['IoU · Conf', '0.5 · 0.25']];
  kv.forEach(([k, v], i) => { const col = i % 2, row = Math.floor(i / 2); const x = DI + col * 216, y = 520 + row * 46; s += lab(x, y, k) + num(x, y + 18, v, 13); });
  s += hl(DI, 756, DIW) + lab(DI, 772, '단계') + num(DI + 44, 771, `데이터셋 · 기반 모델 · <b style="font-weight:500;color:${ACC}">학습</b> · 검증 · 결과`, 12.5, G);
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + txt(1416 - 220, 836, '끝나면 결과 5섹션으로 바뀜', 12.5, G, 'width:220px;text-align:right');
  return page('B7 · 프로젝트 — 학습 진행 중', s);
}

// ======================================================================
// 14–16. 배포 — 모델 등록 폼 / 등록 후 · 발행 요청의 학습 결과 선택 모달
//   원본 ai-project-models.html 은 빈 상태 + "pt 파일 등록 기능은 추후 개발 협의" 뿐 → 폼은 발행 폼(ai-publish-create) 의 같은 필드만 빌린 `추정` 판.
// ======================================================================
const RESULTS = [['비닐하우스 v2.1', '2026.05.18', '3,842', '0.82', '0.87', 'b7-states-gh1.jpg'], ['비닐하우스 v2.0', '2026.05.10', '2,800', '0.78', '0.83', 'b7-states-gh7.jpg'], ['비닐하우스 v1.0', '2026.04.15', '1,560', '0.71', '0.76', 'b7-states-gh3.jpg']];
const W2 = 536, XR2 = X0 + W2, DX2 = 720, DI2 = 744, DIW2 = 672, CW2 = 320, C2 = DI2 + 352;
function deployLeft(on) {
  let s = headCollapsed('배포');
  const sy = 176;
  s += segTabs(sy, [['발행 요청', '1'], ['모델 등록', '0']], on) + tb(XR2 - 96, sy, on === '발행 요청' ? '카드 발행 요청' : '모델 등록', true, 'width:96px;text-align:center') + hl(X0, sy + 34, W2);
  const ry = 226;
  s += st(X0, ry + 4, '대기') + disp(X0 + 48, ry, '비닐하우스 탐지 v2.1', 15) + num(XR2 - 100, ry + 3, '2026.06.08', 12, G, 'width:100px;text-align:right');
  [['학습 결과', '비닐하우스 v2.1'], ['모델명', 'v2.1'], ['과제 유형', '신규 과제'], ['요청자', '내 계정']].forEach(([k, v], i) => { const x = X0 + 48 + i * 122; s += lab(x, ry + 30, k) + txt(x, ry + 46, v, 12.5, INK); });
  s += hl(X0, ry + 74, W2) + `<span class="tag" style="position:absolute;left:${XR2 - 34}px;top:${ry + 46}px">시연</span>\n`;
  const ey = 340;
  s += disp(X0, ey, '모델 등록', 14) + num(X0 + 70, ey + 1, '0', 13, G);
  s += div(X0, ey + 30, W2, 300, `border:1px dotted ${C};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px`, ico('layers', C, 40) + `<span style="font-size:15px;color:${G}">등록된 모델이 없습니다</span>`);
  return s;
}
const drawer720 = (title) => div(DX2, 64, 720, 836, 'background:#FFFFFF') + vl(DX2, 64, 836, INK) + disp(DI2, 86, title, 20) + `<div style="position:absolute;left:1404px;top:90px">${ico('close', G, 12)}</div>\n` + hl(DI2, 122, DIW2);
function publishForm() {
  let s = drawer720('카드 발행 요청');
  const auto = TAG('자동'), tint = `background:${T1};border-color:${T1}`;
  s += lab(DI2, 138, '과제 유형') + radio(DI2, 160, '신규 과제', true) + radio(DI2 + 100, 160, '과제 고도화', false);
  s += lab(C2, 138, '모델명') + fld(C2, 156, CW2, '<span>v2.1</span>', `border-color:${INK}`);
  s += lab(DI2, 200, '과제명' + auto) + fld(DI2, 218, CW2, '<span>비닐하우스 탐지</span>', tint);
  s += lab(C2, 200, '학습 결과') + fld(C2, 218, CW2, `<span>비닐하우스 v2.1 · F1 0.87</span><span style="flex:1"></span><span style="color:${ACC}">선택 ›</span>`, `border-color:${ACC}`);
  s += lab(DI2, 262, '탐지 형태' + auto) + fld(DI2, 280, CW2, '<span>객체 탐지</span>', tint) + lab(C2, 262, '데이터 유형' + auto) + fld(C2, 280, CW2, '<span>정사영상 (ortho)</span>', tint);
  s += lab(DI2, 324, '클래스' + auto) + `<div style="position:absolute;left:${DI2}px;top:344px;display:flex;gap:6px"><span class="chip" style="${tint}">비닐하우스_단동</span><span class="chip" style="${tint}">비닐하우스_다동</span></div>\n`;
  s += lab(C2, 324, '권장 해상도' + TAG('추정')) + sel(C2, 342, CW2, '≤ 0.02 m/px');
  s += lab(DI2, 388, '소개') + div(DI2, 406, DIW2, 52, `border:1px solid ${H};padding:8px 10px;font-size:15px;line-height:1.5`, '남원 농경지 정사영상에서 비닐하우스(단동·다동)를 자동 탐지');
  s += lab(DI2, 474, '개발 목적') + div(DI2, 492, DIW2, 52, `border:1px solid ${H};padding:8px 10px;font-size:15px;color:${C}`, '개발 목적 입력');
  s += lab(DI2, 562, '대시보드 썸네일 이미지') + img(DI2, 582, CW2, 180, 'pj-hero.jpg', poly(CW2, 180, HERO, 1) + brkIn(CW2, 180, INK)) + txt(DI2, 770, '이미지 선택 ›', 12.5, INK) + num(DI2 + 100, 771, 'JPG · PNG · 300×260', 12, G);
  s += lab(C2, 562, '카드 썸네일 이미지') + img(C2, 582, CW2, 180, 'pj-greenhouse.jpg', poly(CW2, 180, GH, 1)) + txt(C2, 770, '이미지 선택 ›', 12.5, INK) + num(C2 + 100, 771, 'JPG · PNG · 300×260', 12, G);
  s += hl(DI2, 818, DIW2) + tb(DI2, 830, '목록', false, `color:${G}`) + tb(DI2 + 48, 830, '취소', false, `color:${G}`) + cta(1416 - 96, 826, 96, '발행 요청');
  return s;
}
function resultRows(x, y, w, sel0 = 0) {
  let m = div(x, y, w, 30, `background:${T1}`);
  [['학습 결과', 40], ['학습일', 330], ['라벨', 430], ['IoU', 500], ['F1', 556]].forEach(([t, dx]) => m += lab(x + dx, y + 8, t, `color:${INK}`));
  RESULTS.forEach(([n, d, lb, iou, f1, src], i) => {
    const ry = y + 30 + i * 84, on = i === sel0;
    if (on) m += div(x, ry, w, 84, `background:${T1}`) + div(x, ry, 2, 84, `background:${ACC}`);
    m += `<div style="position:absolute;left:${x + 12}px;top:${ry + 35}px;width:14px;height:14px;border:1px solid ${on ? INK : C};background:#FFFFFF">${on ? `<span style="position:absolute;left:3px;top:3px;width:6px;height:6px;background:${INK}"></span>` : ''}</div>\n`;
    m += img(x + 40, ry + 10, 112, 64, src, on ? poly(112, 64, GH, .8) + brkIn(112, 64, ACC, 8) : '') + disp(x + 166, ry + 20, n, 15) + txt(x + 166, ry + 44, i === 0 ? '최근 학습 · XI-VFM v2.1' : 'XI-VFM v2.1', 12, G);
    m += num(x + 330, ry + 31, d, 12.5, G) + num(x + 430, ry + 31, lb, 12.5, G) + num(x + 500, ry + 31, iou, 13, on ? ACC : INK) + num(x + 556, ry + 31, f1, 13, INK) + hl(x, ry + 84, w);
  });
  return m;
}
const deployPicker = () => page('B7 · 프로젝트 — 학습 결과 선택 모달', deployLeft('발행 요청') + FOOT + publishForm() +
  modal(680, 452, '학습 결과 선택', (x, y, w) => txt(x, y + 14, '발행할 학습 결과 1건 · 과제명 · 탐지 형태 · 클래스는 선택한 결과에서 자동 입력', 12.5, G) + resultRows(x, y + 44, w), { foot: ['선택 1 · 비닐하우스 v2.1', '취소', '선택', 72], tag: TAG() }));
function modelRegister() {
  let s = deployLeft('모델 등록').replace(`top:${340 + 30}px;width:${W2}px;height:300px`, `top:${340 + 30}px;width:${W2}px;height:340px`) + ghost(X0, 734, W2, 76, `<div style="position:absolute;left:20px;top:14px;font-size:15px;color:${G}">외부 모델 (pt 파일) 등록${TAG('준비 중')}</div><div style="position:absolute;left:20px;top:42px;font-size:14px;color:${G}">pt 파일 등록 기능은 추후 개발 협의</div>`) + FOOT + drawer720('모델 등록' + TAG('추정'));
  const auto = TAG('자동'), tint = `background:${T1};border-color:${T1}`;
  s += lab(DI2, 138, '등록 방식') + radio(DI2, 162, '학습 결과에서 등록', true) + radio(DI2 + 164, 162, '외부 모델(pt)', false, true) + `<span class="tag" style="position:absolute;left:${DI2 + 272}px;top:163px;margin-left:0">준비 중</span>\n`;
  s += lab(C2, 138, `모델명 <span style="color:${ACC}">*</span>`) + fld(C2, 156, CW2, '<span>비닐하우스 탐지 v2.1</span>', `border-color:${INK};height:32px`);
  s += lab(DI2, 206, `학습 결과 <span style="color:${ACC}">*</span>`) + num(DI2 + DIW2 - 120, 205, '3건 중 1 선택', 12.5, ACC, 'width:120px;text-align:right') + resultRows(DI2, 228, DIW2);
  const y2 = 228 + 30 + 3 * 84 + 22;
  s += lab(DI2, y2, '기반 모델' + auto) + fld(DI2, y2 + 18, CW2, `${ico('lock', G, 12)}<span>XI-VFM v2.1</span>`, tint) + lab(C2, y2, '탐지 형태' + auto) + fld(C2, y2 + 18, CW2, '<span>객체 탐지</span>', tint);
  s += lab(DI2, y2 + 62, '클래스' + auto) + `<div style="position:absolute;left:${DI2}px;top:${y2 + 82}px;display:flex;gap:6px"><span class="chip" style="${tint}">비닐하우스_단동</span><span class="chip" style="${tint}">비닐하우스_다동</span></div>\n`;
  s += lab(C2, y2 + 62, '데이터 유형' + auto) + fld(C2, y2 + 80, CW2, '<span>정사영상 (ortho)</span>', tint);
  s += lab(DI2, y2 + 124, '설명') + div(DI2, y2 + 142, DIW2, 84, `border:1px solid ${H};padding:8px 10px;font-size:15px;color:${C}`, '모델 설명 입력');
  s += hl(DI2, 818, DIW2) + tb(DI2, 830, '취소', false, `color:${G}`) + txt(DI2 + 60, 835, '등록한 모델은 카드 발행 요청에서 선택', 12.5, G) + cta(1416 - 96, 826, 96, '모델 등록');
  return page('B7 · 프로젝트 — 모델 등록 폼', s);
}
function modelRegistered() {
  let s = headCollapsed('배포');
  const sy = 176;
  s += segTabs(sy, [['발행 요청', '1'], ['모델 등록', '1']], '모델 등록') + tb(XR - 70, sy, '모델 등록', false, 'width:70px;text-align:right') + hl(X0, sy + 34, W);
  s += div(X0, 224, W, 40, `background:${T1}`) + div(X0, 224, 2, 40, `background:${ACC}`) + st(X0 + 16, 237, '등록 완료') + txt(X0 + 92, 234, '“비닐하우스 탐지 v2.1” 모델을 등록했습니다', 13.5) + `<div style="position:absolute;left:${XR - 28}px;top:238px">${ico('close', G, 11)}</div>\n`;
  // 등록 모델 카드 1 — 실크롭 372×224 + 이름 · 상태어 · kv
  const cy = 284;
  s += div(X0 - 8, cy - 8, W + 16, 240, `background:${T1}`) + img(X0, cy, 372, 224, 'b7-states-gh1.jpg', poly(372, 224, GH) + brkIn(372, 224, ACC));
  s += disp(X0 + 396, cy + 4, '비닐하우스 탐지 v2.1', 20) + st(X0 + 396, cy + 38, '등록됨 · 2026.06.08' + TAG());
  [['학습 결과', '비닐하우스 v2.1'], ['기반 모델', 'XI-VFM v2.1'], ['탐지 형태', '객체 탐지 · 클래스 2'], ['IoU · F1', '0.82 · 0.87']].forEach(([k, v], i) => { const y = cy + 72 + i * 34; s += hl(X0 + 396, y, 380) + lab(X0 + 396, y + 11, k) + txt(X0 + 500, y + 8, v, 13); });
  s += hl(X0 + 396, cy + 72 + 4 * 34, 380);
  // 아직 등록하지 않은 학습 결과 2 + 외부 모델(준비 중)
  const uy = 548;
  s += hl(X0, uy, W) + disp(X0, uy + 14, '등록하지 않은 학습 결과', 15) + num(X0 + 170, uy + 16, '2', 14, ACC) + `<span class="tag" style="position:absolute;left:${X0 + 190}px;top:${uy + 15}px">시연</span>\n`;
  RESULTS.slice(1).forEach(([n, d, lb, iou, f1, src], i) => { const y = uy + 50 + i * 56; s += img(X0, y, 80, 45, src) + disp(X0 + 96, y + 3, n, 14) + num(X0 + 96, y + 24, `${d} · 라벨 ${lb}`, 12, G) + num(X0 + 400, y + 12, `IoU ${iou} · F1 ${f1}`, 12.5, INK) + txt(XR - 80, y + 12, '등록 ›', 13, INK, 'width:80px;text-align:right') + hl(X0 + 96, y + 52, W - 96); });
  s += ghost(X0, 724, W, 72, `<div style="position:absolute;left:20px;top:14px;font-size:15px;color:${G}">외부 모델 (pt 파일) 등록${TAG('준비 중')}</div><div style="position:absolute;left:20px;top:40px;font-size:14px;color:${G}">pt 파일 등록 기능은 추후 개발 협의</div>`);
  // 우 드로어 — 모델 정보 + 다음 단계 CTA
  s += drawer('모델 정보');
  s += img(DI, 138, DIW, 243, 'b7-states-gh1.jpg', poly(DIW, 243, GH, 1.1) + brkIn(DIW, 243, INK));
  s += num(DI, 388, '남원 농경지 2025.06 · 검증 셋 20 %', 12, G);
  s += big(DI, 416, '0.82', 'IoU 영역 일치도', ACC, 58) + big(DI + 216, 416, '0.87', 'F1 종합 정확도', INK, 58);
  s += hl(DI, 510, DIW);
  [['모델명', '비닐하우스 탐지 v2.1'], ['등록 방식', '학습 결과에서 등록'], ['기반 모델', 'XI-VFM v2.1'], ['탐지 형태', '객체 탐지'], ['학습 결과', '비닐하우스 v2.1 · 2026.05.18' + TAG()], ['클래스', '비닐하우스_단동 · 비닐하우스_다동'], ['데이터 유형', '정사영상 (ortho)'], ['카드 발행', '요청 1 · 대기']].forEach(([k, v], i) => { const y = 524 + i * 30; s += lab(DI, y + 4, k) + txt(DI + 120, y + 1, v, 13) + hl(DI, y + 26, DIW); });
  s += hl(DI, 818, DIW) + tb(DI, 830, '닫기', false, `color:${G}`) + tb(DI + 48, 830, '등록 해제', false, `color:${G}`) + cta(1416 - 120, 826, 120, '카드 발행 요청');
  return page('B7 · 프로젝트 — 모델 등록 후', s + FOOT);
}

// ======================================================================
// 17. B7-Analysis-List — 준비 중 10 개정안(A7): 무채 + 점선 테두리 + CTA `준비 중` 비활성 · 썸네일 중복 0(A5m)
// ======================================================================
const AX0 = 128, ACW = 1256;
const dots = (w, h, pts) => `<svg width="${w}" height="${h}" viewBox="0 0 244 84" preserveAspectRatio="none" style="position:absolute;left:0;top:0;display:block">${pts.map(([x, y]) => `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="rgba(15,169,160,.25)" stroke="${TEAL}" stroke-width="1"/>`).join('')}</svg>`;
const EV7 = {
  marine: ['b7-states-yeosu5.jpg', dots(244, 84, [[120, 30], [132, 22], [146, 36], [158, 28], [140, 48], [128, 42], [166, 44], [174, 30], [152, 58]])],
  farmland: ['b7-states-farm2.jpg', A.svgPolys(244, 84, ['22,46 108,14 150,36 62,72', '70,76 160,42 204,64 112,96', '150,6 220,0 244,24 176,42'])],
  pothole: ['pj-road.jpg', brkAt(98, 40, 30, 20, TEAL, 6) + brkAt(146, 22, 24, 16, TEAL, 5) + brkAt(62, 60, 26, 18, TEAL, 6)],
  change: ['ev-change.jpg', ''],
  greenhouse: ['b7-states-gh1.jpg', A.svgPolys(244, 84, ['76,-10 94,-10 102,106 84,106', '96,-10 114,-10 122,106 104,106', '126,-10 144,-10 151,106 134,106'])],
  greenbelt: ['db-vw-farmland.jpg'], solar: ['b7-states-jeju3.jpg'], feedcrop: ['b7-states-farm3.jpg'], incinerator: ['b7-states-jeju4.jpg'], building: ['db-vw-silage.jpg'],
  silage: ['b7-states-farm6.jpg'], trash: ['b7-states-kuk3.jpg'], river: ['b7-states-yeosu3.jpg'], forest: ['b7-states-jeju1.jpg'], carbon: ['pj-land.jpg'],
};
function analysisList() {
  let s = A.head('서비스', '부처 6 · 서비스 15 · 제공 5');
  const LW = 772, LX = AX0, LE = AX0 + LW, PX = 940, PW = 444, TOP = 172, SELID = 'solar';
  let cx = LX;
  ['전체', '농식품부', '국토부', '환경부', '산림청', '해수부', '산업부', 'LX'].forEach((m, i) => { s += A.chip(cx, TOP, m, i === 0); cx += m.length * 14.5 + 28; });
  s += search(LE - 168, TOP - 2, 168, '서비스명 · 부처');
  const CWd = 244, GX = 20, IH = 80, PITCH = 130, GY = TOP + 36;
  A.SERVICES.forEach(([id, name, min, , , , ready], i) => {
    const x = LX + (i % 3) * (CWd + GX), y = GY + Math.floor(i / 3) * PITCH, [src, over = ''] = EV7[id], on = id === SELID;
    if (on) s += div(x - 6, y - 6, CWd + 12, PITCH - 2, `background:${T1}`);
    s += ready ? img(x, y, CWd, IH, src, over, `outline:1px solid ${H}`)
      : img(x, y, CWd, IH, src, on ? brkIn(CWd, IH, INK) : '', `${grey};outline:1px dotted ${G}`);
    s += disp(x, y + IH + 6, name, 14, ready ? INK : G, `width:${CWd - (ready ? 0 : 64)}px;overflow:hidden;text-overflow:ellipsis`);
    if (!ready) s += `<span class="tag" style="position:absolute;left:${x + CWd - 58}px;top:${y + IH + 6}px;margin-left:0">준비 중</span>\n`;
    s += txt(x, y + IH + 25, min, 12, G, `width:${CWd}px;overflow:hidden;text-overflow:ellipsis`);
  });
  s += vl(916, TOP - 8, 866 - TOP + 8 - 16);
  // 우 패널 — 준비 중 서비스 선택: 무채 큰 이미지 + 점선 · 상태어 · 이유 한 줄 · 비활성 CTA `준비 중` · 아래 = 지금 실행할 수 있는 5
  let y = TOP;
  s += lab(PX, y, '선택') + disp(PX + 44, y - 4, '태양광 설비 현황', 18) + txt(PX, y + 28, '산업통상자원부', 13, G);
  y += 58;
  s += img(PX, y, PW, 200, EV7.solar[0], brkIn(PW, 200, INK, 14), `${grey};outline:1px dotted ${G}`);
  y += 214;
  s += disp(PX, y, '준비 중', 17) + txt(PX + 70, y + 3, '결과 산출물이 아직 없는 서비스 · 분석 실행 불가', 13, G);
  y += 36; s += hl(PX, y, PW);
  s += lab(PX, y + 14, '제공 중인 서비스') + num(PX + 116, y + 13, '5', 13, ACC);
  y += 40;
  A.SERVICES.filter(r => r[6]).forEach(([id, name, min, n, unit], i) => {
    const ry = y + i * 50;
    s += img(PX, ry, 72, 40, EV7[id][0], '', `outline:1px solid ${H}`) + disp(PX + 86, ry + 1, name, 14) + txt(PX + 86, ry + 21, min, 12, G) + txt(PX + PW - 60, ry + 10, '선택 ›', 13, INK, 'width:60px;text-align:right') + hl(PX + 86, ry + 46, PW - 86);
  });
  y = 800;
  const dis = `border:1px dotted ${C};display:flex;align-items:center;justify-content:center;font-size:15px;letter-spacing:-.01em;color:${C}`;
  s += div(PX, y, 108, 36, dis, '결과 보기') + div(PX + 120, y, 108, 36, dis, '실행 이력') + div(PX + PW - 120, y, 120, 36, `border:1px dotted ${G};display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;color:${G}`, '준비 중');
  return page('B7 · 분석 서비스 — 서비스 (준비 중 개정)', s + A.FOOT, 'an');
}

// ======================================================================
// 18. 분석 진행 오버레이 — 원본 #ai-progress-overlay (제목 · 단계 · % · 막대 · 필지 진행 · 시작 시각 · 새로 분석하기 · 분석 결과 보기)
// ======================================================================
function progressOverlay() {
  const base = under(A.runReview(), A);
  const PCT = 72;
  const m = modal(640, 560, '분석 진행 중', (x, y, w) => {
    let s = '';
    s += `<div style="position:absolute;left:${x + w - 220}px;top:${y - 44}px;width:190px;text-align:right;white-space:nowrap"><span class="st" style="font-size:15px">추론중</span> <span class="d8" style="font-size:30px;color:${ACC};margin-left:6px;vertical-align:-3px">${PCT} %</span></div>\n`;
    const iw = w, ih = 236, sx = Math.round(iw * PCT / 100);
    s += img(x, y + 20, iw, ih, 'b7-states-gh1.jpg', `<svg width="${iw}" height="${ih}" viewBox="0 0 ${iw} ${ih}" style="position:absolute;left:0;top:0;display:block"><rect x="0" y="0" width="${sx}" height="${ih}" fill="rgba(15,169,160,.12)"/><rect x="${sx - 28}" y="0" width="28" height="${ih}" fill="rgba(15,169,160,.22)"/><line x1="${sx}" y1="0" x2="${sx}" y2="${ih}" stroke="${TEAL}" stroke-width="1.5"/></svg>` + `<div style="position:absolute;left:0;top:0;width:${sx}px;height:${ih}px;overflow:hidden">${poly(iw, ih, GH, 1.2)}</div>` + brkIn(iw, ih, INK, 14));
    s += num(x, y + 264, '남원 농경지 · 2025.06 · 드론 1.69 cm · 영상 1 / 2', 12.5, G);
    s += div(x, y + 296, w, 7, `border:1px solid ${H}`) + div(x, y + 296, Math.round(w * PCT / 100), 7, `background:${ACC}`);
    ['전처리', '추론중', '후처리', '완료'].forEach((t, i) => { const tx = x + [0, w * .02, w * .95, w][i]; s += i === 0 || i === 3 ? '' : div(tx, y + 292, 1, 15, `background:${INK}`); });
    s += txt(x, y + 312, '전처리', 12.5, TEAL) + txt(x + 60, y + 312, '추론중', 12.5, ACC, 'font-weight:500') + txt(x + w - 100, y + 312, '후처리', 12.5, G) + txt(x + w - 36, y + 312, '완료', 12.5, G);
    s += hl(x, y + 346, w);
    s += bigU(x, y + 362, '1,205', '/ 1,674', '필지 진행' + TAG(), ACC, 34) + vl(x + 290, y + 364, 58) + bigU(x + 310, y + 362, '13:42', '', '시작 시각' + TAG(), INK, 34);
    return s;
  }, { foot: ['실행중 목록에 추가됨', '새로 분석하기', '분석 결과 보기', 132, 112] });
  return page('B7 · 분석 서비스 — 진행 오버레이', base + m, 'an');
}

// ======================================================================
// 19 · 20. 결과 편집 모드(이동 · 삭제 · 저장 · 취소 + 하단 행정정보 목록) · 공유 설정 모달(기관·역할 9)
// ======================================================================
const FL_ROWS = [[1, '동충동', 222, 3, '경작', 1820], [2, '동충동', 356, '', '경작, 비경작', 2460], [3, '동충동', 387, 6, '경작', 980], [4, '동충동', 419, 5, '비경작', 1560], [5, '동충동', 426, 8, '경작', 2110]];
function resultBoard(edit) {
  let s = A.MAST;
  s += disp(AX0, 80, '분석 서비스', 20) + txt(AX0 + 118, 84, '남원시 농지이용 현황 · 2,098 필지', 13.5, G) + A.segs(908, 84, '완료') + hl(72, 120, 1368);
  const MY = 121, MH = 745, OY = -60, LW = 360, RW = 400, RX = 1440 - RW;
  const polys = ['520,20 740,10 700,150 620,210', '615,215 700,210 700,350 680,360', '330,500 560,600 500,720 260,650', '20,330 150,400 130,480 0,430', '540,620 700,690 640,830 470,760', '470,300 600,330 560,420 430,390', '760,240 900,230 930,380 790,400', '720,420 880,430 860,560 730,540'];
  const SELP = 5, DELP = 1;
  let over = `<svg width="1384" height="852" viewBox="0 0 1384 852" style="position:absolute;left:0;top:${OY}px;display:block;pointer-events:none">`;
  polys.forEach((p, i) => {
    if (edit && i === DELP) over += `<polygon points="${p}" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="3 4"/>`;
    else if (edit && i === SELP) { over += `<polygon points="452,318 582,348 542,438 412,408" fill="rgba(0,109,247,.18)" stroke="${ACC}" stroke-width="2"/><polygon points="${p}" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-dasharray="3 4"/>`; '452,318 582,348 542,438 412,408'.split(' ').forEach(q => { const [a, b] = q.split(',').map(Number); over += `<rect x="${a - 4}" y="${b - 4}" width="8" height="8" fill="#FFFFFF" stroke="${ACC}" stroke-width="1.5"/>`; }); over += `<path d="M535 375 L517 393" stroke="#FFFFFF" stroke-width="1.5"/>`; }
    else over += `<polygon points="${p}" fill="rgba(15,169,160,.14)" stroke="${TEAL}" stroke-width="1.5" stroke-linejoin="miter"/>`;
  });
  over += `</svg>`;
  [[540, 160, '경작지'], [420, 520, '비경작지'], [800, 300, '경작지'], [760, 470, '비경작지']].forEach(([x, y, t]) => { over += `<div class="n" style="position:absolute;left:${x}px;top:${y + OY}px;height:18px;line-height:20px;padding:0 5px;background:${TEAL};color:#FFFFFF;font-size:14px;white-space:nowrap">${t}</div>`; });
  if (edit) over += `<div class="n" style="position:absolute;left:452px;top:${290 + OY}px;height:20px;line-height:19px;padding:0 6px;background:#FFFFFF;color:${ACC};border:1px solid ${ACC};font-size:14px;white-space:nowrap">#3 · 이동 중</div>` + `<div class="n" style="position:absolute;left:622px;top:${270 + OY}px;height:20px;line-height:21px;padding:0 6px;background:#FFFFFF;color:${G};font-size:14px;white-space:nowrap;border:1px dotted ${G}">#2 · 삭제됨</div>`;
  s += A.mapPlate(72, MY, 1368, MH, 'pj-map-analysis.jpg', over, OY, 0);
  const HX = 72 + LW + 24, HY = MY + 16;
  if (edit) {
    // 편집 툴 4 — 이동(활성) · 삭제 · 취소 · 저장(검정 CTA 1)
    s += div(HX - 8, HY - 8, 408, 48, 'background:#FFFFFF') + A.ibtn(HX, HY, 74, 'move', '이동', true) + A.ibtn(HX + 82, HY, 74, 'trash', '삭제') + vl(HX + 168, HY + 4, 24) + st(HX + 180, HY + 9, '변경 2', '') + tb(HX + 250, HY + 2, '취소', false, `color:${G}`) + cta(HX + 300, HY - 2, 92, '저장');
  } else {
    s += tb(HX, HY, '정사영상', false, 'height:32px;line-height:34px;padding:0 12px;background:#FFFFFF;border:1px solid #DDDDDD;color:#686868') + tb(HX + 88, HY, '결과', true, 'height:32px;line-height:34px;padding:0 12px;border:1px solid #D6E6FF') + cta(HX + 156, HY - 2, 92, '결과 편집');
  }
  s += A.mapTools(RX - 16 - 36, MY + 16);
  // 하단 행정정보 — 편집 모드 = 펼친 목록(원본: 결과 편집 하단 행정정보 목록 · 분석값만 수정 가능)
  const BX = 72 + LW + 1, BW = 1440 - LW - RW - 72 - 1;
  if (edit) {
    const BH = 236, BY = MY + MH - BH;
    s += div(BX, BY, BW, BH, `background:#FFFFFF;border-top:1px solid ${INK}`);
    s += disp(HX, BY + 12, '필지 행정정보', 14) + num(HX + 108, BY + 14, '총 10건 중 1~5행', 12, G) + `<span class="tag" style="position:absolute;left:${HX + 226}px;top:${BY + 13}px">시연</span>\n` + txt(BX + BW - 96, BY + 13, '검색 · 접기 ⌄', 12.5, G);
    const cols = [0, 44, 108, 172, 232, 290, 352, 462];
    s += div(BX, BY + 42, BW, 28, `background:${T1}`);
    ['연번', '시도', '시군구', '읍면동', '본번', '부번', '탐지 클래스', '면적(㎡)'].forEach((t, i) => s += lab(HX + cols[i], BY + 49, t, `color:${INK}`));
    FL_ROWS.forEach(([no, dong, bon, bu, cls, area], i) => {
      const y = BY + 70 + i * 32, on = i === 2, del = i === 1;
      if (on) s += div(BX, y, BW, 32, `background:${T1}`) + div(BX, y, 2, 32, `background:${ACC}`);
      const col = del ? C : INK, tdx = del ? 'text-decoration:line-through' : '';
      [no, '전북', '남원시', dong, bon, bu || '—', cls].forEach((v, k) => s += (k === 0 || k === 4 || k === 5 ? num : txt)(HX + cols[k], y + 7, String(v), 12.5, k < 1 ? G : col, tdx));
      s += on ? fld(HX + cols[7] - 6, y + 3, 84, `<span class="n" style="font-size:14px">${A.fmt(area)}</span>`, `height:26px;border-color:${ACC};padding:0 6px`) : num(HX + cols[7], y + 7, A.fmt(area), 12.5, col, tdx);
      s += hl(BX, y + 32, BW);
    });
  } else {
    const BY = MY + MH - 40;
    s += div(BX, BY, BW, 40, `background:#FFFFFF;border-top:1px solid ${H}`) + disp(HX, BY + 11, '필지 행정정보', 13) + num(HX + 100, BY + 12, '총 10건 중 1~10행 · 연번 · 시도 · 시군구 · 읍면동', 12, G) + txt(BX + BW - 120, BY + 11, '검색 · 펼치기 ⌃', 12.5, G);
  }
  // 좌 드로어 — 완료 목록(선택 행)
  s += div(72, MY, LW, MH, 'background:#FFFFFF') + vl(72 + LW, MY, MH, INK);
  const LI = 88, LIW = LW - 32;
  s += disp(LI, MY + 18, '완료', 15) + num(LI + 40, MY + 20, '7', 14, ACC) + txt(LI + 60, MY + 21, '내 것 · 공유 받은 것', 12, G);
  s += A.ibtn(LI + LIW - 96, MY + 12, 28, 'user', '', false, 28) + A.ibtn(LI + LIW - 64, MY + 12, 28, 'refresh', '', false, 28) + A.ibtn(LI + LIW - 32, MY + 12, 28, 'search', '', false, 28) + hl(LI, MY + 52, LIW);
  const dones = [
    ['남원시 농지이용 현황', '농지이용·불법건축물 · 2025.06 · 82분', 'b7-states-farm2.jpg', true, '2,098 필지'], ['남원시 비닐하우스 조사', '비닐하우스 현황 · 2025.06 · 58분', 'b7-states-gh1.jpg', false, '1,674 필지'],
    ['여수시 해양쓰레기 조사(항공)', '해양쓰레기 · 2025 · 77분', 'b7-states-yeosu5.jpg', false, '1,860 건'], ['여수시 해양쓰레기 조사(드론)', '해양쓰레기 · 2026 · 35분', 'b7-states-yeosu3.jpg', false, '2,078 건'],
    ['2026년 4월 도통동 도로 정기 점검', '도로안전 정사영상 · 2026.04.15', 'pj-road.jpg', false, '시연'], ['2026년 4월 운봉읍 사료작물 생육 현황', '사료작물(생육기) · 2026.04.10', 'b7-states-farm3.jpg', false, '시연'], ['2026년 3월 사매면 방치 쓰레기 탐지', '방치 쓰레기 탐지 · 2026.04.07', 'b7-states-kuk3.jpg', false, '시연'],
  ];
  dones.forEach(([n, m, src, on, cnt], i) => {
    const y = MY + 68 + i * 96;
    if (on) s += div(73, y - 8, LW - 1, 96, `background:${T1}`);
    s += img(LI, y, 128, 72, src, on ? brkIn(128, 72, ACC, 10) : '', edit && !on ? grey : '') + disp(LI + 140, y + 2, n, 13, edit && !on ? G : INK, `width:${LIW - 140}px;white-space:normal;line-height:1.25`) + (cnt === '시연' ? `<span class="tag" style="position:absolute;left:${LI + 140}px;top:${y + 52}px;margin-left:0">시연</span>\n` : `<div class="st" style="position:absolute;left:${LI + 140}px;top:${y + 54}px;color:${on ? ACC : TEAL}">${cnt}</div>\n`);
    if (i < 6) s += hl(LI, y + 84, LIW);
  });
  // 우 드로어 — 결과 요약(편집 중 = 상태 띠 + 버튼 비활성)
  s += div(RX, MY, RW, MH, 'background:#FFFFFF') + vl(RX, MY, MH, INK);
  const RI = RX + 24, RIW = RW - 48;
  s += lab(RI, MY + 16, '분석명') + `<div style="position:absolute;left:${RI + 300}px;top:${MY + 14}px">${A.ico('edit', G, 14)}</div>\n` + `<div style="position:absolute;left:${RX + RW - 30}px;top:${MY + 16}px">${A.ico('chevU', G, 12)}</div>\n`;
  s += disp(RI, MY + 34, '남원시 농지이용 현황', 20) + txt(RI, MY + 62, edit ? `농지이용·불법건축물 · <span style="color:${ACC};font-weight:500">결과 편집 중</span>` : `농지이용·불법건축물 · <span style="color:${TEAL}">처리 완료</span> · 드론 2025.06`, 13, G);
  s += hl(RI, MY + 90, RIW);
  let yy = MY + 102;
  if (edit) {
    s += div(RX + 1, yy - 4, RW - 1, 118, `background:${T1}`) + lab(RI, yy + 6, '저장 전 변경', `color:${INK}`) + num(RI + 96, yy + 5, '2', 13, ACC);
    [['이동', '#3 · 동충동 387-6 · 경작', '면적 980 ㎡'], ['삭제', '#2 · 동충동 356 · 경작, 비경작', '2,460 ㎡']].forEach(([k, v, a], i) => { const y = yy + 34 + i * 36; s += st(RI, y + 3, k) + txt(RI + 44, y, v, 12.5, INK, `width:${RIW - 44 - 84}px;overflow:hidden;text-overflow:ellipsis`) + num(RI + RIW - 84, y, a, 12, G, 'width:84px;text-align:right') + hl(RI, y + 28, RIW, '#C9DCF7'); });
    yy += 132;
  } else {
    [['시작 · 종료', '2026.04.22 09:14 → 10:36' + TAG()], ['소요', '82분' + TAG()], ['공유 권한', 'LX 관리자 · 남원시청 관리자'], ['정사영상', '남원 농경지 2025.06 · 1.69 cm']].forEach(([k, v], i) => { const y = yy + i * 28; s += lab(RI, y + 2, k) + txt(RI + 84, y, v, 12.5, INK, `width:${RIW - 84}px;overflow:hidden;text-overflow:ellipsis`); });
    yy += 116;
  }
  s += hl(RI, yy, RIW);
  const F2 = A.FARM, cnt = edit ? F2.count - 1 : F2.count;
  s += `<div style="position:absolute;left:${RI}px;top:${yy + 18}px;display:flex;align-items:baseline;gap:6px"><span class="d" style="font-size:48px;line-height:1;letter-spacing:-.02em;color:${ACC}">${A.fmt(cnt)}</span><span style="font-size:16px;color:${G}">필지</span></div>\n`;
  s += `<div style="position:absolute;left:${RI + 190}px;top:${yy + 18}px;display:flex;align-items:baseline;gap:5px"><span class="d" style="font-size:46px;line-height:1;letter-spacing:-.02em">${(F2.ha - (edit ? .246 : 0)).toFixed(1)}</span><span style="font-size:16px;color:${G}">ha</span></div>\n`;
  s += lab(RI, yy + 76, edit ? '탐지 필지 · 저장 시 −1' : '탐지 필지') + lab(RI + 190, yy + 76, edit ? '면적 합계 · −0.2 ha' : '면적 합계');
  s += lab(RI, yy + 108, '클래스');
  F2.cls.forEach(([c, n], i) => { const y = yy + 132 + i * 30, w = Math.round((RIW - 120) * n / F2.count); s += txt(RI, y, c, 13) + div(RI + 76, y + 8, RIW - 120, 3, `background:${H}`) + div(RI + 76, y + 8, w, 3, `background:${i ? INK : TEAL}`) + num(RI + RIW - 44, y, A.fmt(n), 13, INK, 'width:44px;text-align:right'); });
  const TY = yy + 204;
  s += lab(RI, TY, '신뢰도') + num(RI + 52, TY - 1, `평균 ${F2.confMean.toFixed(2)} · 중앙값 ${F2.confMedian.toFixed(2)}`, 12, G);
  const mx = Math.max(...F2.hist), bw = (RIW - 27) / 10;
  F2.hist.forEach((v, i) => { const h = Math.round(44 * v / mx); s += div(RI + i * (bw + 3), TY + 24 + 44 - h, bw, h, `background:${i >= 4 ? TEAL : H}`); });
  s += div(RI, TY + 68, RIW, 1, `background:${INK}`);
  for (let i = 0; i <= 10; i++) s += div(RI + i * (RIW / 10), TY + 68, 1, i % 5 ? 4 : 8, `background:${INK}`);
  s += num(RI, TY + 78, '0', 11, G) + num(RI + RIW / 2 - 8, TY + 78, '0.5', 11, G) + num(RI + RIW - 20, TY + 78, '1.0', 11, G);
  const mxp = RI + RIW * F2.confMean; s += div(mxp, TY + 20, 2, 52, `background:${ACC}`) + num(mxp + 6, TY + 22, '0.45', 11, ACC);
  s += hl(RI, TY + 104, RIW);
  const by = TY + 118;
  if (edit) { const d = (x, w, k, t) => `<div style="position:absolute;left:${x}px;top:${by}px;width:${w}px;height:32px;border:1px dotted ${C};display:flex;align-items:center;gap:7px;padding:0 9px;font-size:14.5px;color:${C};white-space:nowrap">${A.ico(k, C, 15)}${t}</div>\n`; s += d(RI, 112, 'share', '공유 설정') + d(RI + 124, 128, 'download', '다운로드') + d(RI + 264, 88, 'edit', '수정') + txt(RI, by + 46, '편집을 저장하거나 취소하면 다시 활성', 12.5, G) + hl(RI, by + 80, RIW) + lab(RI, by + 94, '편집 도구') + st(RI, by + 122, '이동', `color:${INK}`) + txt(RI + 44, by + 119, '도형을 끌어 옮김 · 꼭짓점을 끌어 모양 수정', 12.5, G) + st(RI, by + 150, '삭제', `color:${INK}`) + txt(RI + 44, by + 147, '도형을 눌러 삭제 · 표의 면적(㎡)만 직접 수정', 12.5, G); }
  else s += A.ibtn(RI, by, 112, 'share', '공유 설정', !edit) + A.ibtn(RI + 124, by, 128, 'download', '다운로드') + A.ibtn(RI + 264, by, 88, 'edit', '수정') + txt(RI, by + 48, '삭제', 12.5, G) + txt(RI + 48, by + 48, '새로 분석하기 ›', 12.5, G);
  return s + A.FOOT;
}
const resultEdit = () => page('B7 · 분석 서비스 — 결과 편집 모드', resultBoard(true), 'an');
const ROLES = [['LX 한국국토정보공사', [['LX 관리자', true], ['LX 일반 사용자', false]]], ['남원시청', [['남원시청 관리자', true], ['사료작물 분석', false], ['농지 활용 분석', false], ['영농 정보 분석', false], ['일반사용자', false]]], ['전라남도', [['전라남도 관리자', false], ['전라남도 사용자', false]]]];
function shareModal() {
  const m = modal(520, 640, '공유 설정', (x, y, w) => {
    let s = img(x, y + 16, 96, 54, 'b7-states-farm2.jpg', brkIn(96, 54, ACC, 8)) + disp(x + 110, y + 18, '남원시 농지이용 현황', 15) + txt(x + 110, y + 42, '2,098 필지 · 처리 완료', 12.5, G);
    s += txt(x, y + 86, '분석 결과를 공유할 기관·역할을 선택하세요.', 13.5, INK);
    let ry = y + 120;
    ROLES.forEach(([org, roles]) => {
      s += div(x, ry, w, 28, `background:${T1}`) + lab(x + 10, ry + 7, org, `color:${INK}`) + num(x + w - 70, ry + 6, `${roles.filter(r => r[1]).length} / ${roles.length}`, 12.5, ACC, 'width:60px;text-align:right');
      ry += 28;
      roles.forEach(([r, on]) => { s += chk(x + 10, ry + 9, on) + txt(x + 36, ry + 5, r, 13.5, on ? INK : G) + hl(x, ry + 32, w); ry += 33; });
      ry += 8;
    });
    return s;
  }, { foot: ['선택 2 / 9', '취소', '저장', 72] });
  return page('B7 · 분석 서비스 — 공유 설정 모달', resultBoard(false) + m, 'an');
}

// ======================================================================
// 21 · 22. 로딩 / 오류 공용 패턴 — 프로젝트 개요에 적용
//   규칙: 셸(레일 · ‹ 목록 · 탭)은 즉시 · 값 자리는 무채 막대(그라디언트 · 반짝임 0) · 직전에 본 대표 이미지는 무채로 유지 · 진행은 2px 액센트 선 1개
//         오류 = 점선 판 + 빨강은 상태어 글자에만 + 이유 한 줄 + 검정 CTA `다시 시도` 1 + 빠져나갈 길(‹ 목록)
// ======================================================================
const bar = (x, y, w, h = 10) => div(x, y, w, h, 'background:#EFEFEF');
function stateBoard(err) {
  let s = back() + (err ? ghost(X0, 88, 330, 38) : bar(X0, 88, 330, 38)) + st(X0 + 4, 134, err ? '불러오기 실패' : '불러오는 중', err ? `color:${WARN}` : '') + tabs(160, '개요').replace(/<span class="c">[^<]*<\/span>/g, '');
  const HY = 212, HH = 436;
  s += img(X0, HY, W, HH, 'pj-hero.jpg', brkIn(W, HH, INK, 14), `filter:grayscale(1);opacity:${err ? .22 : .38};outline:1px dotted ${G}`);
  if (!err) { s += div(X0, HY, W, 2, `background:${H}`) + div(X0 + 200, HY, 260, 2, `background:${ACC}`); s += div(X0 + 32, HY + 34, 400, 96, 'background:#FFFFFF') + disp(X0 + 56, HY + 54, '프로젝트 정보를 불러오는 중', 20) + txt(X0 + 56, HY + 88, '대표 이미지 · 결과 필지 · 최근 학습', 13, G); }
  else {
    s += div(X0 + 32, HY + 32, 520, 210, 'background:#FFFFFF');
    s += st(X0 + 56, HY + 56, '불러오기 실패', `color:${WARN}`) + disp(X0 + 56, HY + 80, '프로젝트 정보를 불러오지 못했습니다', 22) + txt(X0 + 56, HY + 122, '네트워크 연결을 확인한 뒤 다시 시도 · 계속되면 고객센터 063-713-1213', 13, G);
    s += cta(X0 + 56, HY + 174, 96, '다시 시도') + tb(X0 + 172, HY + 178, '‹ 프로젝트 목록', false, `color:${G}`);
  }
  const ky = 688, kw = W / 4;
  ['탐지 필지', 'IoU · 최근 학습', '정사영상 도엽', '데이터셋'].forEach((l, i) => { const x = X0 + i * kw; if (i) s += vl(x - 16, ky + 4, 64); s += (err ? ghost(x, ky + 4, 110 - i * 14, 40) : bar(x, ky + 4, 110 - i * 14, 40)) + lab(x + 2, ky + 58, l, err ? `color:${C}` : ''); });
  s += drawer('프로젝트 정보');
  ['프로젝트명', '탐지유형', '학습데이터 유형', '권장 해상도', '등록일시', '최근 학습'].forEach((k, i) => { const y = 140 + i * 30; s += lab(DI, y + 3, k, err ? `color:${C}` : '') + (err ? txt(DI + 120, y, '—', 13, C) : bar(DI + 120, y + 6, [120, 70, 130, 90, 140, 190][i], 10)) + hl(DI, y + 26, DIW); });
  s += lab(DI, 336, 'CLASSES', err ? `color:${C}` : '') + (err ? ghost(DI, 356, 150, 22) + ghost(DI + 158, 356, 130, 22) : bar(DI, 356, 150, 22) + bar(DI + 158, 356, 130, 22));
  s += hl(DI, 400, DIW) + disp(DI, 416, '구성원', 15, err ? C : INK);
  for (let i = 0; i < 3; i++) { const y = 452 + i * 38; s += (err ? ghost(DI + 26, y + 2, 26, 26) : bar(DI + 26, y + 2, 26, 26)) + (err ? '' : bar(DI + 62, y + 10, 90 - i * 12, 10) + bar(DI + 292, y + 10, 44, 10)) + hl(DI, y + 34, DIW); }
  if (err) s += txt(DI + 62, 452 + 8, '구성원 · 최근 활동도 함께 불러오지 못함', 12.5, G);
  s += hl(DI, 622, DIW) + disp(DI, 638, '최근 활동', 15, err ? C : INK);
  if (!err) for (let i = 0; i < 2; i++) s += bar(DI, 678 + i * 30, 74, 10) + bar(DI + 108, 678 + i * 30, 200 - i * 40, 10);
  return page(`B7 · 상태 패턴 — ${err ? '오류' : '로딩'} (프로젝트 개요)`, s + FOOT);
}

// ======================================================================
// 23. B7-Project-Labeling-Fix — P6m: 툴바 라벨 겹침·절단 · `#3 단동` 번호표가 지도 도구에 가림
//   툴바 = 그리기 3 + 편집 3(폭을 글자 수로 계산) · `저장`(검정 CTA) + `닫기` 는 헤더 48 우측으로(NOTES §15.7 ⑬ 닫기 중복 해소) · 번호표는 도형의 왼쪽 위
// ======================================================================
function labelingFix() {
  let s = '';
  s += txt(88, 15, '‹ 비닐하우스 탐지', 13, G) + disp(216, 13, '라벨링', 16) + txt(282, 16, '남원 농경지 2025.06 · 도엽 1 · 0.017 m/px', 12.5, G);
  s += cta(1440 - 24 - 56 - 16 - 64, 6, 64, '저장') + tb(1440 - 24 - 56, 10, '닫기', false, `color:${G};width:56px;text-align:right`) + hl(72, 48, 1368);
  const MY = 49, MH = 851, OX = 160;
  const tags = [[250, 440, '#1 단동'], [730, 300, '#2 단동'], [664, 186, '#3 단동'], [672, 330, '#4 단동'], [644, 108, '#5 다동']];
  s += mapPlate(72, MY, 1368, MH, 'pj-map-label.jpg', tealPolys(LABEL_PTS, 0, .12, OX) + tags.map(([x, y, t]) => mapTag(x, y, t, 0, OX)).join(''), 0, OX);
  // 툴바 6 — 폭 = 아이콘 15 + 간격 7 + 글자 + 좌우 12
  const ty = 64, tools = [['rect', '사각형', true], ['circle', '원형'], ['polygon', '폴리곤'], null, ['copy', '도형 복사'], ['import', '공간 정보 불러오기'], ['undo', '실행 취소']];
  let tx = 408;
  s += div(400, ty - 8, 648, 48, 'background:#FFFFFF');
  tools.forEach(t => { if (!t) { s += vl(tx + 4, ty + 4, 24); tx += 17; return; } const w = Math.round(t[1].replace(/ /g, '').length * 13.4 + (t[1].split(' ').length - 1) * 4 + 15 + 7 + 22); s += ibtn(tx, ty, w, t[0], t[1], !!t[2]); tx += w + 8; });
  s += mapTools(1072, 128);
  // 좌 드로어 — 영상 3
  s += div(72, MY, 320, MH, 'background:#FFFFFF') + vl(392, MY, MH, INK);
  s += disp(88, 66, '영상', 15) + num(128, 68, '3', 14, ACC) + `<div style="position:absolute;left:366px;top:66px">${ico('chevL', G, 14)}</div>\n` + hl(88, 96, 288);
  [['남원 농경지 2025.04', 'b7-states-farm2.jpg', '0.011 m/px · 라벨 240 · 2026.05.18', '마감', false, '시연'], ['남원 농경지 2025.06', 'b7-states-gh1.jpg', '0.017 m/px · 라벨 1,674 · 2026.06.06', '라벨링됨', true], ['남원 농경지 2025.10', 'b7-states-gh7.jpg', '0.017 m/px · 라벨 0', '미작업', false]].forEach(([n, src, meta, stt, on, tg], i) => {
    const y = 108 + i * 236;
    if (on) s += div(80, y - 8, 304, 228, `background:${T1}`);
    s += img(88, y, 288, 140, src, on ? brkIn(288, 140, ACC) : '') + disp(88, y + 150, n, 14) + num(88, y + 170, meta, 12, G) + st(88, y + 192, stt + (tg ? TAG(tg) : ''), on ? '' : `color:${G}`) + txt(330, y + 190, '복제 ›', 12.5, INK);
  });
  // 우 드로어 — 클래스 편집기 + 라벨 목록(B5 와 같음 · × 는 회색 #686868 로 — 1.6:1 → 5.6:1)
  s += div(1120, MY, 320, MH, 'background:#FFFFFF') + vl(1120, MY, MH, INK);
  s += disp(1136, 66, '클래스', 15) + num(1188, 68, '2', 14, ACC) + hl(1136, 96, 288);
  [['비닐하우스_단동', true, '1', '1,469', true], ['비닐하우스_다동', false, '2', '205', false]].forEach(([n, fill, key, cnt, on], i) => {
    const y = 104 + i * 36;
    if (on) s += div(1121, y, 319, 36, `background:${T1}`) + div(1121, y, 2, 36, `background:${ACC}`);
    s += div(1136, y + 12, 12, 12, `border:1px solid ${TEAL};background:${fill ? TEAL : '#FFFFFF'}`) + txt(1158, y + 8, n, 13, INK, on ? `border-bottom:1px solid ${INK};padding-bottom:1px` : '');
    s += div(1282, y + 9, 18, 18, `border:1px solid ${on ? INK : H};display:flex;align-items:center;justify-content:center`, `<span class="n" style="font-size:14px;color:${on ? INK : G}">${key}</span>`) + num(1306, y + 9, cnt, 12, ACC, 'width:52px;text-align:right');
    s += `<div style="position:absolute;left:1370px;top:${y + 10}px;font-size:15px;line-height:1;color:${i ? INK : C}">↑</div><div style="position:absolute;left:1386px;top:${y + 10}px;font-size:15px;line-height:1;color:${i ? C : INK}">↓</div>\n<div style="position:absolute;left:1410px;top:${y + 12}px">${ico('close', G, 11)}</div>\n` + hl(1136, y + 36, 288);
  });
  s += div(1136, 184, 288, 28, `border:1px dotted ${C};display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px;color:${G}`, `${ico('plus', G, 12)}클래스 추가`) + hl(1136, 226, 288);
  s += disp(1136, 240, '라벨', 15) + num(1176, 242, '1,674', 14, ACC) + search(1136, 268, 288, '라벨 검색') + hl(1136, 304, 288);
  for (let i = 0; i < 15; i++) {
    const y = 312 + i * 32, multi = i % 5 === 4, on = i === 2 || i === 3 || i === 4;
    if (on) s += div(1121, y, 319, 32, `background:${T1}`);
    s += chk(1136, y + 9, on) + div(1160, y + 10, 12, 12, `border:1px solid ${TEAL};background:${multi ? '#FFFFFF' : TEAL}`) + txt(1182, y + 7, `${multi ? '비닐하우스_다동' : '비닐하우스_단동'} <span class="n" style="color:${G}">#${i + 1}</span>`, 12.5) + txt(1340, y + 8, i % 3 === 1 ? '폴리곤' : '사각형', 12, G) + `<div style="position:absolute;left:1410px;top:${y + 10}px">${ico('close', G, 11)}</div>\n` + hl(1136, y + 32, 288);
  }
  s += num(1136, 798, '15 / 1,674 행', 12, G);
  s += hl(1136, 818, 288) + chk(1136, 836, false) + txt(1158, 832, '전체 선택', 12.5, G) + st(1230, 836, '선택 3') + txt(1424 - 120, 832, '클래스 일괄 변경 ›', 13, INK, 'width:120px;text-align:right');
  return page('B7 · 프로젝트 — 라벨링 편집 (P6m 보정)', s);
}

// ---------- 출력 ----------
wr('B7-Projects-Empty.dc.html', projectsEmpty());
wr('B7-Projects-NoResult.dc.html', projectsNoResult());
wr('B7-Project-Overview-Members.dc.html', overviewMembers());
wr('B7-Project-Overview-Edit.dc.html', overviewEdit());
wr('B7-Project-Invite.dc.html', invite(false));
wr('B7-Project-Invite-Error.dc.html', invite(true));
wr('B7-Project-File-Add.dc.html', fileAdd());
wr('B7-Project-File-Progress.dc.html', fileState(false));
wr('B7-Project-File-Fail.dc.html', fileState(true));
wr('B7-Project-Dataset-Create.dc.html', datasetCreate());
wr('B7-Project-Dataset-Detail.dc.html', datasetDetail());
wr('B7-Project-Train-New.dc.html', trainNew());
wr('B7-Project-Train-Running.dc.html', trainRunning());
wr('B7-Project-Train-Fix.dc.html', trainFix());
wr('B7-Project-Model-Register.dc.html', modelRegister());
wr('B7-Project-Model-Registered.dc.html', modelRegistered());
wr('B7-Project-Deploy-Picker.dc.html', deployPicker());
wr('B7-Project-Labeling-Fix.dc.html', labelingFix());
wr('B7-Analysis-List.dc.html', analysisList());
wr('B7-Analysis-Progress-Overlay.dc.html', progressOverlay());
wr('B7-Analysis-Result-Edit.dc.html', resultEdit());
wr('B7-Analysis-Share.dc.html', shareModal());
wr('B7-State-Loading.dc.html', stateBoard(false));
wr('B7-State-Error.dc.html', stateBoard(true));
