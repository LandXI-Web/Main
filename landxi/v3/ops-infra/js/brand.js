/* 기관 서랍 — 기관 정보(마크 · 이름 · 색 · 소개 글)를 LX 관리자도 고친다(구현 2차 T3 · 확인 대장 6차 GF-5 ⓐ "기관 관리자가 직접 하되, LX 관리자도").
   칸은 기관 관리자 화면(서비스 선택 안 '기관 정보')과 같은 한 벌(gov-select/brand-form.js) — 저장하면 그 기관 메인에 바로 반영된다. */
import { drawer, empty, h } from './kit.js';
import { orgUrl } from '../../kit/auth-gate.js';
import { loadBrand } from '../../gov-select/brand.js';
import { brandForm } from '../../gov-select/brand-form.js';

/** 그 기관 메인 주소 — 바깥 주소에서는 기관 주소(https://{기관}.land-xi.dev/), 이 PC 에서는 같은 화면(?org=) */
const mainOf = (id) => orgUrl(id);

export function openBrand(o) {
  const box = h('div');
  const d = drawer({ title: `${o.name} · 기관 정보`, body: box, slot: 'right', width: 480 });
  d.el.classList.add('brand-dr');
  empty(box, { kind: 'loading', compact: true });
  loadBrand(o.id).then((b) => {
    d.set(brandForm({ brand: b, drawer: true, mainHref: mainOf(o.id) }));
  }).catch(() => { empty(box, { kind: 'error', title: '기관 정보를 불러오지 못했습니다', onRetry: () => { d.close(true); openBrand(o); } }); });
  return d;
}
