// B5-Dashboard-User 아트보드 생성기 — LX 사용자(직원) 대시보드, 원본 landxi7/dashboard2.html 1:1(기능 추가 0).
// 셸은 B5-Dashboard-Data(관리자 보드)와 같다: 레일 72 · 마스트헤드 64 · H1 34 + 파랑 룰 · KPI 5 · SPLIT(좌 판 572 / 우 탭 패널 648) · 푸터.
// 값은 전부 원본 dashboard2.html 의 시드(PROJECTS · ANALYSIS_PROJECTS · usageData · 월별 라인 [42,55,61,48,73,84]).
// usage: node tools/design/gen-b5-dashboard-user.mjs [--tab=disk]   (repo root) — 멱등. --tab=disk 는 우 패널 탭 2 상태(검토용).
// 렌더: node design-canvas/v2/render.mjs B5-Dashboard-User → design-canvas/v2/renders/B5-Dashboard-User.png (1440×900)
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OUT = path.join(root, 'design-canvas/v2/B5-Dashboard-User.dc.html');
const TAB = (process.argv.find(a => a.startsWith('--tab=')) || '--tab=month').slice(6);

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const W = 1440, HT = 900, X0 = 128, CW = 1256;               // 본문 열 128–1384
const PL = { x: 128, w: 572 }, PN = { x: 736, w: 648 };      // 좌 판 / 우 패널 (관리자 보드와 동일)
const TOP = 378, PH = 420;                                   // 판·패널 y · 높이(254→420 자란 상태)

const svg = (d, size = 16, color = ACC, extra = '') => `<svg style="color:${color};flex:none;display:block${extra}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">${d}</svg>`;
const IC = {
  mark: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M8.5 8.5h3v3h-3z" fill="currentColor" stroke="none"/>',
  dash: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>',
  data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>',
  proj: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>',
  anal: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>',
  make: '<path d="M3 3h14v14H3z"/><path d="M10 6.5v7M6.5 10h7"/>',
  map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>',
  sup: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>',
  out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  grid: '<path d="M3 3h14v14H3z"/><path d="M3 7.67h14M3 12.33h14M7.67 3v14M12.33 3v14"/><path d="M7.67 7.67h4.66v4.66H7.67z" fill="currentColor" stroke="none"/>',
  steps: '<path d="M2.5 6.5h4v7h-4z"/><path d="M8 6.5h4v7H8z"/><path d="M13.5 6.5h4v7h-4z" stroke-dasharray="2 2"/>',
  flask: '<path d="M3 6V3h3M14 3h3v3M17 14v3h-3M6 17H3v-3"/><path d="M6.5 10 9 12.5 13.5 7"/>',
};

