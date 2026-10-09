/* 설계 14차 · LX 직원 대시보드(단계별 진행 현황) · 내 정보 저장 용량 · LX 관리자 계정별 할당 — 정적 시안 만들기.
   v3 셸 마크업(마스트 · 왼쪽 메뉴)은 10-09 로그인 폼으로 연 화면의 것을 그대로 두고, 판만 새로 짠다. v3 kit.css · console.css · me.css · accounts.css 를 그대로 읽는다.
   숫자 = 10-09 10:37 서버 응답(values-projects.json · README §5). 서버에 없는 것(기본 할당 50 GB · 증량 신청 1건 · 예시 배치)은 '예시' 표.
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
/* 예시 — 증량 신청 한 건(서버 0건 · 승인 흐름을 보이기 위한 자리) */
const REQ = { who: 'LX 직원', login: 'test@lx.or.kr', from: 50, want: 100, why: '2차 학습데이터 추가', at: '10.9 09:40', used: 29813134 };
/* 저장 서버 실측(10-09 10:57 · 자료 보관 드라이브 E · OS 값) · 할당 합계 = 기본 50 GB × LX 계정 6(예시) */
const DISK = { total: 8002e9, used: 6028e9, free: 1973e9 };
/* 프로젝트 그림 — 비닐하우스는 서버 결과 장면(카드 한 벌의 장면 그대로) · 나머지는 그 프로젝트의 학습 표본(라벨 그린 그림 · 서버 미리보기) */
const PIC = { '비닐하우스 2026': ['greenhouse-scene.jpg', '결과 장면 · 남원시'], '주차장 2026': ['smp_969c41cca0-0.jpg', '학습 표본 · 주차장 170장'],
  '건축물 2026': ['smp_ce7719e384-0.jpg', '학습 표본 · 건축물 139장'], '곤포사일리지 2026': ['smp_5333ad8072-0.jpg', '학습 표본 · 곤포 60장'] };

/* ── 공통 ── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 0 ? `${(b / 1e3).toFixed(1)} KB` : '0 MB');
const pct = (used, gb) => { const p = (used / (gb * 1e9)) * 100; return p < 0.1 && used > 0 ? '0.1' : p.toFixed(p < 10 ? 1 : 0); };
const bar = (w, warn = false) => `<div class="k-me-bar${warn ? ' is-warn' : ''}" role="img" aria-label="할당의 ${w}% 사용"><i style="width:${Math.max(w > 0 ? 1 : 0, Math.min(100, w))}%"></i></div>`;
const head = (title, sub, more, extra = '') => `<div class="ld-h"><h2>${title}${sub ? `<small class="ld-sub">${sub}</small>` : ''}${extra}</h2>${more || ''}</div>`;
const cell = (v, label, cls = '') => `<div class="ld-cell ${cls}"><b class="num">${fmt(v)}</b><span>${label}</span></div>`;
const EX = '<span class="sb-ex">예시</span>';
/* 도넛 — 프로젝트별 비중(잉크 농도 4단 · 색 0) · 가운데 큰 숫자. r=44 */
const SHADE = ['#1C1F25', '#4E535C', '#727780', '#B0B8C1'];
function donut(parts, total, center, sub, { size = 150 } = {}) {
  const C = 2 * Math.PI * 44; let off = 0;
  const segs = parts.map(([, v], i) => { const L = (v / total) * C; const o = off; off += L; return `<circle r="44" cx="50" cy="50" fill="none" stroke="${SHADE[i % 4]}" stroke-width="12" stroke-dasharray="${L.toFixed(1)} ${(C - L).toFixed(1)}" stroke-dashoffset="${(-o).toFixed(1)}"/>`; }).join('');
  return `<div class="sb-dn" style="--dn:${size}px"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(sub)}"><circle r="44" cx="50" cy="50" fill="none" stroke="var(--bg-1)" stroke-width="12"/>${segs}</svg><div class="sb-dn-c"><b class="num">${center[0]}</b><span>${center[1]}</span><small>${sub}</small></div></div>`;
}
const legend = (parts, total) => `<ul class="sb-lg">${parts.map(([n, v], i) => `<li><i style="background:${SHADE[i % 4]}"></i><span>${esc(n)}</span><b class="num">${Math.round((v / total) * 100)}%</b><small class="num">${size(v)}</small></li>`).join('')}</ul>`;

