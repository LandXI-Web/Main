/* ============================================================================
   landxi/proto/scrub/loader.js — 필름 로더 (전송 예산, 2026-09-26)

   왜: 감사 G-15 — 첫 화면 4초에 11.5 MB(w01 3.6 + w02 4.6 + MapLibre 0.9 + 포스터 0.75 …),
       End 키 한 번에 15.3 MB(w01·w02·w11·w12). 첫 화면만 보고 떠나는 손님도 w02 를 통째로 받았다.
       엔진(vendor/scrollcraft)은 트랙 ±1.6vh 안의 레그를 **무조건** 받는다 — 한 번 훑고 지나가는
       레그도, 첫 화면에서 아직 스크롤하지 않은 손님도.

   무엇: 엔진은 건드리지 않는다. 엔진이 받는 조건은 `data-sc-src` 가 있느냐 하나이므로
       마크업은 주소를 `data-sb-src` 에 **숨겨** 두고, 이 로더가 "받아도 되는 레그"에만
       `data-sc-src` 를 **한 번** 붙인다(붙인 뒤에는 절대 바꾸거나 떼지 않는다 —
       worldflight §8 #2 "src 를 교체하지 않는다"는 그대로다. 엔진이 여전히 1회 Blob 으로 문다).

   규칙
     ① 의도 전에는 받지 않는다. 첫 화면은 레그 01 의 포스터(= 필름 첫 프레임) 한 장이다.
        스크롤·휠·터치·키·포인터 중 하나가 오거나, 아무것도 없이 IDLE_MS 가 지나면 시작한다.
        (포스터는 필름 첫 프레임이고, 엔진은 클립이 그려지기 전까지 포스터를 밀어 넣어
         카메라가 이미 움직이는 것처럼 읽게 한다 — 첫 스크롤에서 끊김이 없다.)
     ② 현재 레그 + 진행 방향으로 1~2 레그. 방향은 트랙 속도의 부호로 예측한다.
        정방향이면 k, k+1, 그리고 레그 절반을 넘으면 k+2. 역방향이면 대칭.
     ③ 훑고 지나가는 레그는 받지 않는다. 속도가 SLOW 보다 빠를 때는 "원하는 상태"가
        DWELL 동안 이어져야 붙인다. 플링·End 키·항로 점프가 지나친 레그는 0 바이트다.
     ④ 느린 망(Save-Data · 2g/3g)에서는 데스크톱도 모바일 저해상 변형(960×540)을 받는다.
        좁은 화면·터치 기기는 엔진이 이미 `-m` 을 고른다.
     ⑤ 포스터도 게으르다. 창(k−1 … k+3) 안의 것만 즉시, 나머지는 의도 뒤 유휴 시간에 조금씩.
        reduced-motion 이면 포스터가 필름이므로 14장을 바로 건다(클립은 엔진이 아예 받지 않는다).
   ========================================================================= */

const IDLE_MS = 6000;     // 무조작 대기 후 레그 01 을 미리 받는다(첫 4초 예산 밖)
const SLOW = 1.8;         // vh/s — 이보다 느리면 지금 원하는 레그를 바로 붙인다
const DWELL = 220;        // ms — 빠르게 움직일 때 "원하는 상태"가 이만큼 이어져야 붙인다
const STILL = 140;        // ms — 스크롤 이벤트가 이만큼 없으면 속도 0

