// B6 · MY + 인증 아트보드 생성기 — 원본 landxi7/mypage.html · signup.html · find-id(.result).html · find-password(.result).html 1:1(기능 추가 0).
// 셸 = B5(레일 72 · 마스트헤드 64 · H1 34 + 파랑 4px 룰 · 푸터), 레일 활성 = MY. 인증 = 승인된 B5-Login 중앙 카드(좌 필름 / 우 폼) 가족.
// 값은 전부 원본 시드(PROFILE · STORAGE 612.4/2048 · STORAGE_HISTORY 2건 · 프리셋 32–1024 · 10–10240GB · 심볼 16–50px). 시연 꼬리표.
// usage: node tools/design/gen-b6-account.mjs   (repo root) — 멱등. 아트보드 전부 출력.
// 렌더: node design-canvas/v2/render.mjs <이름들> → design-canvas/v2/renders/*.png (1440×900)
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const DIR = path.join(root, 'design-canvas/v2');
const INK = '#010102', G = '#686868', C = '#CCCCCC', H = '#DDDDDD', ACC = '#006DF7', T1 = '#E8F1FF', T2 = '#D6E6FF', WARN = '#D1352B';
const W = 1440, HT = 900, X0 = 128, CW = 1256;

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
  adm: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>',
  out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  lock: '<path d="M4 9h12v8H4z"/><path d="M7 9V4h6v5"/><path d="M10 12v2.5"/>',
  edit: '<path d="M3 17h14"/><path d="M5 13.5 13.5 5l2.5 2.5L7.5 16H5z"/>',
  clock: '<path d="M3 3h14v14H3z"/><path d="M10 6v4.5h3.5"/>',
  image: '<path d="M3 3h14v14H3z"/><path d="M3 14l4.5-4.5 3 3L14 9l3 3"/><path d="M6 6h2v2H6z"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  up: '<path d="M3 13v4h14v-4"/><path d="M10 13V3M6 7l4-4 4 4"/>',
  close: '<path d="M4 4l12 12M16 4 4 16"/>',
  check: '<path d="M4 10.5 8.5 15 16 6"/>',
  consent: '<path d="M3 3h14v14H3z"/><path d="M6 10.5 9 13.5 14.5 7"/>',
  caret: '<path d="M5 8l5 5 5-5"/>',
};
const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const bracket = (w, h, color = INK, k = 10, sw = 1) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;display:block;pointer-events:none"><path d="M.5 ${k}V.5h${k}M${w - k} .5h${k - .5}v${k}M${w - .5} ${h - k}v${k - .5}h-${k}M${k} ${h - .5}H.5v-${k}" fill="none" stroke="${color}" stroke-width="${sw}"/></svg>`;
// 버튼: 1차 = 잉크 채움 · 2차 = 코너 브래킷 · 비활성 = 회색 채움
const btn1 = (label, w = 120, h = 44, extra = '', off = false) => `<div style="flex:none;width:${w}px;height:${h}px;background:${off ? C : INK};color:#FFFFFF;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:500;font-size:16px;letter-spacing:-.01em;white-space:nowrap;${extra}">${label}</div>`;
const btn2 = (label, w = 120, h = 44, color = INK, extra = '') => `<div style="flex:none;position:relative;width:${w}px;height:${h}px;color:${color};display:flex;align-items:center;justify-content:center;gap:8px;font-weight:500;font-size:16px;letter-spacing:-.01em;white-space:nowrap;${extra}">${bracket(w, h, color)}${label}</div>`;
const demo = `<span class="chip" style="border-style:dashed;color:${C}">시연</span>`;
const guess = `<span class="chip" style="border-style:dashed;color:${G}">추정</span>`;

// ---------- 원본 시드 (mypage.html) ----------
const PROFILE = { displayName: '관리자', name: '관리자', email: 'admin@namwon.go.kr', phone: '063-620-6102', dept: '공간정보사업처', rank: '주무관', joined: '2025.04.10 11:18' };
const DEPTS = ['공간정보사업처', '공간사업기획처', '디지털국토정보처', '지적측량처', '미래사업처'];
const STORAGE = { used: 612.4, total: 2048 };
const HISTORY = [
  { cap: 50, reason: '카메라 분석 추론 결과 백업', at: '2026.04.12 14:42', st: 'pending', note: '검토 중' },
  { cap: 100, reason: '정사영상 원본 누적 저장용 - 4월 광역 촬영 건', at: '2026.04.05 09:20', st: 'approved', note: '승인 완료 · 2026.04.08 반영' },
];
const ST = { approved: ['승인', INK], pending: ['검토 중', ACC], rejected: ['반려', G] };
const PRESETS = ['32', '64', '128', '256', '512', '1024', '직접 입력'];
const SYM_DEFAULT_W = 19;                                       // 개편 레일 기본 심볼(B5 레일 실측). 원본 기본 35px · 범위 16–50px 은 그대로

// ---------- 레일 72 (관리자 전 메뉴 · 활성 = MY) ----------
function railItem(y, label, icon, on) {
  return `<div style="position:absolute;left:0;top:${y}px;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
${on ? `<div style="position:absolute;left:0;top:9px;width:2px;height:40px;background:${INK}"></div>` : ''}
${svg(IC[icon], 20, on ? INK : G)}
<div style="font-size:14px;line-height:1.15;letter-spacing:-.02em;text-align:center;white-space:pre-line;color:${on ? INK : G}">${label}</div></div>`;
}
const symbolMark = (sym, k = 1) => sym
  ? `<img src="b6-account-symbol-lx.svg" alt="" style="display:block;width:${sym * k}px;height:auto">`
  : svg(IC.mark, SYM_DEFAULT_W * k, INK);
function rail(sym) {
  return `
<div style="position:absolute;left:0;top:0;width:72px;height:${HT}px;background:#FFFFFF;z-index:9">
<div style="position:absolute;left:0;top:0;width:72px;height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
${symbolMark(sym)}
<div class="d" style="font-size:14px;letter-spacing:.06em;line-height:16px;white-space:nowrap">LAND XI</div></div>
<div style="position:absolute;left:12px;top:58px;width:48px;height:1px;background:${H}"></div>
${railItem(72, '대시보드', 'dash')}
${railItem(130, '데이터\n관리', 'data')}
${railItem(188, '프로젝트', 'proj')}
${railItem(246, '분석 서비스', 'anal')}
${railItem(304, '지도 서비스', 'map')}
${railItem(596, '서비스 지원', 'sup')}
${railItem(654, '카드 발행\n관리', 'pub')}
${railItem(712, '서비스 관리', 'adm')}
${railItem(770, 'MY', 'my', true)}
${railItem(828, '로그아웃', 'out')}
</div>
<div style="position:absolute;left:72px;top:0;width:1px;height:${HT}px;background:${H};z-index:9"></div>`;
}
const mast = `
<div style="position:absolute;left:${X0}px;top:0;width:${CW}px;height:64px;display:flex;align-items:center;gap:12px">
${svg(IC.notice, 16, G)}
<span class="chip">공지</span>
<span style="font-size:16px;letter-spacing:-.01em">고위험 탐지 건 긴급 처리 안내</span>
<span class="n" style="font-size:14.5px;color:${G};letter-spacing:.02em">2026.04.15</span>
<span style="font-size:14.5px;color:${G};margin-left:6px">전체 보기 ›</span>
<div style="flex:1"></div>
<span class="mic">기준일 현재</span>
<span class="n" style="font-size:16px;letter-spacing:.02em;color:${G}">2026.06.08</span>
</div><div style="position:absolute;left:72px;top:64px;width:1368px;height:1px;background:${H}"></div>`;
const h1 = (ruled, rest, sub) => `
<div style="position:absolute;left:${X0}px;top:92px;width:${CW}px;display:flex;align-items:baseline;gap:16px;white-space:nowrap">
<span class="d" style="font-size:34px;line-height:40px"><span style="display:inline-block;border-bottom:4px solid ${ACC};padding-bottom:8px;margin-bottom:-12px">${ruled}</span>${rest}</span>
<span style="font-size:16px;color:${G};letter-spacing:-.01em">${sub}</span></div>
<div style="position:absolute;left:${X0}px;top:156px;width:${CW}px;height:1px;background:${H}"></div>`;
const foot = `
<div style="position:absolute;left:72px;top:850px;width:1368px;height:1px;background:${H}"></div>
<div class="mic" style="position:absolute;left:${X0}px;top:864px;white-space:nowrap">LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부</div>
<div style="position:absolute;left:640px;top:862px;width:744px;display:flex;align-items:center;justify-content:flex-end;gap:12px">
<div class="chip">Family Site ▾</div></div>`;

