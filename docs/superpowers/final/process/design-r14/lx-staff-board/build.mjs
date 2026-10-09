/* 설계 14차 · LX 직원 대시보드(단계별 진행 현황) · 내 정보 저장 용량 · LX 관리자 계정별 할당 — 정적 시안 만들기.
   v3 셸 마크업(마스트 · 왼쪽 메뉴)은 10-09 로그인 폼으로 연 화면의 것을 그대로 두고, 판만 새로 짠다. v3 kit.css · console.css · me.css · accounts.css 를 그대로 읽는다.
   숫자 = 10-09 10:37 서버 응답(values-projects.json · README §5). 서버에 없는 것(기본 할당 50 GB · 늘리기 요청 1건 · 예시 배치)은 '예시' 표.
   사용: node build.mjs → 이 폴더(docs) 와 landxi/proto/review/lx-staff-board/ 두 곳에 같은 화면(경로만 다름). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const OUTS = [
  { dir: HERE, v3: '../../../../../../landxi/v3', assets: '../../../../../../landxi/assets' },
  { dir: path.join(ROOT, 'landxi/proto/review/lx-staff-board'), v3: '../../../v3', assets: '../../../assets' },
];

/* ── 서버 값(10-09 10:37) ── */
const P = JSON.parse(fs.readFileSync(path.join(HERE, 'values-projects.json'), 'utf8')).items;
const STORAGE = { used: 29813134, quota: 50, projects: [['비닐하우스 2026', 10205570], ['주차장 2026', 9003774], ['건축물 2026', 8693572], ['곤포사일리지 2026', 1910218]] };
const JOBS = { done: 402, failed: 3, cancelled: 36, running: 0, first: '9.26', last: '10.8', kinds: [['AI 분석', 276], ['결과 갱신', 108], ['위성 지수', 28], ['학습', 21], ['필지 연결', 6], ['영상 준비', 2]] };
const INBOX = { review: 0, request: 0, approval: 0 };
const USERS = [
  ['LX 직원', 'test@lx.or.kr', 'LX 직원', 29813134, 4],
  ['김도윤', 'lx-staff', 'LX 직원', 0, 0],
  ['LX 관리자', 'lxadmin@lx.or.kr', 'LX 관리자', 0, 0],
  ['박서연', 'lx-admin', 'LX 관리자', 0, 0],
  ['LX 관리자', 'lxadmin', 'LX 관리자', 0, 0],
  ['LX 영업', 'sales@lx.or.kr', 'LX 영업', 0, 0],
];
/* 예시 — 늘리기 요청 한 건(서버 0건 · 승인 흐름을 보이기 위한 자리) */
const REQ = { who: 'LX 직원', login: 'test@lx.or.kr', from: 50, want: 100, why: '2차 학습데이터 추가', at: '10.9 09:40', used: 29813134 };

