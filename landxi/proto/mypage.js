/* 마이 페이지 — 마스터 design-canvas/v2/B6-My-*.dc.html(선택 1) · 원본 landxi7/mypage.html 1:1(기능 추가 0 · 삭제 0).
   열람 뷰 ↔ 회원정보 수정 뷰(본인 확인 경유) · 모달 4(본인 확인 · 비밀번호 변경 · 증량 신청 · 브랜드 심볼) + 계정 탈퇴(추정).
   URL 이 상태다: ?mode=edit(원본 딥링크 — 본인 확인을 거친다) · ?open=password|storage|brand|withdraw · ?history=empty(빈 상태).
   바뀐 값은 메모리 + sessionStorage, 브랜드 심볼만 원본처럼 localStorage('lx_custom_symbol'). */
import { mountShell, openModal, say, icon, esc, $, $$, AS_OF, logout } from './shell.js';
import { DEPTS, STORAGE, STATUS, PRESETS, CAP_MIN, CAP_MAX, UNIT_GB, PLATE_ROWS, GHOST_COLS_MAX, SYMBOL_KEY, SYMBOL_MIN, SYMBOL_MAX, SYMBOL_DEFAULT_W,
  MSG, TOAST, STRONG_PW, loadState, saveState, loadSymbol, clampW } from './account-data.js';
import { applyCustomSymbol, isSymbolSrc } from './account-brand.js';

const HEAD = {
  main: ['마이 페이지', 1, '회원 정보 및 내 디스크 사용 현황을 확인하세요'],
  edit: ['회원정보 수정', 1, '회원 정보와 정보 이용 동의 설정을 변경합니다.'],
};
const shell = mountShell({ active: 'my', title: HEAD.main[0], titleRule: 1, subtitle: esc(HEAD.main[2]), fit: true });
if (shell) boot();

