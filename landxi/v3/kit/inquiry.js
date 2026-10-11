/* 문의하기 창(10-11 메인 지시 3) — 메인 '문의하기' · 도움말 '문의' · 로그인 창 '문의'가 이 부품 하나를 쓴다.
   칸: 이름 · 소속(선택) · 연락처(메일 또는 전화) · 문의 종류(서비스 도입 · 사용 방법 · 기타) · 내용 · 개인정보 수집 동의 한 줄 → 보내기.
   보낸 문의는 서버(POST /public/inquiries · 로그인 없이)에 남고 LX 관리자가 계정 → '문의' 탭에서 본다. 같은 접속 주소 시간당 몇 번까지만 받는다.
   창 아래에는 운영 정보 연락처(원칙 170 · kit/contact.js 한 출처)를 함께 보인다. 아이콘 없음(원칙 126).
   openInquiry({ kind? }) → modal · bindInquiry(root) → root 안의 [data-inquiry] 를 누르면 창을 연다(tel: 주소로 바로 걸지 않는다). */
import { modal } from './modal.js';
import { h, api } from './util.js';
import { contact, telHref, CONTACT_DEFAULT } from './contact.js';

const CSS = new URL('./inquiry.css', import.meta.url).href;
const KINDS = [['intro', '서비스 도입'], ['howto', '사용 방법'], ['etc', '기타']];
let seq = 0;

function sheet() {
  if (!document.querySelector('link[data-k-iq]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-iq': '' }));
}

function field(key, label, input, hint) {
  const id = `iq-${key}-${++seq}`;
  input.id = id; input.name = key;
  return h('div.iq-f', { dataset: { f: key } }, h('label.iq-l', { for: id, text: label }), input, hint ? h('p.iq-hint', { text: hint }) : null);
}

export function openInquiry({ kind = '' } = {}) {
  sheet();
  const name = h('input.t-input', { type: 'text', maxlength: '40', autocomplete: 'name' });
  const org = h('input.t-input', { type: 'text', maxlength: '80', autocomplete: 'organization' });
  const reach = h('input.t-input', { type: 'text', maxlength: '120', autocomplete: 'email', inputmode: 'email' });
  const kinds = h('div.iq-kinds', { role: 'radiogroup', 'aria-label': '문의 종류' },
    ...KINDS.map(([v, t]) => h('label.iq-k', {}, h('input', { type: 'radio', name: 'iq-kind-' + seq, value: v, ...(v === kind ? { checked: true } : {}) }), h('span', { text: t }))));
  const text = h('textarea.t-input.iq-ta', { rows: '5', maxlength: '2000' });
  const trap = h('input.iq-trap', { type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', name: 'website' });   // 사람에게는 안 보이는 칸
  const ck = h('input.iq-ck', { type: 'checkbox', id: 'iq-ck-' + (++seq) });
  const agree = h('div.iq-f.iq-agree', { dataset: { f: 'consent' } },
    h('label.iq-agree__l', { for: ck.id }, ck, h('span', { text: '답변을 위해 이름 · 소속 · 연락처를 받는 데 동의합니다' })),
    h('details.iq-pv', {}, h('summary', { text: '내용 보기' }),
      h('dl', {},
        h('dt', { text: '수집 항목' }), h('dd', { text: '이름 · 소속(적은 경우) · 메일 또는 전화' }),
        h('dt', { text: '목적' }), h('dd', { text: '문의 확인과 답변' }),
        h('dt', { text: '보관 기간' }), h('dd', { text: '답변을 마친 뒤 1년' }),
        h('dt', { text: '거부' }), h('dd', { text: '동의하지 않을 수 있으나, 그러면 이 창으로 문의를 보낼 수 없습니다' }))));
  const msg = h('p.iq-msg', { role: 'alert', hidden: true });
  const go = h('button.t-btn.iq-go', { type: 'submit', text: '보내기' });
  const tel = h('a', { href: telHref(CONTACT_DEFAULT.tel), text: CONTACT_DEFAULT.tel });
  const mail = h('a', { href: 'mailto:' + CONTACT_DEFAULT.mail, text: CONTACT_DEFAULT.mail });
  contact().then((c) => { tel.href = telHref(c.tel); tel.textContent = c.tel; mail.href = 'mailto:' + c.mail; mail.textContent = c.mail; });   // 운영 정보 값(원칙 170)
  const foot = h('p.iq-foot', {}, h('span', { text: '전화 · 메일로도 받습니다' }), tel, mail);
  const form = h('form.iq-form', { novalidate: true },
    h('div.iq-two', {}, field('name', '이름', name), field('org', '소속(선택)', org)),
    field('contact', '연락처', reach, '답을 받을 메일 또는 전화번호'),
    h('div.iq-f', { dataset: { f: 'kind' } }, h('p.iq-l', { text: '문의 종류' }), kinds),
    field('body', '내용', text), trap, agree, msg, go);
  const body = h('div.iq', {}, form, foot);
  const m = modal({ title: '문의하기', body });
  m.el.classList.add('iq-md');

  const clear = () => { msg.hidden = true; msg.textContent = ''; form.querySelectorAll('.iq-f.bad').forEach((x) => x.classList.remove('bad')); };
  const say = (t, key) => {
    clear(); msg.textContent = t; msg.hidden = false;
    const f = key && form.querySelector(`.iq-f[data-f="${key}"]`);
    if (f) { f.classList.add('bad'); f.querySelector('input,textarea')?.focus(); }
  };
  form.addEventListener('input', clear);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const k = form.querySelector('.iq-kinds input:checked')?.value || '';
    const v = { name: name.value.trim(), org: org.value.trim(), contact: reach.value.trim(), kind: k, body: text.value.trim(), consent: ck.checked, website: trap.value };
    if (!v.name) return say('이름을 적어 주세요', 'name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.contact) && !/^[0-9+][0-9\- ]{6,19}$/.test(v.contact)) return say('답을 받을 메일 주소나 전화번호를 확인해 주세요', 'contact');
    if (!k) return say('문의 종류를 골라 주세요', 'kind');
    if (v.body.length < 5) return say('내용을 5자 이상 적어 주세요', 'body');
    if (!v.consent) return say('개인정보 수집에 동의해야 보낼 수 있습니다', 'consent');
    go.disabled = true; go.textContent = '보내는 중';
    try {
      await api('/public/inquiries', { method: 'POST', body: v });
      m.set(h('div.iq.iq-done', {}, h('p.iq-done-t', { text: '문의를 보냈습니다' }),
        h('p.iq-done-s', {}, h('span', { text: '담당자가 확인한 뒤' }), ' ', h('span', { text: '적어 주신 연락처로 답을 드립니다.' })),
        h('div.iq-acts', {}, h('button.t-btn', { type: 'button', text: '닫기', onclick: () => m.close() })), foot));
    } catch (err) {
      go.disabled = false; go.textContent = '보내기';
      say(err?.message || '지금은 보낼 수 없습니다. 전화나 메일로 문의해 주세요', err?.detail?.field);
    }
  });
  return m;
}

/** root 안의 [data-inquiry] 단추 · 링크를 문의 창에 잇는다 */
export function bindInquiry(root = document) {
  root.querySelectorAll('[data-inquiry]').forEach((el) => {
    if (el.dataset.iqBound) return;
    el.dataset.iqBound = '1';
    el.addEventListener('click', (e) => { e.preventDefault(); openInquiry({ kind: el.dataset.inquiry || '' }); });
  });
}
