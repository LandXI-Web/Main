// B6-Support-* 아트보드 생성기 — 서비스 지원 5페이지(공지사항 · 자주 묻는 질문 · 문의하기 · 활용사례 · 매뉴얼), 원본 landxi7 1:1(기능 추가 0).
// 셸 = B5(레일 72 · 마스트헤드 64 · H1 34 + 파랑 4px 룰 · 푸터). 레일 활성 = 서비스 지원. 5페이지는 H1 줄 오른쪽의 탭 5개로 잇는다(원본 admin-tabnav).
// 권장 구조(선택 2) = "분할 열람": 위 = 큰 숫자 필터 띠(원본 구분/상태 select 를 건수 타일로), 좌 = 목록(표), 우 = 열람·작성 판. 공지·문의가 같은 뼈대를 쓴다.
// 값은 전부 원본 시드: landxi/assets/data/support-data.js (SP_NOTICES · SP_FAQS · SP_USECASES · SP_MANUALS) + 원본 contact.html 인라인 시드(id 104–115).
// usage: node tools/design/gen-b6-support.mjs   (repo root) — 멱등. 아트보드 전부 출력.
// 렌더: PLAYWRIGHT_BROWSERS_PATH=… node design-canvas/v2/render.mjs B6-Support-Notice-Opt1 …
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const V = path.join(root, 'design-canvas/v2');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', WARN = '#D1352B', WH = '#FFFFFF';
const W = 1440, HT = 900, X0 = 128, CW = 1256, XR = 1384;

