/* kit/spa.js — LX 화면 한 페이지 방식(원칙 330 · 10-23 사용자 "업로드는 잘 모르겠다. 2 번 방식으로 간다").
   메뉴를 옮겨도 페이지를 닫지 않고 판(main) 안의 화면만 바꾼다 — 머리줄 · 왼쪽 메뉴 · 업로드 · XI ChatGEO 는 그대로 살아 있어
   업로드가 화면을 옮겨도 이 페이지 안에서 계속 올라간다(네이버 MYBOX 처럼 · 따로 열리는 업로드 창이 필요 없다).

   화면 하나 = 그 폴더의 app.js 가 mount 를 내보내고 맨 끝에서 screen(import.meta.url, mount) 를 부른다.
     · 이 페이지가 처음 열린 화면이면 → 한 페이지 틀을 세우고 그 화면을 연다(주소 · 새로 고침 · 바로가기 주소 그대로).
     · 다른 화면이 이미 틀을 세웠으면 → 등록만(라우터가 메뉴를 누를 때 mount 를 부른다).
     · 그 주소가 한 페이지로 열 수 없는 꼴이면(예: 프로젝트 한 장 ?project=) → 예전처럼 따로 된 페이지로 연다.
   mount(host, params) → (선택) 정리 함수. 화면 코드가 창(window) · 문서(document)에 건 듣기 · 타이머 · 관찰자 · 지도는
   화면이 열려 있는 동안 이 파일이 따로 적어 두었다가(호출 자리가 화면 폴더 안인 것만) 화면을 닫을 때 모두 떼어 낸다 — 화면 코드를 고치지 않고 새는 것 0.
   한 페이지로 바꾼 화면 = ROUTES. 그 밖의 화면(요청함 · 데이터 올리기 · 학습 …)은 예전처럼 페이지를 새로 연다(업로드 중이면 업로드 창에 넘기고).
   점검 손잡이(화면에 보이지 않음): window.__spa — times(메뉴 바꿈 시간) · leak()(살아 있는 듣기 · 타이머 · 지도 수) */

const at = (p) => new URL(p, import.meta.url).pathname;   // GitHub Pages /Main/ 아래에서도
/* 한 페이지로 여는 화면 — id · 폴더 · 이 주소를 한 페이지로 열 수 있나 */
export const ROUTES = [
  { id: 'home', dir: at('../lx-console/'), ok: () => true },
  { id: 'projects', dir: at('../lx-project/'), ok: (u) => !u.searchParams.has('project') },   // 프로젝트 한 장(?project=)은 단계 줄이 붙는 따로 된 페이지
  { id: 'analyze', dir: at('../lx-analyze/'), ok: () => true },
  { id: 'mapsvc', dir: at('../lx-map/'), ok: (u) => !u.searchParams.has('project') },       // 국토 변화 대상지(?project=)는 따로 된 페이지
];
const PERSIST = /\/kit\/(shell|cmdk|chat-dock|uploads|notify|session-clock|spa|me|auth-gate|loader|toast|modal|panel)\.js/;   // 화면을 바꿔도 살아 있는 부품(그 부품이 건 것은 화면 것이 아니다)
const DIRS = ROUTES.map((r) => r.dir);

/* 상태는 창(window)에 하나 — 화면 파일이 바뀌어 새 판(?v=)의 이 모듈이 따로 불려도 같은 틀을 본다. 새 판 화면은 페이지를 새로 열어 연다(hard) */
const INST = {};
const G = (window.__lxSPA ||= { SPA: { on: false, booted: false, shell: null, cur: null, times: [], inst: null }, REG: new Map(), META: new Map() });
export const SPA = G.SPA;
const REG = G.REG;              // 화면 id → { mount, inst }
const META = G.META;            // 화면 id → { css:[{href, attrs}], js:[], mods:[], title, body:{class, attrs} }
const routeOf = (u) => {
  const p = u.pathname.replace(/index\.html$/, '');
  return ROUTES.find((r) => p === r.dir || p === r.dir.replace(/\/$/, '')) || null;
};
const spaOk = (u) => { const r = routeOf(u); return r && u.origin === location.origin && r.ok(u) ? r : null; };

