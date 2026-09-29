/* matrix.js — ③ 조립 서랍: 업무 10 × 네 칸(모델 · 대장 형식 · 영상 · 규칙) · 큰 숫자 {n} / 10.
   행 = SURVEY-SPEC §1.1 업무 10(명세 §2.3 문구 그대로). 칸 판정은 전부 실데이터:
     모델 = /registry/models 클래스 · 대장 형식 = /registry/cards ledger_schema(S-6 · 없으면 필지 참조층 어댑터)
     영상 = /catalog/layers?region= 의 고해상도 영상 · 규칙 = /survey/rules
   카드 만들기 = POST /deploys(from_card · S-7) — 네 칸이 찼을 때만. */
import { drawer } from '../kit/panel.js';
import { bignum } from '../kit/bignum.js';
import { toast } from '../kit/toast.js';
import { devlog } from '../kit/dev-drawer.js';
import { h, api, bboxOf } from '../kit/util.js';
import { D, loadAssembly } from './data.js';

/* 업무 정의 — 대장 형식 칸의 정본은 서버 카드의 ledger_schema.kind(S-6).
   kinds = 이 업무가 받는 서버 대장 종류(서버 어휘: farm_ledger · dev_permit · public_asset · river_permit · greenhouse).
   'parcel' = 파일 대장 없이 연속지적(지목·필지)만 쓰는 업무 · 'none' = 대장 없이(구간 축 · 카드가 있으면 있음). */
export const TASKS = [
  { id: 'farmland', name: '농지이용', card: 'card-farm', cls: ['경작지', '비경작지'], kinds: ['farm_ledger'], gsd: 0.5, rules: ['R2', 'R4'] },
  { id: 'greenhouse', name: '비닐하우스', card: 'card-farm', cls: ['비닐하우스', '비닐하우스_단동', '비닐하우스_다동'], kinds: ['greenhouse', 'farm_ledger'], gsd: 0.5, rules: ['R3'] },
  { id: 'illegal_bldg', name: '무허가 건축물', card: 'card-change', cls: ['건물', 'built_gain'], kinds: 'parcel', gsd: 0.5, rules: ['R1'] },
  { id: 'greenbelt', name: '개발제한구역', card: 'card-change', cls: ['built_gain'], kinds: ['dev_permit'], gsd: 0.5, rules: [] },
  { id: 'landuse', name: '지목 불부합', card: 'card-change', cls: ['경작지', '주차장', '건물'], kinds: 'parcel', gsd: 0.5, rules: ['R5'] },
  { id: 'dev_permit', name: '개발행위 사후관리', card: 'card-change', cls: ['built_gain'], kinds: ['dev_permit'], gsd: 0.5, rules: [] },
  { id: 'public_asset', name: '공유재산', card: 'card-change', cls: ['건물', '비닐하우스', '경작지'], kinds: ['public_asset'], gsd: 0.5, rules: ['R6'] },
  { id: 'river_occupy', name: '하천구역 점용', card: null, cls: ['건물'], kinds: ['river_permit'], gsd: 0.5, rules: [] },
  { id: 'trash', name: '방치폐기물·소각', card: 'card-living', cls: ['폐기물', '쓰레기', '소각', '방치폐기물'], kinds: 'parcel', gsd: 0.05, rules: [] },
  { id: 'marine', name: '해양쓰레기', card: 'card-marine', cls: ['해양쓰레기', '해안쓰레기'], kinds: 'none', gsd: 0.05, img: /marine|coast|해안|해양/i, rules: [] },
];
const COLS = [['model', '모델'], ['ledger', '대장 형식'], ['img', '영상'], ['rule', '규칙']];

const hit = (a, b) => a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const boundsOf = (i) => i.bounds || bboxOf(i.geometry || i.aoi) || null;
const kindOf = (c) => c?.ledger_schema?.kind || null;
const nOf = (v) => (v && typeof v === 'object' ? v.value : v);

/** 한 업무의 네 칸 */
export function judge(t, region) {
  const box = region?.bbox || null;
  const R = region && D.region?.sgg_cd === region.sgg_cd ? D.region : null;   // S-3 지역 상세
  const inRegion = (i) => !box || hit(boundsOf(i), box);
  const s6 = D.cards.some((c) => c.ledger_schema);
  /* 카드 — 서버 대장 종류가 맞는 카드가 정본(업무의 기본 카드가 맞으면 그것 먼저) */
  let card = t.card ? D.cards.find((c) => c.id === t.card) : null;
  if (s6 && Array.isArray(t.kinds)) {
    const own = card && t.kinds.includes(kindOf(card)) ? card : null;
    card = own || D.cards.find((c) => t.kinds.includes(kindOf(c))) || null;
  }
  const model = D.models.some((m) => (m.classes || []).some((c) => t.cls.includes(c)));
  /* 필지 바탕 — 지역 상세의 필지 수(S-3) · 없으면 카탈로그의 필지 참조층(pnu 키) */
  const parcels = R ? nOf(R.parcels) > 0 : D.layers.some((i) => i.role === 'reference' && i.promote_id === 'pnu' && (!box || !i.bounds || inRegion(i)));
  const ledgerRows = (k) => (R?.ledger || []).some((x) => (x?.kind || x) === k);
  let ledger;
  if (t.kinds === 'none') ledger = !!card;
  else if (t.kinds === 'parcel') ledger = parcels;
  else if (s6) ledger = !!card && (!region || parcels || t.kinds.some(ledgerRows));
  else ledger = false;   // S-6 없는 서버: 파일 대장 형식을 알 수 없다(연속지적 업무만 위 필지 판정)
  /* 영상 — 지역 상세의 영상 목록(S-3) · 없으면 카탈로그 층을 지역 상자로 */
  const okImg = (gsd, label) => gsd != null && gsd <= t.gsd && (!t.img || t.img.test(label));
  const img = R ? (R.imagery || []).some((i) => okImg(i.gsd_m, `${i.id} ${i.name || ''}`))
    : D.layers.some((i) => i.role === 'imagery' && i.source === 'pmtiles' && okImg(i.gsd_m, `${i.id} ${i.name?.ko || ''}`) && inRegion(i));
  const rule = D.rules.some((r) => t.rules.includes(r.id) || r.survey_id === t.id || (r.tasks || []).includes?.(t.id));
  const cells = { model, ledger, img, rule };
  const miss = COLS.filter(([k]) => !cells[k]).map(([, l]) => l);
  return { t, card, cells, miss, ready: !miss.length };
}