/* ── 공통 ── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 0 ? `${(b / 1e3).toFixed(1)} KB` : '0 MB');
const pct = (used, gb) => { const p = (used / (gb * 1e9)) * 100; return p < 0.1 && used > 0 ? '0.1' : p.toFixed(p < 10 ? 1 : 0); };
const bar = (w, warn = false) => `<div class="k-me-bar${warn ? ' is-warn' : ''}" role="img" aria-label="할당의 ${w}% 사용"><i style="width:${Math.max(w > 0 ? 1 : 0, Math.min(100, w))}%"></i></div>`;
const head = (title, sub, more, extra = '') => `<div class="ld-h"><h2>${title}${sub ? `<small class="ld-sub">${sub}</small>` : ''}${extra}</h2>${more || ''}</div>`;
const cell = (v, label, cls = '') => `<div class="ld-cell ${cls}"><b class="num">${fmt(v)}</b><span>${label}</span></div>`;
const EX = '<span class="sb-ex">예시</span>';

/* ── 셸(마스트 · 왼쪽 메뉴) — v3 셸 마크업 그대로 · 직원 메뉴 첫 칸 '홈' → '대시보드'(이 시안의 ①) ── */
const I = {
  home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>', folder: '<path d="M3 5h5l2 2h7v9H3z"/>',
  scan: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
  card: '<path d="M3 4h14v12H3z M3 8h14"/>', data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>', menu: '<path d="M3 5h14 M3 10h14 M3 15h14"/>',
  map: '<path d="M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11"/>', gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2 M4.7 4.7l1.4 1.4 M13.9 13.9l1.4 1.4 M4.7 15.3l1.4-1.4 M13.9 6.1l1.4-1.4"/>',
  org: '<path d="M3 17V7l7-4 7 4v10 M8 17v-5h4v5"/>', deploy: '<path d="M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4"/>', list: '<path d="M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01"/>', check: '<path d="M4 10.5l4 4 8-9"/>',
};
const ico = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${I[k]}</svg>`;
const STAFF = [['home', '대시보드', 'lx-console/'], ['folder', '프로젝트', 'lx-project/'], ['scan', '분석하기', 'lx-analyze/'], ['card', '서비스 카드', 'lx-cards/', 1], ['data', '데이터', 'lx-ingest/', 1], ['inbox', '요청함', 'lx-inbox/']];
const ADMIN = [['map', '현황', 'ops-core/'], ['gear', '인프라', 'ops-infra/'], ['org', '기관', 'ops-infra/?view=tenants'], ['deploy', '배포', 'ops-infra/?view=deploys'], ['inbox', '결재', 'ops-core/#approvals'], ['list', '검토 요청', 'lx-inbox/'], ['check', '계정 관리', 'ops-accounts/']];
const rail = (items, cur, v3) => items.map(([ic, label, href, more], i) =>
  `<a class="k-rail-i${more ? ' k-rail-i--more' : ''}" href="${v3}/${href}" data-i="${i}"${i === cur ? ' aria-current="true"' : ''}>${ico(ic)}<span>${label}</span></a>`).join('')
  + `<button type="button" class="k-rail-i k-rail-more" aria-haspopup="dialog">${ico('menu')}<span>메뉴</span></button>`;

function shell({ title, home, role, items, cur, v3, assets, css, body, desc, cls = '' }) {
  return `<!doctype html>
<html lang="ko"${cls ? ` class="${cls}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>[시안] ${title} · Land-XI</title>
<meta name="description" content="설계 14차 시안 — ${desc}">
<link rel="icon" href="${assets}/images/favicon_landxi.png">
<link rel="stylesheet" href="${v3}/kit/kit.css">
${css.map((c) => `<link rel="stylesheet" href="${c}">`).join('\n')}
<link rel="stylesheet" href="board.css">
<script>(function(){var q=new URLSearchParams(location.search);if(q.get('v'))document.documentElement.dataset.v=q.get('v');})();</script>
</head>
<body class="t k-shelled">
<div class="k-app has-rail has-more is-staff">
<header class="t-mast k-mast"><a class="k-word" href="${v3}/${items[0][2]}"><span class="word">LAND-XI</span><span class="home">${home}</span></a><span class="sp"></span><span class="k-mast-slot"></span><span class="t-fresh k-fresh k-sig" tabindex="0" data-live="1" aria-label="마지막 갱신 10:37" data-why="마지막 갱신 10:37"><i></i><span class="num">10:37</span></span><button class="t-role k-role k-me-b" type="button" title="내 정보" aria-haspopup="dialog">${role}</button><a class="k-mast-b k-xi" href="${v3}/xi-clean/">XI맵</a><button class="k-mast-b k-help" type="button" aria-label="도움말">?</button><button class="k-mast-b k-exit" type="button">나가기</button></header>
<nav class="t-rail k-rail" aria-label="메뉴">${rail(items, cur, v3)}</nav>
<main class="k-main" id="main">
${body}
</main>
</div>
<div class="k-chat-root" style="--k-chat-r:24px;--k-chat-b:24px"><span class="k-chat-tag" aria-hidden="true">XI ChatGEO</span><button class="k-chat-fab" type="button" aria-label="XI ChatGEO 열기"><span class="k-chat-face k-chat-face--fab" data-face="idle"><img src="${assets}/brand/vector/lx-lockup.svg" alt="" decoding="async" draggable="false" class="k-chat-face-i" data-crop="" style="aspect-ratio:2.12137/1"></span></button></div>
</body>
</html>
`;
}

