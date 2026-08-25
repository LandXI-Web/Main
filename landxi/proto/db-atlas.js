// FIG 판 — 전국 시군구 실경계 코로플레스 + 14×7 헤어라인 매트릭스.
// 배경 지도의 한 조각을 잘라 오는 것이 아니라, sigungu.geojson(249개 실경계)을 이 자리에서
// 직접 투영해 그린다. 색은 액센트 하나뿐이고 농도만 커버리지를 말한다. 미커버는 헤어라인만.
import { COVERAGE, COLS, nf } from './db-data.js';

const SIGUNGU = '../assets/data/geo/sigungu.geojson';
const SIDO = '../assets/data/geo/sido.geojson';
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const byCode = Object.fromEntries(COVERAGE.map((r) => [r.code, r]));
const colById = Object.fromEntries(COLS.map((c) => [c.id, c]));

/** 등장방형 + cos(중위도) 보정. 이 축척(한반도)에서 이 이상은 과잉이다. */
function projector(bbox, W) {
  const [x0, y0, x1, y1] = bbox;
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const w = (x1 - x0) * k;
  const h = y1 - y0;
  const s = W / w;
  const H = h * s;
  return {
    W, H,
    xy: (lng, lat) => [((lng - x0) * k * s), (y1 - lat) * s],
  };
}

function bboxOf(feats) {
  let a = 9e9, b = 9e9, c = -9e9, e = -9e9;
  for (const f of feats) {
    each(f, (lng, lat) => {
      if (lng < a) a = lng; if (lng > c) c = lng;
      if (lat < b) b = lat; if (lat > e) e = lat;
    });
  }
  return [a, b, c, e];
}

function each(f, fn) {
  const g = f.geometry; if (!g) return;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of polys) for (const r of p) for (const pt of r) fn(pt[0], pt[1]);
}

function pathOf(f, xy) {
  const g = f.geometry; if (!g) return '';
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let dd = '';
  for (const p of polys) {
    for (const ring of p) {
      let prev = null;
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = xy(ring[i][0], ring[i][1]);
        const s = `${x.toFixed(1)},${y.toFixed(1)}`;
        if (s === prev) continue;                       // 같은 픽셀로 접히는 점은 버린다
        dd += (prev === null ? 'M' : 'L') + s;
        prev = s;
      }
      dd += 'Z';
    }
  }
  return dd;
}

