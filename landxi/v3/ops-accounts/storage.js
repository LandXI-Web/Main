/* 계정 화면 '저장 용량' 탭 하나(용량-1 · 10-09 사용자 확인 '이대로 구현' · 시안 design-r14/lx-staff-board admin · 원칙 138 · 144).
   흩어져 있던 '저장 용량 요청' 탭 · 계정 서랍의 할당 칸을 이 탭 하나로 합친다(기능 그대로 — 서버 S-19 API 재사용).
   맨 위 = 저장 공간 전체 현황(GET /accounts/storage-overview — 자료 보관 드라이브 OS 실측 전체 · 사용 중 · 여유 + 계정 할당 합계 + 계정이 실제 쓴 양)
   → 기본 할당(GET|PUT /accounts/storage-default — 처음 값 50 GB · 관리자가 정함) → 계정별 할당 표(POST /accounts/users/lx/{id}/quota · 비우면 기본 할당)
   + 오른쪽 서랍 = 증량 신청 한 건(GET /accounts/requests?kind=storage · POST /accounts/storage/{id}/decide — 승인 · 거절 · 거절은 사유 필수)
   '승인하면 할당 합계 n — 여유의 n%' 한 줄은 전체 현황 값으로 셈. 숫자는 서버 값만(지어낸 값 0). 아이콘 0 · 말 = 사용량 · 할당 · 증량 신청 · 승인 · 거절.
   mountStorage(card, { mine(): boolean — 지금도 이 탭인가, onChange() — 탭 숫자 다시 }) */
import { h, api } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { empty } from '../kit/empty.js';
import { size, gb, pctWord } from '../kit/me.js';

const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const when = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
/** 큰 크기 — TB 까지(10진 · 서버 · 내 정보와 같은 단위) */
const big = (b) => { const n = Number(b) || 0; return n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : size(n); };
const gbBytes = (g) => (Number(g) || 0) * 1e9;
const pct1 = (x) => (x > 0 && x < 1 ? '1% 미만' : `${Math.round(x)}%`);

