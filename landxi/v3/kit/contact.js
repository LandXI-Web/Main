/* 문의 연락처 한 출처(원칙 170 · 나중 10) — LX 관리자가 계정 관리 → '운영 정보'에서 바꾸는 값(GET /public/contact · 로그인 없이).
   메인 '문의하기' · 맨 아래 · 도움말 '문의' · 로그인 창 문의가 이 값 하나를 읽는다. 서버를 못 읽으면 처음 값 그대로(화면은 멈추지 않는다).
   · contact() → Promise<{ tel, mail }>(한 번만 부른다)
   · applyContact(root) → root 안의 [data-contact="tel" | "mail"] 글자 · tel:/mailto: 주소 · title 을 바꾼다 */
import { API } from './util.js';

export const CONTACT_DEFAULT = Object.freeze({ tel: '063-713-1218', mail: 'landxi@lx.or.kr' });
let P = null;
export function contact() {
  if (!P) P = fetch(API.prefix + '/public/contact', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ({ tel: j?.tel || CONTACT_DEFAULT.tel, mail: j?.mail || CONTACT_DEFAULT.mail }))
    .catch(() => ({ ...CONTACT_DEFAULT }));
  return P;
}
export const telHref = (t) => 'tel:' + String(t).replace(/[^0-9+]/g, '');

export async function applyContact(root = document) {
  const c = await contact();
  root.querySelectorAll('[data-contact]').forEach((el) => {
    const k = el.dataset.contact, v = c[k];
    if (!v) return;
    if (el.tagName === 'A') {
      el.href = k === 'tel' ? telHref(v) : 'mailto:' + v;
      if (el.title) el.title = `문의 ${v}`;
      if (el.dataset.contactText !== undefined) el.textContent = v;
    } else el.textContent = v;
  });
  return c;
}
