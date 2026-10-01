/* lx-ingest — 데이터 올리기. "이 지역에 영상과 행정 자료가 갖춰졌는가?"
   명세 LANDXI-FINAL-SPEC §2.4 의 판 · 서랍 배치 그대로. 부품은 키트만 조합한다.
   확인 18차 M-3 ⓐ(10-01): 필지 결합은 서버가 분석 뒤 자동(전역 AI 분석이 끝나면 실태조사로 저절로 잇는다 · 서버 deploys.parcel_tick) —
   이 화면에서 지적 · 대장 · 결합 단계, '결합 실행' 버튼, '필지 결합률' 큰 숫자, 결합률 채색을 뺐다. 서랍에는 영상 · 행정 자료 · 필지 단위 결과(서버 실태조사 상태) 세 칸.
   대장 비교는 기관이 원할 때(기관 서비스의 '행정정보와 비교' — 그대로).
   지역은 변수(URL ?region= · 최근 · 배포 기록이 가장 많은 지역) — 지역 문자열 하드코딩 0. */
import * as K from '../kit/index.js';
import * as D from './data.js';
import { imagerySheet, ledgerSheet } from './sheets.js';
import { PID, projectRail, attachProject, stageHref } from '../lx-project/context.js';   // 프로젝트 맥락(?project= · 구현 2차 T1)
import { staffMenu } from '../kit/lx-menu.js';

const who = await K.gate('lx-ingest');
const qs = new URLSearchParams(location.search);
const V3 = '/landxi/v3/';

/* ── 셸 + 메뉴 ─────────────────────────────────────────────
   왼쪽 메뉴 = LX 직원 메뉴(kit/lx-menu.js · 10차 메뉴-1 ⓐ · J-1) — 프로젝트 맥락(?project=)이면 '프로젝트'에 불 + 마스트 아래 단계 막대(lx-project/context.js).
   프로젝트 밖에서 이 화면은 메뉴 '데이터'(영상 · 행정 자산이 지역에 갖춰졌나 · 올리기). */
const PR = projectRail('ingest');
const S = K.shell({ who, home: 'lx-ingest', rail: PR || staffMenu('data') });
if (PR) attachProject(S, PR, 'ingest');

/* ── 판: 지도 무대 + 지역 카드 ─────────────────────────────────── */
const stageEl = K.h('div.lxi-stage');
S.main.append(stageEl);
const st = K.createStage(stageEl);
K.devDrawer({ stage: st, who });

const pickEl = K.h('div.lxi-pick-in');
const pickCard = K.card({ map: true, cls: 'lxi-pick', body: pickEl });
stageEl.append(pickCard);

const padFor = () => (matchMedia('(max-width: 640px)').matches ? { top: 92, bottom: Math.round(innerHeight * 0.48) + 24, left: 24, right: 24 } : { top: 120, bottom: 48, left: 96, right: 440 });
st.pad(padFor()); addEventListener('resize', () => st.pad(padFor()));

/* ── 지도 층(무대 위) — 그 지역 영상 범위(점선) ───────────────────── */
const EMPTY = { type: 'FeatureCollection', features: [] };
await st.ready;
const map = st.map;
map.addSource('lxi-fp', { type: 'geojson', data: EMPTY });
map.addLayer({ id: 'lxi-fp-l', type: 'line', source: 'lxi-fp', paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-dasharray': [2, 1.5], 'line-opacity': 0.95 } }, 'slot-overlay');

/* 전국: 자체 영상이 있는 곳(점) — 카탈로그가 정한다 */
const cat = await D.catalog().catch(() => null);
S.fresh(cat?.as_of || null);
if (cat) {
  const pts = (cat.items || []).filter((i) => i.role === 'imagery' && i.source !== 'external' && i.bounds).map((i) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [(i.bounds[0] + i.bounds[2]) / 2, (i.bounds[1] + i.bounds[3]) / 2] } }));
  st.geo('imgpts', { type: 'FeatureCollection', features: pts }, 'point');
}

/* ── 영상 사다리(그 지역 자체 영상을 실제 타일로) ──────────────── */
const mounted = new Set();
/* 원본 동적 타일(source cog · LX 전용)은 서명 주소를 받아 타일 템플릿으로 바꿔 쌓는다 — 구운 PMTiles 가 있으면 그쪽이 먼저 */
async function cogAsTiles(i) {
  if (i.source !== 'cog') return i;
  const j = await D.signCog(i.id);
  return j?.url ? { ...i, source: 'external', tiles: j.url, params: null } : null;
}
async function mountImagery(items) {
  const add = items.filter((i) => !mounted.has(i.id) && i.ladder);
  if (!add.length) return;
  add.forEach((i) => mounted.add(i.id));
  try {
    const ready = (await Promise.all(add.map((i) => cogAsTiles(i).catch(() => null)))).filter(Boolean);
    if (ready.length) await st.ladder(ready, ready.map((i) => i.id));
  } catch (e) { K.devlog('ladder', e.message); }
}