// ---------- 레일 72 (원본 dashboard2: 서비스 관리 · 카드 발행 관리 숨김 / My 작업공간 바로가기를 레일 안으로) ----------
function railItem(y, label, icon, on, sub) {
  return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px" title="${sub || ''}">
${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}
${svg(IC[icon], 20, on ? INK : G)}
<div style="font-size:14px;line-height:1.15;letter-spacing:-.02em;text-align:center;white-space:pre-line;color:${on ? INK : G}">${label}</div></div>`;
}
const rail = `
<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:#FFFFFF;z-index:9">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
${svg(IC.mark, 19, INK)}
<div class="d" style="font-size:11px;letter-spacing:.18em;margin-right:-.18em">LAND XI</div></div>
<div style="position:absolute;left:12px;top:58px;width:48px;height:1px;background:${H}"></div>
${railItem(72, '대시보드', 'dash', true, 'dashboard2.html · 현재 화면')}
${railItem(130, '데이터\n관리', 'data', false, 'dataset.html')}
<div style="position:absolute;left:12px;top:196px;width:48px;height:1px;background:${H}"></div>
<div class="n" style="position:absolute;left:0;top:206px;line-height:16px;width:72px;text-align:center;font-size:14px;letter-spacing:.06em;color:${G};white-space:nowrap">MY 작업</div>
${railItem(230, 'AI 개발\n프로젝트', 'proj', false, 'ai-project.html')}
${railItem(288, 'AI 분석', 'anal', false, 'analysis-ai.html?tab=run')}
${railItem(346, '프로젝트\n만들기', 'make', false, 'ai-project-create.html')}
${railItem(404, '지도 서비스', 'map', false, 'map-home.html · 분석 결과 지도')}
${railItem(690, '서비스 지원', 'sup', false, 'notice.html')}
${railItem(748, 'MY', 'my', false, 'mypage.html')}
${railItem(806, '로그아웃', 'out', false, 'logout')}
</div>
<div style="position:absolute;left:72px;top:0;width:1px;height:${HT}px;background:${H}"></div>`;

// ---------- 마스트헤드 · H1 ----------
const mast = `
<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
${svg(IC.notice, 16, G)}
<span class="chip">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span class="mic">기준일 현재</span>
<span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.08.26</span>
</div><div style="position:absolute;left:72px;top:64px;width:1368px;height:1px;background:${H}"></div>
<div style="position:absolute;left:${X0}px;top:92px;display:flex;align-items:baseline;gap:16px" data-line><div>
<span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">LX 사용자</span> 대시보드</span>
<span style="font-size:17px;color:${G};letter-spacing:-.01em;margin-left:14px">내 프로젝트 진행과 디스크 사용량을 한눈에</span></div></div>
<div style="position:absolute;left:${X0}px;top:156px;width:${CW}px;height:1px;background:${H}"></div>`;

// ---------- KPI 5 (원본 .ws-kpi 순서·값 그대로) ----------
const KPI = [
  ['내 AI 개발 프로젝트', 8, '개', '초대받은 프로젝트 <b>2</b>건', ACC, 'ai-project.html'],
  ['내 AI 분석 프로젝트', 3, '개', '진행 중 <b>2</b> · 완료 <b>1</b>', ACC, 'ai-project.html'],
  ['내 데이터', 24, '건', '정사영상 · 학습 데이터', ACC, 'dataset.html'],
  ['카드 발행 대기', 1, '건', `<span style="color:${WARN}">검토 대기</span>`, WARN, 'ai-publish.html'],
  ['발행 승인 카드', 12, '건', '이번 달 승인', ACC, 'ai-publish.html'],
];
let kpi = '';
{
  const gap = 36, w0 = 243.2, w = 225.2; let x = X0;
  KPI.forEach((k, i) => {
    const cw = i === 0 ? w0 : w;
    kpi += `<div style="position:absolute;left:${x}px;top:174px;width:${cw}px" title="${k[5]}">
<div class="lab">${k[0]}</div>
<div style="margin-top:8px;display:flex;align-items:baseline;gap:8px"><span class="d" style="font-size:58px;line-height:1;letter-spacing:-.02em;color:${k[4]}">${k[1]}</span><span style="font-size:17px;color:${G}">${k[2]}</span></div>
<div class="mic n" style="margin-top:10px;letter-spacing:.02em;white-space:nowrap">${k[3].replace(/<b>/g, `<span style="color:${INK}">`).replace(/<\/b>/g, '</span>')}</div></div>`;
    x += cw + 18;
    if (i < 4) { kpi += `<div style="position:absolute;left:${x - 18 + 10}px;top:174px;width:1px;height:104px;background:${H}"></div>`; x += 18; }
  });
}
kpi += `<div style="position:absolute;left:${X0}px;top:302px;width:${CW}px;height:1px;background:${H}"></div>`;

// ---------- 좌: 백본 헤더 + 판(내 AI 개발 프로젝트 3 · 내 AI 분석 프로젝트 3) ----------
const bb = `
<div style="position:absolute;left:${PL.x}px;top:326px;width:${PL.w}px;display:flex;align-items:baseline;gap:10px">
${svg(IC.grid, 16, ACC)}<span class="d" style="font-size:18px">AI 기반 모델 (백본)</span>
<span class="mic">국토 관측 영상 파운데이션 모델</span>
<div style="flex:1"></div>
<span class="n" style="font-size:26px;line-height:1;letter-spacing:-.01em">XI-VFM v2.1</span></div>
<div class="mic n" style="position:absolute;left:${PL.x}px;top:354px;letter-spacing:.02em">최종 적용 2026.03.12 · 연결된 분석 과제 14개</div>`;

const PROJECTS = [
  { pid: 1, name: '도로안전 정사영상', updated: '2026.06.09', counts: [1240, 1180, 9] },
  { pid: 8, name: '방치 쓰레기 탐지', updated: '2026.06.09', counts: [860, 540, 4] },
  { pid: 6, name: '비닐하우스 탐지', updated: '2026.06.08', counts: [1520, 1500, 0] },
];
const STEPS = [['데이터', '건'], ['라벨링', '건'], ['학습', '회']];
const ANALYSIS = [
  { aid: 1, name: '도로 포장 손상 정기 모니터링', updated: '2026.06.09', pending: 2, running: 1, done: 5 },
  { aid: 2, name: '관내 비닐하우스 분포 현황 분석', updated: '2026.06.07', pending: 0, running: 0, done: 4 },
  { aid: 4, name: '농지 이용 현황 정기 분석', updated: '2026.06.04', pending: 1, running: 0, done: 8 },
];
const fmt = (v) => v.toLocaleString('en-US');

const groupHead = (y, icon, title, n, right) => `
<div style="position:absolute;left:${PL.x}px;top:${y}px;width:${PL.w}px;height:28px;background:${T1};display:flex;align-items:center;gap:10px;padding:0 12px;white-space:nowrap">
${svg(icon, 15, ACC)}<span class="d" style="font-size:15.5px;color:${INK}">${title}</span><span class="n" style="font-size:15px;color:${INK}">${n}</span>
<div style="flex:1"></div>${right}</div>`;

// 개발 프로젝트 행 — 단계 3 = 이어진 블록(누적 있음 = 액센트 채움·흰 글자 / 0 = 점선·미실행). 시스템이 아는 사실(누적 건수·갱신일)만.
function devRow(p, i, y) {
  const SX = PL.x + 12, SW = PL.w - 24, segW = 168, con = (SW - segW * 3) / 2;
  let s = `<div class="n" style="position:absolute;left:${PL.x + 12}px;top:${y}px;font-size:14px;color:${G}">0${i + 1}</div>
<div style="position:absolute;left:${PL.x + 40}px;top:${y - 3}px;font-size:17.5px;line-height:1.2;letter-spacing:-.01em;color:${INK};white-space:nowrap" title="ai-project.html?pid=${p.pid}">${p.name}</div>
<div class="n" style="position:absolute;right:${W - PL.x - PL.w + 12}px;top:${y}px;font-size:14px;letter-spacing:.02em;color:${G}">갱신 ${p.updated}</div>`;
  p.counts.forEach((v, k) => {
    const on = v > 0, x = SX + k * (segW + con), ty = y + 26;
    if (k > 0) {
      const prevOn = p.counts[k - 1] > 0 && on;
      s += `<div style="position:absolute;left:${x - con}px;top:${ty + 12}px;width:${con}px;height:1px;background:${prevOn ? ACC : C};${prevOn ? '' : 'opacity:.9'}"></div>`;
    }
    s += `<div style="position:absolute;left:${x}px;top:${ty}px;width:${segW}px;height:26px;display:flex;align-items:center;gap:6px;padding:0 9px;white-space:nowrap;${on ? `background:${ACC};color:#FFFFFF` : `border:1px dashed ${C};color:${C}`}">
<span style="font-size:14px;letter-spacing:-.01em">${STEPS[k][0]}</span>
<span class="n" style="margin-left:auto;font-size:15px;letter-spacing:.01em">${on ? fmt(v) : '—'} <span style="font-size:14px;${on ? 'color:rgba(255,255,255,.75)' : ''}">${on ? STEPS[k][1] : '미실행'}</span></span></div>`;
  });
  return s;
}
// 분석 프로젝트 행 — 상태 3 = 분할 막대(대기중 회색 / 분석중 파랑 / 완료 청록 = AI 결과) + 건수 라벨. 막대 폭 = 합계 비례(최대 9건 = 288px).
function anRow(p, i, y) {
  const total = p.pending + p.running + p.done, BW = 234, unit = BW / 9, bx = PL.x + 40;
  const segs = [[p.pending, C, '대기중'], [p.running, ACC, '분석중'], [p.done, TEAL, '완료']];
  let s = `<div class="n" style="position:absolute;left:${PL.x + 12}px;top:${y}px;font-size:14px;color:${G}">0${i + 1}</div>
<div style="position:absolute;left:${bx}px;top:${y - 3}px;font-size:17.5px;line-height:1.2;letter-spacing:-.01em;color:${INK};white-space:nowrap" title="ai-project-work.html?pid=&tab=analysis (aid ${p.aid})">${p.name}</div>
<div class="n" style="position:absolute;right:${W - PL.x - PL.w + 12}px;top:${y}px;font-size:14px;letter-spacing:.02em;color:${G}">갱신 ${p.updated}</div>
<div style="position:absolute;left:${bx}px;top:${y + 28}px;width:${BW}px;height:14px;border-bottom:1px solid ${H}"></div>`;
  let x = bx;
  segs.forEach(([v, col]) => { if (v > 0) { s += `<div style="position:absolute;left:${x}px;top:${y + 28}px;width:${(v * unit).toFixed(1)}px;height:14px;background:${col};box-shadow:none"></div>`; x += v * unit; } });
  s += `<div class="n" style="position:absolute;left:${bx + BW + 16}px;top:${y + 26}px;font-size:14.5px;letter-spacing:.02em;white-space:nowrap;display:flex;gap:12px;color:${G}">`;
  segs.forEach(([v, col, lab]) => { s += `<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${col};display:inline-block;flex:none"></span>${lab} <span style="color:${v > 0 ? INK : C}">${v}</span></span>`; });
  return s + '</div>';
}

