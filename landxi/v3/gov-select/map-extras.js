/* 기관 결과 지도(XI맵 · 기관 세션)에 붙는 두 가지(구현 5차 2묶음 · 확인 대장 18차 N-1 ⓐ 결과 설명 · 촬영-1 ⓑ · 기관-9 ⓑ · 시안 design-r9/gov-2 dash.html?tab=map · parcel.html).
   · mapCard   지도 왼쪽 아래 '보고 있는 결과' 카드 — 서비스 · 판 · 영상 · 분석한 날 · 업무 결과(결과 설명서 세 줄과 같은 값) · '이 결과 설명' 서랍 ·
               '행정정보와 비교' · '이 영상으로 분석 요청'(지금 보는 곳의 LX 공유 영상이 그 서비스 요청 화면에 들어간 채 열린다 · 없으면 요청하기만).
   · parcelNote 필지 카드 — '영상 설명' 대신 메모 한 줄 + 다음 확인 날짜(판정 버튼 없음) · 적으면 서비스 이력 탭의 '확인 기록'에 쌓인다.
                쓰기 = 기관 관리자(서버 규칙 그대로) · 부서 사용자는 읽기만.
   XI맵(xi-clean)은 이 파일을 기관 세션에서만 늦게 불러 붙인다(지도 엔진 코드는 그대로). 숫자는 서버 값 그대로 · 지역 고정값 0. */
import { api, h } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { drawer } from '../kit/panel.js';
import { sixCells, val, nf, ymd, segs } from '../gov-space/guide.js';

