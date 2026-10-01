/* 요청하기 → 촬영 요청(구현 5차 2묶음 · 확인 대장 17차 촬영-1 · 18차 ⓑ · 촬영-2 ⓑ 비례 · 촬영-3 ⓐ 대략만 · 원칙 106 · 119 · 120 ·
   시안 design-r9/gov-2/mock/requests.html · 흐름 design-r8/shoot-request).
   ① 어디를 찍을까요 — 지도에 범위 그리기(끌어서 네모) 또는 읍면 전체 · 관할 밖은 서버가 받지 않는다
   ② 언제 · 찍은 뒤 무엇을 — 원하는 시기 · 찍은 뒤 바로 분석할 서비스(선택) · 메모(선택)
   ③ 대략 비용 — 서버가 넓이 × 고시 금액(config/fees.yaml 한 곳)으로 셈 · 화면은 '대략' · 확정은 LX 담당자가 조정해서
   보내면 LX 관리자가 받아(담당 지정 화면은 다음 설계) 시기 · 확정 금액을 답한다 — 답은 '보낸 요청'에서 보고 진행 · 취소. 지역 고정값 0(관할에서). */
import * as K from '../kit/index.js';
import { api, h } from '../kit/util.js';

const nf = (v) => Number(v || 0).toLocaleString('ko-KR');
const FC = (g) => ({ type: 'FeatureCollection', features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [] });
const box = (a, b) => ({ type: 'Polygon', coordinates: [[[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]]] });

/** 원하는 시기 — 이번 달부터 다섯 달(상순 · 중순 · 하순) + '가능한 빨리' · 사용자 말 그대로 보낸다 */
function timings() {
  const out = ['가능한 빨리'];
  const d = new Date();
  for (let i = 0; i < 5; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    for (const p of ['상순', '중순', '하순']) out.push(`${m.getFullYear()}년 ${m.getMonth() + 1}월 ${p}`);
  }
  return out;
}

