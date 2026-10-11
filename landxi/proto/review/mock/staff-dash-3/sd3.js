/* sd3.js — 시안 움직임(서버 호출 0 · 바깥 요청 0). 데이터는 sd3-data.js(2026-10-11 20:41 서버 값).
   규칙: 숫자 차오름 · 도넛 차오름 · 등장은 처음 한 번(≤ 600ms) · 결과 훑기는 올릴 때 한 번 · 빛 점은 일이 있는 단계만 ·
   맥박은 running > 0 일 때만(?pulse=1 은 '흉내' 꼬리표를 붙여 따로) · prefers-reduced-motion 이면 전부 끔. */
(function () {
  const D = window.SD3 || {}, Q = new URLSearchParams(location.search);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const E_UI = (t) => 1 - Math.pow(1 - t, 3);
  const nf = (n, d) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const svg = (tag, a) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in a) el.setAttribute(k, a[k]); return el; };

  /* 도장 · 갱신 시각 */
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  document.getElementById('sd3-t').textContent = `찍은 시각 ${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} · 데이터 ${D.as_of || ''}`;

  /* ① 히어로 미니 지도 — 전국 시군구(흰 땅) · 결과 있는 시군구는 서비스 색(진하기 = XI맵과 같은 순위) · 내 프로젝트 지역은 빛나는 점 */
  const host = document.getElementById('sd3-map');
  const S = svg('svg', { viewBox: '40 20 900 960', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  const gLand = svg('g', { class: 'g-land' }), gRes = svg('g', { class: 'g-res' }), gDot = svg('g', { class: 'g-dot' }), gLbl = svg('g', { class: 'g-lbl' });
  const mine = new Map();
  for (const pj of D.projects || []) for (const cd of pj.regions) { if (!mine.has(cd)) mine.set(cd, []); mine.get(cd).push(pj); }
  const byCd = new Map();
  for (const r of D.sgg || []) {
    byCd.set(r.cd, r);
    gLand.append(svg('path', { d: r.d, class: 'land' }));
    if (r.color) {
      const el = svg('path', { d: r.d, class: 'res', fill: r.color, 'fill-opacity': r.k });
      el.append(svg('title', {})); el.firstChild.textContent = `${r.name} · ` + r.svc.map((s) => `${s.name} ${nf(s.n)}개`).join(' · ');
      gRes.append(el);
    }
  }
  let open = null, pop = document.getElementById('sd3-pop');
  const stageText = (pj) => (pj.blocked && pj.blocked[0] ? pj.blocked[0].text : pj.stage.label);
  function showPop(cd, dot) {
    const r = byCd.get(cd), pjs = mine.get(cd) || [];
    if (!r || !pjs.length) return;
    pop.replaceChildren();
    for (const pj of pjs) {
      const b = document.createElement('b'); b.textContent = pj.name;
      const w = document.createElement('span'); w.textContent = `${r.name}${pj.regions.length > 1 ? ` 외 ${pj.regions.length - 1}곳` : ''} · 마지막 작업 ${pj.last}`;
      const st = document.createElement('span'); st.className = 'sd3-pop-st';
      const tag = document.createElement('span'); tag.className = 'sd3-tag ' + (pj.blocked && pj.blocked.length ? 'wait' : 'done'); tag.textContent = pj.blocked && pj.blocked.length ? '대기' : '끝남';
      st.append(pj.stage.label, tag);
      const note = document.createElement('span'); note.textContent = stageText(pj);
      const a = document.createElement('a'); a.href = `/landxi/v3/lx-project/?project=${pj.id}`; a.textContent = '프로젝트 열기 →';
      pop.append(b, w, st, note, a);
    }
    if (r.svc) { const s = document.createElement('span'); s.textContent = '이 지역 AI 결과 · ' + r.svc.map((x) => `${x.name} ${nf(x.n)}`).join(' · '); pop.append(s); }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'sd3-pop-x'; x.setAttribute('aria-label', '닫기'); x.textContent = '×'; x.onclick = hidePop; pop.append(x);
    pop.hidden = false;
    host.querySelectorAll('.dot.is-on').forEach((e) => e.classList.remove('is-on'));
    dot.classList.add('is-on'); open = cd;
  }
  function hidePop() { pop.hidden = true; open = null; host.querySelectorAll('.dot.is-on').forEach((e) => e.classList.remove('is-on')); }
  for (const [cd] of mine) {
    const r = byCd.get(cd); if (!r) continue;
    const g = svg('g', { class: 'dot', tabindex: '0', role: 'button', 'data-cd': cd, 'aria-label': `${r.name} · ${(mine.get(cd) || []).map((x) => x.name).join(' · ')}` });
    g.append(svg('circle', { cx: r.c[0], cy: r.c[1], r: 13, class: 'halo' }), svg('circle', { cx: r.c[0], cy: r.c[1], r: 5, class: 'core' }));
    g.addEventListener('click', (e) => { e.stopPropagation(); open === cd ? hidePop() : showPop(cd, g); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open === cd ? hidePop() : showPop(cd, g); } });
    const t = svg('text', { x: r.c[0] + 12, y: r.c[1] + 4, class: 'lbl' }); t.textContent = r.name; g.append(t);   // 이름은 올리거나 눌렀을 때만(겹침 방지)
    gDot.append(g);
  }
  S.append(gLand, gRes, gDot, gLbl); host.append(S);
  /* 보기 틀 = 그려진 땅의 실제 범위(먼 섬은 1000 안으로 자름) + 여백 — 띠 높이에 꽉 차게 */
  try { const bb = gLand.getBBox(); const x0 = Math.max(0, bb.x) - 20, y0 = Math.max(0, bb.y) - 16, x1 = Math.min(1000, bb.x + bb.width) + 60, y1 = Math.min(1000, bb.y + bb.height) + 16; S.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`); S.setAttribute('preserveAspectRatio', 'xMinYMid meet'); } catch { /* 숨김 상태 */ }
  host.addEventListener('click', hidePop);
  /* 서비스 범례(XI맵과 같은 색) */
  const leg = document.getElementById('sd3-leg');
  for (const s of D.services || []) { const li = document.createElement('li'); const i = document.createElement('i'); i.style.background = s.color; li.append(i, s.name); li.title = `결과가 있는 시군구 ${s.n_regions}곳`; leg.append(li); }
  /* ?open=시군구코드 → 점을 눌러 둔 장면(캡처용) */
  if (Q.get('open')) { const g = host.querySelector(`.dot[data-cd="${Q.get('open')}"]`); if (g) showPop(Q.get('open'), g); }

  /* ② 최근 분석 결과 — 작은 그림(지도 서비스 그 결과 화면에서 떼어 온 것) + 결과 도형 겹(올리면 한 번 훑어지며 드러남) */
  const rl = document.getElementById('sd3-rl');
  for (const it of D.recent || []) {
    const li = document.createElement('li'), a = document.createElement('a'); a.href = `/landxi/v3/lx-map/?job=${it.job}`;
    const when = document.createElement('span'); when.className = 'sd3-when num'; when.textContent = it.day;
    const th = document.createElement('span'); th.className = 'sd3-th';
    if (it.thumb) { const im = document.createElement('img'); im.src = it.thumb; im.alt = `${it.title} · ${it.where} 결과 화면`; im.decoding = 'async'; th.append(im); }
    if (it.overlay && it.overlay.length) {
      const o = svg('svg', { viewBox: '0 0 560 340', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
      const g1 = svg('g', {}), g2 = svg('g', {});
      for (const pts of it.overlay) { g1.append(svg('polygon', { points: pts, class: 'ov' })); g2.append(svg('polygon', { points: pts, class: 'ov2' })); }
      o.append(g1, g2); th.append(o);
    }
    const rt = document.createElement('span'); rt.className = 'sd3-rt';
    const b = document.createElement('b'); b.textContent = it.title; const tg = document.createElement('span'); tg.className = 'sd3-tag done'; tg.textContent = '끝남'; b.append(tg);
    const w = document.createElement('span'); w.textContent = it.where; rt.append(b, w);
    const n = document.createElement('span'); n.className = 'sd3-n'; const nb = document.createElement('b'); nb.className = 'num sd3-cu'; nb.dataset.n = it.found; nb.textContent = '0'; const ns = document.createElement('small'); ns.textContent = it.by; n.append(nb, ns);
    a.append(when, th, rt, n); li.append(a); rl.append(li);
  }

  /* ④ 살아 있음 — 실제로 도는 작업이 있을 때만(running > 0). ?pulse=1 은 흉내 장면('흉내' 꼬리표) */
  const running = Number((D.jobs || {}).running) || 0, fake = Q.get('pulse') === '1';
  if (running > 0 || fake) {
    document.body.classList.add('is-live');
    const lv = document.getElementById('sd3-live'); lv.hidden = false;
    if (fake && !running) { document.getElementById('sd3-live-tag').hidden = false; const rc = document.querySelector('#sd3-running b'); rc.textContent = '1'; document.getElementById('sd3-running').classList.remove('is-zero'); }
  }

  /* ⑤ 숫자 차오름(처음 한 번 · 0.6초 안) · 도넛 · 막대 · 등장 */
  function countUp() {
    const els = [...document.querySelectorAll('.sd3-cu')];
    if (RM) { els.forEach((e) => { e.textContent = nf(e.dataset.n, +e.dataset.d || 0); }); return; }
    const t0 = performance.now(), dur = 600;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = E_UI(k); for (const el of els) { const v = Number(el.dataset.n), dd = +el.dataset.d || 0; el.textContent = nf(k < 1 ? v * e : v, dd); } if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.remove('sd3-boot'); document.body.classList.add('sd3-in'); countUp(); }));
})();
