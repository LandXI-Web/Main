/* 요청 관리 · API 키 신청 탭(외부 연동 API 3차 — 원칙 122 · 178 · 184 · 확인 대장 API3 키단위 ⓐ · 분석승인 ⓐ · 여는순서 ⓐ).
   'API 안내' 페이지의 키 신청이 한 줄로 온다 → 서랍(신청 내용 · 키 설정 칸) → 승인하면 서비스마다 키가 한 번만 보임 · 거절은 사유.
   외부 기관 시스템은 보안성 검토 전이라 승인 단추를 막고 까닭을 한 줄로 보인다(신청은 받아 둔다).
   서버: GET /api-applications · POST /api-applications/{id}/approve · /reject · /mark. 아이콘 0. */
import { drawer, toast, devlog, empty } from '../../kit/index.js';
import { h, api } from '../../kit/util.js';
import { keyForm, keysOnce } from '../../ops-infra/js/apikey-form.js';

const two = (n) => String(n).padStart(2, '0');
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const join = (...xs) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' · ');
const LV = { pending: 'wait', approved: 'ok', rejected: '' };

export function mountApiApply(root, { host, onChanged }) {
  const line = h('p.rq-line', { text: '다른 시스템이 API 안내에서 보낸 키 신청입니다. 승인하면 고른 서비스마다 키가 만들어지고, 키 값은 그때 한 번만 보입니다.' });
  const list = h('div.aa-list', { role: 'list' });
  const none = h('div.rq-none');
  const oldBox = h('label.aa-old', {}, h('input', { type: 'checkbox' }), h('span', { text: '처리한 신청도 보기' }));
  root.append(line, oldBox, list, none);
  let D = null, sheet = null, showOld = false;
  oldBox.querySelector('input').onchange = (e) => { showOld = e.target.checked; paint(); };

  async function load() {
    try { D = await api('/api-applications'); } catch (e) { devlog('api-applications', e.code || e.message); if (!D) { none.hidden = false; empty(none, { kind: 'error', compact: true }); } return D; }
    paint();
    return D;
  }
  const count = () => (D?.items || []).filter((x) => x.state === 'pending' && !x.test).length;

  function paint() {
    const items = (D?.items || []).filter((x) => showOld || x.state === 'pending');
    none.hidden = !!items.length; list.hidden = !items.length;
    if (!items.length) { none.replaceChildren(); empty(none, { kind: 'first', title: showOld ? '받은 API 키 신청이 없습니다' : '기다리는 API 키 신청이 없습니다', char: 'satellite' }); }
    list.replaceChildren(...items.map((x) => h('button.aa-row', { type: 'button', role: 'listitem', dataset: { st: x.state }, onclick: () => open(x) },
      h('span.t-chip.aa-kind', { text: x.kind_label }),
      h('span.aa-main', {}, h('b', { text: x.system }), h('small', { text: join(x.org, x.services.map((s) => s.name).join(' · ')) })),
      h('span.aa-when.num', { text: md(x.at) }),
      h('span.t-chip.aa-st', { dataset: { lv: LV[x.state] || '' }, text: join(x.state_label, x.test ? '시험' : '') }))));
  }

  function open(x) {
    const dl = h('dl.oc-ch');
    const put = (k, v) => { if (v) dl.append(h('dt', { text: k }), h('dd', { text: v })); };
    put('신청 구분', x.kind_label); put('기관 · 부서', x.org); put('쓰는 시스템', x.system);
    put('담당자', join(x.person, x.phone, x.email)); put('쓰려는 서비스', x.services.map((s) => s.name).join(' · '));
    put('범위', x.area); put('권한', x.rights_label); put('쓰는 목적', x.purpose); put('호출하는 서버 주소', x.server_ip);
    put('신청일', md(x.at));
    const body = h('div.oc-sheet', {}, h('p.t-label', { text: '신청 내용' }), dl);
    sheet = drawer({ title: `API 키 신청 · ${x.system}`, body, host, slot: 'approval', width: 600 });
    if (x.state !== 'pending') {
      body.append(h('p.oc-mine', { text: x.state === 'approved' ? `${md(x.decided_at)} 승인 · ${x.decided_by || ''}`.trim() : `${md(x.decided_at)} 거절 — ${x.reason || ''}` }));
      if (x.keys?.length) body.append(h('p.t-label', { text: '만든 키' }), h('ul.aa-keys', {}, ...x.keys.map((k) => h('li', { text: join(k.service.name, k.scope_words.join(' · '), `끝 네 자리 ${k.last4}`, k.state_label) }))));
      return;
    }
    const note = h('p.oc-need', { role: 'status' });
    const reason = h('input.t-input.oc-reason', { type: 'text', placeholder: '거절 사유(거절할 때는 꼭 적습니다)', 'aria-label': '거절 사유', maxlength: '300' });
    const ok = h('button.t-btn', { type: 'button', text: '승인하고 키 만들기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '거절' });
    const testBox = h('label.aa-old', {}, h('input', { type: 'checkbox', checked: x.test }), h('span', { text: '시험 신청으로 표시' }));
    testBox.querySelector('input').onchange = async (e) => {
      try { await api(`/api-applications/${encodeURIComponent(x.id)}/mark`, { method: 'POST', body: { test: e.target.checked } }); x.test = e.target.checked; paint(); onChanged?.(); }
      catch (err) { note.textContent = err.message || '바꾸지 못했습니다'; }
    };
    let F = null;
    if (x.can_approve) {
      F = keyForm({ options: D.options || {}, defaults: D.defaults || {}, kind: x.kind, services: (D.options?.services || []), pick: x.services.map((s) => s.card), rights: x.rights });
      body.append(h('p.t-label', { text: '키 설정' }), F.el);
    } else {
      ok.disabled = true;
      body.append(h('p.aa-hold', { text: x.hold }));
    }
    body.append(testBox, reason, note, h('div.oc-acts', {}, no, ok));
    const busy = (b) => { ok.disabled = b || !x.can_approve; no.disabled = b; };
    ok.onclick = async () => {
      const b = F.read();
      if (b.error) { note.textContent = b.error; return; }
      busy(true); note.textContent = '';
      try {
        const j = await api(`/api-applications/${encodeURIComponent(x.id)}/approve`, { method: 'POST', body: { ...b, test: x.test } });
        sheet.set(keysOnce(j.keys, { who: x.system, toast, done: () => sheet.close() }));
        sheet.title('승인했습니다 — 키 값을 전하세요');
        toast('승인했습니다');
        await load(); onChanged?.();
      } catch (e) { note.textContent = e.message || '승인하지 못했습니다'; busy(false); }
    };
    no.onclick = async () => {
      if (!reason.value.trim()) { note.textContent = '거절 사유를 적어 주세요. 신청한 담당자에게 이 사유로 연락합니다.'; reason.focus(); return; }
      busy(true);
      try {
        await api(`/api-applications/${encodeURIComponent(x.id)}/reject`, { method: 'POST', body: { reason: reason.value.trim() } });
        toast('거절했습니다'); sheet.close(true); await load(); onChanged?.();
      } catch (e) { note.textContent = e.message || '거절하지 못했습니다'; busy(false); }
    };
  }

  return { load, count, close: () => sheet?.close(true) };
}
