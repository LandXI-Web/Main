/* 설계 13차 · LX 직원 화면 셋 'v3 + 내용' 시안 만들기.
   src/v3-*.html = 지금 v3 화면을 로그인 폼으로 열어 그린 뒤의 마크업 그대로(10-09 09:05 · 스크립트만 뺌).
   여기에 더한 칸만 끼워 넣고, 경로를 상대경로로 바꿔 landxi/proto/review/lx-staff-v3plus/ 에 쓴다(v3 kit · 화면 CSS 를 그대로 읽는다).
   숫자는 values.json(같은 시각 서버 응답에서 뽑은 값) 한 곳에서. 사용: node build.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../../../../../landxi/proto/review/lx-staff-v3plus');
fs.mkdirSync(OUT, { recursive: true });
const V = JSON.parse(fs.readFileSync(path.join(HERE, 'values.json'), 'utf8'));
const read = (f) => fs.readFileSync(path.join(HERE, 'src', f), 'utf8');

/* ── 공통 ── */
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const mb = (b) => (b / 1e6).toFixed(1);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const md = (s) => { const d = new Date(s); return `${d.getMonth() + 1}.${d.getDate()}`; };
const bar = (w) => `<span class="k-me-bar" role="img" aria-label="${w}%"><i style="width:${Math.max(w > 0 ? 1 : 0, w)}%"></i></span>`;
const barRow = (name, w, val, extra = '') => `<li><span class="lp-n">${name}</span>${bar(w)}<span class="lp-v">${val}</span>${extra}</li>`;
const cell = (v, label, cls = '') => `<div class="ld-cell ${cls}"><b class="num">${v}</b><span>${label}</span></div>`;
const head = (title, sub, more) => `<div class="ld-h"><h2>${title}${sub ? `<small class="ld-sub">${sub}</small>` : ''}</h2>${more || ''}</div>`;
const tag = (t) => `<span class="lp-tag">${t}</span>`;

