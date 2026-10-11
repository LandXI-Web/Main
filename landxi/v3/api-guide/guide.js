/* 사이트 'API 안내' — 서비스 목록 · 원천 표(서버 GET /public/api-catalog 한 곳) · 키 신청 창(POST /public/api-applications · 로그인 없이).
   신청 창 칸: 신청 구분 · 기관 · 부서 · 쓰는 시스템 · 담당자 · 전화 · 메일 주소 · 쓰려는 서비스 · 권한 · 범위 · 쓰는 목적 · 호출 서버 주소(선택) · 동의.
   외부 기관 시스템을 고르면 '보안성 검토 뒤 승인' 한 줄(신청은 받는다 — API3-여는순서 ⓐ). 같은 접속 주소 시간당 5번(서버). 아이콘 0. */
import { modal } from '../kit/modal.js';
import { h, api } from '../kit/util.js';

let CAT = null;
const svcEl = document.getElementById('svc');
const srcEl = document.getElementById('src');

async function catalog() {
  if (CAT) return CAT;
  CAT = await api('/public/api-catalog');
  return CAT;
}

catalog().then((c) => {
  svcEl.removeAttribute('aria-busy');
  svcEl.replaceChildren(...(c.services || []).map((s) => h('div.ag-card', {}, h('b', { text: s.name }), h('code.ag-id', { text: s.id }),
    h('div.ag-chips', {}, h('span.ag-chip', { text: '결과 조회' }), h('span.ag-chip.no', { text: '분석 호출 · 아직 열리지 않음' })))));
  srcEl.replaceChildren(...(c.sources || []).map((s) => h('tr', {}, h('td', { text: s.name }), h('td', {}, h('code', { text: s.id })), h('td', { text: s.when }), h('td', { text: s.who }))));
}).catch(() => {
  svcEl.removeAttribute('aria-busy');
  svcEl.replaceChildren(h('p.ag-note', { text: '서비스 목록을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.' }));
});

let seq = 0;
function field(key, label, input, hint) {
  const id = `ag-${key}-${++seq}`;
  input.id = id;
  return h('div.ag-f', { dataset: { f: key } }, h('label', { for: id, text: label }), input, hint ? h('p.ag-hint', { text: hint }) : null);
}
const opts = (name, items, type = 'radio', on = []) => h('div.ag-opts', { role: type === 'radio' ? 'radiogroup' : 'group' },
  ...items.map(([v, t]) => h('label.ag-opt', {}, h('input', { type, name, value: v, checked: on.includes(v) }), h('span', { text: t }))));