/* ── ① 대시보드 — 프로젝트 진행 현황(네 칸) + 저장 용량 · 내가 돌린 작업 · 요청함 · 공지 ── */
const COLS = [['ingest', '데이터 올리기'], ['ai', 'AI 분석'], ['review', '결과 확인'], ['publish', '서비스 공개']];
const COL_OF = { ingest: 'ingest', label: 'ai', train: 'ai', review: 'review', publish: 'publish', ops: 'publish' };
const regionOf = (p) => (p.regions.length ? p.regions[0].name + (p.regions.length > 1 ? ` 외 ${p.regions.length - 1}곳` : '') : '지역 없음');
/* 카드 — 이름 · 지금(단계 안 상태) · 지역 · 서비스 · 담당 · 마감 · 남은 것 한 줄 */
function pcard(p, { now, kick, kind = 'warn', due = null }) {
  const m = [['지역', regionOf(p)], ['서비스', p.task || '—'], ['담당', p.lead?.name || '—'], ['마감', due]];
  return `<a class="sb-pc" href="#" aria-label="${esc(p.name)} · ${esc(regionOf(p))} · ${esc(now)}${kick ? ` · ${esc(kick)}` : ''}">
<span class="sb-pc-t"><b>${esc(p.name)}</b><span class="sb-pc-now">${esc(now)}</span></span>
<dl class="sb-pc-m">${m.map(([k, v]) => `<dt>${k}</dt><dd${v ? '' : ' class="is-none"'}>${esc(v || '미정')}</dd>`).join('')}</dl>
${kick ? `<p class="sb-pc-k" data-kind="${kind}">${esc(kick)}</p>` : ''}</a>`;
}
/* 서버 그대로 — 넷 모두 서비스 공개(서비스 관리 · 시범) · 결과 확인 0/20 이 남아 있음 */
const REAL = P.map((p) => ({ col: COL_OF[p.stage.key], p, now: p.stage.label + (p.next?.text ? ` · ${p.next.text}` : ''), kick: p.blocked?.[0] ? `${p.blocked[0].text} 남음` : '', kind: p.blocked?.[0]?.kind === 'before' ? 'warn' : 'wait' }));
/* 예시 배치 — 같은 네 프로젝트를 네 칸에 하나씩(모양을 보기 위한 자리 · 서버 값 아님) */
const byName = (n) => P.find((p) => p.name === n);
const EXAMPLE = [
  { col: 'ingest', p: byName('곤포사일리지 2026'), now: '영상 등록', kick: '영상 없는 지역 1곳', kind: 'warn' },
  { col: 'ai', p: byName('주차장 2026'), now: '학습 중', kick: '학습 2시간째 · 끝나면 알림', kind: 'wait' },
  { col: 'review', p: byName('건축물 2026'), now: '표본 확인', kick: '결과 확인 0/20 남음', kind: 'warn' },
  { col: 'publish', p: byName('비닐하우스 2026'), now: '서비스 관리 · 시범 3곳', kick: '기관 신고 없음', kind: 'ok' },
];
function board(list, ex = false) {
  const cols = COLS.map(([key, label]) => {
    const here = list.filter((x) => x.col === key);
    return `<div class="sb-col" data-n="${here.length}"><div class="sb-col-h"><b class="num">${here.length}</b><span>${label}</span></div>
${here.length ? here.slice(0, 2).map((x) => pcard(x.p, x)).join('\n') + (here.length > 2 ? `<a class="sb-more" href="#">외 ${here.length - 2}개</a>` : '') : '<p class="sb-none">머무는 프로젝트 없음</p>'}</div>`;   // 칸마다 카드 둘까지 · 나머지는 '외 n개'(프로젝트 목록으로)
  }).join('\n');
  return `<section class="t-card ld-card sb-board" aria-label="프로젝트 진행 현황">
${head('프로젝트 진행 현황', `진행 중 ${P.length} · 내가 맡은 ${P.filter((p) => p.lead_is_me).length}`, '<a class="ld-more" href="#">전체 보기</a>', ex ? ' <span class="sb-ex">예시 배치 — 모양을 보기 위한 자리</span>' : '')}
<div class="sb-cols">${cols}</div>
<div class="sb-foot"><p><span>칸 = 프로젝트가 지금 머무는 단계.</span> <span>카드를 누르면 그 단계 화면으로 갑니다.</span></p><button class="ld-new" type="button">새 프로젝트</button></div>
</section>`;
}
function storeCard(ex = false) {
  const used = ex ? 46.2e9 : STORAGE.used, q = STORAGE.quota;
  const p = ex ? '92' : pct(used, q);
  const warn = ex;
  return `<section class="t-card ld-card sb-store" aria-label="저장 용량">${head('저장 용량', `할당 ${q} GB`, '<a class="ld-more" href="my.html">내 정보</a>')}
<div class="sb-store-b${warn ? ' is-warn' : ''}"><p class="k-me-big"><b class="num">${size(used).split(' ')[0]}</b><span>${size(used).split(' ')[1]}</span><small>할당의 ${p}%</small></p>
${bar(Number(p), warn)}
<p class="sb-store-s"><span>프로젝트 ${STORAGE.projects.length}개의 학습데이터 · 올린 파일.</span> <span>기본 할당 ${q} GB${ex ? '' : ' — LX 관리자가 정함'}</span></p>
${warn ? `<p class="sb-store-w"><span>할당의 ${p}%를 썼습니다.</span> <span>꽉 차기 전에 늘리기 요청을 보내 주세요</span></p>` : ''}
<div class="sb-store-a"><button class="k-me-ask" type="button">용량 늘리기 요청</button></div></div></section>`;
}
const jobsCard = () => `<section class="t-card ld-card sb-jobs" aria-label="내가 돌린 작업">${head('내가 돌린 작업', `${JOBS.first} – ${JOBS.last}`)}
<div class="sb-cells2">${cell(JOBS.done, '끝남')}${cell(JOBS.failed, '실패', JOBS.failed ? 'is-warn' : 'is-zero')}${cell(JOBS.cancelled, '취소')}${cell(JOBS.running, '지금 도는 것', JOBS.running ? '' : 'is-zero')}</div>
<p class="sb-kinds"><span class="sb-k">종류별</span>${JOBS.kinds.slice(0, 4).map(([k, n]) => `<span>${k} <b class="num">${fmt(n)}</b></span>`).join('')}</p></section>`;
const inboxCard = () => `<section class="t-card ld-card sb-inbox" aria-label="요청함">${head('요청함', '', '<a class="ld-more" href="#">전체</a>')}
<div class="ld-cells">${cell(INBOX.review, '검토 요청', INBOX.review ? '' : 'is-zero')}${cell(INBOX.request, '분석 요청', INBOX.request ? '' : 'is-zero')}${cell(INBOX.approval, '내 결재', INBOX.approval ? '' : 'is-zero')}</div>
<p class="sb-inbox-s">기관이 나를 기다리는 것 · 왼쪽 메뉴 숫자와 같습니다</p></section>`;
const noticeCard = () => `<section class="t-card ld-card sb-notice" aria-label="공지">${head('공지')}
<p class="sb-ntc-none">새 공지가 없습니다</p>
<p class="sb-ntc-s">LX 관리자가 올린 공지가 최근 순으로 보입니다</p></section>`;