/* ── 셸(마스트 · 왼쪽 메뉴) — v3 셸 마크업 그대로 · 직원 메뉴 첫 칸 '홈' → '대시보드'(이 시안의 ①) ── */
const I = {
  home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>', folder: '<path d="M3 5h5l2 2h7v9H3z"/>',
  scan: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
  card: '<path d="M3 4h14v12H3z M3 8h14"/>', data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>', menu: '<path d="M3 5h14 M3 10h14 M3 15h14"/>',
  map: '<path d="M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11"/>', gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2 M4.7 4.7l1.4 1.4 M13.9 13.9l1.4 1.4 M4.7 15.3l1.4-1.4 M13.9 6.1l1.4-1.4"/>',
  org: '<path d="M3 17V7l7-4 7 4v10 M8 17v-5h4v5"/>', deploy: '<path d="M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4"/>', list: '<path d="M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01"/>', check: '<path d="M4 10.5l4 4 8-9"/>',
};
const ico = (k) => (k === 'XI' ? '<i class="k-rail-g" aria-hidden="true">XI</i>' : `<svg viewBox="0 0 20 20" aria-hidden="true">${I[k]}</svg>`);
const STAFF = [['home', '대시보드', 'lx-console/'], ['folder', '프로젝트', 'lx-project/'], ['scan', '분석하기', 'lx-analyze/'], ['XI', 'XI맵', 'xi-clean/', 1], ['data', '데이터', 'lx-ingest/', 1], ['inbox', '요청함', 'lx-inbox/']];   // 지금 메뉴(kit/lx-menu.js · 원칙 149 · 151)
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
const COLS = [['ingest', '데이터 올리기'], ['ai', 'AI 분석'], ['review', '결과 확인'], ['publish', '배포 신청']];   // 원칙 152 — '서비스 공개' 대신 '배포 신청'
const COL_OF = { ingest: 'ingest', label: 'ai', train: 'ai', review: 'review', publish: 'publish', ops: 'publish' };
const regionOf = (p) => (p.regions.length ? p.regions[0].name + (p.regions.length > 1 ? ` 외 ${p.regions.length - 1}곳` : '') : '지역 미정');
const TODAY = new Date('2026-10-09T12:00:00+09:00');
const daysAgo = (iso) => Math.max(0, Math.round((TODAY - new Date(iso)) / 864e5));
/* 서버 그대로 — 넷 모두 배포 신청 칸(서비스 관리 · 시범) · '결과 확인 0/20' 이 앞 단계에 남아 있음 · 진행 = 6단계 가운데 끝난 칸 수 · 마지막 활동 = last_at */
const REAL = P.map((p) => ({ col: COL_OF[p.stage.key], name: p.name, region: regionOf(p), lead: p.lead?.name || '—', now: p.next?.text || p.stage.label,
  kick: p.blocked?.[0] ? `${p.blocked[0].text} 남음` : '', kind: p.blocked?.[0]?.kind === 'before' ? 'warn' : (p.blocked?.[0] ? 'wait' : 'ok'),
  done: p.steps.filter((x) => x === 'done').length, steps: p.steps, days: daysAgo(p.last_at) }));
/* 예시 배치 — 프로젝트가 열 개를 넘을 때의 모양(실제 4 + 분석 서비스 이름을 빌린 예시 9 · 값은 모양을 보기 위한 것) */
const mk = (name, region, col, done, days, kick, kind, now) => ({ col, name, region, lead: 'LX 직원', now, kick, kind, done, days, ex: true,
  steps: ['ingest', 'label', 'train', 'review', 'publish', 'ops'].map((_, i) => (i < done ? 'done' : i === done ? 'now' : 'wait')) });