/* 같은 자리 여러 시점(거의 같은 범위)은 테두리 하나 */
const uniqBounds = (items) => { const out = []; for (const i of items) { if (!i.bounds) continue; const b = i.bounds; if (!out.some((o) => o.bounds.every((v, k) => Math.abs(v - b[k]) < 0.02))) out.push(i); } return out; };

/* ── 서랍 ──────────────────────────────────────────────────── */
let dr = null, cur = null, token = 0, UI = null;
const skel = (n) => K.h('div.lxi-skel', {}, ...Array.from({ length: n }, () => K.h('i')));

function openDrawer(region) {
  const body = K.h('div.lxi-dr', { dataset: { scope: region.sgg_cd } });
  const img = K.h('section.lxi-sec', {}, K.h('h3.t-label', { text: '영상' }), K.h('div.lxi-img', {}, skel(2)));
  /* 행정 자료(V-World 갖춤) — 대장 형식 등록은 이 칸 머리의 작은 버튼(서비스 카드가 쓰는 대장 열 이름 · 뜻) */
  const bLed = K.h('button.lxi-sec-a', { type: 'button', text: '대장 형식 등록', onclick: () => ledgerSheet({ host: stageEl, under: dr, onDone: () => {} }) });
  const led = K.h('section.lxi-sec', {}, K.h('div.lxi-sec-h', {}, K.h('h3.t-label', { text: '행정 자료' }), bLed), K.h('div.lxi-led', {}, skel(5)));
  /* 필지 단위 결과 — 서버가 전역 분석 뒤 저절로 만드는 실태조사의 상태(M-3 ⓐ · 직원이 누르는 단계 없음) */
  const parcel = K.h('section.lxi-sec', {}, K.h('h3.t-label', { text: '필지 단위 결과' }), K.h('p.lxi-pr', { dataset: { st: 'loading' }, text: '…' }));
  const bImg = K.h('button.t-btn.t-btn--2', { type: 'button', text: '영상 등록', onclick: () => imagerySheet({ host: stageEl, region: cur, under: dr, onDone: afterImagery }) });
  /* 학습 표본(라벨 묶음) 올리기 — 원스톱 학습 서랍으로(r3-train) */
  const bSample = K.h('a.t-btn.t-btn--2', { href: PID ? stageHref(PID, 'label') : V3 + 'lx-train/?flow=1', text: '학습 표본 올리기' });
  body.append(img, led, parcel);
  if (dr && dr.el.isConnected) { dr.title(region.name); dr.set(body); }
  else dr = K.drawer({ title: region.name, body, host: stageEl, slot: 'right', label: region.full || region.name, onClose: () => { dr = null; } });
  // 행동 줄은 서랍 바닥에 고정(스크롤 밖 · 첫 뷰에 늘 보임)
  dr.el.querySelector(':scope > .lxi-acts')?.remove();
  dr.el.append(K.h('div.lxi-acts', {}, bImg, bSample));
  UI = { img: img.querySelector('.lxi-img'), led: led.querySelector('.lxi-led'), parcel: parcel.querySelector('.lxi-pr') };
  return UI;
}

function renderImagery(el, im) {
  el.replaceChildren();
  if (!im.labels.length) {
    const e = K.h('div'); el.append(e);
    K.empty(e, { kind: 'ingest', text: '이 지역 영상을 등록하면 AI 분석을 시작할 수 있습니다', compact: true });
    return;
  }
  const ul = K.h('ul.lxi-list');
  for (const r of im.labels.slice(0, 5)) {
    const cov = r.cov?.value;
    const part = cov != null && cov < 0.95 ? ` <span class="t-label">지역의 ${Math.max(1, Math.round(cov * 100))}%</span>` : '';
    ul.append(K.h('li', { html: `<span>${K.esc(r.label)}${part}</span>${K.sig(r.cov && cov < 0.95 ? r.cov : r.env)}` }));
  }
  el.append(ul);
}
const STATE = { yes: '있음', no: '없음', agency: '기관 제공 대기', unknown: '—' };
function renderLedger(el, rows) {
  el.replaceChildren();
  const box = K.h('div'); el.append(box);
  K.table(box, {
    cols: [{ key: 'label', label: '대장' }, { key: 'state', label: '상태', fmt: (v, r) => `<span class="lxi-st" data-st="${K.esc(v)}">${K.esc(STATE[v] || '—')}</span>${r.env ? K.sig(r.env) : ''}` }],
    rows, limit: 10,
  });
}
/* 필지 단위 결과 한 줄 — 준비됨 · 날짜 / 계산 중 / 아직 없음(전역 분석이 끝나면 저절로) */
function renderParcel(el, s) {
  const md = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };
  const [st2, text] = !s ? ['none', '아직 없음 — 전역 분석이 끝나면 저절로 만듭니다']
    : s.state === 'building' ? ['busy', '계산 중 — 끝나면 필지 숫자가 나옵니다']
      : s.state === 'done' ? ['ok', `준비됨${md(s.finished_at) ? ' · ' + md(s.finished_at) : ''}`]
        : ['warn', '만들지 못했습니다 — 다음 분석 뒤 다시 만듭니다'];
  el.dataset.st = st2;
  el.textContent = text;
}

