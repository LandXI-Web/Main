// 시간 자 — 우측 단 머리에 상주하는 헤어라인 한 줄.
// 스스로 재생되다가 '사건'에서 멈춘다(Palantir P4). 멈춘 순간에만 앰버가 380ms 켜진다.
// 자가 지나간 시점 이후의 것은 삭제되지 않고 감쇠한다(P1·P5).
import { EVENTS, LOG, T0, T1, at, dateAt } from './db-data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SWEEP = 17000;    // 축 전체를 지나는 시간
const HOLD = 2200;      // 사건에서 머무는 시간
const LOOP = 3200;      // 끝에서 다시 시작하기까지

/**
 * @param {HTMLElement} el `#ruler`
 * @param {{onTick:(date:string,p:number)=>void, onEvent:(ev:object|null)=>void}} hooks
 */
export function mountRuler(el, { onTick = () => {}, onEvent = () => {} } = {}) {
  const track = el.querySelector('#rul-track');
  const head = el.querySelector('#rul-head');
  const btn = el.querySelector('#rul-play');
  const dateEl = el.querySelector('#rul-date');
  const noteEl = el.querySelector('#rul-note');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 눈금: 사건은 굵은 눈금, 나머지 기록은 실눈금. 월 경계에 라벨.
  const minor = LOG.filter((l) => !l.event).map((l) => l.date);
  track.insertAdjacentHTML('beforeend', minor.map((dt) =>
    `<i class="rul-t" style="left:${(at(dt) * 100).toFixed(3)}%"></i>`).join(''));
  track.insertAdjacentHTML('beforeend', EVENTS.map((e, i) =>
    `<button type="button" class="rul-e" data-i="${i}" style="left:${(at(e.date) * 100).toFixed(3)}%"` +
    ` aria-label="${esc(e.date)} ${esc(e.label)}"><span>${esc(e.date.slice(5).replace('-', '.'))}</span></button>`).join(''));

  const stops = EVENTS.map((e) => ({ p: at(e.date), ev: e }));
  let p = reduced ? 1 : 0;
  let playing = false, raf = 0, last = 0, holdUntil = 0, nextStop = 0, curEvent = null;

  const paint = () => {
    head.style.left = `${(p * 100).toFixed(3)}%`;
    el.style.setProperty('--p', p.toFixed(4));
    const dt = dateAt(p);
    dateEl.textContent = dt;
    onTick(dt, p);
  };

  const say = (ev) => {
    curEvent = ev;
    noteEl.textContent = ev ? `${ev.label}` : '';
    el.classList.toggle('is-stopped', !!ev);
    track.querySelectorAll('.rul-e').forEach((b, i) => b.classList.toggle('is-now', !!ev && EVENTS[i] === ev));
    if (ev) {
      el.classList.add('is-arrive');
      setTimeout(() => el.classList.remove('is-arrive'), 380);   // 앰버는 도착 순간만
    }
    onEvent(ev);
  };

  const frame = (t) => {
    if (!playing) return;
    const dt = last ? t - last : 0; last = t;
    if (t < holdUntil) { raf = requestAnimationFrame(frame); return; }
    if (curEvent) say(null);
    p += dt / SWEEP;
    if (nextStop < stops.length && p >= stops[nextStop].p) {
      p = stops[nextStop].p;
      say(stops[nextStop].ev);
      holdUntil = t + HOLD;
      nextStop++;
    }
    if (p >= 1) {
      p = 1; paint();
      holdUntil = t + LOOP; nextStop = 0; p = -0.0001;
      raf = requestAnimationFrame(frame); return;
    }
    paint();
    raf = requestAnimationFrame(frame);
  };

  const play = () => {
    if (playing) return;
    playing = true; last = 0; holdUntil = 0;
    if (p >= 1) { p = 0; nextStop = 0; }
    el.classList.add('is-playing');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', '시간 재생 정지');
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    playing = false; cancelAnimationFrame(raf);
    el.classList.remove('is-playing');
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', '시간 재생');
  };
  const seek = (v) => {
    pause(); say(null);
    p = Math.min(1, Math.max(0, v));
    nextStop = stops.findIndex((s) => s.p > p); if (nextStop < 0) nextStop = stops.length;
    paint();
  };

  btn.addEventListener('click', () => (playing ? pause() : play()));
  track.addEventListener('click', (ev) => {
    const b = ev.target.closest('.rul-e');
    const box = track.getBoundingClientRect();
    if (b) { seek(stops[+b.dataset.i].p); say(EVENTS[+b.dataset.i]); return; }
    seek((ev.clientX - box.left) / box.width);
  });
  // 스크롤로 읽는 중에는 자가 방해하지 않는다 — 탭을 벗어나면 멈춘다.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  el.querySelector('#rul-t0').textContent = T0;
  el.querySelector('#rul-t1').textContent = T1;
  paint();
  if (!reduced) play(); else { el.classList.add('is-static'); noteEl.textContent = '감소 모션 — 전체 기간 표시'; }

  return { play, pause, seek, get p() { return p; }, get playing() { return playing; }, events: EVENTS, stops: () => nextStop };
}
