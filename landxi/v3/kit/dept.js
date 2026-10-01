/* dept.js — 부서 고르기(검색) · 제안 S-21 확인 · 10-01 사용자 "부서는 일단 LX 누리집 조직도에 보자. 나중엔 사내 시스템에서 불러오는 작업을 할 예정".
   LX 부서 목록(서버 GET /accounts/depts 한 출처 — 처음 목록은 누리집 조직도, LX 관리자가 계정 관리에서 고친다)이 있으면
   입력 칸 아래에 맞는 부서를 보여 주고 고르게 한다. 이름은 '상위 › 부서'(예: 공간정보본부 › 플랫폼사업처).
   목록에 없는 부서(지역본부 아래 지사 등)는 적은 그대로 쓴다(막지 않는다 · 서버도 같은 규칙). 목록이 비면 지금처럼 직접 적기만.
   쓰는 곳: 가입 신청(LX 직원) · 내 정보 · (관리자 계정 관리는 목록 자체를 고친다).
   deptPicker(input, { hint }) → { ready: Promise<boolean 목록 있음>, listed(값) } — hint = 안내 한 줄을 넣을 자리(없으면 입력 칸 다음에 만든다) */
import { h, api } from './util.js';

const CSS = new URL('./dept.css', import.meta.url).href;
const SEP = ' › ';
let LIST = null;
/** 목록 — 한 화면에서 한 번만 부른다(실패하면 빈 목록 = 직접 적기) */
export function deptList(fresh = false) {
  if (!LIST || fresh) LIST = api('/accounts/depts').then((j) => j.items || []).catch(() => { LIST = null; return []; });
  return LIST;
}
const key = (s) => String(s ?? '').replace(/[›>]/g, ' ').split(/\s+/).filter(Boolean).join(' ').toLowerCase();
const tight = (s) => key(s).replace(/ /g, '');
/** 목록에 있는 부서인가 — 이름(label) · 부서만 · '상위 부서' 어느 것으로 적어도 */
export function inList(items, v) {
  const k = key(v);
  if (!k) return false;
  return items.some((l) => key(l) === k || key(l.split('›').pop()) === k);
}

export function deptPicker(input, { hint } = {}) {
  if (!document.querySelector('link[data-k-dept]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-dept': '' }));
  const id = 'k-dp-' + Math.random().toString(36).slice(2, 8);
  const box = h('ul.k-dp', { id, role: 'listbox', hidden: true, 'aria-label': '부서 목록' });
  const say = hint || h('p.k-dp-h', { hidden: true });
  let items = [], opts = [], at = -1, first = input.value;
  const ready = deptList().then((list) => {
    items = list;
    if (!items.length) return false;                      // 목록 없음 — 지금처럼 직접 적기
    input.setAttribute('autocomplete', 'off');               // 브라우저 자동 완성 목록이 부서 목록을 가리지 않게
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);
    input.after(box);
    if (!hint) box.after(say);
    note();
    input.addEventListener('focus', open);
    input.addEventListener('input', () => { open(); note(); });
    input.addEventListener('keydown', keys);
    input.addEventListener('blur', () => setTimeout(close, 120));
    box.addEventListener('pointerdown', (e) => e.preventDefault());   // 고르는 동안 입력 칸이 초점을 잃지 않게
    if (document.activeElement === input) open();                    // 목록이 오기 전에 이미 적고 있었으면 바로 보여 준다
    return true;
  });

  function note() {
    const v = input.value.trim();
    say.hidden = false;
    if (!v) say.textContent = '목록에서 고르고, 없으면 그대로 적습니다(지사 등)';
    else if (inList(items, v)) say.textContent = '목록에 있는 부서입니다';
    else if (v === first.trim()) say.textContent = '지금 적힌 이름은 목록에 없습니다. 맞는 부서가 있으면 고르세요';
    else if (match(v).length) say.textContent = '목록에서 고르고, 없으면 적은 그대로 씁니다';
    else say.textContent = '목록에 없는 이름 — 적은 그대로 씁니다';
  }
  function match(q) {
    const k = key(q), t = tight(q);
    if (!k) return items.slice();
    const hit = items.filter((l) => key(l).includes(k) || tight(l).includes(t));
    const head = (l) => (key(l.split('›').pop()).startsWith(k) ? 0 : 1);
    return hit.sort((a, b) => head(a) - head(b));
  }
  function row(text, own = false) {
    const li = h('li', { role: 'option', 'aria-selected': 'false', class: own ? 'is-own' : '' });
    if (own) li.append(h('span', { text: `'${text}' 그대로 쓰기` }), h('small', { text: '목록에 없는 부서' }));
    else {
      const parts = text.split(SEP);
      if (parts.length > 1) li.append(h('small', { text: parts.slice(0, -1).join(SEP) + SEP }));
      li.append(h('span', { text: parts[parts.length - 1] }));
    }
    li.addEventListener('click', () => pick(own ? null : text));
    return li;
  }
  function open() {
    const v = input.value.trim();
    const list = match(v);
    opts = list.map((l) => row(l));
    if (v && !inList(items, v)) opts.push(row(v, true));
    if (!opts.length) { close(); return; }
    box.replaceChildren(...opts);
    box.hidden = false; at = -1;
    input.setAttribute('aria-expanded', 'true');
  }
  function close() { box.hidden = true; at = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function pick(text) {
    if (text !== null) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
    close(); note();
  }
  function move(d) {
    if (box.hidden) open();
    if (!opts.length) return;
    at = (at + d + opts.length) % opts.length;
    opts.forEach((o, i) => { o.setAttribute('aria-selected', String(i === at)); if (i === at) { o.id = `${id}-${i}`; input.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } });
  }
  function keys(e) {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && !box.hidden && at >= 0) { e.preventDefault(); opts[at].click(); }
    else if (e.key === 'Tab') close();
  }
  return { ready, listed: (v) => inList(items, v ?? input.value), reset: () => { first = input.value; note(); } };
}