export function createFilmLoader({ root, reduce, cum, trackVh }) {
  const segs = Array.from(root.querySelectorAll('[data-sc-segment]')).map((s, i) => {
    const v = s.querySelector('video');
    const p = s.querySelector('.sc-world__poster') || s.querySelector('img');
    return {
      i, v, p,
      src: v && v.getAttribute('data-sb-src'),
      srcM: v && v.getAttribute('data-sb-src-mobile'),
      poster: p && (p.getAttribute('data-sb-poster') || null),
      armed: !!(v && v.getAttribute('data-sc-src')),
      posterOn: !!(p && p.getAttribute('src')),
      since: 0,
    };
  });
  const net = navigator.connection || {};
  const slowNet = !!net.saveData || /(^|-)(2g|3g)$/.test(net.effectiveType || '');
  const log = [];          // [{leg, at(ms), t(vh), why}] — 측정·테스트용
  const t0 = performance.now();

  let intent = false, intentWhy = null, engaged = false;   // engaged = 사람이 실제로 손을 댔다
  let lastT = trackVh(), lastAt = performance.now(), lastMove = 0, v = 0, dir = 1;
  let raf = 0;

  function engineRead() {
    const I = window.ScrollCraft && window.ScrollCraft.instances && window.ScrollCraft.instances[0];
    if (I && I.read) I.read();
  }

  function armPoster(i) {
    const S = segs[i];
    if (!S || S.posterOn || !S.poster || !S.p) return;
    S.posterOn = true;
    S.p.src = S.poster;
  }
  function arm(i, why) {
    const S = segs[i];
    if (!S || S.armed || !S.v || !S.src) return;
    S.armed = true;
    armPoster(i);
    // 한 번만 붙인다. 이후 이 속성은 페이지 수명 동안 그대로다.
    S.v.setAttribute('data-sc-src', slowNet && S.srcM ? S.srcM : S.src);
    if (S.srcM) S.v.setAttribute('data-sc-src-mobile', S.srcM);
    log.push({ leg: i, at: Math.round(performance.now() - t0), t: +trackVh().toFixed(3), why });
    engineRead();
  }

  const legAt = t => { let k = 0; for (let i = 0; i < cum.length; i++) if (t >= cum[i][0]) k = i; return k; };

  function wanted(t) {
    const k = legAt(t);
    // 유휴 예열(손 대기 전)은 지금 레그 하나만 — 다음 레그는 손이 움직여야 받는다.
    if (!engaged) return [k];
    const w = Math.max(cum[k][1] - cum[k][0], 1e-6);
    const local = (t - cum[k][0]) / w;
    const out = [k];
    if (dir >= 0) { out.push(k + 1); if (local > 0.45) out.push(k + 2); }
    else { out.push(k - 1); if (local < 0.55) out.push(k - 2); }
    return out.filter(i => i >= 0 && i < segs.length);
  }

  function step() {
    raf = 0;
    const now = performance.now();
    if (now - lastMove > STILL) v = 0;
    const t = trackVh();
    const want = wanted(t);
    const k = want[0];
    // 포스터 창 k−1 … k+3 — 작고(≈50 KB) 도착 전에 서 있어야 하므로 지연 없이.
    for (let i = k - 1; i <= k + 3; i++) armPoster(i);
    let pending = false;
    for (const S of segs) {
      if (S.armed) continue;
      if (!want.includes(S.i)) { S.since = 0; continue; }
      if (Math.abs(v) < SLOW) { arm(S.i, 'slow'); continue; }
      if (!S.since) S.since = now;
      if (now - S.since >= DWELL) arm(S.i, 'dwell');
      else pending = true;
    }
    // 속도가 떨어지면 다시 봐야 하므로 원하는 것이 남아 있는 동안만 스스로 돈다.
    if (pending || v !== 0) raf = requestAnimationFrame(step);
  }
  const kick = () => { if (intent && !raf) raf = requestAnimationFrame(step); };

  function onScroll() {
    const now = performance.now();
    const t = trackVh();
    const dt = Math.max(now - lastAt, 1) / 1000;
    const inst = (t - lastT) / dt;
    if (t !== lastT) {
      v = v * 0.4 + inst * 0.6;
      if (Math.abs(t - lastT) > 1e-4) dir = t > lastT ? 1 : -1;
      lastMove = now;
    }
    lastT = t; lastAt = now;
    if (!intent && scrollY > 0) begin('scroll');
    kick();
  }

  let trickled = false;
  function trickle() {
    // 의도가 확인된 뒤 남은 포스터를 유휴 시간에 한 장씩 — 멀리 점프해 도착한 레그도
    // 클립이 오기 전까지 포스터가 선다(검정이 아니라).
    if (trickled) return; trickled = true;
    const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 200));
    const go = () => idle(d => {
      const S = segs.find(x => !x.posterOn && x.poster);
      if (!S) return;
      armPoster(S.i);
      if (d.timeRemaining() > 4) { const T = segs.find(x => !x.posterOn && x.poster); if (T) armPoster(T.i); }
      setTimeout(go, 120);
    });
    setTimeout(go, 2500);
  }

  function begin(why) {
    if (why !== 'idle') { if (!engaged) { engaged = true; if (intent) kick(); } }
    if (intent) return;
    intent = true; intentWhy = why;
    trickle();
    kick();
  }

  if (reduce) {
    // 저감 모드: 클립은 엔진이 받지 않는다. 포스터가 필름이므로 전부 건다.
    segs.forEach(S => armPoster(S.i));
  } else {
    addEventListener('scroll', onScroll, { passive: true });
    const once = ev => () => begin(ev);
    for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(ev, once(ev), { passive: true, once: true });
    // 마우스를 움직인 데스크톱 독자는 곧 휠을 굴린다 — 지금 레그(01) 하나만 먼저 받는다(engaged 아님).
    // 첫 휠에서 포스터 → 클립으로 넘어가는 순간을 없애려는 것이다. 터치 기기에는 hover 가 없다.
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      addEventListener('pointermove', () => begin('idle'), { passive: true, once: true });
    }
    if (scrollY > 0) begin('restored');      // 새로고침으로 중간에 돌아온 독자
    setTimeout(() => begin('idle'), IDLE_MS);
  }

  return {
    onScroll,
    state: () => ({
      intent, intentWhy, engaged, slowNet, v: +v.toFixed(3), dir,
      armed: segs.filter(S => S.armed).map(S => S.i),
      posters: segs.filter(S => S.posterOn).map(S => S.i),
      log: log.slice(),
    }),
  };
}
