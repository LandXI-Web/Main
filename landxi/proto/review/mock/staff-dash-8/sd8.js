/* sd8.js — 시안 8차 움직임(서버 호출 0 · 바깥 요청 0). 데이터는 5~7차와 같은 한 출처 ../staff-dash-5/sd5-data.js(2026-10-12 09:01 서버 값).
   카드의 학습 데이터 n장 · AI 모델 정확도 · 대상지 이름은 같은 날 프로젝트 목록 실제 화면(impl-23 a1-cards 14:49 · 같은 서버 GET /projects)에서 읽은 값.
   카드는 목록 카드에서 구성원 줄만 뺌(대시보드는 한 화면 · 마지막 활동은 지금 단계 줄에). 규칙은 3~7차 그대로: 숫자 차오름 · 등장은 처음 한 번(≤ 600ms) · 빛 점은 일이 있는 단계만 · 맥박은 running > 0 일 때만 · prefers-reduced-motion 이면 전부 끔.
   8차: 판은 하나(A/B 단추 없음) · 진행 현황 다섯 칸 / 여섯 칸 단추(?stages=5|6 · 기본 5)만 유지 · 결과 3×3 격자 대신 프로젝트 카드 4장. */
(function () {
  const D = window.SD5 || {}, Q = new URLSearchParams(location.search);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const E_UI = (t) => 1 - Math.pow(1 - t, 3);
  const nf = (n, d) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /* 도장 · 시각 */
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  document.getElementById('sd4-t').textContent = `찍은 시각 ${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} · 데이터 ${D.as_of || ''}`;

  /* ① 진행 현황 — 다섯 칸 / 여섯 칸(시안 단추 · ?stages=) · 일이 있는 칸으로 빛 점 */
  const pf = document.getElementById('sd6-pf'), segS = document.getElementById('sd6-seg-s');
  for (const li of pf.querySelectorAll('li.has-work')) li.append(el('i', 'sd6-flow'));
  function setStages(n) {
    pf.classList.toggle('is-5', n === 5);
    for (const b of document.querySelectorAll('.sd6-seg button')) b.classList.toggle('is-on', Number(b.dataset.stages) === n);
    segS.textContent = n === 5 ? "· '결과 확인' 칸 뺀 다섯 칸" : "· '결과 확인' 칸 둔 여섯 칸";
  }
  document.querySelectorAll('.sd6-seg button').forEach((b) => b.addEventListener('click', () => setStages(Number(b.dataset.stages))));
  setStages(Q.get('stages') === '6' ? 6 : 5);

  /* ③ 최근 진행한 프로젝트 — 프로젝트 목록 카드와 같은 부품(.k-sc.la-ac.lxp-pc) · 최근 활동 순 4장.
     그림 = 그 프로젝트가 만든 서비스의 결과 장면(10-11 수집 결과 그림 · 같은 작업). 곤포사일리지는 이 시안에 그 그림이 없어 실제 화면과 같은 '그림 없음'. */
  const EXTRA = {   // 같은 날 프로젝트 목록 실제 화면(impl-23 a1-cards 14:49)에서 읽은 값 — 지어낸 것 0
    prj_b2fa593a12: { train: 170, acc: 89, where: '여주시 · 천안시 서북구', n: 2, pic: '../staff-dash-4/thumbs/result-1-2128.png' },
    prj_3fdba452d5: { train: 35247, acc: 89, where: '증평군 · 함양군 · 남원시', n: 3, pic: '../staff-dash-4/thumbs/result-3-2129.png' },
    prj_15e3127d72: { train: 139, acc: 89, where: '원주시', n: 1, pic: '../staff-dash-4/thumbs/result-6-2130.png' },
    prj_2d3939d12a: { train: 60, acc: 96, where: '보령시', n: 1, pic: null },
  };
  const grid = document.getElementById('sd8-grid');
  const projects = (D.projects || []).slice().sort((a, b) => (b.last || '').localeCompare(a.last || '')).slice(0, 4);
  projects.forEach((pr) => {
    const x = EXTRA[pr.id] || {};
    const st = pr.stage ? `${pr.stage.index + 1} ${pr.stage.label}` : '';
    const go = `/landxi/v3/lx-project/?project=${pr.id}&stage=${pr.stage?.key || ''}`;
    const card = el('article', 'k-sc la-ac lxp-pc'); card.tabIndex = 0; card.setAttribute('aria-label', `${pr.name} · ${st}`);
    const pic = el('div', 'k-sc-crop la-ac-pic');
    if (x.pic) { const im = el('img'); im.src = x.pic; im.alt = ''; im.decoding = 'async'; pic.append(im); }
    else { pic.classList.add('is-blank'); pic.append(el('span', 'k-sc-blank', '그림 없음')); }
    const cat = el('div', 'la-ac-cat'); cat.append(el('span', '', st)); pic.append(cat);
    const body = el('div', 'k-sc-b la-ac-b');
    body.append(el('h3', 'k-sc-t', pr.name), el('p', 'k-sc-line la-ac-line', pr.task || ''));
    const stw = el('div', 'lxp-pc-st'), seg = el('div', 'lxp-seg');
    (pr.steps || []).forEach((s) => { const i = el('i'); i.dataset.st = s; seg.append(i); });
    const w = el('span', 'lxp-pc-w'); w.append(el('b', '', `지금 ${st}`), el('small', 'num', ` · ${pr.progress?.n ?? 0}/${pr.progress?.total ?? 6} · 마지막 활동 ${pr.last || ''}`));
    stw.append(seg, w);
    const hero = el('div', 'la-ac-hero');
    const h1 = el('div'), b1 = el('b', 'num sd4-cu', '0'); b1.dataset.n = x.train ?? 0; b1.append(el('i', '', '장')); h1.append(b1, el('small', '', '학습 데이터'));
    const h2 = el('div'), b2 = el('b', 'num', String(x.acc ?? '—')); b2.append(el('i', '', '%')); h2.append(b2, el('small', '', 'AI 모델 정확도'));
    hero.append(h1, h2);
    const where = el('div', 'la-ac-where'); where.append(el('span', 'k', `대상지 ${x.n || (pr.regions || []).length}곳`), el('span', 'v', x.where || pr.where || ''));
    const acts = el('div', 'k-sc-acts'); const a1 = el('a', 't-btn k-sc-go', '열기'); a1.href = go; const a2 = el('a', 'k-sc-more', '프로젝트 →'); a2.href = `/landxi/v3/lx-project/?project=${pr.id}`; acts.append(a1, a2);
    body.append(stw, hero, where, acts);
    card.append(pic, body);
    card.addEventListener('click', (e) => { if (!e.target.closest('a')) location.href = go; });
    grid.append(card);
  });

  /* 살아 있음 — running > 0 일 때만. ?pulse=1 은 흉내('흉내' 꼬리표) */
  const running = Number((D.jobs || {}).running) || 0, fake = Q.get('pulse') === '1';
  if (running > 0 || fake) {
    document.body.classList.add('is-live');
    document.getElementById('sd4-live').hidden = false;
    if (fake && !running) { document.getElementById('sd4-live-tag').hidden = false; document.querySelector('#sd4-running b').textContent = '1'; document.getElementById('sd4-running').classList.remove('is-zero'); }
  }

  /* 숫자 차오름(처음 한 번 · 0.6초) · 등장 */
  function countUp() {
    const els = [...document.querySelectorAll('.sd4-cu')];
    const put = (x, v) => { const unit = x.querySelector('i'); x.textContent = v; if (unit) x.append(unit); };
    if (RM) { els.forEach((e) => put(e, nf(e.dataset.n, +e.dataset.d || 0))); return; }
    const t0 = performance.now(), dur = 600;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = E_UI(k); for (const x of els) { const v = Number(x.dataset.n), dd = +x.dataset.d || 0; put(x, nf(k < 1 ? v * e : v, dd)); } if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.remove('sd4-boot'); document.body.classList.add('sd4-in', 'sd5-in', 'sd7-in', 'sd8-in'); countUp(); }));
})();
