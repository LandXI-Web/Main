/* 두 시기 비교 분석서비스 — 이 카드로 분석(오른쪽 칸 · 10-24 사용자 "생육기 생산기 카드 각각, 비교 분석 하는 카드 하나 더").
   직원이 이 카드 안에서 끝낸다: ① 생육기 결과 ② 생산기 결과(③ 곤포사일리지 결과 — 고르면 '수확·곤포 확인'을 가른다) → 견주기.
   결과마다 그 시기 분석서비스에서 영상을 골라(공유 데이터에서 고르기 · 내 영상 업로드) 먼저 분석한다 — 끝난 결과만 고를 수 있다(새 업로드 칸을 만들지 않는다).
   견주는 일은 서버(POST /cards/{카드}/compare — 두 결과가 모두 덮는 곳의 필지마다 · CPU) · 화면은 받은 값을 그대로 그린다(더하거나 나누지 않는다).
   시기별 원천 카드는 서버 카드 정의(c.pair)에서 — 카드 · 작업 id 는 고르기 값으로만(화면 글자에 없음). */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';

const COLOR = { '같은 작물': '#0FA9A0', '작물 바뀜': '#FFB633', '수확·곤포 확인': '#006DF7', '생산기에 없음': '#F04452', '생산기에만 있음': '#727780' };
const nf = (v) => Number(v ?? 0).toLocaleString('ko-KR');
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };

/* 지역 · 영상 이름 — 영상 이름이 지역 이름으로 시작하면 한 번만(남원시 남원시 … 반복 없앰) */
const where = (it) => (it.imagery && it.region && it.imagery.startsWith(it.region) ? it.imagery : [it.region, it.imagery].filter(Boolean).join(' '));

function ensureCss() {
  if (document.querySelector('link[data-la-cmp]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./compare-panel.css', import.meta.url).href, dataset: { laCmp: '1' } }));
}