export async function mountStorage(card, { mine = () => true, onChange } = {}) {
  let O, U, Q, picked = null;
  try {
    [O, U, Q] = await Promise.all([api('/accounts/storage-overview'), api('/accounts/users?realm=lx'), api('/accounts/requests?kind=storage')]);
  } catch {
    if (!mine()) return;
    card.innerHTML = ''; const er = h('div'); card.append(er); empty(er, { kind: 'error', onRetry: () => mountStorage(card, { mine, onChange }) }); return;
  }
  if (!mine()) return;
  const reload = async () => { await mountStorage(card, { mine, onChange }); onChange?.(); };
  const solo = !!U.solo;
  const users = (U.items || []).filter((u) => u.realm === 'lx' || !u.realm)
    .sort((a, b) => (a.status === 'disabled') - (b.status === 'disabled') || (Number(ev(b.storage?.used)) || 0) - (Number(ev(a.storage?.used)) || 0));
  const reqs = (Q.items || []).filter((r) => r.state === 'pending');
  const byUser = new Map(reqs.map((r) => [r.login, r]));
  const disk = O.disk || {};
  const total = Number(ev(disk.total)) || 0, dUsed = Number(ev(disk.used)) || 0, free = Number(ev(disk.free)) || 0;
  const alloc = Number(ev(O.alloc_gb)) || 0, aUsed = Number(ev(O.used)) || 0, def = ev(O.default_gb);
  const active = users.filter((u) => u.status !== 'disabled');
  const followDef = active.filter((u) => !u.storage?.quota_own).length;

  /* ① 저장 공간 전체 현황 */
  const cell = (v, label, extra) => h('div.acs-cell', {}, h('b.num', { text: v }), h('span', {}, label, extra || null));
  const ov = h('section.acs-ov', { 'aria-label': '저장 공간 전체 현황' },
    h('div.acs-h', {}, h('h2', {}, '저장 공간 전체 현황', h('small', { text: `저장 서버 실측 · ${when(O.at)}` }))),
    h('div.acs-cells', {}, cell(big(total), '전체 저장 공간'), cell(big(dUsed), '사용 중 · 영상 · 결과 포함'), cell(big(free), '여유'),
      cell(gb(alloc), '계정 할당 합계'), cell(size(aUsed), '계정 사용량 합계')),
    h('div.acs-bar', { role: 'img', 'aria-label': `사용 중 ${total ? Math.round(dUsed / total * 1000) / 10 : 0}% · 할당 합계 ${total ? Math.round(gbBytes(alloc) / total * 1000) / 10 : 0}%` },
      h('i', { style: `width:${total ? (dUsed / total * 100).toFixed(2) : 0}%` }),
      h('i.is-alloc', { style: `width:${total ? Math.min(100 - dUsed / total * 100, gbBytes(alloc) / total * 100).toFixed(2) : 0}%` })),
    h('p.acs-s', {}, h('span', { text: `여유 ${big(free)} 가운데 계정 할당 합계는 ${free ? pct1(gbBytes(alloc) / free * 100) : '—'}.` }), ' ',
      h('span', { text: '증량을 승인해도 실제로 쓰기 전까지 여유는 줄지 않습니다.' })));

  /* ② 기본 할당 — 관리자가 정함(처음 값 50 GB · 설정으로 저장) */
  const set = h('div.acs-set');
  const drawSet = () => {
    const edit = h('button.t-btn.t-btn--2', { type: 'button', text: '기본 할당 바꾸기' });
    edit.addEventListener('click', () => {
      const input = h('input.t-input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', 'aria-label': '기본 할당(GB)', value: def !== null && def !== undefined ? String(def) : '' });
      const ok = h('button.t-btn', { type: 'button', text: '저장' });
      const no = h('button.t-btn.t-btn--2', { type: 'button', text: '취소' });
      ok.addEventListener('click', async () => {
        const n = Number(input.value);
        if (!(n > 0)) { toast('기본 할당을 GB 로 적어 주세요'); input.focus(); return; }
        ok.disabled = true;
        try { await api('/accounts/storage-default', { method: 'PUT', body: { quota_gb: n } }); toast('기본 할당을 바꿨습니다'); await reload(); }
        catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); ok.disabled = false; }
      });
      no.addEventListener('click', drawSet);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) ok.click(); if (e.key === 'Escape') drawSet(); });
      set.replaceChildren(h('p.acs-set-l', { text: '기본 할당' }), h('span.acs-gb.acs-gb--lg', {}, input, h('i', { text: 'GB' })),
        h('p.acs-set-s', {}, h('span', { text: `따로 정하지 않은 LX 계정 ${followDef}명에게 적용됩니다` })), h('div.acs-set-do', {}, no, ok));
      input.focus(); input.select();
    });
    const has = def !== null && def !== undefined;
    set.replaceChildren(h('p.acs-set-l', { text: '기본 할당' }),
      h('p.acs-set-v', {}, h('b.num', { text: has ? gb(def).replace(' GB', '') : '없음' }), has ? h('span', { text: 'GB' }) : null),
      h('p.acs-set-s', {}, h('span', { text: `따로 정하지 않은 LX 계정 ${followDef}명에게 적용됩니다.` }), ' ', h('span', { text: '사람마다 다른 값은 아래 표에서 정합니다' })), edit);
  };
  drawSet();

  /* ③ 계정별 할당 표 */
  const rowOf = new Map();
  const tbody = h('tbody');
  for (const u of users) {
    const st = u.storage || {};
    const used = Number(ev(st.used)) || 0, q = ev(st.quota_gb), own = !!st.quota_own;
    const off = u.status === 'disabled';
    const pw = pctWord(used, q);
    const ask = byUser.get(u.login);
    const canEdit = !off && (!u.mine || solo);
    let last;
    if (off) last = h('span.acs-m', { text: '바꿀 수 없음' });
    else if (ask) {
      last = h('button.acs-ask', { type: 'button', text: `증량 신청 ${gb(ev(ask.want_gb))}`, onclick: () => pick(ask) });
    } else if (!canEdit) last = h('span.acs-m', { text: '다른 관리자가 정함' });
    else {
      const input = h('input.t-input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', 'aria-label': `${u.name || u.login} 할당(GB)`,
        value: own && q !== null ? String(q) : '', placeholder: def !== null && def !== undefined ? String(def) : '' });
      const save = h('button.acs-do', { type: 'button', text: '바꾸기', hidden: true });
      const back = own ? h('button.acs-do', { type: 'button', text: '기본으로' }) : null;
      const dirty = () => { save.hidden = input.value.trim() === (own && q !== null ? String(q) : ''); if (back) back.hidden = !save.hidden; };
      input.addEventListener('input', dirty);
      const put = async (val, b) => {
        b.disabled = true;
        try {
          await api(`/accounts/users/lx/${encodeURIComponent(u.id)}/quota`, { method: 'POST', body: { quota_gb: val } });
          toast(val === null ? '기본 할당으로 바꿨습니다' : '할당을 바꿨습니다'); await reload();
        } catch (e) { toast(e.message || '지금은 처리할 수 없습니다'); b.disabled = false; }
      };
      save.addEventListener('click', () => {
        const t = input.value.trim();
        if (t === '') { put(null, save); return; }
        const n = Number(t);
        if (!(n > 0)) { toast('할당을 GB 로 적어 주세요'); input.focus(); return; }
        put(n, save);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !save.hidden) save.click(); });
      back?.addEventListener('click', () => put(null, back));
      last = h('span.acs-q-in', {}, h('span.acs-gb', {}, input, h('i', { text: 'GB' })), save, back);
    }
    const w = pw === null ? 0 : Math.min(100, Math.max(used > 0 ? 1 : 0, Number(pw)));
    const tr = h('tr', { class: off ? 'is-off' : '' },
      h('td.nw', {}, h('b.acc-b', { text: u.name || '—' })),
      h('td', {}, h('span.acc-m', { text: u.login })),
      h('td.nw', { text: u.role_ko || '' }),
      h('td.num.nw', { text: String(Number(ev(st.projects)) || 0) }),
      h('td.num.nw', { text: size(used) }),
      h('td', {}, off ? h('span.acs-m', { text: '—' }) : h('div.acs-q', {},
        h('div.acs-q-t', {}, h('span', { text: q !== null && q !== undefined ? gb(q) : '할당 없음' }), h('small', { text: pw !== null ? `${pw}%` : '' })),
        h('div.k-me-bar', { role: 'img', 'aria-label': pw !== null ? `할당의 ${pw}% 사용` : '할당 없음', class: st.warn ? 'is-warn' : '' }, h('i', { style: `width:${w}%` })))),
      h('td.nw', {}, h('span.acs-own', { text: off ? '사용 중지' : own ? '개별 할당' : '기본 할당', dataset: own && !off ? { own: '' } : {} })),
      h('td.nw', {}, last));
    rowOf.set(u.login, tr);
    tbody.append(tr);
  }
  const tbl = h('div.acs-tbl', {},
    h('div.acs-h', {}, h('h2', {}, '계정별 할당', h('small', { text: `LX 계정 ${active.length} · 증량 신청 ${reqs.length}` }))),
    h('div.k-table-w', {}, h('table.k-table', {},
      h('thead', {}, h('tr', {}, ...[['이름'], ['아이디'], ['역할'], ['프로젝트', 'num'], ['사용량', 'num'], ['할당 · 사용'], ['구분'], ['개별 할당']]
        .map(([t, c]) => h('th', { class: c || '', text: t })))), tbody)),
    h('p.acs-note', {}, h('span', { text: '빈 칸이면 기본 할당, 값을 적으면 그 사람만 개별 할당입니다.' }), ' ', h('span', { text: '할당을 넘어도 막지 않고 알립니다.' })));

  /* ④ 서랍 — 증량 신청 한 건(승인 · 거절) */
  const dr = h('aside.acs-dr', { 'aria-label': '증량 신청' });
  function pick(r) {
    picked = r;
    for (const [login, tr] of rowOf) tr.classList.toggle('is-on', !!r && login === r.login);
    if (!r) {
      dr.replaceChildren(h('h3', { text: '증량 신청' }), h('p.acs-dr-none', { text: '새 증량 신청이 없습니다' }),
        h('p.acs-note', { text: '직원이 내 정보에서 증량 신청을 하면 여기에 보입니다.' }));
      return;
    }
    const st = r.storage || {};
    const used = Number(ev(st.used)) || 0, cur = ev(st.quota_gb), want = Number(ev(r.want_gb)) || 0;
    const pw = pctWord(used, cur);
    const after = alloc - (Number(cur) || 0) + want;
    const kids = [
      h('h3', {}, '증량 신청', reqs.length > 1 ? h('span.acs-n', { text: String(reqs.length) }) : null),
      h('dl.acc-dl', {}, h('dt', { text: '누가' }), h('dd', { text: `${r.name || '—'} · ${r.login}` }),
        h('dt', { text: '언제' }), h('dd', { text: when(r.created_at) }),
        h('dt', { text: '사유' }), h('dd', { text: r.why || '—' }),
        h('dt', { text: '사용량' }), h('dd', { text: `${size(used)}${pw !== null ? ` · 할당의 ${pw}%` : ''}` })),
      h('p.acs-dr-big', {}, h('b.num', { text: cur !== null && cur !== undefined ? gb(cur).replace(' GB', '') : '없음' }), cur !== null && cur !== undefined ? h('span', { text: 'GB' }) : null,
        h('i', { text: '→' }), h('b.num', { text: gb(want).replace(' GB', '') }), h('span', { text: 'GB' })),
      h('p.acs-dr-after', {}, h('span', { text: `승인하면 이 사람만 ${gb(want)} 개별 할당.` }), ' ',
        h('span', { text: `할당 합계 ${gb(Math.round(after * 100) / 100)} — 여유 ${big(free)}의 ${free ? pct1(gbBytes(after) / free * 100) : '—'}.` }), ' ',
        h('span', { text: '신청한 사람에게 알림이 갑니다' }))];
    if (!r.can_decide) kids.push(h('p.acc-mine', { text: '내 계정의 신청은 다른 관리자가 처리합니다.' }));
    else {
      const reason = h('input.t-input.acc-reason', { type: 'text', placeholder: '거절 사유(거절할 때)', 'aria-label': '거절 사유', maxlength: '200' });
      const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
      const ok = h('button.t-btn', { type: 'button', text: '승인' });
      const note = h('p.acc-need', { role: 'status' });
      reason.addEventListener('input', () => { if (reason.value.trim()) { note.textContent = ''; reason.classList.remove('is-need'); } });
      const run = async (decision) => {
        if (decision === 'reject' && !reason.value.trim()) {
          note.textContent = '거절 사유를 적어 주세요'; reason.focus(); reason.classList.remove('is-need'); void reason.offsetWidth; reason.classList.add('is-need'); return;
        }
        ok.disabled = no.disabled = true;
        try {
          await api(`/accounts/storage/${encodeURIComponent(r.id)}/decide`, { method: 'POST', body: { decision, reason: reason.value.trim() } });
          toast(decision === 'approve' ? '승인했습니다 · 할당을 늘렸습니다' : '거절했습니다');
          await reload();
        } catch (e) {
          if (e.code === 'reason_required') note.textContent = '거절 사유를 적어 주세요';
          else toast(e.status && e.message ? e.message : '지금은 처리할 수 없습니다');
          ok.disabled = no.disabled = false;
        }
      };
      no.addEventListener('click', () => run('reject'));
      ok.addEventListener('click', () => run('approve'));
      kids.push(h('div.acc-do', {}, reason, note, h('div.acc-acts', {}, no, ok)));
    }
    const others = reqs.filter((x) => x !== r);
    if (others.length) kids.push(h('div.acs-dr-more', {}, h('p.acs-dr-ml', { text: `다른 증량 신청 ${others.length}` }),
      ...others.map((x) => h('button.acs-dr-o', { type: 'button', onclick: () => pick(x) }, h('b', { text: x.name || x.login }), h('span', { text: `${gb(ev(x.want_gb))} · ${when(x.created_at)}` })))));
    dr.replaceChildren(...kids);
  }

  card.innerHTML = '';
  card.dataset.tab = 'storage';
  card.append(h('div.acs', {}, h('div.acs-l', {}, ov, set, tbl), dr));
  pick(picked && reqs.find((x) => x.id === picked.id) || reqs[0] || null);
}