const CSS = `
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");
@font-face{font-family:"Paperlogy";font-weight:800;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2") format("woff2")}
@font-face{font-family:"Paperlogy";font-weight:700;font-display:swap;src:url("https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2") format("woff2")}
*{box-sizing:border-box}
body{margin:0;background:#FFFFFF;color:#010102;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;font-weight:400;font-size:18px;line-height:1.6;-webkit-font-smoothing:antialiased}
.d{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;letter-spacing:-.01em}
.n{font-family:'Inter',system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}
.lab{font-size:14px;line-height:1.2;color:#686868;letter-spacing:.04em}
.mic{font-size:14px;line-height:1.35;color:#686868}
.chip{height:24px;line-height:22px;padding:0 9px;border:1px solid #DDDDDD;color:#686868;font-size:14px;white-space:nowrap;display:inline-block}
.fl{font-size:14px;line-height:16px;color:#686868;letter-spacing:.02em;white-space:nowrap}
.fi{margin-top:6px;height:40px;border-bottom:1px solid #010102;display:flex;align-items:center;font-size:16.5px;letter-spacing:-.01em;white-space:nowrap}
.fh{margin-top:6px;font-size:14px;line-height:18px;color:#686868;white-space:nowrap}
.al{font-family:'Paperlogy','Pretendard',system-ui,sans-serif;font-weight:700;font-size:16px;line-height:22px;letter-spacing:-.01em;color:#686868;white-space:nowrap}
.ai{margin-top:8px;height:40px;border-bottom:1px solid #010102;display:flex;align-items:center;font-size:16px;letter-spacing:-.01em;white-space:nowrap}
.kb{font-size:14px;line-height:1.2;letter-spacing:.04em;color:#686868}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

function write(name, inner) {
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${CSS}
</style></helmet>
<div style="width:${W}px;height:${HT}px;position:relative;overflow:hidden;background:#FFFFFF;font-family:'Pretendard','Paperlogy',system-ui,sans-serif;color:#010102">
${inner}
</div>
</x-dc>
</body>
</html>
`;
  fs.writeFileSync(path.join(DIR, `${name}.dc.html`), html, 'utf8');
  NAMES.push(name);
}
const NAMES = [];

// ---------- 공용 부품 ----------
const secHead = (icon, title, n, right, w) => `
<div style="width:${w}px;height:28px;display:flex;align-items:center;gap:10px;white-space:nowrap">
${svg(icon, 16, ACC)}<span class="d" style="font-size:18px;color:${INK}">${title}</span>${n !== '' && n != null ? (String(n).startsWith('<') ? n : `<span class="n" style="font-size:16px;color:${G}">${n}</span>`) : ''}
<div style="flex:1"></div>${right || ''}</div>`;
const caret = `<div style="width:1px;height:20px;background:${INK};margin-left:2px"></div>`;
const dots = (n) => `<span style="letter-spacing:.18em;font-size:14px">${'●'.repeat(n)}</span>`;
// 입력 필드(밑줄) — state: '' | 'focus' | 'ro' | 'err'
function field(label, value, o = {}) {
  const { req, ph, state = '', hint, err, select, w } = o;
  const ro = state === 'ro';
  const line = state === 'focus' ? `2px solid ${ACC}` : state === 'err' ? `2px solid ${INK}` : `1px solid ${ro ? H : INK}`;
  const val = value ? `<span style="color:${ro ? G : INK}">${value}</span>` : `<span style="color:${C}">${ph || ''}</span>`;
  return `<div style="${w ? `width:${w}px;` : ''}min-width:0">
<div class="fl" style="color:${state === 'focus' ? INK : G}">${label}${req ? ` <span style="color:${ACC}">*</span>` : ''}</div>
<div class="fi" style="border-bottom:${line}">${val}${state === 'focus' ? caret : ''}${select ? `<div style="flex:1"></div>${svg(IC.caret, 16, G)}` : ''}${ro ? `<div style="flex:1"></div><span class="mic" style="color:${C}">변경 불가</span>` : ''}</div>
${err ? `<div class="fh" style="color:${WARN}">${err}</div>` : hint ? `<div class="fh">${hint}</div>` : ''}</div>`;
}
const cbox = (on, size = 18) => `<span style="flex:none;width:${size}px;height:${size}px;border:1px solid ${on ? ACC : INK};display:flex;align-items:center;justify-content:center">${on ? svg(IC.check, size - 4, ACC) : ''}</span>`;

// ---------- 디스크 어휘 (B5-DataMgmt 의 큰 숫자 + 증량 신청) ----------
const PCT = Math.round(STORAGE.used / STORAGE.total * 100);
// 가로 막대: 사용(액센트) · 잔여(헤어라인 상자) · 검토 중 증량(점선 고스트 — 승인되면 늘어날 몫)
function diskBar(w, h, hist, o = {}) {
  const pend = hist.filter(r => r.st === 'pending').reduce((a, r) => a + r.cap, 0);
  const ghostW = pend ? Math.max(22, Math.round(w * pend / (STORAGE.total + pend))) : 0;
  const baseW = w - ghostW, usedW = Math.round(baseW * STORAGE.used / STORAGE.total);
  let s = `<div style="position:relative;width:${w}px;height:${h + 30}px">
<div style="position:absolute;left:0;top:0;width:${baseW}px;height:${h}px;border:1px solid ${H}"></div>
<div style="position:absolute;left:0;top:0;width:${usedW}px;height:${h}px;background:${ACC}"></div>`;
  if (pend) s += `<div style="position:absolute;left:${baseW}px;top:0;width:${ghostW}px;height:${h}px;border:1px dashed ${G};border-left:0"></div>`;
  [0, 512, 1024, 1536, 2048].forEach((v, i) => {
    const x = Math.round(baseW * v / STORAGE.total);
    s += `<div style="position:absolute;left:${Math.min(x, baseW - 1)}px;top:${h}px;width:1px;height:6px;background:${C}"></div>
<div class="n" style="position:absolute;${i === 4 ? `right:${w - baseW}px` : i === 0 ? 'left:0' : `left:${x - 40}px;width:80px;text-align:center`};top:${h + 10}px;font-size:14px;line-height:16px;color:${G};letter-spacing:.02em;white-space:nowrap">${fmt(v)}${i === 4 ? ' GB' : ''}</div>`;
  });
  if (pend && !o.noGhostLabel) s += `<div class="n" style="position:absolute;right:0;top:-24px;font-size:14px;line-height:16px;color:${G};white-space:nowrap">+${pend} GB <span style="font-family:'Pretendard'">검토 중</span></div>`;
  return s + `</div>`;
}
// 칸 판: 1칸 = 16 GB(전체 2,048 GB = 32열 × 4행 · 열 우선 채움) · 검토 중 증량 = 점선 고스트 칸(오른쪽 덧열)
function diskCells(w, hist) {
  const UNIT = 16, ROWS = 4, COLS = STORAGE.total / UNIT / ROWS, gap = 3;
  const pend = hist.filter(r => r.st === 'pending').reduce((a, r) => a + r.cap, 0);
  const gCells = Math.round(pend / UNIT), gCols = Math.ceil(gCells / ROWS);
  const total = COLS + gCols, cell = Math.floor((w - gap * (total - 1)) / total), pitch = cell + gap;
  const usedCells = STORAGE.used / UNIT, full = Math.floor(usedCells), frac = usedCells - full;
  const gridH = ROWS * pitch - gap;
  let s = `<div style="width:${w}px"><div style="height:20px;display:flex;align-items:center;gap:16px;font-size:14px;color:${G};white-space:nowrap">
<span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:${ACC};display:inline-block"></span>사용</span>
<span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border:1px solid ${C};display:inline-block"></span>잔여</span>
${pend ? `<span style="display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border:1px dashed ${INK};display:inline-block"></span>검토 중 증량 <span class="n" style="color:${INK}">+${fmt(pend)} GB</span></span>` : ''}
<div style="flex:1"></div><span class="n" style="letter-spacing:.02em">1칸 = 16 GB</span></div>
<div style="margin-top:10px;position:relative;width:${w}px;height:${gridH + 28}px">`;
  for (let c = 0; c < total; c++) for (let r = 0; r < ROWS; r++) {
    const i = c * ROWS + r, x = c * pitch, y = r * pitch;
    if (c >= COLS) { if ((c - COLS) * ROWS + r < gCells) s += `<div style="position:absolute;left:${x}px;top:${y}px;width:${cell}px;height:${cell}px;border:1px dashed ${INK}"></div>`; continue; }
    if (i < full) s += `<div style="position:absolute;left:${x}px;top:${y}px;width:${cell}px;height:${cell}px;background:${ACC}"></div>`;
    else { s += `<div style="position:absolute;left:${x}px;top:${y}px;width:${cell}px;height:${cell}px;border:1px solid ${H}"></div>`; if (i === full && frac > .05) s += `<div style="position:absolute;left:${x}px;top:${y}px;width:${cell}px;height:${Math.round(cell * frac)}px;background:${ACC}"></div>`; }
  }
  [0, 512, 1024, 1536, 2048].forEach((v, k) => {
    const x = k === 4 ? COLS * pitch - gap : k * (COLS / 4) * pitch - (k ? 2 : 0);
    s += `<div class="n" style="position:absolute;${k === 0 ? 'left:0' : k === 4 ? `left:${x - 100}px;width:100px;text-align:right` : `left:${x - 40}px;width:80px;text-align:center`};top:${gridH + 10}px;font-size:14px;line-height:16px;color:${G};letter-spacing:.02em;white-space:nowrap">${fmt(v)}${k === 4 ? ' GB' : ''}</div>`;
  });
  return s + `</div></div>`;
}
// 신청 이력 표
function historyTable(w, hist, o = {}) {
  const cols = o.cols || [132, w - 132 - 170 - 108 - 236, 170, 108, 236];
  const heads = ['신청 용량 (GB)', '신청 사유', '신청 일시', '처리 여부', '처리 내용'];
  const rowH = o.rowH || 52;
  let s = `<div style="width:${w}px">
<div style="height:40px;background:${T1};display:flex;align-items:center;font-size:14px;color:${G};letter-spacing:.02em;white-space:nowrap">${heads.map((h, i) => `<div style="flex:none;width:${cols[i]}px;padding-left:${i === 0 ? 16 : 12}px">${h}</div>`).join('')}</div>`;
  if (!hist.length) {
    s += `<div style="height:${o.emptyH || 156}px;border:1px dashed ${C};border-top:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
<div style="font-size:16.5px;color:${G}">조회된 데이터가 없습니다.</div>
<div class="mic">증량 신청을 저장하면 신청 일시 순으로 이곳에 쌓입니다.</div></div>`;
  }
  hist.forEach((r) => {
    const [stl, stc] = ST[r.st];
    s += `<div style="height:${rowH}px;border-bottom:1px solid ${H};display:flex;align-items:center;white-space:nowrap;${r.fresh ? `background:${T1};` : ''}">
<div style="flex:none;width:${cols[0]}px;padding-left:16px;display:flex;align-items:baseline;gap:4px"><span class="d" style="font-size:22px;letter-spacing:-.01em;color:${r.st === 'pending' ? ACC : INK}">+${fmt(r.cap)}</span><span class="mic">GB</span></div>
<div style="flex:none;width:${cols[1]}px;padding-left:12px;font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis">${r.reason}</div>
<div class="n" style="flex:none;width:${cols[2]}px;padding-left:12px;font-size:14.5px;color:${G};letter-spacing:.02em">${r.at}</div>
<div style="flex:none;width:${cols[3]}px;padding-left:12px;display:flex;align-items:center;gap:6px;font-size:16px;font-weight:500;color:${stc}">${r.st === 'pending' ? `<span style="width:6px;height:6px;background:${ACC};display:inline-block"></span>` : r.st === 'approved' ? svg(IC.check, 14, INK) : ''}${stl}</div>
<div style="flex:none;width:${cols[4]}px;padding-left:12px;font-size:15px;color:${G};letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis">${r.note}</div></div>`;
  });
  return s + `</div>`;
}
// 브랜드 심볼 — 레일 머리 미리보기(1.5배) + 가로 크기 자(16–50px)
function railPreview(sym, k = 1.5, o = {}) {
  const bw = Math.round(72 * k), bh = Math.round(58 * k) + (o.tall ? Math.round(30 * k) : 0);
  return `<div style="flex:none;position:relative;width:${bw}px;height:${bh}px;border:1px solid ${o.on ? INK : H};background:#FFFFFF;overflow:hidden">
<div style="position:absolute;left:0;top:0;width:${bw}px;height:${Math.round(58 * k)}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${4 * k}px">
${symbolMark(sym, k)}
<div class="d" style="font-size:${14 * k}px;letter-spacing:.06em;line-height:${16 * k}px;white-space:nowrap">LAND XI</div></div>
<div style="position:absolute;left:${12 * k}px;top:${Math.round(58 * k)}px;width:${48 * k}px;height:1px;background:${H}"></div>
${o.tall ? `<div style="position:absolute;left:0;top:${Math.round(58 * k) + 10 * k}px;width:${bw}px;display:flex;justify-content:center">${svg(IC.dash, 20 * k, C)}</div>` : ''}
</div>`;
}
function widthRuler(w, val, o = {}) {
  const x = (v) => Math.round((v - 16) / 34 * w);
  let s = `<div style="position:relative;width:${w}px;height:40px">
<div style="position:absolute;left:0;top:9px;width:${w}px;height:1px;background:${o.slider ? INK : C}"></div>
<div style="position:absolute;left:0;top:${o.slider ? 8 : 9}px;width:${x(val)}px;height:${o.slider ? 3 : 1}px;background:${o.slider ? ACC : INK}"></div>`;
  [16, 50].forEach(v => { s += `<div style="position:absolute;left:${Math.min(x(v), w - 1)}px;top:5px;width:1px;height:9px;background:${G}"></div>`; });
  s += o.slider
    ? `<div style="position:absolute;left:${x(val) - 7}px;top:2px;width:14px;height:14px;background:#FFFFFF;border:2px solid ${ACC}"></div>`
    : `<div style="position:absolute;left:${x(val) - 3}px;top:6px;width:7px;height:7px;background:${INK}"></div>`;
  s += `<div class="n" style="position:absolute;left:0;top:22px;font-size:14px;line-height:16px;color:${G}">16px</div>
<div class="n" style="position:absolute;right:0;top:22px;font-size:14px;line-height:16px;color:${G}">50px</div>`;
  return s + `</div>`;
}