export async function comparePanel(side, c, body) {
  ensureCss();
  side.classList.add('t-card', 'la-cmp');
  side.append(h('h2.la-side-h', { text: '이 카드로 분석' }));
  const step = (n, title, small) => h('div.la-step', {}, h('i', { text: String(n) }), h('b', { text: title }), small ? h('small', { text: small }) : null);
  const box = h('div');
  side.append(box);
  K.empty(box, { kind: 'loading', compact: true });
  let R;
  try { R = await api(`/cards/${encodeURIComponent(c.id)}/compare/results`); } catch (e) {
    box.replaceChildren(h('p.la-cant', { text: '고를 수 있는 결과를 불러오지 못했습니다' }));
    return;
  }
  box.remove();
  const sel = {};
  const order = [['growth', '생육기 결과', '봄 · 초여름 촬영'], ['production', '생산기 결과', '여름 · 가을 촬영'], ['silage', '곤포사일리지', '고르면 수확·곤포를 가립니다(선택)']];
  let n = 0;
  for (const [k, title, small] of order) {
    const s = R.seasons?.[k];
    if (!s) continue;
    side.append(step(++n, title, small));
    const go = h('a.la-cmp-go', { href: `./?card=${encodeURIComponent(s.card)}#analyze`, text: `${s.card_name || s.label}에서 영상으로 분석하기 →` });
    if (!(s.items || []).length) {
      side.append(h('p.la-cmp-none', { text: `아직 끝난 ${s.label} 분석이 없습니다. 같은 곳을 찍은 드론 영상을 공유 데이터에서 고르거나 내 영상을 업로드해 먼저 분석해 주세요.` }), go);
      continue;
    }
    const opt = (it) => h('option', { value: it.job, text: [where(it), it.when, it.finished_at ? `${ymd(it.finished_at)} 분석` : ''].filter(Boolean).join(' · ') });
    const sl = h('select.t-input', { 'aria-label': title }, k === 'silage' ? h('option', { value: '', text: '고르지 않음' }) : h('option', { value: '', text: '결과를 고르세요' }), ...s.items.map(opt));
    sl.addEventListener('change', () => { sel[k] = sl.value; btn.disabled = !(sel.growth && sel.production); });
    side.append(sl, go);
  }
  const btn = h('button.t-btn.la-go', { type: 'button', text: '견주기', disabled: true });
  const msg = h('p.la-note', { text: `두 결과가 모두 덮는 곳의 필지마다 견줍니다. ${R.rule?.text ? R.rule.text + '.' : ''}` });
  const st = h('p.la-cmp-st', { role: 'status', hidden: true });
  side.append(btn, st, msg);

  let out = null;
  btn.addEventListener('click', async () => {
    btn.disabled = true; st.hidden = false; st.textContent = '견주는 중…';
    const t0 = performance.now();
    let d;
    try { d = await api(`/cards/${encodeURIComponent(c.id)}/compare`, { method: 'POST', body: { growth: sel.growth, production: sel.production, silage: sel.silage || '' } }); } catch (e) {
      st.textContent = e?.message || '견주지 못했습니다'; btn.disabled = false; return;
    }
    st.textContent = `다 견줬습니다 · ${((performance.now() - t0) / 1000).toFixed(1)}초`;
    btn.disabled = false;
    out?.remove();
    out = resultSec(d);
    body.prepend(out);
    out.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function resultSec(d) {
  const sec = h('section.t-card.la-box.la-wide.la-cmp-r', { 'aria-label': '비교 결과' }, h('h2.la-h', {}, '비교 결과', h('small', { text: 'AI 분석 결과 · 결과 확인 전' })));
  const ins = d.inputs || {};
  const line = (k, w) => (ins[k] ? `${w} ${[where(ins[k]), ins[k].when].filter(Boolean).join(' ')}` : '');
  sec.append(h('p.t-label.la-ex-l', { text: [line('growth', '생육기'), line('production', '생산기')].filter(Boolean).join(' → ') }),
    h('div.la-big', {}, h('b', { text: nf(d.total?.value) }), h('span.u', { text: '필지' }),
      d.zone?.value != null ? h('small.la-cmp-z', { text: `견준 곳 ${nf(d.zone.value)}ha` } ) : null));
  const ul = h('ul.la-cmp-st-l');
  for (const r of d.by_status || []) {
    ul.append(h('li', {}, h('i', { style: `background:${COLOR[r.status] || '#727780'}`, 'aria-hidden': 'true' }), h('span', { text: r.status }),
      h('b.num', { text: `${nf(r.n?.value)}필지` }), h('small.num', { text: `${nf(r.area_ha?.value)}ha` })));
  }
  const mapBox = h('div.la-cmp-map');
  sec.append(h('div.la-cmp-grid', {}, ul, mapBox));
  if (d.rule?.text) sec.append(h('p.la-note', { text: d.rule.text }));
  const rows = (d.rows || []).filter((r) => r.status !== '같은 작물').slice(0, 20);
  if (rows.length) {
    const tb = h('table.la-cmp-t', {}, h('thead', {}, h('tr', {}, ...['필지', '생육기', '생산기', '결과', '면적 변화'].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', { text: r.addr || r.emd || '' }), h('td', { text: r.growth || '없음' }), h('td', { text: r.production || '없음' }),
        h('td', { text: r.status }), h('td.num', { text: `${r.change?.value > 0 ? '+' : ''}${nf(r.change?.value)}㎡` })))));
    sec.append(h('h3.la-cmp-h3', { text: '바뀐 필지(면적 변화 큰 순 · 20곳까지)' }), h('div.la-cmp-tw', {}, tb));
  }
  requestAnimationFrame(() => drawMap(mapBox, d.geo));
  return sec;
}

async function drawMap(box, geo) {
  const fs = geo?.features || [];
  if (!fs.length) { box.append(h('p.la-none-t', { text: '견준 필지가 없습니다' })); return; }
  let b = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; } else c.forEach(walk); };
  fs.forEach((f) => walk(f.geometry.coordinates));
  try {
    const stage = K.createStage(box, { bounds: b, interactive: true, scale: false });
    await stage.ready;
    const m = stage.map;
    m.fitBounds(b, { padding: 24, duration: 0, maxZoom: 17 });
    m.addSource('la-cmp', { type: 'geojson', data: geo });
    const col = ['match', ['get', 'status'], ...Object.entries(COLOR).flat(), '#727780'];
    m.addLayer({ id: 'la-cmp-f', type: 'fill', source: 'la-cmp', paint: { 'fill-color': col, 'fill-opacity': 0.45 } });
    m.addLayer({ id: 'la-cmp-l', type: 'line', source: 'la-cmp', paint: { 'line-color': col, 'line-width': 1 } });
  } catch { box.append(h('p.la-none-t', { text: '지도를 열지 못했습니다' })); }
}
