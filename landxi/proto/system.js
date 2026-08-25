/* ============================================================================
   Land-XI 컴포넌트 시트 — 거동
   공개 API: LXSys.countUp(el) · LXSys.revealAll(root) · LXSys.crosshair(plateEl)
   원칙: 이징 1개(cubic-bezier(.15,1,.3,1)) · 지속 500/750/1000/1250 · 호버 180ms.
        수치는 전부 assets/data 의 실제 산출물에서 읽는다. 하드코딩 금지.
   ========================================================================= */
import { RESULTS }  from '../assets/data/results.js';
import { SERVICES } from '../assets/data/services.js';
import { IMAGERY }  from '../assets/data/imagery.js';

const RES = id => RESULTS.find(r => r.id === id);
const IMG = id => IMAGERY.find(i => i.id === id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = n => Number(n).toLocaleString('en-US');
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* 웹 메르카토르 타일 → 경위도 */
const tLng = (x, z) => x / Math.pow(2, z) * 360 - 180;
const tLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / Math.pow(2, z)))) * 180 / Math.PI;

/* ── 1. 타일 모자이크 ─────────────────────────────────────────────────────
   정사영상을 "지도 타일"이 아니라 "사진 원판"으로 취급한다(Vantor §2.6).      */
function mosaic(plate) {
  if (plate.dataset.built === '1') return plate.__geo;
  const set = plate.dataset.mosaic, z = +plate.dataset.z;
  const [x0, x1] = plate.dataset.x.split('-').map(Number);
  const [y0, y1] = plate.dataset.y.split('-').map(Number);
  const box = document.createElement('div');
  box.className = 'lx-mosaic' + (plate.dataset.raw === '1' ? ' lx-mosaic--raw' : '');
  box.style.gridTemplateColumns = `repeat(${x1 - x0 + 1},1fr)`;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const im = document.createElement('img');
    im.src = `../assets/tiles/${set}/${z}/${x}/${y}.webp`;
    im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    im.width = 256; im.height = 256;
    box.appendChild(im);
  }
  plate.insertBefore(box, plate.firstChild);
  plate.dataset.built = '1';
  const geo = {
    el: box, z, tiles: x1 - x0 + 1,
    bounds: [tLng(x0, z), tLat(y1 + 1, z), tLng(x1 + 1, z), tLat(y0, z)],
  };
  plate.__geo = geo;
  return geo;
}

/* 헤어라인 스케일바 — 실제 렌더 폭에서 m/px 를 계산한다(장식 숫자 금지) */
function scalebar(plate) {
  const bar = plate.querySelector('.lx-scalebar');
  if (!bar) return;
  const geo = plate.__geo || mosaic(plate);
  const w = geo.el.getBoundingClientRect().width;
  if (!w) return;
  const lat = (geo.bounds[1] + geo.bounds[3]) / 2;
  const mPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, geo.z) * (geo.tiles * 256 / w);
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const want = mPerPx * 140;
  const m = nice.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
  bar.querySelector('span').style.width = (m / mPerPx).toFixed(1) + 'px';
  bar.querySelector('b').textContent = `${fmt(m)} m`;
}

/* ── 2. 카운트업 — 배경/글자색/글자별 스태거 3겹(Vantor §4.4) ────────────── */
/* 자리(높이)를 먼저 잡아 둔다 — 값이 도착할 때 레이아웃이 흔들리면 안 된다 */
function buildChars(el) {
  if (el.dataset.built === '1') return;
  el.textContent = '';
  for (const c of fmt(Number(el.dataset.to))) {
    const s = document.createElement('span');
    s.className = 'lx-stat__ch'; s.textContent = c; el.appendChild(s);
  }
  el.dataset.built = '1';
}

function countUp(el) {
  const to  = Number(el.dataset.to);
  const dur = Number(el.dataset.dur || 1250);
  const target = fmt(to);
  buildChars(el);
  const sp = Array.from(el.children);
  el.dataset.done = '';
  const settle = () => {
    sp.forEach((s, i) => { s.classList.remove('is-pad'); s.classList.add('is-in'); s.textContent = target[i]; });
    el.dataset.done = '1';
  };
  if (reduced) { settle(); return Promise.resolve(to); }
  sp.forEach((s, i) => { s.classList.remove('is-in'); setTimeout(() => s.classList.add('is-in'), i * 40); });
  return new Promise(res => {
    const t0 = performance.now();
    (function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);                 // expo-out
      const cur = fmt(Math.round(to * e));
      const off = sp.length - cur.length;
      for (let i = 0; i < sp.length; i++) {
        if (i < off) { sp[i].textContent = '0'; sp[i].classList.add('is-pad'); }
        else { sp[i].classList.remove('is-pad'); sp[i].textContent = cur[i - off]; }
      }
      if (p < 1) requestAnimationFrame(tick); else { settle(); res(to); }
    })(performance.now());
  });
}