async function grab(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

/**
 * 커버리지 판을 그리고 매트릭스와 양방향으로 묶는다.
 * @param {HTMLElement} root  `#sec-cov`
 * @returns {{highlight(code:string|null):void, codes():string[], count():number}}
 */
export async function mountAtlas(root) {
  const svg = root.querySelector('#atlas');
  const tip = root.querySelector('#cov-tip');
  const mat = root.querySelector('#matrix');

  buildMatrix(mat);

  let sigungu = null, sido = null;
  try { [sigungu, sido] = await Promise.all([grab(SIGUNGU), grab(SIDO)]); }
  catch (e) {
    svg.insertAdjacentHTML('beforeend', `<text x="12" y="28" class="a-miss">경계 자료를 불러오지 못했습니다 — ${esc(e.message)}</text>`);
  }

  const api = { highlight, codes: () => COVERAGE.map((r) => r.code), count: () => (sigungu ? sigungu.features.length : 0) };

  if (sigungu) {
    const W = 1000;
    const pj = projector(bboxOf(sigungu.features), W);
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.round(pj.H)}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const gBase = svg.querySelector('#a-base');
    const gLit = svg.querySelector('#a-lit');
    const gSido = svg.querySelector('#a-sido');
    const gMark = svg.querySelector('#a-mark');

    const frag = document.createDocumentFragment();
    const litFrag = document.createDocumentFragment();
    for (const f of sigungu.features) {
      const code = f.properties.code;
      const row = byCode[code];
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', pathOf(f, pj.xy));
      if (row) {
        p.setAttribute('class', 'a-lit');
        p.setAttribute('data-code', code);
        // 단일 액센트, 농도만 커버리지를 말한다. 무지개 금지(§4 색).
        p.style.fillOpacity = (0.10 + row.coverage * 0.72).toFixed(3);
        p.append(Object.assign(document.createElementNS(NS, 'title'), {
          textContent: `${row.name} · 커버리지 ${Math.round(row.coverage * 100)}%`,
        }));
        litFrag.append(p);
      } else {
        p.setAttribute('class', 'a-base');
        frag.append(p);
      }
    }
    gBase.append(frag);
    gLit.append(litFrag);

    if (sido) {
      const sf = document.createDocumentFragment();
      for (const f of sido.features) {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', pathOf(f, pj.xy));
        p.setAttribute('class', 'a-sido');
        sf.append(p);
      }
      gSido.append(sf);
    }

    // 실증 구역 헤어라인 브래킷 — 캡션은 이미지 안, 스티커 패널이 아니다.
    const lit = sigungu.features.filter((f) => byCode[f.properties.code]);
    if (lit.length) {
      const [a, b, c, e] = bboxOf(lit);
      const [x0, y1] = pj.xy(a, e);
      const [x1, y0] = pj.xy(c, b);
      const pad = 10;
      gMark.insertAdjacentHTML('beforeend', bracket(x0 - pad, y1 - pad, x1 + pad, y0 + pad));
      gMark.insertAdjacentHTML('beforeend',
        `<text class="a-cap" x="${(x1 + pad).toFixed(1)}" y="${(y1 - pad - 12).toFixed(1)}" text-anchor="end">전북특별자치도 · 실증 ${COVERAGE.length} 시군</text>`);
    }

    // 실제 분석 결과가 있는 자리 — 정적 헤어라인 십자. 움직이는 것은 화면당 하나뿐이다.
    for (const m of await marks()) {
      const [x, y] = pj.xy(m.lng, m.lat);
      gMark.insertAdjacentHTML('beforeend',
        `<g class="a-pin"><path d="M${(x - 11).toFixed(1)},${y.toFixed(1)}h22M${x.toFixed(1)},${(y - 11).toFixed(1)}v22"/>` +
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>` +
        `<text class="a-cap" x="${(x + 16).toFixed(1)}" y="${(y + 6).toFixed(1)}">${esc(m.label)}</text></g>`);
    }

    // 판 위 호버 — 커서는 십자, 반응은 툴팁 + 매트릭스 행
    gLit.addEventListener('pointermove', (ev) => {
      const p = ev.target.closest('path.a-lit');
      if (!p) return;
      const r = byCode[p.dataset.code];
      const box = svg.getBoundingClientRect();
      tip.style.left = `${ev.clientX - box.left}px`;
      tip.style.top = `${ev.clientY - box.top}px`;
      showTip(tip, r);
      highlight(p.dataset.code, 'plate');
    });
    gLit.addEventListener('pointerleave', () => { tip.hidden = true; highlight(null, 'plate'); });
  }

  /* ── 매트릭스 ↔ 판 ─────────────────────────────────────────────── */
  mat.addEventListener('pointerover', (ev) => {
    const cell = ev.target.closest('[data-code]');
    if (!cell) return;
    highlight(cell.dataset.code, 'matrix');
  });
  mat.addEventListener('pointerleave', () => highlight(null, 'matrix'));

  /** 강조는 삭제가 아니라 감쇠다 — 나머지는 흐려질 뿐 사라지지 않는다(Palantir P1). */
  function highlight(code, src) {
    root.classList.toggle('is-focus', !!code);
    root.dataset.hot = code || '';
    svg.querySelectorAll('path.a-lit').forEach((p) => p.classList.toggle('is-hot', p.dataset.code === code));
    mat.querySelectorAll('tr[data-code]').forEach((tr) => tr.classList.toggle('is-hot', tr.dataset.code === code));
    if (src === 'matrix' && code) {
      const r = byCode[code];
      const p = svg.querySelector(`path.a-lit[data-code="${code}"]`);
      if (p && r) {
        const b = p.getBBox();
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const s = box.width / (vb.width || 1);
        tip.style.left = `${(b.x + b.width / 2) * s}px`;
        tip.style.top = `${(b.y + b.height / 2) * s}px`;
        showTip(tip, r);
      }
    } else if (src === 'matrix') tip.hidden = true;
  }

  return api;
}

function showTip(tip, r) {
  if (!r) { tip.hidden = true; return; }
  const done = r.done.map((id) => colById[id].short);
  tip.innerHTML =
    `<b>${esc(r.name)}</b>` +
    `<span class="num">커버리지 ${Math.round(r.coverage * 100)}% · AI 대체 ${r.done.length}/${COLS.length}</span>` +
    `<span>${done.length ? esc(done.join(' · ')) : '현장 조사 유지'}</span>`;
  tip.hidden = false;
}

function bracket(x0, y0, x1, y1) {
  const L = 16;
  return `<path class="a-brk" d="M${x0},${y0 + L}V${y0}H${x0 + L}M${x1 - L},${y0}H${x1}V${y0 + L}` +
    `M${x1},${y1 - L}V${y1}H${x1 - L}M${x0 + L},${y1}H${x0}V${y1 - L}"/>`;
}

/** results.js 의 실제 bbox 중심 — 지어낸 좌표가 아니다. */
async function marks() {
  const { RESULTS } = await import('../assets/data/results.js');
  const seen = new Map();
  for (const r of RESULTS) {
    const b = r.stats.bbox;
    const key = r.region;
    if (!b || seen.has(key)) continue;
    seen.set(key, { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2, label: key.split(' ').pop() });
  }
  return [...seen.values()];
}

/* ── 14 × 7 = 98칸. 카드도 격자도 아닌, 선 하나로만 짜인 표. ─────────── */
function buildMatrix(mat) {
  const head = COLS.map((c) => `<th scope="col"><span>${esc(c.short)}</span><i class="label">${esc(c.ministry.split('·')[0])}</i></th>`).join('');
  const rows = COVERAGE.map((r) => {
    const cells = COLS.map((c) => {
      const on = r.done.includes(c.id);
      return `<td class="cell${on ? ' is-on' : ''}" data-code="${r.code}" data-survey="${c.id}"` +
        ` title="${esc(r.name)} · ${esc(c.short)} — ${on ? 'AI 대체 완료' : '현장 조사 유지'}">` +
        `<i></i><span class="sr">${on ? 'AI 대체 완료' : '현장 조사 유지'}</span></td>`;
    }).join('');
    return `<tr data-code="${r.code}">` +
      `<th scope="row"><a href="#" data-region="${r.code}">${esc(r.name)}</a>` +
      `<i class="num">${Math.round(r.coverage * 100)}%</i></th>${cells}` +
      `<td class="tally num">${r.done.length}/${COLS.length}</td></tr>`;
  }).join('');
  const foot = COLS.map((c) => {
    const n = COVERAGE.filter((r) => r.done.includes(c.id)).length;
    return `<td class="num">${n}</td>`;
  }).join('');
  mat.innerHTML =
    `<thead><tr><th scope="col" class="corner">시군 <i class="num">${COVERAGE.length}</i></th>${head}<th scope="col" class="tally">계</th></tr></thead>` +
    `<tbody>${rows}</tbody>` +
    `<tfoot><tr><th scope="row">시군 수</th>${foot}<td class="tally num">${nf.format(COVERAGE.reduce((a, r) => a + r.done.length, 0))}</td></tr></tfoot>`;
}
