/* 계정 화면 — LX 관리자(ops-accounts · 전부)와 기관 관리자(gov-accounts · 자기 기관만)가 같은 모양으로 쓴다(원칙 43 UI/UX 통일성).
   탭 다섯: 가입 신청 · 비밀번호 재설정 · 계정 · 로그인 실패 · 처리 기록. 목록 → 행을 누르면 오른쪽 서랍(K5) → 승인 · 반려(사유 필수 — 결재함과 같은 모양).
   서버가 정본(server/landxi_api/accounts.py): 관할(기관 관리자 = 자기 기관) · 내 계정 스스로 바꾸기 0 · 누가 처리했는지 기록.
   mountAccounts(host, { who, scope: 'lx' | 'tenant' }) — host = 셸 판(S.main). 주소 끝 #signup · #reset · #users · #fails · #log 로 탭을 바로 연다. */
import { drawer, closeAll } from '../kit/panel.js';
import { table } from '../kit/table.js';
import { empty } from '../kit/empty.js';
import { toast } from '../kit/toast.js';
import { h, esc, ymd, api } from '../kit/util.js';

const TABS = [
  { id: 'signup', label: '가입 신청', count: 'signup' },
  { id: 'reset', label: '비밀번호 재설정', count: 'reset' },
  { id: 'users', label: '계정' },
  { id: 'fails', label: '로그인 실패' },
  { id: 'log', label: '처리 기록' },
];
const NONE = { signup: '새 가입 신청이 없습니다', reset: '비밀번호 재설정 요청이 없습니다', users: '계정이 없습니다', fails: '실패한 로그인이 없습니다', log: '처리 기록이 없습니다' };
const NEW_ROLE = { lx: 'LX 직원', tenant: '부서 사용자' };
const hm = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
const when = (s) => (s ? `${ymd(s)} ${hm(s)}` : '—');
const orgOf = (x) => [x.org, x.dept].filter(Boolean).join(' · ') || '—';
const stateOf = (u) => (u.status === 'locked' ? ['잠김', 'warn'] : u.temp_locked ? ['10분 잠김', 'warn'] : u.must_change ? ['새 비밀번호 대기', 'wait'] : ['사용 중', '']);

