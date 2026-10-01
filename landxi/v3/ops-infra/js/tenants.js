/* 기관 뷰 — 기관마다 이번 달 사용량(저장 · GPU 시간 · 분석 면적 · AI 도우미 요청 건수) + 서랍(공유 영상) · 기관 정보.
   기관에는 막는 한도가 없다(원칙 83 · 7차 기관-1 · 11차 "GPU 는 무상 정책") — 숫자는 '얼마나 쓰고 있나'만(한도 · % · 초과 · 조정 없음).
   사용 현황 화면(기관 비교 · 추이)은 11차 확인 대기라 새로 만들지 않았다 — 지금 있던 기관 카드에서 한도 표시만 걷었다.
   기관 서랍 '공유 영상' 칸(확인 대장 5차 역할-4 ⓑ — LX 관리자가 기관마다 고름): 관할 안 LX 영상 목록에서 켜고 끈다. 켠 영상만 그 기관이
   지도에서 보고(원본만 있는 영상도 서명 지도 조각으로 — 10-01 사용자 결정) 분석 의뢰에 불러온다(서버가 거른다 · 공유 = 권한 한 줄 · 복사 0). */
import { drawer, toast, esc, nf, api, h, empty } from './kit.js';
import { DIM, orgs, llmUsage } from './data.js';
import { openBrand } from './brand.js';   // 기관 서랍 · 기관 정보(구현 2차 T3)
import { API, session } from '../../../shared/api-v1.js';

/** 사용량 글자 — 저장은 1 GB 아래면 MB 로(0.007 GB → 7 MB) · 나머지는 항목 단위 */
function amount(D, used) {
  if (used == null) return { n: '—', unit: D.unit };
  const x = used * D.k;
  if (D.unit === 'GB' && x > 0 && x < 1) return { n: nf(x * 1000, x * 1000 < 1 ? 1 : 0), unit: 'MB' };
  return { n: nf(x, x && x < 10 ? D.d || 1 : 0), unit: D.unit };
}
/** 사용량 한 칸 — 이름 · 숫자 · 단위(한도 · % 없음) */
function stat(dim, v) {
  const D = DIM[dim];
  const used = v?.used?.value;
  const u = amount(D, used);
  return `<figure class="stat" data-metric="${esc(D.ko)}" data-v="${used ?? ''}">
    <b class="stat-n num">${u.n}<small> ${esc(u.unit)}</small></b><figcaption>${esc(D.ko)}</figcaption></figure>`;
}

/** 서랍 — 공유 영상(관리자가 기관마다 켜고 끈다) · 그림이 들어가므로 PC 600(확인 18차 M-4 ⓐ) · 휴대폰은 전체 폭 */
function sheet(o) {
  return drawer({ title: o.name, body: h('div.qs-w', {}, mainPhoto(o), shares(o)), slot: 'right', width: 600 });
}

/* 기관 메인 배경 사진(확인 18차 기관-12 ⓐ · 원칙 116) — 그 기관 결과 장면 · 공유한 영상에서 고르거나 사진을 올린다 → 미리 보기 → 저장.
   서버가 가로 1,600 이하 한 장으로 만들어 두고 로그인 전 기관 메인이 그 그림을 쓴다(고르지 않으면 지금 그림). 원본 · 제한 영상 0. */
