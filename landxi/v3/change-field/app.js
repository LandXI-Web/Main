/* change-field — 국토 변화 현장점검(10-22 CHANGE-DEMO-ORDER P1-7 · §7 6단계). 휴대폰 한 화면: 현장확인 목록 → 상세(두 해 썸네일 · 위치) → 사진 첨부 → 판정 저장.
   PC 에서는 목록 | 상세 두 칸. LX 직원 · 공유받은 기관(서버가 기관에는 공유된 대상지만 준다 · RLS). 반응형 웹 — 앱 없음.
   값 = 서버 한 출처: GET /change/shared(대상지 · 최근 결과 · 판정 현황) · /change/runs/{결과}/features · thumbs · marks · photos.
   주소: ?job=<결과>&id=<변화 번호>. 화면 글자에 작업 번호 · 좌표 · 경로 0(변화 번호 c0001 은 필지 표 · 보고서와 같은 번호). 지역 고정값 0. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { staffMenu } from '../kit/lx-menu.js';
import { createStage } from '../kit/stage.js';

const who = await K.gate('change-field');
const tenant = String(who?.key || '').startsWith('tenant/');
let rail;
if (tenant) { const m = await import('../gov-select/menu.js'); rail = m.govRail({ who, current: 'list' }); } else rail = staffMenu('mapsvc');
const S = K.shell({ who, home: 'change-field', title: '현장점검', rail });

const Q = new URLSearchParams(location.search);
const STATUSES = ['미확인', '현장확인', '불법', '적법', '철거완료'];
const ST_CLS = { 미확인: '', 현장확인: 'is-check', 불법: 'is-bad', 적법: 'is-ok', 철거완료: 'is-done' };
const TYPE_COLOR = { 신축: '#F04452', 소실: '#6B7684', '경작 전환': '#0FA9A0', '포장 확대': '#FF9F1C' };
const JNAME = { 도: '도로', 철: '철도용지', 대: '대지', 임: '임야', 천: '하천', 구: '구거', 잡: '잡종지', 장: '공장용지', 차: '주차장', 창: '창고용지', 학: '학교용지', 과: '과수원', 목: '목장용지', 유: '유지', 제: '제방' };
const nf = (v) => Number(v).toLocaleString('ko-KR');
const when = (iso) => { const d = new Date(iso || ''); if (Number.isNaN(+d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };   // 이 기기 시각(한국 시각)
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const urls = [];
const blobUrl = async (path) => { const r = await api(path, { raw: true }); if (!r.ok) throw new Error(String(r.status)); const u = URL.createObjectURL(await r.blob()); urls.push(u); return u; };

/* 틀 — 왼쪽(휴대폰은 위) 목록 · 오른쪽(휴대폰은 목록을 누르면) 상세 */
const page = h('div.cf-page');
const listCol = h('section.cf-list', { 'aria-label': '현장점검 목록' });
const detail = h('section.cf-detail', { 'aria-label': '상세', hidden: true });
page.append(listCol, detail);
S.main.append(page);

const D = { items: [], cur: null, fc: null, filter: Q.get('f') || '현장확인', sel: Q.get('id') || null };
const release = K.hold();
try { D.items = (await api('/change/shared')).items || []; } catch (e) { K.devlog('change shared', String(e?.message || e)); }
release();
if (!D.items.length) {
  K.empty(listCol, { kind: 'first', title: '볼 수 있는 국토 변화 결과가 없습니다', text: tenant ? 'LX 가 국토 변화 분석서비스를 공유하면 여기에 보입니다' : '지도 서비스에서 변화 탐지를 먼저 돌려 주세요' });
} else {
  D.cur = D.items.find((x) => x.job_id === Q.get('job')) || D.items[0];
  await loadRun();
}

async function loadRun() {
  const r = await api(`/change/runs/${encodeURIComponent(D.cur.job_id)}/features`, { raw: true });
  D.fc = await r.json();
  drawList();
  if (D.sel) openDetail(D.sel);
}

function chip(st) { return h(`span.cf-st.${ST_CLS[st] || 'is-none'}`, { text: st }); }

