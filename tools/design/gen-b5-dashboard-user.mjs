// B5-Dashboard-User 아트보드 생성기 — LX 사용자(직원) 대시보드, 원본 landxi7/dashboard2.html 1:1(기능 추가 0). rev.2 (2026-08-29)
// 셸은 B5-Dashboard-Data(관리자 보드)와 같다: 레일 72 · 마스트헤드 64 · H1 34 + 파랑 룰 · KPI 5 · SPLIT · 푸터.
// rev.2 — 고객 판정 "조잡하고 실용성이 없어 보인다" 에 답한 판: 좌(넓음) = 내 AI 개발 프로젝트 3 을 **이미지 카드**(정사영상 크롭 + 단계 레일 1개) + AI 분석 3 을 슬림 행(분할 막대 1 + 숫자 1),
//          우(좁음) = 할 일 큐(초대 2 · 카드 검토 1 — 이 화면의 빨강 전부) → 월별 분석 실행 그래픽 1 → 내 디스크 그래픽 1. 탭 0 · 부제 0 · 푸터 색 범례 0 · 행마다 범례 0.
// 값은 전부 원본 dashboard2.html 의 시드(PROJECTS · ANALYSIS_PROJECTS · usageData · 월별 라인 [42,55,61,48,73,84]).
// usage: node tools/design/gen-b5-dashboard-user.mjs   (repo root) — 멱등.
// 렌더: node design-canvas/v2/render.mjs B5-Dashboard-User → design-canvas/v2/renders/B5-Dashboard-User.png (1440×900)
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OUT = path.join(root, 'design-canvas/v2/B5-Dashboard-User.dc.html');

const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', TEAL = '#0FA9A0', WARN = '#D1352B';
const W = 1440, HT = 900, X0 = 128, CW = 1256;               // 본문 열 128–1384
const PL = { x: 128, w: 792 }, PN = { x: 952, w: 432 };      // 좌 판(넓음 · 이미지 카드) / 우 패널(좁음 · 할 일·그래픽 2)
const SPLIT_Y = 326, SPLIT_H = 508;                           // 326–834 (푸터 룰 850 위)
const CROP = '../../../landxi/assets/proto/crops';           // 관리자 보드와 같은 실 크롭(정사영상)

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
<span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">LX 사용자</span> 대시보드</span></div>
<div style="flex:1"></div>
<div style="display:flex;align-items:baseline;gap:10px;white-space:nowrap">${svg(IC.grid, 14, G, ';align-self:center')}<span class="mic">AI 기반 모델 (백본)</span><span class="n" style="font-size:18px;letter-spacing:-.01em;color:${INK}">XI-VFM v2.1</span><span class="mic n" style="letter-spacing:.02em">최종 적용 2026.03.12 · 연결 과제 14개</span></div></div>
<div style="position:absolute;left:${X0}px;top:156px;width:${CW}px;height:1px;background:${H}"></div>`;

// ---------- KPI 5 (원본 .ws-kpi 순서·값 그대로) ----------
const KPI = [
  ['내 AI 개발 프로젝트', 8, '개', `초대받은 프로젝트 <span style="color:${WARN}">2건</span>`, ACC, 'ai-project.html'],
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

// ---------- 좌(792): 내 AI 개발 프로젝트 3 = 이미지 카드 · 내 AI 분석 프로젝트 3 = 슬림 행 ----------
const PROJECTS = [
  { pid: 1, name: '도로안전 정사영상', updated: '2026.06.09', counts: [1240, 1180, 9], img: `${CROP}/namwon-farmland-2025/3@2x.jpg`, pos: '30% 50%' },
  { pid: 8, name: '방치 쓰레기 탐지', updated: '2026.06.09', counts: [860, 540, 4], img: `${CROP}/yeosu-marine-2025-aerial/1@2x.jpg`, pos: '50% 40%' },
  { pid: 6, name: '비닐하우스 탐지', updated: '2026.06.08', counts: [1520, 1500, 0], img: `${CROP}/namwon-greenhouse-2025/1@2x.jpg`, pos: '40% 50%' },
];
const STEPS = [['데이터', '건'], ['라벨링', '건'], ['학습', '회']];
const ANALYSIS = [
  { aid: 1, name: '도로 포장 손상 정기 모니터링', updated: '2026.06.09', pending: 2, running: 1, done: 5 },
  { aid: 2, name: '관내 비닐하우스 분포 현황 분석', updated: '2026.06.07', pending: 0, running: 0, done: 4 },
  { aid: 4, name: '농지 이용 현황 정기 분석', updated: '2026.06.04', pending: 1, running: 0, done: 8 },
];
const fmt = (v) => v.toLocaleString('en-US');

// 섹션 머리(판 밖 · 28px): 아이콘 + 제목 + 개수 · 우측 보조
const secHead = (x, y, w, icon, title, n, right) => `
<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:28px;display:flex;align-items:center;gap:10px;white-space:nowrap">
${svg(icon, 16, ACC)}<span class="d" style="font-size:18px;color:${INK}">${title}</span><span class="n" style="font-size:17px;color:${G}">${n}</span>
<div style="flex:1"></div>${right || ''}</div>`;

// 개발 프로젝트 카드 — 이미지 164 + 단계 레일(이미지 하단 오버레이 · 데이터/라벨링/학습 3분절, 현재 단계 = 마지막 누적 단계 액센트 밑줄 · 0 = 점선 '미실행') + 캡션(제목 · 갱신일)
const CARD_W = 250, CARD_GAP = 21, IMG_H = 164, CAP_H = 54;
function devCard(p, i, x, y) {
  const cur = p.counts.reduce((m, v, k) => v > 0 ? k : m, 0);
  let s = `<div style="position:absolute;left:${x}px;top:${y}px;width:${CARD_W}px;height:${IMG_H}px;overflow:hidden;background:#010102" title="ai-project.html?pid=${p.pid}">
