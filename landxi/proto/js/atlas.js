/* 결과 아틀라스 — 이 지면의 목적.
   13개 서비스 라인업 옆에 **실제로 돌린 분석 결과**를 놓는다. 없는 것은 그리지 않는다.

   여기에 사는 것 셋:
     ① buildRows  — 실데이터 카탈로그(RESULTS · IMAGERY · CHANGE · CROPS)를 판(plate) 행으로 정규화한다.
     ② indexHTML / rowsHTML — 좌측 색인 13행과 클래스 행 마크업(벤치마크 §1 헤어라인 인덱스).
     ③ makeAtlas  — 스티키 50 : 50. 왼쪽은 고정 챕터 메뉴 + 캡션 블록,
                     오른쪽은 끊김 없는 세로 필름스트립. 살아 있는 판 하나만 지도가 맡고,
                     나머지는 실타일을 구운 정지 판이다(§5 규칙 2 — 가짜 애니메이션 금지).

   색은 하나다(LX 블루). 클래스 스와치 8×2px 만 지도와 같은 도메인 고정색을 쓴다 —
   그건 장식이 아니라 범례이고, 판 안의 탐지 색과 어긋나면 거짓말이 되기 때문이다(Roboflow #14). */

import { AOI } from './style.js';
import { EASE } from './plate.js';
import { fmt, develop, drawHist, bakePlate, paintPlate, clamp01 } from './hud.js';
import { label as clsLabel, colorOf } from './results.js';
import { CHANGE } from '../../assets/data/change.js';

/* ── 캡션 날짜 — Vantor §4.6 "PLACE · DATE" 의 DATE 쪽 ──── */
export function stamp(d) {
  if (!d) return '—';
  const m = String(d).match(/(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!m) return String(d);
  const y = m[1], mo = String(+m[2]).padStart(2, '0');
  // 'YYYY-MM' 에 '-01' 을 붙여 넘어온 월 단위 촬영일은 일자를 쓰지 않는다.
  return (m[3] && +m[3] !== 1) ? `${y}.${mo}.${String(+m[3]).padStart(2, '0')}` : `${y}.${mo}`;
}

/* ── 사전 크롭 카탈로그 키 ─────────────────────────────────
   RESULTS 4종은 id 가 그대로 크롭 키다. 결과 파일이 없는 3종만 여기서 이어 준다. */
export const CROP_KEY = {
  'jeju-illegal-2020': 'jeju-illegal',
  'kuksan-2sortie': 'kuksan-change',
  'namwon-change': 'namwon-epoch',
};

// Acquired 인셋 캡션 — 등록된 탐지면 신뢰도·면적, 순수 시계열이면 촬영 시점.
export function cropLabel(c) {
  if (!c) return '—';
  if (c.conf != null && c.area_m2 != null) return `${c.conf.toFixed(2)} · ${fmt(Math.round(c.area_m2))}㎡`;
  if (c.conf != null) return c.conf.toFixed(2);
  if (c.epoch) return String(c.epoch);
  if (c.lnglat) return `${c.lnglat[1].toFixed(4)} ${c.lnglat[0].toFixed(4)}`;
  return '—';
}

const SENSOR = { drone: '드론 정사영상', aerial: '항공 정사영상', satellite: '위성영상' };
// 색인 3컬럼(≈310px)에 부처를 끼워 넣으려면 줄여야 한다. 줄이되 지어내지 않는다.
export const MIN_ABBR = {
  '해양수산부': '해수부', '농림축산식품부': '농식품부', '국토교통부': '국토부',
  '환경부': '환경부', '산업통상자원부': '산업부', 'LX 한국국토정보공사': 'LX',
};
// 변화지수는 비지도 분류다 — 도메인 고정색이 없으므로 여기서 한 번만 못 박는다.
const CHANGE_CLS = {
  veg_gain: ['식생 증가', '#40DE8A'], veg_loss: ['식생 감소', '#B9822E'],
  built_new: ['신규 구조물', '#F2622A'], other: ['기타', '#6675FF'],
};

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ENT[c]);

