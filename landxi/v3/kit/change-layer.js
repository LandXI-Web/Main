/* change-layer.js — 국토 변화 분석서비스 결과 층(10-22 CHANGE-DEMO-ORDER P0-1 · P0-4) · 지도 서비스(lx-map)에 붙는다.
   ① 대상지(구역선 · 버퍼 범위) 선 ② 두 해 영상 가르기(kit/swipe.js — 지도 서비스 '영상 비교'와 같은 부품) ③ 변화 폴리곤(유형별 색 · 구역선 안 = 진하게 · 밖 = 옅게)
   ④ 폴리곤을 누르면 오른쪽 칸 — 두 해 썸네일 나란히 + 유형 · 면적 · 지번 · 지목 · 소유구분 ⑤ XI ChatGEO 동작(change_show · change_hl)과 꼬리 질문 문맥(고른 폴리곤).
   주소: ?project=<프로젝트>(대상지 + 두 해 영상) · ?change=<결과>(결과 층까지). 지역 고정값 0 — 범위 · 연도는 서버 데이터.
   값 = 서버 한 출처: GET /change/ranges · /change/runs/{결과} · /features · /thumbs. 화면 글자에 작업 번호 · 좌표 · 경로를 쓰지 않는다. */
import { h, api } from './util.js';

const HERE = import.meta.url;
const TYPES = [['신축', '#F04452'], ['소실', '#6B7684'], ['경작 전환', '#0FA9A0'], ['포장 확대', '#FF9F1C'],
  ['산림 → 나지', '#C2410C'], ['산림 → 도로', '#FF9F1C'], ['산림 → 건물', '#F04452']];    // 산사태 취약지구(국토 변화 틀 · 10-25)
const COLOR = ['match', ['get', 'type'], ...TYPES.flat(), '#9AA4B2'];
const STATUS = [['미확인', '#B0B8C1'], ['현장확인', '#3182F6'], ['불법', '#F04452'], ['적법', '#0FA9A0'], ['철거완료', '#4E5968']];
const nf = (v) => Number(v).toLocaleString('ko-KR');
const JNAME = { 도: '도로', 철: '철도용지', 대: '대지', 임: '임야', 천: '하천', 구: '구거', 잡: '잡종지', 장: '공장용지', 차: '주차장', 창: '창고용지', 학: '학교용지',
  과: '과수원', 목: '목장용지', 유: '유지', 제: '제방', 주: '주유소용지', 공: '공원', 체: '체육용지', 원: '유원지', 종: '종교용지', 사: '사적지', 묘: '묘지', 수: '수도용지', 양: '양어장' };
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const Q = new URLSearchParams(location.search);

const C = { map: null, range: null, job: null, run: null, fc: null, sel: null, hl: new Set(), outOn: true, years: null, card: null, panel: null, sw: null, urls: [] };
window.__lxChange = C;
window.__lxChatCtx = () => ({ change: { project_id: C.range?.project_id || Q.get('project') || null, range_id: C.range?.id || null, job_id: C.job, sel: C.sel } });