/* ── 3. 스크롤 리빌 — translateY(20px)→0 · 600ms · 60ms 스태거 ──────────── */
function revealAll(root = document) {
  const items = $$('[data-reveal]:not(.is-in)', root);
  if (reduced) { items.forEach(n => n.classList.add('is-in')); return items.length; }
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const n = e.target;
      setTimeout(() => n.classList.add('is-in'), Number(n.dataset.revealDelay || 0));
      io.unobserve(n);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
  items.forEach(n => {
    if (n.dataset.revealDelay == null) {
      const sibs = Array.from(n.parentElement.children).filter(x => x.hasAttribute('data-reveal'));
      n.dataset.revealDelay = String(Math.min(sibs.indexOf(n), 9) * 60);
    }
    io.observe(n);
  });
  return items.length;
}

/* 줄 단위 clip-path 리빌 — opacity 페이드가 아니라 마스크 + translateY */
function lineSplit(el) {
  if (el.dataset.split === '1') return;
  const parts = el.innerHTML.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
  el.innerHTML = parts.map((p, i) =>
    `<span class="lx-line"><i style="transition-delay:${i * 60}ms">${p}</i></span>`).join('');
  el.classList.add('lx-lines'); el.dataset.split = '1';
}
function playLines(el) {
  el.classList.remove('is-in');
  void el.offsetWidth;
  requestAnimationFrame(() => el.classList.add('is-in'));
}

/* ── 4. 커서 크로스헤어 — 플레이트 위에서만, lerp .16 ────────────────────── */
function crosshair(plate) {
  if (plate.__cross) return plate.__cross;
  plate.classList.add('has-cross');
  const box = document.createElement('div');
  box.className = 'lx-cross'; box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<i class="lx-cross__v"></i><i class="lx-cross__h"></i>' +
                  '<i class="lx-cross__d"></i><span class="lx-cross__r"></span>';
  plate.appendChild(box);
  const v = box.querySelector('.lx-cross__v'), h = box.querySelector('.lx-cross__h');
  const d = box.querySelector('.lx-cross__d'), r = box.querySelector('.lx-cross__r');
  let tx = 0, ty = 0, x = 0, y = 0, on = false, raf = 0;

  function paint() {
    v.style.transform = `translateX(${x.toFixed(1)}px)`;
    h.style.transform = `translateY(${y.toFixed(1)}px)`;
    d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    const pr = plate.getBoundingClientRect();
    const rw = r.offsetWidth || 150;
    const rx = Math.min(x, Math.max(0, pr.width - rw - 18));
    const ry = Math.min(y, Math.max(0, pr.height - 34));
    r.style.transform = `translate(${rx.toFixed(1)}px,${ry.toFixed(1)}px)`;
    const geo = plate.__geo;
    if (geo) {
      const g = geo.el.getBoundingClientRect();
      const u = (pr.left + x - g.left) / g.width, w = (pr.top + y - g.top) / g.height;
      const lng = geo.bounds[0] + u * (geo.bounds[2] - geo.bounds[0]);
      const lat = geo.bounds[3] - w * (geo.bounds[3] - geo.bounds[1]);
      r.textContent = `${lng.toFixed(4)}, ${lat.toFixed(4)}  EPSG:4326`;
    } else {
      r.textContent = `${Math.round(x)}, ${Math.round(y)} px`;
    }
  }
  function loop() {
    x += (tx - x) * 0.16; y += (ty - y) * 0.16;
    paint();
    raf = (on || Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) ? requestAnimationFrame(loop) : 0;
  }
  plate.addEventListener('pointerenter', e => {
    const b = plate.getBoundingClientRect();
    x = tx = e.clientX - b.left; y = ty = e.clientY - b.top;
    on = true; box.classList.add('on'); paint();
    if (!raf) raf = requestAnimationFrame(loop);
  });
  plate.addEventListener('pointermove', e => {
    const b = plate.getBoundingClientRect();
    tx = e.clientX - b.left; ty = e.clientY - b.top;
    if (!raf) raf = requestAnimationFrame(loop);
  });
  plate.addEventListener('pointerleave', () => { on = false; box.classList.remove('on'); });
  plate.__cross = { el: box, move(px, py) { tx = px; ty = py; if (!raf) raf = requestAnimationFrame(loop); } };
  return plate.__cross;
}