export function mountShoot(pane, { org, cards, onSent }) {
  const mapEl = h('div.gq-map');
  const cap = h('span.gq-cap', { hidden: true });
  const drawBtn = h('button.t-btn.t-btn--2.sq-draw', { type: 'button', text: '범위 그리기', 'aria-pressed': 'false' });
  const clrBtn = h('button.t-btn.t-btn--2', { type: 'button', text: '지우기' });
  const sggSel = h('select.t-input.sq-sgg', { 'aria-label': '시·군·구' });
  const emdBox = h('div.sq-emd');
  const s1 = h('section.gq-stp.t-card', { dataset: { s: '1' } },
    h('div.gq-sh', {}, h('span.n', { text: '1' }), h('b', { text: '어디를 찍을까요' }), h('small', { text: '지도에 범위를 그리거나 읍면을 통째로' })),
    h('div.gq-map-box.sq-map-box', {}, mapEl, cap, h('div.sq-tools', {}, drawBtn, clrBtn)),
    h('div.sq-emd-row', {}, h('span.t-label', { text: '읍면 전체로' }), sggSel, emdBox),
    h('p.gq-note', { text: `${org} 밖은 그릴 수 없습니다.` }));
  const timing = h('select.t-input', { 'aria-label': '원하는 시기' }, ...timings().map((t) => h('option', { value: t, text: t })));
  const svc = h('select.t-input', { 'aria-label': '찍은 뒤 바로 분석' }, h('option', { value: '', text: '고르지 않음' }),
    ...cards.map((c) => h('option', { value: c.id, text: c.name })));
  const memo = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '예: 추수 전에 찍어 주세요', 'aria-label': '메모' });
  const row = (label, sub, el) => h('div.sq-f', {}, h('label.sq-l', {}, h('b', { text: label }), sub ? h('small', { text: sub }) : null), el);
  const s2 = h('section.gq-stp.t-card', { dataset: { s: '2' } },
    h('div.gq-sh', {}, h('span.n', { text: '2' }), h('b', { text: '언제 · 찍은 뒤 무엇을' })),
    row('원하는 시기', '', timing), row('찍은 뒤 바로 분석', '선택', svc), row('메모', '선택', memo));
  const fee = h('div.sq-fee');
  const go = h('button.t-btn.gq-go', { type: 'button', text: '촬영 요청 보내기', disabled: true });
  const note = h('p.gq-note.gq-after', { text: 'LX 담당자가 받아 시기 · 금액을 답합니다. 답이 오면 알림으로.' });
  const s3 = h('section.gq-stp.t-card', { dataset: { s: '3' } },
    h('div.gq-sh', {}, h('span.n', { text: '3' }), h('b', { text: '대략 비용' }), h('small', { text: '넓이에 비례 · 국토교통부 고시 기준' })),
    fee, h('div.gq-go-row', {}, go, note));
  pane.append(s1, s2, s3);
  fee.replaceChildren(h('p.gs-none', { text: '범위를 그리면 대략 비용이 여기에 보입니다' }));

  const S = { aoi: null, quote: null, stage: null, drawing: false, seq: 0 };
  /* 지도 — 처음 탭을 열 때 만든다(분석 요청 화면과 같은 무대) */
  async function ensureMap() {
    if (S.stage) return S.stage;
    S.stage = K.createStage(mapEl, { interactive: true, padding: { top: 28, bottom: 28, left: 28, right: 28 } });
    await S.stage.ready;
    let regs = [];
    try { regs = (await api('/regions?geom=1')).items || []; } catch { /* 관할 목록 없음 */ }
    const all = regs.reduce((a, r) => (r.bbox ? (a ? [Math.min(a[0], r.bbox[0]), Math.min(a[1], r.bbox[1]), Math.max(a[2], r.bbox[2]), Math.max(a[3], r.bbox[3])] : [...r.bbox]) : a), null);
    if (all) S.stage.go(all, { maxZoom: 11, ms: 0 });
    /* 읍면 전체로 — 시·군·구가 여럿이면 먼저 고른다(화면이 대신 고르지 않는다) */
    sggSel.replaceChildren(...(regs.length > 1 ? [h('option', { value: '', text: '시·군·구 고르기' })] : []), ...regs.map((r) => h('option', { value: r.sgg_cd, text: r.name })));
    sggSel.hidden = regs.length < 2;
    sggSel.addEventListener('change', () => emds(sggSel.value));
    if (regs.length === 1) emds(regs[0].sgg_cd);
    wireDraw(S.stage.map);
    return S.stage;
  }
  let emdList = [];
  async function emds(sgg) {
    emdBox.replaceChildren();
    if (!sgg) return;
    try { emdList = ((await api(`/regions/${encodeURIComponent(sgg)}/emd?full=1`)).features || []).filter((f) => f.geometry); }
    catch { emdList = []; }
    let more = false;
    const draw = () => emdBox.replaceChildren(...emdList.slice(0, more ? emdList.length : 4).map((f) => h('button.gy-chip', { type: 'button', text: f.properties?.name || f.properties?.nm || '',
      'aria-selected': String(S.emd === f), onclick: () => { S.emd = f; setAoi(f.geometry, `${f.properties?.name || ''}`); draw(); } })),
    emdList.length > 4 ? h('button.gy-chip', { type: 'button', text: more ? '줄이기' : '더 보기', onclick: () => { more = !more; draw(); } }) : null);
    draw();
  }
  /* 끌어서 네모 그리기 — '범위 그리기'를 누른 동안만(지도 끌기를 잠시 멈춘다) */
  function wireDraw(map) {
    let a = null;
    map.on('mousedown', (e) => { if (!S.drawing) return; e.preventDefault(); a = e.lngLat; });
    map.on('mousemove', (e) => { if (!S.drawing || !a) return; S.stage.geo('aoi', FC(box([a.lng, a.lat], [e.lngLat.lng, e.lngLat.lat])), 'focus'); });
    map.on('mouseup', (e) => {
      if (!S.drawing || !a) return;
      const g = box([a.lng, a.lat], [e.lngLat.lng, e.lngLat.lat]); a = null;
      setDrawing(false); S.emd = null; emdBox.querySelectorAll('[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      setAoi(g, null);
    });
    map.on('touchstart', (e) => { if (!S.drawing || !e.lngLat) return; a = e.lngLat; });
    map.on('touchend', (e) => { if (!S.drawing || !a || !e.lngLat) return; const g = box([a.lng, a.lat], [e.lngLat.lng, e.lngLat.lat]); a = null; setDrawing(false); setAoi(g, null); });
  }
  function setDrawing(on) {
    S.drawing = on;
    drawBtn.setAttribute('aria-pressed', String(on));
    drawBtn.textContent = on ? '지도에서 끌어 그리세요' : '범위 그리기';
    const m = S.stage?.map; if (!m) return;
    if (on) { m.dragPan.disable(); m.getCanvas().style.cursor = 'crosshair'; } else { m.dragPan.enable(); m.getCanvas().style.cursor = ''; }
  }
  drawBtn.addEventListener('click', () => setDrawing(!S.drawing));
  clrBtn.addEventListener('click', () => { S.aoi = null; S.quote = null; S.emd = null; S.stage?.clear('aoi'); cap.hidden = true; fee.replaceChildren(h('p.gs-none', { text: '범위를 그리면 대략 비용이 여기에 보입니다' })); go.disabled = true; emdBox.querySelectorAll('[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false')); });

  async function setAoi(g, label) {
    S.aoi = g; S.quote = null; go.disabled = true;
    S.stage.geo('aoi', FC(g), 'focus');
    const b = K.bboxOf(g); if (b) S.stage.go(b, { maxZoom: 15 });
    const seq = ++S.seq;
    fee.replaceChildren(h('p.gs-none', { text: '셈하는 중' }));
    try {
      const q = await api('/shoots/quote', { method: 'POST', body: { aoi: g } });
      if (seq !== S.seq) return;
      S.quote = q;
      cap.hidden = false;
      cap.textContent = `${label ? label + ' 전체' : (q.place ? q.place + ' 일대' : '그린 범위')} · ${Number(q.area_km2.value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}㎢`;
      fee.replaceChildren(h('div.sq-fee-b', {},
        h('p.sq-fee-w', { text: `${cap.textContent} · ${q.region_type_word}` }),
        h('p.sq-fee-n', {}, h('span', { text: '대략 ' }), h('b.num', { text: nf(q.approx.value) }), h('small', { text: '원' })),
        h('p.sq-fee-d', { html: '이 금액은 <b>넓이로 계산한 대략의 값</b>입니다.<br>촬영 시기와 금액은 <b>LX 담당자가 조정해 확정</b>합니다(분석 대가 등 포함).<br>답이 오면 보낸 요청에서 진행 여부를 정합니다.' })));
      go.disabled = false;
    } catch (e) {
      if (seq !== S.seq) return;
      fee.replaceChildren(h('p.sq-warn', { text: e.message || '대략 비용을 셈하지 못했습니다' }));
    }
  }

  go.addEventListener('click', async () => {
    if (!S.aoi || !S.quote) return;
    go.disabled = true;
    try {
      await api('/shoots', { method: 'POST', body: { aoi: S.aoi, timing: timing.value, card: svc.value || undefined, memo: memo.value.trim() || undefined } });
      K.toast('촬영 요청을 보냈습니다 · 답이 오면 알려 드립니다');
      memo.value = ''; clrBtn.click();
      onSent?.();
    } catch (e) { note.textContent = e.message || '지금은 보낼 수 없습니다'; note.dataset.lv = 'warn'; go.disabled = false; }
  });
  return { open: ensureMap };
}
