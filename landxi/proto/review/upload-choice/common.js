/* upload-choice/common.js — 시안 두 벌(① 바깥 틀 유지 · ② 한 페이지)이 같이 쓰는 것.
   · LX 직원 머리줄 · 왼쪽 메뉴 = 운영 부품 kit/shell.js 그대로(읽어 쓰기만 · 고치지 않음)
   · 업로드 = 시험 업로드: 고른 파일을 실제로 조각 단위로 읽되 서버로 보내지 않는다.
     속도는 이 서버로 잰 실제 올리기 속도(초당 약 5.5MB · kit/uploads.js SPEED 와 같은 값)에 맞춘다.
     서버에 임시 자료를 남기지 않으려고 이렇게 했다 — 화면 느낌(메뉴를 옮겨도 계속 가는가)은 실제와 같다.
   · 새로고침하면 멈추고, '이어서 업로드'로 받은 자리부터 이어 간다(고른 파일은 이 브라우저 보관함 IndexedDB 에 둔다). */
import { gate } from '../../../v3/kit/auth-gate.js';
import { shell } from '../../../v3/kit/shell.js';
import { STAFF_MENU } from '../../../v3/kit/lx-menu.js';
import { h } from '../../../v3/kit/util.js';

export const SCREENS = ['home', 'projects', 'analyze', 'mapsvc'];
const at = (p) => new URL(p, import.meta.url).pathname;
export const REAL = { home: at('../../../v3/lx-console/'), projects: at('../../../v3/lx-project/'), analyze: at('../../../v3/lx-analyze/'), mapsvc: at('../../../v3/lx-map/') };
const SPEED = 5.5e6;       // 초당 바이트
const TICK = 200;          // ms
const KEY = 'uc-up';

export async function boot({ which, onPick, current }) {
  const who = await gate('lx-console');
  const items = STAFF_MENU.filter((m) => SCREENS.includes(m.id)).map((m) => ({ id: m.id, label: m.label, icon: m.icon }));
  const S = shell({ who, home: 'lx-console', rail: { kind: 'menu', items, current: Math.max(0, SCREENS.indexOf(current)), onPick: (i, it) => onPick(it.id) } });
  const tag = h('a.uc-tag', { href: '../', title: '두 시안 비교로' }, h('b', { text: '시안' }), h('span.uc-tag-w', { text: which === 'a' ? '① 바깥 틀 유지' : '② 한 페이지' }), h('span.uc-tag-t.num'));
  const up = mountUpload();
  const box = h('span.uc-mast', {}, tag, up.chip);
  S.mast(box);
  return { S, who, timeTag: (txt) => { tag.querySelector('.uc-tag-t').textContent = txt; } };
}

/* ── 보관(IndexedDB · 고른 파일 그대로) ───────────────────── */
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('uc-up', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function idbPut(v) { try { const d = await idb(); await new Promise((ok, no) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, 'file'); t.oncomplete = ok; t.onerror = () => no(t.error); }); } catch { /* 보관 못 하면 다시 고르기 */ } }
async function idbGet() { try { const d = await idb(); return await new Promise((ok) => { const r = d.transaction('f').objectStore('f').get('file'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); }); } catch { return null; } }
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const save = (s) => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* */ } };

const mb = (b) => b >= 1e9 ? (b / 1e9).toFixed(2) + 'GB' : Math.round(b / 1e6) + 'MB';
const left = (s) => { const sec = Math.ceil((s.size - s.bytes) / SPEED); return sec >= 60 ? `약 ${Math.ceil(sec / 60)}분` : `약 ${sec}초`; };