/* ── 5. 시트 조립 — 전부 실제 산출물에서 ──────────────────────────────────── */
const ORG = { '해양수산부': '해수부', '농림축산식품부': '농식품부', '국토교통부': '국토부',
              '환경부': '환경부', '산업통상자원부': '산업부', 'LX 한국국토정보공사': 'LX' };

function buildIndex() {
  const ul = $('#lx-index'); if (!ul) return;
  const rows = SERVICES.slice().sort((a, b) => b.count - a.count);
  ul.innerHTML = rows.map((s, i) => `
    <a class="lx-index__row" href="#s06" data-reveal>
      <span class="lx-index__no">${String(i + 1).padStart(2, '0')}</span>
      <span class="lx-index__name">${s.name}</span>
      <span class="lx-index__tag">${s.real
        ? '<span class="lx-chip lx-chip--real">실자산 기반</span>'
        : '<span class="lx-chip lx-chip--pending">실데이터 준비 중</span>'}</span>
      <span class="lx-index__org">${s.ministry}</span>
      <span class="lx-index__when">최종 ${s.lastRun}</span>
      <span class="lx-index__n">${fmt(s.count)}<em>${s.unit}</em></span>
      <span class="lx-index__arw">&#8594;</span>
    </a>`).join('');
  const real = SERVICES.filter(s => s.real).length;
  const sum = SERVICES.reduce((a, s) => a + s.count, 0);
  const foot = $('#lx-index-foot');
  if (foot) foot.innerHTML =
    `<span>서비스 <b>${SERVICES.length}</b>종 · 참여 부처 <b>5</b> + LX</span>` +
    `<span>실자산 기반 <b>${real}</b>종 · 라인업 소개 <b>${SERVICES.length - real}</b>종</span>` +
    `<span>합계 <b>${fmt(sum)}</b> (단위 혼재 — 합산은 참고값)</span>`;
}

function buildStats() {
  $$('.lx-stat').forEach(box => {
    const n = box.querySelector('.lx-stat__n');
    if (!n) return;
    buildChars(n);
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect(); countUp(n);
    }, { threshold: 0.35 });
    io.observe(box);
  });
}

function buildClasses() {
  const host = $('#lx-classes'); if (!host) return;
  const st = RES('yeosu-marine-2026-drone').stats;
  const es = Object.entries(st.classes).sort((a, b) => b[1] - a[1]);
  const max = es[0][1];
  host.innerHTML = es.map(([k, v]) => `
    <div class="lx-class__row" data-reveal>
      <span class="lx-class__k">${k}</span>
      <span class="lx-class__bar"><i data-w="${(v / max * 100).toFixed(2)}"></i></span>
      <span class="lx-class__n">${fmt(v)}</span>
      <span class="lx-class__p">${(v / st.count * 100).toFixed(1)}%</span>
    </div>`).join('');
  const io = new IntersectionObserver(esx => {
    if (!esx[0].isIntersecting) return;
    io.disconnect();
    $$('.lx-class__bar i', host).forEach((b, i) =>
      setTimeout(() => { b.style.width = b.dataset.w + '%'; }, i * 60));
  }, { threshold: 0.2 });
  io.observe(host);
  const cap = $('#lx-classes-cap');
  if (cap) cap.innerHTML =
    `여수시 국동항 · 드론 GSD 1.1 cm · ${st.analyzedAt} · <b>${fmt(st.count)}</b>건 ${es.length}종 · ` +
    `면적 합 <b>${fmt(st.areaM2.toFixed(0))}</b> m&sup2; · 신뢰도 평균 <b>${st.confMean.toFixed(4)}</b>`;
}