async function pick(region, { fly = true } = {}) {
  if (!region) return;
  const my = ++token;
  cur = region;
  history.replaceState(null, '', location.pathname + '?region=' + encodeURIComponent(region.sgg_cd) + (PID ? '&project=' + encodeURIComponent(PID) : '') + (qs.get('dev') ? '&dev=' + qs.get('dev') : ''));
  const ui = openDrawer(region);
  map.getSource('lxi-fp').setData(EMPTY);

  const geo = await D.regionGeom(region);
  if (my !== token) return;
  if (!geo.bbox) { ui.img.replaceChildren(); K.empty(ui.img.appendChild(K.h('div')), { kind: 'outside', compact: true }); renderParcel(ui.parcel, null); return; }
  st.geo('region', geo.fc, 'focus');
  if (fly) st.go(geo.bbox, { maxZoom: 12.5 });

  // 영상
  D.imageryIn(region, geo).then((im) => {
    if (my !== token) return;
    renderImagery(ui.img, im);
    map.getSource('lxi-fp').setData({ type: 'FeatureCollection', features: uniqBounds(im.items).map((i) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[i.bounds[0], i.bounds[1]], [i.bounds[2], i.bounds[1]], [i.bounds[2], i.bounds[3]], [i.bounds[0], i.bounds[3]], [i.bounds[0], i.bounds[1]]]] } })) });
    mountImagery(im.items);
  }).catch((e) => { K.devlog('imagery', e.message); ui.img.replaceChildren(K.h('p.t-label', { text: '—' })); });

  // 행정 자료(V-World 갖춤)
  D.ledgerIn(region, geo).then((rows) => { if (my === token) renderLedger(ui.led, rows); });

  // 필지 단위 결과(서버 실태조사 상태)
  D.parcelState(region).then((s) => { if (my === token) renderParcel(ui.parcel, s); });
}

/* 영상 등록이 끝나면(파일 끌어 놓기 · 구현 4차 fixes) — 등록한 곳이 지금 지역이면 그 자리에서 새로, 다른 지역 영상이면 그 지역으로
   (지역은 파일이 정한다 · 원칙 41). 영상 목록 · 카탈로그는 등록 때 새로 받아 두었다(data.registerDraft). */
function afterImagery(out) {
  const cds = [...new Set((out?.items || []).map((x) => x.sgg_cd))];
  const go = cds.length && cur && !cds.includes(cur.sgg_cd) ? list.find((r) => r.sgg_cd === cds[0]) : null;
  if (go) { picker.input.value = go.name; pick(go); } else if (cur) pick(cur, { fly: false });
}

/* ── 지역 선택(K4) · 지도 누르기 ───────────────────────────────── */
const list = await D.regions();
const picker = await K.regionPicker(pickEl, { onPick: (r) => pick(r) });
map.on('click', async (e) => {
  try {
    const cd = await D.regionAt(e.lngLat.lng, e.lngLat.lat);
    const r = cd && list.find((x) => x.sgg_cd === cd || x.profile === cd);
    if (r && r !== cur) { picker.input.value = r.name; pick(r); }
  } catch (err) { K.devlog('region at', err.message); }
});

/* 첫 지역: URL → 최근 → 데이터가 정한다 — 결과가 있는 지역 우선, 그다음 배포 수 → 영상 → 의심 필지 수(동률 깨기) */
function firstRegion(rs) {
  const nf = (r) => +(r.n_findings?.value ?? r.n_findings ?? 0) || 0;
  const key = (r) => [nf(r) > 0 ? 1 : 0, r.deploys?.length || 0, r.has_imagery ? 1 : 0, nf(r)];
  return [...rs].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; })[0];
}
const want = qs.get('region');
const first = (want && list.find((r) => r.sgg_cd === want || r.profile === want))
  || K.recent().map((k) => list.find((r) => r.sgg_cd === k)).find(Boolean)
  || firstRegion(list);
if (first) { picker.input.value = first.name; setTimeout(() => pick(first), 700); }
/* ?dev=1 — 검증용 상태 조회(개발자 서랍과 같은 조건 · 화면 문구 0) */
if (qs.get('dev') === '1') window.__lxi = { map, state: () => ({ cur: cur?.sgg_cd || null, parcel: UI?.parcel?.dataset.st || null }) };
document.documentElement.dataset.ready = '1';