const rowH = 58, rowA = 52;
let plate = `<div style="position:absolute;left:${PL.x}px;top:${TOP}px;width:${PL.w}px;height:${PH}px;border:1px solid ${H}"></div>`;
plate += groupHead(TOP, IC.steps, '내 AI 개발 프로젝트', 3,
  `<span style="display:flex;align-items:center;gap:6px;font-size:14px;color:${G};white-space:nowrap"><span style="width:9px;height:9px;background:${ACC};display:inline-block"></span>데이터 있음<span style="width:9px;height:9px;border:1px dashed ${C};display:inline-block;margin-left:6px"></span>미실행</span><span class="mic" style="margin-left:14px">전체 보기 ›</span>`);
PROJECTS.forEach((p, i) => { plate += devRow(p, i, TOP + 28 + 16 + i * rowH); });
const Y2 = TOP + 28 + 16 + 3 * rowH - 6; // 분석 그룹 머리띠
plate += `<div style="position:absolute;left:${PL.x}px;top:${Y2 - 1}px;width:${PL.w}px;height:1px;background:${H}"></div>`;
plate += groupHead(Y2, IC.flask, '내 AI 분석 프로젝트', 3, `<span class="mic">전체 보기 ›</span>`);
ANALYSIS.forEach((p, i) => { plate += anRow(p, i, Y2 + 28 + 14 + i * rowA); });

