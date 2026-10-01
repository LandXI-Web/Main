/* 기관 공간 — LX 관리자 대시보드 → 기관 → '기관 공간' 탭(구현 3차 · 확인 대장 13차 분기-3 ⓒ의 1단 · 분기-2 · 원칙 72 · 85).
   기관 화면 안 탭 하나(새 큰 화면 아님): 기관마다 한 줄 — 받은 1차 서비스 수 · 결과 설명서 최신 판 · 저장 · 방식(가벼운 칸) · 마지막 갱신.
   한 줄을 누르면 서랍(서비스별 판 · 바뀐 점 · 최근 공간 기록). LX 관리자는 보기 · 지원만 — 여기서 기관 공간을 고치지 않는다.
   숫자는 서버 값 그대로(GET /spaces · /spaces/{기관}) — '저장'은 사용 현황 탭 기관 카드의 '저장'과 같은 값(한 출처).
   2단(상자 · 2차 서비스 · 자원 배정)의 칸은 만들지 않는다. 깊은 주소 #/tenants/space = 이 탭. */
import { api, h, esc, drawer, empty, toast } from './kit.js';

{ const href = new URL('../spaces.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) document.head.append(h('link', { rel: 'stylesheet', href })); }

const nf = (v, d = 0) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || '')); return m ? `${Number(m[1])}.${Number(m[2])}${m[3] ? ` ${m[3]}:${m[4]}` : ''}` : '—'; };
const keep = (s) => String(s || '').replace(/ · /g, ' · ').replace(/ → /g, ' → ');
/** ' · ' 로 이은 글 — 마디째 줄바꿈(마디 가운데서 끊지 않는다 · 법전 §2-1) */
const segs = (t) => String(t || '').split(' · ').filter(Boolean).map((x) => `<span class="sp-seg">${esc(x.replace(/ → /g, ' → '))}</span>`).join(' · ');
/** 저장 — 사용 현황 탭과 같은 표기(1 GB 아래면 MB) */
function gb(e) {
  const x = val(e);
  if (x == null) return '—';
  if (x > 0 && x < 1) return `${nf(x * 1000, x * 1000 < 1 ? 1 : 0)} MB`;
  return `${nf(x, x && x < 10 ? 1 : 0)} GB`;
}