// ============================================================ 선택 1 (권장) — SPLIT: 좌 신원 원장 372 | 우 디스크 판 860
const L = { x: 128, w: 372 }, R = { x: 524, w: 860 }, TOP = 180, BOT = 834;
function ledgerRows(rows, w) {
  return rows.map(([k, v, cls], i) => `<div style="width:${w}px;height:40px;border-top:1px solid ${i ? H : INK};display:flex;align-items:center;white-space:nowrap">
<span class="lab" style="width:112px">${k}</span><span class="${cls || ''}" style="font-size:${cls ? 15.5 : 16.5}px;letter-spacing:${cls ? '.01em' : '-.01em'}">${v}</span></div>`).join('') + `<div style="width:${w}px;height:1px;background:${H}"></div>`;
}
function identityColumn(o = {}) {
  const sym = o.sym || 0, symW = sym || SYM_DEFAULT_W;
  return `<div style="position:absolute;left:${L.x}px;top:${TOP}px;width:${L.w}px;height:${BOT - TOP}px;display:flex;flex-direction:column">
${secHead(IC.my, '회원 정보', '', demo, L.w)}
<div style="margin-top:14px;display:flex;align-items:baseline;gap:10px;white-space:nowrap"><span class="d" style="font-size:46px;line-height:52px;letter-spacing:-.02em">${PROFILE.displayName}</span><span style="font-size:17px;color:${G}">님 반갑습니다.</span></div>
<div style="margin-top:12px">${ledgerRows([['이름', PROFILE.name], ['아이디 (이메일)', PROFILE.email, 'n'], ['전화번호', PROFILE.phone, 'n'], ['부서', o.dept || PROFILE.dept], ['직위', PROFILE.rank], ['가입 일시', PROFILE.joined, 'n']], L.w)}</div>
<div style="margin-top:16px;display:flex;gap:12px">${btn2(`${svg(IC.edit, 15, INK)}회원정보 수정`, 180, 42)}${btn2(`${svg(IC.lock, 15, INK)}비밀번호 변경`, 180, 42)}</div>
<div style="flex:1"></div>
${secHead(IC.image, '브랜드 설정', '', `<span style="font-size:15px;color:${INK};border-bottom:1px solid ${INK};line-height:20px">수정 ›</span>`, L.w)}
<div style="margin-top:12px;height:1px;background:${INK}"></div>
<div style="margin-top:14px;display:flex;gap:20px;align-items:flex-start">
${railPreview(sym, 1.5)}
<div style="min-width:0;flex:1">
<div style="font-size:16.5px;font-weight:500;letter-spacing:-.01em;line-height:22px">사이드바 브랜드 심볼</div>
<div style="margin-top:4px;display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span class="lab">현재 가로 크기</span><span class="d" style="font-size:22px;line-height:26px;color:${o.sym ? ACC : INK}">${symW}</span><span class="mic">px</span></div>
<div style="margin-top:4px">${widthRuler(L.w - 128, symW)}</div>
</div></div>
<div class="mic" style="margin-top:10px;line-height:20px;word-break:keep-all">사이드바 상단에 표시되는 심볼 이미지입니다. PNG 또는 SVG 파일로 교체할 수 있습니다.</div>
${o.withdraw ? `<div style="margin-top:4px;display:flex;align-items:center;gap:8px;white-space:nowrap"><span style="font-size:15px;color:${G};border-bottom:1px solid ${C}">계정 탈퇴 ›</span>${guess}</div>` : ''}
</div>
<div style="position:absolute;left:${L.x + L.w + 12}px;top:${TOP}px;width:1px;height:${BOT - TOP}px;background:${H}"></div>`;
}
function diskPlate(o = {}) {
  const hist = o.hist || HISTORY;
  const stat = (k, v, col = INK) => `<div style="padding-left:20px;border-left:1px solid ${H};white-space:nowrap"><div class="lab">${k}</div><div style="margin-top:8px;display:flex;align-items:baseline;gap:5px"><span class="d" style="font-size:30px;line-height:34px;letter-spacing:-.02em;color:${col}">${v}</span><span class="mic">GB</span></div></div>`;
  return `<div style="position:absolute;left:${R.x}px;top:${TOP}px;width:${R.w}px;height:${BOT - TOP}px;display:flex;flex-direction:column">
<div style="position:relative">${secHead(IC.data, '내 디스크 사용량', demo, '', R.w)}<div style="position:absolute;right:0;top:-4px">${btn1(`${svg(IC.plus, 14, '#FFFFFF')}내 디스크 증량 신청`, 196, 44)}</div></div>
<div style="margin-top:6px;display:flex;align-items:flex-end;white-space:nowrap">
<div style="display:flex;align-items:baseline;gap:8px;width:250px"><span class="d" style="font-size:126px;line-height:118px;letter-spacing:-.03em;color:${ACC}">${PCT}</span><span style="display:flex;flex-direction:column;gap:2px"><span class="d" style="font-size:30px;line-height:30px;color:${ACC}">%</span><span class="mic">사용 중</span></span></div>
<div style="display:flex;gap:28px;padding-bottom:8px">${stat('사용', fmt(STORAGE.used, 1), ACC)}${stat('잔여', fmt(STORAGE.total - STORAGE.used, 1))}${stat('전체', fmt(STORAGE.total))}</div>
</div>
<div style="margin-top:26px">${diskCells(R.w, hist)}</div>
<div style="flex:1;min-height:20px"></div>
${secHead(IC.clock, '내 디스크 증량 신청 이력', `총 ${hist.length}건`, '', R.w)}
<div style="margin-top:12px">${historyTable(R.w, hist, { rowH: o.rowH || 56, emptyH: 168 })}</div>
<div style="margin-top:0;height:52px;border:1px dashed ${C};border-top:0;display:flex;align-items:center;gap:10px;padding:0 16px;white-space:nowrap">${svg(IC.plus, 14, G)}<span style="font-size:15.5px;color:${G}">새 증량 신청</span><span class="mic n" style="letter-spacing:.02em;margin-left:6px">10 – 10,240 GB</span><div style="flex:1"></div><span class="mic">신청 → 검토 중 → 승인 · 반려</span></div>
</div>`;
}
const pageMain = (o = {}) => `${rail(o.sym)}${mast}${h1('마이', ' 페이지', '회원 정보 및 내 디스크 사용 현황을 확인하세요')}${identityColumn(o)}${diskPlate(o)}${foot}`;

