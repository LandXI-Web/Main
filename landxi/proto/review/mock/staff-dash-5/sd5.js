/* sd5.js — 시안 5차 움직임(서버 호출 0 · 바깥 요청 0). 데이터는 sd5-data.js(2026-10-12 09:01 서버 값 · 결과 그림은 10-11 수집분 · 같은 결과).
   규칙은 3차 · 4차 그대로: 숫자 · 도넛 차오름 · 등장은 처음 한 번(≤ 600ms) · 결과 훑기는 올릴 때 한 번 · 빛 점은 일이 있는 단계만 ·
   맥박은 running > 0 일 때만(?pulse=1 은 '흉내') · prefers-reduced-motion 이면 전부 끔.
   격자: 3열 × 3행 — 최근 9건(지금 9건 = 꼭 맞음 · 빈 칸 없음). 9건을 넘으면 최근 9 + 머리의 '전체 n건'. */
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

  /* ① 내 분석 결과 — 3×3 지도 격자. 칸 = 지도 서비스 그 결과 화면 작은 그림(영상 + 결과 도형) + 결과 도형 겹(올리면 훑기) + 한 줄(서비스 · 지역 · 수 · 날짜) */
  const grid = document.getElementById('sd4-grid'), sub = document.getElementById('sd4-grid-sub'), all = document.getElementById('sd4-grid-all');
  const colorOf = (name) => (D.services || []).find((s) => s.name === name)?.color || '#0FA9A0';
  const real = (D.recent || []).length, items = (D.recent || []).slice(0, 9);
  items.forEach((it) => {
    const a = el('a', 'sd4-cell'); a.href = `/landxi/v3/lx-map/?job=${it.job}`; a.setAttribute('aria-label', `${it.title} · ${it.where} · ${nf(it.found)}`);
    const th = el('span', 'sd4-th');
    if (it.thumb) { const im = el('img'); im.src = it.thumb; im.alt = ''; im.decoding = 'async'; th.append(im); }
    if (it.overlay && it.overlay.length) {
      const o = svg('svg', { viewBox: '110 0 340 340', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });   // 560×340 그림의 가운데 정사각
      const g1 = svg('g', {}), g2 = svg('g', {});
      for (const pts of it.overlay) { g1.append(svg('polygon', { points: pts, class: 'ov' })); g2.append(svg('polygon', { points: pts, class: 'ov2' })); }
      o.append(g1, g2); th.append(o);
    }
    const svcName = (it.title || '').replace(/ 분석서비스$| [0-9]{4}$/, '');   // 서비스 이름(범례 색과 같은 표)
    const cap = el('span', 'sd4-cap');
    const dot = el('i'); dot.style.background = colorOf(svcName);
    const t1 = el('b', '', svcName); const t2 = el('span', '', it.where.split(' · ')[0]); a.title = `${svcName} · ${it.where} · ${it.by} · ${it.day}`;
    const n = el('b', 'num sd4-cu', '0'); n.dataset.n = it.found;
    const dt = el('small', 'num', it.day);
    const l1 = el('span', 'sd4-cap-1'), l2 = el('span', 'sd4-cap-2'); l1.append(dot, t1, t2); l2.append(n, dt); cap.append(l1, l2);
    a.append(th, cap); grid.append(a);
  });
  all.textContent = real > 9 ? `지도 서비스 · 전체 ${real}건` : '지도 서비스';
  sub.textContent = real > 9 ? `최근 9 (전체 ${real}건) · 칸마다 지금 결과 그대로 · 누르면 지도 서비스의 그 결과 · 올리면 도형이 드러납니다` : `${real}건 · 최근 순 · 칸마다 지금 결과 그대로 · 누르면 지도 서비스의 그 결과 · 올리면 도형이 드러납니다`;

  /* ④ 전국 AI 현황 — 넓고 낮게(배경 정보) · 시군구 서비스 색(XI맵과 같은 한 번 호출) · 내 프로젝트 지역 빛나는 점(누르면 그 프로젝트) */
  const host = document.getElementById('sd4-map');
  const S = svg('svg', { viewBox: '40 20 900 960', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  const gLand = svg('g', {}), gRes = svg('g', {}), gDot = svg('g', {});
  const mine = new Map();
  for (const pj of D.projects || []) for (const cd of pj.regions) { if (!mine.has(cd)) mine.set(cd, []); mine.get(cd).push(pj); }
  const byCd = new Map();
  for (const r of D.sgg || []) {
    byCd.set(r.cd, r);
    gLand.append(svg('path', { d: r.d, class: 'land' }));
    if (r.color) { const e = svg('path', { d: r.d, class: 'res', fill: r.color, 'fill-opacity': r.k }); e.append(svg('title', {})); e.firstChild.textContent = `${r.name} · ` + r.svc.map((s) => `${s.name} ${nf(s.n)}개`).join(' · '); gRes.append(e); }
  }
  for (const [cd, pjs] of mine) {
    const r = byCd.get(cd); if (!r) continue;
    const g = svg('a', { class: 'dot', href: `/landxi/v3/lx-project/?project=${pjs[0].id}`, 'aria-label': `${r.name} · ${pjs.map((x) => x.name).join(' · ')}` });
    g.append(svg('circle', { cx: r.c[0], cy: r.c[1], r: 13, class: 'halo' }), svg('circle', { cx: r.c[0], cy: r.c[1], r: 5, class: 'core' }));
    const t = svg('text', { x: r.c[0] + 12, y: r.c[1] + 4, class: 'lbl' }); t.textContent = `${r.name} · ${pjs[0].name}`; g.append(t);
    gDot.append(g);
  }
  S.append(gLand, gRes, gDot); host.append(S);
  const leg = document.getElementById('sd4-leg');
  for (const s of D.services || []) { const li = el('li'); const i = el('i'); i.style.background = s.color; li.append(i, `${s.name} ${s.n_regions}곳`); leg.append(li); }
  try { const bb = gLand.getBBox(); const x0 = Math.max(0, bb.x) - 10, y0 = Math.max(0, bb.y) - 10, x1 = Math.min(1000, bb.x + bb.width) + 10, y1 = Math.min(1000, bb.y + bb.height) + 10; S.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`); } catch { /* 숨김 */ }

  /* 살아 있음 — running > 0 일 때만. ?pulse=1 은 흉내('흉내' 꼬리표) */
  const running = Number((D.jobs || {}).running) || 0, fake = Q.get('pulse') === '1';
  if (running > 0 || fake) {
    document.body.classList.add('is-live');
    document.getElementById('sd4-live').hidden = false;
    if (fake && !running) { document.getElementById('sd4-live-tag').hidden = false; document.querySelector('#sd4-running b').textContent = '1'; document.getElementById('sd4-running').classList.remove('is-zero'); }
  }

  /* 숫자 차오름(처음 한 번 · 0.6초) · 도넛 · 막대 · 등장 */
  function countUp() {
    const els = [...document.querySelectorAll('.sd4-cu')];
    if (RM) { els.forEach((e) => { e.textContent = nf(e.dataset.n, +e.dataset.d || 0); }); return; }
    const t0 = performance.now(), dur = 600;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = E_UI(k); for (const x of els) { const v = Number(x.dataset.n), dd = +x.dataset.d || 0; x.textContent = nf(k < 1 ? v * e : v, dd); } if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.remove('sd4-boot'); document.body.classList.add('sd4-in', 'sd5-in'); countUp(); }));
})();