function drawList() {
  const it = D.cur;
  const fs = (D.fc?.features || []).filter((f) => {
    const p = f.properties;
    if (D.filter === '현장확인') return p.status === '현장확인';
    if (D.filter === '구역선 안') return p.inside_row === '내';
    return true;
  }).sort((a, b) => (a.properties.inside_row === b.properties.inside_row ? b.properties.area_m2 - a.properties.area_m2 : a.properties.inside_row === '내' ? -1 : 1));
  const mk = it.marks || {};
  const sel = D.items.length > 1 ? h('select.t-input.cf-range', { 'aria-label': '대상지', onchange: async (e) => { D.cur = D.items.find((x) => x.job_id === e.target.value); D.sel = null; detail.hidden = true; await loadRun(); } },
    ...D.items.map((x) => h('option', { value: x.job_id, text: x.name, selected: x.job_id === it.job_id || undefined }))) : h('h2.cf-name', { text: it.name });
  const counts = h('p.cf-sum', {}, ...STATUSES.map((s) => h('span', {}, chip(s), h('b', { text: nf(val(mk[s]) ?? 0) }))));
  const tabs = h('div.cf-tabs', { role: 'tablist' }, ...['현장확인', '구역선 안', '전체'].map((k) => h('button.cf-tab', { type: 'button', role: 'tab', 'aria-selected': String(D.filter === k), text: k,
    onclick: () => { D.filter = k; drawList(); } })));
  const ul = h('ul.cf-items');
  for (const f of fs.slice(0, 300)) {
    const p = f.properties;
    ul.append(h('li', {}, h('button.cf-item', { type: 'button', 'aria-current': String(D.sel === f.id), dataset: { id: f.id }, onclick: () => openDetail(f.id) },
      h('i.cf-sw', { style: `background:${TYPE_COLOR[p.type] || '#9AA4B2'}` }),
      h('span.cf-it', {}, h('b', { text: `${p.type} · 약 ${nf(Math.round(p.area_m2))}㎡` }), h('small', { text: `${f.id} · ${p.jibun || '지번 없음'} · ${JNAME[p.jimok] || p.jimok || '-'} · 구역선 ${p.inside_row === '내' ? '안' : '밖'}` })),
      chip(p.status || '미확인'))));
  }
  const empty = !fs.length ? h('p.cf-none', { text: D.filter === '현장확인' ? '현장확인으로 고른 변화가 없습니다 — 지도 서비스나 아래 \'구역선 안\'에서 고릅니다' : '변화가 없습니다' }) : null;
  listCol.replaceChildren(h('div.cf-head', {}, h('p.cf-k', { text: `국토 변화 · ${it.period?.a?.year}년 → ${it.period?.b?.year}년` }), sel, counts, tabs), empty || ul,
    h('div.cf-foot', {}, h('a.t-btn.t-btn--2', { href: '../change-report/?' + new URLSearchParams({ job: it.job_id }), text: '보고서' })));
}