let cssOn = false;
function ensureCss() { if (cssOn) return; cssOn = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./change-layer.css', HERE).href })); }

async function waitMap() {
  for (let i = 0; i < 400; i++) {
    const m = window.__lm?.map;
    if (m) { if (!m.isStyleLoaded()) await new Promise((r) => { m.once('idle', r); setTimeout(r, 3000); }); return m; }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
const host = () => document.querySelector('.lm-map') || C.map?.getContainer()?.parentElement;
const blobUrl = async (path) => { const r = await api(path.replace(/^\/api\/v1/, ''), { raw: true }); if (!r.ok) throw new Error(String(r.status)); const u = URL.createObjectURL(await r.blob()); C.urls.push(u); return u; };

/* ── 그리기(본 지도 + 가르기 왼쪽 지도에 같은 층) ── */
function maps() { const out = [C.map]; const L = C.sw?.left?.map; if (L && L !== C.map) out.push(L); return out; }
function upsert(m, id, data) { if (m.getSource(id)) m.getSource(id).setData(data); else m.addSource(id, { type: 'geojson', data }); }
function addLayer(m, spec) { if (!m.getLayer(spec.id)) m.addLayer(spec); }
function drawRange(m) {
  if (!C.range) return;
  upsert(m, 'chg-rng', { type: 'Feature', properties: {}, geometry: C.range.geometry });
  addLayer(m, { id: 'chg-rng-l', type: 'line', source: 'chg-rng', paint: { 'line-color': '#3182F6', 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
  if (C.range.line) {
    upsert(m, 'chg-row', { type: 'Feature', properties: {}, geometry: C.range.line });
    addLayer(m, { id: 'chg-row-l', type: 'line', source: 'chg-row', paint: { 'line-color': '#1B64DA', 'line-width': 2.2 } });
  }
}
function drawChanges(m) {
  if (!C.fc) return;
  upsert(m, 'chg', C.fc);
  const inside = ['==', ['get', 'inside_row'], '내'];
  addLayer(m, { id: 'chg-f', type: 'fill', source: 'chg', paint: { 'fill-color': COLOR, 'fill-opacity': ['case', inside, ['match', ['get', 'type'], '경작 전환', 0.24, 0.45], 0.1] } });   // 넓은 경작 전환은 옅게(작은 신축 · 소실이 묻히지 않게)
  addLayer(m, { id: 'chg-l', type: 'line', source: 'chg', paint: { 'line-color': COLOR, 'line-width': ['case', inside, 2.2, 1], 'line-opacity': ['case', inside, 1, 0.55] } });
  addLayer(m, { id: 'chg-hl', type: 'line', source: 'chg', filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'line-color': '#FFFFFF', 'line-width': 4.5 } });
  addLayer(m, { id: 'chg-hl2', type: 'line', source: 'chg', filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'line-color': '#191F28', 'line-width': 2 } });
  upsert(m, 'chg-pt', { type: 'FeatureCollection', features: (C.fc.features || []).map((f) => ({ type: 'Feature', id: f.id, properties: { id: f.id, status: f.properties.status || '미확인', inside_row: f.properties.inside_row },
    geometry: { type: 'Point', coordinates: [f.properties.lng, f.properties.lat] } })) });
  addLayer(m, { id: 'chg-st', type: 'circle', source: 'chg-pt', minzoom: 13, filter: ['!=', ['get', 'status'], '미확인'],
    paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'status'], ...STATUS.flat(), '#B0B8C1'], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } });
  applyFilters(m);
}
function applyFilters(m) {
  const vis = C.outOn ? null : ['==', ['get', 'inside_row'], '내'];
  for (const id of ['chg-f', 'chg-l']) if (m.getLayer(id)) m.setFilter(id, vis);
  const ids = ['literal', [...C.hl]];
  for (const id of ['chg-hl', 'chg-hl2']) if (m.getLayer(id)) m.setFilter(id, ['in', ['get', 'id'], ids]);
}
/* 변화 탐지를 열면 — 지도 서비스가 처음 켠 다른 결과 층 · 층 이름 줄은 한 번 내린다(이 장면의 주인공은 변화 · 원칙 317). 왼쪽 목록에서 다시 켤 수 있다 */
let quiet = false;
function quietOthers() {
  if (quiet || !C.map) return; quiet = true;
  for (const l of C.map.getStyle()?.layers || []) if (/^lm-r-/.test(l.id)) C.map.setLayoutProperty(l.id, 'visibility', 'none');
  host()?.classList.add('is-chg');
}
function redraw() { for (const m of maps()) { try { drawRange(m); drawChanges(m); } catch (e) { console.debug('change draw', e); } } }

/* 같은 결과가 지도 서비스 왼쪽 목록의 일반 결과 층으로도 켜지면(분석 결과 목록에 함께 실림) — 이 층만 보이게 그쪽은 숨긴다 */
function hideTwin() {
  if (!C.job || !C.map) return;
  for (const l of C.map.getStyle()?.layers || []) if (l.id.startsWith(`lm-r-${C.job}`) && C.map.getLayoutProperty(l.id, 'visibility') !== 'none') C.map.setLayoutProperty(l.id, 'visibility', 'none');
}

/* ── 두 해 가르기 ── */
/* 두 시점 가운데 등록 영상(공유 데이터 · 내 영상)이 있나 — 서버 period.kind(10-23 원칙 329) */
function ownSrc() { const p = C.run?.period; return p?.a?.kind === 'imagery' || p?.b?.kind === 'imagery'; }
async function swipe(ya, yb) {
  if (!ya || !yb) return false;
  C.years = [ya, yb];
  try { window.__lm?.addYears?.([...(C.range?.imagery_years || []).map((y) => y.year), ya, yb]); } catch { /* 지도 서비스 밖 */ }
  let r;
  try {
    if (window.__lm?.compareYears) r = await window.__lm.compareYears(ya, yb);         // 지도 서비스 '영상 비교'(같은 부품 · 왼쪽 칸 상태도 같이)
    else { const m = await import('./swipe.js'); r = await m.compareYears({ map: C.map, yearA: ya, yearB: yb, swipe: C.sw }); }
  } catch { r = { ok: false }; }
  C.sw = window.__lxSwipe?.last || r?.swipe || null;
  if (C.sw?.ready) { await C.sw.ready; }
  redraw();
  return !!r?.ok;
}

/* ── 정보 카드(왼쪽 아래) — 무엇 · 얼마 · 왜(원칙 317) ── */
function drawCard() {
  ensureCss();
  const hst = host(); if (!hst) return;
  if (!C.card) { C.card = h('section.chg-card', { 'aria-label': '국토 변화 탐지', 'data-zone': 'chg-card' }); hst.append(C.card); }
  const s = C.run?.stats;
  const name = C.range?.name || '대상지';
  const yrs = C.years ? `${C.years[0]}년 → ${C.years[1]}년` : '';
  const cardWord = String(C.run?.card?.name || '국토 변화 분석서비스').replace(/\s*분석서비스$/, '');   // 같은 틀의 카드 이름(국토 변화 · 산사태 취약지구)
  const zones = Array.isArray(C.run?.zones) ? C.run.zones : null;
  const inW = zones ? '지구 안' : '구역선 안';
  if (!s) {
    C.card.replaceChildren(h('p.chg-k', { text: `${cardWord} · 분석할 곳` }), h('h2.chg-t', { text: name }),
      h('p.chg-s', { text: `구역선(진한 선) · 분석 범위(점선 · 버퍼 ${C.range?.buffer || ''})${yrs ? ` · 영상 ${yrs}` : ''}` }),
      h('p.chg-w', { text: 'XI ChatGEO 에 두 해를 말해 비교를 시키면 바뀐 곳이 지도에 그려집니다.' }));
    return;
  }
  const bt = s.by_type || {};
  const rows = TYPES.map(([t, c]) => (bt[t] ? h('li', {}, h('i.chg-sw', { style: `background:${c}` }), h('span', { text: t }), h('b', { text: `${nf(val(bt[t].in))}건` }),
    h('small', { text: `밖 ${nf(val(bt[t].out))}` })) : null)).filter(Boolean);
  C.card.replaceChildren(...[                       // 빈 칸(null)은 빼고 — replaceChildren 은 null 을 'null' 글자로 넣는다
    h('p.chg-k', { text: `${cardWord} · ${yrs}` }), h('h2.chg-t', { text: name }),
    h('p.chg-big', {}, h('span', { text: `${inW} 변화 ` }), h('b', { text: `${nf(val(s.n_in))}건` }), h('small', { text: ` · 밖(버퍼) ${nf(val(s.n_out))}건` })),
    !val(s.n) ? h('p.chg-s', { text: '두 시점 사이 찾는 변화가 없었습니다' }) : null,
    ownSrc() ? h('p.chg-s', { text: `${C.run.period.a.word} → ${C.run.period.b.word}` }) : null,
    h('ul.chg-lg', {}, ...rows),
    zones ? zoneList(zones) : null,
    h('p.chg-w', { text: `두 해 영상에서 바뀐 곳 — ${inW} 변화는 현장 확인 대상입니다. 폴리곤을 누르면 두 해 영상을 나란히 봅니다.` }),
    marksLine(),
    h('label.chg-out', {}, h('input', { type: 'checkbox', checked: C.outOn || undefined, onchange: (e) => { C.outOn = e.target.checked; for (const m of maps()) applyFilters(m); } }), h('span', { text: `${zones ? '지구' : '구역선'} 밖(버퍼)도 보기` })),
    h('button.chg-more', { type: 'button', 'aria-expanded': String(C.card.classList.contains('is-open')), text: C.card.classList.contains('is-open') ? '접기' : '유형별 보기',
      onclick: () => { C.card.classList.toggle('is-open'); drawCard(); } })].filter(Boolean));
}

/* 지구별(올린 도형 하나하나 · 산사태 취약지구 등 · 10-25) — 변화가 많은 지구부터 · 서버 값 그대로 */
function zoneList(zs) {
  const rows = [...zs].sort((a, b) => (val(b.n) || 0) - (val(a.n) || 0));
  const top = rows.slice(0, 5);
  return h('div.chg-zones', {}, h('p.chg-zh', { text: `지구별 · ${nf(zs.length)}곳` }),
    h('ul.chg-zl', {}, ...top.map((z) => h('li', {}, h('span', { text: z.name }), h('b', { text: `${nf(val(z.n))}건` }),
      h('small', { text: `${nf(Math.round(val(z.area) || 0))}㎡` })))),
    rows.length > top.length ? h('p.chg-zm', { text: `외 ${nf(rows.length - top.length)}곳 · 보고서에서 모두 봅니다` }) : null);
}

function marksLine() {
  const mk = C.run?.marks; if (!mk) return null;
  const done = ['현장확인', '불법', '적법', '철거완료'].filter((k) => val(mk[k]));
  return h('p.chg-mline', {}, h('span', { text: '판정 ' }), ...(done.length ? done.map((k) => h('span.chg-mt', { dataset: { st: k }, text: `${k} ${nf(val(mk[k]))}` })) : [h('span', { text: '아직 없음' })]),
    h('a.chg-link', { href: '/landxi/v3/change-field/?' + new URLSearchParams({ job: C.job }), text: '현장점검' }),
    h('a.chg-link', { href: '/landxi/v3/change-report/?' + new URLSearchParams({ job: C.job }), text: '보고서' }));
}

/* ── 오른쪽 칸 — 두 해 썸네일 + 속성 ── */
async function openPanel(id) {
  ensureCss();
  const f = (C.fc?.features || []).find((x) => x.id === id); if (!f) return;
  C.sel = id; C.hl = new Set([id]); for (const m of maps()) applyFilters(m);
  const hst = host(); if (!hst) return;
  document.querySelector('.lm-props')?.setAttribute('hidden', '');
  if (!C.panel) { C.panel = h('aside.lm-props.chg-panel', { 'aria-label': '변화 속성', 'data-zone': 'chg-panel' }); hst.append(C.panel); }
  C.panel.hidden = false;
  const p = f.properties;
  const [ya, yb] = C.years || [C.run?.period?.a?.year, C.run?.period?.b?.year];
  const imgA = h('img', { alt: `${ya}년 항공영상`, decoding: 'async' }), imgB = h('img', { alt: `${yb}년 항공영상`, decoding: 'async' });
  const kv = (k, v) => h('div.chg-kv', {}, h('dt', { text: k }), h('dd', { text: v || '-' }));
  C.panel.replaceChildren(
    h('div.chg-ph', {}, h('h3', {}, h('i.chg-sw', { style: `background:${(TYPES.find((t) => t[0] === p.type) || [0, '#9AA4B2'])[1]}` }), h('span', { text: p.type }), h('small', { text: `약 ${nf(Math.round(p.area_m2))}㎡` })),
      h('button.chg-x', { type: 'button', 'aria-label': '닫기', text: '닫기', onclick: closePanel })),
    h('div.chg-ab', {}, h('figure', {}, imgA, h('figcaption', { text: `${ya}년` })), h('figure', {}, imgB, h('figcaption', { text: `${yb}년` }))),
    h('dl.chg-dl', {}, kv('지번', p.jibun), kv('지목', JNAME[p.jimok] || p.jimok), kv('소유구분', p.owner), kv('용도', p.use), kv(Array.isArray(C.run?.zones) ? '지구' : '구역선', p.inside_row === '내' ? '안' : '밖(버퍼)')),
    markBox(id, p),
    h('div.chg-acts', {}, h('button.t-btn.t-btn--2', { type: 'button', text: 'AI 설명 듣기', onclick: () => document.dispatchEvent(new CustomEvent('kit:ask', { detail: { q: '이거 뭐야?' } })) }),
      h('a.t-btn.t-btn--text', { href: '/landxi/v3/change-field/?' + new URLSearchParams({ job: C.job, id }), text: '현장점검(사진)' })),
    h('p.chg-note', { text: 'AI가 찾은 변화(결과 확인 전)입니다. 판단은 현장 확인으로 합니다.' }));
  for (const [img, t] of [[imgA, 'a'], [imgB, 'b']]) blobUrl(`/change/runs/${encodeURIComponent(C.job)}/thumbs/${p.thumb_a ? (t === 'a' ? p.thumb_a : p.thumb_b).split('/').pop() : `${id}_${t}.png`}`)
    .then((u) => { img.src = u; }, () => { img.replaceWith(h('p.chg-noimg', { text: '영상을 불러오지 못했습니다' })); });
  placePanel();
  document.dispatchEvent(new CustomEvent('kit:change-selected', { detail: { id, job: C.job } }));
}
/* 오른쪽 칸 자리 — 열린 대화창 · 범례와 겹치지 않게(원칙 309): 대화창이 열려 있으면 그 왼쪽, 범례가 있으면 그 아래 */
function placePanel() {
  const P = C.panel; if (!P || P.hidden) return;
  const hst = host(); if (!hst) return;
  const hr = hst.getBoundingClientRect();
  let right = 16, top = 16;
  const chat = document.querySelector('#k-chat');
  if (chat && !chat.hidden && chat.offsetWidth) { const r = chat.getBoundingClientRect(); if (r.left < hr.right && r.top < hr.bottom) right = Math.max(16, hr.right - r.left + 12); }
  // 위쪽에 떠 있는 것(범례 · 층 이름 줄 · 가르기 해 이름표)과 가로로 겹치면 그 아래로
  const pl = hr.right - right - (P.offsetWidth || 352), pr = hr.right - right;
  for (const el of hst.querySelectorAll('.lm-lgd:not([hidden]), .lm-cap:not([hidden]), .k-sw-lab')) {
    if (!el.offsetWidth) continue;
    const r = el.getBoundingClientRect();
    if (r.right > pl + 4 && r.left < pr - 4 && r.top < hr.top + 200) top = Math.max(top, r.bottom - hr.top + 8);
  }
  if (matchMedia('(max-width: 960px)').matches) { P.style.right = ''; P.style.top = ''; }
  else { P.style.right = right + 'px'; P.style.top = top + 'px'; }
  // 왼쪽 아래 카드와 겹치면 칸이 열린 동안 카드를 접는다(닫으면 다시 · 원칙 309)
  if (C.card) {
    C.card.classList.remove('is-under');
    const a = C.card.getBoundingClientRect(), b = P.getBoundingClientRect();
    if (a.right > b.left + 4 && a.left < b.right - 4 && a.bottom > b.top + 4 && a.top < b.bottom - 4) C.card.classList.add('is-under');
  }
}
addEventListener('resize', placePanel);
new MutationObserver(placePanel).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-open', 'data-fold'] });

/* 판정(P1-5) — 다섯 가지 중 하나 + 메모 · 저장하면 지도 점 색 · 카드 판정 현황이 바로 바뀐다(서버 PATCH /change/runs/{결과}/marks/{번호}) */
const ST_LIST = ['미확인', '현장확인', '불법', '적법', '철거완료'];
function markBox(id, p) {
  let pick = p.status || '미확인';
  const box = h('div.chg-mark');
  const memo = h('input.t-input.chg-memo', { type: 'text', maxlength: '500', placeholder: '메모(선택)', 'aria-label': '판정 메모', value: p.memo || '' });
  const save = h('button.t-btn.chg-save', { type: 'button', text: '판정 저장' });
  const btns = h('div.chg-sts', { role: 'group', 'aria-label': '판정' });
  const draw = () => btns.replaceChildren(...ST_LIST.map((s) => h('button.chg-stb', { type: 'button', 'aria-pressed': String(pick === s), dataset: { st: s }, text: s, onclick: () => { pick = s; draw(); } })));
  draw();
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const r = await api(`/change/runs/${encodeURIComponent(C.job)}/marks/${id}`, { method: 'PATCH', body: { status: pick, memo: memo.value } });
      const f = C.fc.features.find((x) => x.id === id); if (f) { f.properties.status = r.status; f.properties.memo = r.memo; }
      C.run = await api(`/change/runs/${encodeURIComponent(C.job)}`).catch(() => C.run);
      redraw(); drawCard();
      import('./toast.js').then((m) => m.toast(`판정을 '${r.status}'(으)로 저장했습니다`)).catch(() => {});
    } catch (e) { import('./toast.js').then((m) => m.toast(e.message || '판정을 저장하지 못했습니다')).catch(() => {}); }
    finally { save.disabled = false; }
  });
  box.append(h('p.chg-mk', { text: '판정' }), btns, h('div.chg-mrow', {}, memo, save));
  return box;
}

