/* app.js — LX 영업 '서비스 카탈로그'(명세 §2.13 · 토스 5-4 소개 틀).
   관문 K2(정문 로그인 세션만 · 역할 밖 → 정문) · 셸 K1 · 지도 K3 · 카드 K7 · 숫자 K6 · 스텝퍼 K8 · 빈 상태 K9. 쓰기 호출 0. */
import * as K from '../kit/index.js';
import { enter, h, RM } from '../kit/util.js';
import { load, cropOf } from './data.js';
import { mountHero, mountCases } from './cases.js';

const $ = (id) => document.getElementById(id);
const S = (window.__sales = { t0: performance.now() });
const xiHref = (sgg, deploy) => '/landxi/v3/xi-clean/?' + new URLSearchParams({ region: sgg || '', deploy: deploy || '' });
const detailHref = (card) => '/landxi/v3/service-detail/?' + new URLSearchParams({ card });

const STEPS = [
  { t: '대장 올리기', d: '기관 대장 × 필지' },
  { t: '카드 배포본', d: '지역만 바꿔 적용' },
  { t: '결과 확인', d: '표본 확인 후 공개' },
  { t: '기관 포털', d: '결과로 업무 마감' },
];

/* ① 서비스 — K7 카드 그리드 + 카드마다 `자세히` `이 서비스 열기` · 결과 없는 서비스는 K9 한 장.
   `이 서비스 열기` 는 XI맵이 풀 수 있는 시군구 코드가 있을 때만 단다(없으면 `자세히` 하나 · 죽은 버튼 0). 늦게 온 지역·코드는 patchGrid 가 채운다 */
const whereOf = (D, r) => {
  const more = r.deploys.filter((d) => d.id !== r.deploy.id && D.cases.some((c) => c.id === d.id)).length;
  // 지역 이름 = 요약 항목의 지역(메인 · 서비스 상세와 같은 이름) · 없으면 지역 목록에서
  const sumName = String(r.item?.region_name || '').trim().split(/\s+/).pop();
  return (sumName || D.where(r.deploy)?.name || '') + (more ? ` 외 ${more}곳` : '');
};
function goRow(D, r, box) {
  const xi = D.xiOf(r.deploy);
  const kids = [h('a.t-btn.t-btn--2', { href: detailHref(r.card.id), text: '자세히' })];
  if (xi) kids.push(h('a.t-btn', { href: xiHref(xi.code, r.deploy.id), text: '이 서비스 열기', dataset: { region: xi.code } }));
  box.replaceChildren(...kids);
}
function renderGrid(D) {
  const grid = $('grid');
  // 크롭은 결과 세트(배포 기록의 출처)로 찾는다 — 숫자 자리는 요약 값(r.deploy.scale)
  K.serviceGrid(grid, D.rows, { map: (r) => ({ crop: cropOf(r.card, { ...r.deploy, scale: r.src || r.deploy.scale }), where: whereOf(D, r) }) });
  [...grid.children].forEach((el, i) => {
    const r = D.rows[i], w = whereOf(D, r);
    const lab = el.querySelector('.k-svc-meta .t-label');
    if (lab) lab.dataset.asof = w ? lab.textContent.slice(w.length + 3) : lab.textContent;
    el.classList.add('t-enter');
    const img = el.querySelector('.k-svc-crop img');   // 크롭이 안 열리면 그림 없이 회백 판
    img?.addEventListener('error', () => { const box = img.parentElement; img.remove(); box.classList.add('is-blank'); box.setAttribute('aria-hidden', 'true'); }, { once: true });
    const go = h('div.sl-card-go');
    goRow(D, r, go);
    el.append(go);
  });
  // 결과 없는 카드는 진열하지 않는다(카탈로그 한가운데 빈 카드 0) — 진열할 카드가 하나도 없을 때만 K9 한 장
  if (!D.rows.length) {
    const box = h('div.sl-empty.t-enter');
    grid.append(box);
    K.empty(box, { kind: 'first', text: '첫 결과가 생기면 여기에 카드가 생깁니다', compact: true });
  }
}
/* 늦게 온 지역 이름 · 착지 코드 — 카드는 그대로 두고 메타 한 줄과 행동 줄만 고친다 */
function patchGrid(D) {
  [...$('grid').querySelectorAll('.k-svc')].forEach((el, i) => {
    const r = D.rows[i]; if (!r) return;
    const lab = el.querySelector('.k-svc-meta .t-label');
    if (lab) lab.textContent = [whereOf(D, r), lab.dataset.asof || ''].filter(Boolean).join(' · ');
    const go = el.querySelector('.sl-card-go'); if (go) goRow(D, r, go);
  });
}

