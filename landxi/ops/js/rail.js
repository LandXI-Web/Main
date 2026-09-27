/* LX/OPS 레일 8 + 마스트 — OPS-GRID 셸. 레일 뒤 넷(카드 발행 · 데이터 관리 · 서비스 관리 · MY)은 원본 관리자 화면(:4173)을 새 탭으로(2차 이식). */
import { h, t, SRC, hhmmss, logout, setText } from './boot.js';

const ICON = { index: 'i-map', infra: 'i-run', tenants: 'i-user', deploys: 'i-upload', publish: 'i-card', data: 'i-data', service: 'i-settings', my: 'i-user' };
const PAGES = ['index', 'infra', 'tenants', 'deploys'];
const EXT = ['publish', 'data', 'service', 'my'];

const icon = (id) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '/landxi/assets/icons.svg#' + id); s.append(u); return s; };

export function railNav(page) {
  const nav = h('nav', { class: 'og-nav', 'aria-label': 'LX/OPS 메뉴' });
  for (const p of PAGES) nav.append(h('a', { href: `/landxi/ops/${p}.html`, 'data-page': p, ...(p === page ? { 'aria-current': 'page' } : {}) }, icon(ICON[p]), t('rail.' + p)));
  nav.append(h('hr'));
  for (const p of EXT) nav.append(h('a', { href: t('orig_links.' + p), target: '_blank', rel: 'noopener', 'data-ext': '', 'data-page': p, title: '원본 관리자 화면(:4173) · 새 탭 · 2차 이식' }, icon(ICON[p]), t('rail.' + p)));
  /* 일원화(v1.1-29) — 같은 작업을 생산·서비스 무대(XI맵 · Global)로 본다. ?job= 이 있으면 그대로 넘긴다(계보 딥링크 왕복). */
  const job = new URLSearchParams(location.search).get('job');
  nav.append(h('hr'));
  for (const [p, href, label, ic] of [['xi', 'http://localhost:4173/landxi/xi/' + (job ? '?job=' + encodeURIComponent(job) : ''), 'XI맵', 'i-map'],
    ['global', 'http://localhost:4173/landxi/global/' + (job ? '?job=' + encodeURIComponent(job) : ''), 'Global', 'i-map']])
    nav.append(h('a', { href, target: '_blank', rel: 'noopener', 'data-ext': '', 'data-page': p, title: '생산·서비스 무대(:4173) · 새 탭' + (job ? ' · ?job=' + job : '') }, icon(ic), label));
  return nav;
}