// ---------- 우: 탭 패널(월별 분석 실행 | 내 디스크 사용량) ----------
const tab = (t, on) => `<div style="height:24px;line-height:22px;padding:0 10px;font-size:14px;letter-spacing:-.01em;white-space:nowrap;border:1px solid ${on ? ACC : H};background:${on ? T1 : '#FFFFFF'};color:${on ? ACC : G}">${t}</div>`;
let panel = `<div style="position:absolute;left:712px;top:326px;width:1px;height:${TOP + PH - 326}px;background:${H}"></div>
<div style="position:absolute;left:${PN.x}px;top:326px;width:${PN.w}px;height:24px;display:flex;align-items:center;gap:1px">${tab('월별 분석 실행', TAB === 'month')}${tab('내 디스크 사용량', TAB === 'disk')}<div style="flex:1"></div>${TAB === 'disk' ? `<span style="font-size:14px;letter-spacing:-.01em;color:${INK};border-bottom:1px solid ${INK}">디스크 증량 신청 ›</span>` : `<span class="mic">최근 6개월</span>`}</div>
<div style="position:absolute;left:${PN.x}px;top:${TOP}px;width:${PN.w}px;height:${PH}px;border:1px solid ${H}"></div>`;

if (TAB === 'month') {
  const M = [42, 55, 61, 48, 73, 84], max = 84, sum = M.reduce((a, b) => a + b, 0);
  const cx0 = PN.x + 36, colW = 96, barW = 56, base = TOP + PH - 64, hMax = 230;
  panel += `<div style="position:absolute;left:${PN.x + 20}px;top:${TOP + 22}px;display:flex;align-items:baseline;gap:8px"><span class="d" style="font-size:34px;line-height:1;letter-spacing:-.02em;color:${ACC}">84</span><span style="font-size:14px;color:${G}">회</span><span style="font-size:14px;color:${G};margin-left:2px">6월</span><span class="n" style="font-size:14px;color:${ACC};letter-spacing:.02em;margin-left:14px">전월 대비 +15 %</span></div>`;
  M.forEach((v, i) => {
    const h = Math.round(v * hMax / max), x = cx0 + i * colW + (colW - barW) / 2, on = i === 5;
    panel += `<div style="position:absolute;left:${x}px;top:${base - h}px;width:${barW}px;height:${h}px;background:${on ? ACC : T2}"></div>
<div class="n" style="position:absolute;left:${x - 20}px;top:${base - h - 24}px;width:${barW + 40}px;text-align:center;font-size:16px;letter-spacing:.01em;color:${on ? ACC : INK}">${v}<span style="font-size:14px;color:${G}"> 회</span></div>
<div class="n" style="position:absolute;left:${x - 20}px;top:${base + 10}px;width:${barW + 40}px;text-align:center;font-size:14px;color:${G}">${i + 1}월</div>`;
  });
  panel += `<div style="position:absolute;left:${PN.x + 20}px;top:${base}px;width:${PN.w - 40}px;height:1px;background:${INK}"></div>
<div style="position:absolute;left:${PN.x + 20}px;top:${TOP + PH - 30}px;width:${PN.w - 40}px;height:1px;background:${H}"></div>
<div style="position:absolute;left:${PN.x + 20}px;top:${TOP + PH - 23}px;font-size:14px;color:${G}">6개월 합계</div>
<div class="n" style="position:absolute;right:${W - PN.x - PN.w + 20}px;top:${TOP + PH - 24}px;font-size:16px;color:${INK};letter-spacing:.01em">${sum} <span style="font-size:14px;color:${G}">회</span></div>`;
} else {
  const U = [['정사영상', 560, ACC], ['공간정보', 360, '#3C8BF9'], ['학습 데이터', 260, TEAL], ['라벨링 데이터', 160, '#6FC9C3'], ['기타', 80, G]];
  const used = 1420, quota = 2048, rem = quota - used, bw = PN.w - 40, bx = PN.x + 20;
  panel += `<div style="position:absolute;left:${bx}px;top:${TOP + 22}px;display:flex;align-items:baseline;gap:8px"><span class="d" style="font-size:34px;line-height:1;letter-spacing:-.02em;color:${ACC}">${fmt(used)}</span><span style="font-size:14px;color:${G}">GB</span><span class="n" style="font-size:16px;color:${G};margin-left:4px">/ ${fmt(quota)} GB</span><span class="n" style="font-size:14px;color:${G};margin-left:14px">${Math.round(used / quota * 100)} % 사용</span></div>
<div style="position:absolute;left:${bx}px;top:${TOP + 78}px;width:${bw}px;height:40px;border:1px solid ${H}"></div>`;
  let x = bx;
  U.forEach(([n, v, col]) => { const w = v / quota * bw; panel += `<div style="position:absolute;left:${x.toFixed(1)}px;top:${TOP + 78}px;width:${w.toFixed(1)}px;height:40px;background:${col}"></div>`; x += w; });
  U.concat([['잔여', rem, '#FFFFFF']]).forEach(([n, v, col], i) => {
    const y = TOP + 146 + i * 38;
    panel += `<div style="position:absolute;left:${bx}px;top:${y}px;width:${bw}px;display:flex;align-items:center;gap:10px;font-size:15px;color:${INK}"><span style="width:10px;height:10px;background:${col};border:1px solid ${col === '#FFFFFF' ? H : col};display:inline-block;flex:none"></span>${n}<span class="n" style="margin-left:auto;font-size:16px;letter-spacing:.01em">${fmt(v)} <span style="font-size:14px;color:${G}">GB</span></span></div><div style="position:absolute;left:${bx}px;top:${y + 28}px;width:${bw}px;height:1px;background:${H}"></div>`;
  });
}

// ---------- 푸터 ----------
const foot = `
<div style="position:absolute;left:72px;top:850px;width:1368px;height:1px;background:${H}"></div>
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:862px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px">
<div class="mic" style="color:${C};white-space:nowrap">색 역할 — <span style="color:${ACC}">파랑</span> 정보/선택 · <span style="color:${WARN}">빨강</span> 조치 필요 · 검정 본문 · <span style="color:${TEAL}">청록</span> AI 결과</div>
<div class="chip">Family Site ▾</div></div>`;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block}
[data-line]{clip-path:inset(-5px 0px);overflow:clip;display:block}
@keyframes lineIn{from{transform:translateY(20px)}to{transform:translateY(0)}}
.in [data-line]>*{animation:lineIn 600ms cubic-bezier(.15,1,.3,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${rail}
${mast}
${kpi}
${bb}
${plate}
${panel}
${foot}
</div>
</x-dc>
</body>
</html>
`;
fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote', path.relative(root, OUT), html.length, 'tab', TAB);