/* ───────── 화면 등록 ───────── */
/** 화면 app.js 맨 끝에서 — screen(import.meta.url, mount) */
export function screen(metaUrl, mount) {
  const dir = new URL('./', metaUrl).pathname;
  const r = ROUTES.find((x) => x.dir === dir);
  if (!r) { mount(null, new URLSearchParams(location.search)); return; }       // 표에 없는 화면 — 예전처럼
  REG.set(r.id, { mount, inst: INST });
  if (SPA.booted) return;                                                          // 틀이 이미 섰다 — 등록만
  SPA.booted = true; SPA.inst = INST;
  const here = new URL(location.href);
  if (routeOf(here) !== r || !r.ok(here) || !window.history?.pushState) { mount(null, here.searchParams); return; }   // 따로 된 페이지
  boot(r, here);
}
/** 지금 화면을 닫을 때 할 일(화면 코드가 직접 정리할 것 — 점검 손잡이 · 다른 부품에 준 지도 등) */
export function onLeave(fn) { if (SPA.cur?.scope && !SPA.cur.scope.dead) SPA.cur.scope.fns.push(fn); }
/** 화면 코드가 주소를 바꿀 때(있으면 한 페이지로 · 없으면 그냥 이동) */
export function go(url) { const u = new URL(url, location.href); if (SPA.on && spaOk(u)) { nav(u, 'push'); return; } location.href = u.href; }
/** 페이지를 새로 열어 가기(새 판 화면 · 한 페이지로 못 여는 것) — 라우터가 다시 가로채지 않게 */
function hard(u) { SPA.hard = true; setTimeout(() => { SPA.hard = false; }, 1500); location.href = u.href; }   // 나가기를 그만두면(나가시겠습니까 → 머물기) 다시 가로챈다

/* ───────── 화면이 건 것 적어 두기(듣기 · 타이머 · 관찰자 · 지도) ───────── */
const LIVE = { listen: new Map(), iv: new Map(), to: new Map(), obs: new Set(), maps: new Set() };   // 페이지 전체(점검용 — 화면 것 · 부품 것 모두)
function owner() {
  const sc = SPA.cur?.scope;
  if (!sc || sc.dead) return null;
  const lim = Error.stackTraceLimit; Error.stackTraceLimit = 40;
  const st = String(new Error().stack || '');
  Error.stackTraceLimit = lim;
  const lines = st.split('\n').slice(1).filter((l) => !l.includes('/kit/spa.js'));
  if (lines[0] && PERSIST.test(lines[0])) return null;                            // 살아 있는 부품이 직접 건 것
  return lines.some((l) => DIRS.some((d) => l.includes(d))) ? sc : null;          // 화면 폴더 코드가 (직접 · 부품을 거쳐) 건 것
}
const lkey = (t, type, fn, o) => `${type}|${typeof o === 'boolean' ? o : !!o?.capture}`;
function patch() {
  for (const T of [window, document]) {
    const add = T.addEventListener, rem = T.removeEventListener;
    T.addEventListener = function (type, fn, o) {
      const self = this || window;                                                     // 맨이름으로 부른 addEventListener(…) = 창
      add.call(self, type, fn, o);
      if (!fn) return;
      const k = lkey(self, type, fn, o), tk = self === window ? 'w' : 'd';
      let m = LIVE.listen.get(tk); if (!m) LIVE.listen.set(tk, (m = new Map()));
      const set = m.get(k) || new Set(); set.add(fn); m.set(k, set);
      if (typeof o === 'object' && o?.once) return;                                    // 한 번만 — 저절로 빠진다
      const sc = owner(); if (sc) sc.ls.push([self, type, fn, o]);
    };
    T.removeEventListener = function (type, fn, o) {
      const self = this || window;
      rem.call(self, type, fn, o);
      LIVE.listen.get(self === window ? 'w' : 'd')?.get(lkey(self, type, fn, o))?.delete(fn);
    };
  }
  const sI = window.setInterval, cI = window.clearInterval, sT = window.setTimeout, cT = window.clearTimeout;
  window.setInterval = function (fn, ms, ...a) { const id = sI(fn, ms, ...a); const sc = owner(); LIVE.iv.set(id, sc); if (sc) sc.iv.add(id); return id; };
  window.clearInterval = function (id) { LIVE.iv.delete(id); cI(id); };
  window.setTimeout = function (fn, ms, ...a) {
    const sc = typeof fn === 'function' && ms >= 50 ? owner() : null;          // 짧은 것(0 · 몇 ms)은 곧 끝나 적지 않는다
    if (!sc) return sT(fn, ms, ...a);
    const id = sT((...x) => { sc.to.delete(id); LIVE.to.delete(id); fn(...x); }, ms, ...a);
    sc.to.add(id); LIVE.to.set(id, sc);
    return id;
  };
  window.clearTimeout = function (id) { LIVE.to.delete(id); for (const s of [SPA.cur?.scope]) s?.to.delete(id); cT(id); };
  for (const k of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver']) {
    const O = window[k]; if (!O) continue;
    window[k] = class extends O {
      constructor(cb, o) { super(cb, o); LIVE.obs.add(this); const sc = owner(); if (sc) sc.obs.add(this); }
      disconnect() { LIVE.obs.delete(this); super.disconnect(); }
    };
  }
  /* 지도 — xi/engine/lx-map.js createMap 이 만들 때 알려 준다(지도는 닫을 때 remove 해야 그림판(WebGL)이 풀린다) */
  window.__lxMapHook = (map) => {
    LIVE.maps.add(map);
    const rm = map.remove.bind(map);
    map.remove = () => { LIVE.maps.delete(map); try { rm(); } catch { /* 이미 닫힘 */ } };
    const sc = owner(); if (sc) sc.maps.add(map);
  };
  /* 화면이 직접 부르는 주소 바꾸기(목록 거르기 ?scope= 등)는 화면 바꾸기가 아니다 — 아래 navigate 듣기가 헷갈리지 않게 표시 */
  for (const k of ['pushState', 'replaceState']) {
    const o = history[k];
    history[k] = function (...a) { HAPI++; try { return o.apply(this, a); } finally { HAPI--; } };
  }
}
let HAPI = 0;
function newScope(route) { return { route, dead: false, ls: [], iv: new Set(), to: new Set(), obs: new Set(), maps: new Set(), fns: [] }; }
function dispose(sc) {
  sc.dead = true;
  for (const fn of sc.fns.splice(0)) { try { fn(); } catch (e) { console.warn('spa leave', e); } }
  for (const [T, type, fn, o] of sc.ls.splice(0)) T.removeEventListener(type, fn, o);
  for (const id of sc.iv) window.clearInterval(id);
  for (const id of sc.to) window.clearTimeout(id);
  for (const ob of sc.obs) { try { ob.disconnect(); } catch { /* */ } }
  for (const m of sc.maps) { try { m.remove(); } catch { /* */ } }
  sc.iv.clear(); sc.to.clear(); sc.obs.clear(); sc.maps.clear();
}

