/* LX 관리자 → '배포' → API 탭 — 외부 연동 API 키(원칙 174 · 178 · 179 · 확인 대장 API-형식3 ⓐ · API-공유끔 ⓐ).
   키는 LX 관리자가 만들고 관리한다(기관 관리자 발급 아님). 기관 × 공유된 서비스마다 — 만들기 · 멈춤 · 다시 켜기 · 폐기 · 끝나는 날 · 범위(형식) · 마지막 호출 · 호출 기록.
   키 값은 만들 때 한 번만 보인다(서버에는 한 방향 암호만). 1차는 결과 가져오기만 — 분석 맡기기 · 외부 영상 올리기는 없다.
   서버: GET /apikeys · POST /apikeys · PATCH /apikeys/{id} · POST /apikeys/{id}/revoke · GET /apikeys/{id}/calls. 숫자는 서버 값(봉투). 아이콘 0. */
import { toast, h, api, nf, drawer } from './kit.js';

{ const href = new URL('../apikeys.css', import.meta.url).href;
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href })); }

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const two = (n) => String(n).padStart(2, '0');
const ymd = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
const mdhm = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const isoDay = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const join = (...xs) => xs.filter((x) => x !== null && x !== undefined && x !== '').join(' · ');
const LV = { on: 'ok', paused: 'warn', unshared: 'warn', expired: 'warn', revoked: '' };

