/* K9-1 loader.js — 불러오는 중은 화면 가운데 하나(원칙 161 · 10-09 로딩-1).
   칸마다 '불러오는 중'을 띄우지 않는다. 기다리는 칸은 옅은 빈 틀만 두고, 내용 영역(셸의 판 · 없으면 화면) 정가운데에
   점 셋(LX 청록) + 작은 '불러오는 중' 한 줄을 하나만 띄운다. 여러 칸이 동시에 기다리면 하나로 합치고(참조 카운트) 모두 도착하면 사라진다.
   6초 넘게 이어지면 그 아래 '서버 응답이 늦습니다 · 다시 시도'.
   · what(선택) = 무엇을 기다리는지 한 줄(예: '전국 결과 요약') — 가운데 글이 '… 불러오는 중'이 된다(GPT2-4 · 늦을 때 무엇이 늦는지)
   · watch(el, { onRetry, what })   칸 하나를 기다림으로 센다 — el 이 화면에 보이는 동안만(숨은 탭 · 떼어 낸 칸은 세지 않는다)
   · unwatch(el)              그 칸 도착
   · hold({ onRetry }) → release()   칸 없이 기다림 하나(지도 첫 그림 등)
   empty.js(kind 'loading') · bignum.js(도착 전)가 알아서 부른다 — 화면 코드는 그대로. */
import { h, RM } from './util.js';
import { t } from './i18n.js';

export const SLOW_MS = 6000;
const SHOW_AFTER = 120;   // 이보다 짧은 기다림은 표시하지 않는다(깜박임 방지)
const GONE_MS = 3000;     // 화면에서 떼어진 채 이만큼 지나면 그 칸은 잊는다

const ELS = new Map();    // el → { onRetry, off: 떼어진 시각 }
const HOLDS = new Map();  // token → { onRetry }
let ui = null, timer = 0, since = 0, shown = false, slow = false, raf = 0, lastRetry = null;

function mount() {
  if (ui) return ui;
  const label = h('span.k-ld-t', { text: t('empty.loading') });
  const retry = h('button.k-ld-r', { type: 'button', text: t('empty.retry'), onclick: () => (lastRetry ? lastRetry() : location.reload()) });
  const slowEl = h('p.k-ld-slow', { hidden: true }, h('span', { text: t('empty.slow') }), h('span', { text: ' · ', 'aria-hidden': 'true' }), retry);
  const card = h('div.k-ld-c', {}, h('div.k-ld-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), label);
  const root = h('div.k-ld', { role: 'status', 'aria-live': 'polite', hidden: true }, h('div.k-ld-in', {}, card, slowEl));
  document.body.append(root);
  ui = { root, slowEl, label };
  addEventListener('resize', place);
  return ui;
}

/** 내용 영역 — 보이는 셸 판(.k-main) · 없으면 화면 전체 */
function area() {
  for (const m of document.querySelectorAll('.k-app:not(.k-app--in) > .k-main, main.k-main')) {
    const r = m.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return { left: 0, top: 0, width: innerWidth, height: innerHeight };
}
function place() {
  if (!ui || ui.root.hidden) return;
  const r = area(), s = ui.root.style;
  s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px';
}

function count() {
  let n = HOLDS.size;
  const now = performance.now();
  for (const [el, o] of ELS) {
    if (el.dataset.kWait !== '1') { ELS.delete(el); continue; }
    if (!el.isConnected) { o.off = o.off || now; if (now - o.off > GONE_MS) { ELS.delete(el); delete el.dataset.kWait; } continue; }
    o.off = 0;
    if (el.getClientRects().length) { n++; if (o.onRetry) lastRetry = o.onRetry; }
  }
  for (const o of HOLDS.values()) if (o.onRetry) lastRetry = o.onRetry;
  if (ui) {   // 무엇을 기다리나 — 마지막으로 알려 준 것 한 줄(없으면 기본 '불러오는 중')
    let w = '';
    for (const o of HOLDS.values()) if (o.what) w = o.what;
    for (const [el, o] of ELS) if (o.what && el.isConnected) w = o.what;
    const txt = w ? `${w} 불러오는 중` : t('empty.loading');
    if (ui.label.textContent !== txt) ui.label.textContent = txt;
  }
  return n;
}

function tick() {
  raf = 0;
  const n = count();
  const now = performance.now();
  if (n > 0) {
    if (!since) since = now;
    if (!shown && now - since >= SHOW_AFTER) show();
    if (shown && !slow && now - since >= SLOW_MS) { slow = true; ui.slowEl.hidden = false; ui.root.dataset.slow = '1'; }
  } else {
    since = 0; lastRetry = null;
    if (shown) hide();
  }
  const busy = n > 0 || ELS.size > 0;
  if (busy && !timer) timer = setInterval(kick, 250);
  else if (!busy && timer) { clearInterval(timer); timer = 0; }
}
function kick() { if (!raf) raf = requestAnimationFrame(tick); }

function show() {
  mount();
  shown = true; slow = false; ui.slowEl.hidden = true; delete ui.root.dataset.slow;
  ui.root.hidden = false; ui.root.classList.toggle('is-rm', RM());
  place();
  ui.root.setAttribute('aria-busy', 'true');
  requestAnimationFrame(() => ui.root.classList.add('is-on'));
}
function hide() {
  shown = false; slow = false;
  const r = ui.root;
  r.classList.remove('is-on'); r.setAttribute('aria-busy', 'false');
  setTimeout(() => { if (!shown) { r.hidden = true; ui.slowEl.hidden = true; delete r.dataset.slow; } }, 220);
}

export function watch(el, { onRetry, what } = {}) {
  if (!el) return;
  el.dataset.kWait = '1';
  ELS.set(el, { onRetry, what, off: 0 });
  kick();
}
export function unwatch(el) {
  if (!el || !ELS.has(el)) { if (el) delete el.dataset.kWait; return; }
  ELS.delete(el); delete el.dataset.kWait;
  kick();
}
export function hold({ onRetry, what } = {}) {
  const tk = {};
  HOLDS.set(tk, { onRetry, what });
  kick();
  return () => { if (HOLDS.delete(tk)) kick(); };
}
/** 지금 가운데 표시가 떠 있는가(점검 도구용) */
export const loaderState = () => ({ shown, slow, waiting: count() });