/** 경로 — v3 화면 폴더(base: 'lx-console' | 'lx-project') 기준 상대경로 → 미리보기 폴더 기준 */
function paths(s, base) {
  return s
    .replace(/http:\/\/localhost:4173\/landxi\//g, '../../../')
    .replace(/(href|src)="\/landxi\//g, '$1="../../../')
    .replace(/href="\.\.\/kit\//g, 'href="../../../v3/kit/')
    .replace(/href="\.\.\/\.\.\/assets\//g, 'href="../../../assets/')
    .replace(/href="(console|context|project)\.css"/g, (m, f) => `href="../../../v3/${f === 'console' ? 'lx-console' : 'lx-project'}/${f}.css"`)
    .replace(/발행 요청/g, '서비스 공개')                      // 화면 용어표(발행 → 서비스 공개) — v3 단계 띠의 다섯째 이름
    .replace(/<html lang="ko"[^>]*>/, '<html lang="ko">');
}
const addCss = (s, extra = '') => s.replace('</head>', `${extra}<link rel="stylesheet" href="plus.css">\n<script>(function(){var q=new URLSearchParams(location.search);var d=document.documentElement;if(q.get('v'))d.dataset.v=q.get('v');if(q.get('notice'))d.dataset.notice=q.get('notice');})();</script>\n</head>`);
const stamp = (s, label) => s.replace('<title>', `<title>[시안] `).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="설계 13차 시안 — ${label} · v3 화면 마크업 그대로 + 더한 칸 · 서버 값 10-09 09:06">`);
/** 섹션 끝 찾기 — aria-label 로 연 section 의 닫는 태그 뒤 위치(중첩 section 없음) */
function after(s, aria) {
  const i = s.indexOf(`aria-label="${aria}"`);
  if (i < 0) throw new Error('없음 ' + aria);
  const j = s.indexOf('</section>', i);
  return j + '</section>'.length;
}
const insertAt = (s, at, html) => s.slice(0, at) + html + s.slice(at);

/* ── 서버 값(values.json) ── */
const P = V.projects.slice().sort((a, b) => b.storage - a.storage);
const used = V.profile.used;
const storeBars = P.map((p) => barRow(p.name, pct(p.storage, used), `${mb(p.storage)} MB`)).join('');
const J = V.jobsMine;
const kmax = Math.max(...J.kinds.map((k) => k.n));

let DASH = '';
/* ━━ ① 대시보드 ━━ */
{
  let s = paths(read('v3-dash.html'), 'lx-console');
  s = stamp(addCss(s), 'LX 직원 대시보드');
  const store = `<section class="t-card ld-card lp-store" aria-label="저장 용량">${head('저장 용량', V.profile.quota === null ? '할당 없음' : '', '<a class="ld-more" href="my.html">내 정보</a>')}
<div class="lp-big"><b class="num">${mb(used)}</b><span class="lp-u">MB</span><small>프로젝트 ${V.profile.projects}개</small></div>
<ul class="lp-bars">${storeBars}</ul></section>`;
  const jobs = `<section class="t-card ld-card lp-jobs" aria-label="내가 돌린 작업">${head('내가 돌린 작업', `${md(J.first)} – ${md(J.last)}`)}
<div class="lp-two"><div class="ld-cells" style="grid-template-columns:repeat(2,minmax(0,1fr));row-gap:18px">${cell(fmt(J.done), '끝남')}${cell(J.failed, '실패', J.failed ? 'is-warn' : 'is-zero')}${cell(J.cancelled, '취소')}${cell(J.running, '지금 도는 것', J.running ? '' : 'is-zero')}</div>
<ul class="lp-bars">${J.kinds.map((k) => barRow(k.kind, pct(k.n, kmax), `${fmt(k.n)}건`)).join('')}</ul></div>
<p class="lp-foot lp-sep"><span>실패 ${J.failed}건은 모두 학습(건축물 2 · 비닐하우스 1)</span>${tag('서버에 더할 것: 작업 집계 한 곳')}</p></section>`;
  const notice = `<section class="t-card ld-card lp-notice" aria-label="공지 · AI 교육">${head(`공지 · AI 교육${tag('예시')}`, '', '<a class="ld-more" href="../../../v3/help-my/">지원</a>')}
<ul class="lp-rows is-ex"><li><span class="lp-st">공지</span><span><b>학습데이터 라벨 규칙 안내</b></span></li><li><span class="lp-st">공지</span><span><b>서비스 공개 절차 안내</b></span></li><li><span class="lp-st">교육</span><span><b>학습데이터 만들기 기초</b></span></li><li><span class="lp-st">교육</span><span><b>AI 분석 결과 확인 요령</b></span></li></ul>
<p class="lp-foot">${tag('서버에 더할 것')}<span>LX 전체 공지 · AI 교육 자료</span></p></section>`;
  /* 왼쪽 단 끝(우리 서비스 뒤) = 내가 돌린 작업 · 오른쪽 = 바로 분석하기 뒤 저장 용량 · 최근 활동 뒤 공지 */
  s = insertAt(s, after(s, '최근 활동'), notice);
  s = insertAt(s, after(s, '바로 분석하기'), store);
  s = insertAt(s, after(s, '우리 서비스'), jobs);
  fs.writeFileSync(path.join(OUT, 'dashboard.html'), s);
  DASH = s;
}

/* ━━ ② 프로젝트 한 장(비닐하우스 2026) ━━ */
{
  let s = paths(read('v3-project.html'), 'lx-project');
  s = stamp(addCss(s, '<link rel="stylesheet" href="../../../v3/lx-console/console.css">\n'), '프로젝트 한 장');
  const pr = V.projects.find((p) => p.name === '비닐하우스 2026');
  const S = V.sample;
  const labels = S.classes.reduce((a, c) => a + c.objects, 0);
  const cls = S.classes.slice().sort((a, b) => b.images - a.images)
    .map((c) => `<li><span class="lp-n">${c.name}</span>${bar(pct(c.images, S.images))}<span class="lp-v">${fmt(c.images)}장</span><span class="lp-x">라벨 ${fmt(c.objects)}</span></li>`).join('');
  const data = `<section class="t-card ld-card lp-data" aria-label="학습데이터">${head('학습데이터', '표본 1묶음 · 9.30 올림', '<a class="ld-more" href="../../../v3/lx-train/?project=prj_3fdba452d5&amp;stage=label&amp;flow=1">학습데이터 구축</a>')}
<div class="ld-cells ld-cells--4">${cell(fmt(S.images), '올린 이미지')}${cell(fmt(S.train), '학습용')}${cell(fmt(S.val), '검증용')}${cell(fmt(labels), '라벨')}</div>
<div class="lp-sep"><ul class="lp-bars lp-bars--wide">${cls}</ul></div>
<p class="lp-foot"><span>클래스별 이미지 수 — 한 이미지에 여러 클래스가 있어 합이 ${fmt(S.images)}보다 큽니다.</span> <span>뺀 이미지 ${S.excluded}장 · 라벨 없는 이미지</span>${tag('서버에 더할 것')}</p></section>`;
  const usage = `<section class="t-card ld-card" aria-label="프로젝트 사용량">${head('프로젝트 사용량')}
<div class="lp-big"><b class="num">${mb(pr.storage)}</b><span class="lp-u">MB</span><small>내 전체 ${mb(used)} MB 가운데 ${pct(pr.storage, used)}%</small></div>
${bar(pct(pr.storage, used))}
<p class="lp-foot"><span>학습 표본 ${fmt(S.images)}장 · 올린 파일 0개</span> <span>· 이 서비스로 돈 AI 분석 6번</span></p></section>`;
  const H = [
    ['10.07 18:33', '남원시 AI 분석', 'LX 직원', '끝'], ['10.07 18:12', '함양군 AI 분석', 'LX 직원', '끝'], ['10.07 18:00', '증평군 AI 분석', 'LX 직원', '끝'],
    ['09.30 16:43', '남원시 AI 분석', 'LX 관리자', '끝'], ['09.30 16:18', '함양군 AI 분석', 'LX 관리자', '끝'], ['09.30 15:33', '학습', 'LX 직원', '끝'],
    ['09.30 15:15', '증평군 AI 분석', 'LX 관리자', '끝'], ['09.30 15:12', '학습', 'LX 직원', '실패'], ['09.30 14:29', '학습', 'LX 직원', '끝'],
  ];
  const hist = `<section class="t-card ld-card" aria-label="작업 이력">${head('작업 이력', `끝 ${H.filter((x) => x[3] === '끝').length} · 실패 ${H.filter((x) => x[3] === '실패').length}`)}
<ul class="lp-rows lp-rows--2">${H.map(([w, t, who, st]) => `<li><span class="lp-w">${w}</span><span><b>${t}</b> <i>${who}</i></span><span class="lp-st${st === '실패' ? ' is-no' : ''}">${st}</span></li>`).join('')}</ul></section>`;
  /* 첫 줄 = v3 '지금 할 일' 옆에 프로젝트 사용량 · 그 아래 학습데이터 · 작업 이력(두 단) */
  const a = s.indexOf('<section class="t-card lxp-now"'), b = after(s, '지금 할 일');
  s = s.slice(0, a) + `<div class="lxp-pair">${s.slice(a, b)}${usage}</div>` + data + hist + s.slice(b);
  fs.writeFileSync(path.join(OUT, 'project.html'), s);
}

/* ━━ ③ 내 정보(v3 창 + 저장 용량 · 늘리기 요청 이력) ━━ */
{
  /* 뒤 바탕 = 이 시안의 대시보드(①) · 창 = v3 내 정보 창 마크업(modal.css · dept.css 함께) */
  const me = paths(read('v3-me.html'), 'lx-console');
  const links = (me.match(/<link rel="stylesheet" href="[^"]*(modal|dept)\.css"[^>]*>/g) || []).join('\n');
  const box = me.slice(me.indexOf('<div class="k-md-bg'), me.lastIndexOf('</body>'));
  let s = DASH.replace('<link rel="stylesheet" href="plus.css">', links + '\n<link rel="stylesheet" href="plus.css">')
    .replace('</body>', box + '</body>').replace(/<title>\[시안\] [^<]*<\/title>/, '<title>[시안] 내 정보 · Land-XI</title>');
  s = s.replace('class="k-md k-me-md"', 'class="k-md k-me-md lp-wide"');
  /* v3 창의 저장 용량 한 줄은 오른쪽 단으로 옮겨 크게(같은 값) */
  s = s.replace(/<div class="k-me-st">[\s\S]*?<p class="k-me-sub">[^<]*<\/p><\/div>/, '');
  const right = `<div class="lp-me-r">
<div class="k-me-st"><div class="k-me-sth"><p class="k-me-l">저장 용량</p>${V.profile.quota === null ? tag('할당 없음') : ''}</div>
<div class="lp-big"><b class="num">${mb(used)}</b><span class="lp-u">MB</span><small>지금 쓴 양</small></div>
<ul class="lp-bars">${storeBars}</ul>
<p class="k-me-sub">내가 프로젝트장인 프로젝트 ${V.profile.projects}개의 학습데이터 · 올린 파일</p></div>
<div class="k-me-st"><div class="k-me-sth"><p class="k-me-l">늘리기 요청 이력</p>${tag('서버에 더할 것')}</div>
<div class="lp-big"><b class="num" style="color:var(--mute)">0</b><small>보낸 요청 · 대기 0</small></div>
<ul class="lp-rows is-ex"><li><span class="lp-w">예시</span><span><b>50 → 80 GB</b> <i>2차 학습데이터</i></span><span class="lp-st">승인</span></li><li><span class="lp-w">예시</span><span><b>80 → 200 GB</b> <i>전국 영상 보관</i></span><span class="lp-st is-no">반려</span></li></ul>
<p class="k-me-sub">할당이 정해지면 '용량 늘리기 요청'을 보낼 수 있고, 승인 · 반려가 여기 쌓입니다</p></div>
</div>`;
  s = s.replace('<div class="k-md-b"><div class="k-me">', '<div class="k-md-b"><div class="lp-me"><div class="k-me">');
  const end = '</button></div></div></div></div></div></body>';
  if (!s.includes(end)) throw new Error('창 끝을 못 찾음');
  s = s.replace(end, `</button></div></div>${right}</div></div></div></div></body>`);
  fs.writeFileSync(path.join(OUT, 'my.html'), s);
}
fs.copyFileSync(path.join(HERE, 'plus.css'), path.join(OUT, 'plus.css'));
console.log('씀', OUT);
