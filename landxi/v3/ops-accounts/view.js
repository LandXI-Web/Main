/* 계정 화면 — LX 관리자(ops-accounts · 전부)와 기관 관리자(gov-accounts · 자기 기관만)가 같은 모양으로 쓴다(원칙 43 UI/UX 통일성).
   탭 다섯: 가입 신청 · 비밀번호 재설정 · 계정 · 로그인 실패 · 처리 기록. 목록 → 행을 누르면 오른쪽 서랍(K5) → 승인 · 반려(사유 필수 — 결재함과 같은 모양).
   서버가 정본(server/landxi_api/accounts.py): 관할(기관 관리자 = 자기 기관) · 내 계정 스스로 바꾸기 0 · 누가 처리했는지 기록.
   계정 관리는 각자 범위(원칙 177 · 10-11): LX 관리자 = LX 계정 · LX 로그인 기록만 · 기관 관리자 = 자기 기관 계정 · 로그인 기록 · 부서만(서버가 거른다).
   기관 계정은 LX 관리자 화면에 섞지 않는다 — 기관 한 곳 화면 '사용과 계정'에 요약 숫자만. 옛 아이디는 '사용 중지'(바꾸기 0).
   LX 관리자에게만 탭 둘이 더 있다(기관 관리자 화면에는 없음):
   · 저장 용량(제안 S-19 · 용량-1 · 10-09) — 탭 하나에 전체 현황 · 기본 할당(처음 50 GB) · 계정별 할당 표 · 증량 신청 서랍(승인 · 거절)을 모았다(storage.js).
     예전 '저장 용량 요청' 탭과 계정 서랍의 할당 칸은 이 탭으로 옮김(기능 그대로). 할당을 넘어도 막지 않는다(알리기만).
   · 부서 목록(제안 S-21) — 처음 목록은 LX 누리집 조직도(출처 표시) · 엑셀 · CSV 올리기(미리 보기 → 바꾸기) · 출처에서 다시 불러오기 · 하나 더하기 · 빼기.
     가입 신청 · 내 정보의 부서 칸이 이 목록에서 고른다(목록에 없는 지사 등은 직접 적기).
   mountAccounts(host, { who, scope: 'lx' | 'tenant' }) — host = 셸 판(S.main). 주소 끝 #signup · #reset · #storage · #users · #depts · #fails · #log 로 탭을 바로 연다. */
import { drawer, closeAll } from '../kit/panel.js';
import { table } from '../kit/table.js';
import { empty } from '../kit/empty.js';
import { toast } from '../kit/toast.js';
import { modal } from '../kit/modal.js';
import { h, esc, ymd, api, API, session } from '../kit/util.js';
import { size, gb } from '../kit/me.js';
import { mountStorage } from './storage.js';

const TABS = [
  { id: 'signup', label: '가입 신청', count: 'signup' },
  { id: 'reset', label: '비밀번호 재설정', count: 'reset' },
  { id: 'storage', label: '저장 용량', count: 'storage', lx: true },
  { id: 'users', label: '계정' },
  { id: 'depts', label: '부서', lx: true },
  { id: 'logins', label: '로그인 기록' },
  { id: 'fails', label: '로그인 실패' },
  { id: 'log', label: '처리 기록' },
  { id: 'ops', label: '운영 정보', lx: true },   // 문의 연락처(원칙 170) — 메인 · 도움말 · 로그인 창이 이 값을 읽는다
];
const NONE = { signup: '새 가입 신청이 없습니다', reset: '비밀번호 재설정 요청이 없습니다', users: '계정이 없습니다',
  logins: '로그인 기록이 없습니다', fails: '실패한 로그인이 없습니다', log: '처리 기록이 없습니다' };
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const NEW_ROLE = { lx: 'LX 직원', tenant: '부서 사용자' };
const hm = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
const when = (s) => (s ? `${ymd(s)} ${hm(s)}` : '—');
const orgOf = (x) => [x.org, x.dept].filter(Boolean).join(' · ') || '—';
const stateOf = (u) => (u.status === 'disabled' ? ['사용 중지', 'gap'] : u.status === 'locked' ? ['잠김', 'warn'] : u.temp_locked ? ['10분 잠김', 'warn']
  : u.must_change ? ['새 비밀번호 대기', 'wait'] : ['사용 중', '']);