// ---------- 오버레이: 스크림 · 모달 · 토스트 · 플라이아웃 ----------
const scrim = `<div style="position:absolute;left:73px;top:0;width:1367px;height:${HT}px;background:rgba(1,1,2,.54);z-index:20"></div>`;
function modal(w, title, body, footer, o = {}) {
  const left = Math.round(73 + (1367 - w) / 2);
  return `${scrim}<div style="position:absolute;left:${left}px;top:${o.top || 200}px;width:${w}px;background:#FFFFFF;z-index:21;padding:28px 32px 28px">
<div style="display:flex;align-items:center;white-space:nowrap"><span class="d" style="font-size:22px;line-height:28px">${title}</span>${o.tag ? `<span style="margin-left:10px">${o.tag}</span>` : ''}<div style="flex:1"></div>${svg(IC.close, 16, G)}</div>
${o.sub ? `<div class="mic" style="margin-top:6px;font-size:15px">${o.sub}</div>` : ''}
<div style="margin-top:16px;height:1px;background:${INK}"></div>
<div style="margin-top:22px">${body}</div>
<div style="margin-top:26px;padding-top:18px;border-top:1px solid ${H};display:flex;align-items:center;gap:10px">${footer}</div></div>`;
}
const footCS = (ok = '저장', lead = '') => `${lead}<div style="flex:1"></div>${btn2('취소', 96, 44, G)}${btn1(ok, 112, 44)}`;
const toast = (title, msg, warn) => `<div style="position:absolute;right:56px;top:80px;width:${msg.length > 30 ? 520 : 420}px;background:#FFFFFF;border:1px solid ${INK};border-left:4px solid ${warn ? INK : ACC};z-index:30;padding:9px 18px;display:flex;gap:12px;align-items:flex-start">
<div style="margin-top:3px">${warn ? `<span class="d" style="display:block;width:16px;text-align:center;font-size:16px;line-height:16px;color:${WARN}">!</span>` : svg(IC.check, 16, ACC)}</div>
<div style="min-width:0;flex:1"><div class="d" style="font-size:16px;line-height:22px;color:${warn ? WARN : INK}">${title}</div><div style="font-size:15px;line-height:22px;color:${G};word-break:keep-all">${msg}</div></div>${svg(IC.close, 12, C)}</div>`;

// ============================================================ MY 아트보드
write('B6-My-Opt1', pageMain());

// 선택 2 — 현황 밴드 + 세로 스택(원본 순서 · 대시보드 셸)
{
  const cells = [
    ['회원', `<span class="d" style="font-size:50px;line-height:58px;letter-spacing:-.02em;color:${INK}">${PROFILE.displayName}</span>`, `${PROFILE.dept} · ${PROFILE.rank}`],
    ['내 디스크 사용량', `<span class="d" style="font-size:58px;line-height:58px;letter-spacing:-.02em;color:${ACC}">${PCT}</span><span style="font-size:17px;color:${G}">%</span>`, `<span class="n">${fmt(STORAGE.used, 1)} / ${fmt(STORAGE.total)} GB</span> · 잔여 <span class="n">${fmt(STORAGE.total - STORAGE.used, 1)} GB</span>`],
    ['증량 신청 이력', `<span class="d" style="font-size:58px;line-height:58px;letter-spacing:-.02em;color:${ACC}">${HISTORY.length}</span><span style="font-size:17px;color:${G}">건</span>`, `검토 중 <span style="color:${INK}">1</span> · 승인 <span style="color:${INK}">1</span>`],
    ['사이드바 브랜드 심볼', `<span class="d" style="font-size:58px;line-height:58px;letter-spacing:-.02em;color:${INK}">${SYM_DEFAULT_W}</span><span style="font-size:17px;color:${G}">px</span>`, '기본 심볼 · PNG / SVG 로 교체'],
  ];
  let band = '';
  cells.forEach((c, i) => {
    const x = X0 + i * 314;
    band += `<div style="position:absolute;left:${x + (i ? 24 : 0)}px;top:174px;width:${290 - (i ? 24 : 0)}px;white-space:nowrap"><div class="lab">${c[0]}</div><div style="margin-top:8px;height:58px;display:flex;align-items:baseline;gap:8px">${c[1]}</div><div class="mic" style="margin-top:10px">${c[2]}</div></div>`;
    if (i) band += `<div style="position:absolute;left:${x}px;top:174px;width:1px;height:104px;background:${H}"></div>`;
  });
  band += `<div style="position:absolute;left:${X0}px;top:302px;width:${CW}px;height:1px;background:${H}"></div>`;
  const body = `<div style="position:absolute;left:${X0}px;top:326px;width:${CW}px;height:508px;display:flex;flex-direction:column">
${secHead(IC.my, '회원 정보', '', `<span style="display:flex;gap:12px">${btn2(`${svg(IC.lock, 15, INK)}비밀번호 변경`, 160, 36)}${btn2(`${svg(IC.edit, 15, INK)}회원정보 수정`, 160, 36)}</span>`, CW)}
<div style="margin-top:14px;display:flex;border-top:1px solid ${INK};border-bottom:1px solid ${H};height:64px;align-items:center;white-space:nowrap">
${[['이름', PROFILE.name], ['부서', PROFILE.dept], ['직위', PROFILE.rank], ['가입 일시', `<span class="n" style="font-size:15.5px">${PROFILE.joined}</span>`]].map(([k, v], i) => `<div style="flex:1;display:flex;align-items:center;gap:16px;${i ? `border-left:1px solid ${H};padding-left:24px;` : ''}height:36px"><span class="lab">${k}</span><span style="font-size:16.5px">${v}</span></div>`).join('')}</div>
<div style="flex:1"></div>
${secHead(IC.clock, '내 디스크 증량 신청 이력', `총 ${HISTORY.length}건`, btn1(`${svg(IC.plus, 14, '#FFFFFF')}내 디스크 증량 신청`, 190, 36), CW)}
<div style="margin-top:12px">${diskBar(CW, 14, HISTORY, { noGhostLabel: true })}</div>
<div style="margin-top:8px">${historyTable(CW, HISTORY, { rowH: 50 })}</div>
<div style="flex:1"></div>
${secHead(IC.image, '브랜드 설정', '', `<span style="font-size:15px;color:${INK};border-bottom:1px solid ${INK};line-height:20px">수정 ›</span>`, CW)}
<div style="margin-top:10px;border-top:1px solid ${INK};padding-top:12px;display:flex;gap:20px;align-items:center;white-space:nowrap">
${railPreview(0, 1)}
<div><div style="font-size:16.5px;font-weight:500;line-height:22px">사이드바 브랜드 심볼</div><div class="mic" style="margin-top:2px">사이드바 상단에 표시되는 심볼 이미지입니다. 수정 버튼을 눌러 PNG 또는 SVG 파일로 교체할 수 있습니다.</div></div>
<div style="flex:1"></div><div style="width:260px">${widthRuler(260, SYM_DEFAULT_W)}</div></div>
</div>`;
  write('B6-My-Opt2', `${rail()}${mast}${h1('마이', ' 페이지', '회원 정보 및 내 디스크 사용 현황을 확인하세요')}${band}${body}${foot}`);
}