function boot() {
  const state = loadState(location.search);
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const when = (iso) => String(iso || '').replace('T', ' ').slice(0, 16).replace(/-/g, '.');
  const toast = ([title, msg]) => say(`${title} — ${msg}`);
  /* 부품 아이콘 세트에 없는 그림 3개 — 원판 생성기와 같은 각진 1.5 stroke */
  const EXTRA = { data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>', up: '<path d="M3 13v4h14v-4"/><path d="M10 13V3M6 7l4-4 4 4"/>', consent: '<path d="M3 3h14v14H3z"/><path d="M6 10.5 9 13.5 14.5 7"/>' };
  const ic = (name, size = 16) => EXTRA[name]
    ? `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${EXTRA[name]}</svg>` : icon(name, size);
  $$('[data-ic]').forEach((e) => { e.innerHTML = ic(e.dataset.ic, e.closest('.btn,.btn-br,.my-new') ? 15 : 16); });
  $$('[data-in]').forEach((e, i) => e.style.setProperty('--i', i));

  /* ══ 열람 뷰 ═══════════════════════════════════════════════════════════ */
  function renderProfile(freshKeys = []) {
    const p = state.profile;
    $('#profile-name').textContent = p.displayName || p.name;
    const rows = [['name', '이름', p.name], ['email', '아이디 (이메일)', p.email, 'n'], ['phone', '전화번호', p.phone, 'n'], ['dept', '부서', p.dept], ['rank', '직위', p.rank], ['joined', '가입 일시', when(p.joined), 'n']];
    $('#my-ledger').innerHTML = rows.map(([k, l, v, cls]) => `<div data-k="${k}"${freshKeys.includes(k) ? ' class="is-fresh"' : ''}><dt>${l}</dt><dd id="pt-${k}"${cls ? ` class="${cls}"` : ''}>${esc(v)}</dd></div>`).join('');
  }

  function renderDisk() {
    const pct = STORAGE.total > 0 ? STORAGE.used / STORAGE.total : 0;
    $('#disk-pct').textContent = Math.round(pct * 100);
    $('#disk-used').textContent = fmt(STORAGE.used, 1);
    $('#disk-free').textContent = fmt(STORAGE.total - STORAGE.used, 1);
    $('#disk-total').textContent = fmt(STORAGE.total);
  }

  /* 칸 판 — 1칸 = 16 GB · 4행 · 열 우선 채움. 검토 중 증량 = 오른쪽 덧열의 점선 고스트 칸. */
  let lastFresh = 0, plateKey = '';
  function renderPlate(force = false) {
    const el = $('#plate'), w = el.parentElement.clientWidth;
    if (!w) return;
    const cols = STORAGE.total / UNIT_GB / PLATE_ROWS;
    const pend = state.history.filter((r) => r.status === 'pending').reduce((a, r) => a + r.capacity, 0);
    const gCellsAll = Math.round(pend / UNIT_GB);
    const gCols = Math.min(GHOST_COLS_MAX, Math.ceil(gCellsAll / PLATE_ROWS)), gCells = Math.min(gCellsAll, gCols * PLATE_ROWS);
    const total = cols + gCols, gap = 3;
    /* 칸 크기 — 폭만 보던 것을 **화면 높이**도 보게 했다(2026-09-20).
       칸 판은 네 줄이라 칸이 커지면 세로를 네 배로 먹는다. 1996×745 에서 30px 칸이
       129px 을 차지해 아래 `증량 신청 이력` 표가 통째로 잘려 있었다.
       745px 화면이면 17px, 900px 이면 25px, 1080px 이상이면 원래대로 30px 이다.
       줄 수(4)는 건드리지 않는다 — `1칸 = 16 GB` 눈금이 어긋나면 용량 감이 사라진다. */
    const capH = Math.max(13, Math.min(30, Math.round((innerHeight - 745) * 0.05 + 17)));
    const cell = Math.max(8, Math.min(capH, Math.floor((w - gap * (total - 1)) / total))), pitch = cell + gap;
    const usedCells = STORAGE.used / UNIT_GB, full = Math.floor(usedCells), frac = usedCells - full;
    const freshCells = Math.min(gCells, Math.round(lastFresh / UNIT_GB));
    const key = `${cell}|${total}|${gCells}`;
    if (!force && key === plateKey) return;                                          // 크기만 바뀐 리사이즈에는 다시 그리지 않는다(진입 모션 재생 방지)
    if (plateKey) el.dataset.done = ''; plateKey = key;
    let s = '';
    for (let c = 0; c < total; c++) for (let r = 0; r < PLATE_ROWS; r++) {
      const i = c * PLATE_ROWS + r;
      if (c >= cols) { const g = (c - cols) * PLATE_ROWS + r; s += g < gCells ? `<i class="g${g >= gCells - freshCells ? ' is-fresh' : ''}" style="--col:${c}"></i>` : '<i class="x"></i>'; continue; }
      s += i < full ? `<i class="u" style="--col:${c}"></i>` : i === full && frac > .05 ? `<i class="p" style="--col:${c};--f:${Math.round(cell * frac)}px"></i>` : '<i></i>';
    }
    el.style.setProperty('--c', `${cell}px`); el.innerHTML = s;
    el.setAttribute('aria-label', `전체 ${fmt(STORAGE.total)} GB 중 ${fmt(STORAGE.used, 1)} GB 사용${pend ? ` · 검토 중 증량 +${fmt(pend)} GB` : ''}`);
    $('#plate-pend').hidden = !pend;
    $('#plate-pend-v').textContent = `+${fmt(pend)} GB${gCellsAll > gCells ? ` (칸 판은 ${fmt(gCells * UNIT_GB)} GB 까지)` : ''}`;
    const baseW = cols * pitch - gap;
    $('#plate-axis').innerHTML = [0, .25, .5, .75, 1].map((k) => `<span style="left:${Math.round(k * baseW)}px">${fmt(STORAGE.total * k)}${k === 1 ? ' GB' : ''}</span>`).join('');
  }

  function renderHistory(freshAt = '') {
    const list = state.history.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    $('#history-count').textContent = `총 ${list.length}건`;
    $('#history-empty').hidden = list.length > 0;
    $('#history-table').classList.toggle('is-dense', list.length > 2);
    $('#history-tbody').innerHTML = list.map((h) => {
      const st = STATUS[h.status] || '-', pending = h.status === 'pending';
      return `<tr${h.requestedAt === freshAt ? ' class="is-fresh"' : ''}><td><span class="cap"><b class="d${pending ? ' is-acc' : ''}">+${fmt(h.capacity)}</b><span class="mic">GB</span></span></td><td title="${esc(h.reason)}">${esc(h.reason)}</td><td class="when">${when(h.requestedAt)}</td><td><span class="st${pending ? ' st--acc' : h.status === 'rejected' ? ' st--dim' : ''}">${pending ? '<i></i>' : h.status === 'approved' ? icon('check', 14) : ''}${st}</span></td><td class="note" title="${esc(h.note || '-')}">${esc(h.note || '-')}</td></tr>`;
    }).join('');
  }

  /* 브랜드 카드 — 레일 머리 미리보기(1.5배) + 현재 가로 크기 + 16–50px 자 */
  const railHead = (cfg) => (cfg && isSymbolSrc(cfg.src)
    ? `<img src="${esc(cfg.src)}" alt="" style="width:calc(${cfg.w}px * var(--k))"><span>LAND XI</span>` : '<span>LAND</span><span>XI</span>');
  const pctOf = (w) => `${((w - SYMBOL_MIN) / (SYMBOL_MAX - SYMBOL_MIN) * 100).toFixed(2)}%`;
  function renderBrandCard() {
    const cfg = loadSymbol(), box = $('#bs-current'), ruler = $('#bs-ruler'), wEl = $('#bs-current-w');
    box.innerHTML = railHead(cfg); box.toggleAttribute('data-sym', !!cfg);
    wEl.textContent = cfg ? cfg.w : '기본'; wEl.classList.toggle('is-acc', !!cfg);
    $('#bs-current-u').textContent = cfg ? 'px' : '심볼';
    ruler.toggleAttribute('data-off', !cfg); ruler.style.setProperty('--p', pctOf(cfg ? cfg.w : SYMBOL_MIN));
  }

  /* ══ 뷰 전환 — 제목 행은 셸의 것을 그 자리에서 바꾼다 ═════════════════ */
  const VERIFIED = 'lx_my_verified';
  const verified = () => { try { return sessionStorage.getItem(VERIFIED) === '1'; } catch { return false; } };
  function switchView(view, { push = false, focus = true } = {}) {
    const [title, k, sub] = HEAD[view];
    const words = title.split(' ');
    $('#page-title').innerHTML = `<span class="rule">${esc(words.slice(0, k).join(' '))}</span>${words.length > k ? ' ' + esc(words.slice(k).join(' ')) : ''}`;
    $('#page-sub').textContent = sub;
    document.title = `${title} — Land-XI`;
    $('#view-main').hidden = view !== 'main'; $('#view-edit').hidden = view !== 'edit';
    if (push) { const u = new URL(location.href); if (view === 'edit') u.searchParams.set('mode', 'edit'); else u.searchParams.delete('mode'); u.searchParams.delete('open'); history.pushState({ view }, '', u); }
    $('#main').scrollTop = 0; $$('.my').forEach((m) => { m.scrollTop = 0; });
    if (focus) (view === 'edit' ? $('#ef-phone') : $('#btn-edit-profile')).focus();
  }
  addEventListener('popstate', () => {
    const edit = new URLSearchParams(location.search).get('mode') === 'edit';
    if (edit && verified()) { prefillEdit(); switchView('edit'); } else switchView('main');
  });

  /* ══ 밑줄 필드 도우미 ═════════════════════════════════════════════════ */
  const uf = ({ id, label, type = 'text', ph = '', hint = '', req = true, ac = 'off', cls = '' }) => `
<div class="uf" data-f="${id}"><label class="uf-l" for="${id}">${label}${req ? '<em class="req">*</em>' : ''}</label>
<div class="uf-i"><input id="${id}" type="${type}" class="${cls}" placeholder="${esc(ph)}" autocomplete="${ac}" aria-describedby="${id}-e${hint ? ` ${id}-h` : ''}"></div>
${hint ? `<p class="uf-h" id="${id}-h">${esc(hint)}</p>` : ''}<p class="uf-e" id="${id}-e" role="alert" hidden></p></div>`;
  function setErr(input, text) {
    const f = input.closest('.uf'), e = $('.uf-e', f);
    f.classList.toggle('is-error', !!text); e.hidden = !text; e.textContent = text || '';
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    f.closest('.uf-stack')?.classList.toggle('has-error', !!$('.uf.is-error', f.closest('.uf-stack')));
  }
  const clearOnInput = (root) => $$('input,textarea,select', root).forEach((i) => i.addEventListener('input', () => { if (i.closest('.uf')?.classList.contains('is-error')) setErr(i, ''); }));
  const onEnter = (root, fn) => $$('input', root).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); fn(); } }));
  const setOpen = (name) => { const u = new URL(location.href); if (name) u.searchParams.set('open', name); else u.searchParams.delete('open'); history.replaceState(history.state, '', u); };

  /* ══ 본인 확인 → 회원정보 수정 ════════════════════════════════════════ */
  function openPwdConfirm() {
    const submit = () => {
      const inp = $('#pwdc-input', m.el);
      if (!inp.value) { setErr(inp, MSG.pwdcEmpty); inp.focus(); return false; }       // 프로토타입: 아무 값이나 통과(빈 값만 거부) — 원본과 같다
      try { sessionStorage.setItem(VERIFIED, '1'); } catch { /* 메모리 */ }
      m.close('ok'); prefillEdit(); switchView('edit', { push: true });
      return false;
    };
    const m = openModal({
      title: '본인 확인', width: 460,
      onClose: (r) => { if (r !== 'ok' && new URLSearchParams(location.search).get('mode') === 'edit') { const u = new URL(location.href); u.searchParams.delete('mode'); history.replaceState(history.state, '', u); } },
      content: `<p class="m-lead">회원정보 수정을 위해 현재 비밀번호를 한 번 더 입력해 주세요.</p>${uf({ id: 'pwdc-input', label: '현재 비밀번호', type: 'password', ph: '현재 사용 중인 비밀번호', ac: 'current-password' })}`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '확인', kind: 'primary', onClick: submit }],
    });
    clearOnInput(m.el); onEnter(m.el, submit);
    return m;
  }
  function prefillEdit() {
    const p = state.profile;
    $('#ef-dept').innerHTML = DEPTS.map((d) => `<option${d === p.dept ? ' selected' : ''}>${esc(d)}</option>`).join('');
    $('#ef-name').value = p.name; $('#ef-email').value = p.email; $('#ef-phone').value = p.phone; $('#ef-rank').value = p.rank;
    $('#consent-marketing').checked = !!p.consent.marketing; $('#consent-sms').checked = !!p.consent.sms; $('#consent-email').checked = !!p.consent.email;
    setErr($('#ef-phone'), '');
  }
  function saveEdit() {
    const p = state.profile, phone = $('#ef-phone').value.trim();
    if (!phone) { setErr($('#ef-phone'), MSG.phoneEmpty); toast(TOAST.editError); $('#ef-phone').focus(); return; }
    const next = { phone, rank: $('#ef-rank').value.trim() || p.rank, dept: $('#ef-dept').value };
    const fresh = Object.keys(next).filter((k) => next[k] !== p[k]);
    Object.assign(p, next);
    p.consent = { marketing: $('#consent-marketing').checked, sms: $('#consent-sms').checked, email: $('#consent-email').checked };
    saveState(state); renderProfile(fresh); switchView('main', { push: true }); toast(TOAST.editSaved);
  }
  $('#view-edit').addEventListener('submit', (e) => { e.preventDefault(); saveEdit(); });
  $('#btn-edit-cancel').addEventListener('click', () => switchView('main', { push: true }));
  $('#ef-phone').addEventListener('input', () => setErr($('#ef-phone'), ''));
  $('#consent-marketing').addEventListener('change', (e) => { if (!e.target.checked) { $('#consent-sms').checked = false; $('#consent-email').checked = false; } });   // 상위 해제 → 하위 해제(원본)

  /* ══ 비밀번호 변경 ════════════════════════════════════════════════════ */
  function openPwd() {
    const save = () => {
      const [cur, np, cf] = ['pwd-current', 'pwd-new', 'pwd-confirm'].map((id) => $('#' + id, m.el));
      const strong = STRONG_PW.test(np.value), match = !!np.value && np.value === cf.value;
      setErr(cur, cur.value ? '' : MSG.pwdCurrent); setErr(np, strong ? '' : MSG.pwdWeak); setErr(cf, match ? '' : MSG.pwdMismatch);
      const bad = !cur.value ? cur : !strong ? np : !match ? cf : null;
      if (bad) { bad.focus(); return false; }
      m.close('ok'); toast(TOAST.pwdSaved);                                           // 데모: 서버 호출 없음 — 성공 알림만(원본)
      return false;
    };
    const m = openModal({
      title: '비밀번호 변경', width: 520, onClose: () => setOpen(''),
      content: `<div class="uf-stack">${uf({ id: 'pwd-current', label: '현재 비밀번호', type: 'password', ph: '현재 사용 중인 비밀번호를 입력하세요', ac: 'current-password' })}${uf({ id: 'pwd-new', label: '새 비밀번호', type: 'password', ph: '영문·숫자·특수문자 조합 8자 이상', hint: '영문·숫자·특수문자 조합 8자 이상', ac: 'new-password' })}${uf({ id: 'pwd-confirm', label: '새 비밀번호 확인', type: 'password', ph: '새 비밀번호를 다시 입력하세요', ac: 'new-password' })}</div>`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: save }],
    });
    clearOnInput(m.el); onEnter(m.el, save); setOpen('password');
    return m;
  }

  /* ══ 내 디스크 증량 신청 ══════════════════════════════════════════════ */
  function openStorage() {
    const save = () => {
      const capEl = $('#sr-capacity', m.el), rsEl = $('#sr-reason', m.el);
      const raw = capEl.value.trim(), cap = Number(raw), reason = rsEl.value.trim();
      const capOk = raw !== '' && !Number.isNaN(cap) && cap >= CAP_MIN && cap <= CAP_MAX;
      setErr(capEl, capOk ? '' : MSG.capRange); setErr(rsEl, reason ? '' : MSG.reasonEmpty);
      if (!capOk) { capEl.focus(); return false; }
      if (!reason) { rsEl.focus(); return false; }
      const hm = new Date(), pad = (n) => String(n).padStart(2, '0');
      let at = `${AS_OF}T${pad(hm.getHours())}:${pad(hm.getMinutes())}:${pad(hm.getSeconds())}`;   // 콘티의 기준일 + 지금 시각
      while (state.history.some((h) => h.requestedAt === at)) at = at.replace(/(\d\d)$/, (s) => pad((+s + 1) % 60));
      state.history.unshift({ capacity: cap, reason, requestedAt: at, status: 'pending', note: '검토 중' });
      saveState(state); lastFresh = cap;
      m.close('ok'); renderHistory(at); renderPlate(true); $('.my-hist').scrollTop = 0; toast(TOAST.storageDone(cap));
      return false;
    };
    const m = openModal({
      title: '내 디스크 증량 신청', tag: '시연', width: 660, onClose: () => setOpen(''),
      content: `
<div class="uf" data-f="sr-capacity"><label class="uf-l" for="sr-capacity">신청 용량 (GB)<em class="req">*</em></label>
  <div class="chips chips--l sr-chips" role="group" aria-label="용량 빠른 선택">${PRESETS.map((g) => `<button type="button" class="chip-b" data-gb="${g}" aria-pressed="false">${g}</button>`).join('')}<button type="button" class="chip-b" data-gb="custom" aria-pressed="false">직접 입력</button></div>
  <div class="uf-i" style="margin-top:10px"><input id="sr-capacity" type="number" inputmode="numeric" min="${CAP_MIN}" max="${CAP_MAX}" step="1" placeholder="GB 단위로 입력" aria-describedby="sr-capacity-e"><span class="mic n sr-gb">GB</span></div>
  <p class="uf-e" id="sr-capacity-e" role="alert" hidden></p>
  <div class="sr-bar" id="sr-bar" aria-hidden="true"><i class="b"></i><i class="u"></i><i class="g" hidden></i><p class="a n">현재 ${fmt(STORAGE.used, 1)} / ${fmt(STORAGE.total)} GB</p><p class="z" hidden>승인되면 전체 <b class="n" id="sr-after"></b></p></div></div>
<div class="uf" data-f="sr-reason" style="margin-top:16px"><label class="uf-l" for="sr-reason">신청 사유<em class="req">*</em></label>
  <textarea id="sr-reason" class="sr-reason" placeholder="신청 사유를 입력해 주세요." aria-describedby="sr-reason-e"></textarea><p class="uf-e" id="sr-reason-e" role="alert" hidden></p></div>`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: save }],
    });
    const capEl = $('#sr-capacity', m.el), chips = $$('.chip-b', m.el), bar = $('#sr-bar', m.el);
    bar.style.setProperty('--usedf', STORAGE.used / STORAGE.total);
    const press = (key) => chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gb === key)));
    const preview = () => {
      const v = Number(capEl.value), ok = capEl.value !== '' && v >= CAP_MIN && v <= CAP_MAX;
      bar.style.setProperty('--base', ok ? `${(STORAGE.total / (STORAGE.total + v) * 100).toFixed(2)}%` : '100%');
      $('.g', bar).hidden = !ok; $('.z', bar).hidden = !ok; if (ok) $('#sr-after', bar).textContent = `${fmt(STORAGE.total + v)} GB`;
    };
    chips.forEach((b) => b.addEventListener('click', () => {
      press(b.dataset.gb);
      if (b.dataset.gb === 'custom') { capEl.value = ''; capEl.focus(); } else capEl.value = b.dataset.gb;
      setErr(capEl, ''); preview();
    }));
    capEl.addEventListener('input', () => {                                           // 직접 입력하면 같은 값의 프리셋이 켜지고, 아니면 `직접 입력`
      const v = Number(capEl.value), hit = PRESETS.find((g) => g === v);
      press(capEl.value === '' ? '' : hit ? String(hit) : 'custom'); preview();
    });
    clearOnInput(m.el); onEnter(m.el, save); setOpen('storage');
    return m;
  }

  /* ══ 브랜드 심볼 ══════════════════════════════════════════════════════ */
  function openBrand() {
    let cur = loadSymbol();
    let draft = cur ? { ...cur } : { src: '', w: SYMBOL_DEFAULT_W }, picked = false;
    const m = openModal({
      title: '브랜드 심볼 수정', tag: '시연', width: 720, onClose: () => setOpen(''),
      content: `<p class="bm-sub">업로드한 이미지가 사이드바 상단 심볼로 교체됩니다.</p>
<div class="bm"><div class="bm-prev"><p class="uf-l">심볼 이미지<em class="req">*</em></p>
  <div class="bm-pair"><figure><div class="railhead is-on" id="bm-cur" aria-hidden="true"></div><figcaption id="bm-cur-c">현재 · 미리보기</figcaption></figure><span class="bm-arrow" id="bm-arrow" hidden aria-hidden="true">→</span>
  <figure id="bm-new-f" hidden><div class="railhead is-on" id="bm-new" role="img" aria-label="새 심볼 미리보기"></div><figcaption class="is-acc">미리보기</figcaption></figure></div></div>
<div class="bm-b"><div class="uf" data-f="bm-file"><div class="bm-file"><button type="button" class="btn-br" id="bm-upload-btn" aria-describedby="bm-file-e bm-file-h">${ic('up', 15)}파일 업로드</button><span class="bm-file-n" id="bm-file-name" aria-live="polite">선택된 파일 없음</span></div>
  <input type="file" id="bm-file" accept=".png,.svg,image/png,image/svg+xml" hidden>
  <p class="uf-h" id="bm-file-h" style="margin-top:10px">${MSG.fileHint}</p><p class="uf-e" id="bm-file-e" role="alert" style="margin-top:10px" hidden></p></div>
  <p class="uf-l bm-w"><label for="bm-width">가로 크기</label><b class="d" id="bm-width-val"></b><span class="mic">px</span></p>
  <div class="slider" id="bm-slider"><input type="range" id="bm-width" min="${SYMBOL_MIN}" max="${SYMBOL_MAX}" step="1"><i class="slider-v"></i><i class="slider-k"></i><span class="n a">16px</span><span class="n b">50px</span></div>
  <p class="uf-h">사이드바에 표시되는 가로 크기를 최대 50px까지 조정할 수 있습니다.</p></div></div>`,
      actions: [],
    });
    /* 작업 띠는 초기화(왼쪽) + 취소 · 저장 — openModal 의 actions 는 오른쪽 정렬뿐이라 직접 단다 */
    const foot = document.createElement('footer'); foot.className = 'modal-f';
    foot.innerHTML = '<span class="m-left"><button type="button" class="btn-br" id="bm-reset">초기화</button><span class="mic">기본 심볼 · 기본 크기</span></span><button type="button" class="btn-br" id="bm-cancel">취소</button><button type="button" class="btn" id="bm-save">저장</button>';
    m.el.append(foot);
    const fileEl = $('#bm-file', m.el), nameEl = $('#bm-file-name', m.el), fileField = fileEl.closest('.uf'), errEl = $('#bm-file-e', m.el);
    const fileErr = (t) => { fileField.classList.toggle('is-error', !!t); errEl.hidden = !t; errEl.textContent = t || ''; };
    const draw = () => {
      $('#bm-cur', m.el).innerHTML = railHead(cur); $('#bm-cur', m.el).toggleAttribute('data-sym', !!cur);
      const showNew = picked || (cur && draft.w !== cur.w);
      $('#bm-cur', m.el).classList.toggle('is-was', !!showNew); $('#bm-cur', m.el).classList.toggle('is-on', !showNew);
      $('#bm-cur-c', m.el).textContent = showNew ? '현재' : '현재 · 미리보기';
      $('#bm-arrow', m.el).hidden = !showNew; $('#bm-new-f', m.el).hidden = !showNew;
      if (showNew) { $('#bm-new', m.el).innerHTML = railHead(draft); $('#bm-new', m.el).toggleAttribute('data-sym', true); }
      $('#bm-width', m.el).value = draft.w; $('#bm-width-val', m.el).textContent = draft.w; $('#bm-width-val', m.el).classList.toggle('is-acc', !!showNew);
      $('#bm-slider', m.el).style.setProperty('--p', pctOf(draft.w));
    };
    $('#bm-upload-btn', m.el).addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const file = fileEl.files && fileEl.files[0]; if (!file) return;
      const ok = /\.(png|svg)$/i.test(file.name) || file.type === 'image/png' || file.type === 'image/svg+xml';
      if (!ok) { fileErr(MSG.fileType); fileEl.value = ''; nameEl.textContent = '선택된 파일 없음'; nameEl.classList.remove('has'); return; }
      fileErr(''); nameEl.textContent = file.name; nameEl.classList.add('has');
      const reader = new FileReader();
      reader.onload = (e) => { draft.src = String(e.target.result); picked = true; draw(); };
      reader.readAsDataURL(file);
    });
    $('#bm-width', m.el).addEventListener('input', (e) => { draft.w = clampW(e.target.value); draw(); });
    $('#bm-reset', m.el).addEventListener('click', () => {                           // 초기화 = 기본 심볼 · 기본 크기로 즉시(모달은 열린 채 — 원본)
      try { localStorage.removeItem(SYMBOL_KEY); } catch { /* 저장소 차단 */ }
      cur = null; draft = { src: '', w: SYMBOL_DEFAULT_W }; picked = false;
      fileEl.value = ''; nameEl.textContent = '선택된 파일 없음'; nameEl.classList.remove('has'); fileErr('');
      applyCustomSymbol(null); renderBrandCard(); draw(); toast(TOAST.brandReset);
    });
    $('#bm-cancel', m.el).addEventListener('click', () => m.close());
    $('#bm-save', m.el).addEventListener('click', () => {
      if (!isSymbolSrc(draft.src)) { fileErr(MSG.fileHint); $('#bm-upload-btn', m.el).focus(); return; }     // 심볼 이미지 * — 파일 없이는 저장하지 않는다
      try { localStorage.setItem(SYMBOL_KEY, JSON.stringify({ src: draft.src, w: draft.w })); } catch { toast(TOAST.brandFail); return; }
      applyCustomSymbol(); renderBrandCard(); m.close('ok'); toast(TOAST.brandSaved);
    });
    draw(); setOpen('brand');
    return m;
  }

  /* ══ 계정 탈퇴 — 추정(원본 mypage.html 에는 탈퇴 UI 가 없다 · 인벤토리 §10 항목) ══ */
  function openWithdraw() {
    const go = () => {
      const inp = $('#wd-input', m.el);
      if (!inp.value) { setErr(inp, MSG.pwdcEmpty); inp.focus(); return false; }
      m.close('ok'); logout('');
      return false;
    };
    const m = openModal({
      title: '계정 탈퇴', tag: '추정', width: 480, role: 'alertdialog', onClose: () => setOpen(''),
      content: `<p class="m-lead"><b>“${esc(state.profile.email)}” 계정을 탈퇴할까요?</b>탈퇴 후에는 복구할 수 없습니다. 회원정보는 회원탈퇴 시까지 보유·이용됩니다.</p>${uf({ id: 'wd-input', label: '현재 비밀번호', type: 'password', ph: '현재 사용 중인 비밀번호', ac: 'current-password' })}`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '탈퇴', kind: 'danger', onClick: go }],
    });
    clearOnInput(m.el); onEnter(m.el, go); setOpen('withdraw');
    return m;
  }

  /* ══ 배선 ═════════════════════════════════════════════════════════════ */
  $('#btn-edit-profile').addEventListener('click', openPwdConfirm);
  $('#btn-change-pwd').addEventListener('click', openPwd);
  $('#btn-request-storage').addEventListener('click', openStorage);
  $('#btn-request-storage-2').addEventListener('click', openStorage);
  $('#btn-brand-edit').addEventListener('click', openBrand);
  $('#btn-withdraw').addEventListener('click', openWithdraw);

  renderProfile(); renderDisk(); renderHistory(); renderBrandCard(); applyCustomSymbol();
  requestAnimationFrame(() => renderPlate());
  let rz = 0; new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => renderPlate()); }).observe($('.my-r'));

  const q = new URLSearchParams(location.search);
  if (q.get('mode') === 'edit') { if (verified()) { prefillEdit(); switchView('edit', { focus: false }); } else openPwdConfirm(); }      // 원본 딥링크 — 본인 확인 경유
  else ({ password: openPwd, storage: openStorage, brand: openBrand, withdraw: openWithdraw }[q.get('open')] || (() => {}))();

  window.__my = { ready: true, state, renderPlate };
}
