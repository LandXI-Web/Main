// 노드 캔버스 — 다이어그램이 아니라 실행 가능한 그래프.
// Roboflow Workflows 에서 가져온 것은 모양이 아니라 규칙이다:
//   P6 포트에서 시작하는 편집(드래그 연결 + 호환 블록만 추천)
//   P7 자동 정렬은 사람이 손대면 물러난다
//   P8 블록마다 자기 계산 상태를 자백한다(대기/계산중%/캐시됨)

const SNAP = 8;
const COLW = 268, ROWH = 258;

/* ── 블록 카탈로그 ────────────────────────────────────────────────────────
   type 은 포트 호환성의 유일한 근거다. 호환되지 않는 연결은 UI 가 아예 막는다. */
export const BLOCKS = {
  input:  { name: '영상 입력', kind: 'INPUT', tone: '--lx',
            desc: '정사영상 타일 피라미드 선택', ins: [], outs: [['image', 'image']] },
  slice:  { name: '타일 분할 · SAHI', kind: 'SLICE', tone: '--ai',
            desc: '슬라이스 크기·중첩으로 소객체 탐지율을 올린다', ins: [['image', 'image']], outs: [['tiles', 'tiles']] },
  model:  { name: '모델', kind: 'MODEL', tone: '--det-3',
            desc: '학습된 가중치(.pt) 선택', ins: [], outs: [['model', 'model']] },
  detect: { name: '탐지', kind: 'DETECT', tone: '--s-found',
            desc: '타일 × 모델 → 검출', ins: [['tiles', 'tiles'], ['model', 'model']], outs: [['det', 'det']] },
  post:   { name: '후처리', kind: 'POST', tone: '--det-4',
            desc: '신뢰도 임계 · NMS · 최소 면적', ins: [['det', 'det']], outs: [['det', 'det']] },
  mapout: { name: '지도 출력', kind: 'OUTPUT', tone: '--s-done',
            desc: '결과 지도 레이어로 승격', ins: [['det', 'det']], outs: [] },
  viz:    { name: '폴리곤 시각화', kind: 'VIZ', tone: '--det-9',
            desc: '클래스색 외곽 2px · 채움 22%', ins: [['det', 'det']], outs: [['image', 'image']] },
  area:   { name: '면적 집계', kind: 'TABLE', tone: '--det-8',
            desc: 'area_m2 합·평균·중앙값', ins: [['det', 'det']], outs: [['table', 'table']] },
  gridag: { name: '격자 집계', kind: 'GRID', tone: '--det-6',
            desc: '500m 격자 셀별 count · mean_conf', ins: [['det', 'det']], outs: [['grid', 'grid']] },
  obb:    { name: 'OBB 회전박스', kind: 'OBB', tone: '--det-7',
            desc: '축 정렬이 아닌 회전 폴리곤 4점', ins: [['det', 'det']], outs: [['det', 'det']] },
  parcel: { name: '필지 교차', kind: 'JOIN', tone: '--det-5',
            desc: 'PNU 필지 경계와 공간 조인', ins: [['det', 'det']], outs: [['det', 'det']] },
  compare:{ name: '두 실행 비교', kind: 'DIFF', tone: '--det-1',
            desc: '초록=A만 · 빨강=B만 · 흰=양쪽', ins: [['a', 'det'], ['b', 'det']], outs: [['image', 'image']] },
  export: { name: 'GeoJSON 내보내기', kind: 'SINK', tone: '--s-hold', sink: true,
            desc: '국토조사 DB 반영 스위치가 켜져야 실행된다', ins: [['det', 'det']], outs: [] },
};