function mainPhoto(o) {
  const tid = encodeURIComponent(o.id);
  const sec = h('section.sh.mp', { 'aria-label': '기관 메인 배경 사진' });
  const grid = h('div.mp-g');
  const img = h('img', { alt: '' });
  const cap = h('figcaption');
  const prev = h('figure.mp-p', {}, img, cap);
  const file = h('input', { type: 'file', accept: '.jpg,.jpeg,.png,.webp', hidden: true });
  const save = h('button.t-btn', { type: 'button', text: '저장', disabled: true });
  sec.append(h('header.sh-h', {}, h('h3', { text: '기관 메인 배경 사진' })),
    h('p.sh-d', { text: '로그인 전 기관 메인에 깔립니다 — 가로 1,600 이하로 작게 저장하고 원본은 내주지 않습니다' }), grid, prev, h('div.mp-a', {}, save), file);
  let data = null, pick = null;
  const key = (c) => (c.default ? 'default' : `${c.kind}:${c.src || c.id}`);
  const curKey = () => { const c = data?.current; return !c ? 'default' : c.kind === 'scene' ? `scene:${c.src}` : c.kind === 'imagery' ? `imagery:${c.id}` : 'upload'; };
  function show(src, text) { if (src) img.src = src; cap.textContent = text || ''; prev.hidden = !src; }
  function paint() {
    const cands = [...(data.scenes || []), ...(data.imagery || [])];
    const on = pick ? key(pick) : curKey();
    grid.replaceChildren(...cands.map((c) => {
      const b = h('button.mp-t', { type: 'button', 'aria-pressed': String(key(c) === on) }, h('img', { alt: '' }), h('span', { text: c.label }));
      if (c.kind === 'scene') b.querySelector('img').src = c.thumb;
      else authImg(c.thumb, b.querySelector('img'));
      b.addEventListener('click', () => { pick = c; paint(); show(b.querySelector('img').src, `${c.label} — 저장하면 메인에 이렇게 깔립니다`); save.disabled = key(c) === curKey(); });
      return b;
    }), h('button.mp-t.mp-up', { type: 'button', onclick: () => file.click() }, h('b', { text: '사진 올리기' }), h('span', { text: '이 기관 영상 · 결과 밖의 사진' })));
    if (!pick) {
      const c = data.current;
      show(c ? API.prefix + c.url : (data.scenes || []).find((x) => x.default)?.thumb, c ? `지금 쓰는 그림 · ${c.label || '올린 사진'}` : '지금 쓰는 그림 · 기본');
    }
  }
  async function load() {
    try { data = await api(`/tenants/${tid}/main-photo`); pick = null; save.disabled = true; paint(); }
    catch (e) { grid.replaceChildren(h('p.sh-d', { text: e.message || '불러오지 못했습니다' })); prev.hidden = true; }
  }
  save.addEventListener('click', async () => {
    if (!pick) return;
    save.disabled = true; save.textContent = '만드는 중';
    try {
      await api(`/tenants/${tid}/main-photo`, { method: 'PUT', body: pick.default ? { kind: 'default' } : pick.kind === 'scene' ? { kind: 'scene', src: pick.src, label: pick.label } : { kind: 'imagery', id: pick.id } });
      toast(`${o.name} 메인 배경 사진을 바꿨습니다`);
      await load();
    } catch (e) { toast(e.message || '지금은 바꿀 수 없습니다'); save.disabled = false; }
    save.textContent = '저장';
  });
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    const fd = new FormData(); fd.append('file', f, f.name);
    const tok = session.get()?.token;
    try {
      const r = await fetch(API.prefix + `/tenants/${tid}/main-photo/upload`, { method: 'POST', body: fd, headers: tok ? { authorization: 'Bearer ' + tok } : {} });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message || '올리지 못했습니다');
      toast(`${o.name} 메인 배경 사진을 올렸습니다`);
      await load();
    } catch (e) { toast(e.message); }
  });
  load();
  return sec;
}
/* 로그인한 LX 관리자 세션으로 받는 그림(썸네일) → 이 창에만 */
function authImg(url, el) {
  if (!THUMBS.has(url)) THUMBS.set(url, api(url, { raw: true }).then(async (r) => (r.ok && r.status === 200 ? URL.createObjectURL(await r.blob()) : null)).catch(() => null));
  THUMBS.get(url).then((u) => { if (u && el.isConnected) el.src = u; });
}

/* 공유 영상 그림 — 서버가 표준본 · 지도 조각에서 만든 작은 그림(LX 관리자 세션으로 받아 이 창에만 · 원본 0). 없으면 종류 글자만 */
const THUMBS = new Map();
function thumb(x, el) {
  if (!x.thumb) return;
  if (!THUMBS.has(x.id)) {
    THUMBS.set(x.id, api(x.thumb, { raw: true }).then(async (r) => (r.ok && r.status === 200 ? URL.createObjectURL(await r.blob()) : null)).catch(() => null));
  }
  THUMBS.get(x.id).then((u) => { if (u && el.isConnected) { el.querySelector('img').src = u; el.dataset.ok = '1'; } });
}
const ym = (w) => { const m = /^(\d{4})년(?: (\d{1,2})월)?/.exec(w || ''); return m ? (m[2] ? `${m[1]}.${m[2].padStart(2, '0')}` : m[1]) : ''; };

