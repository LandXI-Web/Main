/* 기관 뷰 — 기관마다 이번 달 사용량(저장 · GPU 시간 · 분석 면적 · AI 도우미 요청 건수) + 서랍(공유 영상) · 기관 정보.
   기관에는 막는 한도가 없다(원칙 83 · 7차 기관-1 · 11차 "GPU 는 무상 정책") — 숫자는 '얼마나 쓰고 있나'만(한도 · % · 초과 · 조정 없음).
   사용 현황 화면(기관 비교 · 추이)은 11차 확인 대기라 새로 만들지 않았다 — 지금 있던 기관 카드에서 한도 표시만 걷었다.
   기관 서랍 '공유 영상' 칸(확인 대장 5차 역할-4 ⓑ — LX 관리자가 기관마다 고름): 관할 안 LX 영상 목록에서 켜고 끈다. 켠 영상만 그 기관이
   지도에서 보고(원본만 있는 영상도 서명 지도 조각으로 — 10-01 사용자 결정) 분석 의뢰에 불러온다(서버가 거른다 · 공유 = 권한 한 줄 · 복사 0). */
import { drawer, toast, esc, nf, api, h, empty } from './kit.js';
import { DIM, orgs, llmUsage } from './data.js';
import { openBrand } from './brand.js';   // 기관 서랍 · 기관 정보(구현 2차 T3)

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

/** 서랍 — 공유 영상(관리자가 기관마다 켜고 끈다) */
function sheet(o) {
  return drawer({ title: o.name, body: h('div.qs-w', {}, shares(o)), slot: 'right' });
}

/** 공유 영상 칸 — 관할 안 LX 영상 · 켜고 끄기(지도에서 보기 · 분석 의뢰에 쓰기). 값은 서버(GET/PUT /tenants/{id}/imagery-shares) 한 곳 */
const CAP = (x) => (x.view && x.analyze ? '지도 · 분석 의뢰' : x.analyze ? '분석 의뢰' : x.view ? '지도' : '');
function shares(o) {
  const sec = h('section.sh', { 'aria-label': '공유 영상' });
  const head = h('header.sh-h', {}, h('h3', { text: '공유 영상' }), h('span.sh-n.num'));
  const ul = h('ul.sh-l');
  const hold = h('div.sh-e');
  sec.append(head, h('p.sh-d', { text: '켠 LX 영상만 이 기관이 지도에서 보고 분석 의뢰에 불러옵니다' }), hold, ul);
  empty(hold, { kind: 'loading', compact: true });
  let items = [];
  const paint = () => {
    hold.hidden = !!items.length;
    if (!items.length) { hold.innerHTML = ''; empty(hold, { kind: 'first', title: '이 기관 관할에 LX 영상이 없습니다', compact: true }); }
    head.querySelector('.sh-n').textContent = items.length ? `${items.filter((x) => x.shared).length} / ${items.length}` : '';
    ul.innerHTML = items.map((x) => `<li data-id="${esc(x.id)}"><div class="t"><b>${esc(x.name)}</b><span>${esc([x.year ? x.year + '년' : '', x.gsd_word, CAP(x)].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="sw" role="switch" aria-checked="${x.shared}" aria-label="${esc(x.name)} 공유"><i></i></button></li>`).join('');
  };
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
    <section class="t-card llmu" aria-label="AI 도우미 요청 건수">
      <header class="llmu-h"><h2>AI 도우미 요청 건수</h2><span class="t-chip">이번 달</span></header>
      <table class="llmu-t"><thead><tr><th>기관</th><th class="num">요청 건수</th></tr></thead><tbody id="llmu"></tbody></table>
    </section>`;
  const grid = root.querySelector('#org');
  const llmu = root.querySelector('#llmu');
  function paintLlm() {
    llmu.innerHTML = llmUsage().map((r) => {
      const u = r.requests?.value;
      return `<tr data-id="${esc(r.id)}"><th scope="row">${esc(r.name)}</th>
        <td class="num"><b data-metric="AI 도우미 요청 건수" data-tenant="${esc(r.id)}" data-v="${u ?? ''}">${u == null ? '—' : nf(u, 0)}</b><small> 건</small></td></tr>`;
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
