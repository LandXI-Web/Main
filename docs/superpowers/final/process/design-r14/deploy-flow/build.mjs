/* 설계 14차 · 분석 서비스 — 배포 신청 · 승인 · 기관 공유 (페블 · 원칙 152 · 확인 대장 서비스카드-2) — 정적 시안 만들기.
   v3 셸(마스트 · 왼쪽 메뉴)은 design-r14/lx-staff-board 와 같은 마크업, kit.css · console.css 를 그대로 읽고 판만 새로 짠다.
   숫자 · 이름 = 10-09 12:03 서버 응답(values.json · README §3). 서버에 없는 것(2.1판 신청 한 건 · 거절 사유 · 광주전남 공유)은 '예시' 표.
   사용: node build.mjs → 이 폴더(docs) 와 landxi/proto/review/deploy-flow/ 두 곳에 같은 화면(경로만 다름). v3 코드 수정 0 · 서버 쓰기 0. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const OUTS = [
  { dir: HERE, v3: '../../../../../../landxi/v3', assets: '../../../../../../landxi/assets' },
  { dir: path.join(ROOT, 'landxi/proto/review/deploy-flow'), v3: '../../../v3', assets: '../../../assets' },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EX = '<span class="df-ex">예시</span>';

/* ── 서버 값(10-09 12:03 · test@lx.or.kr · lxadmin@lx.or.kr) ── */
const V = JSON.parse(fs.readFileSync(path.join(HERE, 'values.json'), 'utf8'));

/* ── 셸 ── */
const ICON = {
  home: 'M3 9.5L10 4l7 5.5V16H3z', project: 'M3 5h5l2 2h7v9H3z', analyze: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4 M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z',
  map: 'M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11', xi: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M3 10h14 M10 3c-2.5 2-2.5 12 0 14 M10 3c2.5 2 2.5 12 0 14',
  data: 'M4 5c0-1.1 2.7-2 6-2s6 .9 6 2v10c0 1.1-2.7 2-6 2s-6-.9-6-2z M4 10c0 1.1 2.7 2 6 2s6-.9 6-2', inbox: 'M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4',
  gear: 'M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2', org: 'M3 17V7l7-4 7 4v10 M8 17v-5h4v5', deploy: 'M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4',
  list: 'M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01', check: 'M4 10.5l4 4 8-9', more: 'M3 5h14 M3 10h14 M3 15h14',
};
const STAFF_MENU = [['대시보드', 'home', 'lx-console/'], ['프로젝트', 'project', 'lx-project/'], ['분석하기', 'analyze', 'lx-analyze/'], ['지도 서비스', 'map', 'lx-analyze/?view=map'], ['XI맵', 'xi', 'xi-clean/'], ['데이터', 'data', 'lx-ingest/', 1], ['요청함', 'inbox', 'lx-inbox/']];
const ADMIN_MENU = [['현황', 'map', 'ops-core/'], ['인프라', 'gear', 'ops-infra/'], ['기관', 'org', 'ops-infra/?view=tenants'], ['배포', 'deploy', 'ops-infra/?view=deploys'], ['승인 요청', 'inbox', 'ops-core/#approvals'], ['검토 요청', 'list', 'lx-inbox/'], ['계정 관리', 'check', 'ops-accounts/']];

