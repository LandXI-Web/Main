// 탐지 이벤트 문법 — 스캔 스윕 → 순차 리빌 → 코너 브래킷 → DETECTED 칩 → 카운트업.
// all4land 벤치마크의 핵심 발견: 강조색(노랑)은 "발견"의 순간에만 쓴다.
// 이 페이지 전체에서 --det-4(#FFB633)가 등장하는 곳은 여기 하나뿐이다.
// 셰이더 없음 — 지도 위 2D 오버레이 캔버스 하나로 전부 처리한다.

const AMBER = '#FFB633';
const CYAN = '#4FC3FF';
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInOutExpo = (t) => (t < 0.5
  ? Math.pow(2, 20 * t - 10) / 2
  : (2 - Math.pow(2, -20 * t + 10)) / 2);

export function makeDetect(map, canvas, hudCount) {
  const ctx = canvas.getContext('2d');
  let run = null, raf = 0, pinned = null, praf = 0;

  function size() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    const w = map.getCanvas().clientWidth, h = map.getCanvas().clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  function bracket(x, y, s, a, w = 1) {
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = w;
    const L = s * 0.42;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + dx * s, cy = y + dy * s;
      ctx.beginPath();
      ctx.moveTo(cx - dx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - dy * L);
      ctx.stroke();
    }
  }

  function chip(x, y, text, a, pop) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(pop, pop);
    ctx.font = '400 11px Inter, ui-sans-serif, sans-serif';
    const w = ctx.measureText(text).width + 18;
    ctx.globalAlpha = a;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, -11, w, 22, 2); else ctx.rect(0, -11, w, 22);
    ctx.fill();
    ctx.fillStyle = '#1A1204';
    ctx.fillText(text, 9, 4);
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    if (!run) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const [W, H] = size();
    ctx.clearRect(0, 0, W, H);
    const t = (now - run.t0) / 1000;

    // 1) 스캔 스윕 0 → 0.6s : 시안 수직선이 화면을 훑는다.
    if (t < 0.75) {
      const k = Math.min(1, t / 0.6);
      const x = easeInOutExpo(Math.min(1, k)) * W;
      const a = 1 - Math.max(0, (t - 0.6) / 0.15);
      const g = ctx.createLinearGradient(x - 150, 0, x, 0);
      g.addColorStop(0, 'rgba(79,195,255,0)');
      g.addColorStop(1, `rgba(79,195,255,${(0.30 * a).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(x - 150, 0, 150, H);
      ctx.strokeStyle = `rgba(180,232,255,${(0.9 * a).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // 2) 순차 리빌 0.45 → 2.25s : 신뢰도 높은 것부터 지도 레이어에 켠다.
    const rv = Math.max(0, Math.min(1, (t - 0.45) / 1.8));
    const want = Math.round(easeOutQuart(rv) * run.total);
    while (run.cursor < want) {
      map.setFeatureState({ source: run.src, id: run.cursor }, { shown: 1 });
      if (run.src2) map.setFeatureState({ source: run.src2, id: run.cursor }, { shown: 1 });
      run.cursor++;
    }
    if (hudCount) hudCount(Math.round(easeOutQuart(Math.min(1, (t - 0.45) / 1.5)) * run.total), run.total);

    // 3) 락온 3비트(FUI D9): 브래킷 수렴 180ms → 확정 80ms(1px→2px) → 라벨 120ms.
    const bt = Math.max(0, Math.min(1, (t - 0.55) / 0.5));
    if (bt > 0 && t < 4.2) {
      const fade = t > 3.4 ? 1 - (t - 3.4) / 0.8 : 1;
      run.top.forEach((f, i) => {
        const t0 = 0.55 + i * 0.04;
        const b1 = Math.max(0, Math.min(1, (t - t0) / 0.18));         // 수렴
        if (b1 <= 0) return;
        const b2 = Math.max(0, Math.min(1, (t - t0 - 0.18) / 0.08));  // 확정
        const pt = map.project(f.c);
        if (pt.x < -60 || pt.x > W + 60 || pt.y < -60 || pt.y > H + 60) return;
        bracket(pt.x, pt.y, 15 + (1 - b1) * 20, 0.92 * b1 * fade, 1 + b2);
      });
    }

    // 4) DETECTED 칩 — 이 페이지에서 노랑이 쓰이는 유일한 순간.
    if (t > 0.81 && t < 4.2 && run.top.length) {
      const f = run.top[0];
      const pt = map.project(f.c);
      const d = Math.min(1, (t - 0.81) / 0.12);
      const pop = d < 1 ? 0.86 + 0.2 * d : 1 + 0.04 * Math.max(0, 1 - (t - 1.05) / 0.15);
      const fade = t > 3.4 ? 1 - (t - 3.4) / 0.8 : 1;
      const lx = pt.x + 38, ly = pt.y - 40;
      ctx.strokeStyle = `rgba(255,255,255,${(0.75 * fade).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 15, 0, 6.2832); ctx.stroke();
      chip(lx, ly, `DETECTED  ${f.conf.toFixed(2)}`, fade, pop);
    }

    if (t > 4.4) {
      // 남은 것 전부 노출하고 종료
      while (run.cursor < run.total) {
        map.setFeatureState({ source: run.src, id: run.cursor }, { shown: 1 });
        if (run.src2) map.setFeatureState({ source: run.src2, id: run.cursor }, { shown: 1 });
        run.cursor++;
      }
      if (hudCount) hudCount(run.total, run.total);
      // 시퀀스가 끝나면 최상위 신뢰도 탐지에 브래킷을 남긴다 — 정적 화면을 만들지 않는다.
      if (run.top.length) pinned = { c: run.top[0].c, label: `conf ${run.top[0].conf.toFixed(2)}` };
      run = null;
      ctx.clearRect(0, 0, W, H);
      if (pinned && !praf) praf = requestAnimationFrame(pframe);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /* 유휴 앰비언트 — 최신 탐지 하나에 브래킷을 고정하고 6초 주기로 호흡시킨다.
     화면당 움직이는 요소는 이것 하나다(판정 규칙 10). 시퀀스가 도는 동안에는 그리지 않는다. */
  function pframe(now) {
    praf = 0;
    if (!pinned || run) return;
    const [W, H] = size();
    ctx.clearRect(0, 0, W, H);
    const k = 0.5 - 0.5 * Math.cos(now / 6000 * 6.2832);
    const pt = map.project(pinned.c);
    if (pt.x > -60 && pt.x < W + 60 && pt.y > -60 && pt.y < H + 60) {
      bracket(pt.x, pt.y, 26 + k * 3, 0.34 + 0.34 * k);
      if (pinned.label) {
        ctx.font = '400 10px Inter, ui-sans-serif, sans-serif';
        ctx.fillStyle = `rgba(255,255,255,${(0.45 + 0.3 * k).toFixed(2)})`;
        ctx.fillText(pinned.label, pt.x + 34, pt.y - 30);
        ctx.strokeStyle = `rgba(255,255,255,${(0.28 + 0.2 * k).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pt.x + 20, pt.y - 20); ctx.lineTo(pt.x + 30, pt.y - 33); ctx.stroke();
      }
    }
    praf = requestAnimationFrame(pframe);
  }

  return {
    pin(lnglat, label) {
      if (pinned && pinned.c[0] === lnglat[0] && pinned.c[1] === lnglat[1] && pinned.label === label) return;
      pinned = { c: lnglat, label };
      if (!praf && !run) praf = requestAnimationFrame(pframe);
    },
    unpin() {
      if (!pinned) return;
      pinned = null;
      if (praf) cancelAnimationFrame(praf);
      praf = 0;
      if (!run) { size(); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    },
    // fc 는 bake() 로 id(=신뢰도 순위)가 박힌 FeatureCollection.
    play(fc, src, src2) {
      this.stop();
      const feats = fc.features || [];
      const total = feats.length;
      if (!total) return;
      for (let i = 0; i < total; i++) {
        map.setFeatureState({ source: src, id: i }, { shown: 0 });
        if (src2) map.setFeatureState({ source: src2, id: i }, { shown: 0 });
      }
      const first = (g) => { let c = g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return c; };
      const top = feats.slice(0, 8).map((f) => ({ c: first(f.geometry), conf: f.properties._conf || 1 }));
      if (praf) { cancelAnimationFrame(praf); praf = 0; }
      run = { t0: performance.now(), total, cursor: 0, src, src2, top };
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0; run = null;
      if (pinned && !praf) praf = requestAnimationFrame(pframe);
      size();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    get busy() { return !!run; },
  };
}