<img src="${p.img}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${p.pos};display:block;filter:saturate(.85) contrast(1.04)">
<span class="n" style="position:absolute;left:10px;top:8px;font-size:14px;color:#FFFFFF;letter-spacing:.06em;text-shadow:0 0 3px rgba(1,1,2,.9)">0${i + 1}</span>
<div style="position:absolute;left:0;right:0;bottom:0;height:64px;background:linear-gradient(to bottom,rgba(1,1,2,0),rgba(1,1,2,.72))"></div>`;
  const segW = (CARD_W - 20 - 8) / 3;
  p.counts.forEach((v, k) => {
    const on = v > 0, isCur = k === cur, sx = 10 + k * (segW + 4);
    s += `<div style="position:absolute;left:${sx.toFixed(1)}px;bottom:10px;width:${segW.toFixed(1)}px;height:40px;white-space:nowrap">
<div style="font-size:12.5px;line-height:14px;color:rgba(255,255,255,${on ? '.78' : '.5'})">${STEPS[k][0]}</div>
<div class="n" style="font-size:15px;line-height:18px;letter-spacing:.01em;color:${on ? '#FFFFFF' : 'rgba(255,255,255,.5)'}">${on ? fmt(v) : '—'}<span style="font-size:12.5px;opacity:.75"> ${on ? STEPS[k][1] : '미실행'}</span></div>
<div style="position:absolute;left:0;bottom:0;width:100%;height:3px;${on ? `background:${isCur ? ACC : 'rgba(255,255,255,.55)'}` : `border-top:1px dashed rgba(255,255,255,.55)`}"></div></div>`;
  });
  s += `</div>
<div style="position:absolute;left:${x}px;top:${y + IMG_H}px;width:${CARD_W}px;height:${CAP_H}px;border:1px solid ${H};border-top:0;padding:8px 12px 0">
<div style="font-size:16.5px;line-height:20px;letter-spacing:-.01em;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
<div class="mic n" style="margin-top:2px;letter-spacing:.02em">갱신 ${p.updated}</div></div>`;
  return s;
}

// 분석 프로젝트 행(44px) — 이름 · 분할 막대 1(대기 회색 / 분석중 파랑 / 완료 청록 = AI 결과, 폭 = 합계 비례 · 최대 9건) · 숫자 1(완료 n / 합계 건) · 갱신일. 범례는 섹션 머리에 한 번.
function anRow(p, i, y) {
  const total = p.pending + p.running + p.done, BW = 170, unit = BW / 9, bx = PL.x + 372;
  let s = `<div style="position:absolute;left:${PL.x}px;top:${y + 43}px;width:${PL.w}px;height:1px;background:${H}"></div>
