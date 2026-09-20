/* 지자체 포털 컨트롤러 — 생성된 골격에 내용을 채운다.
   화면 구성(어느 탭에 어느 블록이 오는가)은 생성기가 이미 HTML 로 찍어 두었다.
   이 파일은 **블록 한 종류를 어떻게 그리는가**만 안다 — 카드 이름을 모른다.
   그래서 새 서비스가 생겨도 여기는 고치지 않는다(성장 규칙 R5). */
import { mountShell, esc, nf, ymd, say } from './shell.js';
import { serviceCards, portalSummary, tenantById } from '../assets/data/portal.js';
import { cardById, modelsOfCard, needsOf } from '../assets/data/cards.js';
import { specOf, requestsOf } from '../assets/data/studio.js';
import { themeOf } from '../assets/data/brand.js';

const body = document.body;
const TENANT = body.dataset.tenant || 'namwon';
const SVC = body.dataset.svc || new URLSearchParams(location.search).get('svc') || '';
const th = themeOf(TENANT);
const t = tenantById(TENANT);

/* ── 껍데기 ───────────────────────────────────────────────────────── */
const svcCard = SVC ? serviceCards('lx').find((c) => c.id === SVC) : null;
mountShell({
  active: 'analysis',
  title: svcCard ? svcCard.name : '내 서비스',
  subtitle: svcCard
    ? `${esc(svcCard.region)} · ${esc(svcCard.year)}년 배포본 — 모델과 결과 품질은 LX 가 책임진다`
    : `${esc(th.name)} — 내 지역에 깔린 서비스`,
  crumbs: svcCard
    ? [{ label: '내 서비스', href: 'portal.html' }, { label: svcCard.name }]
    : null,
  notice: false, asOf: svcCard?.lastRun || undefined, demo: true,
});
// 기관 포털의 창 제목은 기관 CI 로 — 골격은 LX 것이지만 간판은 그 기관 것이다.
document.title = `${svcCard ? svcCard.name : '내 서비스'} — ${th.short}`;

/* CI 교체 · 메뉴 경계 — 골격(레일 72 · 마스트헤드 64)은 그대로 두고 두 가지만 갈아 끼운다.
   1) 마크: 간판은 그 기관 것이다.
   2) 메뉴: 기관은 **행정서비스 쪽만** 본다. 데이터 관리 · 프로젝트 · 카드 발행은 LX 몫이라
      기관 레일에 뜨면 이원화 경계가 무너진다(TENANTS.menus 가 정하고, 화면은 그것만 읽는다). */
const mark = document.getElementById('rail-mark');
if (mark) {
  mark.innerHTML = th.mark.split('/').map((s) => `<span>${esc(s)}</span>`).join('');
  mark.setAttribute('aria-label', `${th.name} 홈`);
  mark.setAttribute('href', 'portal.html');
}
if (Array.isArray(t.menus)) {
  const allow = new Set([...t.menus, 'my']);
  document.querySelectorAll('#rail .rail-i[data-menu]').forEach((a) => {
    if (!allow.has(a.dataset.menu)) a.remove();
  });
  // '분석 서비스' 는 기관 눈으로는 '내 서비스' 다 — 같은 자리, 다른 말.
  const svcNav = document.querySelector('#rail .rail-i[data-menu="analysis"]');
  if (svcNav) { svcNav.href = 'portal.html'; svcNav.querySelector('.rl').textContent = '내 서비스'; }
}

/* ── 홈 ───────────────────────────────────────────────────────────── */
const slot = (id, root = document) => root.querySelector(`[data-slot="${id}"]`);

if (!SVC) {
  const cs = serviceCards(TENANT), s = portalSummary(TENANT);
  slot('summary').innerHTML = `
    <div class="band band--s">
      ${tile('서비스', s.total, '개')}
      ${tile('운영 중', s.live, '개')}
      ${tile('구축 · 예정', s.building + s.planned, '개')}
      ${tile('누적 탐지', s.items, '건', 'ink')}
      <p class="band-note">${esc(t.desc)}</p>
    </div>`;
  slot('cards').innerHTML = cs.map((c) => `
    <li><a class="pt-c" href="portal-${esc(c.id)}.html" data-state="${esc(c.status)}">
      <span class="pt-c-y">${esc(c.year)} · ${esc(c.region)}</span>
      <strong class="pt-c-n">${esc(c.name)}</strong>
      <span class="pt-c-s">${esc(c.summary || c.duty || '')}</span>
      <span class="pt-c-f">
        ${c.items ? `<b class="pt-c-v">${nf.format(c.items)}</b><span class="pt-c-u">${esc(c.unit || '건')}</span>`
      : `<span class="pt-c-u">${esc(c.gap || '집계 대기')}</span>`}
        <span class="sp"></span>
        <span class="st st--${c.status === '운영' ? 'teal' : c.status === '구축' ? 'acc' : 'dim'}">${esc(c.status)}</span>
        ${c.update && c.update.level !== 'same' ? '<span class="chip chip--on">갱신</span>' : ''}
      </span>
    </a></li>`).join('') || '<li class="pt-empty">아직 깔린 서비스가 없습니다.</li>';
}

function tile(label, val, unit, tone = '') {
  return `<div class="tile${tone ? ` tile--${tone}` : ''}${val ? '' : ' tile--zero'}">
    <span class="tile-l">${esc(label)}</span>
    <span class="tile-v"><b>${nf.format(val || 0)}</b><span>${esc(unit)}</span></span></div>`;
}

