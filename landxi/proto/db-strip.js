// 스캔 스트립 — 화면 아래 시간 밀도 막대 하나.
// 축은 실제 분석일(results.js 의 analyzedAt) 사이의 기간이고, 막대의 높이는
// 그 날 등록된 실제 객체 수다. 스스로 재생하다가 사건(분석 완료) 위에서 멈춘다.
import { EPOCHS, T0, T1, at, dateAt, nf, ymd } from './db-data.js';

const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY = 86400000;
const d = (s) => new Date(s + 'T00:00:00Z');
const DAYS = Math.round((d(T1) - d(T0)) / DAY) + 1;

/** 일별 등록 객체 수 — 사건이 없는 날은 0. 지어낸 곡선을 그리지 않는다. */
const perDay = (() => {
  const a = new Array(DAYS).fill(0);
  for (const e of EPOCHS) a[Math.round((d(e.date) - d(T0)) / DAY)] += e.count;
  return a;
})();
const MAXD = Math.max(...perDay);

export function mountStrip(el, { onScrub = () => {}, onEvent = () => {} } = {}) {
  const cv = el.querySelector('#strip-bar');
  const track = el.querySelector('#strip-track');
  const head = el.querySelector('#strip-head');
  const marks = el.querySelector('#strip-marks');
  const play = el.querySelector('#strip-play');
  const now = el.querySelector('#strip-now');
  const note = el.querySelector('#strip-note');
  el.querySelector('#strip-t0').textContent = ymd(T0);
  el.querySelector('#strip-t1').textContent = ymd(T1);

  /* 사건 눈금 */
  marks.innerHTML = EPOCHS.map((e) => {
    const p = at(e.date) * 100;
    return `<i style="left:${p}%"></i><span style="left:${p}%">${ymd(e.date).slice(5)}</span>`;
  }).join('');

  /* 밀도 막대 */
  const ctx = cv.getContext('2d');
  function draw() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    const w = r.width / DAYS;
    // 바닥 헤어라인 — 기간 전체가 한 줄로 존재한다
    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect(0, r.height - 1, r.width, 1);
    for (let i = 0; i < DAYS; i++) {
      const v = perDay[i];
      const x = i * w;
      if (!v) { ctx.fillStyle = '#EDEDEE'; ctx.fillRect(x, r.height - 3, Math.max(0.6, w - 0.6), 2); continue; }
      const h = 5 + (v / MAXD) * (r.height - 8);
      ctx.fillStyle = '#006DF7';
      ctx.fillRect(x, r.height - h, Math.max(1.4, w - 0.6), h);
    }
  }
  draw();
  addEventListener('resize', draw);

  /* 재생 — 사건 위에서 선다 */
  let p = 0;
  let playing = !REDUCED();
  let hold = 0;
  let last = performance.now();
  const seen = new Set();
  const DUR = 26000;             // 기간 전체를 26초에 지난다
  const HOLD = 1500;

  function paint() {
    head.style.left = `${p * 100}%`;
    const date = dateAt(p);
    now.textContent = ymd(date);
    track.setAttribute('aria-valuenow', Math.round(p * 100));
    track.setAttribute('aria-valuetext', ymd(date));
    onScrub(p, date);
  }

  function tick(t) {
    const dt = t - last; last = t;
    if (playing) {
      if (hold > 0) { hold -= dt; if (hold <= 0) el.classList.remove('is-hold'); }
      else {
        p += dt / DUR;
        if (p >= 1) { p = 0; seen.clear(); }
        for (const e of EPOCHS) {
          const ep = at(e.date);
          if (!seen.has(e.id) && p >= ep) {
            seen.add(e.id); p = ep; hold = HOLD; el.classList.add('is-hold');
            note.innerHTML = `<b>${e.title}</b> · ${nf.format(e.count)}${e.unit} 등록`;
            onEvent(e);
            break;
          }
        }
      }
      paint();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  play.setAttribute('aria-pressed', String(playing));
  play.addEventListener('click', () => { playing = !playing; play.setAttribute('aria-pressed', String(playing)); if (!playing) el.classList.remove('is-hold'); });

  /* 수동 스크럽 */
  const setFromX = (clientX) => {
    const r = track.getBoundingClientRect();
    p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    seen.clear(); for (const e of EPOCHS) if (p >= at(e.date)) seen.add(e.id);
    hold = 0; el.classList.remove('is-hold');
    paint();
  };
  let drag = false;
  track.addEventListener('pointerdown', (ev) => { drag = true; playing = false; play.setAttribute('aria-pressed', 'false'); track.setPointerCapture(ev.pointerId); setFromX(ev.clientX); });
  track.addEventListener('pointermove', (ev) => { if (drag) setFromX(ev.clientX); });
  track.addEventListener('pointerup', () => { drag = false; });
  track.addEventListener('keydown', (ev) => {
    const step = ev.shiftKey ? 0.1 : 1 / DAYS;
    if (ev.key === 'ArrowRight') { p = Math.min(1, p + step); paint(); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft') { p = Math.max(0, p - step); paint(); ev.preventDefault(); }
    if (ev.key === ' ') { playing = !playing; play.setAttribute('aria-pressed', String(playing)); ev.preventDefault(); }
  });

  if (REDUCED()) { p = 1; }
  paint();
  note.innerHTML = `기간 <b>${ymd(T0)} – ${ymd(T1)}</b> · 막대 높이 = 그날 등록된 객체 수`;

  return {
    get p() { return p; },
    get date() { return dateAt(p); },
    seek(v) { p = v; paint(); },
    stop() { playing = false; play.setAttribute('aria-pressed', 'false'); },
  };
}