function mountUpload() {
  let st = load(), file = null, timer = 0, busy = false;
  if (st && st.run === 'up') { st.run = 'pause'; st.why = 'reload'; save(st); }   // 새로고침 = 멈춤
  const pick = h('input', { type: 'file', hidden: true });
  const chip = h('button.uc-chip', { type: 'button', 'aria-haspopup': 'dialog' }, h('span.uc-chip-t'), h('i', {}, h('b')));
  const pop = h('div.uc-pop', { role: 'dialog', 'aria-label': '영상 업로드', hidden: true });
  document.body.append(pop, pick);

  const stop = () => { clearInterval(timer); timer = 0; };
  async function step() {
    if (busy || !st || st.run !== 'up') return;
    busy = true;
    const n = Math.min(st.size - st.bytes, Math.round(SPEED * TICK / 1000));
    try { if (file) await file.slice(st.bytes, st.bytes + n).arrayBuffer(); } catch { st.run = 'pause'; st.why = 'lost'; file = null; }
    if (st.run === 'up') { st.bytes += n; if (st.bytes >= st.size) { st.run = 'done'; stop(); } }
    save(st); paint(); busy = false;
  }
  const run = () => { st.run = 'up'; st.why = ''; save(st); stop(); timer = setInterval(step, TICK); paint(); };
  async function resume() {
    if (!st.virtual && !file) {
      const f = await idbGet();
      if (f && f.name === st.name && f.size === st.size) file = f;
      else { st.why = 'repick'; paint(); pick.click(); return; }
    }
    run();
  }
  function start(f, virtual) {
    file = virtual ? null : f;
    st = virtual ? { name: '가상 영상 파일.tif', size: 1.5e9, bytes: 0, virtual: true } : { name: f.name, size: f.size, bytes: 0, virtual: false };
    if (!virtual) idbPut(f);
    run();
  }
  pick.addEventListener('change', () => {
    const f = pick.files?.[0]; pick.value = '';
    if (!f) return;
    if (st && st.why === 'repick' && f.name === st.name && f.size === st.size) { file = f; idbPut(f); run(); return; }
    start(f, false);
  });

  function paint() {
    const t = chip.querySelector('.uc-chip-t'), bar = chip.querySelector('b');
    const pct = st ? Math.floor((st.bytes / st.size) * 100) : 0;
    chip.dataset.st = st?.run || 'none';
    bar.style.width = pct + '%';
    t.textContent = !st ? '영상 업로드' : st.run === 'up' ? `업로드 중 ${pct}%` : st.run === 'pause' ? `멈춤 ${pct}%` : '업로드 끝';
    const why = !st ? '' : st.why === 'reload' ? '화면을 새로 열어 멈췄습니다. 받은 자리부터 이어 갑니다.'
      : st.why === 'repick' ? '같은 파일을 한 번 더 골라 주세요. 받은 자리부터 이어 갑니다.'
      : st.why === 'lost' ? '파일을 읽지 못해 멈췄습니다.' : '';
    pop.replaceChildren(...[
      h('b.uc-pop-h', { text: '영상 업로드' }),
      st ? h('div.uc-pop-r', {},
        h('span.uc-pop-n', { text: st.name }),
        h('span.uc-pop-p.num', { text: `${mb(st.bytes)} / ${mb(st.size)}` + (st.run === 'up' ? ` · 남은 시간 ${left(st)}` : '') }),
        h('i.uc-pop-bar', {}, h('b', { style: { width: pct + '%' } }))) : h('p.uc-pop-s', { text: '파일을 고르면 바로 올라갑니다. 올리는 동안 왼쪽 메뉴를 마음껏 옮겨 보세요.' }),
      why ? h('p.uc-pop-w', { text: why }) : null,
      h('div.uc-pop-a', {},
        !st || st.run === 'done' ? h('button.t-btn', { type: 'button', text: '파일 고르기', onclick: () => pick.click() }) : null,
        !st || st.run === 'done' ? h('button.t-btn.t-btn--2', { type: 'button', text: '파일 없이 해 보기', onclick: () => start(null, true) }) : null,
        st?.run === 'up' ? h('button.t-btn.t-btn--2', { type: 'button', text: '멈춤', onclick: () => { st.run = 'pause'; st.why = ''; stop(); save(st); paint(); } }) : null,
        st?.run === 'pause' ? h('button.t-btn', { type: 'button', text: '이어서 업로드', onclick: () => resume() }) : null,
        st && st.run !== 'done' ? h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: () => { stop(); st = null; file = null; save(null); paint(); } }) : null,
        st?.run === 'done' ? h('button.t-btn.t-btn--2', { type: 'button', text: '목록 비우기', onclick: () => { st = null; save(null); paint(); } }) : null),
      h('p.uc-pop-s', { text: '시험 업로드 — 파일을 실제로 조각조각 읽지만 서버로 보내지 않습니다. 속도는 이 서버로 잰 실제 업로드 속도(초당 약 5.5MB)에 맞췄습니다.' })].filter(Boolean));
  }
  const place = () => { const r = chip.getBoundingClientRect(), w = Math.min(360, innerWidth - 32); pop.style.top = r.bottom + 8 + 'px'; pop.style.right = Math.max(16, Math.min(innerWidth - r.right, innerWidth - 16 - w)) + 'px'; };
  chip.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) place(); });
  addEventListener('resize', () => { if (!pop.hidden) place(); });
  pop.addEventListener('click', (e) => e.stopPropagation());   // 창 안 단추를 누르면 내용이 다시 그려진다 — 창 밖 클릭으로 보지 않게
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== chip) pop.hidden = true; });
  window.addEventListener('blur', () => { /* iframe 안을 누르면 창 밖 클릭으로 본다 */ setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME') pop.hidden = true; }, 0); });
  paint();
  return { chip, state: () => st };
}