let cur = null;
/** ③ 서랍 열기 — host = 지도 무대 · region = 지도 검색에서 고른 지역(없으면 전국) */
export async function openMatrix({ host, region, onClose, onMade }) {
  const body = h('div.lc-mx');
  const d = drawer({ title: '③ 서비스 만들기', host, slot: 'right', body, onClose, label: '③ 서비스 만들기' });
  d.el.classList.add('lc-drawer');
  body.append(h('div.lc-mx-wait', { 'aria-hidden': 'true' }));
  await loadAssembly(region);
  cur = { d, body, region, onMade };
  draw();
  return d;
}
/** 지역이 바뀌면 영상·대장 칸만 다시 */
export async function regionChanged(region) {
  if (!cur || !cur.d.el.isConnected) return;
  cur.region = region;
  await loadAssembly(region);
  draw();
}

function draw() {
  const { body, region } = cur;
  const rows = TASKS.map((t) => judge(t, region));
  const n = rows.filter((r) => r.ready).length;
  devlog('조립', rows.map((r) => `${r.t.id}:${COLS.map(([k]) => (r.cells[k] ? 1 : 0)).join('')}`).join(' '));
  body.innerHTML = '';
  const big = h('div.lc-mx-big');
  body.append(big);
  const bn = bignum(big, D.assemblyOk ? { value: n, unit: 'count', basis: 'recorded', as_of: D.cardsAsOf || D.asOf, source: '서비스 카드 기록' } : null,
    { label: '만들 수 있는 업무', unit: `/ ${TASKS.length}` });
  if (!D.assemblyOk) bn.empty();   // 자료는 이미 받았다 — 첫 인자 null 은 키트에서 '불러오는 중'이므로 빈 상태로 바로 둔다
  const table = h('table.lc-mx-t', { 'aria-label': '업무별 준비' });
  table.innerHTML = `<thead><tr><th scope="col"><span class="sr">업무</span></th>${COLS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>`;
  const tb = h('tbody');
  rows.forEach((r, i) => {
    const tr = h('tr.lc-mx-r', { tabindex: '0', 'aria-expanded': 'false', dataset: { ready: r.ready ? '1' : '0' }, style: { '--i': i } },
      h('th', { scope: 'row' }, h('span.lc-mx-n', {}, h('span', { text: r.t.name }), r.ready ? h('i.lc-mx-dot', { 'aria-hidden': 'true' }) : null)),
      ...COLS.map(([k]) => h('td', { dataset: { on: r.cells[k] ? '1' : '0' } }, h('i', { 'aria-hidden': 'true' }), h('span', { text: r.cells[k] ? '있음' : '없음' }))));
    const more = h('tr.lc-mx-x', { hidden: true }, h('td', { colspan: String(COLS.length + 1) }, detail(r)));
    const toggle = () => {
      const open = more.hidden;
      tb.querySelectorAll('.lc-mx-x').forEach((x) => { x.hidden = true; });
      tb.querySelectorAll('.lc-mx-r').forEach((x) => x.setAttribute('aria-expanded', 'false'));
      more.hidden = !open; tr.setAttribute('aria-expanded', String(open));
    };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    tb.append(tr, more);
  });
  table.append(tb);
  body.append(table);
}

function detail(r) {
  if (!r.ready) return h('p.lc-mx-miss', { text: `채울 것 ${r.miss.length}: ${r.miss.join(' · ')}` });
  const b = h('button.t-btn.lc-mx-go', { type: 'button', text: '서비스 만들기' });
  b.addEventListener('click', (e) => { e.stopPropagation(); make(r, b); });
  return h('div.lc-mx-act', {}, b);
}

/** 카드 만들기 — S-7 형식(card_id · region) + 지금 서버가 읽는 형식(card_version_id · aoi · region_profile)을 함께 보낸다 */
async function make(r, b) {
  const region = cur.region;
  if (!region) { document.querySelector('.k-region-i')?.focus(); return; }
  const card = r.card;
  const cv = card?.versions?.at?.(-1) || null;
  const bb = region.bbox;
  const aoi = bb ? { type: 'Polygon', coordinates: [[[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]], [bb[0], bb[1]]]] } : null;
  const dep = (region.deploys || [])[0];
  const body = { from_card: true, card_id: card?.id || r.t.card, region: region.sgg_cd, survey_id: r.t.id,
    card_version_id: cv, aoi, region_profile: region.sgg_cd, tenant_id: D.deploys.find((x) => x.id === dep?.id)?.tenant_id || null };
  b.disabled = true;
  try {
    const out = await api('/deploys', { method: 'POST', body });
    devlog('카드 만들기', out?.id || 'ok');
    toast('서비스를 만들었습니다');
    cur.onMade?.(out);
  } catch (e) {
    devlog('카드 만들기 실패', `${e.status || ''} ${e.code || ''} ${e.message || ''}`);
    toast('요청을 보내지 못했습니다');
  } finally { b.disabled = false; }
}