/* 임계 슬라이더 ↔ 히스토그램 — 같은 프레임 안에서 값이 도착한다 */
function buildThreshold() {
  const root = $('#lx-threshold'); if (!root) return;
  const st = RES('yeosu-marine-2026-drone').stats;
  const hist = st.confHist, bins = st.confBins, total = st.count;
  const svg = $('#lx-hist'), input = $('#lx-thr-input');
  const W = 1000, H = 300, gap = 8, bw = W / hist.length;
  const max = Math.max(...hist);
  const bars = hist.map((v, i) => {
    const h = v / max * (H - 4);
    return `<rect class="b" data-i="${i}" x="${(i * bw + gap / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}"></rect>`;
  }).join('');
  svg.innerHTML = bars +
    `<line class="base" x1="0" y1="${H}" x2="${W}" y2="${H}"></line>` +
    `<line class="thr" id="lx-thr-line" x1="0" y1="0" x2="0" y2="${H}"></line>`;
  const line = $('#lx-thr-line');

  const shown = t => {
    let s = 0;
    for (let i = 0; i < hist.length; i++) {
      const a = bins[i], b = bins[i + 1];
      if (b <= t) continue;
      if (a >= t) { s += hist[i]; continue; }
      s += hist[i] * (b - t) / (b - a);
    }
    return Math.round(s);
  };
  function apply(t) {
    const x = (t - bins[0]) / (bins[bins.length - 1] - bins[0]) * W;
    line.setAttribute('x1', x.toFixed(2)); line.setAttribute('x2', x.toFixed(2));
    $$('.b', svg).forEach((b, i) => b.classList.toggle('on', bins[i + 1] > t));
    const w = root.querySelector('.lx-slider__wrap').getBoundingClientRect().width;
    const p = (t - 0.10) / (0.90 - 0.10);
    root.querySelector('.lx-slider__fill').style.width = (p * w).toFixed(1) + 'px';
    root.querySelector('.lx-slider__thumb').style.left = (p * w).toFixed(1) + 'px';
    $('#lx-thr-val').textContent = t.toFixed(2);
    const on = shown(t);
    $('#lx-thr-read').innerHTML =
      `<span>표시 <b>${fmt(on)}</b> / ${fmt(total)}건</span>` +
      `<span>감쇠 <b>${fmt(total - on)}</b>건 (삭제가 아니라 감쇠 · opacity .12)</span>` +
      `<span>bin 0.1 · 임계 사이는 선형 보간</span>`;
    root.dataset.t = t.toFixed(2); root.dataset.shown = String(on);
  }
  input.addEventListener('input', () => apply(+input.value / 100));
  addEventListener('resize', () => apply(+input.value / 100));
  apply(+input.value / 100);
  root.__apply = apply;
}

/* 타임라인 자 + 필름스트립 — 남원 4시점, 한 축을 공유한다 */
function buildTime() {
  const strip = $('#lx-strip'), ruler = $('#lx-ruler');
  const ids = ['namwon_2504', 'namwon_2506', 'namwon_2508', 'namwon_2510'];
  const eps = ids.map(id => IMG(id)).filter(Boolean);
  if (!eps.length) return;
  const T = d => new Date(d + '-15T00:00:00Z').getTime();
  const t0 = T('2025-03'), t1 = T('2025-11');
  const pos = d => (T(d) - t0) / (t1 - t0);

  if (strip) {
    strip.innerHTML = eps.map((e, i) => `
      <button class="lx-strip__i${i === 2 ? ' is-sel' : ''}" data-ep="${i}" type="button" aria-pressed="${i === 2}">
        <span class="lx-strip__f">
          <i class="lx-strip__b"></i><i class="lx-strip__b"></i><i class="lx-strip__b"></i><i class="lx-strip__b"></i>
          <span class="lx-plate" data-mosaic="${e.id}" data-z="17" data-x="111902-111904" data-y="51679-51681"></span>
        </span>
        <span class="lx-strip__c"><span>${e.captured}</span><span>GSD ${(e.gsd * 100).toFixed(2)} cm</span></span>
      </button>`).join('');
    $$('.lx-plate', strip).forEach(mosaic);
  }
  if (ruler) {
    let html = '';
    for (let m = 3; m <= 11; m++) {
      const d = `2025-${String(m).padStart(2, '0')}`;
      html += `<i class="lx-ruler__tick" style="left:${(pos(d) * 100).toFixed(3)}%"></i>`;
    }
    eps.forEach(e => {
      html += `<i class="lx-ruler__tick maj" style="left:${(pos(e.captured) * 100).toFixed(3)}%"></i>` +
        `<span class="lx-ruler__lab" data-at="${e.captured}" style="left:${(pos(e.captured) * 100).toFixed(3)}%">` +
        `${e.captured}<em>GSD ${(e.gsd * 100).toFixed(2)} cm</em></span>`;
    });
    html += '<i class="lx-ruler__head" id="lx-head"></i>';
    ruler.innerHTML = html;
  }

  let cur = 2, timer = 0;
  const play = $('#lx-play');
  function select(i) {
    cur = ((i % eps.length) + eps.length) % eps.length;
    $$('.lx-strip__i', strip || document).forEach((b, k) => {
      b.classList.toggle('is-sel', k === cur); b.setAttribute('aria-pressed', String(k === cur));
    });
    const p = pos(eps[cur].captured);
    const head = $('#lx-head');
    if (head) head.style.transform = `translateX(${(p * ruler.getBoundingClientRect().width).toFixed(1)}px)`;
    $$('.lx-ruler__lab', ruler || document).forEach(l => l.classList.toggle('on', l.dataset.at === eps[cur].captured));
    const out = $('#lx-time-read');
    if (out) out.innerHTML =
      `<span>선택 <b>${eps[cur].captured}</b></span>` +
      `<span>GSD <b>${(eps[cur].gsd * 100).toFixed(2)}</b> cm</span>` +
      `<span>AOI <b>0.61</b> km&sup2; · 전북 남원시 농경지</span>`;
    document.body.dataset.ep = String(cur);
  }
  $$('.lx-strip__i', strip || document).forEach(b =>
    b.addEventListener('click', () => { stop(); select(+b.dataset.ep); }));
  function stop() { if (timer) { clearInterval(timer); timer = 0; } if (play) play.setAttribute('aria-pressed', 'false'); }
  if (play) play.addEventListener('click', () => {
    if (timer) return stop();
    play.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => select(cur + 1), 1250);
    select(cur + 1);
  });
  addEventListener('resize', () => select(cur));
  select(2);
}