const at = (p) => new URL('../' + p, import.meta.url).href;
/* 이 파일의 모양(map-extras.css)이 다 온 뒤에 카드를 붙인다 — 늦게 오면 모양 없는 카드가 지도 도구 위에 잠깐 겹쳐 섰다(10-28 gate · 기관 390 결과 지도) */
const cssReady = (() => { const href = at('gov-select/map-extras.css'); const have = [...document.querySelectorAll('link[rel=stylesheet]')].find((l) => l.href === href);
  if (have) return have.sheet ? Promise.resolve() : new Promise((r) => { have.addEventListener('load', r, { once: true }); have.addEventListener('error', r, { once: true }); setTimeout(r, 8000); });
  const l = h('link', { rel: 'stylesheet', href }); const p = new Promise((r) => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); setTimeout(r, 8000); });
  document.head.append(l); return p; })();
{ const href = at('gov-space/gov-space.css'); if (![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) document.head.append(h('link', { rel: 'stylesheet', href })); }

const inBox = (b, x, y) => b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const hit = (a, b) => a && b && a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** '보고 있는 결과' 카드 — card = 서비스(카드 id) · region() = 지금 고른 시군구({code, bbox}) · center() = 지도 가운데 [x, y] */
export async function mapCard({ host, card, region = () => null, center = () => null }) {
  if (!host || !card) return null;
  await cssReady;
  const box = h('section.gx-card', { 'aria-label': '보고 있는 결과' });
  host.append(box);
  let g = null, deps = [], shared = [];
  try {
    [g, deps, shared] = await Promise.all([
      api('/spaces/me/guides/' + encodeURIComponent(card)).catch(() => null),
      api('/requests/services').then((j) => (j.items || []).filter((d) => d.card === card)).catch(() => []),
      api('/requests/shared-imagery').then((j) => (j.items || []).filter((x) => x.analyzable)).catch(() => []),
    ]);
  } catch { /* 카드만 비워 둔다 */ }
  const b = g?.body || {};
  const name = g?.name || '';
  const tot = b.what?.total;
  const r0 = (b.when?.rounds || [])[0];
  const totTxt = val(tot) !== null && val(tot) !== undefined ? (tot.unit === '필지' ? `판정한 필지 ${nf(val(tot))}` : `${nf(val(tot))}${tot.unit && tot.unit !== 'count' ? tot.unit : '건'}`) : '';
  const svcQ = (extra = {}) => '?' + new URLSearchParams({ service: card, ...extra });
  const reqBtn = h('a.t-btn.gx-req', { href: at('gov-request/'), text: '이 영상으로 분석 요청' });
  /* 지금 보는 곳의 공유 영상(분석할 수 있는 것 · 가운데가 든 것 → 고른 시군구와 겹치는 것 · 최근 해) — 요청 화면이 그 영상 · 서비스를 고른 채 열린다 */
  const aim = () => {
    const r = region(), c = center();
    const dep = (r && deps.find((d) => d.sgg_cd === r.code)) || deps[0] || null;
    const list = shared.slice().sort((a, b2) => String(b2.year || '').localeCompare(String(a.year || '')));
    const x = (c && list.find((s) => inBox(s.bbox, c[0], c[1]))) || (r?.bbox && list.find((s) => hit(s.bbox, r.bbox))) || null;
    reqBtn.href = at('gov-request/') + '?' + new URLSearchParams({ ...(dep ? { service: dep.id } : {}), ...(x ? { imagery: x.id } : {}) });
    reqBtn.textContent = x ? '이 영상으로 분석 요청' : '분석 요청';
  };
  reqBtn.addEventListener('pointerdown', aim);
  reqBtn.addEventListener('focus', aim);
  aim();
  if (!g) { box.append(reqBtn); box.classList.add('is-bare'); return box; }
  const more = h('button.t-btn.t-btn--text.gx-more', { type: 'button', text: '이 결과 설명' });
  more.addEventListener('click', () => {
    drawer({ title: `이 결과 설명 — ${val(g.edition)}판`, label: '이 결과 설명', width: 560,
      body: h('div.gd-drawer', {}, g.change ? h('p.sp-change', {}, h('b', { text: '바뀐 점' }), segs(g.change)) : null, sixCells(g),
        h('p.gx-dl', {}, h('a', { href: at('gov-select/') + svcQ({ tab: 'stats' }), text: '자료 내려받기는 통계·보고서 탭에서' }))) });
  });
  box.append(
    h('p.gx-l', { text: '보고 있는 결과' }),
    h('p.gx-t', {}, h('b', { text: name }), h('span.gx-ed', { text: `${val(g.edition)}판` })),
    r0 || totTxt ? h('p.gx-s', {}, h('i', { 'aria-hidden': 'true' }), h('span', {}, ...[r0?.shot, r0?.analyzed ? `${ymd(r0.analyzed)} 분석` : '', totTxt].filter(Boolean)
      .flatMap((t, i, a) => [h('span.gx-seg', { text: t + (i < a.length - 1 ? ' ·' : '') }), i < a.length - 1 ? ' ' : '']))) : '',   // 마디 가운데서 줄이 바뀌지 않게
    h('p.gx-links', {}, more, h('a.t-btn.t-btn--text.gx-more', { href: at('gov-fusion/') + svcQ(), text: '행정정보와 비교' })),
    reqBtn);
  return box;
}

/** 필지 카드 — 메모 한 줄 + 다음 확인 날짜(기관-9 ⓑ · 판정 버튼 없음) · host 안에 그린다 */
export async function parcelNote(host, { finding }) {
  if (!host || !finding?.id) return;
  const box = h('section.gx-note', { 'aria-label': '메모 · 다음 확인' });
  host.append(box);
  let j = { items: [], can_write: false };
  try { j = await api(`/survey/findings/${encodeURIComponent(finding.id)}/notes`); } catch { /* 기록 없음 */ }
  const list = h('ul.gx-notes');
  const drawList = (items) => list.replaceChildren(...items.slice(0, 3).map((x) => h('li', {},
    h('span.gx-n-d.num', { text: ymd(x.at).slice(5) }),
    h('span.gx-n-t', { text: [x.note ? `"${x.note}"` : '', x.planned_for ? `다음 확인 ${ymd(x.planned_for).slice(5)}` : ''].filter(Boolean).join(' · ') }),
    x.who ? h('small', { text: x.who }) : null)));
  drawList(j.items || []);
  const head = h('div.gx-note-h', {}, h('b', { text: '메모 · 다음 확인' }), h('small', { text: j.can_write ? '저장하면 이력에 남습니다' : '기관 관리자가 적습니다' }));
  box.append(head);
  if (j.can_write) {
    const memo = h('input.t-input', { type: 'text', maxlength: '200', placeholder: '메모 한 줄 — 예: 소유자와 통화함', 'aria-label': '메모 한 줄' });
    const date = h('input.t-input.gx-date', { type: 'date', 'aria-label': '다음 확인 날짜', min: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) });
    if (finding.planned_for) date.value = String(finding.planned_for).slice(0, 10);
    const save = h('button.t-btn.gx-save', { type: 'button', text: '저장' });
    save.addEventListener('click', async () => {
      if (!memo.value.trim() && !date.value) { toast('메모나 다음 확인 날짜를 적어 주세요'); return; }
      save.disabled = true;
      try {
        await api(`/survey/findings/${encodeURIComponent(finding.id)}/note`, { method: 'POST', body: { note: memo.value.trim() || undefined, planned_for: date.value || undefined } });
        toast('저장했습니다 · 서비스 이력에 남습니다');
        memo.value = '';
        const k = await api(`/survey/findings/${encodeURIComponent(finding.id)}/notes`).catch(() => null);
        if (k) drawList(k.items || []);
      } catch (e) { toast(e.message || '지금은 저장할 수 없습니다'); }
      save.disabled = false;
    });
    box.append(memo, h('div.gx-note-r', {}, h('label.gx-date-l', {}, h('span', { text: '다음 확인 날짜' }), date), save));
  }
  box.append(list);
}