export function apiKeysPane(pane) {
  let D = null, showOld = false;

  async function load() {
    try { D = await api('/apikeys'); } catch (e) { pane.replaceChildren(h('p.rv-empty', { text: e.message || 'API 키를 불러오지 못했습니다' })); return; }
    draw();
  }

  const chip = (k) => h('span.t-chip.ak-st', { dataset: { lv: LV[k.state] || '' }, text: k.state_label });
  const keyName = (k) => h('span.ak-key', {}, h('b', { text: k.label }), h('small', { text: join(`끝 네 자리 ${k.last4}`, k.test ? '시험' : '') }));

  function draw() {
    const items = D.items || [];
    const old = (k) => k.state === 'revoked';
    const nOld = items.reduce((n, r) => n + r.keys.filter(old).length, 0);
    const body = [];
    for (const r of items) {
      const keys = r.keys.filter((k) => showOld || !old(k));
      body.push(h('tr.ak-pair', {}, h('td', { colspan: '5' }, h('b', { text: r.org.name }), h('span', { text: r.service.name }),
        r.shared ? null : h('em.ak-off', { text: '공유 거둠 — 이 서비스의 키는 멈춤' })),
        h('td.ak-act', {}, r.shared ? h('button.t-btn.t-btn--2.ak-mk', { type: 'button', text: '키 만들기', onclick: () => create(r) }) : null)));
      if (!keys.length) body.push(h('tr.ak-none', {}, h('td', { colspan: '6', text: r.keys.length ? '폐기한 키만 있습니다' : '아직 만든 키가 없습니다' })));
      for (const k of keys) {
        const tr = h('tr.ak-row', { tabindex: '0', class: old(k) ? 'is-old' : '', onclick: () => detail(r, k), onkeydown: (e) => { if (e.key === 'Enter') detail(r, k); } },
          h('td', {}, keyName(k)), h('td', {}, chip(k)), h('td.num', { text: ymd(k.expires_at) }),
          h('td.num', { text: k.last_used_at ? mdhm(k.last_used_at) : '—' }),
          h('td.num', { text: `${nf(val(k.month))}회` }),
          h('td.ak-act', {}, h('span.rv-link', { text: '자세히' })));
        body.push(tr);
      }
    }
    pane.replaceChildren(h('div.rv-grid', {}, h('section.t-card.rv-card', {},
      h('header.rv-h.rv-h--row', {}, h('div', {}, h('h2', { text: 'API' }),
        h('span.rv-sub', { text: join(`켜진 키 ${nf(val(D.live))}`, `기관 × 서비스 ${nf(items.length)}`) })),
        nOld ? h('label.ak-old', {}, h('input', { type: 'checkbox', checked: showOld, onchange: (e) => { showOld = e.target.checked; draw(); } }), h('span', { text: `폐기한 키 ${nf(nOld)}개 보기` })) : null),
      h('p.rv-note', { text: '기관에 공유된 서비스마다 키를 만듭니다. 키를 받은 기관의 다른 시스템이 그 서비스의 AI 분석 결과(지난 결과 포함)를 GeoJSON · SHP · 필지 엑셀로 가져갑니다.' }),
      items.length ? h('table.rv-tbl.ak-tbl', {}, h('thead', {}, h('tr', {}, ...['쓰는 시스템', '상태', '끝나는 날', '마지막 호출', '이번 달 호출', ''].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...body)) : h('p.rv-empty', { text: '기관에 공유된 서비스가 없습니다 — 기관 공유 탭에서 먼저 공유합니다' }),
      h('p.rv-note', { text: '키 값은 만들 때 한 번만 보입니다. 공유를 거두면 그 서비스의 키는 멈추고, 다시 공유하면 그대로 이어집니다.' }))));
  }

  /* 키 만들기 — 쓰는 시스템 이름 · 끝나는 날 · 범위(형식) · 한도 → 키 값 한 번 보기 */
  function create(r) {
    const df = D.defaults || {};
    const end = new Date(); end.setDate(end.getDate() + (val(df.days) || 365));
    const label = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '예: 남원 영농관리 시스템', 'aria-label': '쓰는 시스템 이름' });
    const exp = h('input.t-input', { type: 'date', value: isoDay(end), 'aria-label': '끝나는 날' });
    const fm = (D.formats || []).map((f) => ({ f, box: h('input', { type: 'checkbox', checked: true, 'aria-label': f.label }) }));
    const pm = h('input.t-input', { type: 'number', min: '1', max: '600', value: String(val(df.per_min) || 60), 'aria-label': '1분 한도' });
    const pd = h('input.t-input', { type: 'number', min: '1', max: '200000', value: String(val(df.per_day) || 20000), 'aria-label': '하루 한도' });
    const note = h('p.rv-need', { role: 'status' });
    const go = h('button.t-btn', { type: 'button', text: '키 만들기' });
    const row = (k, ...v) => h('div.ak-f', {}, h('span.t-label', { text: k }), h('div', {}, ...v));
    const form = h('div.ak-form', {},
      h('p.ak-for', {}, h('b', { text: r.org.name }), h('span', { text: r.service.name })),
      row('쓰는 시스템', label), row('끝나는 날', exp),
      row('내줄 형식', h('div.ak-fm', {}, ...fm.map(({ f, box }) => h('label', {}, box, h('span', { text: f.label }))))),
      row('한도', h('div.ak-lim', {}, h('label', {}, h('span', { text: '1분' }), pm, h('span', { text: '회' })), h('label', {}, h('span', { text: '하루' }), pd, h('span', { text: '회' })))),
      note, h('div.ak-acts', {}, go));
    const d = drawer({ title: '키 만들기', body: form, slot: 'right', width: 480 });
    go.onclick = async () => {
      if (!label.value.trim()) { note.textContent = '쓰는 시스템 이름을 적어 주세요'; label.focus(); return; }
      const formats = fm.filter((x) => x.box.checked).map((x) => x.f.id);
      if (!formats.length) { note.textContent = '내줄 형식을 하나 이상 골라 주세요'; return; }
      go.disabled = true; note.textContent = '';
      try {
        const j = await api('/apikeys', { method: 'POST', body: { tenant_id: r.org.id, card_id: r.service.id, label: label.value.trim(), expires_at: exp.value, formats, per_min: +pm.value, per_day: +pd.value } });
        d.set(once(j, () => { d.close(); load(); }));
        d.title('키를 만들었습니다');
        load();
      } catch (e) { note.textContent = e.message || '만들지 못했습니다'; go.disabled = false; }
    };
    setTimeout(() => label.focus(), 60);
  }

  /* 키 값 한 번 보기 — 닫으면 다시 볼 수 없다 */
  function once(j, done) {
    const v = h('code.ak-val', { text: j.key });
    const copy = h('button.t-btn.t-btn--2', { type: 'button', text: '복사', onclick: async () => {
      try { await navigator.clipboard.writeText(j.key); toast('키를 복사했습니다'); } catch { toast('복사하지 못했습니다 — 직접 골라 복사해 주세요'); }
    } });
    return h('div.ak-once', {},
      h('p.ak-for', {}, h('b', { text: j.org?.name || '' }), h('span', { text: j.service?.name || '' })),
      h('p.ak-warn', { text: '키 값은 지금 한 번만 보입니다. 기관 담당자에게 안전한 길로 전하세요.' }),
      h('div.ak-valbox', {}, v, copy),
      h('dl.rv-dl', {}, ...[['쓰는 시스템', j.item.label], ['끝나는 날', ymd(j.item.expires_at)], ['내줄 형식', (j.item.formats || []).map((f) => f.label).join(' · ')],
        ['한도', `1분 ${nf(val(j.item.per_min))}회 · 하루 ${nf(val(j.item.per_day))}회`]].map(([k, x]) => h('div', {}, h('dt', { text: k }), h('dd', { text: x })))),
      h('div.ak-acts', {}, h('button.t-btn', { type: 'button', text: '닫기', onclick: done })));
  }

  /* 키 자세히 — 상태 · 끝나는 날 · 범위 · 멈춤/다시 켜기 · 폐기 · 최근 호출 기록 */
  function detail(r, k) {
    const box = h('div.ak-detail');
    const d = drawer({ title: k.label, body: box, slot: 'right', width: 560 });
    const paintD = async (key) => {
      const live = key.state !== 'revoked';
      const note = h('p.rv-need', { role: 'status' });
      const exp = h('input.t-input', { type: 'date', value: isoDay(key.expires_at), disabled: !live, 'aria-label': '끝나는 날' });
      const fm = (D.formats || []).map((f) => ({ f, box: h('input', { type: 'checkbox', disabled: !live, checked: (key.formats || []).some((x) => x.id === f.id), 'aria-label': f.label }) }));
      const patch = async (body, msg) => {
        note.textContent = '';
        try { const j = await api(`/apikeys/${encodeURIComponent(key.id)}`, { method: 'PATCH', body }); toast(msg); paintD(j.item); load(); }
        catch (e) { note.textContent = e.message || '바꾸지 못했습니다'; }
      };
      const dl = h('dl.rv-dl', {});
      const row = (t, ...v) => dl.append(h('div', {}, h('dt', { text: t }), h('dd', {}, ...v)));
      row('기관 · 서비스', h('b', { text: `${r.org.name} · ${r.service.name}` }));
      row('상태', h('span', {}, chip(key)), key.revoked_at ? h('small', { text: join(`${ymd(key.revoked_at)} 폐기`, key.revoke_reason) }) : null);
      row('키', h('b', { text: `끝 네 자리 ${key.last4}` }), h('small', { text: join(`${ymd(key.created_at)} 만듦`, key.created_by, key.test ? '시험 키' : '') }));
      row('끝나는 날', live ? h('div.ak-inl', {}, exp, h('button.t-btn.t-btn--2', { type: 'button', text: '바꾸기', onclick: () => patch({ expires_at: exp.value }, '끝나는 날을 바꿨습니다') })) : h('b', { text: ymd(key.expires_at) }));
      row('내줄 형식', h('div.ak-inl', {}, h('div.ak-fm', {}, ...fm.map(({ f, box }) => h('label', {}, box, h('span', { text: f.label })))),
        live ? h('button.t-btn.t-btn--2', { type: 'button', text: '바꾸기', onclick: () => patch({ formats: fm.filter((x) => x.box.checked).map((x) => x.f.id) }, '내줄 형식을 바꿨습니다') }) : null));
      row('한도', h('b', { text: `1분 ${nf(val(key.per_min))}회 · 하루 ${nf(val(key.per_day))}회` }));
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
      box.replaceChildren(dl, acts.length ? h('div.ak-acts.ak-acts--row', {}, ...acts) : null, note, calls);
      try {
        const c = await api(`/apikeys/${encodeURIComponent(key.id)}/calls?limit=30`);
        const rows = (c.items || []).map((x) => h('tr', { class: x.ok ? '' : 'is-bad' }, h('td.num', { text: mdhm(x.at) }), h('td', { text: join(x.what, x.fmt) }),
          h('td.num', { text: x.rows ? `${nf(val(x.rows))}건` : '' }), h('td', { text: x.ok ? '성공' : (x.code === 'rate_limited' ? '한도 넘음' : x.code === 'key_paused' ? '멈춤' : '거절') })));
        calls.replaceChildren(h('p.t-label', { text: `최근 호출 기록 · 모두 ${nf(c.total)}건` }),
          rows.length ? h('table.rv-tbl.ak-ctbl', {}, h('tbody', {}, ...rows)) : h('p.rv-empty', { text: '아직 호출 기록이 없습니다' }));
      } catch { calls.replaceChildren(h('p.rv-empty', { text: '호출 기록을 불러오지 못했습니다' })); }
    };
    paintD(k);
    return d;
  }

  return { load };
}