/* ③ 제공 경로 — 보이면 1 → 4 로 한 단씩(현재 단만 액센트) */
function mountSteps() {
  const el = $('steps');
  const s = K.stepper(el, STEPS, { current: -1, vertical: matchMedia('(max-width: 640px)').matches });
  const io = new IntersectionObserver((en) => {
    if (!en.some((x) => x.isIntersecting)) return;
    io.disconnect();
    if (RM()) return s.go(STEPS.length - 1);
    STEPS.forEach((_, i) => setTimeout(() => s.go(i), 200 + i * 700));
  }, { threshold: 0.5 });
  io.observe(el);
}

/* 마스트 역할 칩 — 계정 이름이 역할 이름과 같으면(`LX 영업 · LX 영업`) 한 번만. 키트 K1(또는 계정 시드)이 고치면 지운다(보고서 티켓) */
function roleOnce() {
  const r = document.querySelector('.k-role'); const b = r?.querySelector('b'); if (!b) return;
  const k = b.textContent.trim(), rest = r.textContent.slice(b.textContent.length).trim();
  if (!rest || rest === k) { r.textContent = k; r.classList.add('sl-role1'); }
}

/* 마스트를 먼저 그린다(게이트 응답 전 백지 0) — 게이트가 끝나면 같은 K1 이 만든 역할 칩·나가기만 옮겨 단다 */
function adoptWho(sh, who) {
  const tmp = document.createElement('div');
  const s2 = K.shell({ who, home: 'sales', mount: tmp, contained: true });
  const m2 = s2.app.querySelector('.k-mast'), m1 = sh.app.querySelector('.k-mast');
  const role = m2.querySelector('.k-role'), exit = m2.querySelector('.k-exit'), word = m2.querySelector('.k-word');
  const help = m1.querySelector('.k-help');
  if (role) help.before(role);
  if (exit) help.after(exit);
  if (word) m1.querySelector('.k-word')?.setAttribute('href', word.getAttribute('href'));
  roleOnce();
}

/* maplibre 는 첫 그림(마스트·문구)을 막지 않게 뒤에서 싣는다 */
const script = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
const ML = script('/landxi/proto/vendor/maplibre/maplibre-gl.js').then(() => script('/landxi/xi/vendor/pmtiles/pmtiles.js').catch(() => {}));

async function boot() {
  const sh = K.shell({ who: null, home: 'sales' });
  sh.main.classList.add('sl-scroll');
  sh.main.append($('page'));
  // 고정 문구(히어로 · 절 제목)와 빈 지도 카드는 게이트를 기다리지 않는다(공개 문구뿐 · 숫자·지도는 게이트 뒤)
  $('page').hidden = false;
  document.body.dataset.state = 'ready';
  requestAnimationFrame(() => enter(document));
  const who = await K.gate('sales');
  adoptWho(sh, who);
  S.who = who.key;
  mountSteps();

  S.tGate = Math.round(performance.now() - S.t0);
  let casesUI = null;
  const onLate = (D) => { S.late = (S.late || 0) + 1; patchGrid(D); casesUI?.update(); };
  // 카드·배포본은 data.js 가 3회(백오프)까지 부른다 — 그래도 안 되면 10s 뒤 한 라운드 더(그동안 카드 자리는 비어 있다)
  const DP = load({ onLate }).catch(() => new Promise((ok) => setTimeout(ok, 10000)).then(() => load({ onLate })));
  // 히어로 바탕 지도는 데이터와 나란히(지역 목록 응답이 늦어도 카드가 비지 않게)
  ML.then(() => { S.tML = Math.round(performance.now() - S.t0); return mountHero($('heroMap'), DP); }).catch((e) => console.warn('[sales] 히어로 지도', e));
  const D = await DP;
  S.D = D;
  S.tData = Math.round(performance.now() - S.t0);
  S.cases = D.cases.map((c) => c.id); S.rows = D.rows.map((r) => r.card.id);
  sh.fresh(D.asOf);
  renderGrid(D);
  requestAnimationFrame(() => enter(document));
  await ML;
  casesUI = mountCases({ list: $('caseList'), el: $('caseMap'), cap: $('caseCap'), cases: D.cases,
    openHref: (c) => (c.xi ? xiHref(c.xi.code, c.id) : null), detailHref: (c) => (c.card ? detailHref(c.card.id) : null) });
  // 사례 목록이 서기 전에 늦은 채움이 끝났을 수 있다 — 한 번 맞춘다
  patchGrid(D); casesUI.update();
  S.bootMs = Math.round(performance.now() - S.t0);
}

boot().catch((e) => { console.warn('[sales] 부팅 실패', e); document.body.dataset.state = 'ready'; });