export function mountAccounts(host, { who, scope = 'lx' } = {}) {
  const LX = scope === 'lx';
  const wrap = h('div.acc-w');
  const root = h('div.acc', {}, wrap);
  host.append(root);
  const bar = h('div.acc-tabs', { role: 'tablist', 'aria-label': '계정' });
  const filter = h('div.acc-filter', { hidden: true });
  const card = h('div.acc-card', { role: 'tabpanel' });
  wrap.append(h('h1.acc-h', { text: '계정' }), bar, filter, card);
  const btn = {};
  for (const t of TABS) {
    const b = h('button.acc-tab', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { tab: t.id } }, h('span', { text: t.label }), t.count ? h('b.acc-n', { hidden: true }) : null);
    b.addEventListener('click', () => { location.hash = '#' + t.id; });
    bar.append(b); btn[t.id] = b;
  }

  let cur = null, T = null, sheet = null, openKey = null, orgSel = null, data = [];
  const counts = async () => {
    try {
      const j = await api('/accounts/summary');
      for (const k of ['signup', 'reset']) { const n = j.counts?.[k] || 0; const el = btn[k].querySelector('.acc-n'); el.textContent = String(n); el.hidden = !n; }
    } catch { /* 숫자만 빠진다 */ }
  };

  /* 소속 고르기(LX 관리자 · 계정 탭) — 전체 · LX · 기관들 */
  function mountFilter(orgs) {
    if (!LX || orgSel) return;
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
      { key: 'st', label: '상태', fmt: (v, r) => `<span class="t-chip" data-lv="${r.stLv}">${esc(v)}</span>` }],
    fails: [{ key: 'at', label: '시각', fmt: (v) => `<span class="num">${esc(when(v))}</span>` }, { key: 'login', label: '아이디', fmt: (v) => `<span class="acc-m">${esc(v || '—')}</span>` },
      { key: 'where', label: '입구' }, { key: 'ip', label: '접속 주소', fmt: (v) => `<span class="num">${esc(v)}</span>` }, { key: 'reason_ko', label: '까닭' }],
    log: [{ key: 'at', label: '시각', fmt: (v) => `<span class="num">${esc(when(v))}</span>` }, { key: 'action_ko', label: '한 일', fmt: (v) => `<span class="t-chip">${esc(v)}</span>` },
      { key: 'target', label: '대상', fmt: (v, r) => `<b class="acc-b">${esc(r.name || '')}</b> <span class="acc-m">${esc(r.subject || '')}</span>` }, { key: 'who', label: '처리한 사람' },
      { key: 'reason', label: '사유', fmt: (v) => esc(v || '') }],
  };
  const SORT = { signup: 'created_at', reset: 'created_at', users: 'orgd', fails: 'at', log: 'at' };

  async function load(tab) {
    const mine = tab;
    card.innerHTML = ''; T = null;
    const wait = h('div'); card.append(wait); empty(wait, { kind: 'loading' });
    let rows = [];
    try {
      if (tab === 'signup' || tab === 'reset') rows = (await api(`/accounts/requests?kind=${tab}`)).items || [];
      else if (tab === 'users') {
        const v = orgSel?.value || '';
        const q = v === 'lx' ? '?realm=lx' : v.startsWith('tenant:') ? '?realm=tenant&tenant_id=' + encodeURIComponent(v.slice(7)) : '';
        const j = await api('/accounts/users' + q);
        mountFilter(j.orgs || []);
        rows = j.items || [];
      } else if (tab === 'fails') rows = (await api('/accounts/failures')).items || [];
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
    const reason = h('input.t-input.acc-reason', { type: 'text', placeholder: '사유(반려할 때는 꼭 적습니다)', 'aria-label': '사유', maxlength: '200' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '반려' });
    const ok = h('button.t-btn', { type: 'button', text: okLabel });
    const note = h('p.acc-need', { role: 'status' });
    const need = (text) => { note.textContent = text; reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); };
    reason.addEventListener('input', () => { if (reason.value.trim()) { note.textContent = ''; reason.classList.remove('is-need'); } });
    const run = async (fn, isReject) => {
      if (isReject && !reason.value.trim()) { need('반려 사유를 적어 주세요'); return; }
      note.textContent = ''; ok.disabled = no.disabled = true;
      try { await fn(reason.value.trim()); }
      catch (e) {
        if (e.code === 'reason_required') need('반려 사유를 적어 주세요');
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
    if (cur === 'signup') {
      body.append(dl([['메일 주소', item.login], ['소속', item.org], ['부서', item.dept], ['신청일', when(item.created_at)], ['개인정보 동의', when(item.consent_at)]]),
        h('p.acc-help', { text: `승인하면 ${NEW_ROLE[item.realm]} 계정이 열립니다.` }),
        acts(async (reason) => { await api(`/accounts/signup/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'reject', reason } }); await done('반려했습니다'); },
          '승인', async (reason) => { await api(`/accounts/signup/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'approve', reason } }); await done('승인했습니다'); }));
    } else if (cur === 'reset') {
      body.append(dl([['메일 주소', item.login], ['소속', item.org], ['역할', item.role_ko], ['최근 로그인', item.last_login ? when(item.last_login) : '없음'], ['요청일', when(item.created_at)]]));
      if (item.mine) body.append(h('p.acc-mine', { text: '내 계정의 요청은 다른 관리자가 처리합니다.' }));
      else {
        body.append(h('p.acc-help', { html: '본인인지 확인한 뒤 임시 비밀번호를 만듭니다.<br>사용자에게 직접 전해 주세요.' }),
          acts(async (reason) => { await api(`/accounts/reset/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'reject', reason } }); await done('반려했습니다'); },
            '임시 비밀번호 만들기', async () => {
              const j = await api(`/accounts/reset/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: { decision: 'issue' } });
              body.replaceChildren(dl([['메일 주소', item.login], ['소속', item.org]]), tempBox(j.temp_password, j.locked));
              toast('임시 비밀번호를 만들었습니다'); counts(); load(cur);
            }));
      }
    } else if (cur === 'users') {
      const [st] = stateOf(item);
      body.append(dl([['아이디', item.login], ['소속', item.org], ['부서', item.dept], ['역할', item.role_ko], ['상태', st],
        ['최근 로그인', item.last_login ? when(item.last_login) : '없음'], ['만든 날', item.created_at ? ymd(item.created_at) : '']]));
      if (item.mine) body.append(h('p.acc-mine', { text: '내 계정은 다른 관리자가 바꿉니다.' }));
      else body.append(userActs(item, body));
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
    out.append(
      h('div.acc-row', {}, h('p.t-label', { text: '역할' }), h('div.acc-inline', {}, h('div.acc-sel', {}, sel, h('span.acc-sel__c', { 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="6 9 12 15 18 9"/></svg>' })), setRole)),
      h('div.acc-row', {}, h('p.t-label', { text: '잠금' }), h('p.acc-help', { text: u.temp_locked && u.status !== 'locked' ? '비밀번호를 여러 번 틀려 10분 동안 잠겼습니다.' : held ? '잠긴 동안은 들어올 수 없습니다.' : '잠그면 바로 로그아웃되고 들어올 수 없습니다.' }), lock),
      h('div.acc-row', {}, h('p.t-label', { text: '비밀번호' }), h('p.acc-help', { text: '사용자는 임시 비밀번호로 들어와 새 비밀번호를 정합니다.' }), temp));
    return out;
  }

  let ROLES = LX ? { lx: [{ id: 'admin', label: 'LX 관리자' }, { id: 'staff', label: 'LX 직원' }, { id: 'sales', label: 'LX 영업' }], tenant: [{ id: 'manager', label: '기관 관리자' }, { id: 'viewer', label: '부서 사용자' }] }
    : { tenant: [{ id: 'manager', label: '기관 관리자' }, { id: 'viewer', label: '부서 사용자' }] };

  function route() {
    const want = (location.hash || '').replace(/^#\/?/, '');
    const tab = TABS.some((t) => t.id === want) ? want : 'signup';
    if (tab === cur) return;
    cur = tab;
    closeAll(); openKey = null;
    for (const t of TABS) btn[t.id].setAttribute('aria-selected', String(t.id === tab));
    filter.hidden = !(LX && tab === 'users');
    document.title = `Land-XI · 계정 · ${TABS.find((t) => t.id === tab).label}`;
    load(tab);
  }
  addEventListener('hashchange', route);
  route();
  counts();
  setInterval(() => { if (!document.hidden) counts(); }, 30000);
  return { reload: () => load(cur), counts };
}