function dashboard(o, ex = false) {
  const body = `<div class="sb"><div class="sb-in">
${board(ex ? EXAMPLE : REAL, ex)}
<div class="sb-row">${storeCard(ex)}${jobsCard()}${inboxCard()}${noticeCard()}</div>
</div></div>`;
  return shell({ title: 'LX 직원 대시보드', home: 'LX 직원 대시보드', role: 'LX 직원', items: STAFF, cur: 0, v3: o.v3, assets: o.assets,
    css: [`${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`], body, desc: `LX 직원 대시보드 — 프로젝트 진행 현황 네 칸 · 저장 용량 · 내가 돌린 작업 · 요청함 · 공지${ex ? ' (예시 배치)' : ''}` });
}

/* ── ② 내 정보 창 — 왼쪽 내 정보 · 오른쪽 저장 용량(할당 50 GB · 막대 · 프로젝트별) · 늘리기 요청(펼친 상태) · 요청 이력 ── */
function my(o) {
  const used = STORAGE.used, q = STORAGE.quota, p = pct(used, q);
  const bars = STORAGE.projects.map(([n, b]) => `<li><span class="k-me-pn">${n}</span><span class="k-me-bar" role="img" aria-label="전체의 ${Math.round((b / used) * 100)}%"><i style="width:${Math.max(1, Math.round((b / used) * 100))}%"></i></span><span class="k-me-pv num">${size(b)}</span></li>`).join('');
  const modal = `<div class="k-md-bg is-open"><div class="k-md k-me-md k-me-wide" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="k-md-t1">
<div class="k-md-h"><h2 class="k-md-t" id="k-md-t1">내 정보</h2><button class="k-md-x" type="button" aria-label="닫기"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"></path></svg></button></div>
<div class="k-md-b"><div class="k-me-two">
<div class="k-me">
<div class="k-me-f"><span class="k-me-l">아이디</span><p class="k-me-ro" title="아이디(메일)는 바꿀 수 없습니다">test@lx.or.kr</p></div>
<label class="k-me-f"><span class="k-me-l">이름</span><input class="t-input" type="text" value="LX 직원"></label>
<div class="k-me-f"><span class="k-me-l">부서</span><input class="t-input" type="text" value="" placeholder="부서 이름 일부를 적으면 찾습니다" aria-label="부서"></div>
<label class="k-me-f"><span class="k-me-l">연락처<small>선택</small></span><input class="t-input" type="text" value="" placeholder="내선 또는 휴대전화"></label>
<p class="k-me-say"><span>관리자 승인 없이 바로 바뀌고,</span> <span>바꾼 기록이 남습니다</span><br>마지막 바꿈 없음</p>
<div class="k-me-act"><button class="t-btn" type="button" disabled>저장</button><button class="t-btn t-btn--text k-me-x" type="button">취소</button></div>
</div>
<div class="k-me-r">
<div class="k-me-st"><div class="k-me-sth"><p class="k-me-l">저장 용량</p><span class="k-me-tag">기본 할당 ${q} GB</span></div>
<p class="k-me-big"><b class="num">${size(used).split(' ')[0]}</b><span>${size(used).split(' ')[1]}</span><small>할당 ${q} GB 중 · ${p}%</small></p>
${bar(Number(p))}
<ul class="k-me-bars">${bars}</ul>
<p class="k-me-sub">내가 프로젝트장인 프로젝트 ${STORAGE.projects.length}개의 학습데이터 · 올린 파일</p>
<div class="sb-req"><p class="k-me-l">저장 용량 늘리기 요청</p>
<div class="sb-req-two"><label class="k-me-f"><span class="k-me-l">원하는 할당</span><span class="k-me-gb"><input class="t-input" type="number" value="100" min="${q}" step="1" aria-label="원하는 할당(GB)"><i>GB</i></span></label>
<label class="k-me-f"><span class="k-me-l">이유 한 줄</span><input class="t-input" type="text" value="2차 학습데이터 추가" maxlength="120"></label></div>
<p class="k-me-say"><span>LX 관리자가 승인하면 할당이 늘고,</span> <span>승인 · 반려를 알림으로 받습니다</span></p>
<div class="k-me-act"><button class="t-btn" type="button">요청 보내기</button><button class="t-btn t-btn--text k-me-x" type="button">취소</button></div></div>
</div>
<div class="k-me-st"><div class="k-me-sth"><p class="k-me-l">늘리기 요청 이력</p></div>
<p class="k-me-big is-zero"><b class="num">0</b><small>보낸 요청 · 대기 0</small></p>
<p class="sb-me-none">보낸 요청이 없습니다</p>
<p class="k-me-sub">보낸 요청의 승인 · 반려가 여기 쌓입니다</p></div>
</div></div></div></div></div>`;
  const body = `<div class="sb"><div class="sb-in">${board(REAL)}<div class="sb-row">${storeCard()}${jobsCard()}${inboxCard()}${noticeCard()}</div></div></div>${modal}`;
  return shell({ title: '내 정보 — 저장 용량', home: 'LX 직원 대시보드', role: 'LX 직원', items: STAFF, cur: 0, v3: o.v3, assets: o.assets, cls: 'k-md-open',
    css: [`${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`, `${o.v3}/kit/modal.css`], body, desc: '내 정보 창 — 저장 용량(할당 50 GB · 프로젝트별) · 늘리기 요청 · 요청 이력' });
}