/* ───────── 화면 자료(그 폴더 index.html 의 글꼴 · 모양 · 지도 엔진 · 제목 · 몸 표시) ───────── */
function readMeta(doc, base) {
  const abs = (s) => new URL(s, base).href;
  const css = [...doc.querySelectorAll('head link[rel="stylesheet"]')].map((l) => ({ href: abs(l.getAttribute('href')), attrs: [...l.attributes].filter((a) => /^data-/.test(a.name)).map((a) => [a.name, a.value]) }));
  for (const c of css) KNOWN.add(c.href);
  const js = [...doc.querySelectorAll('script[src]:not([type="module"])')].map((s) => abs(s.getAttribute('src')));
  const mods = [...doc.querySelectorAll('script[type="module"][src]')].map((s) => abs(s.getAttribute('src')));
  const b = doc.body;
  return { css, js, mods, title: doc.title, body: { cls: [...(b?.classList || [])], attrs: [...(b?.attributes || [])].filter((a) => /^data-/.test(a.name)).map((a) => [a.name, a.value]) } };
}
async function metaOf(r) {
  if (META.has(r.id)) return META.get(r.id);
  const p = fetch(r.dir, { credentials: 'same-origin' }).then((x) => x.text()).then((t) => readMeta(new DOMParser().parseFromString(t, 'text/html'), new URL(r.dir, location.href)));
  META.set(r.id, p);
  p.catch(() => META.delete(r.id));
  return p;
}
const SCRIPTS = new Map();
function script(src) {
  if (SCRIPTS.has(src)) return SCRIPTS.get(src);
  if ([...document.scripts].some((s) => s.src === src)) { SCRIPTS.set(src, Promise.resolve()); return SCRIPTS.get(src); }
  const p = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  SCRIPTS.set(src, p);
  return p;
}
/* 모양(css) — 화면 index.html 에 적힌 화면 폴더 것만 켜고 끈다(kit · 지도 엔진 모양 · 화면 코드가 스스로 붙인 것은 늘 켜 둠). 끈 것은 media="not all"(내려받아 둔 채 적용만 안 함) */
const KNOWN = new Set();
const OWN_CSS = (href) => KNOWN.has(href) && DIRS.some((d) => new URL(href).pathname.startsWith(d));
const linkOf = (href) => [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href === href);
function cssPut(list, on) {
  const want = new Set(list.map((c) => c.href));
  let prev = null;
  const loads = [];
  for (const c of list) {
    let l = linkOf(c.href);
    if (!l) {
      l = document.createElement('link'); l.rel = 'stylesheet'; l.href = c.href;
      for (const [k, v] of c.attrs) l.setAttribute(k, v);
      if (!on) l.media = 'not all';
      loads.push(new Promise((ok) => { l.onload = ok; l.onerror = ok; }));
      if (prev) prev.after(l); else { const first = document.querySelector('head link[rel="stylesheet"]'); if (first) first.before(l); else document.head.append(l); }   // index.html 순서대로
    }
    if (on && l.media === 'not all') l.media = '';
    prev = l;
  }
  if (on) for (const l of document.querySelectorAll('head link[rel="stylesheet"]')) if (!want.has(l.href) && OWN_CSS(l.href)) l.media = 'not all';
  return Promise.all(loads);
}