<div class="n" style="position:absolute;left:${PL.x + 12}px;top:${y + 11}px;font-size:14px;color:${G}">0${i + 1}</div>
<div style="position:absolute;left:${PL.x + 40}px;top:${y + 10}px;font-size:16.5px;line-height:1.3;letter-spacing:-.01em;color:${INK};white-space:nowrap" title="ai-project-work.html?tab=analysis (aid ${p.aid})">${p.name}</div>
<div style="position:absolute;left:${bx}px;top:${y + 16}px;width:${BW}px;height:12px;border-bottom:1px solid ${H}"></div>`;
  let x = bx;
  [[p.pending, C], [p.running, ACC], [p.done, TEAL]].forEach(([v, col]) => { if (v > 0) { s += `<div style="position:absolute;left:${x.toFixed(1)}px;top:${y + 16}px;width:${(v * unit).toFixed(1)}px;height:12px;background:${col}"></div>`; x += v * unit; } });
  s += `<div class="n" style="position:absolute;left:${bx + BW + 14}px;top:${y + 11}px;font-size:15px;letter-spacing:.01em;color:${INK};white-space:nowrap">${p.done}<span style="font-size:14px;color:${G}"> / ${total} 건</span></div>
<div class="n" style="position:absolute;right:${W - PL.x - PL.w}px;top:${y + 12}px;font-size:14px;letter-spacing:.02em;color:${G}">갱신 ${p.updated}</div>`;
  return s;
}

let plate = secHead(PL.x, SPLIT_Y, PL.w, IC.steps, '내 AI 개발 프로젝트', 3, `<span class="mic">전체 보기 ›</span>`);
const CY = SPLIT_Y + 40;
PROJECTS.forEach((p, i) => { plate += devCard(p, i, PL.x + i * (CARD_W + CARD_GAP), CY); });
const Y2 = CY + IMG_H + CAP_H + 30;                           // 분석 섹션 머리
const legend = [[C, '대기'], [ACC, '분석중'], [TEAL, '완료']].map(([col, l]) => `<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${col};display:inline-block"></span>${l}</span>`).join('');
plate += secHead(PL.x, Y2, PL.w, IC.flask, '내 AI 분석 프로젝트', 3, `<span style="display:flex;gap:12px;font-size:14px;color:${G}">${legend}</span><span class="mic" style="margin-left:16px">전체 보기 ›</span>`);
plate += `<div style="position:absolute;left:${PL.x}px;top:${Y2 + 36}px;width:${PL.w}px;height:1px;background:${INK}"></div>`;
ANALYSIS.forEach((p, i) => { plate += anRow(p, i, Y2 + 37 + i * 44); });

// ---------- 우(432): 할 일 큐 → 월별 분석 실행 → 내 디스크 ----------
let panel = `<div style="position:absolute;left:${PN.x - 16}px;top:${SPLIT_Y}px;width:1px;height:${SPLIT_H}px;background:${H}"></div>`;
// 할 일 — 이 화면의 빨강은 여기(와 KPI 두 곳)뿐. 행 = 할 일 · 건수 · CTA 1
const TODO = [
  ['초대받은 프로젝트', 2, '건', '수락 ›', 'ai-project.html?filter=invited'],
  ['카드 발행 검토 대기', 1, '건', '검토 ›', 'ai-publish.html?status=대기'],
];
panel += secHead(PN.x, SPLIT_Y, PN.w, IC.sup, '할 일', TODO.reduce((a, t) => a + t[1], 0), `<span class="mic">오늘</span>`);
TODO.forEach((t, i) => {
  const y = SPLIT_Y + 40 + i * 48;
  panel += `<div style="position:absolute;left:${PN.x}px;top:${y}px;width:${PN.w}px;height:48px;border-top:1px solid ${i ? H : INK};display:flex;align-items:center;gap:8px;white-space:nowrap" title="${t[4]}">
<span style="width:6px;height:6px;background:${WARN};flex:none"></span>
<span style="font-size:16.5px;letter-spacing:-.01em;color:${INK}">${t[0]}</span>
<span class="n" style="font-size:17px;color:${WARN};letter-spacing:.01em">${t[1]}<span style="font-size:14px;color:${G}"> ${t[2]}</span></span>
<div style="flex:1"></div>
<span style="font-size:14.5px;color:${WARN};border:1px solid ${WARN};height:26px;line-height:24px;padding:0 10px">${t[3]}</span></div>`;
});
panel += `<div style="position:absolute;left:${PN.x}px;top:${SPLIT_Y + 40 + 96}px;width:${PN.w}px;height:1px;background:${H}"></div>`;