// 선택 3 — 설정 작업공간(좌 절 목록 300 · 우 선택한 절 상세 · 한 번에 한 절)
{
  const items = [
    [IC.my, '회원 정보', `${PROFILE.name} · ${PROFILE.dept}`, false],
    [IC.data, '내 디스크', `${PCT} % 사용 · 신청 이력 ${HISTORY.length}건`, true],
    [IC.lock, '비밀번호 변경', '현재 비밀번호 확인 후 변경', false],
    [IC.image, '브랜드 설정', `사이드바 심볼 · ${SYM_DEFAULT_W}px`, false],
  ];
  let nav = `<div style="position:absolute;left:${X0}px;top:${TOP}px;width:300px">`;
  items.forEach(([ic, t, s, on], i) => {
    nav += `<div style="position:relative;height:84px;border-top:1px solid ${i ? H : INK};${on ? `background:${T1};` : ''}padding:16px 16px 0 20px;white-space:nowrap">
${on ? `<div style="position:absolute;left:0;top:0;width:3px;height:84px;background:${ACC}"></div>` : ''}
<div style="display:flex;align-items:center;gap:10px">${svg(ic, 16, on ? ACC : G)}<span class="d" style="font-size:18px;color:${on ? ACC : INK}">${t}</span><div style="flex:1"></div><span style="color:${on ? ACC : C};font-size:16px">›</span></div>
<div class="mic" style="margin-top:6px;margin-left:26px">${s}</div></div>`;
  });
  nav += `<div style="height:1px;background:${H}"></div></div><div style="position:absolute;left:${X0 + 324}px;top:${TOP}px;width:1px;height:${BOT - TOP}px;background:${H}"></div>`;
  const DX = X0 + 348, DW = CW - 348;
  const stat = (k, v, col = INK) => `<div style="padding-left:20px;border-left:1px solid ${H};white-space:nowrap"><div class="lab">${k}</div><div style="margin-top:8px;display:flex;align-items:baseline;gap:5px"><span class="d" style="font-size:30px;line-height:34px;letter-spacing:-.02em;color:${col}">${v}</span><span class="mic">GB</span></div></div>`;
  const detail = `<div style="position:absolute;left:${DX}px;top:${TOP}px;width:${DW}px;height:${BOT - TOP}px;display:flex;flex-direction:column">
<div style="display:flex;align-items:center;white-space:nowrap;height:36px"><span class="d" style="font-size:26px">내 디스크</span><span style="margin-left:12px">${demo}</span><div style="flex:1"></div>${btn1(`${svg(IC.plus, 14, '#FFFFFF')}내 디스크 증량 신청`, 196, 44)}</div>
<div style="margin-top:20px;display:flex;align-items:flex-end;white-space:nowrap">
<div style="display:flex;align-items:baseline;gap:8px;width:250px"><span class="d" style="font-size:126px;line-height:118px;letter-spacing:-.03em;color:${ACC}">${PCT}</span><span style="display:flex;flex-direction:column;gap:2px"><span class="d" style="font-size:30px;line-height:30px;color:${ACC}">%</span><span class="mic">사용 중</span></span></div>
<div style="display:flex;gap:28px;padding-bottom:8px">${stat('사용', fmt(STORAGE.used, 1), ACC)}${stat('잔여', fmt(STORAGE.total - STORAGE.used, 1))}${stat('전체', fmt(STORAGE.total))}</div></div>
<div style="margin-top:34px">${diskCells(DW, HISTORY)}</div>
<div style="flex:1"></div>
${secHead(IC.clock, '내 디스크 증량 신청 이력', `총 ${HISTORY.length}건`, '', DW)}
<div style="margin-top:12px">${historyTable(DW, HISTORY, { rowH: 60 })}</div>
<div style="flex:.6"></div></div>`;
  write('B6-My-Opt3', `${rail()}${mast}${h1('마이', ' 페이지', '회원 정보 및 내 디스크 사용 현황을 확인하세요')}${nav}${detail}${foot}`);
}

// MY 플라이아웃(원본 include/header.html .sb-flyout--my: MY 머리 + 마이 페이지 / 로그아웃)
{
  const fly = `<div style="position:absolute;left:73px;top:742px;width:208px;background:#FFFFFF;border:1px solid ${INK};border-left:0;z-index:12;padding:14px 0 8px">
<div style="display:flex;align-items:center;gap:8px;padding:0 18px 12px;border-bottom:1px solid ${H};white-space:nowrap">${svg(IC.my, 15, G)}<span class="lab" style="letter-spacing:.08em">MY</span><div style="flex:1"></div><span class="mic">${PROFILE.displayName}</span></div>
<div style="position:relative;height:44px;display:flex;align-items:center;padding:0 18px;background:${T1};white-space:nowrap"><div style="position:absolute;left:0;top:0;width:3px;height:44px;background:${ACC}"></div><span style="font-size:16.5px;font-weight:500;color:${ACC}">마이 페이지</span><div style="flex:1"></div><span class="mic" style="color:${ACC}">현재</span></div>
<div style="height:44px;display:flex;align-items:center;gap:8px;padding:0 18px;white-space:nowrap"><span style="font-size:16.5px">로그아웃</span><div style="flex:1"></div>${svg(IC.out, 15, G)}</div></div>`;
  write('B6-My-Flyout', pageMain() + fly);
}

// 본인 확인(회원정보 수정 진입)
write('B6-My-PwdConfirm', pageMain() + modal(460, '본인 확인',
  `<div style="font-size:16px;line-height:25px;color:${G};word-break:keep-all">회원정보 수정을 위해 현재 비밀번호를 한 번 더 입력해 주세요.</div>
<div style="margin-top:20px">${field('현재 비밀번호', '', { req: 1, ph: '현재 사용 중인 비밀번호', state: 'focus' })}</div>`, footCS('확인'), { top: 270 }));
write('B6-My-PwdConfirm-Error', pageMain() + modal(460, '본인 확인',
  `<div style="font-size:16px;line-height:25px;color:${G};word-break:keep-all">회원정보 수정을 위해 현재 비밀번호를 한 번 더 입력해 주세요.</div>
<div style="margin-top:20px">${field('현재 비밀번호', '', { req: 1, ph: '현재 사용 중인 비밀번호', state: 'err', err: '비밀번호를 입력해 주세요.' })}</div>`, footCS('확인'), { top: 258 }));

// 회원정보 수정 뷰 — 좌 원장이 그 자리에서 입력으로 바뀐다 · 우 = 정보 이용 동의 설정 · 하단 작업 띠
function pageEdit(o = {}) {
  const left = `<div style="position:absolute;left:${L.x}px;top:${TOP}px;width:${L.w}px;display:flex;flex-direction:column;gap:22px">
${secHead(IC.my, '기본 정보', '', `<span class="mic"><span style="color:${ACC}">*</span> 필수 입력</span>`, L.w)}
<div style="margin-top:-8px;height:1px;background:${INK}"></div>
${field('이름', PROFILE.name, { state: 'ro', hint: '이름은 관리자에게 문의해 변경할 수 있습니다.' })}
${field('아이디 (이메일)', `<span class="n" style="font-size:15.5px">${PROFILE.email}</span>`, { state: 'ro', hint: '아이디는 변경할 수 없습니다.' })}
${field('전화번호', o.phoneEmpty ? '' : `<span class="n" style="font-size:15.5px">${PROFILE.phone}</span>`, { req: 1, ph: '010-0000-0000', state: o.phoneEmpty ? 'err' : 'focus' })}
${field('직위', PROFILE.rank, { ph: '예) 주무관' })}
${field('부서', PROFILE.dept, { req: 1, select: 1 })}
</div>
<div style="position:absolute;left:${L.x + L.w + 12}px;top:${TOP}px;width:1px;height:${706 - TOP}px;background:${H}"></div>`;
  const crow = (on, label, sub) => `<div style="display:flex;align-items:center;gap:12px;height:${sub ? 56 : 64}px;white-space:nowrap;${sub ? 'padding-left:30px;' : ''}">${cbox(on)}<span class="chip" style="height:22px;line-height:20px">선택</span><span style="font-size:${sub ? 16 : 17}px;font-weight:${sub ? 400 : 500};letter-spacing:-.01em">${label}</span></div>`;
  const right = `<div style="position:absolute;left:${R.x}px;top:${TOP}px;width:${R.w}px">
${secHead(IC.consent, '정보 이용 동의 설정', '', '', R.w)}
<div style="margin-top:12px;height:1px;background:${INK}"></div>
${crow(true, '홍보를 위한 정보수집 동의')}
<div style="background:${T1};padding:24px 28px 24px">
<div style="font-size:16px;font-weight:500;letter-spacing:-.01em">회원정보 수집 및 이용에 관한 사항</div>
<div style="margin-top:12px;font-size:16px;line-height:32px;color:${INK};word-break:keep-all">
<div style="display:flex;gap:12px"><span class="lab" style="flex:none;width:136px;line-height:32px">수집·이용 목적</span><span>광고 홍보 활동 등을 위한 목적으로만 수집됩니다.</span></div>
<div style="display:flex;gap:12px"><span class="lab" style="flex:none;width:136px;line-height:32px">수집·이용 항목</span><span>휴대전화 번호, 이메일, SMS/이메일 수신 동의</span></div>
<div style="margin-top:6px;color:${G}">선택 항목에 동의하지 않은 경우도 회원가입 및 일반적인 서비스를 이용할 수 있습니다.</div></div></div>
<div style="margin-top:8px">${crow(true, '광고성 정보 SMS 수신 동의', 1)}${crow(false, '광고성 정보 Email 수신 동의', 1)}</div>
<div style="margin-top:6px;height:1px;background:${H}"></div>
<div class="mic" style="margin-top:12px">홍보를 위한 정보수집 동의를 해제하면 SMS · Email 수신 동의도 함께 해제됩니다.</div>
</div>`;
  const bar = `<div style="position:absolute;left:${X0}px;top:722px;width:${CW}px;height:1px;background:${INK}"></div>
<div style="position:absolute;left:${X0}px;top:723px;width:${CW}px;height:64px;display:flex;align-items:center;gap:10px;white-space:nowrap">
<span class="mic">저장하면 마이 페이지로 돌아갑니다.</span><div style="flex:1"></div>${btn2('취소', 112, 44, G)}${btn1('저장', 140, 44)}</div>`;
  return `${rail()}${mast}${h1('회원정보', ' 수정', '회원 정보와 정보 이용 동의 설정을 변경합니다.')}${left}${right}${bar}${foot}`;
}
write('B6-My-Edit', pageEdit());
write('B6-My-Edit-Error', pageEdit({ phoneEmpty: true }) + toast('입력 오류', '전화번호를 입력해 주세요.', true));
write('B6-My-Edit-Saved', pageMain({ dept: '디지털국토정보처' }) + toast('변경 완료', '회원정보가 저장되었습니다.'));

