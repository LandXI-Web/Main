/* LX 관리자 → '배포' → API 탭 — 외부 연동 API 키(원칙 178 · 184 · 확인 대장 API3 키단위 ⓐ · 1차키 ⓐ).
   키 = 신청 시스템 × 분석 서비스 하나. 기관 공유와 떨어져 있다(공유를 거둬도 키는 그대로). 신청 시스템 묶음마다 서비스 줄.
   키는 'API 안내'의 신청 → '요청 관리 → API 키 신청'에서 승인할 때 만들어지고, LX 내부용은 여기서 바로 만들 수도 있다(외부 기관은 보안성 검토 전 — 막힘).
   키 값은 만들 때 한 번만 보인다. 자세히 = 범위 · 권한 · 원천 · 분석 넓이 한도 · 끝나는 날 · 형식 · 멈춤 · 폐기 · 최근 호출 기록.
   서버: GET /apikeys · POST /apikeys · PATCH /apikeys/{id} · POST /apikeys/{id}/revoke · GET /apikeys/{id}/calls. 숫자는 서버 값(봉투). 아이콘 0. */
import { toast, h, api, nf, drawer } from './kit.js';
import { keyForm, keysOnce } from './apikey-form.js';

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const ymd = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const isoDay = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const join = (...xs) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' · ');
const LV = { on: 'ok', paused: 'warn', expired: 'warn', revoked: '' };
const km = (e) => (val(e) == null ? '—' : `${nf(val(e))}㎢`);

