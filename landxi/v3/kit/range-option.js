/* 분석 구간 설정하기 — 모든 분석 서비스 카드 '고급 기능' 칸(10-24 사용자 "분석 구간 설정하기 옵션 … 체크하면 구간을 업로드 하거나 행정 구역을 설정").
   ☐ 분석 구간 설정하기 → [구간 업로드 | 행정구역]
     구간 업로드: shp(zip) · geojson · gpkg  + ☐ 버퍼 설정 → 거리 m(0–1,000) — 끄면 올린 모양 그대로
     행정구역: 시군구 · 읍면동
   ☐ 필지 단위 집계(이 카드가 필지 대조를 하면 처음부터 켬)
   구간은 장부 한 곳(서버 /ranges · 국토 변화 대상지와 같은 표) — 같은 모양 · 같은 거리면 서버가 이미 있는 구간을 돌려준다(원칙 320).
   설명 글 없음(원칙 335) — 짧은 이름 + 조작 하나. 고른 값이 바뀌면 바로 구간을 만들어 확인하고(onRange) 그 결과를 한 줄로 보인다. */
import { h, api, API, session } from './util.js';
import { regionPicker } from './region.js';

function ensureCss() {
  if (document.querySelector('link[data-rg-opt]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./range-option.css', import.meta.url).href, dataset: { rgOpt: '1' } }));
}
let SEQ = 0;
const check = (label, on) => {
  const id = 'rg-c' + (++SEQ);
  const box = h('input', { type: 'checkbox', id, checked: on || undefined });
  return { box, el: h('label.rg-check', { for: id }, box, h('span', { text: label })) };
};
const sw = (label, on) => {
  const b = h('button.rg-sw', { type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label }, h('i'));
  b.addEventListener('click', () => b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')));
  return { b, el: h('div.rg-row', {}, h('span.rg-l', { text: label }), b), on: () => b.getAttribute('aria-checked') === 'true' };
};

/** rangeOption(host, { buffer=50, bufferOn=false, parcels=false, parcelsRow=true, endpoint='/ranges', sgg=()=>null, onRange(range|null), required=false })
 *  required = 이 카드는 구간이 있어야 분석한다(국토 변화 틀 · 10-25) — '분석 구간 설정하기' 체크 없이 늘 펼침
 *  → { el, range():구간|null, parcels():bool, ready():Promise, setOn(bool), clear() } */
export function rangeOption(host, { buffer = 50, bufferOn = false, parcels = false, parcelsRow = true, endpoint = '/ranges', sgg = () => null, onRange = () => {}, on = false, pnu = false, required = false } = {}) {
  ensureCss();
  const S = { mode: 'file', file: null, sgg: null, emd: '', range: null, busy: null, key: '' };
  const use = check('분석 구간 설정하기', on || required);
  const seg = h('div.rg-seg', { role: 'tablist', 'aria-label': '분석 구간' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', dataset: { k: 'file' }, text: '구간 업로드' }),
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', dataset: { k: 'region' }, text: '행정구역' }));
  /* 구간 업로드 */
  const KINDS = pnu ? 'shp(zip) · geojson · gpkg · 필지 목록(txt)' : 'shp(zip) · geojson · gpkg';   // 국토 변화는 필지(PNU) 목록도(예전 대상지 칸 그대로)
  const fileIn = h('input.rg-file-in', { type: 'file', accept: '.zip,.geojson,.json,.gpkg' + (pnu ? ',.txt,.csv' : ''), 'aria-label': '구간 파일' });
  const fileName = h('span.rg-file-t', { text: KINDS });
  const fileBox = h('label.rg-file', {}, fileIn, fileName);
  const buf = check('버퍼 설정', bufferOn);
  const bufIn = h('input.t-input.rg-num', { type: 'number', min: '0', max: '1000', step: '10', value: String(buffer), inputmode: 'numeric', 'aria-label': '거리(m)' });
  const bufRow = h('div.rg-buf', { hidden: !bufferOn }, h('span.rg-l', { text: '거리' }), h('div.rg-m', {}, bufIn, h('span', { text: 'm' })));
  const filePane = h('div.rg-pane', {}, fileBox, buf.el, bufRow);
  /* 행정구역 */
  const where = h('div.rg-where');
  const emdSel = h('select.t-input', { 'aria-label': '읍면동', disabled: true }, h('option', { value: '', text: '전체 읍면동' }));
  const regPane = h('div.rg-pane', { hidden: true }, where, emdSel);
  const status = h('p.rg-s', { 'aria-live': 'polite', hidden: true });
  const detail = h('div.rg-detail', { hidden: !(on || required) }, seg, filePane, regPane, status);
  const pc = parcelsRow ? sw('필지 단위 집계', parcels) : null;
  const el = h('div.rg-opt', { class: required ? 'is-req' : '' }, required ? null : use.el, detail, pc?.el);
  host.append(el);

  use.box.addEventListener('change', () => { detail.hidden = !use.box.checked; refresh(); });
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    S.mode = b.dataset.k;
    for (const x of seg.children) x.setAttribute('aria-selected', String(x === b));
    filePane.hidden = S.mode !== 'file'; regPane.hidden = S.mode !== 'region';
    if (S.mode === 'region' && !S.sgg && sgg()) pickSgg(sgg());
    refresh();
  });
  fileIn.addEventListener('change', () => { S.file = fileIn.files?.[0] || null; fileName.textContent = S.file ? S.file.name : KINDS; fileBox.classList.toggle('is-set', !!S.file); refresh(); });
  buf.box.addEventListener('change', () => { bufRow.hidden = !buf.box.checked; refresh(); });
  let t = 0;
  bufIn.addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 500); });
  emdSel.addEventListener('change', () => { S.emd = emdSel.value; refresh(); });

  let rp = null;
  regionPicker(where, { onPick: (r) => pickSgg(r) }).then((x) => { rp = x; rp.input.placeholder = '시군구 이름으로 찾기'; }).catch(() => {});
  async function pickSgg(r) {
    if (!r) return;
    const cd = typeof r === 'string' ? r : r.sgg_cd;
    S.sgg = { sgg_cd: cd, name: r.name || '' }; S.emd = '';
    if (rp) setTimeout(() => { rp.input.value = r.name || rp.items?.find((x) => x.sgg_cd === cd)?.name || ''; }, 0);
    emdSel.replaceChildren(h('option', { value: '', text: '전체 읍면동' })); emdSel.disabled = true;
    refresh();
    try {
      const fc = await api(`/regions/${encodeURIComponent(cd)}/emd`);
      const fs = [...(fc.features || [])].sort((a, b) => String(a.properties?.name).localeCompare(String(b.properties?.name), 'ko'));
      emdSel.append(...fs.map((f) => h('option', { value: f.properties.emd_cd, text: f.properties.name })));
      emdSel.disabled = false;
    } catch { /* 읍면동을 못 받으면 시군구 전체로 */ }
  }

  const bufM = () => (buf.box.checked ? Math.max(0, Math.min(1000, Math.round(+bufIn.value || 0))) : 0);
  function want() {
    if (!use.box.checked) return null;
    if (S.mode === 'file') return S.file ? { k: `f:${S.file.name}:${S.file.size}:${S.file.lastModified}:${bufM()}` } : null;
    const code = S.emd || S.sgg?.sgg_cd;
    return code ? { k: `r:${code}`, code } : null;
  }
  function say(text, warn) { status.hidden = !text; status.textContent = text || ''; status.classList.toggle('warn', !!warn); }
  async function refresh() {
    const w = want();
    if (!w) { if (S.range || S.key) { S.range = null; S.key = ''; onRange(null); } say(''); return; }
    if (w.k === S.key && (S.range || S.busy)) return S.busy;
    S.key = w.k; S.range = null; say('구간 확인 중');
    const my = w.k;
    S.busy = (async () => {
      let r;
      try {
        if (w.code) r = await api(endpoint, { method: 'POST', body: { regions: [w.code], origin: 'card' } });
        else {
          const fd = new FormData();
          fd.append('file', S.file); fd.append('buffer_m', String(bufM())); fd.append('name', S.file.name.replace(/\.[^.]+$/, '')); fd.append('origin', 'card');
          const s = session.get();
          const res = await fetch(API.prefix + endpoint, { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
          r = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(r?.error?.message || '구간을 읽지 못했습니다');
        }
      } catch (e) { if (S.key === my) { say(e.message || '구간을 읽지 못했습니다', true); S.key = ''; } return null; }
      finally { if (S.key === my) S.busy = null; }
      if (S.key !== my) return null;
      S.range = r;
      const km2 = Number(r.area?.value ?? 0);
      say(`${String(r.word || '').replace(/^구간: /, '')} · ${km2.toLocaleString('ko-KR', { maximumFractionDigits: km2 < 10 ? 2 : 0 })}㎢`);
      onRange(r);
      return r;
    })();
    return S.busy;
  }

  return {
    el,
    range: () => (use.box.checked ? S.range : null),
    on: () => use.box.checked,
    parcels: () => (pc ? pc.on() : false),
    ready: async () => { await refresh(); return use.box.checked ? S.range : null; },
    setRegion: (r) => { if (!S.sgg && r) pickSgg(r); },
    setOn: (v) => { use.box.checked = !!v || required; detail.hidden = !use.box.checked; refresh(); },
    /* 다른 길(최근 쓴 구간)로 구간을 고르면 — 올린 파일 · 고른 행정구역을 비운다(두 값이 함께 남지 않게) */
    clear: () => { S.file = null; fileIn.value = ''; fileName.textContent = KINDS; fileBox.classList.remove('is-set'); S.sgg = null; S.emd = ''; if (rp) rp.input.value = '';
      emdSel.replaceChildren(h('option', { value: '', text: '전체 읍면동' })); emdSel.disabled = true; S.key = ''; S.range = null; say(''); },
  };
}
