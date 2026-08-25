// Scene 2 · 전국 서비스 현황 HUD — 지도 위에 뜬 포인트·리더선·라벨 카드.
// 좌표는 map.project(lnglat) 한 곳에서만 만든다. 다만 폴백 캔버스 지도는 실제 축척이 아니라
// 1.4°×1.4° 짜리 절차적 세계라서 전국 13개 지점이 화면 밖으로 흩어진다. 그래서 폴백일 때만
// (경도,위도)를 화면 안쪽 사각형에 등비로 맞춘다 — 폴백 project 가 경위도에 대해 아핀이므로
// 이 보정은 결국 평면 정거원통 도법이 되어 국토의 상대 배치가 그대로 보존된다.
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const OFF = 22;          // 포인트 → 라벨 꺾임점 오프셋(px)
const TAIL = 34;         // 라벨 밑줄 리더선 길이(px)
const GAP = 5;           // 같은 쪽 라벨 사이 최소 간격(px)
const TOP = 76;          // 상단 바 아래
const STATS_W = 268;     // 우상단 지표 타일이 차지하는 폭
const LINEUP_H = 210;    // 좌하단 라인업 칩 바가 차지하는 높이
const LAT_STRETCH = 1.24; // 폴백 맞춤에서 위도를 늘려 국토가 납작해지지 않게 한다

const nf = new Intl.NumberFormat('ko-KR');
const dateText = d => String(d || '').replace(/-/g, '.');

/**
 * @param {object} map  createMap() 이 돌려준 LXMap
 * @param {Array}  services  SERVICES
 * @param {{onSelect?:(id:string)=>void}} opt
 * @returns {{el:HTMLElement, show:()=>void, hide:()=>void, highlight:(id:string|null)=>void, layout:()=>void, destroy:()=>void}}
 */