// 비밀번호 변경
{
  const body = (err) => `<div style="display:flex;flex-direction:column;gap:${err ? 14 : 20}px">
${field('현재 비밀번호', err ? '' : dots(9), { req: 1, ph: '현재 사용 중인 비밀번호를 입력하세요', state: err ? 'err' : '', err: err ? '현재 비밀번호를 입력해 주세요.' : '' })}
${field('새 비밀번호', err ? dots(6) : dots(11), { req: 1, ph: '영문·숫자·특수문자 조합 8자 이상', state: err ? 'err' : 'focus', err: err ? '영문·숫자·특수문자를 조합해 8자 이상 입력해 주세요.' : '', hint: '영문·숫자·특수문자 조합 8자 이상' })}
${field('새 비밀번호 확인', err ? dots(8) : '', { req: 1, ph: '새 비밀번호를 다시 입력하세요', state: err ? 'err' : '', err: err ? '새 비밀번호가 일치하지 않습니다.' : '' })}</div>`;
  write('B6-My-Password', pageMain() + modal(520, '비밀번호 변경', body(false), footCS('저장'), { top: 196 }));
  write('B6-My-Password-Error', pageMain() + modal(520, '비밀번호 변경', body(true), footCS('저장'), { top: 176 }));
  write('B6-My-Password-Saved', pageMain() + toast('변경 완료', '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요.'));
}

// 내 디스크 증량 신청 (dataset.html 과 같은 모달)
{
  const body = (o) => {
    const chips = PRESETS.map((p) => { const on = p === o.preset; return `<div style="flex:${p === '직접 입력' ? '1.5' : '1'};height:44px;border:1px solid ${on ? ACC : H};background:${on ? T2 : '#FFFFFF'};color:${on ? ACC : INK};display:flex;align-items:center;justify-content:center;font-size:16px;white-space:nowrap" class="${p === '직접 입력' ? '' : 'n'}">${p}</div>`; }).join('');
    const after = o.value ? STORAGE.total + +o.value : 0;
    const bw = 596, baseW = after ? Math.round(bw * STORAGE.total / after) : bw, usedW = Math.round(baseW * STORAGE.used / STORAGE.total);
    return `<div class="fl">신청 용량 (GB) <span style="color:${ACC}">*</span></div>
<div style="margin-top:8px;display:flex;gap:6px">${chips}</div>
<div class="fi" style="margin-top:10px;border-bottom:${o.capErr ? `2px solid ${INK}` : o.focusCap ? `2px solid ${ACC}` : `1px solid ${INK}`}">${o.value ? `<span class="n" style="font-size:17px">${o.value}</span>` : `<span style="color:${C}">GB 단위로 입력</span>`}${o.focusCap ? caret : ''}<div style="flex:1"></div><span class="mic n">GB</span></div>
${o.capErr ? `<div class="fh" style="color:${WARN}">10GB 이상 10240GB 이하의 용량을 입력해 주세요.</div>` : ''}
<div style="margin-top:14px;position:relative;width:${bw}px;height:42px">
<div style="position:absolute;left:0;top:0;width:${baseW}px;height:12px;border:1px solid ${H}"></div>
<div style="position:absolute;left:0;top:0;width:${usedW}px;height:12px;background:${ACC}"></div>
${after ? `<div style="position:absolute;left:${baseW}px;top:0;width:${bw - baseW}px;height:12px;border:1px dashed ${INK};border-left:0;background:${T1}"></div>` : ''}
<div class="mic n" style="position:absolute;left:0;top:20px;white-space:nowrap;letter-spacing:.01em">현재 ${fmt(STORAGE.used, 1)} / ${fmt(STORAGE.total)} GB</div>
${after ? `<div class="n" style="position:absolute;right:0;top:20px;font-size:14px;line-height:19px;white-space:nowrap;color:${INK}"><span style="font-family:'Pretendard';color:${G}">승인되면 전체</span> ${fmt(after)} GB</div>` : ''}</div>
<div class="fl" style="margin-top:16px">신청 사유 <span style="color:${ACC}">*</span></div>
<div style="margin-top:8px;height:${o.reasonErr ? 96 : 112}px;border:1px solid ${o.reasonErr ? INK : H};${o.reasonErr ? 'border-width:1px 1px 2px;' : ''}padding:12px 14px;font-size:16px;line-height:25px;color:${o.reason ? INK : C};word-break:keep-all">${o.reason || '신청 사유를 입력해 주세요.'}${o.reason ? `<span style="display:inline-block;width:1px;height:18px;background:${INK};vertical-align:-3px;margin-left:2px"></span>` : ''}</div>
${o.reasonErr ? `<div class="fh" style="color:${WARN}">신청 사유를 입력해 주세요.</div>` : ''}`;
  };
  const REASON = '2026년 하반기 정사영상 원본 추가 적재';
  write('B6-My-Storage', pageMain() + modal(660, '내 디스크 증량 신청', body({ preset: '128', value: '128', reason: REASON }), footCS('저장'), { top: 150, tag: demo }));
  write('B6-My-Storage-Error', pageMain() + modal(660, '내 디스크 증량 신청', body({ preset: '직접 입력', value: '', capErr: 1, reasonErr: 1, focusCap: 1 }), footCS('저장'), { top: 150 }));
  const fresh = [{ cap: 128, reason: REASON, at: '2026.06.08 10:24', st: 'pending', note: '검토 중', fresh: true }, ...HISTORY];
  write('B6-My-Storage-Done', `${rail()}${mast}${h1('마이', ' 페이지', '회원 정보 및 내 디스크 사용 현황을 확인하세요')}${identityColumn()}${diskPlate({ hist: fresh, rowH: 50 })}${foot}` + toast('신청 완료', '128GB 증량 신청이 접수되었습니다.'));
  write('B6-My-History-Empty', `${rail()}${mast}${h1('마이', ' 페이지', '회원 정보 및 내 디스크 사용 현황을 확인하세요')}${identityColumn()}${diskPlate({ hist: [] })}${foot}`);
}

// 브랜드 심볼 수정
{
  const NEWW = 44;
  const body = (o) => `<div style="display:flex;gap:28px">
<div style="flex:none;width:236px">
<div class="fl">심볼 이미지 <span style="color:${ACC}">*</span></div>
<div style="margin-top:8px;display:flex;align-items:center;gap:10px">
<div><div style="opacity:${o.file ? .55 : 1}">${railPreview(0, 1.5, { tall: true, on: !o.file })}</div><div class="mic" style="margin-top:6px;text-align:center">${o.file ? '현재' : '현재 · 미리보기'}</div></div>
${o.file ? `<span style="font-size:18px;color:${G};margin-bottom:24px">→</span><div>${railPreview(NEWW, 1.5, { tall: true, on: true })}<div class="mic" style="margin-top:6px;text-align:center;color:${ACC}">미리보기</div></div>` : ''}</div></div>
<div style="flex:1;min-width:0">
<div style="display:flex;align-items:center;gap:14px;white-space:nowrap;margin-top:24px">${btn2(`${svg(IC.up, 15, INK)}파일 업로드`, 136, 44)}<span class="${o.file ? 'n' : ''}" style="font-size:15.5px;color:${o.file ? INK : G};overflow:hidden;text-overflow:ellipsis">${o.file || '선택된 파일 없음'}</span></div>
${o.err ? `<div class="fh" style="color:${WARN};margin-top:10px">PNG 또는 SVG 파일만 업로드할 수 있습니다.</div>` : `<div class="fh" style="margin-top:10px">PNG 또는 SVG 파일을 업로드해 주세요.</div>`}
<div class="fl" style="margin-top:26px;display:flex;align-items:baseline;gap:10px">가로 크기<span class="d" style="font-size:22px;color:${o.file ? ACC : INK};letter-spacing:-.01em">${o.file ? NEWW : SYM_DEFAULT_W}<span class="mic" style="font-family:'Pretendard';font-weight:400"> px</span></span></div>
<div style="margin-top:10px">${widthRuler(o.rw, o.file ? NEWW : SYM_DEFAULT_W, { slider: 1 })}</div>
<div class="fh" style="white-space:normal;word-break:keep-all">사이드바에 표시되는 가로 크기를 최대 50px까지 조정할 수 있습니다.</div>
</div></div>`;
  const footer = `${btn2('초기화', 96, 44, INK)}<span class="mic" style="margin-left:6px">기본 심볼 · 기본 크기</span><div style="flex:1"></div>${btn2('취소', 96, 44, G)}${btn1('저장', 112, 44)}`;
  const sub = '업로드한 이미지가 사이드바 상단 심볼로 교체됩니다.';
  write('B6-My-Brand', pageMain() + modal(720, '브랜드 심볼 수정', body({ file: 'lx_ci_symbol.svg', rw: 392 }), footer, { top: 196, sub, tag: demo }));
  write('B6-My-Brand-Empty', pageMain() + modal(720, '브랜드 심볼 수정', body({ rw: 392 }), footer, { top: 196, sub }));
  write('B6-My-Brand-Error', pageMain() + modal(720, '브랜드 심볼 수정', body({ err: 1, rw: 392 }), footer, { top: 196, sub }));
  write('B6-My-Brand-Applied', pageMain({ sym: NEWW }) + toast('저장 완료', '브랜드 심볼이 적용되었습니다.'));
  write('B6-My-Brand-Reset', pageMain() + modal(720, '브랜드 심볼 수정', body({ rw: 392 }), footer, { top: 196, sub }) + toast('초기화 완료', '기본 심볼로 초기화되었습니다.'));
}

