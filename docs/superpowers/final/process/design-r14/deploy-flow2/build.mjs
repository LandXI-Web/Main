/* 설계 14차 · 분석 서비스 배포 — 2차 시안(페블 · 10-09 사용자 답 · 원칙 158 · 159 · 160 · 확인 대장 배포-1 · 2 · 4 · 5).
   1차(../deploy-flow)와 같은 셸(kit.css · console.css · df.css) 위에 df2.css 로 새 칸만 더한다. 숫자 · 이름 = 10-09 13:41 서버 응답(values.json · README §3).
   사용: node build.mjs → 이 폴더(docs) 와 landxi/proto/review/deploy-flow2/ 두 곳. v3 코드 수정 0 · 서버 쓰기 0 · GPU 0. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const OUTS = [
  { dir: HERE, v3: '../../../../../../landxi/v3', assets: '../../../../../../landxi/assets' },
  { dir: path.join(ROOT, 'landxi/proto/review/deploy-flow2'), v3: '../../../v3', assets: '../../../assets' },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EX = '<span class="df-ex">예시</span>';
const V = JSON.parse(fs.readFileSync(path.join(HERE, 'values.json'), 'utf8'));

/* ── 셸(1차와 같음) ── */
const ICON = {
  home: 'M3 9.5L10 4l7 5.5V16H3z', project: 'M3 5h5l2 2h7v9H3z', analyze: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4 M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z',
  map: 'M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11', xi: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M3 10h14 M10 3c-2.5 2-2.5 12 0 14 M10 3c2.5 2 2.5 12 0 14',
  data: 'M4 5c0-1.1 2.7-2 6-2s6 .9 6 2v10c0 1.1-2.7 2-6 2s-6-.9-6-2z M4 10c0 1.1 2.7 2 6 2s6-.9 6-2', inbox: 'M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4',
  gear: 'M10 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2', org: 'M3 17V7l7-4 7 4v10 M8 17v-5h4v5', deploy: 'M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4',
  list: 'M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01', check: 'M4 10.5l4 4 8-9', more: 'M3 5h14 M3 10h14 M3 15h14',
};
const STAFF_MENU = [['대시보드', 'home', 'lx-console/'], ['프로젝트', 'project', 'lx-project/'], ['분석하기', 'analyze', 'lx-analyze/'], ['지도 서비스', 'map', 'lx-analyze/?view=map'], ['XI맵', 'xi', 'xi-clean/'], ['데이터', 'data', 'lx-ingest/', 1], ['요청함', 'inbox', 'lx-inbox/']];
const ADMIN_MENU = [['현황', 'map', 'ops-core/'], ['인프라', 'gear', 'ops-infra/'], ['기관', 'org', 'ops-infra/?view=tenants'], ['배포', 'deploy', 'ops-infra/?view=deploys'], ['승인 요청', 'inbox', 'ops-core/#approvals'], ['검토 요청', 'list', 'lx-inbox/'], ['계정 관리', 'check', 'ops-accounts/']];

