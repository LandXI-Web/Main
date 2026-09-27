/* K7 service-card.js — 서비스 카드(스펙시먼 B · 토스 톤).
   크롭 3:2 상단 풀폭 · 기준일 라벨 · 상태 칩(잉크 농도 3단: 운영 · 시범 · 첫 결과 전) · 제목 H4 2줄 · 결과 수 32 잉크 + 기호.
   크롭이 없으면 빈 상태 캐릭터(K9 스틸). 3열 그리드 거터 24 = serviceGrid().
   serviceCard({ card, deploy, crop, href, where }) → <article>
   joinCards(cards, deploys) → [{ card, deploy, state }] (실배포 우선 · 시험 배포 제외) */
import { h, esc, isEnvelope } from './util.js';
import { numHtml } from './bignum.js';
import { CHARS } from './empty.js';
import { t, df } from './i18n.js';

const RANK = { ga: 0, canary: 1, shadow: 2, draft: 3 };
const isTest = (d) => /-test(-\d+)?$/.test(d?.id || '') || /\(테스트\)|\btest\b/i.test(d?.name || '');

/** 상태 3종: ga | pilot | none */
export function stateOf(card, deploy) {
  if (deploy && isEnvelope(deploy.scale) && deploy.stage === 'ga') return 'ga';
  if (deploy && (deploy.stage === 'canary' || deploy.stage === 'shadow')) return 'pilot';
  if (card?.status === '운영' && deploy && isEnvelope(deploy.scale)) return 'ga';
  if (card?.status === '검토' || card?.status === '시범') return 'pilot';
  return 'none';
}
const CHIP = { ga: ['card.state.ga', ''], pilot: ['card.state.pilot', 'wait'], none: ['card.state.none', 'gap'] };

export function joinCards(cards = [], deploys = []) {
  const live = deploys.filter((d) => !isTest(d));
  return cards.map((card) => {
    const mine = live.filter((d) => d.card_id === card.id).sort((a, b) =>
      (isEnvelope(b.scale) - isEnvelope(a.scale)) || (RANK[a.stage] ?? 9) - (RANK[b.stage] ?? 9) || String(b.updated_at).localeCompare(String(a.updated_at)));
    const deploy = mine[0] || null;
    return { card, deploy, deploys: mine, state: stateOf(card, deploy) };
  });
}

export function serviceCard({ card, deploy, crop, href, where, state, onClick } = {}) {
  const st = state || stateOf(card, deploy);
  const [chipKey, lv] = CHIP[st];
  const scale = deploy && isEnvelope(deploy.scale) ? deploy.scale : null;
  const asOf = scale?.as_of || deploy?.updated_at || null;
  const src = crop || card?.crop_url || null;
  const tag = href ? 'a' : onClick ? 'button' : 'article';
  const el = h(`${tag}.t-card.k-svc`, { ...(href ? { href } : {}), ...(onClick ? { type: 'button', onclick: onClick } : {}), dataset: { state: st, card: card?.id || '' } });
  const fig = h('div.k-svc-crop', { class: src ? '' : 'is-char' }, h('img', { src: src || CHARS.satellite, alt: '', loading: 'lazy', decoding: 'async' }));
  const meta = h('div.k-svc-meta', {},
    h('span.t-label', { text: [where, asOf ? t('card.asof', { date: df(asOf) }) : ''].filter(Boolean).join(' · ') }),
    h('span.t-chip', { dataset: lv ? { lv } : {}, text: t(chipKey) }));
  const title = h('h3.t-h4.k-svc-t', { text: card?.name || '' });
  const num = h('div.k-svc-n', { html: scale ? numHtml(scale) : '' });
  el.append(fig, meta, title, num);
  return el;
}

/** 3열 그리드(≤ 960 2열 · ≤ 640 1열) */
export function serviceGrid(el, rows, opts = {}) {
  el.classList.add('k-svc-grid'); el.innerHTML = '';
  for (const r of rows) el.append(serviceCard({ ...r, ...(opts.map ? opts.map(r) : {}) }));
  return { el };
}
