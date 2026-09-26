/* 카드 · 배포본(계약 §4.7) — on = GET /deploys · off = data/deploys-fixture.json.
   카드 틀은 landxi/assets/data/cards.js(읽기 import) — card-global-farm · card-global-disaster · card-change. */
import { API, deploys as apiDeploys, fixture } from '/landxi/shared/api-v1.js';
import { cardById } from '/landxi/assets/data/cards.js';
import { t } from './i18n.js';

const DATA = new URL('../data/', import.meta.url);

export async function loadDeploys(tenant) {
  let items = null, via = 'fixture';
  if (API.mode === 'on') {
    try { items = (await apiDeploys(tenant && tenant !== 'lx' ? { tenant_id: tenant } : {})).items; via = 'api'; } catch { items = null; }
  }
  if (!items) {
    const doc = await fixture(new URL('deploys-fixture.json', DATA));
    items = (doc?.items || []).filter((d) => !tenant || tenant === 'lx' || d.tenant_id === tenant);
  }
  return { items, via, byId: Object.fromEntries(items.map((d) => [d.id, d])) };
}

/** 카드 머리 — 배포본 id · 단계 · 카드명 · 지명(키릴 병기). */
export function cardHead(dep, { title, place, cyr }) {
  const card = cardById(dep?.card_id) || null;
  const stage = dep?.stage || 'draft';
  return `<div class="g-card__eyebrow g-in"><span class="g-stage" data-stage="${stage}">${t('card.stage.' + stage)}</span><span>${dep ? dep.id : '—'}</span></div>
    <h2 class="g-h2 g-in-2">${title}</h2>
    <div class="g-card__place g-in-3">${place}${cyr ? ` · <span class="g-cyr" lang="ru">${cyr}</span>` : ''}</div>`;
}

/** 결손 칩 — 점선 무채 + 이유 한 줄(system-v2 §1 콘티). */
export function gap(title, why) {
  const d = document.createElement('div');
  d.className = 'gs-void g-gap g-in';
  d.innerHTML = `<b>${title}</b> · ${why}`;
  return d;
}

/** 카드 전체 등장 — 내용을 다 채운 뒤 호출. 자식의 개별 스태거(g-in-2…4)를 걷고 카드 한 장을 500 으로 올린다(빈 상자 선행 0). */
export function reveal(card) {
  card.querySelectorAll('.g-in, .g-in-2, .g-in-3, .g-in-4').forEach((e) => e.classList.remove('g-in', 'g-in-2', 'g-in-3', 'g-in-4'));
  card.classList.remove('g-in');
  card.hidden = false;
  void card.offsetWidth;
  card.classList.add('g-in');
}