export function createHud(map, services, { onSelect } = {}) {
  const el = document.createElement('div');
  el.className = 'hud';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'hud__svg');
  svg.setAttribute('aria-hidden', 'true');
  el.append(svg);

  // 라벨을 먼저, 포인트를 나중에 붙여 포인트가 항상 위에 온다(클릭 대상이 가려지지 않게).
  const items = services.map(s => {
    const leader = document.createElementNS(NS, 'path');
    leader.setAttribute('class', 'hud__leader');
    leader.setAttribute('data-service', s.id);
    svg.append(leader);

    const label = document.createElement('div');
    label.className = 'hud__label';
    label.dataset.service = s.id;
    label.setAttribute('aria-hidden', 'true');   // 같은 정보를 .hud__point 버튼이 이미 읽어 준다
    label.style.setProperty('--c', s.color);
    label.innerHTML = `<b>${s.name}</b><span class="n">${nf.format(s.count)}<i>${s.unit}</i></span>`
      + `<span class="m">${dateText(s.lastRun)}</span>`
      + (s.real ? '<span class="real">실데이터</span>' : '');
    el.append(label);
    return { s, leader, label, point: null, w: 0, h: 0 };
  });

  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hud__point' + (it.s.real ? ' is-real' : '');
    b.dataset.service = it.s.id;
    b.style.setProperty('--c', it.s.color);
    b.setAttribute('aria-label', `${it.s.name} ${nf.format(it.s.count)}${it.s.unit} — 분석 보기`);
    el.append(b);
    it.point = b;
  }

  const pick = id => { if (typeof onSelect === 'function') onSelect(id); };
  el.addEventListener('click', e => {
    const t = e.target.closest('.hud__point,.hud__label');
    if (t) pick(t.dataset.service);
  });
  el.addEventListener('pointerover', e => {
    const t = e.target.closest('.hud__point,.hud__label');
    if (t) highlight(t.dataset.service);
  });
  el.addEventListener('pointerout', e => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget)) highlight(null);
  });
  el.addEventListener('focusin', e => { const t = e.target.closest('.hud__point'); if (t) highlight(t.dataset.service); });
  el.addEventListener('focusout', () => highlight(null));

  /* ── 폴백 전용 화면 맞춤 ─────────────────────────────────── */
  const fit = { on: false, k: 1, x0: 0, y0: 0, lng0: 0, lat1: 0 };
  function measureFit() {
    fit.on = map.engine !== 'maplibre';
    if (!fit.on) return;
    const W = innerWidth, H = innerHeight;
    const lngs = services.map(s => s.lnglat[0]), lats = services.map(s => s.lnglat[1]);
    const w0 = Math.min(...lngs), w1 = Math.max(...lngs), s0 = Math.min(...lats), s1 = Math.max(...lats);
    // 지표 타일(우상단)·라인업(좌하단)을 피해 화면 가운데 살짝 오른쪽에 국토를 앉힌다.
    const rect = { x: W * 0.30, y: 108, w: Math.min(380, W * 0.30), h: Math.max(220, H - 108 - 190) };
    const gw = Math.max(0.001, w1 - w0), gh = Math.max(0.001, (s1 - s0) * LAT_STRETCH);
    fit.k = Math.min(rect.w / gw, rect.h / gh);
    fit.x0 = rect.x + (rect.w - gw * fit.k) / 2;
    fit.y0 = rect.y + (rect.h - gh * fit.k) / 2;
    fit.lng0 = w0; fit.lat1 = s1;
  }
  const screenOf = s => fit.on
    ? [(s.lnglat[0] - fit.lng0) * fit.k + fit.x0, (fit.lat1 - s.lnglat[1]) * fit.k * LAT_STRETCH + fit.y0]
    : map.project(s.lnglat);

  /* ── 배치 ────────────────────────────────────────────────── */
  function measureLabels() {
    for (const it of items) { it.w = it.label.offsetWidth; it.h = it.label.offsetHeight; }
  }

  let shown = false;
  function layout() {
    if (!shown) return;
    const W = innerWidth, H = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // 1) 포인트를 찍고, 화면 밖으로 나간 것은 라벨 배치에서 뺀다.
    const live = [];
    for (const it of items) {
      const p = screenOf(it.s);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      it.px = Math.round(p[0]); it.py = Math.round(p[1]);
      const off = it.px < 8 || it.py < 8 || it.px > W - 8 || it.py > H - 8;
      it.point.style.left = it.px + 'px';
      it.point.style.top = it.py + 'px';
      it.point.classList.toggle('is-off', off);
      it.label.classList.toggle('is-off', off);
      if (!off) live.push(it);
    }
    if (!live.length) return;

    // 2) 국토 중심을 기준으로 라벨을 좌·우로 부채꼴처럼 갈라 놓는다(리더선이 바깥을 향한다).
    const cx = live.reduce((a, it) => a + it.px, 0) / live.length;
    const left = [], right = [];
    for (const it of live) {
      let dx = it.px < cx ? -1 : 1;
      if (dx > 0 && it.px + OFF + it.w > W - STATS_W) dx = -1;
      if (dx < 0 && it.px - OFF - it.w < 20) dx = 1;
      it.dx = dx;
      it.ly = it.py - OFF - it.h;        // 선호 위치: 포인트에서 우/좌상향
      (dx < 0 ? left : right).push(it);
    }

    // 3) 같은 쪽 라벨끼리 세로로만 밀어 겹침을 없앤다(좌측은 라인업 칩 바를 피해 위쪽 띠만 쓴다).
    separate(left, TOP, H - LINEUP_H);
    separate(right, TOP, H - 40);

    // 4) 리더선은 포인트 → 팔꿈치 → 라벨 밑줄. 팔꿈치는 라벨의 안쪽 모서리에 붙는다.
    for (const it of live) {
      const ex = it.px + it.dx * OFF, ey = Math.round(it.ly + it.h);
      it.label.style.left = Math.round(it.dx > 0 ? ex : ex - it.w) + 'px';
      it.label.style.top = Math.round(it.ly) + 'px';
      it.leader.setAttribute('d', `M${it.px} ${it.py}L${ex} ${ey}L${ex + it.dx * Math.min(TAIL, it.w)} ${ey}`);
    }
  }

  /** 한 쪽 라벨 무리를 [top, bottom] 띠 안에서 세로로 벌린다(위→아래 훑고, 넘치면 되민다). */
  function separate(group, top, bottom) {
    if (!group.length) return;
    group.sort((a, b) => a.ly - b.ly);
    let y = top;
    for (const it of group) { it.ly = Math.max(it.ly, y); y = it.ly + it.h + GAP; }
    let limit = bottom;
    for (let i = group.length - 1; i >= 0; i--) {
      const it = group[i];
      it.ly = Math.max(top, Math.min(it.ly, limit - it.h));
      limit = it.ly - GAP;
    }
  }

  function highlight(id) {
    for (const it of items) {
      const on = id != null && it.s.id === id;
      it.point.classList.toggle('is-hot', on);
      it.label.classList.toggle('is-hot', on);
      it.leader.classList.toggle('is-hot', on);
    }
  }

  const onResize = () => { measureFit(); measureLabels(); layout(); };
  addEventListener('resize', onResize);
  // LXMap.on 은 핸들러 '교체' 방식이다 — 홈에서 'move' 를 쓰는 곳은 HUD 뿐이어야 한다.
  map.on('move', () => layout());

  return {
    el, layout, highlight,
    show() {
      if (shown) return;
      shown = true;
      measureFit(); measureLabels(); layout();
      // 다음 프레임에 is-on 을 올려야 페이드가 첫 배치 이후에 시작된다.
      REDUCE ? el.classList.add('is-on') : requestAnimationFrame(() => el.classList.add('is-on'));
    },
    hide() { shown = false; highlight(null); el.classList.remove('is-on'); },
    destroy() { removeEventListener('resize', onResize); el.remove(); },
  };
}