function closePanel() { C.card?.classList.remove('is-under'); if (C.panel) C.panel.hidden = true; C.sel = null; C.hl.clear(); for (const m of maps()) applyFilters(m); }

const MIN_Z = 12.6;
function fitRange(bb, { duration = 1000 } = {}) {
  if (!bb || !C.map) return;
  C.map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 80, duration, maxZoom: 16.5 });
  const lift = () => { if (C.map.getZoom() < MIN_Z) C.map.easeTo({ zoom: MIN_Z, duration: duration ? 600 : 0 }); };
  if (duration) C.map.once('moveend', lift); else lift();
}

function fitIds(ids) {
  const fs = (C.fc?.features || []).filter((f) => ids.includes(f.id)); if (!fs.length) return;
  let b = null;
  const walk = (c) => { if (typeof c[0] === 'number') { b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]]; } else c.forEach(walk); };
  fs.forEach((f) => walk(f.geometry.coordinates));
  C.map.fitBounds(b, { padding: { top: 80, bottom: 80, left: 80, right: C.panel && !C.panel.hidden ? 420 : 80 }, maxZoom: fs.length === 1 ? 17.5 : 17, duration: 900 });
}

/* ── 불러오기 ── */
async function loadRange({ rid, project }) {
  let r = null;
  if (rid) r = await api(`/change/ranges/${encodeURIComponent(rid)}`);
  else if (project) { const j = await api('/change/ranges?' + new URLSearchParams({ project_id: project })); r = j.items?.[0] ? await api(`/change/ranges/${encodeURIComponent(j.items[0].id)}`) : null; }
  if (!r) return null;
  C.range = r;
  redraw(); drawCard(); quietOthers();
  return r;
}
const CHG_LAYERS = ['chg-rng-l', 'chg-row-l', 'chg-f', 'chg-l', 'chg-hl', 'chg-hl2', 'chg-st'];
function vis(on) { for (const m of maps()) for (const id of CHG_LAYERS) if (m?.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); if (C.card) C.card.hidden = !on; }
/* 지도 서비스 왼쪽 목록에서 국토 변화 줄을 끄면 — 변화 층 · 카드 · 칸을 내린다(다시 켜면 show) */
function hide() { C.job = null; C.sel = null; C.hl.clear(); if (C.panel) C.panel.hidden = true; vis(false); }
async function show(job, { fit = true, ya = null, yb = null } = {}) {
  if (!C.map) C.map = await waitMap();
  C.job = job;
  vis(true);
  C.run = await api(`/change/runs/${encodeURIComponent(job)}`);
  if (!C.range || C.range.id !== C.run.range_id) await loadRange({ rid: C.run.range_id });
  if (C.run.state !== 'done') {
    // 아직 도는 작업(분석하기 · 프로젝트 추론에서 연 주소) — 대상지 카드에 작업 카드(진행 · 취소 · 다시 시도). 끝나면 결과를 그린다(수정 지시서 v2 F3)
    const ya0 = ya || C.run.period?.a?.year, yb0 = yb || C.run.period?.b?.year;
    C.years = [ya0, yb0]; C.run = { ...C.run, stats: null };
    drawCard();
    if (fit && C.range?.bbox) fitRange(C.range.bbox);
    const { jobCard } = await import('./job-card.js');
    C.card?.append(jobCard({ job_id: job, label: `${ya0}년 → ${yb0}년 변화 탐지`, show: { op: 'change_show', job_id: job, year_a: ya0, year_b: yb0, project_id: C.range?.project_id || null } }));
    if (ya0 && yb0 && !ownSrc()) await swipe(ya0, yb0);
    return true;
  }
  const r = await api(`/change/runs/${encodeURIComponent(job)}/features`, { raw: true });
  C.fc = await r.json();
  const a = ya || C.run.period?.a?.year, b = yb || C.run.period?.b?.year;
  const need = !C.sw || !C.years || C.years[0] !== a || C.years[1] !== b;
  C.years = [a, b];
  redraw(); drawCard(); hideTwin();                 // 결과 · 카드 · 자리 먼저(가르기 영상은 이어서)
  if (fit && C.range?.bbox) fitRange(C.range.bbox);
  if (need && !ownSrc()) { await swipe(a, b); redraw(); }   // 등록 영상(공유 데이터 · 내 영상)으로 비교한 결과는 국토지리정보원 해 가르기를 깔지 않는다(다른 영상이라 오해) — 두 시점 그림은 폴리곤 칸에
  return true;
}
window.__lxChange.show = show;
window.__lxChange.open = openPanel;
window.__lxChange.hide = hide;