const EXAMPLE = [
  ...REAL.map((x) => (x.name === '곤포사일리지 2026' ? { ...mk(x.name, x.region, 'ingest', 0, x.days, '영상 없는 지역 1곳', 'warn', '영상 등록'), ex: false }
    : x.name === '주차장 2026' ? { ...mk(x.name, x.region, 'ai', 2, x.days, '', 'ok', '학습'), ex: false }
    : x.name === '건축물 2026' ? { ...mk(x.name, x.region, 'review', 3, x.days, '결과 확인 0/20 남음', 'warn', '결과 확인'), ex: false } : x)),
  mk('영농관리 2026', '남원시', 'ai', 2, 1, '학습 2시간째 · 끝나면 알림', 'wait', '학습'),
  mk('해양쓰레기 2026', '여수시', 'ai', 1, 3, '', 'ok', '학습데이터 구축'),
  mk('국토 변화 2026', '남원시', 'review', 3, 5, '결과 확인 12/20 남음', 'warn', '결과 확인'),
  mk('도로 안전 2026', '지역 미정', 'ingest', 0, 12, '영상 없는 지역 1곳', 'warn', '데이터 올리기'),
  mk('산림·탄소 2026', '지역 미정', 'ingest', 0, 2, '', 'ok', '데이터 올리기'),
  mk('생활환경 2026', '지역 미정', 'ai', 2, 0, '', 'ok', '학습'),
  mk('인파관리 2026', '지역 미정', 'ai', 1, 4, '', 'ok', '학습데이터 구축'),
  mk('농지 이용(해외) 2026', '지역 미정', 'publish', 4, 1, '', 'wait', '승인 대기'),
  mk('재해 피해(해외) 2026', '지역 미정', 'review', 3, 9, '결과 확인 0/20 남음', 'warn', '결과 확인'),
];
/* 6칸 진행 막대(프로젝트 목록과 같은 부품 .lxp-seg) */
const seg = (steps) => `<span class="lxp-seg" role="img" aria-label="${steps.filter((x) => x === 'done').length}칸 끝남"><i data-st="${steps[0]}"></i><i data-st="${steps[1]}"></i><i data-st="${steps[2]}"></i><i data-st="${steps[3]}"></i><i data-st="${steps[4]}"></i><i data-st="${steps[5]}"></i></span>`;
const ago = (d) => (d === 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`);
/* 흐름도 + 단계별 숫자 — 단계 넷을 선으로 잇고(점이 흐름을 따라 움직임) · 단계마다 큰 숫자 · 작은 진행 그래프(프로젝트별 6칸 막대) · 이름 칩 · 누른 단계는 아래로 표 */
function board(list, ex = false, open = 'publish') {
  const nodes = COLS.map(([key, label], i) => {
    const here = list.filter((x) => x.col === key);
    const warn = here.filter((x) => x.kind === 'warn').length, wait = here.filter((x) => x.kind === 'wait').length;
    const sub = !here.length ? '머문 프로젝트 없음' : [warn ? `<em>남은 일 ${warn}</em>` : '', wait ? `기다림 ${wait}` : '', `마지막 활동 ${ago(Math.min(...here.map((x) => x.days)))}`].filter(Boolean).join(' · ');
    const MAXC = 3;
    const chips = here.slice(0, MAXC).map((x) => `<a class="sb-chip" href="#" data-kind="${x.kind}" title="${esc(x.name)} · ${esc(x.now)}"><span>${esc(x.name)}</span>${seg(x.steps)}</a>`).join('')
      + (here.length > MAXC ? `<span class="sb-chip sb-chip--more">외 ${here.length - MAXC}개</span>` : '');
    return `<li class="sb-st" data-n="${here.length}"${key === open ? ' data-open="1"' : ''}${warn ? ' data-warn="1"' : ''}>
<button class="sb-st-b" type="button" aria-expanded="${key === open}"><span class="sb-st-k num">${i + 1}</span><b class="num">${here.length}</b><span class="sb-st-l">${label}</span><small class="sb-st-s">${sub}</small>
<span class="sb-st-g" aria-hidden="true">${here.slice(0, 6).map((x) => `<i style="--w:${Math.round((x.done / 6) * 100)}%" data-kind="${x.kind}"></i>`).join('')}</span></button>
<div class="sb-chips">${chips}</div></li>`;
  }).join('\n');
  const cur = list.filter((x) => x.col === open);
  const title = COLS.find(([k]) => k === open)[1];
  const rows = cur.map((x) => `<tr><td><b class="acc-b">${esc(x.name)}</b>${x.ex ? ' <span class="sb-ex">예시</span>' : ''}</td><td>${esc(x.region)}</td><td>${esc(x.lead)}</td><td>${esc(x.now)}</td>
<td><span class="sb-prog">${seg(x.steps)}<small class="num">${x.done}/6</small></span></td><td class="num">${ago(x.days)}</td><td>${x.kick ? `<span class="sb-kick" data-kind="${x.kind}">${esc(x.kick)}</span>` : '<span class="sb-kick" data-kind="ok">없음</span>'}</td><td><a class="ld-more" href="#">열기</a></td></tr>`).join('');
  return `<section class="t-card ld-card sb-board" aria-label="프로젝트 진행 현황">
${head('프로젝트 진행 현황', `진행 중 ${list.length} · 내가 맡은 ${list.filter((x) => x.lead === 'LX 직원').length} · 남은 일 있는 프로젝트 ${list.filter((x) => x.kind === 'warn').length}`, '<a class="ld-more" href="#">전체 보기</a>', ex ? ' <span class="sb-ex">예시 배치 — 프로젝트가 열 개를 넘을 때</span>' : '')}
<ol class="sb-fl">${nodes}</ol>
<div class="sb-open"><div class="sb-open-h"><h3>${title} <b class="num">${cur.length}</b></h3><p>단계를 누르면 그 단계의 프로젝트가 여기에 펼쳐집니다</p></div>
<div class="k-table-w"><table class="k-table sb-tb"><thead><tr><th>프로젝트</th><th>지역</th><th>담당</th><th>지금</th><th>진행</th><th class="num">마지막 활동</th><th>남은 일</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="sb-tb-none">이 단계에 머문 프로젝트가 없습니다</td></tr>'}</tbody></table></div></div>
<div class="sb-foot"><p><span>숫자 = 그 단계에 있는 프로젝트 수.</span> <span>막대 = 여섯 단계 가운데 끝낸 칸.</span> <span>빨간 점 = 앞 단계에 남은 일.</span></p><button class="ld-new" type="button">새 프로젝트</button></div>
</section>`;
}
function storeCard(ex = false) {
  const used = ex ? 46.2e9 : STORAGE.used, q = STORAGE.quota;
  const p = ex ? '92' : pct(used, q);
  const warn = ex;
  return `<section class="t-card ld-card sb-store" aria-label="저장 용량">${head('저장 용량', `할당 ${q} GB`, '<a class="ld-more" href="my.html">내 정보</a>')}
<div class="sb-store-b${warn ? ' is-warn' : ''}"><div class="sb-store-row">${donut(STORAGE.projects.map(([n, b]) => [n, ex ? b * 1549 : b]), used, size(used).split(' '), `할당의 ${p}%`, { size: 118 })}${legend(STORAGE.projects.map(([n, b]) => [n, ex ? b * 1549 : b]), used)}</div>
<p class="sb-store-k"><span>할당 ${q} GB 대비</span><b class="num">${p}%</b></p>${bar(Number(p), warn)}
<p class="sb-store-s"><span>프로젝트 ${STORAGE.projects.length}개의 학습데이터 · 올린 파일.</span> <span>기본 할당 ${q} GB${ex ? '' : ' — LX 관리자가 정함'}</span></p>
${warn ? `<p class="sb-store-w"><span>할당의 ${p}%를 썼습니다.</span> <span>꽉 차기 전에 증량을 신청해 주세요</span></p>` : ''}
<div class="sb-store-a"><button class="k-me-ask" type="button">용량 증량 신청</button></div></div></section>`;
}
const jobsCard = () => `<section class="t-card ld-card sb-jobs" aria-label="내가 돌린 작업">${head('내가 돌린 작업', `${JOBS.first} – ${JOBS.last}`)}
<div class="sb-cells2">${cell(JOBS.done, '완료')}${cell(JOBS.failed, '실패', JOBS.failed ? 'is-warn' : 'is-zero')}${cell(JOBS.cancelled, '취소')}${cell(JOBS.running, '진행 중', JOBS.running ? '' : 'is-zero')}</div>
<p class="sb-kinds"><span class="sb-k">종류별</span>${JOBS.kinds.slice(0, 4).map(([k, n]) => `<span>${k} <b class="num">${fmt(n)}</b></span>`).join('')}</p></section>`;
const inboxCard = () => `<section class="t-card ld-card sb-inbox" aria-label="요청함">${head('요청함', '', '<a class="ld-more" href="#">전체</a>')}
<div class="ld-cells">${cell(INBOX.review, '검토 요청', INBOX.review ? '' : 'is-zero')}${cell(INBOX.request, '분석 요청', INBOX.request ? '' : 'is-zero')}${cell(INBOX.approval, '보낸 요청', INBOX.approval ? '' : 'is-zero')}</div>
<p class="sb-inbox-s">기관의 요청과 내가 보낸 요청 · 왼쪽 메뉴 숫자와 같습니다</p></section>`;
const noticeCard = () => `<section class="t-card ld-card sb-notice" aria-label="공지">${head('공지')}
<p class="sb-ntc-none">새 공지가 없습니다</p>
<p class="sb-ntc-s">LX 관리자가 올린 공지가 최근 순으로 보입니다</p></section>`;

function dashboard(o, ex = false) {
  const body = `<div class="sb"><div class="sb-in">
${board(ex ? EXAMPLE : REAL, ex, ex ? 'ai' : 'publish')}
<div class="sb-row">${storeCard(ex)}${jobsCard()}${inboxCard()}${noticeCard()}</div>
</div></div>`;
  return shell({ title: 'LX 직원 대시보드', home: 'LX 직원 대시보드', role: 'LX 직원', items: STAFF, cur: 0, v3: o.v3, assets: o.assets,
    css: [`${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`, `${o.v3}/lx-project/context.css`, `${o.v3}/ops-accounts/accounts.css`], body, desc: `LX 직원 대시보드 — 프로젝트 진행 현황 네 칸 · 저장 용량 · 내가 돌린 작업 · 요청함 · 공지${ex ? ' (예시 배치)' : ''}` });
}

/* ── ② 내 정보 창 — 왼쪽 내 정보 · 오른쪽 저장 용량(할당 50 GB · 막대 · 프로젝트별) · 증량 신청(펼친 상태) · 요청 이력 ── */
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
<div class="sb-store-row sb-store-row--lg">${donut(STORAGE.projects, used, size(used).split(' '), `할당의 ${p}%`, { size: 160 })}${legend(STORAGE.projects, used)}</div>
<p class="sb-store-k"><span>할당 ${q} GB 대비</span><b class="num">${p}%</b></p>${bar(Number(p))}
<p class="k-me-sub">내가 프로젝트장인 프로젝트 ${STORAGE.projects.length}개의 학습데이터 · 올린 파일</p>
<div class="sb-req"><p class="k-me-l">용량 증량 신청</p>
<div class="sb-req-two"><label class="k-me-f"><span class="k-me-l">필요한 용량</span><span class="k-me-gb"><input class="t-input" type="number" value="100" min="${q}" step="1" aria-label="원하는 할당(GB)"><i>GB</i></span></label>
<label class="k-me-f"><span class="k-me-l">사유</span><input class="t-input" type="text" value="2차 학습데이터 추가" maxlength="120"></label></div>
<p class="k-me-say"><span>LX 관리자가 승인하면 할당이 늘어나고,</span> <span>결과는 알림으로 받습니다</span></p>
<div class="k-me-act"><button class="t-btn" type="button">신청</button><button class="t-btn t-btn--text k-me-x" type="button">취소</button></div></div>
</div>
<div class="k-me-st"><div class="k-me-sth"><p class="k-me-l">증량 신청 이력</p></div>
<p class="k-me-big is-zero"><b class="num">0</b><small>신청 · 대기 0</small></p>
<p class="sb-me-none">신청한 적이 없습니다</p>
<p class="k-me-sub">신청의 승인 · 거절가 여기 남습니다</p></div>
</div></div></div></div></div>`;
  const body = `<div class="sb"><div class="sb-in">${board(REAL)}<div class="sb-row">${storeCard()}${jobsCard()}${inboxCard()}${noticeCard()}</div></div></div>${modal}`;
  return shell({ title: '내 정보 — 저장 용량', home: 'LX 직원 대시보드', role: 'LX 직원', items: STAFF, cur: 0, v3: o.v3, assets: o.assets, cls: 'k-md-open',
    css: [`${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`, `${o.v3}/kit/modal.css`, `${o.v3}/lx-project/context.css`, `${o.v3}/ops-accounts/accounts.css`], body, desc: '내 정보 창 — 저장 용량(할당 50 GB · 프로젝트별) · 증량 신청 · 요청 이력' });
}

/* ── ③ LX 관리자 · 계정 화면 '저장 용량' 탭 — 기본 할당 · 증량 신청(승인 · 거절) · 계정별 할당 ── */
function overview() {
  const alloc = STORAGE.quota * USERS.length * 1e9, acc = USERS.reduce((a, u) => a + u[3], 0);
  const tb = (b) => `${(b / 1e12).toFixed(1)} TB`;
  const w = (b) => ((b / DISK.total) * 100).toFixed(1);
  return `<section class="t-card sb-ov" aria-label="저장 공간 전체 현황">${head('저장 공간 전체 현황', '저장 서버 실측 · 10-09 10:57')}
<div class="sb-ov-n"><div class="ld-cell"><b class="num">${tb(DISK.total)}</b><span>전체 저장 공간</span></div><div class="ld-cell"><b class="num">${tb(DISK.used)}</b><span>사용 중 · 영상 · 결과 포함</span></div><div class="ld-cell"><b class="num">${tb(DISK.free)}</b><span>여유</span></div><div class="ld-cell"><b class="num">${(alloc / 1e9).toFixed(0)} GB</b><span>계정 할당 합계 ${EX}</span></div><div class="ld-cell"><b class="num">${size(acc)}</b><span>계정이 실제 쓴 양</span></div></div>
<div class="sb-ov-bar" role="img" aria-label="사용 중 ${w(DISK.used)}% · 할당 합계 ${w(alloc)}% · 여유 ${w(DISK.free)}%"><i style="width:${w(DISK.used)}%"></i><i class="is-alloc" style="width:${Math.max(1, w(alloc))}%"></i></div>
<p class="sb-ov-s"><span>여유 ${tb(DISK.free)} 가운데 계정 할당 합계는 ${Math.round((alloc / DISK.free) * 100)}%.</span> <span>증량을 승인해도 실제로 쓰기 전까지 여유는 줄지 않습니다.</span></p></section>`;
}
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
<td>${pending ? `<span class="sb-ask">증량 신청 ${REQ.want} GB</span>` : `<span class="sb-gb"><input class="t-input" type="number" placeholder="${q}" aria-label="${name} 할당(GB)"><i>GB</i></span>`}</td></tr>`;
  }).join('');
  const body = `<div class="acc"><div class="acc-w sb-acc">
<h1 class="acc-h">계정</h1>
<div class="acc-tabs" role="tablist">${tabHtml}</div>
<div class="sb-adm">
<div class="sb-adm-l">
${overview()}
<div class="sb-set"><p class="sb-set-l">기본 할당</p><p class="sb-set-v"><b class="num">${q}</b><span>GB</span></p><p class="sb-set-s"><span>따로 정하지 않은 LX 계정 ${USERS.length}명에게 적용됩니다.</span> <span>사람마다 다른 값은 아래 표에서 정합니다</span></p><button class="t-btn t-btn--2" type="button">기본 할당 바꾸기</button></div>
<div class="sb-tbl">${head('계정별 할당', `LX 계정 ${USERS.length} · 증량 신청 1`)}
<div class="k-table-w"><table class="k-table"><thead><tr><th>이름</th><th>아이디</th><th>역할</th><th class="num">프로젝트</th><th class="num">사용량</th><th>할당 · 사용</th><th>구분</th><th>개별 할당</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="k-me-sub" style="margin-top:12px">빈 칸이면 기본 할당, 값을 적으면 그 사람만 개별 할당입니다. 할당을 넘어도 막지 않고 알립니다.</p></div>
</div>
<aside class="sb-dr" aria-label="증량 신청 한 건">
<h3>증량 신청 ${EX}</h3>
<dl class="acc-dl"><dt>누가</dt><dd>${REQ.who} · ${REQ.login}</dd><dt>언제</dt><dd>${REQ.at}</dd><dt>이유</dt><dd>${REQ.why}</dd><dt>사용량</dt><dd>${size(REQ.used)} · 할당의 ${pct(REQ.used, REQ.from)}%</dd></dl>
<p class="sb-dr-big"><b class="num">${REQ.from}</b><span>GB</span><i>→</i><b class="num">${REQ.want}</b><span>GB</span></p>
<p class="sb-dr-after"><span>승인하면 이 사람만 ${REQ.want} GB 개별 할당.</span> <span>할당 합계 ${STORAGE.quota * USERS.length + REQ.want - REQ.from} GB — 여유 2.0 TB의 ${Math.round(((STORAGE.quota * USERS.length + REQ.want - REQ.from) * 1e9 / DISK.free) * 100)}%.</span> <span>신청한 사람에게 알림이 갑니다</span></p>
<div class="acc-do"><input class="t-input acc-reason" type="text" placeholder="거절 사유(거절할 때)" aria-label="사유"><div class="acc-acts"><button class="t-btn t-btn--2" type="button">거절</button><button class="t-btn" type="button">승인</button></div></div>
</aside>
</div></div></div>`;
  return shell({ title: 'LX 관리자 — 계정별 저장 용량', home: 'LX 관리자 대시보드', role: 'LX 관리자', items: ADMIN, cur: 6, v3: o.v3, assets: o.assets,
    css: [`${o.v3}/ops-accounts/accounts.css`, `${o.v3}/lx-console/console.css`, `${o.v3}/kit/me.css`], body, desc: 'LX 관리자 계정 화면 저장 용량 탭 — 기본 할당 · 계정별 할당 · 증량 신청 승인 · 거절' });
}

for (const o of OUTS) {
  fs.mkdirSync(o.dir, { recursive: true });
  fs.writeFileSync(path.join(o.dir, 'dashboard.html'), dashboard(o));
  fs.writeFileSync(path.join(o.dir, 'dashboard-ex.html'), dashboard(o, true));
  fs.writeFileSync(path.join(o.dir, 'my.html'), my(o));
  fs.writeFileSync(path.join(o.dir, 'admin.html'), admin(o));
  if (o.dir !== HERE) { fs.copyFileSync(path.join(HERE, 'board.css'), path.join(o.dir, 'board.css')); fs.mkdirSync(path.join(o.dir, 'img'), { recursive: true }); for (const f of fs.readdirSync(path.join(HERE, 'img'))) fs.copyFileSync(path.join(HERE, 'img', f), path.join(o.dir, 'img', f)); }
  console.log('wrote', o.dir);
}
