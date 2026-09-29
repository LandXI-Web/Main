/* 카드 · 배포본(계약 §4.7) — on = GET /deploys · off = data/deploys-fixture.json.
   카드 틀은 landxi/assets/data/cards.js(읽기 import) — card-global-farm · card-global-disaster · card-change. */
import { API, deploys as apiDeploys, fixture, session } from '../../shared/api-v1.js';
import { t } from './i18n.js';
import { textIn } from '../../xi/fx/glass.js';

const DATA = new URL('../data/', import.meta.url);

export async function loadDeploys(tenant) {
  let items = null, via = 'fixture';
  // GET /deploys 는 인증 라우트 — 게스트 · 세션 없음(public 빌드 · lx_api_base 만 있는 탭)이면 부르지 않는다(판정 3차: 401 리소스 오류 = 콘솔 오류 1).
  // 게스트는 공개 배포본 픽스처(시연 카드 틀)로 · via 'fixture(guest)'.
  if (API.mode === 'on' && session.get()) {
    try { items = (await apiDeploys(tenant && tenant !== 'lx' ? { tenant_id: tenant } : {})).items; via = 'api'; } catch { items = null; }
  }
  if (!items) {
    if (API.mode === 'on') via = 'fixture(no session)';
    const doc = await fixture(new URL('deploys-fixture.json', DATA));
    items = (doc?.items || []).filter((d) => !tenant || tenant === 'lx' || d.tenant_id === tenant);
  }
  return { items, via, byId: Object.fromEntries(items.map((d) => [d.id, d])) };
}

/** 카드 머리 — 배포본 id · 단계 · 카드명 · 지명(키릴 병기). sticky(스크롤해도 제목 행 유지 · 아래 페이드 마스크)
    — 판정 1차 must_fix 5: 결과 절 자동 스크롤로 'Farmland use · Ysyk-Ata' 제목이 반쯤 잘린 채 찍힘. */
export function cardHead(dep, { title, place, cyr }) {
  const stage = dep?.stage || 'draft';
  return `<header class="g-card__head"><div class="g-card__eyebrow"><span class="g-stage" data-stage="${stage}">${t('card.stage.' + stage)}</span><span>${dep ? dep.id : '—'}</span></div>
    <h2 class="g-h2">${title}</h2>
    <div class="g-card__place">${place}${cyr ? ` · <span class="g-cyr" lang="ru">${cyr}</span>` : ''}</div></header>`;
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
  card.scrollTop = 0;
  return textIn(card, { stagger: false });   // F1-A fx/glass.textIn — translateY 20 → 0 · 500 · e-arrive(cw-text-in 과 같은 값)
}