// 계정 탈퇴 확인 — 원본 mypage.html 소스에는 없음(인벤토리 §10 항목만 존재) → 추정 판. B5-Project-Delete 확인 모달 어휘.
write('B6-My-Withdraw', pageMain({ withdraw: 1 }) + modal(480, '계정 탈퇴',
  `<div style="font-size:17px;line-height:26px;word-break:keep-all">“${PROFILE.email}” 계정을 탈퇴할까요?</div>
<div style="margin-top:4px;font-size:16px;line-height:25px;color:${G};word-break:keep-all">탈퇴 후에는 복구할 수 없습니다. 회원정보는 회원탈퇴 시까지 보유·이용됩니다.</div>
<div style="margin-top:18px">${field('현재 비밀번호', '', { req: 1, ph: '현재 사용 중인 비밀번호', state: 'focus' })}</div>`, footCS('탈퇴'), { top: 250, tag: guess }));

// ============================================================ 인증 — B5-Login 카드 가족 (1200×520 · x120 y190)
const authFrame = (filmPct, pane, CH = 520) => { const CT = Math.round((900 - CH) / 2); return `
<img src="ci-landxi.png" alt="LAND-XI PLATFORM" style="position:absolute;left:120px;top:${CT - 80}px;height:22px;width:auto;display:block">
<div style="position:absolute;left:120px;top:${CT - 46}px;width:1200px;font-size:17px;line-height:24px;letter-spacing:-.005em;color:${G}">LAND-XI의 직관적인 인터페이스를 사용하여 NO-CODE 기반의 AI 학습모델을 구축하고 활용할 수 있습니다.</div>
<div style="position:absolute;left:120px;top:${CT}px;width:1200px;height:${CH}px;border:1px solid ${H};display:flex;background:#FFFFFF">
<div style="position:relative;flex:0 0 ${filmPct}%;height:100%;overflow:hidden;background:${INK}"><img src="login-film.jpg" alt="" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${filmPct < 50 ? '42% 50%' : '50% 50%'}"></div>
<div style="position:relative;flex:1;min-width:0;height:100%;padding:24px 40px 0">${pane}</div></div>
<div style="position:absolute;left:120px;top:${CT + CH + 24}px;width:1200px;display:flex;align-items:center;white-space:nowrap">
<img src="ci-lx-lockup.svg" alt="LX 한국국토정보공사" style="display:block;height:18px;width:auto">
<div style="display:flex;gap:8px;align-items:baseline;margin-left:32px"><div class="kb" style="color:${INK}">개인정보처리방침</div><div style="font-size:14px;color:${C}">|</div><div class="kb">이용약관</div><div style="font-size:14px;color:${C}">|</div><div class="kb">이메일무단수집거부</div></div>
<div class="kb n" style="margin-left:auto;letter-spacing:.02em">Copyright© LX. ALL RIGHTS RESERVED.</div></div>`; };
const aTitle = (t, sub) => `<div class="d" style="font-size:34px;line-height:42px;letter-spacing:-.02em;white-space:nowrap">${t}</div>
<div style="margin-top:8px;font-size:16px;line-height:24px;letter-spacing:-.005em;color:${G};word-break:keep-all">${sub}</div>`;
function aField(label, value, o = {}) {
  const st = o.state || '';
  return `<div style="${o.mt != null ? `margin-top:${o.mt}px;` : ''}min-width:0;${o.flex ? 'flex:1;' : ''}">
<div class="al" style="color:${st === 'focus' || st === 'err' ? INK : G}">${label}${o.req ? `<span style="color:${ACC}"> *</span>` : ''}</div>
<div class="ai" style="border-bottom:${st === 'focus' ? `1px solid ${ACC}` : st === 'err' ? `2px solid ${INK}` : `1px solid ${INK}`}">${value ? `<span>${value}</span>` : `<span style="color:${C}">${o.ph || ''}</span>`}${st === 'focus' ? `<div style="width:1px;height:22px;background:${INK};margin-left:2px"></div>` : ''}${o.select ? `<div style="flex:1"></div>${svg(IC.caret, 16, G)}` : ''}</div>
${o.err ? `<div style="margin-top:5px;font-size:14px;line-height:18px;color:${WARN};white-space:nowrap">${o.err}</div>` : o.hint ? `<div style="margin-top:5px;font-size:14px;line-height:18px;color:${G};white-space:nowrap">${o.hint}</div>` : ''}</div>`;
}
const aBtn1 = (label, arrow = true, off = false) => `<div style="flex:1;height:56px;background:${off ? C : INK};display:flex;align-items:center;justify-content:center;gap:8px"><div class="d" style="font-size:20px;color:#FFFFFF;letter-spacing:.02em;white-space:nowrap">${label}</div>${arrow ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="square"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>` : ''}</div>`;
const aBtn2 = (label, flex = 1) => `<div class="d" style="flex:${flex};height:56px;border:1px solid ${INK};display:flex;align-items:center;justify-content:center;font-size:20px;letter-spacing:.02em;white-space:nowrap">${label}</div>`;
const aContact = `<div style="margin-top:14px;display:flex;justify-content:center;align-items:baseline;gap:6px;white-space:nowrap"><div class="kb" style="color:${INK}">문의 <span class="n" style="font-weight:500">063-713-1218</span></div><div class="kb">· 평일 09:00~18:00</div></div>`;
const aLink = (t) => `<div class="al" style="color:${ACC}">${t}</div>`;
const aSep = `<div style="font-size:16px;line-height:22px;color:${C}">|</div>`;

// 아이디 찾기
{
  const pane = (o) => `${aTitle('아이디(이메일) 찾기', '회원가입 시 입력한 이름과 전화번호를 입력해 주세요.')}
${aField('이름', o.name, { mt: o.err ? 30 : 36, ph: '이름을 입력해 주세요.', state: o.err ? 'err' : '', err: o.err ? '이름을 입력해 주세요.' : '' })}
${aField('전화번호', o.phone ? `<span class="n">${o.phone}</span>` : '', { mt: o.err ? 10 : 16, ph: '전화번호를 숫자만 입력해 주세요.', state: o.err ? 'err' : 'focus', err: o.err ? '전화번호를 입력해 주세요.' : '' })}
<div style="margin-top:${o.err ? 20 : 42}px;display:flex;gap:10px">${aBtn1('아이디 찾기')}${aBtn2('비밀번호 찾기')}</div>${aContact}`;
  write('B6-Auth-FindId', authFrame(60, pane({ name: '홍길동', phone: '0106300' })));
  write('B6-Auth-FindId-Error', authFrame(60, pane({ err: 1 })));
}
// 결과 공용
const resultPane = (o) => `
<div style="position:absolute;left:40px;right:40px;top:24px;bottom:32px;display:flex;flex-direction:column">
<div style="display:flex;align-items:center;gap:12px;white-space:nowrap"><span class="d" style="font-size:34px;line-height:42px;letter-spacing:-.02em">${o.kicker}</span><span class="chip">결과</span>${o.tag || ''}</div>
<div style="flex:1;display:flex;flex-direction:column;justify-content:center">
<div style="width:48px;height:48px;border:1px solid ${o.fail ? INK : ACC};display:flex;align-items:center;justify-content:center">${o.fail ? svg(IC.close, 20, INK) : svg(IC.check, 24, ACC)}</div>
<div class="${o.mono ? 'n' : 'd'}" style="margin-top:24px;font-size:${o.mono ? 32 : 31}px;line-height:42px;letter-spacing:${o.mono ? '.01em' : '-.02em'};color:${o.mono ? ACC : INK};word-break:keep-all">${o.lead}</div>
${o.msg ? `<div style="margin-top:12px;font-size:16px;line-height:24px;color:${G};word-break:keep-all">${o.msg}</div>` : ''}
</div>
<div style="display:flex;gap:10px">${o.btns}</div>
${o.links ? `<div style="margin-top:14px;height:22px;display:flex;justify-content:center;align-items:center;gap:8px">${o.links}</div>` : `<div style="height:36px;overflow:hidden">${aContact}</div>`}</div>`;
write('B6-Auth-FindId-Result', authFrame(60, resultPane({ kicker: '아이디(이메일) 찾기', tag: demo, mono: 1, lead: 'mini****@n****.com', msg: '위의 아이디(이메일)로 로그인해 주세요.', btns: aBtn1('로그인 하러 가기') + aBtn2('회원가입', .6), links: aLink('비밀번호 찾기') })));
write('B6-Auth-FindId-Fail', authFrame(60, resultPane({ kicker: '아이디(이메일) 찾기', fail: 1, lead: '입력하신 정보로<br>회원 정보를 찾을 수 없습니다.', btns: aBtn1('다시 시도', false) + aBtn2('회원가입'), links: aLink('로그인') + aSep + aLink('비밀번호 찾기') })));
// 비밀번호 찾기
{
  const pane = (o) => `${aTitle('비밀번호 찾기', '회원가입 시 입력한 이메일 주소로 임시비밀번호가 발급됩니다.')}
${aField('이름', o.name, { mt: o.err ? 30 : 36, ph: '이름을 입력해 주세요.', state: o.err ? 'err' : '', err: o.err ? '이름을 입력해 주세요.' : '' })}
${aField('아이디 (이메일)', o.email ? `<span class="n">${o.email}</span>` : '', { mt: o.err ? 10 : 16, ph: '아이디(이메일)를 입력해 주세요.', state: o.err ? 'err' : 'focus', err: o.err ? '아이디(이메일)를 입력해 주세요.' : '' })}
<div style="margin-top:${o.err ? 20 : 42}px;display:flex;gap:10px">${aBtn1('비밀번호 찾기')}${aBtn2('아이디 찾기')}</div>${aContact}`;
  write('B6-Auth-FindPw', authFrame(60, pane({ name: '홍길동', email: 'hong@lx.or' })));
  write('B6-Auth-FindPw-Error', authFrame(60, pane({ err: 1 })));
}
write('B6-Auth-FindPw-Result', authFrame(60, resultPane({ kicker: '비밀번호 찾기', lead: '비밀번호 재설정 메일이<br>발송되었습니다.', msg: '이메일을 통해 비밀번호를 재설정 한 후 이용해 주세요.', btns: aBtn1('로그인') })));
write('B6-Auth-FindPw-Fail', authFrame(60, resultPane({ kicker: '비밀번호 찾기', fail: 1, lead: '입력하신 정보로<br>회원 정보를 찾을 수 없습니다.', btns: aBtn1('다시 시도', false) + aBtn2('회원가입'), links: aLink('로그인') })));

// 계정 신청 3단계 — 좌 필름 40 % / 우 폼 60 %(720 · 안쪽 640)
{
  const STEPS = ['약관 동의', '정보 입력', '완료'];
  const head = (cur) => `<div style="display:flex;align-items:flex-end;white-space:nowrap">