export function mountSpaces(root) {
  const use = h('div.sp-adm-use');
  use.append(...root.childNodes);
  const tUse = h('button', { type: 'button', role: 'tab', dataset: { tab: 'use' }, text: '사용 현황' });
  const tSpace = h('button', { type: 'button', role: 'tab', dataset: { tab: 'space' }, text: '기관 공간' });
  const tabs = h('nav.sp-adm-tabs', { role: 'tablist', 'aria-label': '기관' }, tUse, tSpace);
  const pane = h('div.sp-adm');
  const lead = h('p.sp-adm-lead', { text: '기관마다 LX 서버 위에 나눠 둔 공간입니다 — 받은 서비스의 결과 설명서와 저장을 봅니다' });
  const box = h('section.t-card.sp-adm-box', { 'aria-label': '기관 공간' });
  pane.append(lead, box);
  root.append(h('div.sp-adm-head', {}, tabs), use, pane);

  let tab = /\/space\b/.test(location.hash) ? 'space' : 'use';
  let items = null, timer = 0;
  function set(t, push = false) {
    tab = t;
    tUse.setAttribute('aria-selected', String(t === 'use'));
    tSpace.setAttribute('aria-selected', String(t === 'space'));
    use.hidden = t !== 'use';
    pane.hidden = t !== 'space';
    if (push) history.replaceState(null, '', t === 'space' ? '#/tenants/space' : '#/tenants');
    clearInterval(timer);
    if (t === 'space') { load(); timer = setInterval(() => { if (!root.hidden) load(); }, 60000); }
  }
  tUse.addEventListener('click', () => set('use', true));
  tSpace.addEventListener('click', () => set('space', true));
  addEventListener('hashchange', () => { if (/^#\/tenants/.test(location.hash)) { const t = /\/space\b/.test(location.hash) ? 'space' : 'use'; if (t !== tab) set(t); } });

  /** 기다림 · 문제 표시는 상자 안 따로 둔 칸에(상자 자체에 빈 상태 꾸밈이 남지 않게) */
  const hold = (o) => { const x = h('div'); box.replaceChildren(x); empty(x, o); };
  async function load() {
    if (!items) hold({ kind: 'loading', compact: true });
    try { items = (await api('/spaces')).items || []; } catch { hold({ kind: 'error', compact: true, onRetry: load }); return; }
    paint();
  }
  function paint() {
    if (!items.length) { hold({ kind: 'first', title: '아직 기관이 없습니다', compact: true }); return; }
    box.innerHTML = `<table class="sp-adm-t">
      <thead><tr><th>기관</th><th class="num">받은 1차 서비스</th><th>결과 설명서 최신 판</th><th class="num">저장</th><th>방식</th><th>마지막 갱신</th></tr></thead>
      <tbody>${items.map((x) => `<tr data-id="${esc(x.tenant)}" tabindex="0">
        <td data-k="기관"><span class="sp-v"><b>${esc(x.short || x.name)}</b><small>${x.scope === 'global' ? '해외' : '국내'}</small></span></td>
        <td data-k="받은 1차 서비스" class="num"><span class="sp-v"><b data-metric="받은 1차 서비스" data-v="${val(x.services) ?? ''}">${val(x.services) ?? '—'}</b><small> 개</small></span></td>
        <td data-k="결과 설명서 최신 판"><span class="sp-v">${x.latest ? `<span class="sp-adm-svc">${esc(x.latest.service || '')} <b class="num">${val(x.latest.edition)}판</b></span><small>${segs(x.latest.change)}</small>` : '<small>아직 없음</small>'}</span></td>
        <td data-k="저장" class="num"><span class="sp-v"><b data-metric="저장" data-tenant="${esc(x.tenant)}" data-v="${val(x.storage) ?? ''}">${gb(x.storage)}</b></span></td>
        <td data-k="방식"><span class="sp-v"><span class="t-chip">${esc(x.mode_word || '가벼운 칸')}</span></span></td>
        <td data-k="마지막 갱신" class="num"><span class="sp-v">${md(x.updated)}</span></td></tr>`).join('')}</tbody></table>`;
  }
  box.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); } });

  async function open(id) {
    const row = (items || []).find((x) => x.tenant === id);
    const body = h('div.sp-adm-d');
    const d = drawer({ title: row?.short || row?.name || '기관 공간', body, slot: 'right' });
    empty(body, { kind: 'loading', compact: true });
    let j;
    try { j = await api('/spaces/' + encodeURIComponent(id)); } catch (err) { d.set(h('p.sp-adm-none', { text: '지금은 열 수 없습니다' })); toast(err.message || '열지 못했습니다'); return; }
    const svc = (j.services || []).map((s) => h('section.sp-adm-s', {},
      h('header', {}, h('b', { text: s.name }), s.edition ? h('span.t-chip', { text: `${val(s.edition)}판` }) : h('span.t-chip', { dataset: { lv: 'wait' }, text: '판 없음' })),
      h('ol', {}, ...(s.history || []).map((x) => h('li', {}, h('span.num', { text: `${val(x.edition)}판` }),
        h('span', {}, h('span', { text: keep(x.change || '') }), h('small', { text: md(x.at) })))))));
    const log = (j.log || []).map((x) => h('li', {}, h('span', { text: keep(x.line) }), h('small.num', { text: md(x.at) })));
    d.set(h('div.sp-adm-d', {},
      h('p.sp-adm-meta', { text: `방식 ${j.mode_word || '가벼운 칸'} · 공간이 생긴 날 ${md(j.since).split(' ')[0]}` }),
      h('h3', { text: '받은 1차 서비스' }), svc.length ? h('div.sp-adm-ss', {}, ...svc) : h('p.sp-adm-none', { text: '받은 서비스가 없습니다' }),
      h('h3', { text: '최근 공간 기록' }), log.length ? h('ol.sp-adm-log', {}, ...log) : h('p.sp-adm-none', { text: '기록이 없습니다' }),
      h('p.sp-adm-note', { text: 'LX 관리자는 기관 공간을 보고 돕습니다 — 결과 설명서는 서비스를 공개할 때 저절로 만들어집니다' })));
  }

  set(tab);
  return { show: set, reload: load };
}
