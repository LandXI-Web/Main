/* sd7.js — 시안 7차 움직임(서버 호출 0 · 바깥 요청 0). 데이터는 5차와 같은 한 출처 ../staff-dash-5/sd5-data.js(2026-10-12 09:01 서버 값 · 결과 그림은 10-11 수집분 · 같은 결과).
   규칙은 3~6차 그대로: 숫자 차오름 · 등장은 처음 한 번(≤ 600ms) · 결과 훑기는 올릴 때 한 번 · 빛 점은 일이 있는 단계만 · 맥박은 running > 0 일 때만(?pulse=1 은 '흉내') ·
   prefers-reduced-motion 이면 전부 끔. 7차에서 더한 것: A안 · B안 단추(?plan=A|B · 기본 A) · 진행 현황 다섯 칸 / 여섯 칸 단추(?stages=5|6 · 기본 5). 전국 AI 현황 지도는 이 판에서 글 한 줄 + 가는 곳. */
(function () {
  const D = window.SD5 || {}, Q = new URLSearchParams(location.search);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const E_UI = (t) => 1 - Math.pow(1 - t, 3);
  const nf = (n, d) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const svg = (tag, a) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in a) el.setAttribute(k, a[k]); return el; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /* 도장 · 시각 */
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  document.getElementById('sd4-t').textContent = `찍은 시각 ${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} · 데이터 ${D.as_of || ''}`;

  /* A안 · B안 — 배치만 바뀜(글 · 숫자 같음) */
  const root = document.getElementById('sd7'), planS = document.getElementById('sd7-plan-s');
  document.querySelector('.k-mast .k-word').after(document.querySelector('.sd7-plan'));   /* 단추는 마스트 왼쪽 이름 옆으로(본문 높이 0) */
  function setPlan(k) {
    root.classList.toggle('is-A', k === 'A'); root.classList.toggle('is-B', k === 'B');
    for (const b of document.querySelectorAll('.sd7-plan button')) b.classList.toggle('is-on', b.dataset.plan === k);
    planS.textContent = k === 'A' ? '격자(3×3) → 진행 현황 띠 → 숫자 칸 띠 → 소식 한 줄' : '격자(3×3 · 더 낮게) → 한 줄에 진행 현황 + 작업 · 요청함 · 저장 용량 → 소식 한 줄';
  }
  document.querySelectorAll('.sd7-plan button').forEach((b) => b.addEventListener('click', () => setPlan(b.dataset.plan)));
  setPlan(Q.get('plan') === 'B' ? 'B' : 'A');

  /* ① 내 분석 결과 — 3×3 지도 격자(낮은 띠 칸). 칸 = 결과 화면 작은 그림(560×340 가운데를 칸 비율로 잘라) + 결과 도형 겹(올리면 훑기) + 한 줄 */
  const grid = document.getElementById('sd4-grid'), sub = document.getElementById('sd4-grid-sub'), all = document.getElementById('sd4-grid-all');
  const colorOf = (name) => (D.services || []).find((s) => s.name === name)?.color || '#0FA9A0';
  const real = (D.recent || []).length, items = (D.recent || []).slice(0, 9);
  items.forEach((it) => {
    const a = el('a', 'sd4-cell'); a.href = `/landxi/v3/lx-map/?job=${it.job}`; a.setAttribute('aria-label', `${it.title} · ${it.where} · ${nf(it.found)}`);
    const th = el('span', 'sd4-th');
    if (it.thumb) { const im = el('img'); im.src = it.thumb; im.alt = ''; im.decoding = 'async'; th.append(im); }
    if (it.overlay && it.overlay.length) {
      /* 그림과 같은 가운데 자르기(slice)라 칸 비율이 바뀌어도 도형이 그림 위 제자리 */
      const o = svg('svg', { viewBox: '0 0 560 340', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
      const g1 = svg('g', {}), g2 = svg('g', {});
      for (const pts of it.overlay) { g1.append(svg('polygon', { points: pts, class: 'ov' })); g2.append(svg('polygon', { points: pts, class: 'ov2' })); }
      o.append(g1, g2); th.append(o);
    }
    const svcName = (it.title || '').replace(/ 분석서비스$| [0-9]{4}$/, '');
    const cap = el('span', 'sd4-cap');
    const dot = el('i'); dot.style.background = colorOf(svcName);
    const t1 = el('b', '', svcName); const t2 = el('span', '', it.where.split(' · ')[0]); a.title = `${svcName} · ${it.where} · ${it.by} · ${it.day}`;
    const n = el('b', 'num sd4-cu', '0'); n.dataset.n = it.found;
    const dt = el('small', 'num', it.day);
    const l1 = el('span', 'sd4-cap-1'), l2 = el('span', 'sd4-cap-2'); l1.append(dot, t1, t2); l2.append(n, dt); cap.append(l1, l2);
    a.append(th, cap); grid.append(a);
  });
  all.textContent = real > 9 ? `지도 서비스 · 전체 ${real}건` : '지도 서비스';
  sub.textContent = real > 9 ? `최근 9 (전체 ${real}건) · 누르면 지도 서비스의 그 결과 · 올리면 도형이 드러납니다` : `${real}건 · 최근 순 · 누르면 지도 서비스의 그 결과 · 올리면 도형이 드러납니다`;

  /* ② 진행 현황 — 다섯 칸 / 여섯 칸(시안 단추 · ?stages=) · 일이 있는 칸으로 빛 점 */
  const pf = document.getElementById('sd6-pf'), segS = document.getElementById('sd6-seg-s');
  for (const li of pf.querySelectorAll('li.has-work')) li.append(el('i', 'sd6-flow'));
  function setStages(n) {
    pf.classList.toggle('is-5', n === 5);
    for (const b of document.querySelectorAll('.sd6-seg button')) b.classList.toggle('is-on', Number(b.dataset.stages) === n);
    segS.textContent = n === 5 ? "· '결과 확인' 칸 뺀 다섯 칸" : "· '결과 확인' 칸 둔 여섯 칸";
  }
  document.querySelectorAll('.sd6-seg button').forEach((b) => b.addEventListener('click', () => setStages(Number(b.dataset.stages))));
  setStages(Q.get('stages') === '6' ? 6 : 5);

  /* 살아 있음 — running > 0 일 때만. ?pulse=1 은 흉내('흉내' 꼬리표) */
  const running = Number((D.jobs || {}).running) || 0, fake = Q.get('pulse') === '1';
  if (running > 0 || fake) {
    document.body.classList.add('is-live');
    document.getElementById('sd4-live').hidden = false;
    if (fake && !running) { document.getElementById('sd4-live-tag').hidden = false; document.querySelector('#sd4-running b').textContent = '1'; document.getElementById('sd4-running').classList.remove('is-zero'); }
  }

  /* 숫자 차오름(처음 한 번 · 0.6초) · 막대 · 등장 */
  function countUp() {
    const els = [...document.querySelectorAll('.sd4-cu')];
    if (RM) { els.forEach((e) => { e.textContent = nf(e.dataset.n, +e.dataset.d || 0); }); return; }
    const t0 = performance.now(), dur = 600;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = E_UI(k); for (const x of els) { const v = Number(x.dataset.n), dd = +x.dataset.d || 0; x.textContent = nf(k < 1 ? v * e : v, dd); } if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.remove('sd4-boot'); document.body.classList.add('sd4-in', 'sd5-in', 'sd7-in'); countUp(); }));
})();