<div class="d" style="font-size:34px;line-height:42px;letter-spacing:-.02em">계정 신청</div><div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:10px;padding-bottom:6px">${STEPS.map((s, i) => {
    const on = i + 1 === cur, done = i + 1 < cur;
    return `${i ? `<div style="width:28px;height:1px;background:${done || on ? INK : C}"></div>` : ''}<div style="display:flex;align-items:center;gap:6px;padding-bottom:4px;border-bottom:2px solid ${on ? ACC : 'transparent'}"><span class="n" style="font-size:14px;color:${on ? ACC : done ? INK : C}">0${i + 1}</span><span class="al" style="font-size:15px;color:${on ? INK : done ? INK : C}">${s}</span>${done ? svg(IC.check, 13, INK) : ''}</div>`;
  }).join('')}</div></div>
<div style="margin-top:6px;font-size:16px;line-height:24px;color:${G}">Land-XI Platform 이용을 위해 아래 절차를 진행해 주세요.</div>`;
  const actions = (prev, next, off, arrow = true) => `<div style="position:absolute;left:40px;right:40px;bottom:28px;display:flex;gap:10px">${prev ? aBtn2(prev, .5) : ''}${aBtn1(next, arrow, off)}</div>`;

  // 1단계 — 좌 동의 목록(선택한 약관 = 틴트) / 우 약관 전문 뷰어
  const step1 = (ck) => {
    const row = (on, tag, label, o = {}) => `<div style="position:relative;height:${o.sub ? 46 : 54}px;display:flex;align-items:center;gap:10px;white-space:nowrap;padding:0 10px 0 ${o.sub ? 38 : 10}px;${o.sel ? `background:${T1};` : ''}${o.top ? '' : `border-bottom:1px solid ${H};`}">
${o.sel ? `<div style="position:absolute;left:0;top:0;width:3px;height:100%;background:${ACC}"></div>` : ''}${cbox(on)}${tag ? `<span style="font-size:14px;font-weight:500;color:${tag === '[필수]' ? ACC : G}">${tag}</span>` : ''}<span style="font-size:${o.sub ? 15 : 15.5}px;letter-spacing:-.02em;${o.bold ? 'font-weight:500;' : ''}">${label}</span><div style="flex:1"></div>${o.view ? `<span style="font-size:16px;color:${o.sel ? ACC : C}">›</span>` : ''}</div>`;
    return `${head(1)}
<div style="margin-top:20px;display:flex;gap:20px;height:366px">
<div style="flex:none;width:318px">
<div style="border-top:1px solid ${INK};border-bottom:1px solid ${INK}">${row(ck.all, '', '전체 약관에 동의합니다', { bold: 1, top: 1 })}</div>
${row(ck.terms, '[필수]', '이용약관 동의', { view: 1, sel: 1 })}
${row(ck.privacy, '[필수]', '개인정보 처리방침 동의', { view: 1 })}
${row(ck.marketing, '[선택]', '마케팅 정보 수집 및 활용 동의', { view: 1 })}
${row(ck.sms, '[선택]', '광고성 정보 SMS 수신 동의', { sub: 1 })}
${row(ck.email, '[선택]', '광고성 정보 Email 수신 동의', { sub: 1 })}
</div>
<div style="flex:1;min-width:0;position:relative;border:1px solid ${H};padding:14px 22px 0 18px;overflow:hidden">
<div style="display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span class="al" style="color:${INK}">이용약관</span><span class="mic">제1조 – 제20조</span></div>
<div style="margin-top:10px;font-size:14.5px;font-weight:500;line-height:22px">제1조 목적</div>
<div style="font-size:14.5px;line-height:23px;color:${G};word-break:keep-all">본 약관은 LX한국국토정보공사(이하 '운영기관'이라 한다)에서 운영하는 Land-XI Platform 서비스를 이용함에 있어 이용조건 및 절차, 운영기관과 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.</div>
<div style="margin-top:10px;font-size:14.5px;font-weight:500;line-height:22px">제2조 용어의 정의</div>
<div style="font-size:14.5px;line-height:23px;color:${G};word-break:keep-all">본 약관에서 사용하는 용어의 정의는 다음과 같습니다. 본 약관에서 정의하지 않은 것은 관련 법령 및 서비스별 안내에서 정하는 바에 따르며, 그 외에는 일반 관례에 따른다.</div>
<div style="position:absolute;right:6px;top:8px;width:3px;height:348px;background:${H}"></div><div style="position:absolute;right:6px;top:8px;width:3px;height:44px;background:${G}"></div>
</div></div>
${actions('이전', '다음', !(ck.terms && ck.privacy))}`;
  };
  write('B6-Auth-Signup-1', authFrame(40, step1({ terms: 1, privacy: 1 }), 600));
  write('B6-Auth-Signup-1-Init', authFrame(40, step1({}), 600));

  // 2단계 — 7필드 2열
  const step2 = (e) => `${head(2)}
<div style="margin-top:18px;display:grid;grid-template-columns:1fr 1fr;column-gap:28px;row-gap:8px;grid-auto-rows:92px">
<div style="grid-column:1 / 3">${e
    ? aField('아이디 (이메일)', '<span class="n">hong@lx</span>', { req: 1, state: 'err', err: '올바른 이메일 형식을 입력해 주세요.' })
    : aField('아이디 (이메일)', '<span class="n">hong@lx.or.kr</span>', { req: 1, hint: '업무용 이메일을 입력하세요. 로그인 아이디로 사용됩니다.' })}</div>
${e ? aField('비밀번호', dots(6), { req: 1, state: 'err', err: '영문·숫자·특수문자를 조합해 8자 이상' }) : aField('비밀번호', dots(10), { req: 1, hint: '영문·숫자·특수문자를 조합해 8자 이상' })}
${e ? aField('비밀번호 확인', dots(8), { req: 1, state: 'err', err: '비밀번호가 일치하지 않습니다.' }) : aField('비밀번호 확인', dots(10), { req: 1, hint: '비밀번호를 한 번 더 입력하세요.' })}
${e ? aField('이름', '', { req: 1, ph: '예) 홍길동', state: 'err', err: '이름을 입력해 주세요.' }) : aField('이름', '홍길동', { req: 1, hint: '실명을 입력해 주세요.' })}
${e ? aField('연락처', '', { req: 1, ph: '010-0000-0000', state: 'err', err: '연락처를 입력해 주세요.' }) : aField('연락처', '', { req: 1, ph: '010-0000-0000', state: 'focus', hint: '승인 결과 안내용' })}
${e ? aField('소속 부서', '', { req: 1, ph: '선택하세요', select: 1, state: 'err' }) : aField('소속 부서', '', { req: 1, ph: '선택하세요', select: 1 })}
${e ? aField('직위', '', { req: 1, ph: '예) 주무관', state: 'err' }) : aField('직위', '', { req: 1, ph: '예) 주무관' })}
</div>
${actions('이전', '신청 완료', false, false)}`;
  write('B6-Auth-Signup-2', authFrame(40, step2(false), 600));
  write('B6-Auth-Signup-2-Error', authFrame(40, step2(true), 600));

  // 3단계 — 접수 완료
  const step3 = `${head(3)}
<div style="margin-top:40px;display:flex;gap:20px;align-items:flex-start">
<div style="flex:none;width:44px;height:44px;border:1px solid ${ACC};display:flex;align-items:center;justify-content:center">${svg(IC.check, 22, ACC)}</div>
<div><div class="d" style="font-size:28px;line-height:36px;letter-spacing:-.02em;white-space:nowrap">계정 신청이 접수되었습니다</div>
<div style="margin-top:8px;font-size:16px;line-height:25px;color:${G};word-break:keep-all"><span style="color:${INK};font-weight:500">홍길동</span> 님의 계정 신청이 정상적으로 접수되었습니다.<br>도로관리과 담당자가 확인 후 영업일 기준 <span style="color:${INK};font-weight:500">1–2일</span> 내 승인 결과를 이메일로 안내드립니다.</div></div></div>
<div style="margin-top:36px;border-top:1px solid ${INK}">
${[['신청 아이디', '<span class="n">hong@lx.or.kr</span>'], ['소속', '도로관리과 · 주무관'], ['문의', '도로관리과 <span class="n">063-713-1218</span> (평일 09:00~18:00)']].map(([k, v]) => `<div style="height:56px;border-bottom:1px solid ${H};display:flex;align-items:center;white-space:nowrap"><span class="kb" style="width:120px">${k}</span><span style="font-size:16px;letter-spacing:-.01em">${v}</span></div>`).join('')}
</div>
<div style="margin-top:10px">${demo}</div>
${actions('', '로그인 페이지로')}`;
  write('B6-Auth-Signup-3', authFrame(40, step3, 600));
}

console.log('wrote', NAMES.length, 'artboards');
console.log(NAMES.join(' '));