// 월별 분석 실행 — 막대 6(6월 액센트 · 그 외 틴트-2) · 큰 수 1
{
  const M = [42, 55, 61, 48, 73, 84], max = 84, y0 = SPLIT_Y + 40 + 96 + 24;
  panel += secHead(PN.x, y0, PN.w, IC.anal, '월별 분석 실행', '', `<span class="mic">최근 6개월</span>`);
  panel += `<div style="position:absolute;left:${PN.x}px;top:${y0 + 34}px;display:flex;align-items:baseline;gap:6px;white-space:nowrap"><span class="d" style="font-size:30px;line-height:1;letter-spacing:-.02em;color:${ACC}">84</span><span style="font-size:14px;color:${G}">회</span><span style="font-size:14px;color:${G};margin-left:2px">6월</span><span class="n" style="font-size:14px;color:${ACC};letter-spacing:.02em;margin-left:10px">전월 대비 +15 %</span></div>`;
  const colW = PN.w / 6, barW = 40, base = y0 + 34 + 30 + 80, hMax = 80;
  M.forEach((v, i) => {
    const h = Math.round(v * hMax / max), x = PN.x + i * colW + (colW - barW) / 2, on = i === 5;
    panel += `<div style="position:absolute;left:${x.toFixed(1)}px;top:${base - h}px;width:${barW}px;height:${h}px;background:${on ? ACC : T2}"></div>
<div class="n" style="position:absolute;left:${(x - 16).toFixed(1)}px;top:${base - h - 20}px;width:${barW + 32}px;text-align:center;font-size:13.5px;letter-spacing:.01em;color:${on ? ACC : G}">${v}</div>
<div class="n" style="position:absolute;left:${(x - 16).toFixed(1)}px;top:${base + 6}px;width:${barW + 32}px;text-align:center;font-size:13.5px;color:${G}">${i + 1}월</div>`;
  });
  panel += `<div style="position:absolute;left:${PN.x}px;top:${base}px;width:${PN.w}px;height:1px;background:${INK}"></div>`;
  panel += `<div style="position:absolute;left:${PN.x}px;top:${base + 30}px;width:${PN.w}px;height:1px;background:${H}"></div>`;

  // 내 디스크 — 큰 수 1 · 스택 바(유형별) · 유형 5 한 줄 · 증량 신청 ›
  const U = [['정사영상', 560, ACC], ['공간정보', 360, '#3C8BF9'], ['학습', 260, TEAL], ['라벨링', 160, '#6FC9C3'], ['기타', 80, G]];
  const used = 1420, quota = 2048, y1 = base + 30 + 16;
  panel += secHead(PN.x, y1, PN.w, IC.data, '내 디스크', '', `<span style="font-size:14px;letter-spacing:-.01em;color:${INK};border-bottom:1px solid ${INK}">증량 신청 ›</span>`);
  panel += `<div style="position:absolute;left:${PN.x}px;top:${y1 + 34}px;display:flex;align-items:baseline;gap:6px;white-space:nowrap"><span class="d" style="font-size:30px;line-height:1;letter-spacing:-.02em;color:${ACC}">${fmt(used)}</span><span style="font-size:14px;color:${G}">GB</span><span class="n" style="font-size:15px;color:${G};margin-left:2px">/ ${fmt(quota)} GB</span><span class="n" style="font-size:14px;color:${G};margin-left:10px">${Math.round(used / quota * 100)} % 사용 · 잔여 ${fmt(quota - used)} GB</span></div>`;
  const by = y1 + 34 + 40, bh = 22;
  panel += `<div style="position:absolute;left:${PN.x}px;top:${by}px;width:${PN.w}px;height:${bh}px;border:1px solid ${H}"></div>`;
  let x = PN.x;
  U.forEach(([n, v, col]) => { const w = v / quota * PN.w; panel += `<div style="position:absolute;left:${x.toFixed(1)}px;top:${by}px;width:${w.toFixed(1)}px;height:${bh}px;background:${col}"></div>`; x += w; });
  panel += `<div style="position:absolute;left:${PN.x}px;top:${by + bh + 10}px;width:${PN.w}px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;color:${G};white-space:nowrap">`;
  U.forEach(([n, v, col]) => { panel += `<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;background:${col};display:inline-block"></span>${n} <span class="n" style="color:${INK}">${v}</span><span style="font-size:12.5px"> GB</span></span>`; });
  panel += `</div>`;
}

// ---------- 푸터 ----------
const foot = `
<div style="position:absolute;left:72px;top:850px;width:1368px;height:1px;background:${H}"></div>
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:862px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px">
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
${plate}
${panel}
${foot}
</div>
</x-dc>
</body>
</html>
`;
fs.writeFileSync(OUT, html, 'utf8');
console.log('wrote', path.relative(root, OUT), html.length);