/* ── 작업공간 ─────────────────────────────────────────────────────── */
if (SVC && svcCard) {
  const spec = specOf(SVC);
  const card = cardById(svcCard.cardId) || {};
  const n = needsOf(card);
  const models = modelsOfCard(card).filter((m) => m.real);
  const reqs = requestsOf(SVC).filter((r) => r.state !== '접수');

  // 탭 전환 — 생성된 pane 을 켜고 끈다
  const tabs = [...document.querySelectorAll('.pt-tabs button')];
  const panes = [...document.querySelectorAll('.pt-pane')];
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    panes.forEach((p) => { p.hidden = p.dataset.tab !== b.dataset.tab; });
  }));

  // 요구로 들어온 블록에 흔적을 남긴다
  reqs.filter((r) => r.op === 'add').forEach((r) => {
    document.querySelector(`.pt-pane[data-tab="${r.at}"] .pt-b[data-block="${r.val}"]`)?.setAttribute('data-req', r.id);
  });

  const items = models.reduce((a, m) => a + (m.count || 0), 0);
  const unit = models[0]?.unit || '건';
  const draw = {
    kpi: () => `<div class="band band--s">
        ${tile('누적 탐지', items, unit)}
        ${tile('묶인 모델', models.length, '개', 'ink')}
        ${tile('최근 분석', 0, '건', 'ink')}
        <p class="band-note">${esc(svcCard.lastRun ? ymd(svcCard.lastRun) + ' 기준' : '분석 이력 없음')}</p>
      </div>`,
    chart: () => bars(models.map((m) => [m.name, m.count || 0])),
    table: () => models.length ? `<table class="tb"><thead><tr><th>모델</th><th class="r">건수</th><th>단위</th><th>최근 실행</th></tr></thead>
      <tbody>${models.map((m) => `<tr><td>${esc(m.name)}</td><td class="r n">${nf.format(m.count || 0)}</td><td>${esc(m.unit || '건')}</td><td class="n">${esc(ymd(m.lastRun || '—'))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="pt-empty">실데이터 없음 — 사업 시작 전입니다.</p>',
    player: () => `<div class="pt-map pt-map--s">드론 영상 · 탐지 상자 겹쳐 재생</div>
      <div class="pt-scrub"><span class="n">00:00</span><input type="range" min="0" max="100" value="0" aria-label="재생 위치"><span class="n">— </span></div>`,
    timeline: () => `<div class="pt-scrub"><span class="n">시각</span><input type="range" min="0" max="100" value="100" aria-label="시간 축"><span class="n">${esc(ymd(svcCard.lastRun || ''))}</span></div>`,
    map: () => `<div class="pt-map">지도 · ${esc(svcCard.region)} 결과 레이어<br>좌표계 ${esc(th.crs)}</div>`,
    heatmap: () => `<div class="pt-map pt-map--s">밀도 격자</div>${legend(['낮음', '보통', '높음', '매우 높음'])}`,
    grade: () => `${legend(['A 양호', 'B 주의', 'C 보수', 'D 시급'])}<div class="pt-map pt-map--s">구간 등급 색칠</div>`,
    parcel: () => `<table class="tb"><thead><tr><th>필지</th><th>${esc(th.unitLabel)}</th><th>판정</th><th>대장 대조</th></tr></thead>
      <tbody><tr><td colspan="4" class="pt-empty">필지 결과는 분석 실행 후 채워집니다.</td></tr></tbody></table>`,
    stats: () => `<p class="pt-note">${esc(th.unitLabel)}별 집계 · 엑셀 내려받기</p>${bars(models.slice(0, 5).map((m) => [m.name, m.count || 0]))}`,
    report: () => `<p class="pt-note">공문 서식 · 발급 기관 <em>${esc(th.sealNote)}</em></p>
      <p class="acts"><button type="button" class="btn-br btn-br--s" data-act="report">보고서 발급</button></p>`,
    cards: () => '',
  };

  document.querySelectorAll('.pt-b').forEach((sec) => {
    const k = sec.dataset.block;
    const el = sec.querySelector('.pt-b-body');
    try { el.innerHTML = (draw[k] || (() => '<p class="pt-empty">—</p>'))(); }
    catch { el.innerHTML = '<p class="pt-empty">—</p>'; }
    const opt = sec.dataset.opt;
    if (opt) el.insertAdjacentHTML('beforeend', `<p class="pt-note">기관 설정 <em>${esc(opt)}</em></p>`);
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="report"]')) say('보고서 발급은 시연 화면입니다 — 서식은 LX 가 한 벌로 관리합니다.');
  });

  // 이원화 고리를 화면에서 잊지 않게 한 줄
  document.querySelector('.pt-work')?.insertAdjacentHTML('beforeend',
    `<p class="pt-note">이 화면은 명세에서 생성되었습니다 · 블록 ${spec.tabs.reduce((a, x) => a + x.blocks.length, 0)}개`
    + `${spec.applied.length ? ` · 기관 요구 ${spec.applied.length}건 반영` : ''}`
    + `${spec.pending.length ? ` · <em>접수 ${spec.pending.length}건 대기</em>` : ''} — 요구는 LX 가 명세를 고쳐 다시 찍습니다.</p>`);
}

function bars(rows) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return rows.length ? `<div class="pt-bars">${rows.map(([k, v]) => `
    <div class="pt-bar"><span>${esc(k)}</span><u style="width:${Math.round((v / max) * 100)}%"></u><b>${nf.format(v)}</b></div>`).join('')}</div>`
    : '<p class="pt-empty">집계할 결과가 없습니다.</p>';
}
function legend(labels) {
  const c = ['#E8F1FF', '#9DC4FB', '#4E92F9', '#006DF7'];
  return `<p class="pt-legend">${labels.map((l, i) => `<span><i style="background:${c[i] || c[3]}"></i>${esc(l)}</span>`).join('')}</p>`;
}