const uid = (() => { let n = 0; return (p) => `${p}${++n}`; })();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGraph(root, hooks) {
  const world = root.querySelector('#world');
  const nodesEl = root.querySelector('#nodes');
  const lines = root.querySelector('#edge-lines');
  const flows = root.querySelector('#edge-flow');
  const wire = root.querySelector('#wire');
  const gridBg = root.querySelector('#grid-bg');
  const hud = { zoom: root.querySelector('#hud-zoom'), count: root.querySelector('#hud-count'),
                manual: root.querySelector('#hud-manual') };
  const mini = root.querySelector('#mini-c'), miniView = root.querySelector('#mini-view');
  const lib = root.querySelector('#lib');

  const G = { nodes: [], edges: [] };
  const view = { x: 40, y: 24, k: 1 };
  let selected = null, autoLayout = true, manualPause = false;
  const history = [];

  /* ── 상태 스냅샷 (Ctrl+Z) ─────────────────────────────────────────── */
  const snap = () => JSON.stringify({
    n: G.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, params: { ...n.params } })),
    e: G.edges.map((e) => ({ id: e.id, f: e.f, fp: e.fp, t: e.t, tp: e.tp })),
  });
  function push() { history.push(snap()); if (history.length > 40) history.shift(); }
  function undo() {
    if (history.length < 2) return false;
    history.pop();
    const s = JSON.parse(history[history.length - 1]);
    const keep = new Map(G.nodes.map((n) => [n.id, n]));
    G.nodes = s.n.map((d) => {
      const old = keep.get(d.id);
      return old ? Object.assign(old, { x: d.x, y: d.y, params: d.params })
                 : mkNode(d.type, d.x, d.y, d.params, d.id);
    });
    G.edges = s.e.map((d) => ({ id: d.id, f: d.f, fp: d.fp, t: d.t, tp: d.tp }));
    render(); hooks.onChange?.('undo');
    return true;
  }

  /* ── 노드 ─────────────────────────────────────────────────────────── */
  function mkNode(type, x, y, params = {}, id) {
    const spec = BLOCKS[type];
    return { id: id || uid('n'), type, x, y, state: 'idle', prog: 0, t: 0,
             params: { ...(hooks.defaults?.(type) || {}), ...params },
             out: null, log: [], spec };
  }
  function addNode(type, x, y, params) {
    const n = mkNode(type, x, y, params);
    G.nodes.push(n); push(); render();
    return n;
  }
  function removeNode(id) {
    const i = G.nodes.findIndex((n) => n.id === id); if (i < 0) return;
    G.nodes.splice(i, 1);
    G.edges = G.edges.filter((e) => e.f !== id && e.t !== id);
    if (selected === id) select(null);
    push(); render(); hooks.onChange?.('remove');
  }
  function connect(f, fp, t, tp) {
    if (f === t) return false;
    const ft = portType(f, fp, 'out'), tt = portType(t, tp, 'in');
    if (!ft || !tt || ft !== tt) return false;
    if (G.edges.some((e) => e.t === t && e.tp === tp)) return false;   // 입력 포트는 1개만
    if (reaches(t, f)) return false;                                    // 순환 금지
    G.edges.push({ id: uid('e'), f, fp, t, tp });
    dirty(t); push(); render(); hooks.onChange?.('connect');
    return true;
  }
  const nodeById = (id) => G.nodes.find((n) => n.id === id);
  function portType(id, port, dir) {
    const n = nodeById(id); if (!n) return null;
    const list = dir === 'out' ? n.spec.outs : n.spec.ins;
    return (list.find((p) => p[0] === port) || [])[1] || null;
  }
  function reaches(from, target, seen = new Set()) {
    if (from === target) return true;
    if (seen.has(from)) return false; seen.add(from);
    return G.edges.filter((e) => e.f === from).some((e) => reaches(e.t, target, seen));
  }
  function downstream(id, acc = new Set()) {
    for (const e of G.edges.filter((x) => x.f === id)) if (!acc.has(e.t)) { acc.add(e.t); downstream(e.t, acc); }
    return acc;
  }
  function dirty(id) {
    const n = nodeById(id); if (n) { n.state = 'idle'; n.out = null; }
    for (const d of downstream(id)) { const m = nodeById(d); if (m) { m.state = 'idle'; m.out = null; } }
    render();
  }

  /* ── 위상 정렬 · 자동 배치 ────────────────────────────────────────── */
  function order() {
    const deg = new Map(G.nodes.map((n) => [n.id, 0]));
    for (const e of G.edges) deg.set(e.t, (deg.get(e.t) || 0) + 1);
    const q = G.nodes.filter((n) => !deg.get(n.id)).map((n) => n.id);
    const out = [];
    while (q.length) {
      const id = q.shift(); out.push(id);
      for (const e of G.edges.filter((x) => x.f === id)) {
        deg.set(e.t, deg.get(e.t) - 1);
        if (deg.get(e.t) === 0) q.push(e.t);
      }
    }
    for (const n of G.nodes) if (!out.includes(n.id)) out.push(n.id);
    return out.map(nodeById).filter(Boolean);
  }
  function depths() {
    const d = new Map();
    for (const n of order()) {
      const ins = G.edges.filter((e) => e.t === n.id);
      d.set(n.id, ins.length ? Math.max(...ins.map((e) => (d.get(e.f) ?? 0) + 1)) : 0);
    }
    return d;
  }
  function layout(animate = true) {
    if (!autoLayout || manualPause) return;
    const d = depths(), cols = new Map();
    for (const n of order()) { const k = d.get(n.id) || 0; (cols.get(k) || cols.set(k, []).get(k)).push(n); }
    for (const [k, list] of cols) {
      const h = (list.length - 1) * ROWH;
      list.forEach((n, i) => {
        const nx = 40 + k * COLW, ny = 300 - h / 2 + i * ROWH;
        if (animate && window.gsap) window.gsap.to(n, { x: nx, y: ny, duration: 0.52, ease: 'power3.out', onUpdate: place });
        else { n.x = nx; n.y = ny; }
      });
    }
    place();
  }

  /* ── 렌더 ─────────────────────────────────────────────────────────── */
  function render() {
    // 노드 DOM 을 id 기준으로 재사용한다 — 매번 innerHTML 을 갈아엎으면 입력 포커스가 죽는다.
    const have = new Map([...nodesEl.children].map((el) => [el.dataset.id, el]));
    for (const n of G.nodes) {
      let el = have.get(n.id);
      if (!el) { el = document.createElement('article'); el.className = 'node'; el.dataset.id = n.id;
                 el.tabIndex = 0; nodesEl.append(el); }
      have.delete(n.id);
      paint(el, n);
    }
    for (const [, el] of have) el.remove();
    place(); drawEdges(); drawMini();
    hud.count.textContent = `노드 ${G.nodes.length} · 엣지 ${G.edges.length}`;
  }

  const ST = { idle: ['대기', ''], run: ['계산중', 'run'], done: ['완료', 'done'],
               cache: ['캐시됨', 'cache'], err: ['실패', 'err'] };

  function paint(el, n) {
    const [txt, s] = ST[n.state] || ST.idle;
    const idx = G.nodes.indexOf(n) + 1;
    if (!el.dataset.built) {
      el.innerHTML = `
        <div class="nh"><span class="ix mono">${String(idx).padStart(2, '0')}</span>
          <span class="nm"></span><span class="st mono"></span></div>
        <div class="nb">
          <button class="thumb" type="button" aria-label="블록 결과 확대"><canvas width="336" height="224"></canvas>
            <span class="empty"></span><span class="cap"></span></button>
          <div class="prog"><i></i></div>
          <div class="body"></div>
        </div>`;
      el.dataset.built = '1';
      el.querySelector('.thumb').addEventListener('click', (ev) => { ev.stopPropagation(); select(n.id, true); });
      // 포트
      const mk = (dir, port, type, i, len) => {
        const p = document.createElement('i');
        p.className = `port ${dir}`; p.dataset.node = n.id; p.dataset.port = port;
        p.dataset.type = type; p.dataset.dir = dir;
        p.title = `${port} · ${type}`;
        if (len > 1) { p.style.top = `${28 + (i + 1) * (100 / (len + 1))}%`; }
        el.append(p);
      };
      bindNode(el, n);
      n.spec.ins.forEach((p, i) => mk('in', p[0], p[1], i, n.spec.ins.length));
      n.spec.outs.forEach((p, i) => mk('out', p[0], p[1], i, n.spec.outs.length));
      if (n.spec.outs.length) {
        const plus = document.createElement('button');
        plus.className = 'padd'; plus.type = 'button'; plus.textContent = '+';
        plus.title = '호환되는 블록 추가';
        plus.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openLib(ev.clientX, ev.clientY, { type: n.spec.outs[0][1], from: n.id, port: n.spec.outs[0][0] });
        });
        el.append(plus);
      }
    }
    el.querySelector('.ix').textContent = String(idx).padStart(2, '0');
    el.querySelector('.nm').textContent = n.spec.name;
    const st = el.querySelector('.st');
    st.textContent = n.state === 'run' ? `${txt} ${Math.round(n.prog * 100)}%` : txt;
    st.dataset.s = s;
    el.querySelector('.prog').style.display = n.state === 'run' ? '' : 'none';
    el.querySelector('.prog i').style.width = `${n.prog * 100}%`;
    el.setAttribute('aria-label', `${n.spec.name} 블록, 상태 ${txt}`);
    el.classList.toggle('is-sel', selected === n.id);
    hooks.paintBody?.(el.querySelector('.body'), n, el.querySelector('canvas'), el);
  }

  function place() {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    for (const el of nodesEl.children) {
      const n = nodeById(el.dataset.id); if (!n) continue;
      el.style.transform = `translate(${n.x}px,${n.y}px)`;
    }
    const g1 = 16 * view.k, g2 = 96 * view.k;
    gridBg.style.backgroundSize = `${g1}px ${g1}px,${g1}px ${g1}px,${g2}px ${g2}px,${g2}px ${g2}px`;
    gridBg.style.backgroundPosition = `${view.x}px ${view.y}px,${view.x}px ${view.y}px,${view.x}px ${view.y}px,${view.x}px ${view.y}px`;
    hud.zoom.textContent = `${Math.round(view.k * 100)}%`;
    drawEdges(); drawMini();
  }

  const NW = 212, NH = 232;
  function portXY(id, port, dir) {
    const n = nodeById(id); if (!n) return [0, 0];
    const list = dir === 'out' ? n.spec.outs : n.spec.ins;
    const i = list.findIndex((p) => p[0] === port);
    const el = nodesEl.querySelector(`[data-id="${id}"]`);
    const h = el ? el.offsetHeight : NH;
    const y = list.length > 1 ? h * 0.28 + ((i + 1) * h * 0.72) / (list.length + 1) : h / 2;
    return [n.x + (dir === 'out' ? NW : 0), n.y + y];
  }
  function bezier(x1, y1, x2, y2) {
    const dx = clamp(Math.abs(x2 - x1) * 0.55, 34, 130);
    return `M${x1} ${y1}C${x1 + dx} ${y1},${x2 - dx} ${y2},${x2} ${y2}`;
  }

  const flowPaths = [];
  function drawEdges() {
    lines.innerHTML = ''; flows.innerHTML = ''; flowPaths.length = 0;
    for (const e of G.edges) {
      const [x1, y1] = portXY(e.f, e.fp, 'out'), [x2, y2] = portXY(e.t, e.tp, 'in');
      const d = bezier(x1, y1, x2, y2);
      const hit = mk('path', { class: 'e hit', d });
      hit.addEventListener('click', () => { selEdge(e.id); });
      const p = mk('path', { class: 'e' + (selEdgeId === e.id ? ' sel' : ''), d });
      lines.append(p, hit, mk('circle', { class: 'cap', cx: x2, cy: y2, r: 2.6 }));
      const fl = mk('path', { class: 'flow', d });
      flows.append(fl);
      const len = fl.getTotalLength ? fl.getTotalLength() : 200;
      fl.style.strokeDasharray = `${Math.min(46, len * 0.22)} ${len}`;
      // 경로마다 위상·속도를 흩뜨린다. 완벽히 동기화된 모션은 "기계가 만든 티"다.
      flowPaths.push({ el: fl, len, phase: Math.random(), speed: 0.7 + Math.random() * 0.6 });
    }
  }
  function mk(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  let selEdgeId = null;
  function selEdge(id) { selEdgeId = id; select(null); drawEdges(); }

  /* 엣지 위 흐름 — 메시는 움직이지 않고 대시 오프셋만 이동한다(iGPU 예산). */
  let flowOn = false, raf = 0;
  function setFlow(on) {
    flowOn = on;
    for (const f of flowPaths) f.el.classList.toggle('on', on);
    if (on && !raf) tick(performance.now());
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function tick(t) {
    for (const f of flowPaths) {
      f.el.style.strokeDashoffset = String(-((t * 0.00013 * f.speed + f.phase) % 1) * f.len);
    }
    raf = flowOn ? requestAnimationFrame(tick) : 0;
  }

  /* ── 미니맵 ───────────────────────────────────────────────────────── */
  function drawMini() {
    const ctx = mini.getContext('2d');
    const W = mini.width, H = mini.height;
    ctx.clearRect(0, 0, W, H);
    if (!G.nodes.length) return;
    const xs = G.nodes.map((n) => n.x), ys = G.nodes.map((n) => n.y);
    const bx = [Math.min(...xs) - 40, Math.min(...ys) - 40,
                Math.max(...xs) + NW + 40, Math.max(...ys) + NH + 40];
    const k = Math.min(W / (bx[2] - bx[0]), H / (bx[3] - bx[1]));
    const px = (x) => (x - bx[0]) * k, py = (y) => (y - bx[1]) * k;
    ctx.strokeStyle = 'rgba(95,107,124,.5)'; ctx.lineWidth = 1;
    for (const e of G.edges) {
      const [x1, y1] = portXY(e.f, e.fp, 'out'), [x2, y2] = portXY(e.t, e.tp, 'in');
      ctx.beginPath(); ctx.moveTo(px(x1), py(y1)); ctx.lineTo(px(x2), py(y2)); ctx.stroke();
    }
    for (const n of G.nodes) {
      const c = getComputedStyle(document.documentElement).getPropertyValue(n.spec.tone).trim() || '#006DF7';
      const el = nodesEl.querySelector(`[data-id="${n.id}"]`);
      ctx.fillStyle = n.state === 'idle' ? 'rgba(143,153,168,.5)' : c;
      ctx.fillRect(px(n.x), py(n.y), NW * k, (el ? el.offsetHeight : NH) * k);
    }
    const r = root.getBoundingClientRect();
    const vx = px((-view.x) / view.k), vy = py((-view.y) / view.k);
    const vw = (r.width / view.k) * k, vh = (r.height / view.k) * k;
    Object.assign(miniView.style, {
      left: `${clamp(vx, 0, W)}px`, top: `${clamp(vy, 0, H)}px`,
      width: `${clamp(vw, 4, W)}px`, height: `${clamp(vh, 4, H)}px`,
    });
    mini._m = { bx, k };
  }

  /* ── 상호작용 ─────────────────────────────────────────────────────── */
  function select(id, open) {
    selected = id; selEdgeId = null;
    for (const el of nodesEl.children) el.classList.toggle('is-sel', el.dataset.id === id);
    hooks.onSelect?.(id ? nodeById(id) : null, open);
  }

  function bindNode(el, n) {
    el.querySelector('.nh').addEventListener('pointerdown', (ev) => startDrag(ev, n, el));
    el.addEventListener('pointerdown', () => select(n.id));
    el.addEventListener('dblclick', () => select(n.id, true));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id, true); }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeNode(n.id); }
    });
    el.addEventListener('focus', () => select(n.id));
  }

  function startDrag(ev, n, el) {
    if (ev.target.closest('button,select,input')) return;
    ev.preventDefault(); ev.stopPropagation();
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-drag');
    const sx = ev.clientX, sy = ev.clientY, ox = n.x, oy = n.y;
    let moved = false;
    const move = (e) => {
      const dx = (e.clientX - sx) / view.k, dy = (e.clientY - sy) / view.k;
      if (!moved && Math.hypot(dx, dy) > 3) {
        moved = true;
        if (autoLayout && !manualPause) {                 // P7 — 손이 닿으면 자동정렬이 물러난다
          manualPause = true; hud.manual.hidden = false; hooks.onToast?.('수동 배치 — 자동정렬 일시정지');
        }
      }
      n.x = Math.round((ox + dx) / SNAP) * SNAP;
      n.y = Math.round((oy + dy) / SNAP) * SNAP;
      place();
    };
    const up = () => {
      el.classList.remove('is-drag');
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
      if (moved) push();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  }

  // 포트 드래그 — 호환되는 포트만 켜지고, 나머지는 흐려진다. 사용자는 틀릴 수 없다.
  root.addEventListener('pointerdown', (ev) => {
    const port = ev.target.closest('.port');
    if (!port) return;
    ev.preventDefault(); ev.stopPropagation();
    const dir = port.dataset.dir, type = port.dataset.type;
    const from = { node: port.dataset.node, port: port.dataset.port, dir, type };
    for (const p of root.querySelectorAll('.port')) {
      if (p === port) continue;
      const ok = p.dataset.dir !== dir && p.dataset.type === type && p.dataset.node !== from.node;
      p.classList.add(ok ? 'ok' : 'bad');
    }
    const [ax, ay] = portXY(from.node, from.port, dir);
    wire.classList.add('on');
    const move = (e) => {
      const r = root.getBoundingClientRect();
      const bx = (e.clientX - r.left - view.x) / view.k, by = (e.clientY - r.top - view.y) / view.k;
      wire.setAttribute('d', dir === 'out' ? bezier(ax, ay, bx, by) : bezier(bx, by, ax, ay));
    };
    const up = (e) => {
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up);
      wire.classList.remove('on'); wire.setAttribute('d', '');
      for (const p of root.querySelectorAll('.port')) p.classList.remove('ok', 'bad');
      const drop = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port');
      if (drop && drop !== port) {
        const ok = dir === 'out'
          ? connect(from.node, from.port, drop.dataset.node, drop.dataset.port)
          : connect(drop.dataset.node, drop.dataset.port, from.node, from.port);
        if (!ok) hooks.onToast?.('연결 불가 — 포트 타입이 다르거나 이미 연결되어 있다');
      } else if (dir === 'out') {
        openLib(e.clientX, e.clientY, { type, from: from.node, port: from.port });
      }
    };
    root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
  });

  // 캔버스 패닝 · 줌
  root.addEventListener('pointerdown', (ev) => {
    if (ev.target !== root && !ev.target.closest('#grid-bg,#world') ) return;
    if (ev.target.closest('.node,.port,.pop,#runbar,#insp,#minimap')) return;
    ev.preventDefault();
    select(null); selEdgeId = null; drawEdges(); closeLib();
    root.classList.add('is-pan');
    const sx = ev.clientX, sy = ev.clientY, ox = view.x, oy = view.y;
    const move = (e) => { view.x = ox + (e.clientX - sx); view.y = oy + (e.clientY - sy); place(); };
    const up = () => { root.classList.remove('is-pan');
      root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); };
    root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
  });

  root.addEventListener('wheel', (ev) => {
    if (ev.target.closest('.pop,#insp,#runbar')) return;
    ev.preventDefault();
    const r = root.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const k = clamp(view.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.32, 2.2);
    view.x = mx - ((mx - view.x) / view.k) * k;
    view.y = my - ((my - view.y) / view.k) * k;
    view.k = k; place();
  }, { passive: false });

  root.addEventListener('contextmenu', (ev) => {
    if (ev.target.closest('#insp,#runbar')) return;
    ev.preventDefault();
    openLib(ev.clientX, ev.clientY, null);
  });

  root.querySelector('#minimap').addEventListener('click', (ev) => {
    const m = mini._m; if (!m) return;
    const r = mini.getBoundingClientRect();
    const gx = (ev.clientX - r.left) / m.k + m.bx[0], gy = (ev.clientY - r.top) / m.k + m.bx[1];
    const c = root.getBoundingClientRect();
    view.x = c.width / 2 - gx * view.k; view.y = c.height / 2 - gy * view.k;
    place();
  });

  /* ── 블록 라이브러리 ─────────────────────────────────────────────── */
  let libCtx = null;
  function openLib(cx, cy, ctxSpec) {
    libCtx = ctxSpec;
    const r = root.getBoundingClientRect();
    lib.style.left = `${clamp(cx - r.left, 8, r.width - 276)}px`;
    lib.style.top = `${clamp(cy - r.top, 8, r.height - 320)}px`;
    lib.hidden = false;
    root.querySelector('#lib-title').textContent = ctxSpec ? '호환 블록' : '블록 추가';
    root.querySelector('#lib-note').textContent = ctxSpec ? `${ctxSpec.type} 입력` : `${Object.keys(BLOCKS).length}종`;
    root.querySelector('#lib-q').value = '';
    fillLib('');
    root.querySelector('#lib-q').focus();
  }
  function closeLib() { lib.hidden = true; libCtx = null; }
  function fillLib(q) {
    const list = root.querySelector('#lib-list');
    list.innerHTML = '';
    const css = getComputedStyle(document.documentElement);
    for (const [type, spec] of Object.entries(BLOCKS)) {
      const compat = !libCtx || spec.ins.some((p) => p[1] === libCtx.type);
      if (q && !(spec.name + spec.desc).toLowerCase().includes(q)) continue;
      if (libCtx && !compat) continue;                    // P10 — 호환 인지 추천: 안 되는 건 아예 안 보인다
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lib-i';
      b.innerHTML = `<i class="lc" style="background:${css.getPropertyValue(spec.tone).trim()}"></i>
        <span><b>${spec.name}</b><span>${spec.kind} · ${spec.desc}</span></span>`;
      b.addEventListener('click', () => {
        const r = root.getBoundingClientRect();
        let x, y;
        if (libCtx) {
          const src = nodeById(libCtx.from);
          x = src.x + COLW; y = src.y + 40;
        } else {
          x = (parseFloat(lib.style.left) - view.x) / view.k;
          y = (parseFloat(lib.style.top) - view.y) / view.k;
        }
        const n = addNode(type, Math.round(x / SNAP) * SNAP, Math.round(y / SNAP) * SNAP);
        if (libCtx) {
          const inPort = spec.ins.find((p) => p[1] === libCtx.type);
          if (inPort) connect(libCtx.from, libCtx.port, n.id, inPort[0]);
        }
        closeLib(); select(n.id, true); layout();
      });
      list.append(b);
    }
    if (!list.children.length) list.innerHTML = '<p class="mono dim" style="padding:8px">호환되는 블록이 없다</p>';
  }
  root.querySelector('#lib-q').addEventListener('input', (e) => fillLib(e.target.value.toLowerCase()));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#lib') && !lib.hidden) closeLib(); }, true);

  /* ── 키보드 ───────────────────────────────────────────────────────── */
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input,select,textarea')) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      hooks.onToast?.(undo() ? '되돌리기' : '되돌릴 것이 없다');
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (selEdgeId) { G.edges = G.edges.filter((e) => e.id !== selEdgeId); selEdgeId = null;
                       push(); render(); ev.preventDefault(); return; }
      if (selected) { removeNode(selected); ev.preventDefault(); }
    }
    if (ev.key === 'Escape') { closeLib(); select(null); }
  });

  push();
  return {
    G, view, BLOCKS,
    addNode, removeNode, connect, nodeById, order, depths, downstream, dirty,
    render, place, layout, select, setFlow, drawMini, undo, push,
    openLib, closeLib,
    get selected() { return selected ? nodeById(selected) : null; },
    setAutoLayout(v) { autoLayout = v; if (v) { manualPause = false; hud.manual.hidden = true; layout(); } },
    resumeAuto() { manualPause = false; hud.manual.hidden = true; layout(); },
    fit() {
      if (!G.nodes.length) return;
      const r = root.getBoundingClientRect();
      const xs = G.nodes.map((n) => n.x), ys = G.nodes.map((n) => n.y);
      const w = Math.max(...xs) + NW + 60 - (Math.min(...xs) - 20);
      const h = Math.max(...ys) + NH + 90 - (Math.min(...ys) - 20);
      view.k = clamp(Math.min(r.width / w, r.height / h), 0.34, 1);
      view.x = (r.width - w * view.k) / 2 - (Math.min(...xs) - 20) * view.k;
      view.y = (r.height - h * view.k) / 2 - (Math.min(...ys) - 20) * view.k;
      place();
    },
  };
}