async function openApply() {
  let c;
  try { c = await catalog(); } catch { c = { services: [], kinds: [], rights: [] }; }
  const n = ++seq;
  const kind = opts('ag-kind-' + n, (c.kinds || []).map((k) => [k.id, k.label]));
  const hold = h('p.ag-hold', { hidden: true, text: c.external_hold || '' });
  const org = h('input.t-input', { type: 'text', maxlength: '80', placeholder: '예: LX 드론영상 분석 담당', autocomplete: 'organization' });
  const sys = h('input.t-input', { type: 'text', maxlength: '60', placeholder: '예: 랜디에어' });
  const person = h('input.t-input', { type: 'text', maxlength: '40', autocomplete: 'name' });
  const phone = h('input.t-input', { type: 'tel', maxlength: '20', autocomplete: 'tel', inputmode: 'tel' });
  const email = h('input.t-input', { type: 'email', maxlength: '120', autocomplete: 'email', inputmode: 'email' });
  const svcs = opts('ag-svc-' + n, (c.services || []).map((s) => [s.id, s.name]), 'checkbox');
  const rights = opts('ag-rt-' + n, (c.rights || []).map((r) => [r.id, r.label]), 'radio', ['read']);
  const area = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '예: 전국 · 전북특별자치도 · 남원시' });
  const purpose = h('textarea.t-input', { rows: '3', maxlength: '1000', placeholder: '어떤 업무에 결과를 쓰는지 적어 주세요' });
  const ip = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '고정 주소가 있으면 적어 주세요' });
  const trap = h('input.ag-trap', { type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', name: 'website' });
  const ck = h('input', { type: 'checkbox', id: 'ag-ck-' + n });
  const agree = h('div.ag-f', { dataset: { f: 'consent' } }, h('label.ag-agree', { for: ck.id }, ck,
    h('span', { text: '신청 확인과 연락을 위해 담당자 이름 · 전화 · 메일 주소를 받는 데 동의합니다(신청을 마친 뒤 1년 보관)' })));
  const msg = h('p.ag-msg', { role: 'alert', hidden: true });
  const go = h('button.t-btn.ag-go', { type: 'submit', text: '신청하기' });
  kind.addEventListener('change', () => {
    const v = kind.querySelector('input:checked')?.value;
    hold.hidden = v !== 'external';
    const an = rights.querySelector('input[value="read_analyze"]');
    if (an) { an.disabled = v === 'external'; if (an.disabled && an.checked) rights.querySelector('input[value="read"]').checked = true; }
  });
  const form = h('form.ag-form', { novalidate: true },
    h('div.ag-f', { dataset: { f: 'kind' } }, h('p.ag-l', { text: '신청 구분' }), kind, hold),
    h('div.ag-two-f', {}, field('org', '기관 · 부서', org), field('system', '쓰는 시스템 이름', sys)),
    field('person', '담당자', person),
    h('div.ag-two-f', {}, field('phone', '전화', phone), field('email', '메일 주소', email)),
    h('p.ag-hint', { text: '연락받을 전화 · 메일 가운데 하나 이상' }),
    h('div.ag-f', { dataset: { f: 'services' } }, h('p.ag-l', { text: '쓰려는 분석 서비스' }), svcs, h('p.ag-hint', { text: '서비스마다 키가 하나씩 나옵니다' })),
    h('div.ag-f', { dataset: { f: 'rights' } }, h('p.ag-l', { text: '권한' }), rights, h('p.ag-hint', { text: '분석 호출은 아직 열리지 않았습니다. 미리 신청해 두면 열릴 때 같은 키로 씁니다' })),
    field('area', '범위', area), field('purpose', '쓰는 목적', purpose), field('server_ip', '호출하는 서버 주소(선택)', ip),
    trap, agree, msg, go);
  const m = modal({ title: 'API 키 신청', body: form, size: 'lg' });

  const clear = () => { msg.hidden = true; msg.textContent = ''; form.querySelectorAll('.ag-f.bad').forEach((x) => x.classList.remove('bad')); };
  const say = (t, key) => {
    clear(); msg.textContent = t; msg.hidden = false;
    const f = key && form.querySelector(`.ag-f[data-f="${key}"]`);
    if (f) { f.classList.add('bad'); f.querySelector('input,textarea')?.focus(); }
  };
  form.addEventListener('input', clear);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = {
      kind: kind.querySelector('input:checked')?.value || '', org: org.value.trim(), system: sys.value.trim(), person: person.value.trim(),
      phone: phone.value.trim(), email: email.value.trim(), services: [...svcs.querySelectorAll('input:checked')].map((x) => x.value),
      rights: rights.querySelector('input:checked')?.value || 'read', area: area.value.trim(), purpose: purpose.value.trim(),
      server_ip: ip.value.trim(), consent: ck.checked, website: trap.value,
    };
    if (!v.kind) return say('신청 구분을 골라 주세요', 'kind');
    if (!v.system) return say('쓰는 시스템 이름을 적어 주세요', 'system');
    if (!v.person) return say('담당자 이름을 적어 주세요', 'person');
    if (!v.phone && !v.email) return say('연락받을 전화나 메일 주소를 하나 이상 적어 주세요', 'phone');
    if (v.phone && !/^[0-9+][0-9\- ]{6,19}$/.test(v.phone)) return say('전화번호를 확인해 주세요(숫자 · - 만)', 'phone');
    if (v.email && !/^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/.test(v.email)) return say('메일 주소를 확인해 주세요', 'email');
    if (!v.services.length) return say('쓰려는 분석 서비스를 하나 이상 골라 주세요', 'services');
    if (!v.area) return say('쓰려는 범위를 적어 주세요', 'area');
    if (v.purpose.length < 5) return say('쓰는 목적을 5자 이상 적어 주세요', 'purpose');
    if (!v.consent) return say('개인정보 수집에 동의해야 신청할 수 있습니다', 'consent');
    go.disabled = true; go.textContent = '보내는 중';
    try {
      const r = await api('/public/api-applications', { method: 'POST', body: v });
      m.set(h('div.ag-done', {}, h('b', { text: '신청을 받았습니다' }),
        h('p', { text: 'LX 관리자가 확인한 뒤 적어 주신 연락처로 알려 드립니다.' }),
        r?.hold ? h('p.ag-hold', { text: r.hold }) : null,
        h('div.ag-btns', {}, h('button.t-btn', { type: 'button', text: '닫기', onclick: () => m.close() }))));
    } catch (err) {
      go.disabled = false; go.textContent = '신청하기';
      say(err?.message || '지금은 신청할 수 없습니다. 잠시 뒤 다시 해 주세요', err?.detail?.field);
    }
  });
  setTimeout(() => kind.querySelector('input')?.focus(), 60);
  return m;
}

document.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => openApply()));
if (location.hash === '#apply') openApply();