/* ── 시작 ── */
(async () => {
  const m = await waitMap(); if (!m) return;
  C.map = m; ensureCss();
  m.on('click', 'chg-f', (e) => { const f = e.features?.[0]; if (f) { e.originalEvent?.stopPropagation?.(); openPanel(f.properties?.id ?? f.id); } });
  m.on('mouseenter', 'chg-f', () => { m.getCanvas().style.cursor = 'pointer'; });
  m.on('mouseleave', 'chg-f', () => { m.getCanvas().style.cursor = ''; });
  m.on('idle', hideTwin);
  try {
    if (Q.get('change')) await show(Q.get('change'));
    else if (Q.get('project') || Q.get('range')) {
      const r = await loadRange({ rid: Q.get('range'), project: Q.get('project') });
      if (r) {
        const ys = (r.years || []).map((y) => y.year).sort();
        fitRange(r.bbox, { duration: 0 });
        if (ys.length >= 2) await swipe(ys[0], ys[ys.length - 1]);
        drawCard();
      }
    }
  } catch (e) { console.debug('change layer', e); }
})();

/* XI ChatGEO 동작 */
document.addEventListener('kit:agent-action', async (e) => {
  const a = e.detail;
  if (!a || !['change_show', 'change_hl'].includes(a.op)) return;
  e.preventDefault();
  let ok = false, reason = '';
  try {
    if (!C.map) C.map = await waitMap();
    if (a.op === 'change_show') {
      if (a.project_id && Q.get('project') && a.project_id !== Q.get('project')) {
        // 다른 프로젝트(대상지) — 그 프로젝트 지도로 옮겨 결과를 연다(대화는 그 화면에서 이어진다)
        ok = true;
        setTimeout(() => location.assign(`?${new URLSearchParams({ project: a.project_id, change: a.job_id })}`), 600);
      } else {
        C.sel = null; C.hl.clear(); if (C.panel) C.panel.hidden = true;
        ok = await show(a.job_id, { ya: a.year_a, yb: a.year_b });
        try { const u = new URL(location.href); u.searchParams.set('change', a.job_id); if (a.project_id) u.searchParams.set('project', a.project_id); history.replaceState(null, '', u); } catch { /* */ }
      }
    } else if (a.op === 'change_hl') {
      if (C.job !== a.job_id) await show(a.job_id, { fit: false });
      C.hl = new Set(a.ids || []); for (const m of maps()) applyFilters(m);
      if ((a.ids || []).length === 1 && a.focus) { await openPanel(a.ids[0]); fitIds(a.ids); } else fitIds(a.ids || []);
      ok = (a.ids || []).length > 0;
    }
  } catch (err) { reason = '변화 탐지 결과를 지도에 그리지 못했습니다'; console.debug('change action', err); }
  document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op: a.op, ok, by: 'change-layer', ...(ok ? {} : { reason }) } }));
});
document.addEventListener('kit:change-pick', (e) => { const id = e.detail?.id; if (id && C.fc) { openPanel(id); fitIds([id]); } });