/* ───────── 틀 세우기 · 화면 바꾸기 ───────── */
function boot(r, u) {
  SPA.on = true;
  patch();
  META.set(r.id, Promise.resolve(readMeta(document, new URL(r.dir, location.href))));
  if (window.navigation?.addEventListener) {
    /* 주소가 바뀌는 모든 길(링크 · 화면 코드의 location.href · 뒤로 · 앞으로 · 다시 시도의 location.reload)을 한 곳에서 */
    navigation.addEventListener('navigate', (e) => {
      if (HAPI || SPA.hard || e.hashChange || e.downloadRequest || e.formData) return;
      const d = new URL(e.destination.url);
      if (d.origin !== location.origin) return;
      const r2 = spaOk(d);
      if (r2 && e.canIntercept) {
        if (e.navigationType === 'traverse' && !e.destination.sameDocument) return;   // 이 페이지 밖에서 온 기록 — 브라우저가 연다
        e.intercept({ scroll: 'manual', focusReset: 'manual', handler: () => show(d, e.navigationType).catch((x) => { console.error('화면을 바꾸지 못했습니다', x); hard(d); }) });
        return;
      }
      if (!r2 && e.cancelable && leaving(d)) e.preventDefault();
    });
  } else {
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]'); if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const d = new URL(a.href, location.href);
      if (d.origin !== location.origin || (d.pathname === location.pathname && d.search === location.search && d.hash)) return;
      if (spaOk(d)) { e.preventDefault(); nav(d, 'push'); } else if (leaving(d)) e.preventDefault();
    });
    addEventListener('popstate', () => { const d = new URL(location.href); if (spaOk(d)) show(d, 'traverse'); else { SPA.hard = true; location.reload(); } });
  }
  window.__spa = { times: SPA.times, leak, get cur() { return SPA.cur?.route.id; }, go };
  show(u, 'load').then(() => idle(prefetch));
}
function nav(u, how) {
  if (window.navigation?.navigate) { navigation.navigate(u.href, { history: how === 'replace' ? 'replace' : 'push' }); return; }
  history[how === 'replace' ? 'replaceState' : 'pushState']({ spa: 1 }, '', u.href);
  show(u, how);
}
let seq = 0;
async function show(u, how) {
  const r = spaOk(u); if (!r) { hard(u); return; }
  const my = ++seq, t0 = performance.now();
  const from = SPA.cur?.route.id || null;
  const meta = await metaOf(r);
  if (my !== seq) return;
  /* 앞 화면 닫기 */
  if (SPA.cur) leave();
  await Promise.all([...meta.js.map(script), cssPut(meta.css, true)]);
  if (my !== seq) return;
  if (!REG.has(r.id)) for (const m of meta.mods) await import(m);       // 처음 여는 화면 — 모듈을 불러오면 screen() 이 등록한다
  if (my !== seq) return;
  if (REG.get(r.id)?.inst !== SPA.inst) { hard(u); return; }             // 화면 파일이 새 판으로 바뀌었다 — 페이지를 새로 열어 새 판으로
  if (meta.title) document.title = meta.title;
  const before = snap();
  for (const c of meta.body.cls) if (how === 'load' || !/-boot$/.test(c)) document.body.classList.add(c);   // 첫 그림 가리개(la-boot · lm-boot)는 새 페이지일 때만 — 틀이 이미 그려져 있다
  for (const [k, v] of meta.body.attrs) document.body.setAttribute(k, v);
  const scope = newScope(r);
  SPA.cur = { route: r, scope, url: u.href, before };
  if (SPA.shell) { SPA.shell.main.scrollTop = 0; SPA.shell.pick(r.id); }
  const rec = { from, to: r.id, how, at: new Date().toISOString(), paint: null, done: null };
  SPA.times.push(rec); if (SPA.times.length > 200) SPA.times.shift();
  let ret;
  const run = Promise.resolve().then(() => REG.get(r.id).mount(SPA.shell?.main || null, u.searchParams)).then((x) => { ret = x; }, (e) => { console.error('화면을 열지 못했습니다', e); });
  scope.ret = () => (typeof ret === 'function' ? ret : null);
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  rec.paint = Math.round(performance.now() - t0);
  run.then(() => { rec.done = Math.round(performance.now() - t0); document.dispatchEvent(new CustomEvent('spa:shown', { detail: rec })); });
}
function leave() {
  const c = SPA.cur; SPA.cur = null;
  const fn = c.scope.ret?.(); if (fn) { try { fn(); } catch (e) { console.warn('spa unmount', e); } }
  dispose(c.scope);
  SPA.closeUi?.();                                     // 열린 가운데 창 · 서랍 · 가운데 '불러오는 중' · XI ChatGEO 의 지도 손잡이
  SPA.shell?.clear();                                  // 판 · 머리줄의 화면 칸 · 신선도 점
  restore(c.before);
}
/* 몸(body) · 문서(html) 표시 — 화면이 더한 것만 되돌린다 */
const snap = () => ({ b: new Set(document.body.classList), h: new Set(document.documentElement.classList), bd: { ...document.body.dataset }, hd: { ...document.documentElement.dataset } });
const KEEP_CLS = /^(t|k-shelled|k-md-open)$/;
function restore(s) {
  for (const c of [...document.body.classList]) if (!s.b.has(c) && !KEEP_CLS.test(c)) document.body.classList.remove(c);
  for (const c of [...document.documentElement.classList]) if (!s.h.has(c) && !KEEP_CLS.test(c)) document.documentElement.classList.remove(c);
  for (const [el, was] of [[document.body, s.bd], [document.documentElement, s.hd]]) {
    for (const k of Object.keys(el.dataset)) if (!(k in was)) delete el.dataset[k];
    for (const [k, v] of Object.entries(was)) el.dataset[k] = v;
  }
}
/* 업로드 중에 한 페이지 밖(요청함 · 데이터 올리기 …)으로 — 업로드를 업로드 창으로 넘긴 뒤 간다(넘길 것이 없으면 그냥) */
let passing = false;
function leaving(d) {
  if (passing || !SPA.busy?.()) return false;
  passing = true;
  SPA.handoff(d.href).finally(() => hard(d));
  return true;
}
/* 다른 화면 미리 받아 두기 — 첫 화면이 다 그려진 뒤 쉬는 틈에(첫 메뉴 바꿈도 빠르게) */
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 4000 }) : setTimeout(fn, 1500));
async function prefetch() {
  for (const r of ROUTES) {
    if (REG.has(r.id)) continue;
    try {
      const m = await metaOf(r);
      cssPut(m.css, false);
      await Promise.all(m.js.map(script));
      for (const x of m.mods) await import(x);
    } catch (e) { console.debug('spa prefetch', r.id, e); }
  }
}

/* ───────── 점검(새는 것) ───────── */
function leak() {
  const n = (k) => [...(LIVE.listen.get(k)?.values() || [])].reduce((a, s) => a + s.size, 0);
  return {
    screen: SPA.cur?.route.id || null,
    listeners: { window: n('w'), document: n('d') },
    intervals: LIVE.iv.size, timeouts: LIVE.to.size, observers: LIVE.obs.size, maps: LIVE.maps.size,
    nodes: document.getElementsByTagName('*').length,
    canvases: document.querySelectorAll('canvas').length,
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
}