export function mountAccounts(host, { who, scope = 'lx' } = {}) {
  const LX = scope === 'lx';
  const tabs = TABS.filter((t) => LX || !t.lx);           // 저장 용량 요청 · 부서 목록은 LX 관리자만(LX 계정 일)
  const wrap = h('div.acc-w');
  const root = h('div.acc', {}, wrap);
  host.append(root);
  const bar = h('div.acc-tabs', { role: 'tablist', 'aria-label': '계정' });
  const filter = h('div.acc-filter', { hidden: true });
  const card = h('div.acc-card', { role: 'tabpanel' });
  wrap.append(h('h1.acc-h', { text: '계정' }), bar, filter, card);
  const btn = {};
  for (const t of tabs) {
    const b = h('button.acc-tab', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { tab: t.id } }, h('span', { text: t.label }), t.count ? h('b.acc-n', { hidden: true }) : null);
    b.addEventListener('click', () => { location.hash = '#' + t.id; });
    bar.append(b); btn[t.id] = b;
  }

  let cur = null, T = null, sheet = null, openKey = null, orgSel = null, data = [], solo = false;
  const counts = async () => {
    try {
      const j = await api('/accounts/summary');
      for (const k of ['signup', 'reset', ...(LX ? ['storage'] : [])]) { const n = j.counts?.[k] || 0; const el = btn[k].querySelector('.acc-n'); el.textContent = String(n); el.hidden = !n; }
    } catch { /* 숫자만 빠진다 */ }
  };

  /* 소속 고르기(LX 관리자 · 계정 탭) — 전체 · LX · 기관들 */
  function mountFilter(orgs) {
    if (!LX || orgSel || !orgs.length) return;          // LX 관리자 = LX 계정만(원칙 177) — 서버가 기관 목록을 주지 않으면 소속 고르기도 없다
    orgSel = h('select.t-input.acc-org', { 'aria-label': '소속' }, h('option', { value: '', text: '소속 전체' }), h('option', { value: 'lx', text: 'LX' }),
      ...orgs.map((o) => h('option', { value: 'tenant:' + o.id, text: o.name })));
    orgSel.addEventListener('change', () => load('users'));
    filter.append(h('div.acc-sel', {}, orgSel, h('span.acc-sel__c', { 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="6 9 12 15 18 9"/></svg>' })));
  }

  const COLS = {
    signup: [{ key: 'name', label: '이름', fmt: (v) => `<b class="acc-b">${esc(v)}</b>` }, { key: 'login', label: '메일 주소', fmt: (v) => `<span class="acc-m">${esc(v)}</span>` },
      { key: 'orgd', label: '소속' }, { key: 'created_at', label: '신청일', fmt: (v) => `<span class="num">${esc(ymd(v))}</span>` }],
    reset: [{ key: 'name', label: '이름', fmt: (v) => `<b class="acc-b">${esc(v || '—')}</b>` }, { key: 'login', label: '메일 주소', fmt: (v) => `<span class="acc-m">${esc(v)}</span>` },
      { key: 'orgd', label: '소속' }, { key: 'created_at', label: '요청일', fmt: (v) => `<span class="num">${esc(ymd(v))}</span>` }],
    users: [{ key: 'name', label: '이름', fmt: (v) => `<b class="acc-b">${esc(v || '—')}</b>` }, { key: 'login', label: '아이디', fmt: (v) => `<span class="acc-m">${esc(v)}</span>` },
      { key: 'orgd', label: '소속' }, { key: 'role_ko', label: '역할', fmt: (v) => `<span class="t-chip">${esc(v)}</span>` },
      { key: 'st', label: '상태', fmt: (v, r) => `<span class="t-chip" data-lv="${r.stLv}">${esc(v)}</span>` },
      ...(LX ? [{ key: 'stor', label: '저장 용량', fmt: (v, r) => (r.storage ? `<span class="acc-q${r.storage.warn ? ' is-warn' : ''}">${esc(shortStorage(r.storage))}</span>` : '<span class="acc-q">—</span>') }] : [])],
    /* 로그인 기록(나중 17) — 들어온 입구(Land-XI · LX 관리자 · 기관) + 주소 이름 작게 */
    logins: [{ key: 'at', label: '시각', fmt: (v) => `<span class="num">${esc(when(v))}</span>` },
      { key: 'login', label: '아이디', fmt: (v, r) => `<b class="acc-b">${esc(r.name || '')}</b> <span class="acc-m">${esc(v || '—')}</span>` },
      { key: 'org', label: '소속' }, { key: 'where', label: '입구', fmt: (v, r) => `${esc(v || '—')}${r.host ? ` <span class="acc-m">${esc(r.host)}</span>` : ''}` },
      { key: 'ip', label: '접속 주소', fmt: (v) => `<span class="num">${esc(v)}</span>` }],
    fails: [{ key: 'at', label: '시각', fmt: (v) => `<span class="num">${esc(when(v))}</span>` }, { key: 'login', label: '아이디', fmt: (v) => `<span class="acc-m">${esc(v || '—')}</span>` },
      { key: 'where', label: '입구' }, { key: 'ip', label: '접속 주소', fmt: (v) => `<span class="num">${esc(v)}</span>` }, { key: 'reason_ko', label: '까닭' }],
    log: [{ key: 'at', label: '시각', fmt: (v) => `<span class="num">${esc(when(v))}</span>` }, { key: 'action_ko', label: '한 일', fmt: (v) => `<span class="t-chip">${esc(v)}</span>` },
      { key: 'target', label: '대상', fmt: (v, r) => `<b class="acc-b">${esc(r.name || '')}</b> <span class="acc-m">${esc(r.subject || '')}</span>` }, { key: 'who', label: '처리한 사람' },
      { key: 'reason', label: '사유', fmt: (v) => esc(v || '') }],
  };
  const SORT = { signup: 'created_at', reset: 'created_at', users: 'orgd', logins: 'at', fails: 'at', log: 'at' };
  /* 목록 칸의 저장 용량 — '29.8 MB / 50 GB' · 할당 없으면 '29.8 MB · 할당 없음'(바꾸기는 '저장 용량' 탭) */
  const shortStorage = (st) => { const q = ev(st?.quota_gb); return q !== null && q !== undefined ? `${size(ev(st.used))} / ${gb(q)}` : `${size(ev(st.used))} · 할당 없음`; };

  async function load(tab) {
    const mine = tab;
    card.innerHTML = ''; T = null;
    delete card.dataset.tab;
    const wait = h('div'); card.append(wait); empty(wait, { kind: 'loading' });
    if (tab === 'depts') { await loadDepts(mine); return; }
    if (tab === 'storage') { await mountStorage(card, { mine: () => cur === mine, onChange: counts }); return; }
    if (tab === 'ops') { await loadOps(mine); return; }
    let rows = [];
    try {
      if (tab === 'signup' || tab === 'reset') rows = (await api(`/accounts/requests?kind=${tab}`)).items || [];
      else if (tab === 'users') {
        const v = orgSel?.value || '';
        const q = v === 'lx' ? '?realm=lx' : v.startsWith('tenant:') ? '?realm=tenant&tenant_id=' + encodeURIComponent(v.slice(7)) : '';
        const j = await api('/accounts/users' + q);
        mountFilter(j.orgs || []);
        solo = !!j.solo;
        rows = j.items || [];
      } else if (tab === 'fails') rows = (await api('/accounts/failures')).items || [];
      else if (tab === 'logins') rows = (await api('/accounts/logins')).items || [];
      else rows = (await api('/accounts/log')).items || [];
    } catch (e) {
      if (cur !== mine) return;
      card.innerHTML = ''; const er = h('div'); card.append(er);
      empty(er, { kind: 'error', onRetry: () => load(tab) });
      return;
    }
    if (cur !== mine) return;
    data = rows.map((r, i) => ({ ...r, key: `${tab}:${r.id || i}`, orgd: orgOf(r), where: r.site_ko, target: `${r.name || ''} ${r.subject || ''}`,
      ...(tab === 'users' ? { st: stateOf(r)[0], stLv: stateOf(r)[1] } : {}) }));
    card.innerHTML = '';
    if (!data.length) { const e = h('div'); card.append(e); empty(e, { kind: 'first', title: NONE[tab] }); return; }
    const tw = h('div.acc-tbl'); card.append(tw);
    const click = tab === 'signup' || tab === 'reset' || tab === 'users';
    T = table(tw, { cols: COLS[tab], rows: data, sort: SORT[tab], dir: tab === 'users' ? 'asc' : 'desc', onRow: click ? openRow : null });
    card.dataset.tab = tab;
    mark();
  }
  const mark = () => card.querySelectorAll('tbody tr').forEach((tr, i) => tr.classList.toggle('is-on', card.querySelector('.acc-tbl')?._vis?.[i]?.key === openKey));

  /* ── 서랍 — 한 건 ── */
  const dl = (pairs) => { const d = h('dl.acc-dl'); for (const [k, v] of pairs) if (v) d.append(h('dt', { text: k }), h('dd', { text: v })); return d; };
  function acts(onReject, okLabel, onOk) {
    const reason = h('input.t-input.acc-reason', { type: 'text', placeholder: '사유(거절할 때는 꼭 적습니다)', 'aria-label': '사유', maxlength: '200' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
    const ok = h('button.t-btn', { type: 'button', text: okLabel });
    const note = h('p.acc-need', { role: 'status' });
    const need = (text) => { note.textContent = text; reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); };
    reason.addEventListener('input', () => { if (reason.value.trim()) { note.textContent = ''; reason.classList.remove('is-need'); } });
    const run = async (fn, isReject) => {
      if (isReject && !reason.value.trim()) { need('거절 사유를 적어 주세요'); return; }
      note.textContent = ''; ok.disabled = no.disabled = true;
      try { await fn(reason.value.trim()); }
      catch (e) {
        if (e.code === 'reason_required') need('거절 사유를 적어 주세요');
        else toast(e.status && e.message ? e.message : '지금은 처리할 수 없습니다');
        ok.disabled = no.disabled = false;
      }
    };
    no.addEventListener('click', () => run(onReject, true));
    ok.addEventListener('click', () => run(onOk, false));
    return h('div.acc-do', {}, reason, note, h('div.acc-acts', {}, no, ok));
  }
  function tempBox(tp, locked) {
    const copy = h('button.t-btn.t-btn--2.acc-copy', { type: 'button', text: '복사' });
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(tp); toast('복사했습니다'); } catch { toast('복사하지 못했습니다. 직접 적어 주세요'); } });
    return h('div.acc-temp', { role: 'status' },
      h('p.t-label', { text: '임시 비밀번호' }),
      h('div.acc-temp__row', {}, h('b.acc-temp__v', { text: tp }), copy),
      h('p.acc-temp__s', { html: '지금 한 번만 보입니다.<br>사용자에게 직접 전해 주세요.<br>하루 안에 들어와 새 비밀번호를 정합니다.' }),
      locked ? h('p.acc-temp__w', { text: '잠긴 계정입니다. 잠금을 풀어야 들어올 수 있습니다.' }) : null);
  }
  const done = async (msg) => { toast(msg); sheet?.close(true); openKey = null; await Promise.all([load(cur), counts()]); };

  function openRow(item) {
    openKey = item.key; mark();
    const body = h('div.acc-sheet');
    const title = item.name || item.login;
    if (cur === 'signup' && item.can_decide === false) {          // LX 관리자가 보는 기관 가입 신청 — 보기만(원칙 72)
      body.append(dl([['메일 주소', item.login], ['소속', item.org], ['부서', item.dept], ['신청일', when(item.created_at)], ['개인정보 동의', when(item.consent_at)]]),
        h('p.acc-mine', { text: '기관 가입 신청은 그 기관 관리자가 승인합니다.' }));
    } else if (cur === 'signup') {
      body.append(dl([['메일 주소', item.login], ['소속', item.org], ['부서', item.dept], ['신청일', when(item.created_at)], ['개인정보 동의', when(item.consent_at)]]),
        h('p.acc-help', { text: `승인하면 ${NEW_ROLE[item.realm]} 계정이 열립니다.` }),
        acts(async (reason) => { await api(`/accounts/signup/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'reject', reason } }); await done('거절했습니다'); },
          '승인', async (reason) => { await api(`/accounts/signup/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'approve', reason } }); await done('승인했습니다'); }));
    } else if (cur === 'reset') {
      body.append(dl([['메일 주소', item.login], ['소속', item.org], ['역할', item.role_ko], ['최근 로그인', item.last_login ? when(item.last_login) : '없음'], ['요청일', when(item.created_at)]]));
      if (item.mine) body.append(h('p.acc-mine', { text: '내 계정의 요청은 다른 관리자가 처리합니다.' }));
      else {
        body.append(h('p.acc-help', { html: '본인인지 확인한 뒤 임시 비밀번호를 만듭니다.<br>사용자에게 직접 전해 주세요.' }),
          acts(async (reason) => { await api(`/accounts/reset/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'reject', reason } }); await done('거절했습니다'); },
            '임시 비밀번호 만들기', async () => {
              const j = await api(`/accounts/reset/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'issue' } });
              body.replaceChildren(dl([['메일 주소', item.login], ['소속', item.org]]), tempBox(j.temp_password, j.locked));
              toast('임시 비밀번호를 만들었습니다'); counts(); load(cur);
            }));
      }
    } else if (cur === 'users') {
      const [st] = stateOf(item);
      body.append(dl([['아이디', item.login], ['소속', item.org], ['부서', item.dept], ['역할', item.role_ko], ['상태', st],
        ['최근 로그인', item.last_login ? when(item.last_login) + (item.last_login_where && item.last_login_where !== '—' ? ` · ${item.last_login_where}` : '') : '없음'], ['만든 날', item.created_at ? ymd(item.created_at) : '']]));
      if (item.dept_listed === false) body.append(h('p.acc-help', {}, h('span', { text: '부서 이름이 부서 목록에 없습니다(지사 등).' }), ' ', h('span', { text: '본인이 내 정보에서 고릅니다.' })));
      if (item.status === 'disabled') body.append(h('p.acc-mine', { text: '사용 중지된 계정입니다. 메일 아이디 계정으로 옮겼습니다.' }));
      else if (item.mine) {
        body.append(h('p.acc-mine', { text: '내 계정은 다른 관리자가 바꿉니다.' }));
        if (LX && item.realm === 'lx' && solo) body.append(h('div.acc-user', {}, quotaLink(item)));     // 관리자 계정이 하나뿐이면 내 할당은 스스로 — '저장 용량' 탭에서
      } else body.append(userActs(item, body));
    }
    sheet = drawer({ title, body, host, slot: 'account', onClose: () => { openKey = null; mark(); } });
  }

  function userActs(u, body) {
    const path = `/accounts/users/${u.realm}/${encodeURIComponent(u.id)}`;
    const out = h('div.acc-user');
    // 역할
    const roles = (ROLES[u.realm] || []);
    const sel = h('select.t-input.acc-role', { 'aria-label': '역할' }, ...roles.map((r) => h('option', { value: r.id, text: r.label })));
    sel.value = u.role;
    const setRole = h('button.t-btn.t-btn--2', { type: 'button', text: '역할 바꾸기' });
    setRole.addEventListener('click', async () => {
      if (sel.value === u.role) { toast('지금과 같은 역할입니다'); return; }
      setRole.disabled = true;
      try { await api(path + '/role', { method: 'POST', body: { role: sel.value } }); await done('역할을 바꿨습니다'); }
      catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); setRole.disabled = false; }
    });
    // 잠금 · 풀기
    const held = u.status === 'locked' || u.temp_locked;
    const lock = h('button.t-btn.t-btn--2', { type: 'button', text: held ? '잠금 풀기' : '잠그기' });
    lock.addEventListener('click', async () => {
      lock.disabled = true;
      try { await api(path + '/lock', { method: 'POST', body: { locked: !held } }); await done(held ? '잠금을 풀었습니다' : '잠갔습니다'); }
      catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); lock.disabled = false; }
    });
    // 임시 비밀번호
    const temp = h('button.t-btn.t-btn--2', { type: 'button', text: '임시 비밀번호 만들기' });
    temp.addEventListener('click', async () => {
      temp.disabled = true;
      try {
        const j = await api(path + '/temp-password', { method: 'POST', body: {} });
        body.replaceChildren(dl([['아이디', u.login], ['소속', u.org]]), tempBox(j.temp_password, j.locked));
        toast('임시 비밀번호를 만들었습니다'); load(cur);
      } catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); temp.disabled = false; }
    });
    /* 볼 수 있는 서비스(기관 관리자 · 부서 사용자만 — 확인 대장 18차 N-1 ⓐ 부서 배정 = 계정 화면 · 원칙 38) — 우리 공간의 배정과 같은 기록 */
    const see = !LX && u.realm === 'tenant' && u.role === 'viewer' ? h('div.acc-row.acc-see', {}, h('p.t-label', { text: '볼 수 있는 서비스' }), h('p.acc-help', { text: '고른 서비스만 이 사람의 내 서비스에 보입니다.' })) : null;
    if (see) (async () => {
      let j;
      try { j = await api('/spaces/me/assign'); } catch { see.append(h('p.acc-help', { text: '지금은 불러올 수 없습니다' })); return; }
      const mine = new Set((j.users || []).find((x) => x.id === u.id)?.cards || []);
      const boxes = (j.services || []).map((s) => { const cb = h('input', { type: 'checkbox', value: s.card, checked: mine.has(s.card) }); return { cb, el: h('label.acc-ck', {}, cb, h('span', { text: s.name })) }; });
      const save = h('button.t-btn.t-btn--2', { type: 'button', text: '저장' });
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { await api(`/spaces/me/assign/${encodeURIComponent(u.id)}`, { method: 'PUT', body: { cards: boxes.filter((b) => b.cb.checked).map((b) => b.cb.value) } }); toast('볼 수 있는 서비스를 저장했습니다'); }
        catch (e) { toast(e.message || '지금은 저장할 수 없습니다'); }
        save.disabled = false;
      });
      see.append(boxes.length ? h('div.acc-cks', {}, ...boxes.map((b) => b.el)) : h('p.acc-help', { text: '우리 기관이 받은 서비스가 아직 없습니다' }), boxes.length ? save : null);
    })();
    out.append(
      h('div.acc-row', {}, h('p.t-label', { text: '역할' }), h('div.acc-inline', {}, h('div.acc-sel', {}, sel, h('span.acc-sel__c', { 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="6 9 12 15 18 9"/></svg>' })), setRole)),
      ...(see ? [see] : []),
      h('div.acc-row', {}, h('p.t-label', { text: '잠금' }), h('p.acc-help', { text: u.temp_locked && u.status !== 'locked' ? '비밀번호를 여러 번 틀려 10분 동안 잠겼습니다.' : held ? '잠긴 동안은 들어올 수 없습니다.' : '잠그면 바로 로그아웃되고 들어올 수 없습니다.' }), lock),
      h('div.acc-row', {}, h('p.t-label', { text: '비밀번호' }), h('p.acc-help', { text: '사용자는 임시 비밀번호로 들어와 새 비밀번호를 정합니다.' }), temp),
      ...(LX && u.realm === 'lx' && u.storage ? [quotaLink(u)] : []));       // 저장 용량 할당(S-19 · LX 계정만) — '저장 용량' 탭 하나에서 정한다(용량-1)
    return out;
  }

  /* 저장 용량 할당 — 지금 값 한 줄 + '저장 용량' 탭으로(바꾸기 · 증량 신청 승인은 그 탭 하나 — 용량-1) */
  function quotaLink(u) {
    const go = h('button.t-btn.t-btn--2', { type: 'button', text: '저장 용량 탭에서 바꾸기' });
    go.addEventListener('click', () => { closeAll(); location.hash = '#storage'; });
    return h('div.acc-row', {}, h('p.t-label', { text: '저장 용량' }),
      u?.storage ? h('p.acc-help', { text: shortStorage(u.storage) + (u.storage.quota_own ? ' · 개별 할당' : ' · 기본 할당') }) : null, go);
  }

  /* ── 운영 정보(원칙 170) — 문의 연락처 전화 · 메일. 메인 '문의하기' · 맨 아래 · 도움말 '문의' · 로그인 창이 이 값을 읽는다 ── */
  async function loadOps(mine) {
    let j;
    try { j = await api('/accounts/contact'); } catch {
      if (cur !== mine) return;
      card.innerHTML = ''; const er = h('div'); card.append(er); empty(er, { kind: 'error', onRetry: () => load('ops') }); return;
    }
    if (cur !== mine) return;
    card.innerHTML = '';
    card.dataset.tab = 'ops';
    const tel = h('input.t-input', { type: 'tel', name: 'tel', value: j.tel, maxlength: '20', 'aria-label': '문의 전화', autocomplete: 'off' });
    const mail = h('input.t-input', { type: 'email', name: 'mail', value: j.mail, maxlength: '120', 'aria-label': '문의 메일', autocomplete: 'off' });
    const save = h('button.t-btn', { type: 'button', text: '저장', disabled: true });
    const note = h('p.acc-need', { role: 'status' });
    const dirty = () => { save.disabled = tel.value.trim() === j.tel && mail.value.trim() === j.mail; };
    tel.addEventListener('input', dirty); mail.addEventListener('input', dirty);
    save.addEventListener('click', async () => {
      save.disabled = true; note.textContent = '';
      try { await api('/accounts/contact', { method: 'PUT', body: { tel: tel.value.trim(), mail: mail.value.trim() } }); toast('문의 연락처를 바꿨습니다'); load('ops'); }
      catch (e) { note.textContent = e.message || '지금은 저장할 수 없습니다'; save.disabled = false; }
    });
    const last = j.updated_at ? `마지막 바꿈 ${when(j.updated_at)}${j.updated_name ? ` · ${j.updated_name}` : ''}` : '처음 값 그대로입니다';
    card.append(h('div.acc-tbl.acc-ops', {},
      h('div.acc-dp-h', {}, h('div', {}, h('p.acc-dp-t', { text: '문의 연락처' }), h('p.acc-dp-s', {}, h('span', { text: last })))),
      h('p.acc-help', {}, h('span', { text: '메인 문의하기 · 맨 아래 · 도움말 문의 · 로그인 창에 보입니다.' }), ' ', h('span', { text: '바꾸면 바로 보이고 처리 기록에 남습니다.' })),
      h('div.acc-ops-f', {}, h('label.acc-ops-r', {}, h('span.t-label', { text: '전화' }), tel), h('label.acc-ops-r', {}, h('span.t-label', { text: '메일' }), mail)),
      note, h('div.acc-acts', {}, save)));
  }

  /* ── 부서 목록(S-21) — 출처 · 올리기(미리 보기 → 바꾸기) · 다시 불러오기 · 더하기 · 빼기 · 목록에 없는 부서를 쓰는 계정 ── */
  async function loadDepts(mine) {
    let j;
    try { j = await api('/accounts/depts'); } catch {
      if (cur !== mine) return;
      card.innerHTML = ''; const er = h('div'); card.append(er); empty(er, { kind: 'error', onRetry: () => load('depts') }); return;
    }
    if (cur !== mine) return;
    card.innerHTML = '';
    card.dataset.tab = 'depts';
    const rows = j.rows || [];
    const find = h('input.t-input.acc-dp-find', { type: 'search', placeholder: '부서 찾기', 'aria-label': '부서 찾기', autocomplete: 'off' });
    const list = h('ul.acc-dp-list');
    const pickIn = h('input', { type: 'file', accept: '.xlsx,.csv', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    const up = h('button.t-btn.t-btn--2', { type: 'button', text: '엑셀 · CSV 올리기' });
    const re = h('button.t-btn.t-btn--2', { type: 'button', text: '출처에서 다시 불러오기' });
    const addName = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '부서 이름', 'aria-label': '더할 부서 이름', autocomplete: 'off' });
    const addUp = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '상위(선택)', 'aria-label': '상위 부서(선택)', autocomplete: 'off' });
    const add = h('button.t-btn', { type: 'button', text: '더하기' });
    const key = (s) => String(s || '').replace(/[›>\s]/g, '').toLowerCase();
    const drawList = () => {
      const k = key(find.value);
      const vis = rows.filter((r) => !k || key(r.label).includes(k));
      list.replaceChildren(...(vis.length ? vis.map((r) => {
        const parts = r.label.split(' › ');
        const rm = h('button.acc-dp-rm', { type: 'button', text: '빼기', 'aria-label': `${r.label} 빼기` });
        rm.addEventListener('click', () => removeDept(r));
        return h('li', {}, h('span.acc-dp-n', {}, parts.length > 1 ? h('small', { text: parts.slice(0, -1).join(' › ') + ' › ' }) : null, h('b', { text: parts[parts.length - 1] })),
          r.unit ? h('span.t-chip', { text: r.unit }) : null, rm);
      }) : [h('li.acc-dp-none', { text: rows.length ? '찾는 부서가 없습니다' : '부서 목록이 비어 있습니다. 부서 칸은 직접 적습니다' })]));
    };
    find.addEventListener('input', drawList);
    up.addEventListener('click', () => pickIn.click());
    pickIn.addEventListener('change', () => { const f = pickIn.files?.[0]; pickIn.value = ''; if (f) previewUpload(f); });
    re.addEventListener('click', () => confirmBox('출처에서 다시 불러오기', [`${j.source ? `출처(${j.source})` : '출처'}에서 다시 읽어`, '지금 목록을 바꿉니다.', '계정에 적힌 부서 이름은 그대로입니다.'], '다시 불러오기',
      async () => { await api('/accounts/depts/reload', { method: 'POST', body: {} }); toast('다시 불러왔습니다'); load('depts'); }));
    add.addEventListener('click', async () => {
      if (!addName.value.trim()) { addName.focus(); return; }
      add.disabled = true;
      try { await api('/accounts/depts/add', { method: 'POST', body: { name: addName.value.trim(), parent: addUp.value.trim() || null } }); toast('더했습니다'); load('depts'); }
      catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); add.disabled = false; }
    });
    addName.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add.click(); });
    const src = [j.source ? `출처: ${j.source}` : '', j.updated_at ? `마지막 바꿈 ${when(j.updated_at)}${j.updated_by ? ` · ${j.updated_by}` : ''}` : ''].filter(Boolean);
    const off = j.unlisted || [];
    card.append(h('div.acc-tbl.acc-dp', {},
      h('div.acc-dp-h', {}, h('div', {}, h('p.acc-dp-t', {}, 'LX 부서 ', h('b.num', { text: String(ev(j.count) ?? rows.length) }), '개'),
        h('p.acc-dp-s', {}, ...src.map((t) => h('span', { text: t })))), h('div.acc-dp-do', {}, up, re, pickIn)),
      h('p.acc-help', {}, h('span', { text: '가입 신청 · 내 정보의 부서 칸이 이 목록에서 고릅니다.' }), ' ', h('span', { text: '목록에 없는 부서(지사 등)는 직접 적습니다.' })),
      h('div.acc-dp-add', {}, addName, addUp, add),
      find, list,
      off.length ? h('details.acc-dp-off', {}, h('summary', { text: `목록에 없는 부서 이름을 쓰는 계정 ${off.length}` }),
        h('ul', {}, ...off.map((x) => h('li', {}, h('b', { text: x.name || '—' }), ' ', h('span.acc-m', { text: x.login }), ' ', h('span', { text: x.dept }))))) : null));
    drawList();
  }

  function confirmBox(title, lines, okLabel, run) {
    const go = h('button.t-btn', { type: 'button', text: okLabel });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title, body: h('div.acc-cf', {}, h('p.acc-cf-s', {}, ...lines.flatMap((l, i) => (i ? [h('br'), h('span', { text: l })] : [h('span', { text: l })]))),
      h('div.acc-acts', {}, no, go)) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => { go.disabled = true; try { await run(); m.close(true); } catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); go.disabled = false; } });
    return m;
  }
  function removeDept(r) {
    confirmBox('부서 빼기', [`'${r.label}'을(를) 목록에서 뺍니다.`, '이 부서를 적은 계정의 부서 이름은 그대로입니다.'], '빼기',
      async () => { await api('/accounts/depts/remove', { method: 'POST', body: { label: r.label } }); toast('뺐습니다'); load('depts'); });
  }
  async function previewUpload(f) {
    const fd = new FormData(); fd.append('file', f, f.name);
    let j;
    try {
      const s = session.get();
      const r = await fetch(`${API.prefix}/accounts/depts/parse`, { method: 'POST', headers: s ? { authorization: 'Bearer ' + s.token } : {}, body: fd });
      j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message || '');
    } catch (e) {
      const ok = h('button.t-btn', { type: 'button', text: '확인' });
      const m = modal({ title: '이 파일은 읽을 수 없습니다', body: h('div.acc-cf', {}, h('p.acc-cf-s', { text: e.message || '엑셀(xlsx) 또는 CSV 파일을 올려 주세요.' }),
        h('p.acc-help', { text: '첫 열에 부서 이름을 한 줄에 하나씩 적거나, 첫 줄에 상위 · 부서 · 단위 머리글을 둡니다.' }), h('div.acc-acts.acc-acts--1', {}, ok)) });
      ok.addEventListener('click', () => m.close());
      return;
    }
    const skip = Object.values(j.skipped || {}).reduce((a, x) => a + (Number(ev(x)) || 0), 0);
    const labels = j.labels || [];
    const go = h('button.t-btn', { type: 'button', text: '이 목록으로 바꾸기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
    const m = modal({ title: '부서 목록 미리 보기', body: h('div.acc-cf', {},
      h('p.acc-cf-s', {}, h('span', { text: `부서 ${ev(j.count)}개를 읽었습니다` }), skip ? h('span', { text: ` · 빈 칸 · 겹침 ${skip}줄 뺌` }) : null),
      h('ul.acc-dp-pv', {}, ...labels.slice(0, 12).map((l) => h('li', { text: l })), labels.length > 12 ? h('li.acc-dp-more', { text: `외 ${labels.length - 12}개` }) : null),
      h('p.acc-help', {}, h('span', { text: '지금 목록을 이 목록으로 바꿉니다.' }), ' ', h('span', { text: '계정에 적힌 부서 이름은 그대로입니다.' })),
      h('div.acc-acts', {}, no, go)) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      go.disabled = true;
      try { await api('/accounts/depts', { method: 'PUT', body: { rows: j.rows } }); m.close(true); toast('부서 목록을 바꿨습니다'); load('depts'); }
      catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); go.disabled = false; }
    });
  }

  let ROLES = LX ? { lx: [{ id: 'admin', label: 'LX 관리자' }, { id: 'staff', label: 'LX 직원' }, { id: 'sales', label: 'LX 영업' }], tenant: [{ id: 'manager', label: '기관 관리자' }, { id: 'viewer', label: '부서 사용자' }] }
    : { tenant: [{ id: 'manager', label: '기관 관리자' }, { id: 'viewer', label: '부서 사용자' }] };

  function route() {
    const want = (location.hash || '').replace(/^#\/?/, '');
    const tab = tabs.some((t) => t.id === want) ? want : 'signup';
    if (tab === cur) return;
    cur = tab;
    closeAll(); openKey = null;
    for (const t of tabs) btn[t.id].setAttribute('aria-selected', String(t.id === tab));
    filter.hidden = !(LX && tab === 'users');
    wrap.classList.toggle('acc-w--wide', tab === 'storage');      // 저장 용량 탭 — 표 + 서랍 두 단(1440 넓이 고르게 · 원칙 127)
    document.title = `Land-XI · 계정 · ${tabs.find((t) => t.id === tab).label}`;
    load(tab);
  }
  addEventListener('hashchange', route);
  route();
  counts();
  setInterval(() => { if (!document.hidden) counts(); }, 30000);
  return { reload: () => load(cur), counts };
}