/* ── ③ LX 관리자 · 계정 화면 '저장 용량' 탭 — 기본 할당 · 늘리기 요청(승인 · 반려) · 계정별 할당 ── */
function admin(o) {
  const q = STORAGE.quota;
  const tabs = [['가입 신청', 0], ['비밀번호 재설정', 0], ['저장 용량', 1, true], ['계정', 0], ['부서', 0], ['로그인 실패', 0], ['처리 기록', 0]];
  const tabHtml = tabs.map(([t, n, on]) => `<button class="acc-tab" type="button" role="tab" aria-selected="${on ? 'true' : 'false'}">${t}<span class="acc-n"${n ? '' : ' hidden'}>${n}</span></button>`).join('');
  const rows = USERS.map(([name, login, role, used, nproj]) => {
    const p = used ? pct(used, q) : '0';
    const pending = login === REQ.login;
    return `<tr${pending ? ' class="is-on"' : ''}><td class="nw"><b class="acc-b">${name}</b></td><td><span class="acc-m">${login}</span></td><td class="nw">${role}</td>
<td class="num nw">${nproj}</td><td class="num nw">${size(used)}</td>
<td><div class="sb-q"><div class="sb-q-t"><span>${q} GB</span><small>${p}%</small></div>${bar(Number(p))}</div></td>
<td><span class="sb-own">기본 할당</span></td>
<td>${pending ? `<span class="sb-ask">늘리기 요청 ${REQ.want} GB</span>` : `<span class="sb-gb"><input class="t-input" type="number" placeholder="${q}" aria-label="${name} 할당(GB)"><i>GB</i></span>`}</td></tr>`;
  }).join('');
  const body = `<div class="acc"><div class="acc-w sb-acc">
<h1 class="acc-h">계정</h1>
<div class="acc-tabs" role="tablist">${tabHtml}</div>
<div class="sb-adm">
<div class="sb-adm-l">
<div class="sb-set"><p class="sb-set-l">기본 할당</p><p class="sb-set-v"><b class="num">${q}</b><span>GB</span></p><p class="sb-set-s"><span>따로 정하지 않은 LX 계정 ${USERS.length}명에게 적용됩니다.</span> <span>사람마다 다른 값은 아래 표에서 정합니다</span></p><button class="t-btn t-btn--2" type="button">기본 할당 바꾸기</button></div>
<div class="sb-tbl">${head('계정별 할당', `LX 계정 ${USERS.length} · 늘리기 요청 1`)}
<div class="k-table-w"><table class="k-table"><thead><tr><th>이름</th><th>아이디</th><th>역할</th><th class="num">프로젝트</th><th class="num">쓴 양</th><th>할당 · 사용</th><th>정한 값</th><th>할당 바꾸기</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="k-me-sub" style="margin-top:12px">빈 칸이면 기본 할당을 따르고, 값을 적으면 그 사람만 따로 정합니다. 넘어도 막지 않고 알립니다.</p></div>
</div>
<aside class="sb-dr" aria-label="늘리기 요청 한 건">
<h3>늘리기 요청 ${EX}</h3>
<dl class="acc-dl"><dt>누가</dt><dd>${REQ.who} · ${REQ.login}</dd><dt>언제</dt><dd>${REQ.at}</dd><dt>이유</dt><dd>${REQ.why}</dd><dt>쓴 양</dt><dd>${size(REQ.used)} · 할당의 ${pct(REQ.used, REQ.from)}%</dd></dl>
<p class="sb-dr-big"><b class="num">${REQ.from}</b><span>GB</span><i>→</i><b class="num">${REQ.want}</b><span>GB</span></p>
<p class="sb-dr-after"><span>승인하면 이 사람만 ${REQ.want} GB 로 정해지고,</span> <span>요청한 사람에게 알림이 갑니다</span></p>
<div class="acc-do"><input class="t-input acc-reason" type="text" placeholder="반려 사유(반려할 때만)" aria-label="사유"><div class="acc-acts"><button class="t-btn t-btn--2" type="button">반려</button><button class="t-btn" type="button">승인</button></div></div>
</aside>
</div></div></div>`;
  return shell({ title: 'LX 관리자 — 계정별 저장 용량', home: 'LX 관리자 대시보드', role: 'LX 관리자', items: ADMIN, cur: 6, v3: o.v3, assets: o.assets,
    css: [`${o.v3}/ops-accounts/accounts.css`, `${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`], body, desc: 'LX 관리자 계정 화면 저장 용량 탭 — 기본 할당 · 계정별 할당 · 늘리기 요청 승인 · 반려' });
}

for (const o of OUTS) {
  fs.mkdirSync(o.dir, { recursive: true });
  fs.writeFileSync(path.join(o.dir, 'dashboard.html'), dashboard(o));
  fs.writeFileSync(path.join(o.dir, 'dashboard-ex.html'), dashboard(o, true));
  fs.writeFileSync(path.join(o.dir, 'my.html'), my(o));
  fs.writeFileSync(path.join(o.dir, 'admin.html'), admin(o));
  if (o.dir !== HERE) fs.copyFileSync(path.join(HERE, 'board.css'), path.join(o.dir, 'board.css'));
  console.log('wrote', o.dir);
}