// ---------- 시드 ----------
const sb = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'landxi/assets/data/support-data.js'), 'utf8'), sb);
const NOTICES = sb.window.SP_NOTICES.slice().sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.date.localeCompare(a.date)));
const FAQS = sb.window.SP_FAQS, USECASES = sb.window.SP_USECASES.slice().sort((a, b) => b.date.localeCompare(a.date)), MANUALS = sb.window.SP_MANUALS;
const NCAT = { urgent: '긴급', general: '일반', work: '업무' };
const FCAT = { '01': '서비스 이용', '02': '데이터 업로드', '03': '분석 서비스', '04': '오류 및 점검', '05': '자료 다운로드', '06': '기타' };
// 원본 contact.html 인라인 시드(제목 · 상태 · 등록 일시 · 첨부) — 본문/답변은 열람 판에 쓰는 110 · 115 만 옮겼다.
const INQ = [
  { id: 115, title: '사용자 매뉴얼 PDF 최신본을 어디서 받을 수 있나요?', status: 'pending', at: '2026-04-22T15:08:33', att: [],
    content: '서비스 지원 > 사용자 매뉴얼 링크가 비어있어 다운로드가 되지 않습니다. 최신본(v2.3 기준) 받을 수 있는 경로 알려주세요.' },
  { id: 114, title: '분석 결과 지도 위에 중첩되는 표시 투명도를 조절할 수 있나요?', status: 'pending', at: '2026-04-20T10:41:02', att: [] },
  { id: 113, title: '지도 서비스에서 확대하면 일부 영역이 회색으로 표시됩니다', status: 'replied', at: '2026-04-17T13:20:44', att: [1] },
  { id: 112, title: '농업기술센터용 대시보드 위젯 커스터마이징 요청', status: 'pending', at: '2026-04-16T11:12:05', att: [] },
  { id: 111, title: '분석 이력 검색 시 날짜 범위 최대치 제한이 있나요?', status: 'replied', at: '2026-04-14T16:45:00', att: [] },
  { id: 110, title: '곤포사일리지 탐지 결과가 실제 현장과 차이 나는 경우가 있어요', status: 'replied', at: '2026-04-14T14:22:10',
    att: [{ name: '운봉면4권역_현장사진.zip', size: '4.6 MB' }, { name: '필지_지번_목록.xlsx', size: '27.8 KB' }],
    content: '운봉면 4권역 최근 분석(26.04.11)에서 곤포 탐지 개수가 현장 확인보다 약 5~8개 적게 잡혔습니다.\n산그늘이 진 구역은 탐지율이 좀 낮은 듯한데, 이런 경우 재분석을 요청할 수 있나요?',
    answer: '안녕하세요. 산그늘 조건의 탐지 정확도 개선이 4월 모델 v2.3 업데이트에 포함되어 있습니다. (4/15 배포)\n\n해당 필지에 대해 추론 이력 > "재분석" 을 실행해 주시면 개선된 모델로 다시 탐지됩니다.' },
  { id: 109, title: '환경관리과 업무용으로 지도 레이어 권한 분리 요청', status: 'pending', at: '2026-04-11T09:30:12', att: [] },
  { id: 108, title: '회원가입 신청 후 승인까지 얼마나 걸리나요?', status: 'replied', at: '2026-04-09T10:15:22', att: [] },
  { id: 107, title: '보고서 PDF 에 지도 캡처 이미지가 잘려서 나옵니다', status: 'pending', at: '2026-04-07T16:22:08', att: [1] },
  { id: 106, title: 'AI 추론 보고서 활용 방법 문의', status: 'replied', at: '2026-04-03T10:00:59', att: [] },
  { id: 105, title: '비밀번호 5회 실패 후 잠금 해제는 어떻게 하나요?', status: 'replied', at: '2026-03-28T14:10:40', att: [] },
  { id: 104, title: '모바일에서 지도가 느리게 로딩됩니다', status: 'pending', at: '2026-03-25T11:08:00', att: [] },
];
const fmtD = (iso) => iso.replace(/-/g, '.');
const fmtDT = (iso) => iso.replace('T', ' ').substring(0, 16).replace(/-/g, '.');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 원시 재료 ----------
const svg = (d, size = 16, color = ACC, extra = '') => `<svg style="color:${color};flex:none;display:block${extra}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter">${d}</svg>`;
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
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  search: '<path d="M3.5 3.5h9v9h-9z"/><path d="M12.5 12.5 17 17"/>',
  clip: '<path d="M6 3h8v14H6z"/><path d="M8.5 6.5h3M8.5 9.5h3"/>',
  down: '<path d="M10 3v10M6 9.5l4 4 4-4"/><path d="M3.5 17h13"/>',
  pin: '<path d="M6 3h8v6H6z"/><path d="M10 9v8"/>',
  reset: '<path d="M16.5 10A6.5 6.5 0 1 1 10 3.5h4"/><path d="M12 1.5l2 2-2 2"/>',
  chevD: '<path d="M5 7.5l5 5 5-5"/>',
  chevU: '<path d="M5 12.5l5-5 5 5"/>',
  x: '<path d="M4.5 4.5l11 11M15.5 4.5l-11 11"/>',
  list: '<path d="M3 5h2M3 10h2M3 15h2M8 5h9M8 10h9M8 15h9"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  pen: '<path d="M3 17h4L17 7l-4-4L3 13z"/><path d="M11 5l4 4"/>',
  book: '<path d="M3 3.5h6l1 1 1-1h6v13h-6l-1 1-1-1H3z"/><path d="M10 4.5v12"/>',
  cal: '<path d="M3 4.5h14V17H3z"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/>',
  img: '<path d="M3 3h14v14H3z"/><path d="M3 13.5l4.5-4.5 4 4 2.5-2.5 3 3"/>',
};
const abs = (x, y, w, h, style = '', inner = '') => `<div style="position:absolute;left:${x}px;top:${y}px;${w != null ? `width:${w}px;` : ''}${h != null ? `height:${h}px;` : ''}${style}">${inner}</div>`;
const hl = (x, y, w, c = H) => abs(x, y, w, 1, `background:${c}`);
const vl = (x, y, h, c = H) => abs(x, y, 1, h, `background:${c}`);
const tag = (t) => `<span class="tg">${t}</span>`;
// 2차 버튼 = 코너 브래킷
const brk = (label, { h = 38, pad = 16, color = INK, icon = '' } = {}) => `<span style="position:relative;display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 ${pad}px;font-size:15.5px;font-weight:500;color:${color};white-space:nowrap">
<i style="position:absolute;left:0;top:0;width:9px;height:9px;border-left:1.5px solid ${color};border-top:1.5px solid ${color}"></i><i style="position:absolute;right:0;top:0;width:9px;height:9px;border-right:1.5px solid ${color};border-top:1.5px solid ${color}"></i><i style="position:absolute;left:0;bottom:0;width:9px;height:9px;border-left:1.5px solid ${color};border-bottom:1.5px solid ${color}"></i><i style="position:absolute;right:0;bottom:0;width:9px;height:9px;border-right:1.5px solid ${color};border-bottom:1.5px solid ${color}"></i>${icon}${label}</span>`;
// 1차 버튼 = 잉크 채움
const btn = (label, { h = 38, pad = 20, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:7px;height:${h}px;padding:0 ${pad}px;background:${INK};color:${WH};font-size:15.5px;font-weight:500;white-space:nowrap">${icon}${label}</span>`;
const input = (w, ph, { val = '', h = 42, icon = '', focus = false, mono = false } = {}) => `<span style="display:inline-flex;align-items:center;gap:8px;width:${w}px;height:${h}px;padding:0 12px;border:1px solid ${focus ? ACC : H};${focus ? `outline:1px solid ${ACC};` : ''}font-size:16px;color:${val ? INK : '#8A8A8A'};white-space:nowrap;overflow:hidden" ${mono ? 'class="n"' : ''}>${icon}${val ? esc(val) + (focus ? `<span style="width:1px;height:18px;background:${INK};margin-left:1px"></span>` : '') : ph}</span>`;
const select = (w, val, { h = 42 } = {}) => `<span style="display:inline-flex;align-items:center;justify-content:space-between;width:${w}px;height:${h}px;padding:0 10px 0 12px;border:1px solid ${H};font-size:16px;color:${INK};white-space:nowrap">${val}${svg(IC.chevD, 14, G)}</span>`;
const fieldLab = (t) => `<div class="lab" style="margin-bottom:7px">${t}</div>`;

// ---------- 레일 72 (B5-Dashboard 관리자 레일 · 활성 = 서비스 지원) ----------
function railItem(y, label, icon, on) {
  return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}
${svg(IC[icon], 20, on ? INK : G)}
<div style="font-size:14px;line-height:1.15;letter-spacing:-.02em;text-align:center;white-space:pre-line;color:${on ? INK : G}">${label}</div></div>`;
}
const rail = `
<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:${WH};z-index:9">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px">
${svg(IC.mark, 19, INK)}
<div class="d" style="font-size:14px;line-height:1;letter-spacing:.08em;margin-right:-.08em;white-space:nowrap">LAND XI</div></div>
<div style="position:absolute;left:12px;top:60px;width:48px;height:1px;background:${H}"></div>
${railItem(72, '대시보드', 'dash')}
${railItem(130, '데이터\n관리', 'data')}
${railItem(188, '프로젝트', 'proj')}
${railItem(246, '분석 서비스', 'anal')}
${railItem(304, '지도 서비스', 'map')}
${railItem(596, '서비스 지원', 'sup', true)}
${railItem(654, '카드 발행\n관리', 'pub')}
${railItem(712, '서비스 관리', 'svc')}
${railItem(770, 'MY', 'my')}
${railItem(828, '로그아웃', 'out')}
</div>
${vl(72, 0, HT)}`;

// ---------- 마스트헤드 · H1 + 탭 5 ----------
const TABS = [['notice', '공지사항', 'notice.html'], ['faq', '자주 묻는 질문', 'faq.html'], ['contact', '문의하기', 'contact.html'], ['usecase', '활용사례', 'usecase.html'], ['manual', '매뉴얼', 'manual.html']];
function head(page, crumb, sub) {
  const tabs = TABS.map(([k, l, href]) => k === page
    ? `<span title="${href}" style="display:inline-flex;align-items:center;height:40px;padding:0 18px;font-size:16.5px;font-weight:500;color:${ACC};background:${T1};border:1px solid ${ACC}">${l}</span>`
    : `<span title="${href}" style="display:inline-flex;align-items:center;height:40px;padding:0 18px;font-size:16.5px;color:${INK};border:1px solid ${H};margin-left:-1px">${l}</span>`).join('');
  return `
<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:10px;white-space:nowrap">
${svg(IC.sup, 16, G)}<span style="font-size:16px;color:${G}">서비스 지원</span><span style="font-size:16px;color:${C}">/</span><span style="font-size:16px;font-weight:500">${crumb}</span>
<div style="flex:1"></div>
<span class="mic">기준일 현재</span><span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.04.22</span>${tag('시연')}
</div>${hl(72, 64, 1368)}
<div style="position:absolute;left:${X0}px;top:92px;width:${CW}px;display:flex;align-items:center;gap:18px;white-space:nowrap" data-line>
<span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">서비스</span> 지원</span>
<span class="mic" style="padding-top:8px">${sub}</span>
<div style="flex:1"></div>
<div style="display:flex">${tabs}</div></div>
${hl(X0, 156, CW)}`;
}
const foot = `
${hl(72, 850, 1368)}
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:862px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px"><div class="chip">Family Site ▾</div></div>`;

// ---------- 공용 부품 ----------
// 큰 숫자 필터 타일(원본 select 의 선택지 = 타일, 값 = 시드 건수). on = 선택(틴트 + 파랑 밑줄)
function tiles(items, x, y, tw) {
  let s = '';
  items.forEach((t, i) => {
    const tx = x + i * tw;
    if (t.on) s += abs(tx, y - 18, tw - 16, 146, `background:${T1};border-bottom:3px solid ${ACC}`);
    else if (i) s += vl(tx - 8, y, 104);
    s += abs(tx + (t.on ? 16 : 8), y, tw - 32, null, 'white-space:nowrap', `<div class="lab" style="${t.on ? `color:${INK}` : ''}">${t.label}</div>
<div style="margin-top:8px;display:flex;align-items:baseline;gap:7px"><span class="d" style="font-size:58px;line-height:1;letter-spacing:-.02em;color:${t.n === 0 ? C : t.color || ACC}">${t.n}</span><span style="font-size:17px;color:${G}">건</span></div>
<div class="mic n" style="margin-top:10px;letter-spacing:.01em">${t.sub || '&nbsp;'}</div>`);
  });
  return s;
}
// 페이지네이터(원본: 처음 · 이전 · 1… · 다음 · 마지막 · 페이지 크기 · 총 n건 중 a~b행)
function pager(x, y, w, { page = 1, pages = 1, total, from, to, size = 10 }) {
  const dis = (on) => `color:${on ? INK : C}`;
  let nums = '';
  for (let p = 1; p <= Math.max(1, pages); p++) nums += `<span class="n" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;font-size:15px;${p === page ? `color:${ACC};border:1px solid ${ACC};background:${T1}` : `color:${INK}`}">${p}</span>`;
  return abs(x, y, w, 36, `display:flex;align-items:center;gap:14px;font-size:15px;white-space:nowrap`, `
<span style="${dis(page > 1)}">처음</span><span style="${dis(page > 1)}">이전</span><span style="display:flex;gap:2px">${nums}</span><span style="${dis(page < pages)}">다음</span><span style="${dis(page < pages)}">마지막</span>
<span style="width:1px;height:16px;background:${H}"></span>
<span style="display:inline-flex;align-items:center;gap:8px;color:${G}">페이지 크기<span class="n" style="display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 8px;border:1px solid ${H};color:${INK}">${size}${svg(IC.chevD, 12, G)}</span></span>
<div style="flex:1"></div>
<span style="color:${G}">총 <span class="n" style="color:${INK}">${total}</span>건 중 <span class="n">${from}~${to}</span>행</span>`);
}
// 빈 상태 = 점선 무채 + 원본 문구
function empty(x, y, w, h, msg, why) {
  return abs(x, y, w, h, `border:1px dashed ${C};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center`, `
${svg(IC.search, 34, C)}
<div style="font-size:17px;color:${INK}">${msg}</div>${why ? `<div class="mic" style="max-width:${w - 80}px">${why}</div>` : ''}`);
}
// 표 머리띠(틴트)
function thead(x, y, w, cols) {
  return abs(x, y, w, 34, `background:${T1};border-top:1px solid ${INK};display:flex;align-items:center;font-size:14.5px;color:${INK};letter-spacing:.02em;white-space:nowrap`,
    cols.map(([l, cw, al]) => `<span style="${cw ? `width:${cw}px;flex:none` : 'flex:1'};padding:0 12px;text-align:${al || 'left'}">${l}</span>`).join(''));
}
const catTxt = (c) => `<span style="font-size:15px;font-weight:${c === 'urgent' ? 500 : 400};color:${c === 'urgent' ? WARN : c === 'general' ? G : INK}">${NCAT[c]}</span>`;
const attRow = (a, w) => `<div style="display:flex;align-items:center;gap:10px;width:${w}px;height:40px;border-bottom:1px solid ${H};white-space:nowrap">${svg(IC.clip, 16, G)}<span style="font-size:15.5px;color:${ACC};overflow:hidden;text-overflow:ellipsis">${esc(a.name)}</span><span class="n" style="font-size:14px;color:${G}">(${a.size})</span><div style="flex:1"></div>${svg(IC.down, 16, INK)}</div>`;
const scrim = (x = 72, w = 1368) => abs(x, 0, w, HT, `background:rgba(1,1,2,.38);z-index:20`);

// ---------- 문서 출력 ----------
function write(name, body) {
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
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
*{box-sizing:border-box;word-break:keep-all}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter','Pretendard',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block}
.tg{display:inline-block;height:20px;line-height:18px;padding:0 6px;border:1px dashed #CCCCCC;color:#686868;font-size:14px;letter-spacing:0;font-family:'Pretendard',system-ui,sans-serif;font-weight:400;vertical-align:middle}
.el{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pre{white-space:pre-line}
[data-line]{clip-path:inset(-5px 0px);overflow:clip}
@keyframes lineIn{from{transform:translateY(20px)}to{transform:translateY(0)}}
.in [data-line]>*{animation:lineIn 600ms cubic-bezier(.15,1,.3,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${rail}
${body}
${foot}
</div>
</x-dc>
</body>
</html>
`;
  const out = path.join(V, `${name}.dc.html`);
  fs.writeFileSync(out, html, 'utf8');
  console.log('wrote', path.relative(root, out), html.length);
}

/* ════════════════════════════════════════════════════════════════════
   공지사항
   ════════════════════════════════════════════════════════════════════ */
const N_SUB = '주요 운영 공지 및 업데이트 소식을 확인하세요';
const nCount = (c) => NOTICES.filter((n) => c === 'all' || n.category === c).length;
// 원본 구분 select 순서: 전체 · 긴급 · 일반 · 업무
function noticeBand(sel = 'all', kw = '', focus = false) {
  const items = [
    { label: '전체', n: nCount('all'), on: sel === 'all', sub: `고정 ${NOTICES.filter((n) => n.pinned).length}` },
    { label: '긴급', n: nCount('urgent'), on: sel === 'urgent', color: WARN },
    { label: '일반', n: nCount('general'), on: sel === 'general' },
    { label: '업무', n: nCount('work'), on: sel === 'work' },
  ];
  return `${abs(X0, 174, null, null, '', '')}${tiles(items, X0, 174, 156)}
${abs(X0 + 4 * 156 + 8, 174, 1, 104, `background:${H}`)}
${abs(800, 174, 584, null, '', `${fieldLab('검색어')}<div style="display:flex;align-items:center;gap:10px">${input(372, '제목 또는 내용 검색', { val: kw, focus, icon: svg(IC.search, 16, G) })}<div style="flex:1"></div>${brk('초기화', { h: 42, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 42, icon: svg(IC.search, 15, WH) })}</div>
<div class="mic" style="margin-top:10px">제목과 내용을 함께 찾는다 · Enter 로 검색</div>`)}
${hl(X0, 302, CW)}`;
}
// 목록(좌) — 구분 · 제목 · 등록일, 고정 글이 위(원본 정렬)
function noticeList(x, w, rows, selId, { rowH = 52, y = 326 } = {}) {
  let s = thead(x, y, w, [['구분', 68], ['제목'], ['등록일', 116, 'right']]);
  rows.forEach((n, i) => {
    const ry = y + 34 + i * rowH, on = n.id === selId;
    s += abs(x, ry, w, rowH, `border-bottom:1px solid ${H};display:flex;align-items:center;white-space:nowrap;${on ? `background:${T1};` : ''}`, `
${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}
<span style="width:68px;flex:none;padding:0 12px">${catTxt(n.category)}</span>
<span style="flex:1;min-width:0;padding:0 12px;display:flex;align-items:center;gap:8px">${n.pinned ? svg(IC.pin, 15, INK) : ''}<span class="el" style="font-size:16.5px;letter-spacing:-.01em;${on ? 'font-weight:500;' : ''}color:${INK}">${esc(n.title)}</span></span>
<span class="n" style="width:116px;flex:none;padding:0 12px;text-align:right;font-size:14.5px;letter-spacing:.02em;color:${G}">${fmtD(n.date)}</span>`);
  });
  return s;
}
// 열람 판(우) — 구분 · 제목 · 등록일 · 내용 · 첨부 파일 · 목록
function noticePane(x, w, n, { y = 326, deep = false } = {}) {
  let s = abs(x, y, w, 24, 'display:flex;align-items:center;gap:12px;white-space:nowrap', `${catTxt(n.category)}<span style="width:1px;height:12px;background:${H}"></span><span class="lab" style="letter-spacing:.02em">등록일</span><span class="n" style="font-size:15px;letter-spacing:.02em;color:${INK}">${fmtD(n.date)}</span>${n.pinned ? `<span style="width:1px;height:12px;background:${H}"></span>${svg(IC.pin, 14, G)}<span class="mic">상단 고정</span>` : ''}<div style="flex:1"></div><span class="n mic" style="letter-spacing:.02em">?notice=${n.id}</span>${deep ? `<span class="mic" style="color:${ACC}">대시보드 공지 스트립에서 진입</span>` : ''}`);
  s += abs(x, y + 36, w, null, '', `<div class="d" style="font-size:27px;line-height:36px;letter-spacing:-.015em">${esc(n.title)}</div>`);
  s += hl(x, y + 88, w, INK);
  s += abs(x, y + 106, w, null, '', `<div class="pre" style="font-size:16.5px;line-height:27px;color:${INK}">${esc(n.content)}</div>`);
  return s;
}
function noticePaneFoot(x, w, n, yAtt) {
  let s = '';
  if (n.attachments.length) {
    s += abs(x, yAtt, w, null, '', `<div style="display:flex;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid ${INK}"><span class="d" style="font-size:16px">첨부 파일</span><span class="n" style="font-size:15px;color:${G}">${n.attachments.length}</span></div>${n.attachments.map((a) => attRow(a, w)).join('')}`);
  }
  s += abs(x, 790, w, 38, 'display:flex;align-items:center;gap:14px', `${brk('목록', { icon: svg(IC.list, 15, INK) })}<span class="mic">Esc 로도 닫힌다</span>`);
  return s;
}
const SPL = { lx: X0, lw: 616, dx: 760, px: 776, pw: 608 };

function noticeOpt2(name, selId, { deep = false } = {}) {
  const n = NOTICES.find((v) => v.id === selId);
  let b = head('notice', selId && deep ? '공지사항 열람' : '공지사항', N_SUB) + noticeBand('all');
  b += noticeList(SPL.lx, SPL.lw, NOTICES, selId);
  b += pager(SPL.lx, 792, SPL.lw, { total: NOTICES.length, from: 1, to: NOTICES.length });
  b += vl(SPL.dx, 326, 508);
  b += noticePane(SPL.px, SPL.pw, n, { deep });
  b += noticePaneFoot(SPL.px, SPL.pw, n, n.attachments.length === 2 ? 664 : 690);
  write(name, b);
}

// 선택 1 — 표 중심 + 제자리 펼침(원본 도구막대 · 표 · 페이지네이터 그대로, 상세만 행 아래로)
function noticeOpt1() {
  const openId = 6, rowH = 40, y0 = 250;
  let b = head('notice', '공지사항', N_SUB);
  b += abs(X0, 174, CW, null, 'display:flex;align-items:flex-end;gap:16px', `<div>${fieldLab('구분')}${select(168, '전체')}</div><div style="flex:1">${fieldLab('검색어')}${input(760, '제목 또는 내용 검색', { icon: svg(IC.search, 16, G) })}</div>${brk('초기화', { h: 42, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 42, icon: svg(IC.search, 15, WH) })}`);
  b += thead(X0, y0, CW, [['구분', 120], ['제목'], ['등록일', 150, 'right']]);
  let y = y0 + 34;
  NOTICES.forEach((n) => {
    const on = n.id === openId;
    b += abs(X0, y, CW, rowH, `border-bottom:1px solid ${on ? T2 : H};display:flex;align-items:center;white-space:nowrap;${on ? `background:${T1};` : ''}`, `
${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}
<span style="width:120px;flex:none;padding:0 12px">${catTxt(n.category)}</span>
<span style="flex:1;padding:0 12px;display:flex;align-items:center;gap:8px">${n.pinned ? svg(IC.pin, 15, INK) : ''}<span style="font-size:16.5px;letter-spacing:-.01em;${on ? 'font-weight:500;' : ''}">${esc(n.title)}</span></span>
<span class="n" style="width:150px;flex:none;padding:0 12px;text-align:right;font-size:14.5px;letter-spacing:.02em;color:${G}">${fmtD(n.date)}</span>
<span style="width:40px;flex:none">${svg(on ? IC.chevU : IC.chevD, 16, on ? ACC : C)}</span>`);
    y += rowH;
    if (on) {
      const eh = 196;
      b += abs(X0, y, CW, eh, `border-bottom:1px solid ${INK};border-left:3px solid ${ACC}`, `
<div class="pre" style="position:absolute;left:129px;top:18px;width:760px;font-size:16px;line-height:26px">${esc(n.content)}</div>
<div style="position:absolute;right:52px;top:20px;width:260px"><div class="lab">첨부 파일</div><div class="mic" style="margin-top:8px;padding:10px 12px;border:1px dashed ${C}">첨부 없음 — 있으면 이 자리에 파일 행</div></div>
<div style="position:absolute;right:52px;bottom:16px">${brk('목록', { h: 36, icon: svg(IC.list, 15, INK) })}</div>`);
      y += eh;
    }
  });
  b += pager(X0, 800, CW, { total: 8, from: 1, to: 8 });
  write('B6-Support-Notice-Opt1', b);
}

// 선택 3 — 구분 보드(긴급 · 일반 · 업무 3열 카드) + 상세는 우측 서랍
function noticeOpt3() {
  const openId = 8;
  let b = head('notice', '공지사항 열람', N_SUB);
  b += abs(X0, 174, CW, null, 'display:flex;align-items:flex-end;gap:16px', `<div>${fieldLab('구분')}${select(168, '전체')}</div><div style="flex:1">${fieldLab('검색어')}${input(760, '제목 또는 내용 검색', { icon: svg(IC.search, 16, G) })}</div>${brk('초기화', { h: 42, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 42, icon: svg(IC.search, 15, WH) })}`);
  const cw = 390, gap = 20;
  ['urgent', 'work', 'general'].forEach((c, ci) => {
    const x = X0 + ci * (cw + gap), list = NOTICES.filter((n) => n.category === c);
    b += abs(x, 250, cw, 30, 'display:flex;align-items:baseline;gap:8px;white-space:nowrap', `<span class="d" style="font-size:19px;color:${c === 'urgent' ? WARN : INK}">${NCAT[c]}</span><span class="n" style="font-size:16px;color:${G}">${list.length}</span>`);
    b += hl(x, 284, cw, INK);
    list.forEach((n, i) => {
      const y = 294 + i * 102, on = n.id === openId;
      b += abs(x, y, cw, 96, `border:1px solid ${on ? ACC : H};${on ? `background:${T1};` : ''}padding:11px 14px;line-height:22px`, `
<div style="display:flex;align-items:center;gap:7px">${n.pinned ? svg(IC.pin, 14, INK) : ''}<span class="el" style="font-size:16.5px;font-weight:500;letter-spacing:-.01em">${esc(n.title)}</span></div>
<div class="el" style="margin-top:2px;font-size:14.5px;line-height:20px;color:${G}">${esc(n.content.split('\n')[0])}</div>
<div style="margin-top:7px;display:flex;align-items:center;gap:10px;height:18px"><span class="n mic" style="letter-spacing:.02em">${fmtD(n.date)}</span>${n.attachments.length ? `<span style="display:flex;align-items:center;gap:4px" class="mic">${svg(IC.clip, 14, G)}첨부 ${n.attachments.length}</span>` : ''}</div>`);
    });
  });
  b += pager(X0, 808, CW, { total: 8, from: 1, to: 8 });
  // 서랍
  const n = NOTICES.find((v) => v.id === openId), dx = 944, dw = W - dx;
  b += scrim(72, dx - 72);
  b += abs(dx, 0, dw, HT, `background:${WH};z-index:21;border-left:1px solid ${INK}`, `
<div style="position:absolute;left:40px;top:0;width:${dw - 96}px;height:64px;display:flex;align-items:center;gap:10px;white-space:nowrap"><span class="d" style="font-size:18px">공지사항 열람</span><div style="flex:1"></div><span class="mic">Esc</span>${svg(IC.x, 18, INK)}</div>
<div style="position:absolute;left:0;top:64px;width:100%;height:1px;background:${H}"></div>
${noticePane(40, dw - 96, n, { y: 92 }).replace(/notice\.html\?notice=/, '?notice=')}
${abs(40, 512, dw - 96, null, '', `<div style="display:flex;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid ${INK}"><span class="d" style="font-size:16px">첨부 파일</span><span class="n" style="font-size:15px;color:${G}">1</span></div>${n.attachments.map((a) => attRow(a, dw - 96)).join('')}`)}
${abs(40, 622, dw - 96, 38, 'display:flex;align-items:center', brk('목록', { icon: svg(IC.list, 15, INK) }))}`);
  write('B6-Support-Notice-Opt3', b);
}

function noticeEmpty() {
  let b = head('notice', '공지사항', N_SUB) + noticeBand('all', '드론 배터리', true);
  b += thead(SPL.lx, 326, SPL.lw, [['구분', 68], ['제목'], ['등록일', 116, 'right']]);
  b += empty(SPL.lx, 376, SPL.lw, 396, '검색 조건에 맞는 공지사항이 없습니다.', '검색어 “드론 배터리” · 구분 전체 — 초기화를 누르면 전체 8건으로 돌아간다');
  b += pager(SPL.lx, 792, SPL.lw, { total: 0, from: 0, to: 0 });
  b += vl(SPL.dx, 326, 508);
  b += abs(SPL.px, 326, SPL.pw, 446, `border:1px dashed ${C};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px`, `${svg(IC.notice, 30, C)}<div class="mic">열람 판 — 목록에 행이 없어 비어 있다</div>`);
  write('B6-Support-Notice-Empty', b);
}

/* ════════════════════════════════════════════════════════════════════
   자주 묻는 질문 — 좌 = 구분 레일(원본 select 6 + 전체, 건수), 우 = 아코디언
   ════════════════════════════════════════════════════════════════════ */
const F_SUB = 'Land-XI 사용 중 자주 발생하는 질문과 답변을 확인하세요';
function faqFrame(selCat, kw, field = '전체') {
  let b = head('faq', '자주 묻는 질문', F_SUB);
  b += abs(X0, 174, CW, null, 'display:flex;align-items:flex-end;gap:16px', `<div style="width:248px;align-self:flex-start">${fieldLab('구분')}</div><div style="flex:1;margin-left:16px">${fieldLab('검색어')}<div style="display:flex;gap:8px">${select(120, field)}${input(560, '검색어', { val: kw, focus: !!kw, icon: svg(IC.search, 16, G) })}</div></div>${brk('초기화', { h: 42, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 42, icon: svg(IC.search, 15, WH) })}`);
  b += hl(X0, 197, 248, INK);
  const cats = [['all', '전체', FAQS.length], ...Object.entries(FCAT).map(([k, l]) => [k, l, FAQS.filter((f) => f.category === k).length])];
  cats.forEach(([k, l, n], i) => {
    const on = k === selCat, y = 198 + i * 54;
    b += abs(X0, y, 248, 54, `border-bottom:1px solid ${H};display:flex;align-items:center;gap:8px;padding:0 12px;white-space:nowrap;${on ? `background:${T1};` : ''}`, `${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}<span style="font-size:16px;${on ? `font-weight:500;color:${ACC}` : `color:${INK}`}">${l}</span><div style="flex:1"></div><span class="n" style="font-size:15px;color:${on ? ACC : G}">${n}</span>`);
  });
  b += abs(X0, 198 + 7 * 54 + 22, 248, null, '', `<div class="mic">찾는 답이 없으면</div><div style="margin-top:10px">${brk('문의하기 ›', { h: 36 })}</div>`);
  return b;
}
function faq() {
  const LX = 408, LW = 976, openId = 5;
  let b = faqFrame('all', '');
  b += hl(LX, 250, LW, INK);
  let y = 251; const yMax = 836;
  let shown = 0;
  for (const f of FAQS) {
    const on = f.id === openId, rh = 45;
    const ansLines = on ? f.a.split('\n').length : 0, ah = on ? ansLines * 26 + 34 : 0;
    if (y + rh + ah > yMax) break;
    b += abs(LX, y, LW - 20, rh, `border-bottom:1px solid ${on ? T2 : H};display:flex;align-items:center;gap:12px;padding:0 12px;white-space:nowrap;${on ? `background:${T1};` : ''}`, `<span class="d" style="font-size:18px;color:${ACC};width:18px">Q</span><span style="width:96px;flex:none;font-size:14.5px;color:${G}">${FCAT[f.category]}</span><span class="el" style="flex:1;font-size:16.5px;letter-spacing:-.01em;${on ? 'font-weight:500' : ''}">${esc(f.q)}</span>${svg(on ? IC.chevU : IC.chevD, 16, on ? ACC : G)}`);
    y += rh;
    if (on) {
      b += abs(LX, y, LW - 20, ah, `border-bottom:1px solid ${INK};border-left:3px solid ${ACC};padding:16px 12px 0 9px;display:flex;gap:12px`, `<span class="d" style="font-size:18px;color:${INK};width:18px;flex:none">A</span><span style="width:96px;flex:none"></span><div class="pre" style="flex:1;font-size:16px;line-height:26px">${esc(f.a)}</div>`);
      y += ah;
    }
    shown++;
  }
  // 스크롤 표식(목록 13 중 shown 까지가 첫 화면)
  b += abs(LX + LW - 6, 251, 6, yMax - 251, `background:#F2F2F2`) + abs(LX + LW - 6, 251, 6, Math.round((yMax - 251) * shown / FAQS.length), `background:${C}`);
  write('B6-Support-FAQ', b);
  return shown;
}
function faqEmpty() {
  let b = faqFrame('02', '보고서', '질문');
  b += hl(408, 250, 976, INK);
  b += empty(408, 270, 976, 420, '검색 조건에 맞는 질문이 없습니다.', '구분 데이터 업로드 · 질문 “보고서” — 초기화를 누르면 전체 13건으로 돌아간다');
  write('B6-Support-FAQ-Empty', b);
}

/* ════════════════════════════════════════════════════════════════════
   문의하기 — 위 = 상태 타일 + 제목 · 등록일 · 기간 필터, 좌 = 내 문의 목록, 우 = 문의 등록 / 문의 열람
   ════════════════════════════════════════════════════════════════════ */
const CSPL = { lx: X0, lw: 692, dx: 836, px: 852, pw: 532 };
function contactBand(list, sel = '') {
  const items = [
    { label: '전체', n: list.length, on: sel === '' },
    { label: '답변 대기', n: list.filter((q) => q.status === 'pending').length, on: sel === 'pending' },
    { label: '답변 완료', n: list.filter((q) => q.status === 'replied').length, on: sel === 'replied' },
  ];
  const quick = ['전체', '1개월', '3개월', '6개월', '12개월'].map((l, i) => `<span style="display:inline-flex;align-items:center;height:32px;padding:0 12px;font-size:15px;margin-left:${i ? -1 : 0}px;${i === 0 ? `color:${ACC};border:1px solid ${ACC};background:${T1};position:relative` : `color:${INK};border:1px solid ${H}`}">${l}</span>`).join('');
  return `${tiles(items, X0, 174, 156)}
${vl(X0 + 3 * 156 + 8, 174, 104)}
${abs(636, 174, 748, null, 'display:flex;gap:16px;align-items:flex-end', `<div>${fieldLab('제목')}${input(278, '제목 검색', { icon: svg(IC.search, 16, G) })}</div><div>${fieldLab('등록일')}<div style="display:flex;align-items:center;gap:6px">${input(150, '연도-월-일', { icon: svg(IC.cal, 15, G) })}<span style="color:${G}">~</span>${input(150, '연도-월-일', { icon: svg(IC.cal, 15, G) })}</div></div>`)}
${abs(636, 252, 748, 34, 'display:flex;align-items:center;gap:12px', `<span style="display:flex">${quick}</span><div style="flex:1"></div>${brk('초기화', { h: 34, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 34, icon: svg(IC.search, 15, WH) })}`)}
${hl(X0, 302, CW)}`;
}
const stTxt = (s) => `<span style="font-size:15px;${s === 'replied' ? `color:${ACC};font-weight:500` : `color:${G}`}">${s === 'replied' ? '답변 완료' : '답변 대기'}</span>`;
function contactList(list, selId) {
  const { lx, lw } = CSPL, rowH = 41;
  let s = abs(lx, 322, lw, 28, 'display:flex;align-items:center;gap:8px;white-space:nowrap', `${svg(IC.list, 16, ACC)}<span class="d" style="font-size:18px">내 문의 목록</span><span class="n" style="font-size:16px;color:${G}">(${list.length})</span>`);
  s += thead(lx, 358, lw, [['제목'], ['상태', 96], ['등록 일시', 150, 'right']]);
  if (!list.length) {
    s += empty(lx, 410, lw, 360, '등록된 문의가 없습니다.', '오른쪽 문의 등록에서 저장하면 이 목록 맨 위에 답변 대기로 올라온다');
    s += pager(lx, 792, lw, { total: 0, from: 0, to: 0 });
    return s;
  }
  list.slice(0, 10).forEach((q, i) => {
    const y = 392 + i * rowH - (i ? 0 : 0), on = q.id === selId;
    s += abs(lx, y, lw, rowH, `border-bottom:1px solid ${H};display:flex;align-items:center;white-space:nowrap;${on ? `background:${T1};` : ''}`, `${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}
<span style="flex:1;min-width:0;padding:0 12px;display:flex;align-items:center;gap:6px"><span class="el" style="font-size:16px;letter-spacing:-.01em;${on ? 'font-weight:500' : ''}">${esc(q.title)}</span>${q.att.length ? svg(IC.clip, 14, G) : ''}</span>
<span style="width:96px;flex:none;padding:0 12px">${stTxt(q.status)}</span>
<span class="n" style="width:150px;flex:none;padding:0 12px;text-align:right;font-size:14.5px;letter-spacing:.01em;color:${G}">${fmtDT(q.at)}</span>`);
  });
  s += pager(lx, 808, lw, { page: 1, pages: Math.ceil(list.length / 10), total: list.length, from: 1, to: Math.min(10, list.length) });
  return s;
}
// 우 판 머리: 원본 서브 탭(문의 등록 / 내 문의 목록)의 '문의 등록' 과 하위 뷰 '문의 열람'
function paneHead(mode) {
  const { px, pw } = CSPL;
  const t = (l, on, ic) => `<span style="display:inline-flex;align-items:center;gap:7px;height:30px;font-size:18px;${on ? `color:${INK};border-bottom:2px solid ${INK}` : `color:${G}`}" class="d">${svg(ic, 16, on ? ACC : G)}${l}</span>`;
  return abs(px, 320, pw, 30, 'display:flex;align-items:center;gap:22px;white-space:nowrap', `${t('문의 등록', mode === 'form', IC.pen)}${mode === 'view' ? t('문의 열람', true, IC.notice) : ''}`) + hl(px, 350, pw);
}
function contactForm({ title = '', content = '', files = [], err = false }) {
  const { px, pw } = CSPL;
  const errMsg = (m) => `<div style="margin-top:5px;font-size:14.5px;line-height:18px;color:${WARN}">${m}</div>`;
  const req = `<span style="color:${INK};font-size:14px;margin-left:3px">*</span>`;
  let s = paneHead('form');
  s += abs(px, 362, pw, 426, 'display:flex;flex-direction:column;overflow:hidden', `
<div class="mic">서비스 이용 중 궁금하신 점을 남겨주세요. 담당자가 확인 후 답변 드립니다.</div>
<div style="margin-top:14px;display:flex;align-items:baseline"><span class="lab" style="color:${INK}">제목</span>${req}<div style="flex:1"></div><span class="n mic"><span style="color:${INK}">${title.length}</span>자/60자</span></div>
<div style="margin-top:7px">${input(pw, '문의 제목을 입력하세요', { val: title, focus: err })}</div>${err ? errMsg('제목을 입력해 주세요.') : ''}
<div style="margin-top:14px"><span class="lab" style="color:${INK}">내용</span>${req}</div>
<div class="pre" style="margin-top:7px;flex:1;min-height:0;border:1px solid ${H};padding:10px 12px;font-size:16px;line-height:25px;color:${content ? INK : '#8A8A8A'};overflow:hidden">${content ? esc(content) : '문의하실 내용을 구체적으로 작성해 주세요.\n기능 관련 문의라면 어느 메뉴·어느 단계에서 발생했는지 함께 적어주시면 빠른 답변에 도움이 됩니다.'}</div>${err ? errMsg('문의 내용을 입력해 주세요.') : ''}
<div style="margin-top:14px;display:flex;align-items:center;gap:12px;white-space:nowrap"><span class="lab" style="color:${INK}">첨부 파일</span><span class="mic">이미지 · PDF · 문서 · 파일당 최대 10.0 MB · 최대 5개</span><div style="flex:1"></div>${brk('파일 추가', { h: 32, pad: 12, icon: svg(IC.plus, 14, INK) })}</div>
${files.length ? files.map((f, i) => `<div style="display:flex;align-items:center;gap:10px;height:36px;flex:none;border-bottom:1px solid ${H};white-space:nowrap;margin-top:${i ? 0 : 4}px">${svg(IC.clip, 15, G)}<span style="font-size:15px">${f.name}</span><span class="n mic">(${f.size})</span><div style="flex:1"></div><span style="font-size:14.5px;color:${INK};border-bottom:1px solid ${INK};line-height:18px">삭제</span></div>`).join('') : `<div class="mic" style="margin-top:8px;height:38px;flex:none;border:1px dashed ${C};display:flex;align-items:center;justify-content:center">첨부된 파일이 없습니다.</div>`}`);
  s += abs(px, 800, pw, 38, 'display:flex;align-items:center;justify-content:flex-end;gap:12px', `${brk('취소')}${btn('저장', { pad: 28 })}`);
  return s;
}
function contactView(q) {
  const { px, pw } = CSPL, replied = q.status === 'replied';
  let s = paneHead('view');
  s += abs(px + 250, 320, pw - 250, 30, 'display:flex;align-items:center;justify-content:flex-end;gap:10px;white-space:nowrap', `<span class="lab" style="letter-spacing:.02em">상태</span>${stTxt(q.status)}<span style="width:1px;height:12px;background:${H}"></span><span class="lab" style="letter-spacing:.02em">등록 일시</span><span class="n" style="font-size:14.5px;color:${INK}">${fmtDT(q.at)}</span>`);
  const chip = (a) => `<span style="display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 10px;border:1px solid ${H};white-space:nowrap">${svg(IC.clip, 15, G)}<span style="font-size:15px;color:${ACC}">${esc(a.name)}</span><span class="n" style="font-size:14px;color:${G}">(${a.size})</span>${svg(IC.down, 15, INK)}</span>`;
  s += abs(px, 366, pw, 422, 'display:flex;flex-direction:column;overflow:hidden', `
<div class="d" style="font-size:22px;line-height:30px;letter-spacing:-.015em">${esc(q.title)}</div>
<div style="margin-top:12px;height:1px;background:${INK};flex:none"></div>
<div class="pre" title="문의 내용" style="margin-top:12px;font-size:16px;line-height:24px">${esc(q.content)}</div>
${q.att.length ? `<div class="lab" style="margin-top:14px">첨부 파일</div><div style="margin-top:4px">${q.att.map((a) => attRow(a, pw).replace('height:40px', 'height:32px')).join('')}</div>` : ''}
<div style="margin-top:16px;${replied ? 'flex:1;min-height:0;' : 'flex:none;'}${replied ? `background:${T1};border-top:2px solid ${ACC}` : `border:1px dashed ${C}`};padding:11px 16px">
<div class="d" style="font-size:16px;line-height:22px;color:${replied ? ACC : G}">답변</div>
<div class="pre" style="margin-top:4px;font-size:16px;line-height:24px;color:${replied ? INK : G}">${replied ? esc(q.answer) : '담당자가 확인 후 답변 드릴 예정입니다. 답변까지 영업일 기준 1-2일 소요됩니다.'}</div></div>`);
  s += abs(px, 800, pw, 38, 'display:flex;align-items:center', brk('목록', { icon: svg(IC.list, 15, INK) }));
  return s;
}
function contactBoard(name, crumb, { list = INQ, selId = 0, pane }) {
  let b = head('contact', crumb, '내가 등록한 문의와 답변 현황을 확인할 수 있습니다.') + contactBand(list);
  b += contactList(list, selId) + vl(CSPL.dx, 322, 516) + pane;
  write(name, b);
  return b;
}
const FORM_FILLED = { title: '정사영상 업로드 용량 한도 문의', content: '드론 정사영상 1개 파일이 약 70GB인데 업로드 가능한가요?', files: [{ name: '회색표시_캡처.png', size: '1.7 MB' }] };

/* ════════════════════════════════════════════════════════════════════
   활용사례 — 검색 · 카드형 목록(실 정사영상 크롭) · 상세 모달
   ════════════════════════════════════════════════════════════════════ */
const U_SUB = '실제 현장에서 활용된 사례를 확인하세요';
const UIMG = { 2: ['b6-support-uc-road.jpg', '남원 정사영상 2025 · 도로 구간 크롭'], 1: ['b6-support-uc-farm.jpg', '남원 정사영상 2025 · 농지 필지 결과(파랑 = 필지 경계)'] };
const ucTitle = (t, size) => { const m = /^\[(.+?)\]\s*(.*)$/.exec(t); return m ? `<span style="color:${ACC}">${m[1]}</span><span style="color:${C};margin:0 ${size > 22 ? 10 : 8}px">/</span>${esc(m[2])}` : esc(t); };
function usecaseBar(kw = '', field = '전체') {
  return abs(X0, 174, CW, null, 'display:flex;align-items:flex-end;gap:16px', `<div style="flex:1">${fieldLab('검색어')}<div style="display:flex;gap:8px">${select(120, field)}${input(720, '검색어', { val: kw, focus: !!kw, icon: svg(IC.search, 16, G) })}</div></div>${brk('초기화', { h: 42, icon: svg(IC.reset, 15, INK) })}${btn('검색', { h: 42, icon: svg(IC.search, 15, WH) })}`) + hl(X0, 240, CW);
}
function usecaseGrid() {
  let s = '';
  const cw = 616, ih = 330;
  USECASES.forEach((u, i) => {
    const x = X0 + i * (cw + 24), y = 262, [img, cap] = UIMG[u.id];
    const ex = u.content.split('\n')[0].slice(0, 118);
    s += abs(x, y, cw, ih, 'overflow:hidden;background:#010102', `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.9) contrast(1.04)">
<div style="position:absolute;left:0;bottom:0;height:28px;padding:0 10px;background:${INK};color:${WH};font-size:14px;display:flex;align-items:center;gap:6px;white-space:nowrap">${svg(IC.img, 14, WH)}${cap}</div>
<span class="n" style="position:absolute;left:0;top:0;height:28px;padding:0 10px;background:${WH};font-size:14px;letter-spacing:.06em;display:flex;align-items:center">0${i + 1}</span>`);
    s += abs(x, y + ih, cw, 190, `border:1px solid ${H};border-top:0;padding:16px 18px 0`, `
<div style="display:flex;align-items:center;gap:10px;white-space:nowrap"><span class="n" style="font-size:14.5px;letter-spacing:.02em;color:${G}">${fmtD(u.date)}</span>${u.attachments.length ? `<span style="width:1px;height:12px;background:${H}"></span><span class="mic" style="display:flex;align-items:center;gap:4px">${svg(IC.clip, 14, G)}첨부 ${u.attachments.length}</span>` : ''}</div>
<div class="d" style="margin-top:8px;font-size:22px;line-height:30px;letter-spacing:-.015em;height:60px;overflow:hidden">${ucTitle(u.title, 22)}</div>
<div style="margin-top:8px;font-size:15.5px;line-height:24px;color:${G};height:48px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(ex)}…</div>`);
  });
  return s;
}
function usecase() {
  let b = head('usecase', '활용사례', U_SUB) + usecaseBar() + usecaseGrid();
  b += pager(X0, 800, CW, { total: 2, from: 1, to: 2 });
  write('B6-Support-Usecase', b);
  return b;
}
function usecaseModal(base) {
  const u = USECASES[0], [img, cap] = UIMG[u.id];
  const mw = 1080, mh = 780, mx = 72 + (1368 - mw) / 2, my = 60, lw = 392, rw = mw - lw - 40 - 40 - 32;
  const lines = 24;
  let b = base + scrim(0, W);
  b += abs(mx, my, mw, mh, `background:${WH};z-index:21`, `
<div style="position:absolute;left:40px;top:0;right:40px;height:60px;display:flex;align-items:center;gap:10px;white-space:nowrap;border-bottom:1px solid ${H}"><span class="d" style="font-size:18px">활용 사례</span><span class="n mic" style="letter-spacing:.02em">${fmtD(u.date)}</span><div style="flex:1"></div><span class="mic">Esc</span>${svg(IC.x, 18, INK)}</div>
<div style="position:absolute;left:40px;top:84px;width:${lw}px">
<div style="position:relative;width:${lw}px;height:300px;overflow:hidden;background:#010102"><img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.9) contrast(1.04)"><div style="position:absolute;left:0;bottom:0;height:26px;padding:0 9px;background:${INK};color:${WH};font-size:14px;display:flex;align-items:center;white-space:nowrap">${cap}</div></div>
<div class="d" style="margin-top:18px;font-size:24px;line-height:33px;letter-spacing:-.015em">${ucTitle(u.title, 24)}</div>
<div style="margin-top:22px;display:flex;align-items:baseline;gap:8px;padding-bottom:8px;border-bottom:1px solid ${INK}"><span class="d" style="font-size:16px">첨부 파일</span><span class="n" style="font-size:15px;color:${G}">${u.attachments.length}</span></div>
${u.attachments.map((a) => attRow(a, lw)).join('')}
</div>
<div style="position:absolute;left:${40 + lw + 32}px;top:84px;width:${rw}px;height:${lines * 26}px;overflow:hidden"><div class="pre" style="font-size:16px;line-height:26px">${esc(u.content)}</div></div>
<div style="position:absolute;right:20px;top:84px;width:6px;height:${lines * 26}px;background:#F2F2F2"></div><div style="position:absolute;right:20px;top:84px;width:6px;height:${Math.round(lines * 26 * 0.62)}px;background:${C}"></div>
<div style="position:absolute;left:40px;right:40px;bottom:0;height:64px;border-top:1px solid ${H};display:flex;align-items:center;justify-content:flex-end">${brk('닫기')}</div>`);
  write('B6-Support-Usecase-Modal', b);
}
function usecaseEmpty() {
  let b = head('usecase', '활용사례', U_SUB) + usecaseBar('해양 쓰레기', '제목');
  b += empty(X0, 262, CW, 500, '검색 조건에 맞는 활용 사례가 없습니다.', '제목 “해양 쓰레기” — 초기화를 누르면 전체 2건으로 돌아간다');
  b += pager(X0, 800, CW, { total: 0, from: 0, to: 0 });
  write('B6-Support-Usecase-Empty', b);
}

/* ════════════════════════════════════════════════════════════════════
   매뉴얼 — 원본 manual.html 본문은 비어 있다(#manual-body "추후 HTML로 구성"). 카테고리 = support-data.js SP_MANUALS 5 (시연 시드)
   ════════════════════════════════════════════════════════════════════ */
const M_SUB = '서비스 이용에 필요한 사용 방법을 확인해 보세요.';
const MIMG = ['svc-dashboard.jpg', 'svc-ximap.jpg', 'svc-datamgmt.jpg', 'b6-support-man-analysis.jpg', null];
function manual() {
  const sel = 1, lw = 520, px = X0 + lw + 32, pw = XR - px;
  let b = head('manual', '매뉴얼', M_SUB);
  b += abs(X0, 176, lw, 28, 'display:flex;align-items:center;gap:8px;white-space:nowrap', `${svg(IC.book, 16, ACC)}<span class="d" style="font-size:18px">사용자 매뉴얼</span><span class="n" style="font-size:16px;color:${G}">${MANUALS.length}</span>${tag('시연')}`);
  b += hl(X0, 212, lw, INK);
  MANUALS.forEach((m, i) => {
    const y = 213 + i * 104, on = i === sel;
    b += abs(X0, y, lw, 104, `border-bottom:1px solid ${H};${on ? `background:${T1};` : ''}`, `${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}
<div style="position:absolute;left:14px;top:14px;width:122px;height:76px;overflow:hidden;${MIMG[i] ? `border:1px solid ${H}` : `border:1px dashed ${C};display:flex;align-items:center;justify-content:center`}">${MIMG[i] ? `<img src="${MIMG[i]}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:0 0;display:block">` : `<span class="mic" style="text-align:center;line-height:1.25">화면<br>없음</span>`}</div>
<div style="position:absolute;left:152px;top:15px;right:14px;white-space:nowrap"><div style="display:flex;align-items:baseline;gap:8px"><span class="n" style="font-size:14px;color:${G};letter-spacing:.04em">0${i + 1}</span><span style="font-size:17px;font-weight:500;letter-spacing:-.01em;${on ? `color:${ACC}` : ''}">${m.title}</span></div>
<div class="el" style="margin-top:3px;font-size:14.5px;color:${G}">${m.desc}</div>
<div style="margin-top:7px;display:flex;align-items:center;gap:6px" class="mic">${svg(IC.clip, 14, G)}<span class="el">${m.file}</span><span class="n">(${m.size})</span></div></div>`);
  });
  b += abs(X0, 213 + 5 * 104 + 14, lw, null, '', `<div class="mic">05 보고서 생성 — 개편 범위에 해당 화면이 없어 미리보기를 비워 두었다.</div>`);
  b += vl(px - 16, 176, 658);
  const m = MANUALS[sel];
  b += abs(px, 176, pw, 348, `overflow:hidden;background:${INK}`, `<img src="${MIMG[sel]}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:50% 0;display:block"><div style="position:absolute;left:0;bottom:0;height:28px;padding:0 10px;background:${INK};color:${WH};font-size:14px;display:flex;align-items:center;white-space:nowrap">지도 서비스(XI맵) 화면 · 개편 원판 B5-Map</div>`);
  b += abs(px, 544, pw, null, 'white-space:nowrap', `<div style="display:flex;align-items:baseline;gap:10px"><span class="n" style="font-size:15px;color:${G};letter-spacing:.04em">02</span><span class="d" style="font-size:27px;line-height:36px;letter-spacing:-.015em">${m.title}</span></div><div style="margin-top:4px;font-size:16.5px;color:${G}">${m.desc}</div>`);
  b += abs(px, 622, pw, 46, `border-top:1px solid ${INK};border-bottom:1px solid ${H};display:flex;align-items:center;gap:10px;white-space:nowrap`, `${svg(IC.clip, 16, G)}<span style="font-size:16px;color:${ACC}">${m.file}</span><span class="n" style="font-size:14px;color:${G}">(${m.size})</span>${tag('시연')}<div style="flex:1"></div>${svg(IC.down, 16, INK)}`);
  b += abs(px, 686, pw, 148, `border:1px dashed ${C};padding:16px 18px`, `<div style="font-size:16px;color:${INK}">본문 미구성</div>
<div class="mic" style="margin-top:6px;line-height:1.55">원본 manual.html 의 본문 영역(#manual-body)은 비어 있다 — 주석 “추후 HTML로 구성”.<br>본문이 정해지면 이 자리에 카테고리별 절(제목 · 단계 · 화면)로 들어간다. 지금 실제로 있는 것은 위 5개 카테고리와 파일 시드뿐이다.</div>
<div style="margin-top:12px;display:flex;gap:10px">${[120, 200, 160].map((w) => `<span style="width:${w}px;height:10px;border:1px dashed ${C}"></span>`).join('')}</div>`);
  write('B6-Support-Manual', b);
}

/* ════════════════════════════════════════════════════════════════════ 실행 */
noticeOpt1();
noticeOpt2('B6-Support-Notice-Opt2', 8);
noticeOpt3();
noticeOpt2('B6-Support-Notice-Detail', 7, { deep: true });
noticeEmpty();
const faqShown = faq();
faqEmpty();
contactBoard('B6-Support-Contact', '문의하기', { pane: contactForm(FORM_FILLED) });
contactBoard('B6-Support-Contact-Error', '문의하기', { pane: contactForm({ err: true }) });
contactBoard('B6-Support-Contact-View', '문의 열람', { selId: 110, pane: contactView(INQ.find((q) => q.id === 110)) });
contactBoard('B6-Support-Contact-View-Pending', '문의 열람', { selId: 115, pane: contactView(INQ.find((q) => q.id === 115)) });
contactBoard('B6-Support-Contact-Empty', '문의하기', { list: [], pane: contactForm({}) });
{
  // 취소 확인(원본 NotifyUI.confirm 문구 그대로)
  const base = contactBoard('B6-Support-Contact-Cancel', '문의하기', { pane: contactForm(FORM_FILLED) });
  const mw = 480, mh = 172, mx = 72 + (1368 - mw) / 2, my = 340;
  write('B6-Support-Contact-Cancel', base + scrim(0, W) + abs(mx, my, mw, mh, `background:${WH};z-index:21;padding:30px 32px`, `<div style="margin-top:6px;font-size:16.5px;line-height:27px">작성 중인 내용이 모두 삭제됩니다. 계속하시겠습니까?</div><div style="position:absolute;right:32px;bottom:28px;display:flex;gap:12px">${brk('취소')}${btn('확인', { pad: 28 })}</div>`));
}
const ucBase = usecase();
usecaseModal(ucBase);
usecaseEmpty();
manual();
console.log('faq rows shown', faqShown, '/', FAQS.length);