/* ── 색인 13행 ──────────────────────────────────────────── */
export function indexHTML(SVC, ROWS) {
  return SVC.map((s, i) => {
    const rs = ROWS.filter((r) => r.service === s.id);
    const n = rs.reduce((a, r) => a + (r.count || 0), 0);
    const unit = (rs.find((r) => r.count != null) || {}).unit || '';
    const real = rs.some((r) => r.count != null);
    const cell = real
      ? `<span class="c">${fmt(n)}<u>${esc(unit)}</u></span>`
      : '<s>준비 중</s>';
    const aria = real ? `실제 분석 결과 ${fmt(n)}${unit}` : '실데이터 준비 중';
    return `<li data-id="${esc(s.id)}"${real ? ' class="real"' : ''} tabindex="0" role="button"`
      + ` aria-label="${esc(s.name)} · ${esc(s.ministry)} · ${aria}">`
      + `<i class="n">${String(i + 1).padStart(2, '0')}</i>`
      + `<span class="m">${esc(s.name)}</span>${cell}`
      + `<span class="p">${esc(MIN_ABBR[s.ministry] || s.ministry)}</span></li>`;
  }).join('');
}

/* ── 클래스 행 — 헤어라인 + 단일 액센트 바 ─────────────────
   50% 컬럼 한 화면에 통계 124px 과 같이 서야 하므로 최대 5행이다.
   넘치면 상위 4개 + 꼬리 합계로 접는다 — 잘라 버리지 않고 합계로 남긴다. */
export function rowsHTML(classes, fixedMap) {
  if (!classes || !classes.length) return '';
  let list = classes;
  if (list.length > 5) {
    const head = list.slice(0, 4), tail = list.slice(4);
    list = head.concat([{
      key: '_rest', name: `기타 ${tail.length}종`, color: '#AAAEB4',
      n: tail.reduce((a, c) => a + c.n, 0), unit: tail[0].unit,
    }]);
  }
  const max = list.reduce((a, c) => Math.max(a, c.n), 0) || 1;
  return '<ul class="rows">' + list.map((c) => {
    const col = (fixedMap && fixedMap[c.key]) || c.color || '#006DF7';
    return `<li><span class="k"><s style="background:${esc(col)}"></s>${esc(c.name)}</span>`
      + `<span class="bar" style="--w:${(c.n / max * 100).toFixed(1)}%"></span>`
      + `<span class="v">${fmt(c.n)}<u>${esc(c.unit || '')}</u></span></li>`;
  }).join('') + '</ul>';
}

/* ── 행 정규화 ──────────────────────────────────────────── */
// 판을 구울 줌 — 경계가 판 폭(≈700px)에 딱 차는 정수 줌.
function pickZ(bounds, wPx, lo, hi) {
  const span = Math.max(1e-6, bounds[2] - bounds[0]);
  const z = Math.round(Math.log2((wPx * 360) / (256 * span)));
  return Math.max(lo, Math.min(hi, z));
}
const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

function fromResult(R) {
  const st = R.stats || {};
  const classes = Object.entries(st.classes || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n], i) => ({ key: k, name: clsLabel(k), n, color: colorOf(k, i) }));
  const clsMap = {};
  classes.forEach((c) => { clsMap[c.key] = c.color; });
  const conf = (st.confHist && st.confBins && st.confMin != null && st.confMax > st.confMin)
    ? { lo: st.confMin, hi: st.confMax, hist: st.confHist, bins: st.confBins } : null;
  return {
    id: R.id, service: R.service, title: R.title, region: R.region,
    sensor: SENSOR[R.sensor] || R.sensor,
    count: st.count, unit: R.unit,
    shot: st.analyzedAt, when: stamp(st.analyzedAt),
    geojson: '../' + R.geojson,
    camera: { ...R.camera },
    classes, clsMap, fixedMap: clsMap,
    conf,
    what: R.what,
    prov: `원본 ${R.src} · 레이어 ${R.layer} · EPSG:5186 → 4326 · 분석 ${stamp(st.analyzedAt)}`,
    bbox: st.bbox,
  };
}