/** 공유 영상 칸 — 관할 안 LX 영상 · 켜고 끄기(지도에서 보기 · 분석 의뢰에 쓰기). 값은 서버(GET/PUT /tenants/{id}/imagery-shares) 한 곳 */
const CAP = (x) => (x.view && x.analyze ? '지도 · 분석 요청' : x.analyze ? '분석 요청' : x.view ? '지도' : '');
function shares(o) {
  const sec = h('section.sh', { 'aria-label': '공유 영상' });
  const chips = h('div.sh-f', { role: 'group', 'aria-label': '종류 거르기' });   // 전체 · 드론 · 항공 · 위성(있는 종류만)
  let only = '';
  const head = h('header.sh-h', {}, h('h3', { text: '공유 영상' }), h('span.sh-n.num'));
  const ul = h('ul.sh-l');
  const hold = h('div.sh-e');
  sec.append(head, h('p.sh-d', { text: '켠 LX 영상만 이 기관이 지도에서 보고 분석 요청에 불러옵니다' }), hold, ul);
  empty(hold, { kind: 'loading', compact: true });
  let items = [];
  const KW = { drone: '드론', aerial: '항공', satellite: '위성' };
  sec.insertBefore(chips, hold);
  const paint = () => {
    hold.hidden = !!items.length;
    if (!items.length) { hold.innerHTML = ''; empty(hold, { kind: 'first', title: '이 기관 관할에 LX 영상이 없습니다', compact: true }); }
    head.querySelector('.sh-n').textContent = items.length ? `${items.filter((x) => x.shared).length} / ${items.length}` : '';
    const kinds = Object.keys(KW).filter((k) => items.some((x) => x.kind === k));
    chips.hidden = kinds.length < 2;
    chips.innerHTML = [['', '전체', items.length], ...kinds.map((k) => [k, KW[k], items.filter((x) => x.kind === k).length])]
      .map(([k, t, n]) => `<button type="button" data-k="${k}" aria-pressed="${only === k}">${t} <span class="num">${n}</span></button>`).join('');
    /* 줄 = 그림 → 이름 → 어디 · 언제 · 해상도 → 쓸 수 있는 일 → 공유 스위치 · 원본 지울 날짜는 맨 뒤 작은 글(확인 18차 M-4 ⓐ · 서버 값 그대로) */
    ul.innerHTML = items.filter((x) => !only || x.kind === only).map((x) => `<li data-id="${esc(x.id)}">
      <div class="sh-th" aria-hidden="true"><img alt=""><span class="sh-k">${esc(x.kind_word || '')}</span>${ym(x.when) ? `<span class="sh-dt num">${esc(ym(x.when))}</span>` : ''}</div>
      <div class="t"><b>${esc(x.name)}</b><span class="sh-m">${[x.where, x.when, x.gsd_word || x.kind_word].filter(Boolean).map((t) => `<em>${esc(t)}</em>`).join(' · ')}</span>
        <span class="sh-c">${CAP(x).split(' · ').filter(Boolean).map((c) => `<i>${esc(c)}</i>`).join('')}</span>${x.orig ? `<span class="sh-o">${esc(x.orig)}</span>` : ''}</div>
      <button type="button" class="sw" role="switch" aria-checked="${x.shared}" aria-label="${esc(x.name)} 공유"><i></i></button></li>`).join('');
    ul.querySelectorAll('li').forEach((li) => thumb(items.find((x) => x.id === li.dataset.id), li.querySelector('.sh-th')));
  };
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; only = b.dataset.k; paint(); });
  api(`/tenants/${encodeURIComponent(o.id)}/imagery-shares`).then((j) => { items = j.items || []; paint(); })
    .catch(() => { hold.innerHTML = ''; empty(hold, { kind: 'error', compact: true }); });
  ul.addEventListener('click', async (e) => {
    const b = e.target.closest('.sw'); if (!b) return;
    const x = items.find((i) => i.id === b.closest('li').dataset.id); if (!x) return;
    b.disabled = true;
    try {
      const r = await api(`/tenants/${encodeURIComponent(o.id)}/imagery-shares/${encodeURIComponent(x.id)}`, { method: 'PUT', body: { shared: !x.shared } });
      x.shared = !!r.shared; paint();
      toast(x.shared ? `${o.name}에 공유했습니다` : '공유를 껐습니다');
    } catch (err) { toast(err.message || '지금은 바꿀 수 없습니다'); b.disabled = false; }
  });
  return sec;
}

export function mountTenants(root) {
  root.innerHTML = `<div class="v v-org" id="org"></div>
    <section class="t-card llmu" aria-label="XI ChatGEO 요청 건수">
      <header class="llmu-h"><h2>XI ChatGEO 요청 건수</h2><span class="t-chip">이번 달</span></header>
      <table class="llmu-t"><thead><tr><th>기관</th><th class="num">요청 건수</th></tr></thead><tbody id="llmu"></tbody></table>
    </section>`;
  const grid = root.querySelector('#org');
  const llmu = root.querySelector('#llmu');
  function paintLlm() {
    llmu.innerHTML = llmUsage().map((r) => {
      const u = r.requests?.value;
      return `<tr data-id="${esc(r.id)}"><th scope="row">${esc(r.name)}</th>
        <td class="num"><b data-metric="XI ChatGEO 요청 건수" data-tenant="${esc(r.id)}" data-v="${u ?? ''}">${u == null ? '—' : nf(u, 0)}</b><small> 건</small></td></tr>`;
    }).join('');
  }
  function paint() {
    const list = orgs();
    grid.style.setProperty('--n', list.length);
    grid.innerHTML = list.map((o) => `
      <section class="t-card org" data-id="${esc(o.id)}">
        <header><h2>${esc(o.name)}</h2><span class="t-chip">이번 달</span></header>
        <div class="rings stats">${['storage_gb', 'gpu_s_month', 'area_km2_month'].map((k) => stat(k, o.dims[k])).join('')}</div>
        <div class="org-acts"><button class="t-btn t-btn--2 adj" type="button">공유 영상</button><button class="t-btn t-btn--2 brand-b" type="button">기관 정보</button></div>
      </section>`).join('');
    paintLlm();
  }
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.org'); if (!card) return;
    const o = orgs().find((x) => x.id === card.dataset.id); if (!o) return;
    if (e.target.closest('.brand-b')) return openBrand(o);   // 마크 · 이름 · 색 · 소개 글(기관 관리자와 같은 칸)
    sheet(o);
  });
  return { paint, open(id) { const o = orgs().find((x) => x.id === id); if (o) sheet(o); } };
}