export function apiKeysPane(pane) {
  let D = null, showOld = false;

  async function load() {
    try { D = await api('/apikeys'); } catch (e) { pane.replaceChildren(h('p.rv-empty', { text: e.message || 'API 키를 불러오지 못했습니다' })); return; }
    draw();
  }

  const chip = (k) => h('span.t-chip.ak-st', { dataset: { lv: LV[k.state] || '' }, text: k.state_label });

  function draw() {
    const items = D.items || [];
    const old = (k) => k.state === 'revoked';
    const nOld = items.reduce((n, g) => n + g.keys.filter(old).length, 0);
    const body = [];
    const shown = items.filter((g) => showOld || !g.keys.length || g.keys.some((k) => !old(k)));   // 폐기한 키만 남은 시스템은 '폐기한 키 보기'에서만
    for (const g of shown) {
      const keys = g.keys.filter((k) => showOld || !old(k));
      body.push(h('tr.ak-pair', {}, h('td', { colspan: '5' }, h('b', { text: g.system }), h('span', { text: join(g.kind_label, g.org) }), g.test ? h('em.ak-off', { text: '시험' }) : null),
        h('td.ak-act', {}, h('button.t-btn.t-btn--2.ak-mk', { type: 'button', text: '서비스 더하기', onclick: () => create(g) }))));
      if (!keys.length) body.push(h('tr.ak-none', {}, h('td', { colspan: '6', text: g.keys.length ? '폐기한 키만 있습니다' : '아직 만든 키가 없습니다' })));
      for (const k of keys) {
        body.push(h('tr.ak-row', { tabindex: '0', class: old(k) ? 'is-old' : '', onclick: () => detail(g, k), onkeydown: (e) => { if (e.key === 'Enter') detail(g, k); } },
          h('td', {}, h('span.ak-key', {}, h('b', { text: k.service.name }), h('small', { text: join(k.scope_words.join(' · '), `끝 네 자리 ${k.last4}`, k.test ? '시험' : '') }))),
          h('td', {}, chip(k)), h('td.num', { text: ymd(k.expires_at) }),
          h('td.num', { text: k.last_used_at ? mdhm(k.last_used_at) : '—' }),
          h('td.num', { text: `${nf(val(k.month))}회` }),
          h('td.ak-act', {}, h('span.rv-link', { text: '자세히' }))));
      }
    }
    pane.replaceChildren(h('div.rv-grid', {}, h('section.t-card.rv-card', {},
      h('header.rv-h.rv-h--row', {}, h('div', {}, h('h2', { text: 'API' }),
        h('span.rv-sub', { text: join(`켜진 키 ${nf(val(D.live))}`, `신청 시스템 ${nf(shown.length)}`) })),
        h('div.ak-hd', {}, nOld ? h('label.ak-old', {}, h('input', { type: 'checkbox', checked: showOld, onchange: (e) => { showOld = e.target.checked; draw(); } }), h('span', { text: `폐기한 키 ${nf(nOld)}개 보기` })) : null,
          h('button.t-btn.ak-mk', { type: 'button', text: '키 만들기', onclick: () => create(null) }))),
      h('p.rv-note', { text: '분석 서비스마다 키를 만듭니다. 키를 받은 시스템은 그 서비스의 AI 분석 결과를 범위 · 영상 원천 · 연도로 골라 가져갑니다. 기관 공유와는 따로입니다.' }),
      shown.length ? h('table.rv-tbl.ak-tbl', {}, h('thead', {}, h('tr', {}, ...['서비스 · 범위', '상태', '끝나는 날', '마지막 호출', '이번 달 호출', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...body)) : h('p.rv-empty', { text: '아직 키를 받은 시스템이 없습니다 — API 안내에서 신청이 오면 요청 관리에서 승인합니다' }),
      h('p.rv-note', {}, h('span', { text: '키 신청은 ' }), h('a', { href: '/landxi/v3/ops-core/#/approvals/apikeys', text: '요청 관리 → API 키 신청' }),
        h('span', { text: '에서 승인합니다. 키 값은 만들 때 한 번만 보입니다.' })))));
  }

  /* 키 만들기 — 새 시스템(LX 내부용) 또는 승인한 시스템에 서비스 더하기 */
  function create(g) {
    const kinds = (D.options?.kinds || []).filter((k) => k.id !== 'external');
    const sys = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '예: LX 공간정보 업무 시스템', 'aria-label': '쓰는 시스템 이름' });
    const org = h('input.t-input', { type: 'text', maxlength: '80', placeholder: '예: 공간정보처', 'aria-label': '기관 · 부서' });
    const kind = h('select.t-input', { 'aria-label': '신청 구분' }, ...kinds.map((k) => h('option', { value: k.id, text: k.label })));
    const box = h('div.ak-kfw');
    let F = null;
    const paintF = () => { F = keyForm({ options: D.options || {}, defaults: D.defaults || {}, kind: g ? g.kind : kind.value }); box.replaceChildren(F.el); };
    kind.onchange = paintF; paintF();
    const note = h('p.rv-need', { role: 'status' });
    const go = h('button.t-btn', { type: 'button', text: '키 만들기' });
    const row = (k, ...v) => h('div.ak-f', {}, h('span.t-label', { text: k }), h('div.ak-fv', {}, ...v));
    const head = g ? h('p.ak-for', {}, h('b', { text: g.system }), h('span', { text: join(g.kind_label, g.org) }))
      : h('div.ak-kf', {}, row('쓰는 시스템', sys), row('기관 · 부서', org), row('신청 구분', kind, h('p.ak-hint', { text: '외부 기관 시스템은 API 안내의 신청으로만 받습니다(보안성 검토 전)' })));
    const form = h('div.ak-form', {}, head, box, note, h('div.ak-acts', {}, go));
    const d = drawer({ title: g ? '서비스 더하기' : '키 만들기', body: form, slot: 'right', width: 560 });
    go.onclick = async () => {
      note.textContent = '';
      if (!g && !sys.value.trim()) { note.textContent = '쓰는 시스템 이름을 적어 주세요'; sys.focus(); return; }
      const b = F.read();
      if (b.error) { note.textContent = b.error; return; }
      go.disabled = true;
      const out = [];
      let aid = g?.id || null;
      try {
        for (const card of b.services) {
          const body = { ...b, card_id: card, ...(aid ? { applicant_id: aid } : { system: sys.value.trim(), org: org.value.trim() || undefined, kind: kind.value }) };
          delete body.services;
          const j = await api('/apikeys', { method: 'POST', body });
          aid = j.applicant?.id || aid;
          out.push(j);
        }
        d.set(keysOnce(out, { who: g?.system || sys.value.trim(), toast, done: () => d.close() }));
        d.title('키를 만들었습니다');
        load();
      } catch (e) {
        note.textContent = e.message || '만들지 못했습니다';
        go.disabled = false;
        if (out.length) { d.set(keysOnce(out, { who: g?.system || sys.value.trim(), toast, done: () => d.close() })); load(); }
      }
    };
    if (!g) setTimeout(() => sys.focus(), 60);
  }

  /* 키 자세히 — 범위 · 권한 · 원천 · 한도 · 끝나는 날 · 형식 · 멈춤/다시 켜기 · 폐기 · 최근 호출 기록 */
  function detail(g, k) {
    const box = h('div.ak-detail');
    const d = drawer({ title: `${g.system} · ${k.service.name}`, body: box, slot: 'right', width: 560 });
    const paintD = async (key) => {
      const live = key.state !== 'revoked';
      const note = h('p.rv-need', { role: 'status' });
      const exp = h('input.t-input', { type: 'date', value: isoDay(key.expires_at), disabled: !live, 'aria-label': '끝나는 날' });
      const fm = (D.options?.formats || []).map((f) => ({ f, box: h('input', { type: 'checkbox', disabled: !live, checked: (key.formats || []).some((x) => x.id === f.id), 'aria-label': f.label }) }));
      const patch = async (body, msg) => {
        note.textContent = '';
        try { const j = await api(`/apikeys/${encodeURIComponent(key.id)}`, { method: 'PATCH', body }); toast(msg); paintD(j.item); load(); }
        catch (e) { note.textContent = e.message || '바꾸지 못했습니다'; }
      };
      const dl = h('dl.rv-dl', {});
      const row = (t, ...v) => dl.append(h('div', {}, h('dt', { text: t }), h('dd', {}, ...v)));
      row('신청 시스템', h('b', { text: g.system }), h('small', { text: join(g.kind_label, g.org) }));
      row('상태', h('span', {}, chip(key)), key.revoked_at ? h('small', { text: join(`${ymd(key.revoked_at)} 폐기`, key.revoke_reason) }) : null);
      row('키', h('b', { text: `끝 네 자리 ${key.last4}` }), h('small', { text: join(`${ymd(key.created_at)} 만듦`, key.created_by, key.test ? '시험 키' : '') }));
      row('범위', h('b', { text: key.scope_words.join(' · ') }));
      row('권한', h('b', { text: key.rights_label }), key.rights === 'read_analyze' ? h('small', { text: '분석 호출은 아직 열리지 않았습니다' }) : null);
      row('영상 원천', h('b', { text: (key.sources || []).map((s) => s.label).join(' · ') }));
      row('분석 넓이 한도', h('b', { text: `한 번 ${km(key.area.once)} · 하루 ${km(key.area.day)} · 한 달 ${km(key.area.month)}` }));
      row('끝나는 날', live ? h('div.ak-inl', {}, exp, h('button.t-btn.t-btn--2', { type: 'button', text: '바꾸기', onclick: () => patch({ expires_at: exp.value }, '끝나는 날을 바꿨습니다') })) : h('b', { text: ymd(key.expires_at) }));
      row('내줄 형식', h('div.ak-inl', {}, h('div.ak-fm', {}, ...fm.map(({ f, box: b }) => h('label', {}, b, h('span', { text: f.label })))),
        live ? h('button.t-btn.t-btn--2', { type: 'button', text: '바꾸기', onclick: () => patch({ formats: fm.filter((x) => x.box.checked).map((x) => x.f.id) }, '내줄 형식을 바꿨습니다') }) : null));
      row('호출 한도', h('b', { text: `1분 ${nf(val(key.per_min))}회 · 하루 ${nf(val(key.per_day))}회` }));
      row('호출', h('b', { text: `오늘 ${nf(val(key.today))}회 · 이번 달 ${nf(val(key.month))}회` }), h('small', { text: key.last_used_at ? `마지막 ${mdhm(key.last_used_at)}` : '아직 부르지 않음' }));
      const acts = [];
      if (live) {
        acts.push(key.state === 'paused'
          ? h('button.t-btn.t-btn--2', { type: 'button', text: '다시 켜기', onclick: () => patch({ paused: false }, '키를 다시 켰습니다') })
          : h('button.t-btn.t-btn--2', { type: 'button', text: '멈춤', onclick: () => patch({ paused: true }, '키를 멈췄습니다 — 이 키의 호출은 모두 거절됩니다') }));
        const why = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '폐기 사유(선택)', 'aria-label': '폐기 사유' });
        const rv = h('button.t-btn.ak-rv', { type: 'button', text: '폐기' });
        rv.onclick = async () => {
          if (rv.dataset.sure !== '1') { rv.dataset.sure = '1'; rv.textContent = '한 번 더 누르면 폐기'; note.textContent = '폐기한 키는 되살리지 않습니다 — 필요하면 새 키를 만듭니다'; return; }
          rv.disabled = true;
          try { const j = await api(`/apikeys/${encodeURIComponent(key.id)}/revoke`, { method: 'POST', body: { reason: why.value.trim() || undefined } }); toast('키를 폐기했습니다'); paintD(j.item); load(); }
          catch (e) { note.textContent = e.message || '폐기하지 못했습니다'; rv.disabled = false; }
        };
        acts.push(why, rv);
      }
      const calls = h('div.ak-calls', {}, h('p.t-label', { text: '최근 호출 기록' }), h('p.rv-empty', { text: '불러오는 중' }));
      box.replaceChildren(...[dl, acts.length ? h('div.ak-acts.ak-acts--row', {}, ...acts) : null, note, calls].filter(Boolean));
      try {
        const c = await api(`/apikeys/${encodeURIComponent(key.id)}/calls?limit=30`);
        const rows = (c.items || []).map((x) => h('tr', { class: x.ok ? '' : 'is-bad' }, h('td.num', { text: mdhm(x.at) }), h('td', { text: join(x.what, x.fmt) }),
          h('td.num', { text: x.rows ? `${nf(val(x.rows))}건` : '' }),
          h('td', { text: x.ok ? '성공' : ({ rate_limited: '한도 넘음', key_paused: '멈춤', not_found: '없음', not_open: '아직 열리지 않음' }[x.code] || '거절') })));
        calls.replaceChildren(h('p.t-label', { text: `최근 호출 기록 · 모두 ${nf(c.total)}건` }),
          rows.length ? h('table.rv-tbl.ak-ctbl', {}, h('tbody', {}, ...rows)) : h('p.rv-empty', { text: '아직 호출 기록이 없습니다' }));
      } catch { calls.replaceChildren(h('p.rv-empty', { text: '호출 기록을 불러오지 못했습니다' })); }
    };
    paintD(k);
    return d;
  }

  return { load };
}