let stage = null;
async function openDetail(id) {
  const f = (D.fc?.features || []).find((x) => x.id === id); if (!f) return;
  D.sel = id;
  try { const u = new URL(location.href); u.searchParams.set('job', D.cur.job_id); u.searchParams.set('id', id); history.replaceState(null, '', u); } catch { /* */ }
  listCol.querySelectorAll('.cf-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  document.body.classList.add('cf-on');
  detail.hidden = false;
  const p = f.properties;
  const [ya, yb] = [D.cur.period?.a?.year, D.cur.period?.b?.year];
  const imgA = h('img', { alt: `${ya}년 항공영상`, decoding: 'async' }), imgB = h('img', { alt: `${yb}년 항공영상`, decoding: 'async' });
  const mapEl = h('div.cf-map');
  const memo = h('textarea.t-input.cf-memo', { rows: '2', maxlength: '500', placeholder: '현장 메모(선택)', 'aria-label': '메모' });
  const stBtns = h('div.cf-sts', { role: 'group', 'aria-label': '판정' });
  const photos = h('div.cf-photos');
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const addPh = h('button.t-btn.t-btn--2', { type: 'button', text: '사진 찍기 · 올리기', onclick: () => file.click() });
  const save = h('button.t-btn.cf-save', { type: 'button', text: '판정 저장' });
  const hist = h('ul.cf-hist');
  let pick = p.status || '미확인';
  const drawSt = () => stBtns.replaceChildren(...STATUSES.map((s) => h(`button.cf-stb.${ST_CLS[s] || 'is-none'}`, { type: 'button', 'aria-pressed': String(pick === s), text: s, onclick: () => { pick = s; drawSt(); } })));
  drawSt();
  detail.replaceChildren(
    h('div.cf-dh', {}, h('button.cf-back', { type: 'button', text: '목록', onclick: () => { document.body.classList.remove('cf-on'); detail.hidden = true; } }),
      h('h2', {}, h('i.cf-sw', { style: `background:${TYPE_COLOR[p.type] || '#9AA4B2'}` }), h('span', { text: `${p.type} · 약 ${nf(Math.round(p.area_m2))}㎡` })), h('small', { text: id })),
    h('div.cf-ab', {}, h('figure', {}, imgA, h('figcaption', { text: `${ya}년` })), h('figure', {}, imgB, h('figcaption', { text: `${yb}년` }))),
    h('dl.cf-dl', {}, ...[['지번', p.jibun], ['지목', JNAME[p.jimok] || p.jimok], ['소유구분', p.owner], ['용도', p.use], ['구역선', p.inside_row === '내' ? '안' : '밖(버퍼)']]
      .map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v || '-' })))),
    h('h3.cf-h3', { text: '위치' }), mapEl,
    h('h3.cf-h3', { text: '현장 사진' }), photos, h('div.cf-row', {}, addPh, file),
    h('h3.cf-h3', { text: '판정' }), stBtns, memo, save,
    h('h3.cf-h3', { text: '판정 이력' }), hist,
    h('p.cf-note', { text: 'AI가 찾은 변화(결과 확인 전)입니다. 판정은 현장 확인으로 합니다.' }));
  for (const [img, t] of [[imgA, 'a'], [imgB, 'b']]) blobUrl(`/change/runs/${encodeURIComponent(D.cur.job_id)}/thumbs/${id}_${t}.png`).then((u) => { img.src = u; }, () => img.replaceWith(h('p.cf-noimg', { text: '영상을 불러오지 못했습니다' })));
  async function loadMark() {
    try {
      const m = await api(`/change/runs/${encodeURIComponent(D.cur.job_id)}/marks/${id}`);
      pick = m.status || '미확인'; drawSt(); memo.value = m.memo || '';
      photos.replaceChildren(...(m.photos || []).map((x) => { const im = h('img', { alt: '현장 사진', decoding: 'async' }); blobUrl(`/change/runs/${encodeURIComponent(D.cur.job_id)}/photos/${id}/${x.name}`).then((u) => { im.src = u; }, () => {}); return im; }));
      if (!(m.photos || []).length) photos.append(h('p.cf-none', { text: '아직 사진이 없습니다' }));
      hist.replaceChildren(...(m.history || []).slice(0, 6).map((x) => h('li', {}, chip(x.status), h('span', { text: `${x.by || ''} · ${when(x.at)}${x.memo ? ' · ' + x.memo : ''}` }))));
      if (!(m.history || []).length) hist.append(h('li.cf-none', { text: '판정 기록이 없습니다' }));
    } catch (e) { K.devlog('mark', String(e?.message || e)); }
  }
  file.addEventListener('change', async () => {
    const fl = file.files?.[0]; if (!fl) return;
    addPh.disabled = true; addPh.textContent = '올리는 중';
    try {
      const fd = new FormData(); fd.append('file', fl);
      const tok = session.get()?.token;
      const r = await fetch(API.prefix + `/change/runs/${encodeURIComponent(D.cur.job_id)}/marks/${id}/photos`, { method: 'POST', body: fd, headers: tok ? { authorization: 'Bearer ' + tok } : {} });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error?.message || '사진을 올리지 못했습니다');
      K.toast('사진을 올렸습니다'); await loadMark();
    } catch (e) { K.toast(e.message || '사진을 올리지 못했습니다'); }
    finally { addPh.disabled = false; addPh.textContent = '사진 찍기 · 올리기'; file.value = ''; }
  });
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const r = await api(`/change/runs/${encodeURIComponent(D.cur.job_id)}/marks/${id}`, { method: 'PATCH', body: { status: pick, memo: memo.value } });
      f.properties.status = r.status;
      K.toast(`판정을 '${r.status}'(으)로 저장했습니다`);
      const sh = await api('/change/shared').catch(() => null);
      const nx = sh?.items?.find((x) => x.job_id === D.cur.job_id); if (nx) D.cur.marks = nx.marks;
      drawList(); await loadMark();
    } catch (e) { K.toast(e.message || '판정을 저장하지 못했습니다'); }
    finally { save.disabled = false; }
  });
  loadMark();
  // 위치 — 작은 지도(그 변화 면 · 바탕 영상)
  try {
    stage?.map?.remove?.(); stage = createStage(mapEl, { interactive: true, scale: true });
    await stage.ready;
    const m = stage.map;
    const g = { type: 'Feature', properties: {}, geometry: f.geometry };
    m.addSource('cf-f', { type: 'geojson', data: g });
    m.addLayer({ id: 'cf-f', type: 'fill', source: 'cf-f', paint: { 'fill-color': TYPE_COLOR[p.type] || '#F04452', 'fill-opacity': 0.25 } });
    m.addLayer({ id: 'cf-l', type: 'line', source: 'cf-f', paint: { 'line-color': '#191F28', 'line-width': 2 } });
    let b = null; const walk = (c) => { if (typeof c[0] === 'number') b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]]; else c.forEach(walk); };
    walk(f.geometry.coordinates);
    m.fitBounds(b, { padding: 40, maxZoom: 18, duration: 0 });
    import('../kit/year-swipe.js').then((sw) => sw.yearSpec(yb)).then((s) => { if (s?.spec && !m.getSource('cf-img')) { m.addSource('cf-img', s.spec); m.addLayer({ id: 'cf-img', type: 'raster', source: 'cf-img' }, 'cf-f'); } }).catch(() => {});
  } catch (e) { K.devlog('field map', String(e?.message || e)); }
  if (matchMedia('(max-width: 960px)').matches) scrollTo({ top: 0 });
}
document.body.dataset.ready = '1';