export function buildRows(RESULTS, sat) {
  const by = {};
  for (const R of RESULTS || []) by[R.id] = R;
  const out = [];

  // ① 여수 해양쓰레기 — 항공(2025) · 드론(2026). 로컬 정사영상이 없어 판은 V-World 위성이다.
  for (const id of ['yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone']) {
    if (!by[id]) continue;
    const r = fromResult(by[id]);
    r.place = '전남 여수시';
    r.plate = { src: sat, bounds: r.bbox, z: pickZ(r.bbox, 700, 8, 18) };
    out.push(r);
  }
  // ② 남원 농지이용 · 비닐하우스 — 남원 전역 정사영상(namwon_city_2510, 코어 GSD 0.6 m).
  for (const id of ['namwon-farmland-2025', 'namwon-greenhouse-2025']) {
    if (!by[id]) continue;
    const r = fromResult(by[id]);
    r.place = '전북 남원시';
    r.plate = { src: 'namwon_city_2510', bounds: r.bbox, z: pickZ(r.bbox, 700, 11, 17) };
    out.push(r);
  }
  // ③ 제주 불법건축물 — 결과 geojson 이 없다. 판독 도엽과 사전 크롭만 있다.
  out.push({
    id: 'jeju-illegal-2020', service: 'farmland',
    title: '제주 불법건축물 판독', region: '제주특별자치도', place: '제주 애월읍',
    sensor: '항공 정사영상 · GSD 10 cm',
    count: null, unit: '개소', statText: '4', statUnit: '개소 판독',
    shot: '2020-12', when: stamp('2020-12'),
    geojson: null,
    camera: { center: mid(AOI.jeju20), zoom: 18.2, pitch: 0, bearing: 0 },
    classes: [{ key: '불법건축물', name: '불법건축물', n: 4, color: '#F2622A', unit: '개소' }],
    clsMap: { 불법건축물: '#F2622A' }, fixedMap: { 불법건축물: '#F2622A' }, fixed: '#F2622A',
    conf: null,
    what: '제주 항공 정사영상 2020.12 도엽에서 판독한 불법건축물 4개소.',
    noConfNote: '판독 결과가 좌표 목록으로만 남아 신뢰도가 기록되지 않았다.',
    prov: '제주 항공 정사영상 2020.12(불법건축물 도엽) · 원본 shp 좌표 기준 z19 크롭 · 등록 탐지 geojson 없음',
    plate: { src: 'jeju_2020', bounds: AOI.jeju20, z: pickZ(AOI.jeju20, 700, 13, 19) },
  });
  // ④ 국산리 2소티 — 같은 날 두 번 뜬 드론. 등록된 탐지가 아니라 시계열 원본 그 자체다.
  out.push({
    id: 'kuksan-2sortie', service: 'change',
    title: '국산리 드론 2소티 비교', region: '전북 완주군', place: '전북 완주 국산리',
    sensor: '드론 정사영상 · GSD 5 cm',
    count: null, unit: '소티', statText: '2', statUnit: '소티 · 등록 탐지 없음',
    shot: '2025-08', when: stamp('2025-08'),
    geojson: null,
    camera: { center: mid(AOI.kuksan), zoom: 17.2, pitch: 0, bearing: 0 },
    classes: [
      { key: 'a68', name: 'A68 소티', n: 1, color: '#006DF7', unit: '회' },
      { key: 'a71', name: 'A71 소티', n: 1, color: '#8FB6E8', unit: '회' },
    ],
    clsMap: {}, fixedMap: { a68: '#006DF7', a71: '#8FB6E8' },
    conf: null,
    what: '같은 날 두 번 비행한 드론 정사영상 두 벌. AI 결과가 아니라 비교 원본이다.',
    noConfNote: '등록된 탐지가 아니라 시계열 원본 두 벌이다.',
    prov: 'LX 드론 정사영상 kuksan_a68 / kuksan_a71 · 2025.08 · GSD 5 cm · 등록 탐지 geojson 없음',
    plate: { src: 'kuksan_a68', bounds: AOI.kuksan, z: pickZ(AOI.kuksan, 700, 13, 19) },
  });
  // ⑤ 남원 변화지수 — 비지도. 라벨이 없으므로 신뢰도 축을 만들지 않는다.
  const pair = (CHANGE || []).find((c) => c.pair === '2504-2510');
  if (pair) {
    const bc = (pair.stats && pair.stats.byClass) || {};
    const classes = Object.entries(bc).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({
      key: k, name: (CHANGE_CLS[k] || [k])[0], n,
      color: (CHANGE_CLS[k] || [null, '#006DF7'])[1], unit: '구역',
    }));
    const clsMap = {};
    Object.keys(CHANGE_CLS).forEach((k) => { clsMap[k] = CHANGE_CLS[k][1]; });
    out.push({
      id: 'namwon-change', service: 'change',
      title: '남원 사매면 변화지수(비지도)', region: '전북 남원시', place: '남원 사매면 전북',
      sensor: '드론 정사영상 4시점',
      count: pair.stats.n, unit: '구역',
      shot: '2025-10', when: pair.label,
      geojson: '../' + pair.polygons,
      filter: (f) => f && f.properties && f.properties.pair === pair.pair,
      camera: { center: mid(AOI.namwon), zoom: 17.3, pitch: 0, bearing: 0 },
      classes, clsMap, fixedMap: clsMap,
      conf: null,
      noConfNote: '비지도 변화지수라 학습 라벨이 없다.',
      swipe: { bdir: 'namwon_2510', bounds: AOI.namwon, z: 17, la: '2025.04', lb: '2025.10' },
      what: `${pair.method} · ${pair.label} · ${fmt(pair.stats.n)}구역 ${fmt(Math.round(pair.stats.area_m2))}㎡.`,
      prov: `LX 드론 정사영상 4시점(2025.04 → 2025.10) 변화지수 · 비지도 · 학습 라벨 없음 · ${pair.polygons.split('/').pop()}`,
      plate: { src: 'namwon_2510', bounds: AOI.namwon, z: pickZ(AOI.namwon, 700, 14, 19) },
    });
  }

  // FIG 번호는 1·2·3장이 01–03 을 쓴 다음부터 이어진다.
  out.forEach((r, i) => { r.fig = 'FIG. ' + String(i + 4).padStart(2, '0'); });
  return out;
}