/** 필지 시점 비교(10-21 영농-2 · AI 판정 근거) — 필지 목록 · 필지 카드의 '시점 비교'에서 온 XI맵(?service=&pnu=&compare=auto).
    필지 이력(GET /spaces/me/parcels/{pnu}/history?geom=1)의 가장 최근 두 결과 해 → 그 해 영상 둘을 가르기 왼쪽(이전) · 오른쪽(최신)에 놓고,
    두 쪽 모두 이 필지의 AI 결과 면을 겹친다. 위 띠 한 줄 = 서버의 바뀜 한 줄(예: '2023 경작지 → 2025 비경작지').
    epochs() = 그 지역을 덮는 시점 영상(XI맵 가르기 고르기와 같은 목록) · compare(왼쪽, 오른쪽) = XI맵 가르기 켜기 · left() · right() = 두 지도 stage. */
const HIST = new Map();
/** 필지 이력(결과 면 포함) 한 번만 받기 — XI맵이 서는 동안 미리 부른다 */
export function historyFor(pnu, card) {
  const k = `${card}|${pnu}`;
  if (!HIST.has(k)) HIST.set(k, api(`/spaces/me/parcels/${encodeURIComponent(pnu)}/history?` + new URLSearchParams({ card, geom: '1', limit: '1' })).catch(() => null));
  return HIST.get(k);
}
export async function parcelCompare({ host, pnu, card, hist = null, epochs, compare, left, right, aiOn, closeCard }) {
  if (!host || !pnu || !card) return false;
  const j = (hist && await hist) || await historyFor(pnu, card);   // hist = XI맵이 부팅 때 미리 받은 같은 이력
  const res = j?.results || [];
  const z = res[res.length - 1] || null, a = res.length > 1 ? res[res.length - 2] : null;
  const eps = epochs() || [];
  const yr = (e) => String(e?.it?.epoch || '').slice(0, 4);
  const zy = z?.year || null;
  const R = (zy && eps.filter((e) => yr(e) === zy).pop()) || eps[eps.length - 1] || null;
  const ay = a?.year || null;
  const L = (ay && eps.find((e) => yr(e) === ay && e !== R)) || [...eps].reverse().find((e) => R && yr(e) < yr(R)) || null;
  if (!R || !L) { toast('이 필지는 비교할 다른 시점 영상이 없습니다'); return false; }
  /* 위 띠는 두 시점이 정해지는 즉시(가르기가 서는 동안 · 영상이 차오르기 전에 무엇을 견주는지 먼저 — impl-46 속도) */
  const line = j?.change?.line || (z ? `${zy || z.shot} ${z.cls}` : '');
  host.querySelector('.gx-cmp-t')?.remove();
  if (line) host.append(h('p.gx-cmp-t', { role: 'status' }, h('span.gx-cmp-h', { text: '시계열 영상 비교' }), h('span.gx-cmp-y', { text: `${L.label} · ${R.label}` }), h('b', { text: line })));
  await compare(L.it.id, R.it.id);
  aiOn?.();
  const sh = j?.shapes || [];
  const fz = sh.find((s) => s.year === zy) || sh[sh.length - 1];
  const fa = sh.find((s) => s.year === ay && s !== fz) || null;
  await Promise.all([fz && right()?.geo('pcmp', fz.fc, 'ai'), fa && left()?.geo('pcmp', fa.fc, 'ai')].map((p) => Promise.resolve(p).catch(() => {})));   // 면 없음은 넘어간다
  /* 휴대폰 — 필지 카드(아래 시트)가 두 영상을 가리므로 걷는다(카드는 지도에서 필지를 누르면 다시 열린다) */
  if (closeCard && matchMedia('(max-width: 640px)').matches) {
    for (let i = 0; i < 30 && !document.querySelector('.k-drawer.is-open'); i++) await new Promise((r) => setTimeout(r, 100));
    closeCard();
    try { if (fz) await right()?.geo('pcmp', fz.fc, 'ai'); } catch { /* */ }
  }
  return true;
}