/** 셸을 만든다 → { main, mast, setMeta(), tick() } */
export function mountFrame({ page, title, crumb = '', user, assemble = false }) {
  document.body.setAttribute('data-stage', 'ops');
  const src = h('span', { class: 'og-src', 'data-kind': SRC.kind, title: srcTitle() }, h('i'), h('span', { class: 'og-src-t' }, SRC.label));
  const clock = h('span', { class: 'og-clock', 'aria-label': '현재 시각' });
  const meta = h('span', { class: 'og-meta', 'data-meta': '' }, '노드 ', h('b', { 'data-k': 'nodes' }, '—'), ' · GPU ', h('b', { 'data-k': 'gpus' }, '—'), ' · 대기 ', h('b', { 'data-k': 'queued' }, '—'));
  const kbd = h('button', { class: 'og-kbd', type: 'button', 'data-palette': '', title: '명령 팔레트(노드 · 기관 · 배포본)' }, '검색', h('kbd', {}, navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'));
  const out = h('button', { class: 'og-kbd', type: 'button', onclick: logout, title: '관제 세션 종료' }, (user?.user?.name || 'LX 관리자'), ' · 나가기');
  const mast = h('header', { class: 'og-mast' }, h('h1', {}, title), crumb ? h('span', { class: 'og-crumb' }, crumb) : null, h('span', { class: 'og-spacer' }), src, meta, clock, kbd, out);
  const main = h('main', { class: 'og-main', id: 'main' });
  const shell = h('div', { class: 'og-shell' },
    h('aside', { class: 'og-rail' }, h('a', { class: 'og-mark', href: '/landxi/ops/index.html', 'aria-label': 'LX/OPS 운영 현황' }, 'LX', h('b', {}, '/'), 'OPS'), railNav(page)), mast, main);
  if (assemble) { shell.classList.add('is-assemble'); document.body.append(shell); }   // 반전 중: 종이 무대 위에 셸이 카메라 이동과 함께 선다(검정 공백 0)
  else { const sk = document.getElementById('ogSkel'); document.body.replaceChildren(...[shell, sk].filter(Boolean)); }   // 첫 페인트 골격(#ogSkel)은 위에 남겨 두고 밑에 셸을 세운다 — boot.js unveil() 이 걷는다
  const sm = SRC.health?.summary;   // 브리지 공개 요약으로 먼저 채우고, 화면이 실데이터로 덮는다
  if (sm) { setText(meta.querySelector('[data-k="nodes"]'), String(sm.nodes_up ?? '—')); setText(meta.querySelector('[data-k="gpus"]'), String(sm.gpus ?? '—')); setText(meta.querySelector('[data-k="queued"]'), String(sm.queued ?? 0)); }
  const tickClock = () => setText(clock, hhmmss(new Date().toISOString()));
  tickClock(); setInterval(tickClock, 1000);
  const rec = SRC.recovered; const recChip = h('span', { class: 'og-tag og-rec', 'data-k': 'recovered', hidden: true });
  const setRecovered = (r) => { if (!r) return; const n = (r.resumed || 0) + (r.requeued || 0); recChip.hidden = !(n || r.failed); recChip.textContent = `재부팅 복구 ${n}건 · 실패 ${r.failed || 0}`; recChip.title = `게이트웨이 /health.recovered_at_boot · ${JSON.stringify(r)}`; recChip.dataset.level = r.failed ? 'caution' : 'ok'; };
  setRecovered(rec); src.after(recChip);
  return {
    main, mast, src, setRecovered,
    /** 반전 끝: 종이 무대를 걷고 셸을 제자리(흐름)로 */
    settle() { for (const el of [...document.body.children]) if (el !== shell && !el.classList.contains('lg-fly') && !el.classList.contains('og-toast')) el.remove(); shell.classList.remove('is-assemble'); document.body.classList.remove('is-flip'); },
    setMeta(k, v) { const b = meta.querySelector(`[data-k="${k}"]`); if (b) setText(b, v); },
    /** 샘플 수신: 점 한 번(120) — 값이 온 순간에만 */
    tick(stale = false, ageS = 0) {
      src.dataset.stale = stale ? '1' : '0';
      const tx = src.querySelector('.og-src-t');
      // 첫 표본 전(age=Infinity/NaN)은 '수신 대기 n s'(페이지 열림 기준) — Infinity/NaN 글자 0
      tx.textContent = stale ? (Number.isFinite(ageS) ? `${SRC.label} · 수신 없음 ${Math.round(ageS)} s` : `${SRC.label} · 수신 대기 ${Math.round(performance.now() / 1000)} s`) : SRC.label;
      if (!stale) { const i = src.querySelector('i'); i.classList.remove('og-tick'); void i.offsetWidth; i.classList.add('og-tick'); }
    },
  };
}
function srcTitle() {
  if (SRC.kind === 'bridge') return (SRC.gw?.up ? `게이트웨이(:8700) 가동 · 관제 경로 일부 미완(${(SRC.gw.bad || []).join(', ') || '없음'}) → 읽기 중계(job.state · queue.sample · usage.delta · alert). ` : '게이트웨이(:8700) 없음. ') + 'serve-ops 로컬 브리지: GPU·스토리지 = server/ops 폴러 실측(nvidia-smi · statfs · du). 배포·쿼터 쓰기 = 계약 §4.7–4.8 상태기계 · 브리지 메모리(게이트웨이 DB 비오염 · 재기동 시 시드로).';
  if (SRC.kind === 'gateway') return 'F1-B 게이트웨이 :8700 · 계약 정본';
  return '서버 없음 — data/fixtures · data/replay/ops-sample.ndjson(util 0 고정 · 실측 스냅샷 재생). 쓰기 버튼은 비활성.';
}