/* ── 히스토그램에서 임계 이상 개수 ─────────────────────────
   실제 분포(파이프라인 산출 confHist)를 쓰되 구간 안쪽은 선형으로 나눈다.
   그래서 문구는 "표시"다 — 정확한 개체 수라고 말하지 않는다. */
function countAbove(conf, val) {
  const { hist, bins } = conf;
  let n = 0;
  for (let k = 0; k < hist.length; k++) {
    const b0 = bins[k], b1 = bins[k + 1];
    if (val <= b0) n += hist[k];
    else if (val < b1) n += hist[k] * ((b1 - val) / ((b1 - b0) || 1));
  }
  return Math.round(n);
}

/* ── 스티키 50 : 50 아틀라스 ────────────────────────────── */
export function makeAtlas({ left, right, strip, rows, tier, crops, sat }) {
  const N = rows.length;
  const cbCut = [], cbPick = [];
  let live = -1, PH = 0, PAD = 0, G = 56, lastH = 0, lastW = 0;

  /* ── 왼쪽: 라벨 · 챕터 메뉴 · 캡션 블록 ── */
  const lab = document.createElement('p');
  lab.id = 'res-lab';
  lab.className = 'label';
  lab.innerHTML = `04 — 결과 아틀라스 · 실제 분석 결과<b>${N}건</b>`;

  const menu = document.createElement('nav');
  menu.id = 'res-menu';
  menu.setAttribute('aria-label', '실제 분석 결과 데이터셋');
  menu.innerHTML = rows.map((r, i) =>
    `<button type="button" data-i="${i}" aria-current="false">`
    + `<i>${String(i + 1).padStart(2, '0')}</i>`
    + `<span>${esc(r.title)}</span>`
    + `<b>${r.count != null ? fmt(r.count) + esc(r.unit || '') : esc((r.statText || '') + (r.unit || ''))}</b>`
    + '</button>').join('');

  const blocksEl = document.createElement('div');
  blocksEl.id = 'res-blocks';
  blocksEl.innerHTML = rows.map((r, i) => {
    const statTxt = r.count != null ? fmt(r.count) : (r.statText || '—');
    const statUnit = r.count != null ? (r.unit || '') : (r.statUnit || '');
    const noConf = r.noConfNote || '등록된 탐지가 아니라 시계열 원본이다.';
    const ctl = r.conf
      ? `<div class="ctl">`
        + `<label for="rc${i}">신뢰도 임계값<output id="rc${i}-out">${r.conf.lo.toFixed(3)}</output></label>`
        + `<input id="rc${i}" type="range" min="${r.conf.lo}" max="${r.conf.hi}" step="0.002"`
        + ` value="${r.conf.lo}" aria-label="${esc(r.title)} 신뢰도 임계값">`
        + `<canvas id="rh${i}" aria-hidden="true"></canvas>`
        + `<p class="n"><b id="rcn${i}">${fmt(r.count)}</b> / ${fmt(r.count)} 표시`
        + ' · 이하는 무채로 남는다</p></div>'
      : `<p class="rpend">신뢰도 축이 없다. ${noConf} 없는 축을 만들지 않는다.</p>`;
    return `<article class="rb" data-i="${i}" aria-label="${esc(r.title)}">`
      + '<div class="rb-head">'
      + `<p class="caption">${esc(r.place)} · ${esc(r.sensor)} · ${esc(r.when)}</p>`
      + `<h3>${esc(r.title)}</h3>`
      + `<p class="rnum"><span class="stat num" id="rs${i}">${statTxt}</span>`
      + `<span class="label">${esc(statUnit)}</span></p></div>`
      + `<div class="rb-a">${rowsHTML(r.classes, r.fixedMap)}`
      + `${r.what ? `<p class="caption rsub">${esc(r.what)}</p>` : ''}</div>`
      + `<div class="rb-b">${ctl}<small class="prov">${esc(r.prov)}</small></div>`
      + '</article>';
  }).join('');

  left.replaceChildren(lab, menu, blocksEl);
  const menuBtns = [...menu.children];
  const blocks = [...blocksEl.children];

  /* ── 오른쪽: 세로 필름스트립 ── */
  strip.innerHTML = rows.map((r, i) =>
    `<figure class="rp" data-i="${i}">`
    + '<canvas class="pl"></canvas>'
    + '<div class="fr"><i></i><i></i></div>'
    + '<figure class="racq" hidden><canvas width="132" height="132"></canvas>'
    + '<figcaption><b>ACQUIRED</b><span>—</span></figcaption></figure>'
    + `<div class="pcap"><span>${esc(r.fig)} · ${esc(r.place)}</span>`
    + `<b>${esc(stamp(r.shot))}</b></div></figure>`).join('');
  const rps = [...strip.children];

  /* ── 치수 — 판은 컨테이너 높이의 74%, 좌우는 12컬럼 경계에 선다 ── */
  function measure() {
    const H = right.clientHeight || (innerHeight - 144);
    const W = right.clientWidth || innerWidth / 2;
    if (H === lastH && W === lastW) return;
    lastH = H; lastW = W;
    const cs = getComputedStyle(document.documentElement);
    const g = parseFloat(cs.getPropertyValue('--g')) || 64;
    const gap = parseFloat(cs.getPropertyValue('--gap')) || 24;
    /* 판 하나만 액자에 든다. 위아래 이웃이 화면에 걸치면 필름스트립이 아니라
       '스크롤이 어중간하게 멈춘 목록'으로 읽힌다 — 간격을 여백보다 크게 잡아 밀어낸다. */
    PH = Math.max(180, Math.round(H * 0.70));
    PAD = Math.max(0, Math.round((H - PH) / 2));
    G = PAD + 6;
    strip.style.padding = `${PAD}px ${g}px 0 ${gap}px`;
    rps.forEach((el) => { el.style.height = PH + 'px'; el.style.marginBottom = G + 'px'; });
  }

  /* ── 판 굽기 — 실타일을 굽고, 실탐지를 그 위에 그린다 ── */
  const SCALE = tier === 'full' ? 0.8 : 0.55;
  const baked = new Array(N).fill(0);   // 0 미착수 · 1 진행 · 2 완료
  const geoCache = new Map();

  function loadGeo(url) {
    if (!geoCache.has(url)) {
      geoCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return geoCache.get(url);
  }

  function featsFor(fc, row) {
    const out = [];
    for (const f of (fc && fc.features) || []) {
      if (!f || !f.geometry) continue;
      if (row.filter && !row.filter(f)) continue;
      const p = f.properties || {};
      const cls = p.cls != null ? p.cls : (p.class != null ? p.class : p.label);
      const raw = p.conf != null ? p.conf : (p.confidence != null ? p.confidence : p.score);
      const c = Number(raw);
      out.push({
        g: f.geometry,
        conf: Number.isFinite(c) ? c : null,
        color: (row.clsMap && row.clsMap[cls]) || row.fixed || '#F2622A',
      });
    }
    out.sort((a, b) => (b.conf == null ? 1 : b.conf) - (a.conf == null ? 1 : a.conf));
    return out.length > 2600 ? out.slice(0, 2600) : out;
  }

  async function ensureBake(i) {
    if (i < 0 || i >= N || baked[i]) return;
    baked[i] = 1;
    const r = rows[i];
    const rp = rps[i];
    const cv = rp.querySelector('canvas.pl');
    measure();
    const w = Math.max(64, Math.round((rp.clientWidth || 600) * SCALE));
    const h = Math.max(64, Math.round((rp.clientHeight || PH) * SCALE));
    let pl = null;
    try { pl = await bakePlate({ ...r.plate, w, h }); } catch (e) { pl = null; }
    // 로컬 정사영상 타일이 없으면 V-World 위성으로 물러선다 — 검은 판을 내놓지 않는다.
    if ((!pl || !pl.hit) && sat && r.plate.src !== sat) {
      try {
        pl = await bakePlate({
          src: sat, bounds: r.plate.bounds, z: pickZ(r.plate.bounds, 700, 8, 18), w, h,
        });
      } catch (e) { /* noop */ }
    }
    if (!pl) { baked[i] = 2; return; }
    let feats = [];
    if (r.geojson) {
      const fc = await loadGeo(r.geojson);
      if (fc) feats = featsFor(fc, r);
    }
    try { paintPlate(cv, pl, feats, -1, 1); } catch (e) { /* noop */ }
    rp.classList.add('baked');
    baked[i] = 2;
    paintCrop(i);
  }

  /* ── Acquired 인셋 — 사전 크롭(실 z19 타일)이 있는 행만 ── */
  const cropDone = new Array(N).fill(false);
  function paintCrop(i) {
    if (cropDone[i] || !crops) return;
    const r = rows[i];
    const list = crops[CROP_KEY[r.id] || r.id];
    if (!list || !list.length) return;
    cropDone[i] = true;
    const c = list[0];
    const fig = rps[i].querySelector('.racq');
    const img = new Image();
    img.onload = () => {
      const x = fig.querySelector('canvas').getContext('2d');
      x.clearRect(0, 0, 132, 132);
      x.drawImage(img, 0, 0, 132, 132);
      fig.querySelector('figcaption span').textContent = cropLabel(c);
      fig.hidden = false;
    };
    img.onerror = () => { cropDone[i] = false; };
    img.src = '../' + String(c.file).replace(/^\.?\//, '');
  }

  /* ── 신뢰도 슬라이더 — 값을 만지면 지도가 같은 프레임에 답한다(판정 규칙 3) ── */
  rows.forEach((r, i) => {
    if (!r.conf) return;
    const sl = blocksEl.querySelector('#rc' + i);
    if (!sl) return;
    const out = blocksEl.querySelector('#rc' + i + '-out');
    const cv = blocksEl.querySelector('#rh' + i);
    const nEl = blocksEl.querySelector('#rcn' + i);
    const paint = () => {
      const val = +sl.value;
      out.textContent = val.toFixed(3);
      nEl.textContent = fmt(countAbove(r.conf, val));
      try {
        drawHist(cv, r.conf.hist, val, null, r.conf.bins[0], r.conf.bins[r.conf.bins.length - 1]);
      } catch (e) { /* noop */ }
      cbCut.forEach((fn) => fn(i, val));
    };
    sl.addEventListener('input', paint);
    sl.addEventListener('click', (e) => e.stopPropagation());
    r._paintCtl = paint;
  });

  /* ── 상호작용 — 메뉴 ↔ 판이 서로를 가리킨다(호버 180ms) ── */
  const pick = (i) => cbPick.forEach((fn) => fn(i));
  menuBtns.forEach((b, i) => {
    b.addEventListener('click', () => pick(i));
    b.addEventListener('pointerenter', () => rps[i].classList.add('hot'));
    b.addEventListener('pointerleave', () => rps[i].classList.remove('hot'));
    b.addEventListener('focus', () => rps[i].classList.add('hot'));
    b.addEventListener('blur', () => rps[i].classList.remove('hot'));
  });
  rps.forEach((el, i) => {
    el.addEventListener('click', () => pick(i));
    el.addEventListener('pointerenter', () => menuBtns[i].classList.add('hot'));
    el.addEventListener('pointerleave', () => menuBtns[i].classList.remove('hot'));
  });
  addEventListener('resize', () => { lastH = 0; lastW = 0; measure(); });
  measure();

  function setLive(i) {
    if (i === live) return;
    live = i;
    rps.forEach((el, j) => el.classList.toggle('live', j === i));
    blocks.forEach((el, j) => el.classList.toggle('on', j === i));
    menuBtns.forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
    if (i < 0) return;
    // 숫자는 페이드가 아니라 한 글자씩 현상된다(벤치마크 §4.4).
    const r = rows[i];
    const el = blocksEl.querySelector('#rs' + i);
    if (el) develop(el, r.count != null ? fmt(r.count) : (r.statText || '—'));
    if (r._paintCtl) requestAnimationFrame(r._paintCtl);
    ensureBake(i); ensureBake(i + 1); ensureBake(i - 1);
    paintCrop(i);
  }

  /* ── p → 스트립 위치. 행마다 머무는 계단 이징이라 각 데이터셋이 실제로 '읽힌다'. ── */
  function layout(t) {
    if (!N) return -1;
    measure();
    const u = clamp01(t) * (N - 1);
    let i = Math.min(N - 1, Math.floor(u));
    let f = u - i;
    if (i >= N - 1) { i = N - 1; f = 0; }
    const fe = EASE(clamp01((f - 0.14) / 0.68));
    strip.style.transform = `translate3d(0,${(-(i + fe) * (PH + G)).toFixed(1)}px,0)`;
    return Math.min(N - 1, i + (fe >= 0.5 ? 1 : 0));
  }

  return {
    layout,
    setLive,
    onCut(fn) { cbCut.push(fn); },
    onPick(fn) { cbPick.push(fn); },
    rowRect() {
      if (live < 0 || !rps[live]) return null;
      const r = rps[live].getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return null;
      return r;
    },
    get live() { return live; },
    get plates() { return rps; },
  };
}