function shell(o, { title, desc, role, menu, current, body, stamp }) {
  const rail = menu.map(([label, ic, href, more], i) => `<a class="k-rail-i${more ? ' k-rail-i--more' : ''}" href="${o.v3}/${href}" data-i="${i}"${label === current ? ' aria-current="true"' : ''}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICON[ic]}"/></svg><span>${label}</span></a>`).join('')
    + `<button type="button" class="k-rail-i k-rail-more" aria-haspopup="dialog"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${ICON.more}"/></svg><span>메뉴</span></button>`;
  const home = role === 'admin' ? ['ops-core/', 'LX 관리자 대시보드', 'LX 관리자'] : ['lx-console/', 'LX 직원 대시보드', 'LX 직원'];
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>[시안] ${esc(title)} · Land-XI</title>
<meta name="description" content="설계 14차 2차 시안 — ${esc(desc)}">
<link rel="icon" href="${o.assets}/images/favicon_landxi.png">
<link rel="stylesheet" href="${o.v3}/kit/kit.css">
<link rel="stylesheet" href="${o.v3}/lx-console/console.css">
<link rel="stylesheet" href="df.css">
<link rel="stylesheet" href="df2.css">
</head>
<body class="t k-shelled">
<div class="k-app has-rail has-more is-staff">
<header class="t-mast k-mast"><a class="k-word" href="${o.v3}/${home[0]}"><span class="word">LAND-XI</span><span class="home">${home[1]}</span></a><span class="sp"></span><span class="k-mast-slot"></span><span class="t-fresh k-fresh k-sig" tabindex="0" data-live="1" aria-label="마지막 갱신 ${V.as_of}" data-why="마지막 갱신 ${V.as_of}"><i></i><span class="num">${V.as_of}</span></span><button class="t-role k-role k-me-b" type="button" title="내 정보" aria-haspopup="dialog">${home[2]}</button><a class="k-mast-b k-xi" href="${o.v3}/xi-clean/">XI맵</a><button class="k-mast-b k-help" type="button" aria-label="도움말">?</button><button class="k-mast-b k-exit" type="button">나가기</button></header>
<nav class="t-rail k-rail" aria-label="메뉴">${rail}</nav>
<main class="k-main" id="main">
<div class="df"><div class="df-in">
<p class="df-stamp">${stamp || `2차 시안 · 사용자 확인 전 · 숫자는 10월 9일 ${V.as_of} 서버 값 · <span class="df-ex">예시</span> 표시만 서버에 없는 값`}</p>
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
const head = (label, title, right = '') => `<header class="df-head"><div><p class="t-label">${esc(label)}</p><h1 class="df-title">${esc(title)}</h1></div>${right}</header>`;

/* '이 모델로 분석' 오른쪽 패널(배포-1 ⓐ · ⓑ 공통) */
function runPanel(o, m) {
  const P = V.project, C = V.card;
  const imgs = V.imagery.map((im, i) => `<li><label><input type="radio" name="img"${i === 0 ? ' checked' : ''} aria-label="${esc(im.name)}"><b>${esc(im.name)}</b><span>${esc(im.gsd)} · ${esc(im.where)}</span>${im.fit ? '' : '<em>해상도가 달라 줄여서 돌립니다</em>'}</label></li>`).join('');
  return `<section class="t-card ld-card df-sheet df-run" aria-label="이 모델로 분석">
<div class="ld-h"><h2>이 모델로 분석<small class="ld-sub">배포 신청 없이 · 내 분석</small></h2></div>
<dl class="df-dl df-dl--basis">
<div><dt>모델</dt><dd><b>${esc(m.label)}</b><span class="df-sub">${esc(m.classes)} · ${esc(m.input)} · 정확도 ${m.acc}% · ${esc(m.state)}</span></dd></div>
<div><dt>프로젝트</dt><dd><b>${esc(P.name)}</b><span class="df-sub">배포된 판은 ${esc(C.name)} ${esc(C.version)} — 다른 모델입니다</span></dd></div>
</dl>
<p class="t-label">영상 고르기</p>
<ul class="df-imgs">${imgs}<li class="df-imgs-up"><b>내 영상 올리기</b><span>${esc(V.upload)}</span><button class="t-btn t-btn--2" type="button">파일 고르기</button></li></ul>
<dl class="df-dl df-dl--basis">
<div><dt>보는 사람</dt><dd><b>나 · 프로젝트 참여자 ${P.members}명</b><span class="df-sub">기관 화면에는 나가지 않습니다 — 기관에 보이려면 배포 신청 → 승인 → 공유</span></dd></div>
<div><dt>결과 자리</dt><dd><b>지도 서비스 · 내가 돌린 분석</b><span class="df-sub">층 이름 '${esc(P.name)} · 내 모델 · 배포 전' — 같은 영상의 정식 서비스 결과와 겹쳐 볼 수 있습니다</span></dd></div>
<div><dt>걸리는 시간</dt><dd><b>남원시 전역 ${esc(C.runs[0].took)}</b><span class="df-sub">지난 기록 · 분석 대기열에 한 장씩 차례로 돕니다</span></dd></div>
</dl>
<div class="df-foot"><p><span>끝나면 요청함에 알리고</span> <span>지도 서비스에서 바로 엽니다.</span></p><button class="t-btn" type="button">분석 시작</button></div>
</section>`;
}

/* ═══════════ ① 배포-1 ⓐ — 분석하기 목록에 '내 프로젝트 모델' 묶음 ═══════════ */
function myModelA(o) {
  const P = V.project, m = P.trainings[0];
  const cards = V.official.map((c) => `<article class="df-oc"><div class="df-oc-img">${c.scene ? `<img src="${o.assets}/${c.scene}" alt="">` : '<span>결과 장면이 아직 없습니다</span>'}</div><h3>${esc(c.name)}</h3><p>${esc(c.line)}</p><small>정확도 ${c.acc}%</small></article>`).join('');
  const rows = [...P.trainings, { ...P.candidate, n: '프로젝트 밖 학습', when: '10.8 19:11', mine: true, cand: true }].map((t, i) => `<li${i === 0 ? ' class="is-on" aria-current="true"' : ''}><div class="df-mm-l"><b>${esc(t.label)}</b><span>${esc(t.classes)} · ${esc(t.input)}</span><small>${esc(t.n)} · ${esc(t.when)} · ${esc(t.state)}</small></div><div class="df-mm-acc"><em>정확도</em><b class="num">${t.acc}%</b>${bar(t.acc, i ? 'is-dim' : '')}</div><div class="df-mm-st">${t.deployed === false ? chip('배포 전') : t.cand ? chip('후보', 'wait') : ''}</div><button class="t-btn${i ? ' t-btn--2' : ''}" type="button">이 모델로 분석</button></li>`).join('');
  const body = `
${head('LX 직원', '분석하기', `<nav class="df-tabs" aria-label="분석하기"><a href="#" aria-current="page">정식 분석 서비스<b class="num">${V.official.length}</b></a><a href="#">내 프로젝트 모델<b class="num">3</b></a></nav>`)}
<section class="df-ocs" aria-label="정식 분석 서비스">${cards}</section>
<div class="df-grid df-grid--apply">
<section class="t-card ld-card" aria-label="내 프로젝트 모델">
<div class="ld-h"><h2>내 프로젝트 모델<small class="ld-sub">${esc(P.name)} · 학습 ${P.trainings.length}번 · 후보 1</small></h2><span class="df-ver">프로젝트장 ${esc(P.lead)} · 참여자 ${P.members}명</span></div>
<p class="df-lede">배포 신청을 하지 않아도 내 프로젝트에서 학습한 모델로 바로 분석할 수 있습니다. 결과는 나와 프로젝트 참여자만 봅니다.</p>
<ul class="df-mm">${rows}</ul>
<p class="df-note">다른 프로젝트(주차장 2026 · 건축물 2026 · 곤포사일리지 2026)의 모델은 프로젝트를 고르면 같은 자리에 나옵니다. 정식 서비스로 내보내려면 프로젝트 마지막 단계에서 배포 신청.</p>
</section>
${runPanel(o, m)}
</div>`;
  return shell(o, { title: 'LX 직원 · 분석하기 — 내 프로젝트 모델', desc: '배포-1 ⓐ 분석하기에 내 프로젝트 모델 묶음 — 배포 신청 없이 내 모델로 분석 · 보는 사람 · 결과는 지도 서비스', role: 'staff', menu: STAFF_MENU, current: '분석하기', body });
}

/* ═══════════ ① 배포-1 ⓑ — 프로젝트 안 학습 단계 '이 모델로 분석' ═══════════ */
function myModelB(o) {
  const P = V.project, m = P.trainings[0];
  const rows = P.trainings.map((t, i) => `<li${i === 0 ? ' class="is-on" aria-current="true"' : ''}><div class="df-mm-l"><b>${esc(t.n)}</b><span>${esc(t.label)} · ${esc(t.classes)}</span><small>${esc(t.when)} 끝 · ${esc(t.state)}</small></div><div class="df-mm-acc"><em>정확도</em><b class="num">${t.acc}%</b>${bar(t.acc, i ? 'is-dim' : '')}</div><div class="df-mm-st">${chip('배포 전')}</div><button class="t-btn${i ? ' t-btn--2' : ''}" type="button">이 모델로 분석</button></li>`).join('');
  const body = `
${head('프로젝트', P.name, `<div class="df-meta">${chip(P.task)}${P.regions.map((r) => chip(r, 'wait')).join('')}<span class="df-lead">프로젝트장 ${esc(P.lead)}</span></div>`)}
${stageBar([['데이터 올리기', 'done'], ['학습데이터 구축', 'done'], ['학습', 'now'], ['결과 확인', 'wait'], ['배포 신청', 'done']])}
<div class="df-grid df-grid--apply">
<section class="t-card ld-card" aria-label="학습">
<div class="ld-h"><h2>학습<small class="ld-sub">표본 ${P.sample.n}장 · ${esc(P.sample.when)} 올림 · 학습 ${P.trainings.length}번</small></h2><button class="t-btn t-btn--2" type="button">다시 학습</button></div>
<ul class="df-mm">${rows}</ul>
<div class="df-cand"><b>${esc(P.candidate.label)}</b><span>${esc(P.candidate.classes)} · 정확도 ${P.candidate.acc}% · ${esc(P.candidate.as_of)} · ${esc(P.candidate.state)}</span><button class="t-btn t-btn--text" type="button">이 프로젝트에 넣기</button></div>
<p class="df-note">학습이 끝난 모델은 결과 확인 · 배포 신청 전에도 여기서 바로 분석할 수 있습니다. 배포된 판(${esc(V.card.name)} ${esc(V.card.version)})은 LX 관리자가 관리합니다.</p>
</section>
${runPanel(o, m)}
</div>`;
  return shell(o, { title: 'LX 직원 · 프로젝트 — 이 모델로 분석', desc: '배포-1 ⓑ 프로젝트 학습 단계에서 이 모델로 분석 — 배포 신청 없이 · 보는 사람 · 결과는 지도 서비스', role: 'staff', menu: STAFF_MENU, current: '프로젝트', body });
}

/* ═══════════ ② 배포-2 — 신청서 = 서버 값 + 메모 한 칸 ═══════════ */
function applySheet(o, { first }) {
  const P = V.project, C = V.card, M = V.model_new, M0 = V.model_now, F = V.first;
  const name = first ? F.project : P.name;
  const ver = first ? '1.0' : C.next_version;
  const svc = first ? F.card : C.name;
  const model = first ? F.model : M;
  const acc = first
    ? `<div class="df-cmp"><span><em>이번 판</em><b class="num">${model.acc}%</b>${bar(model.acc)}</span><span><em>지난 판</em><b class="num df-dim">—</b><small class="df-sub">첫 판 · 비교할 판이 없습니다</small></span></div><span class="df-sub">학습 끝 검증 값 · ${esc(model.as_of)}</span>`
    : `<div class="df-cmp"><span><em>이번 판</em><b class="num">${M.acc}%</b>${bar(M.acc)}</span><span><em>지난 판 ${esc(C.version)}</em><b class="num df-dim">${M0.acc}%</b>${bar(M0.acc, 'is-dim')}</span></div><span class="df-sub">학습 끝 검증 값 · ${esc(M.as_of)} · 찾는 것이 ${esc(M.classes)} 1종으로 바뀜(지난 판은 ${esc(M0.classes)})</span>`;
  const data = first
    ? `<b>표본 ${F.sample.n}장 · ${esc(F.sample.when)} · ${esc(F.sample.region)}</b><span class="df-sub">학습데이터 구축 단계에서 올린 표본 · 공유 데이터셋에 자산으로 등록됨</span>`
    : `<b>표본 ${P.sample.n}장 · ${esc(P.sample.when)}</b><span class="df-sub df-warn">10월 8일 학습은 이 표본과 연결 기록이 없습니다 — 신청 전에 학습 데이터를 이어 주세요</span>`;
  const runs = first
    ? `<b>${esc(F.applied.join(' · '))}</b><span class="df-sub">시범 1곳 · 결과 반영</span>`
    : `<ul class="df-runs">${C.runs.map((r) => `<li><b>${esc(r.where)}</b><span>${esc(r.n)} · ${esc(r.area)} · ${esc(r.when)}</span></li>`).join('')}</ul><span class="df-sub">이 프로젝트에서 돌린 분석 · 결과 장면은 여기서 고릅니다</span>`;
  const body = `
${head('프로젝트', name, `<div class="df-meta">${chip(first ? F.task : P.task)}${(first ? [F.region] : P.regions).map((r) => chip(r, 'wait')).join('')}<span class="df-lead">프로젝트장 ${esc(P.lead)}</span></div>`)}
${stageBar([['데이터 올리기', 'done'], ['학습데이터 구축', 'done'], ['학습', 'done'], ['결과 확인', 'wait'], ['배포 신청', 'now']])}
<div class="df-grid df-grid--apply">
<section class="t-card ld-card df-form" aria-label="배포 신청서">
<div class="ld-h"><h2>배포 신청<small class="ld-sub">${esc(svc)} · ${esc(ver)}판${first ? ' · 첫 판' : ''}</small></h2>${first ? `<span class="df-ver">지난 판 없음</span>` : `<span class="df-ver">지난 판 ${esc(C.version)} · ${esc(C.approved_at)} 승인</span>`}</div>
<p class="df-lede">신청서의 값은 모두 서버 기록에서 옵니다. 직원이 적는 것은 메모 한 칸뿐입니다.</p>
<dl class="df-dl">
<div><dt>서비스</dt><dd><b>${esc(svc)}</b> <span class="df-sub">${esc(first ? F.line : C.line)}</span></dd></div>
<div><dt>모델</dt><dd><b>${esc(model.label)}</b> <span class="df-sub">${esc(model.classes)} · ${esc(model.input)}${first ? '' : ` · 지난 판은 ${esc(M0.label)}`}</span></dd></div>
<div><dt>정확도</dt><dd>${acc}</dd></div>
<div><dt>학습 데이터</dt><dd>${data}</dd></div>
<div><dt>결과 확인</dt><dd><b class="df-warn">${esc(first ? F.review : P.review)}</b> <span class="df-sub">결과 확인 단계가 남았습니다 — 관리자 검증 화면에 그대로 보입니다</span></dd></div>
<div><dt>결과 장면</dt><dd>${runs}</dd></div>
</dl>
<div class="df-fields">
<div class="df-f df-f--wide"><span>대표 장면</span><div class="df-scene">${first ? '<div class="df-scene-blank">아직 고르지 않음</div>' : `<img src="${o.assets}/${C.scene}" alt="${esc(C.scene_caption)}">`}<div><b>${first ? '보령시 결과에서 한 장면을 고릅니다' : C.scene_caption.split(' · ').map((s) => `<span>${esc(s)}</span>`).join(' · ')}</b><small>${first ? '첫 판은 대표 장면이 없어 직원이 고릅니다 · 기관 서비스 선택에 보이는 그림' : '지금 카드의 대표 장면 · 위 결과에서 다른 장면을 고를 수 있습니다'}</small><button class="t-btn t-btn--2" type="button">${first ? '장면 고르기' : '다른 장면 고르기'}</button></div></div></div>
<label class="df-f df-f--wide"><span>메모</span><textarea class="t-input" rows="2" placeholder="${first ? '예: 보령시 2023 항공영상으로 처음 만든 서비스입니다' : `예: 10월 8일 다시 학습한 모델로 바꿨습니다 · 비닐하우스만 찾습니다`}" aria-label="메모"></textarea><small>관리자가 승인할 때 읽습니다 · 비워 둬도 됩니다</small></label>
</div>
<div class="df-foot"><p><span>신청하면 LX 관리자가 직접 돌려 보고 검토합니다.</span> <span>거절되면 사유가 여기에 보이고, 고쳐서 다시 신청할 수 있습니다.</span></p><button class="t-btn" type="button">배포 신청</button></div>
</section>
<div class="df-col">
<section class="t-card ld-card" aria-label="신청 상태">
<div class="ld-h"><h2>신청 상태</h2></div>
<ol class="df-flow"><li data-st="now"><b>신청 전</b><small>${esc(ver)}판 · 아직 보내지 않음</small></li><li><b>검토 중</b><small>LX 관리자가 시험 영상으로 돌려 봅니다</small></li><li><b>승인</b><small>정식 서비스 · 기관에 공유 가능</small></li><li data-alt="1"><b>거절</b><small>사유를 보고 고쳐서 다시 신청</small></li></ol>
</section>
${first ? `<section class="t-card ld-card" aria-label="지난 판"><div class="ld-h"><h2>지난 판</h2></div><p class="df-empty">첫 판입니다 — 승인되면 여기에 1.0판 기록이 남습니다.</p></section>` : `<section class="t-card ld-card" aria-label="지난 판"><div class="ld-h"><h2>지난 판<small class="ld-sub">${C.history.length}판</small></h2></div><ul class="df-hist">${C.history.map((hh) => `<li><b class="num">${esc(hh.v)}</b><div><span>${esc(hh.when)} · ${esc(hh.what)}</span>${hh.why ? `<small>${esc(hh.why)}</small>` : ''}</div></li>`).join('')}</ul></section>`}
<section class="t-card ld-card" aria-label="공유된 기관">
<div class="ld-h"><h2>공유된 기관<small class="ld-sub">${first ? '0곳' : C.shared.length + '곳'}</small></h2></div>
${first ? `<p class="df-empty">아직 없습니다 — 승인 뒤 LX 관리자가 공유합니다.</p>` : `<ul class="df-hist df-hist--org">${C.shared.map((s) => `<li><b>${esc(s.org)}</b><div><span>${esc(s.when)} 공유 · ${esc(s.state)}</span></div></li>`).join('')}</ul>`}
</section>
</div>
</div>`;
  return shell(o, {
    title: first ? 'LX 직원 · 배포 신청(첫 판)' : 'LX 직원 · 배포 신청(2차)', desc: first ? '배포-2 첫 판일 때 — 지난 판 비교 자리가 비고 메모 한 칸' : '배포-2 신청서 = 서버 값(모델 · 정확도 · 학습 데이터 · 결과 장면) + 메모 한 칸', role: 'staff', menu: STAFF_MENU, current: '프로젝트', body,
    stamp: first ? `2차 시안 · 첫 판일 때 모습 — 곤포사일리지 2026 프로젝트 값으로 그림(실제로는 1.0판이 이미 승인됨) · <span class="df-ex">예시</span> 표시만 서버에 없는 값` : undefined,
  });
}

/* ═══════════ ③ 배포-4 — 관리자 검증: 시험 영상으로 새 판 · 지금 판 나란히 ═══════════ */
const adminTabs = (cur, third = '적용 현황') => `<nav class="df-tabs" aria-label="배포"><a href="admin-verify.html"${cur === 0 ? ' aria-current="page"' : ''}>배포 신청<b class="num">1</b></a><a href="admin-share2.html"${cur === 1 ? ' aria-current="page"' : ''}>기관 공유</a><a href="${third === '사용 현황' ? 'admin-usage-b.html' : '#'}"${cur === 2 ? ' aria-current="page"' : ''}>${third}${third === '적용 현황' ? `<b class="num">${V.admin_home.deploys}</b>` : ''}</a></nav>`;

function adminVerify(o) {
  const C = V.card, M = V.model_new, M0 = V.model_now, P = V.project;
  const rows = V.requests.map((r, i) => `<tr${i === 0 ? ' class="is-on" aria-current="true"' : ''}><td><b>${esc(r.name)}</b></td><td class="num">${esc(r.v)}</td><td class="num">${esc(r.at)}</td><td>${chip(r.state, r.lv)}${r.ex ? EX : ''}</td></tr>`).join('');
  const imgs = V.imagery.slice(0, 4).map((im, i) => `<li><label><input type="radio" name="timg"${i === 0 ? ' checked' : ''} aria-label="${esc(im.name)}"><b>${esc(im.name)}</b><span>${esc(im.gsd)} · ${esc(im.where)}</span></label></li>`).join('');
  const pane = (title, m, scene, n, took, cur) => `<figure class="df-pane${cur ? ' is-cur' : ''}"><figcaption><b>${esc(title)}</b><span>${esc(m.label)} · ${esc(m.classes)}</span></figcaption><div class="df-pane-img"><img src="${o.assets}/${scene}" alt="">${cur ? '' : EX}</div><dl><div><dt>찾은 것</dt><dd class="num">${esc(n)}</dd></div><div><dt>정확도</dt><dd class="num">${m.acc}%</dd></div><div><dt>걸린 시간</dt><dd>${esc(took)}</dd></div></dl></figure>`;
  const body = `
${head('LX 관리자', '배포', adminTabs(0))}
<div class="df-grid df-grid--verify">
<section class="t-card ld-card df-list" aria-label="배포 신청 목록">
<div class="ld-h"><h2>배포 신청<small class="ld-sub">검토 중 1 · 처리함 ${V.requests.length - 1}</small></h2></div>
<table class="df-tbl"><thead><tr><th>서비스</th><th>판</th><th>신청일</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table>
<p class="df-note">다른 승인 요청 ${V.pending_other}건은 '승인 요청' 메뉴에서.</p>
<div class="df-apply-note"><p class="t-label">신청서</p><dl class="df-dl df-dl--basis"><div><dt>신청</dt><dd><b>${esc(V.requests[0].who)} · ${esc(P.name)}</b><span class="df-sub">10.9 11:20 ${EX}</span></dd></div><div><dt>학습 데이터</dt><dd><b>표본 ${P.sample.n}장 · ${esc(P.sample.when)}</b><span class="df-sub df-warn">10월 8일 학습과 연결 기록 없음</span></dd></div><div><dt>결과 확인</dt><dd><b class="df-warn">${esc(P.review)}</b></dd></div><div><dt>메모 ${EX}</dt><dd><b>10월 8일 다시 학습한 모델로 바꿨습니다 · 비닐하우스만 찾습니다</b></dd></div></dl></div>
</section>
<section class="t-card ld-card df-sheet" aria-label="직접 돌려 보기">
<div class="ld-h"><h2>직접 돌려 보기<small class="ld-sub">${esc(C.name)} ${esc(C.next_version)}판 신청 · 새 판과 지금 판을 같은 영상으로</small></h2></div>
<div class="df-trial"><div><p class="t-label">시험 영상</p><ul class="df-imgs df-imgs--row">${imgs}<li class="df-imgs-up"><b>영상 올리기</b><span>${esc(V.upload)}</span><button class="t-btn t-btn--2" type="button">파일 고르기</button></li></ul></div><div class="df-trial-go"><p class="df-note"><span>두 판이 분석 대기열에 한 장씩 차례로 돕니다.</span> <span>남원시 전역은 판마다 ${esc(C.runs[0].took)} — 읍면동 하나만 골라 먼저 볼 수 있습니다.</span></p><label class="df-f"><span>범위</span><select class="t-input" aria-label="범위"><option>남원시 전역</option><option>덕과면만</option><option>읍면동 고르기</option></select></label><button class="t-btn" type="button">두 판 돌리기</button></div></div>
<div class="df-panes">${pane('새 판 ' + C.next_version, M, C.scene, '돌리기 전', '—', false)}${pane('지금 판 ' + C.version, M0, C.scene2, C.runs[0].n, C.runs[0].took, true)}</div>
<p class="df-note"><span>지금 판은 10.7 남원시 전역 결과를 그대로 보이고, 새 판은 돌린 뒤 찾은 것 · 걸린 시간이 채워집니다(새 판 장면은 자리 보기 ${EX}).</span> <span>결과 두 장은 지도 서비스에서 층으로 겹쳐 볼 수 있습니다.</span></p>
<div class="df-decide"><input class="t-input" type="text" placeholder="사유 — 거절할 때는 꼭 적습니다. 신청한 사람에게 그대로 보입니다" aria-label="사유"><button class="t-btn t-btn--2" type="button">거절</button><button class="t-btn" type="button">승인</button></div>
<p class="df-note"><span>승인하면 ${esc(C.next_version)}판이 정식 서비스가 되고 '기관 공유' 탭에서 기관에 공유할 수 있습니다.</span> <span>이미 공유된 남원시는 새 판으로 바뀝니다.</span></p>
</section>
</div>`;
  return shell(o, { title: 'LX 관리자 · 배포 신청 검증', desc: '배포-4 관리자가 신청된 모델을 직접 돌려 보기 — 시험 영상 한 곳에 새 판 · 지금 판 나란히 · 결과 두 장 비교 · 승인 / 거절', role: 'admin', menu: ADMIN_MENU, current: '배포', body });
}

/* ═══════════ ④ 배포-5 — 기관 공유 = 서비스별 기관 체크(공유 상태 표 없음) ═══════════ */
function adminShare2(o) {
  const cols = V.orgs.map((g) => `<th><b>${esc(g.name)}</b><small>${esc(g.kind)}</small></th>`).join('');
  const rows = V.services.map((s) => `<tr><td><b>${esc(s.name)}</b><small>${esc(s.v)}판 · ${esc(s.state)}</small></td>${V.orgs.map((g) => { const on = s.on.includes(g.name); return `<td class="df-ck"><label><input type="checkbox"${on ? ' checked' : ''} aria-label="${esc(s.name)} · ${esc(g.name)}">${on && g.wide && s.sub ? `<small>${esc(s.sub)}</small>` : on ? '<small>공유 중</small>' : ''}</label></td>`; }).join('')}<td class="df-ck-use">${s.on.length ? `<a href="admin-usage-b.html">사용 현황</a>` : '<span class="df-sub">—</span>'}</td></tr>`).join('');
  const body = `
${head('LX 관리자', '배포', adminTabs(1, '사용 현황'))}
<section class="t-card ld-card" aria-label="기관 공유">
<div class="ld-h"><h2>기관 공유<small class="ld-sub">승인된 서비스 ${V.services.length} · 기관 ${V.orgs.length}</small></h2><span class="df-ver">체크를 바꾸면 바로 그 기관 '서비스 선택'에 나타나거나 사라집니다</span></div>
<table class="df-tbl df-tbl--matrix"><thead><tr><th>서비스</th>${cols}<th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="df-note"><span>광역 기관은 체크하면 소속 시군구 중 기관 계정이 있는 곳까지 함께 보입니다(광주전남 · 경작·휴경은 지금 4곳).</span> <span>공유를 거두면 기관 화면에서 사라지고 결과 · 이력은 LX가 보관합니다.</span> <span>기관 계정이 없는 지역의 결과(증평군 · 함양군 등)는 계정이 생기면 여기서 체크합니다.</span></p>
</section>`;
  return shell(o, { title: 'LX 관리자 · 기관 공유(2차)', desc: '배포-5 기관 공유 = 서비스별 기관 체크 한 표 · 공유 상태 표 없음 · 사용 현황으로 잇기', role: 'admin', menu: ADMIN_MENU, current: '배포', body });
}

/* 사용 현황 표(ⓐ · ⓑ 공통) */
function usageTable(full) {
  const rows = V.usage.map((u) => `<tr><td><b>${esc(u.org)}</b></td><td>${esc(u.svc)}<small>${esc(u.since)} 공유</small></td><td>${u.lx_runs ? `<b class="num">${u.lx_runs}회</b><small>${esc(u.area)} · 마지막 ${esc(u.lx_last)}</small>` : '<span class="df-sub">—</span>'}</td><td>${u.org_runs ? `<b class="num">${u.org_runs}회</b><small>${esc(u.req)} · ${esc(u.org_last)}</small>` : u.req ? `<b class="num">0회</b><small>${esc(u.req)}</small>` : '<span class="df-sub">0회</span>'}</td><td class="num">${esc(u.org_last || u.lx_last || '—')}</td></tr>`).join('');
  const tot = V.org_totals.map((t) => `<li><b>${esc(t.org)}</b><div><span>서비스 ${t.svcs} · 분석 ${t.runs}회${t.last ? ' · 마지막 ' + esc(t.last) : ''}</span><small>XI ChatGEO 요청 이번 달 ${t.chat}건 · 저장 공간 ${esc(t.storage)}</small></div></li>`).join('');
  return `<table class="df-tbl df-tbl--usage"><thead><tr><th>기관</th><th>서비스</th><th>LX가 돌린 분석</th><th>기관이 요청한 분석</th><th>마지막 사용</th></tr></thead><tbody>${rows}</tbody></table>
${full ? `<div class="df-org-tot"><p class="t-label">기관별 합계 · 이번 달</p><ul class="df-hist df-hist--org">${tot}</ul></div>` : ''}
<p class="df-note"><span>분석 횟수 · 면적 · 마지막 사용은 작업 기록과 사용량 기록에서 셉니다.</span> <span>기관 담당자가 서비스를 열어 본 횟수는 아직 기록하지 않습니다 — 넣으려면 새로 필요(README).</span></p>`;
}

/* ④ 배포-5 ⓐ — LX 관리자 대시보드 칸 */
function usageA(o) {
  const H = V.admin_home;
  const body = `
${head('LX 관리자', '현황')}
<div class="df-home">
<section class="t-card ld-card df-home-map" aria-label="배포 지도"><div class="ld-h"><h2>배포 지도<small class="ld-sub">기관 ${H.orgs} · 적용 ${H.deploys}</small></h2></div><div class="df-map-blank"><span>지금 화면 그대로 — 바꾸지 않음</span></div></section>
<div class="df-col">
<section class="t-card ld-card" aria-label="승인 대기"><div class="ld-h"><h2>승인 대기</h2></div><p class="df-big"><b class="num">${H.pending}</b><span>건 · 배포 신청 1 포함</span></p><a class="t-btn t-btn--2" href="admin-verify.html">승인 요청함 열기</a></section>
<section class="t-card ld-card" aria-label="경보"><div class="ld-h"><h2>경보</h2></div><p class="df-empty">경보 없음</p></section>
</div>
</div>
<section class="t-card ld-card is-new" aria-label="서비스 사용 현황">
<div class="ld-h"><h2>서비스 사용 현황<small class="ld-sub">기관에 공유한 서비스 · 지금 '기관 사용량' 칸 자리</small></h2><a class="t-btn t-btn--text" href="admin-share2.html">기관 공유로</a></div>
${usageTable(true)}
</section>`;
  return shell(o, { title: 'LX 관리자 대시보드 · 서비스 사용 현황', desc: '배포-5 ⓐ 사용 현황을 LX 관리자 대시보드 한 칸으로 — 기관별 · 서비스별 분석 횟수 · 면적 · 마지막 사용', role: 'admin', menu: ADMIN_MENU, current: '현황', body });
}

/* ④ 배포-5 ⓑ — 배포 메뉴 '사용 현황' 탭 */
function usageB(o) {
  const body = `
${head('LX 관리자', '배포', adminTabs(2, '사용 현황'))}
<section class="t-card ld-card" aria-label="사용 현황">
<div class="ld-h"><h2>사용 현황<small class="ld-sub">기관에 공유한 서비스 ${V.usage.length}건 · 기관 ${V.org_totals.filter((t) => t.svcs).length}</small></h2><label class="df-filter"><span>기관</span><select class="t-input" aria-label="기관"><option>모든 기관</option>${V.orgs.map((g) => `<option>${esc(g.name)}</option>`).join('')}</select></label></div>
${usageTable(true)}
</section>`;
  return shell(o, { title: 'LX 관리자 · 배포 — 사용 현황', desc: '배포-5 ⓑ 사용 현황을 배포 메뉴 세 번째 탭으로 — 배포 신청 · 기관 공유 · 사용 현황이 한 자리', role: 'admin', menu: ADMIN_MENU, current: '배포', body });
}

/* ── 쓰기 ── */
for (const o of OUTS) {
  fs.mkdirSync(o.dir, { recursive: true });
  fs.writeFileSync(path.join(o.dir, 'staff-mymodel-a.html'), myModelA(o));
  fs.writeFileSync(path.join(o.dir, 'staff-mymodel-b.html'), myModelB(o));
  fs.writeFileSync(path.join(o.dir, 'staff-apply2.html'), applySheet(o, { first: false }));
  fs.writeFileSync(path.join(o.dir, 'staff-apply2-first.html'), applySheet(o, { first: true }));
  fs.writeFileSync(path.join(o.dir, 'admin-verify.html'), adminVerify(o));
  fs.writeFileSync(path.join(o.dir, 'admin-share2.html'), adminShare2(o));
  fs.writeFileSync(path.join(o.dir, 'admin-usage-a.html'), usageA(o));
  fs.writeFileSync(path.join(o.dir, 'admin-usage-b.html'), usageB(o));
  if (o.dir !== HERE) for (const f of ['df.css', 'df2.css']) fs.copyFileSync(path.join(HERE, f), path.join(o.dir, f));
  console.log('wrote', o.dir);
}