function shell(o, { title, desc, role, menu, current, body, css = [] }) {
  const rail = menu.map(([label, ic, href, more], i) => `<a class="k-rail-i${more ? ' k-rail-i--more' : ''}" href="${o.v3}/${href}" data-i="${i}"${label === current ? ' aria-current="true"' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICON[ic]}"/></svg><span>${label}</span></a>`).join('')
    + `<button type="button" class="k-rail-i k-rail-more" aria-haspopup="dialog"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICON.more}"/></svg><span>메뉴</span></button>`;
  const home = role === 'admin' ? ['ops-core/', 'LX 관리자 대시보드', 'LX 관리자'] : ['lx-console/', 'LX 직원 대시보드', 'LX 직원'];
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>[시안] ${esc(title)} · Land-XI</title>
<meta name="description" content="설계 14차 시안 — ${esc(desc)}">
<link rel="icon" href="${o.assets}/images/favicon_landxi.png">
<link rel="stylesheet" href="${o.v3}/kit/kit.css">
<link rel="stylesheet" href="${o.v3}/lx-console/console.css">
${css.map((c) => `<link rel="stylesheet" href="${o.v3}/${c}">`).join('\n')}
<link rel="stylesheet" href="df.css">
</head>
<body class="t k-shelled">
<div class="k-app has-rail has-more is-staff">
<header class="t-mast k-mast"><a class="k-word" href="${o.v3}/${home[0]}"><span class="word">LAND-XI</span><span class="home">${home[1]}</span></a><span class="sp"></span><span class="k-mast-slot"></span><span class="t-fresh k-fresh k-sig" tabindex="0" data-live="1" aria-label="마지막 갱신 12:03" data-why="마지막 갱신 12:03"><i></i><span class="num">12:03</span></span><button class="t-role k-role k-me-b" type="button" title="내 정보" aria-haspopup="dialog">${home[2]}</button><a class="k-mast-b k-xi" href="${o.v3}/xi-clean/">XI맵</a><button class="k-mast-b k-help" type="button" aria-label="도움말">?</button><button class="k-mast-b k-exit" type="button">나가기</button></header>
<nav class="t-rail k-rail" aria-label="메뉴">${rail}</nav>
<main class="k-main" id="main">
<div class="df"><div class="df-in">
<p class="df-stamp">시안 · 사용자 확인 전 · 숫자는 10월 9일 12:03 기준 · <span class="df-ex">예시</span> 표시만 서버에 없는 값</p>
${body}
</div></div>
</main>
</div>
</body>
</html>
`;
}

/* ── 공통 조각 ── */
const bar = (pct, cls = '') => `<span class="df-bar${cls ? ' ' + cls : ''}" role="img" aria-label="${pct}%"><i style="width:${pct}%"></i></span>`;
const chip = (t, lv) => `<span class="t-chip"${lv ? ` data-lv="${lv}"` : ''}>${esc(t)}</span>`;
const stageBar = (steps) => `<ol class="df-steps" aria-label="단계">${steps.map(([l, st], i) => `<li data-st="${st}"><i class="num">${i + 1}</i><span>${esc(l)}</span><small>${{ done: '끝', wait: '남음', now: '지금', todo: '' }[st]}</small></li>`).join('')}</ol>`;

/* ═══════════ ① LX 직원 — 프로젝트 마지막 단계 '배포 신청' ═══════════ */
function staffApply(o) {
  const P = V.project, C = V.card, M = V.model_new, M0 = V.model_now;
  const body = `
<header class="df-head"><div><p class="t-label">프로젝트</p><h1 class="df-title">${esc(P.name)}</h1></div>
<div class="df-meta">${chip(P.task)}${P.regions.map((r) => chip(r, 'wait')).join('')}<span class="df-lead">프로젝트장 ${esc(P.lead)}</span></div></header>
${stageBar([['데이터 올리기', 'done'], ['학습데이터 구축', 'done'], ['학습', 'done'], ['결과 확인', 'wait'], ['배포 신청', 'now']])}
<div class="df-grid df-grid--apply">
<section class="t-card ld-card df-form" aria-label="배포 신청서">
<div class="ld-h"><h2>배포 신청<small class="ld-sub">${esc(C.name)} · ${esc(C.next_version)}판</small></h2><span class="df-ver">지난 판 ${esc(C.version)} · ${esc(C.approved_at)} 승인</span></div>
<p class="df-lede">승인되면 LX 관리자가 기관에 공유할 수 있는 정식 서비스가 됩니다. 아래 서버 값은 고칠 수 없고, 직원이 적는 칸은 네 개입니다.</p>
<dl class="df-dl">
<div><dt>서비스</dt><dd><b>${esc(C.name)}</b> <span class="df-sub">찾는 것 · ${esc(C.finds)}</span></dd></div>
<div><dt>모델</dt><dd><b>${esc(M.label)}</b> <span class="df-sub">${esc(M.input)} · 지난 판은 ${esc(M0.label)}</span></dd></div>
<div><dt>정확도</dt><dd><div class="df-cmp"><span><em>이번 판</em><b class="num">${M.acc}%</b>${bar(M.acc)}</span><span><em>지난 판</em><b class="num df-dim">${M0.acc}%</b>${bar(M0.acc, 'is-dim')}</span></div><span class="df-sub">학습 끝 검증 값 · ${esc(M.as_of)}</span></dd></div>
<div><dt>결과 확인</dt><dd><b class="df-warn">${esc(P.review)}</b> <span class="df-sub">결과 확인 단계가 남았습니다 — 신청은 할 수 있지만 관리자 판단 근거에 그대로 보입니다</span></dd></div>
<div><dt>적용해 본 곳</dt><dd><b>${esc(P.applied.join(' · '))}</b> <span class="df-sub">시범 ${P.applied.length}곳 · 결과 반영</span></dd></div>
</dl>
<div class="df-fields">
<div class="df-f df-f--wide"><span>결과 장면</span><div class="df-scene"><img src="${o.assets}/${C.scene}" alt="${esc(C.scene_caption)}"><div><b>${C.scene_caption.split(' · ').map((s) => `<span>${esc(s)}</span>`).join(' · ')}</b><small>지금 카드의 대표 장면 · 다른 결과에서 고를 수 있습니다</small><button class="t-btn t-btn--2" type="button">다른 장면 고르기</button></div></div></div>
<label class="df-f"><span>학습한 지역</span><input class="t-input" type="text" value="" placeholder="표본 영상을 찍은 지역을 적습니다 — 예: 남원시" aria-label="학습한 지역"><small>서버 기록에 없어 직원이 적습니다. 분석하기 카드의 '학습한 지역' 칸에 그대로 보입니다</small></label>
<label class="df-f"><span>한 줄 소개</span><input class="t-input" type="text" value="${esc(C.line)}" aria-label="한 줄 소개"><small>분석하기 카드와 기관 '서비스 선택'에 보이는 글 · 60자 안</small></label>
<label class="df-f df-f--wide"><span>지난 판에서 바뀐 점</span><textarea class="t-input" rows="2" placeholder="예: 10월 8일 다시 학습한 모델로 바꿈 · 정확도 ${M0.acc} → ${M.acc}%" aria-label="지난 판에서 바뀐 점"></textarea><small>관리자가 승인할 때 읽는 글</small></label>
</div>
<div class="df-foot"><p><span>신청하면 LX 관리자가 검토합니다.</span> <span>거절되면 사유가 여기에 보이고, 고쳐서 다시 신청할 수 있습니다.</span></p><button class="t-btn" type="button">배포 신청</button></div>
</section>
<div class="df-col">
<section class="t-card ld-card" aria-label="신청 상태">
<div class="ld-h"><h2>신청 상태</h2></div>
<ol class="df-flow"><li data-st="now"><b>신청 전</b><small>${esc(C.next_version)}판 · 아직 보내지 않음</small></li><li><b>검토 중</b><small>LX 관리자가 봅니다</small></li><li><b>승인</b><small>정식 서비스 · 기관에 공유 가능</small></li><li data-alt="1"><b>거절</b><small>사유를 보고 고쳐서 다시 신청</small></li></ol>
<div class="df-reject">${EX}<p><b>거절 · 10.9 · LX 관리자</b></p><p>사유: 함양군 결과를 다시 확인해 주세요 — 결과 확인 단계를 끝내고 신청해 주세요</p><button class="t-btn t-btn--2" type="button">고쳐서 다시 신청</button></div>
</section>
<section class="t-card ld-card" aria-label="지난 판">
<div class="ld-h"><h2>지난 판<small class="ld-sub">${C.history.length}판</small></h2></div>
<ul class="df-hist">${C.history.map((hh) => `<li><b class="num">${esc(hh.v)}</b><div><span>${esc(hh.when)} · ${esc(hh.what)}</span>${hh.why ? `<small>${esc(hh.why)}</small>` : ''}</div></li>`).join('')}</ul>
</section>
<section class="t-card ld-card" aria-label="공유된 기관">
<div class="ld-h"><h2>공유된 기관<small class="ld-sub">${C.shared.length}곳</small></h2></div>
<ul class="df-hist df-hist--org">${C.shared.map((s) => `<li><b>${esc(s.org)}</b><div><span>${esc(s.when)} 공유 · ${esc(s.state)}</span></div></li>`).join('')}</ul>
<p class="df-note">${esc(C.held)} — 기관 계정이 없어 LX가 보관합니다. 기관 공유는 LX 관리자가 합니다.</p>
</section>
</div>
</div>`;
  return shell(o, { title: 'LX 직원 · 배포 신청', desc: 'LX 직원 — 프로젝트 마지막 단계 배포 신청(모델 · 정확도 · 학습한 지역 · 결과 장면 · 한 줄 소개) · 신청 상태 · 지난 판 · 공유된 기관', role: 'staff', menu: STAFF_MENU, current: '프로젝트', body });
}

/* ═══════════ ② LX 관리자 — 배포 신청 목록 · 한 건 승인/거절 ═══════════ */
const adminTabs = (cur) => `<nav class="df-tabs" aria-label="배포"><a href="admin-requests.html"${cur === 0 ? ' aria-current="page"' : ''}>배포 신청<b class="num">1</b></a><a href="admin-share.html"${cur === 1 ? ' aria-current="page"' : ''}>기관 공유</a><a href="#"${cur === 2 ? ' aria-current="page"' : ''}>적용 현황<b class="num">${V.deploys_n}</b></a></nav>`;

function adminRequests(o) {
  const C = V.card, M = V.model_new, M0 = V.model_now, P = V.project;
  const rows = V.requests.map((r, i) => `<tr${i === 0 ? ' class="is-on" aria-current="true"' : ''}><td><b>${esc(r.name)}</b></td><td class="num">${esc(r.v)}</td><td>${esc(r.who)}</td><td class="num">${esc(r.at)}</td><td>${chip(r.state, r.lv)}${r.ex ? EX : ''}</td></tr>`).join('');
  const body = `
<header class="df-head"><div><p class="t-label">LX 관리자</p><h1 class="df-title">배포</h1></div>${adminTabs(0)}</header>
<div class="df-grid df-grid--admin">
<section class="t-card ld-card df-list" aria-label="배포 신청 목록">
<div class="ld-h"><h2>배포 신청<small class="ld-sub">검토 중 1 · 처리함 ${V.requests.length - 1}</small></h2></div>
<table class="df-tbl"><thead><tr><th>서비스</th><th>판</th><th>신청한 사람</th><th>신청일</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>
<p class="df-note">처리함에는 승인 · 거절한 신청이 사유와 함께 남습니다. 지금까지 거절 0건.</p>
<div class="df-other"><p class="t-label">다른 승인 요청 · ${V.other.length}건 — '승인 요청' 메뉴에서</p><ul class="df-hist df-hist--org">${V.other.map((x) => `<li><b>${esc(x.kind)}</b><div><span>${esc(x.title)}</span><small>${esc(x.who)} · ${esc(x.at)}</small></div></li>`).join('')}</ul></div>
</section>
<section class="t-card ld-card df-sheet" aria-label="신청 한 건">
<div class="ld-h"><h2>${esc(C.name)}<small class="ld-sub">${esc(C.next_version)}판 신청 · ${EX}</small></h2><span class="df-ver">신청 ${esc(V.requests[0].who)} · 프로젝트 ${esc(P.name)} · 10.9 11:20</span></div>
<p class="t-label">판단 근거</p>
<dl class="df-dl df-dl--basis">
<div><dt>정확도</dt><dd><div class="df-cmp"><span><em>이번 판</em><b class="num">${M.acc}%</b>${bar(M.acc)}</span><span><em>지난 판 ${esc(C.version)}</em><b class="num df-dim">${M0.acc}%</b>${bar(M0.acc, 'is-dim')}</span></div><span class="df-sub">학습 끝 검증 값 · ${esc(M.as_of)}</span></dd></div>
<div><dt>결과 확인</dt><dd><b class="df-warn">${esc(P.review)} · 확인 전</b> <span class="df-sub">프로젝트의 결과 확인 단계가 끝나지 않았습니다</span></dd></div>
<div><dt>적용해 본 곳</dt><dd><b>${esc(P.applied.join(' · '))}</b> <span class="df-sub">시범 ${P.applied.length}곳 · 결과 반영</span></dd></div>
<div><dt>학습한 지역</dt><dd><b>남원시</b>${EX} <span class="df-sub">신청한 사람이 적은 값</span></dd></div>
<div><dt>바뀐 점</dt><dd><b>10월 8일 다시 학습한 모델로 바꿈</b>${EX} <span class="df-sub">신청한 사람이 적은 글</span></dd></div>
</dl>
<div class="df-two">
<div class="df-scene df-scene--sm"><img src="${o.assets}/${C.scene}" alt="${esc(C.scene_caption)}"><div><b>결과 장면</b><small>${esc(C.scene_caption)}</small></div></div>
<table class="df-tbl df-tbl--cmp"><caption>지난 판과 비교</caption><thead><tr><th></th><th>${esc(C.version)} <small>${esc(C.approved_at)}</small></th><th>${esc(C.next_version)} <small>신청</small></th></tr></thead><tbody>
<tr><td>모델</td><td>${esc(M0.label)}</td><td><b>${esc(M.label)}</b></td></tr>
<tr><td>정확도</td><td class="num">${M0.acc}%</td><td class="num"><b>${M.acc}%</b></td></tr>
<tr><td>찾는 것</td><td>${esc(C.finds)}</td><td>${esc(C.finds)}</td></tr>
<tr><td>영상</td><td>${esc(M0.input)}</td><td>${esc(M.input)}</td></tr>
<tr><td>한 줄 소개</td><td colspan="2">${esc(C.line)} <span class="df-sub">같음</span></td></tr>
</tbody></table>
</div>
<div class="df-decide"><input class="t-input" type="text" placeholder="사유 — 거절할 때는 꼭 적습니다. 신청한 사람에게 그대로 보입니다" aria-label="사유"><button class="t-btn t-btn--2" type="button">거절</button><button class="t-btn" type="button">승인</button></div>
<p class="df-note"><span>승인하면 ${esc(C.next_version)}판이 정식 서비스가 되고 '기관 공유' 탭에서 기관에 공유할 수 있습니다.</span> <span>이미 공유된 기관(${esc(C.shared.map((s) => s.org).join(' · '))})은 새 판으로 바뀝니다.</span></p>
</section>
</div>`;
  return shell(o, { title: 'LX 관리자 · 배포 신청', desc: 'LX 관리자 — 배포 신청 목록 · 한 건의 판단 근거(정확도 · 결과 확인 · 적용해 본 곳 · 결과 장면 · 지난 판과 비교) · 승인 / 거절(사유)', role: 'admin', menu: ADMIN_MENU, current: '배포', body });
}

/* ═══════════ ③ LX 관리자 — 승인된 분석 서비스를 기관에 공유 ═══════════ */
function adminShare(o) {
  const C = V.card;
  const svc = V.services.map((s, i) => `<li${i === 3 ? ' class="is-on" aria-current="true"' : ''}><b>${esc(s.name)}</b><span class="num">${esc(s.v)}</span>${chip(s.state, s.state === '운영' ? 'ok' : 'wait')}<small>${s.orgs ? `공유 ${s.orgs}곳` : '공유 없음'}</small></li>`).join('');
  const orgs = V.orgs.map((g) => `<li class="df-org${g.on ? ' is-on' : ''}${g.wide ? ' is-wide' : ''}"><label><input type="checkbox"${g.on ? ' checked disabled' : ''} aria-label="${esc(g.name)}"><b>${esc(g.name)}</b><span>${esc(g.kind)}</span>${g.on ? `<em>${esc(g.since)} 공유 · ${esc(g.state)}</em>` : ''}</label>${g.wide ? `<div class="df-wide"><label><input type="radio" name="w" checked> 광역 기관만</label><label><input type="radio" name="w"> 소속 시군구 ${g.sub}곳도 함께</label><small>시군구에 기관 계정이 없는 곳은 계정이 생기면 자동으로 공유됩니다</small></div>` : ''}</li>`).join('');
  const shared = V.shared.map((r) => `<tr><td><b>${esc(r.svc)}</b></td><td>${esc(r.org)}</td><td class="num">${esc(r.when)}</td><td>${chip(r.state, r.lv)}</td><td><button class="t-btn t-btn--text" type="button">거두기</button></td></tr>`).join('');
  const body = `
<header class="df-head"><div><p class="t-label">LX 관리자</p><h1 class="df-title">배포</h1></div>${adminTabs(1)}</header>
<div class="df-grid df-grid--share">
<section class="t-card ld-card" aria-label="승인된 분석 서비스">
<div class="ld-h"><h2>승인된 분석 서비스<small class="ld-sub">${V.services.length}개</small></h2></div>
<ul class="df-svc">${svc}</ul>
<p class="df-note">첫 결과 전 · 승인 전 서비스는 공유할 수 없어 여기 없습니다.</p>
</section>
<section class="t-card ld-card df-sheet" aria-label="기관에 공유">
<div class="ld-h"><h2>${esc(C.name)}<small class="ld-sub">${esc(C.version)}판 · 기관에 공유</small></h2><span class="df-ver">${esc(C.line)}</span></div>
<p class="t-label">기관 고르기</p>
<ul class="df-orgs">${orgs}</ul>
<div class="df-decide"><p class="df-note"><span>공유하면 그 기관 '서비스 선택'에 바로 나타납니다(첫 결과 전).</span> <span>분석은 기관이 요청하거나 LX가 돌립니다.</span></p><button class="t-btn" type="button">공유</button></div>
</section>
</div>
<section class="t-card ld-card" aria-label="공유 상태">
<div class="ld-h"><h2>공유 상태<small class="ld-sub">어느 서비스가 어느 기관에 · ${V.shared.length}건</small></h2></div>
<table class="df-tbl df-tbl--shared"><thead><tr><th>서비스</th><th>기관</th><th>공유한 날</th><th>지금</th><th></th></tr></thead><tbody>${shared}</tbody></table>
<p class="df-note"><span>거두면 그 기관 화면에서 서비스가 사라지고, 결과와 이력은 LX가 보관합니다.</span> <span>기관 계정이 없는 지역의 결과(${esc(V.held_regions)})는 LX 보관 — 기관 계정이 생기면 여기서 공유합니다.</span></p>
</section>`;
  return shell(o, { title: 'LX 관리자 · 기관 공유', desc: 'LX 관리자 — 승인된 분석 서비스를 기관에 공유(시군구 · 광역과 소속 시군구) · 공유 상태 목록 · 거두기', role: 'admin', menu: ADMIN_MENU, current: '배포', body });
}

/* ═══════════ ④ 기관(남원시) — 서비스 선택에 공유받은 서비스가 나타남(연결만) ═══════════ */
function govScene(o) {
  const G = V.gov;
  const cards = G.cards.map((c) => `<article class="t-card df-gc${c.fresh ? ' is-fresh' : ''}"><div class="df-gc-img">${c.scene || c.scene_v3 ? `<img src="${c.scene ? `${o.assets}/${c.scene}` : `${o.v3}/${c.scene_v3}`}" alt="">` : `<span>${esc(c.blank)}</span>`}${c.fresh ? `<span class="df-gc-new">새로 공유됨 · ${esc(c.fresh)}</span>${EX}` : ''}</div><div class="df-gc-b"><h3>${esc(c.name)}</h3><p>${esc(c.line)}</p><dl><dt>상태</dt><dd>${esc(c.state)}</dd><dt>시작</dt><dd class="num">${esc(c.year)}</dd></dl><span class="t-btn${c.open ? '' : ' t-btn--2'}">${c.open ? '이 서비스 열기' : `${esc(c.year)}년 시작`}</span></div></article>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>[시안] 기관 · 서비스 선택 · Land-XI</title>
<meta name="description" content="설계 14차 시안 — 기관(남원시) 서비스 선택에 LX 관리자가 공유한 서비스가 나타나는 장면(기관 화면은 바꾸지 않고 연결만)">
<link rel="icon" href="${o.assets}/images/favicon_landxi.png">
<link rel="stylesheet" href="${o.v3}/kit/kit.css">
<link rel="stylesheet" href="df.css">
<style>:root{--accent:${G.accent}}</style>
</head>
<body class="t df-gov">
<header class="df-gov-mast"><b>${esc(G.mark.join(' '))}</b><span>${esc(G.platform)}</span><span class="sp"></span><nav><a aria-current="page">서비스 선택</a><a>서비스 대시보드</a><a>요청하기</a><a>기관 정보</a></nav><span class="df-gov-who">${esc(G.who)}</span></header>
<main class="df-gov-main">
<p class="df-stamp">시안 · 기관 화면은 그대로 — LX 관리자가 공유한 서비스가 여기에 나타난다는 연결만 보입니다 · <span class="df-ex">예시</span> 표시만 서버에 없는 값</p>
<h1 class="df-gov-h">${esc(G.short)} 서비스 선택<small>${G.cards.length}개 · 열 수 있는 것 ${G.cards.filter((c) => c.open).length}</small></h1>
<div class="df-gc-grid">${cards}</div>
<p class="df-note">서비스는 LX가 만들고 LX 관리자가 공유합니다. 새로 공유된 서비스는 첫 결과가 나오기 전에도 '요청하기'에서 분석을 요청할 수 있습니다.</p>
</main>
</body>
</html>
`;
}

/* ── 쓰기 ── */
for (const o of OUTS) {
  fs.mkdirSync(o.dir, { recursive: true });
  fs.writeFileSync(path.join(o.dir, 'staff-apply.html'), staffApply(o));
  fs.writeFileSync(path.join(o.dir, 'admin-requests.html'), adminRequests(o));
  fs.writeFileSync(path.join(o.dir, 'admin-share.html'), adminShare(o));
  fs.writeFileSync(path.join(o.dir, 'gov-scene.html'), govScene(o));
  if (o.dir !== HERE) fs.copyFileSync(path.join(HERE, 'df.css'), path.join(o.dir, 'df.css'));
  console.log('wrote', o.dir);
}