/* 스티키 스플릿 — 활성 챕터만 흰색(여기선 검정)으로 올라온다 */
function buildSplit() {
  const items = $$('[data-chapter]');
  if (!items.length) return;
  const menu = $$('#lx-chapters li');
  const io = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const k = e.target.dataset.chapter;
      menu.forEach(li => li.classList.toggle('on', li.dataset.chapter === k));
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  items.forEach(n => io.observe(n));
}

/* 그리드 실측 읽기 — 화면에 뜬 숫자는 전부 해설이어야 한다(판정 규칙 9) */
function gridRead() {
  const cell = $('#lx-grid-demo i');
  const out = $('#lx-grid-read');
  if (!cell || !out) return;
  const m = getComputedStyle(document.documentElement).getPropertyValue('--lx-margin').trim();
  out.innerHTML = `<span>뷰포트 <b>${innerWidth}</b> px</span><span>여백 <b>${m}</b></span>` +
    `<span>거터 <b>24 px</b></span><span>1컬럼 <b>${cell.getBoundingClientRect().width.toFixed(2)}</b> px</span>`;
}

/* 밑줄 통과 — 되감기가 아니라 그은 방향 그대로 빠져나간다 */
function underlines() {
  $$('.lx-link').forEach(a => {
    a.addEventListener('mouseleave', () => {
      a.classList.add('is-off');
      setTimeout(() => a.classList.remove('is-off'), 520);
    });
  });
}

/* ── 6. 부팅 ─────────────────────────────────────────────────────────────── */
function init() {
  $$('.lx-plate[data-mosaic]').forEach(mosaic);
  buildIndex(); buildClasses(); buildThreshold(); buildTime(); buildSplit(); buildStats();
  $$('[data-lines]').forEach(el => {
    lineSplit(el);
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect(); requestAnimationFrame(() => el.classList.add('is-in'));
    }, { threshold: 0.2 });
    io.observe(el);
  });
  $$('[data-replay]').forEach(b =>
    b.addEventListener('click', () => {
      const t = $(b.dataset.replay);
      if (t) playLines(t);
      const s = $$(b.dataset.replayStat || '#lx-nothing');
      s.forEach(countUp);
    }));
  $$('.lx-plate[data-cross]').forEach(crosshair);
  underlines();
  gridRead(); addEventListener('resize', gridRead);
  const rs = () => $$('.lx-plate[data-mosaic]').forEach(p => scalebar(p));
  rs(); addEventListener('resize', rs);
  addEventListener('load', rs);
  revealAll();
  $$('.lx-ret').forEach(r => {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { r.classList.add('is-in'); io.disconnect(); } }, { threshold: 1 });
    io.observe(r);
  });
  document.documentElement.dataset.lxReady = '1';
}

const LXSys = { countUp, buildChars, revealAll, crosshair, mosaic, scalebar, lineSplit, playLines, reduced,
                data: { RESULTS, SERVICES, IMAGERY } };
window.LXSys = LXSys;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
export default LXSys;
