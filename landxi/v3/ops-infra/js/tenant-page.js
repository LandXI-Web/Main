/* '기관 한 곳' 화면 — LX 관리자 대시보드 → 기관 → 카드를 누르면 서랍이 아니라 새 화면(now 페이지 질문 17 ⓑ 탭 넷 · 시안 design-r10/gov-3 admin-tenant-page).
   머리(마크 · 이름 · 공간 · 주소 · 기관 관리자) → 탭 넷: 개요 · 서비스와 담당 · 영상과 배경 · 사용과 계정. 주소 #/tenants/o/{기관}.
   값은 서버 한 곳 — GET /tenants/{id}/page(머리 · 개요 · 서비스 · 담당 · 볼 서비스) · /ops/tenants(사용 현황 — 기관 카드와 같은 값) ·
   GET /accounts/users(계정 — 계정 관리와 같은 값) · 공유 영상 · 배경 사진(tenants.js 그대로). 담당 바꾸기 = PUT /tenants/{id}/helpdesk(처리 기록). */
import { api, h, esc, empty, toast } from './kit.js';
import { orgs, DIM } from './data.js';
import { shares, mainPhoto } from './tenants.js';
import { openBrand } from './brand.js';
import { orgUrl } from '../../kit/auth-gate.js';

const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const nf = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: d }));
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}` : '—'; };
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : '—'; };
const mdhm = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]} ${m[3]}:${m[4]}` : '—'; };
const TABS = [['all', '개요'], ['svc', '서비스와 담당'], ['img', '영상과 배경'], ['use', '사용과 계정']];
const ROLE_KO = { manager: '기관 관리자', viewer: '부서 사용자' };
const LV = { 운영: 'ok', 시범: 'wait' };

export function mountTenantPage(root) {
  { const href = new URL('../tenant-page.css', import.meta.url).href;
    if (![...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) document.head.append(h('link', { rel: 'stylesheet', href })); }
  const page = h('section.tp', { 'aria-label': '기관 한 곳', hidden: true });
  root.append(page);
  let cur = null, P = null, tab = 'all';

  const want = () => { const m = /^#\/tenants\/o\/([\w-]+)(?:\/(\w+))?/.exec(location.hash); return m ? { id: decodeURIComponent(m[1]), tab: m[2] } : null; };
  function route() {
    const w = want();
    root.classList.toggle('tp-on', !!w);
    page.hidden = !w;
    if (!w) { cur = null; return; }
    tab = TABS.some(([k]) => k === w.tab) ? w.tab : 'all';
    if (w.id !== cur) { cur = w.id; P = null; load(); } else paint();
  }
  addEventListener('hashchange', route);

  async function load() {
    page.replaceChildren(h('div.tp-hold'));
    empty(page.firstChild, { kind: 'loading', compact: true });
    try { P = await api(`/tenants/${encodeURIComponent(cur)}/page`); } catch (e) {
      page.replaceChildren(h('div.tp-hold')); empty(page.firstChild, { kind: 'error', compact: true, title: e.message || '기관을 불러오지 못했습니다', onRetry: load }); return;
    }
    paint();
  }

  function head() {
    const mk = h('div.tp-mk', { style: { '--mk': P.color?.accent || 'var(--ink)' } });
    if (P.mark?.image) mk.append(h('img', { src: P.mark.image, alt: '' }));
    else mk.append(...(P.mark?.text || [P.name]).map((t) => h('span', { text: t })));
    const sub = h('p.tp-sub');
    const bit = (t, b) => sub.append(h('span', {}, t, b ? h('b', { text: b }) : null));
    bit(`${P.full} · `, P.platform);
    if (P.host) bit(P.host);
    if (P.managers?.length) bit('기관 관리자 ', P.managers.join(' · '));
    if (P.space?.since) bit(`공간 생김 ${ymd(P.space.since)}`);
    const brandB = h('button.t-btn.t-btn--2', { type: 'button', text: '기관 정보 — 마크 · 이름 · 색' });
    brandB.onclick = () => openBrand({ id: P.tenant, name: P.name });
    const mainA = h('a.t-btn.t-btn--2', { href: orgUrl(P.tenant), target: '_blank', rel: 'noopener', text: '기관 메인 열기' });
    return h('header.tp-h', {},
      h('nav.tp-crumb', { 'aria-label': '위치' }, h('a', { href: '#/tenants', text: '기관' }), h('span', { text: '›' }), h('b', { text: P.name })),
      h('div.tp-top', {}, mk,
        h('div.tp-t', {}, h('h1', {}, P.name, P.space?.mode_word ? h('span.t-chip', { text: P.space.mode_word }) : null, h('span.t-chip', { dataset: { lv: P.space?.on ? 'ok' : 'gap' }, text: P.space?.on ? '켜짐' : '꺼짐' })), sub),
        h('div.tp-acts', {}, brandB, mainA)));
  }

  function tabs() {
    const n = { svc: P.services.length, use: val(P.counts.accounts) };
    const nav = h('nav.tp-tabs', { role: 'tablist', 'aria-label': '기관 한 곳' }, ...TABS.map(([k, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === tab), dataset: { k } },
      t, n[k] != null ? h('small.num', { text: String(n[k]) }) : null)));
    nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) location.hash = `#/tenants/o/${encodeURIComponent(cur)}${b.dataset.k === 'all' ? '' : '/' + b.dataset.k}`; });
    return nav;
  }

  const o = () => orgs().find((x) => x.id === cur) || { id: cur, name: P?.name, dims: {} };
  const used = (k) => val(o().dims?.[k]?.used);

  function overview() {
    const c = P.counts;
    const cell = (n, u, k, s) => h('div.tp-cell', {}, h('b.num', {}, n, h('small', { text: u })), h('span', { text: k }), s ? h('small.tp-cs', { text: s }) : null);
    const st = used('storage_gb');
    const llm = used('llm_requests_month');
    const cells = h('div.tp-cells',
      {}, cell(nf(val(c.services)), '개', '받는 서비스', (c.services_by || []).map((x) => `${x.word} ${x.n}`).join(' · ')),
      cell(nf(val(c.accounts)), '명', '계정', `기관 관리자 ${nf(val(c.managers))} · 부서 사용자 ${nf(val(c.viewers))}`),
      cell(nf((val(c.requests_month) || 0) + (val(c.shoots_month) || 0)), '건', '이번 달 보낸 요청', `분석 ${nf(val(c.requests_month))} · 촬영 ${nf(val(c.shoots_month))}`),
      cell(st == null ? '—' : st < 1 && st > 0 ? nf(st * 1000) : nf(st, st < 10 ? 1 : 0), st != null && st < 1 && st > 0 ? 'MB' : 'GB', '저장', llm != null ? `XI ChatGEO 요청 ${nf(llm)}건 · 이번 달` : ''));
    const rec = h('section.t-card.tp-rec', {}, h('h2', {}, '최근 기록', h('small', { text: '이 기관에서 일어난 일' })),
      P.log.length ? h('ul', {}, ...P.log.slice(0, 6).map((l) => h('li', {}, h('span.num', { text: md(l.at) }), h('span', { text: l.line })))) : h('p.tp-none', { text: '아직 기록이 없습니다' }));
    return h('div.tp-ov', {}, cells, rec);
  }

  function staffSel(curId, none, onPick) {
    const sel = h('select.t-input.tp-sel', { 'aria-label': '담당' }, h('option', { value: '', text: none }),
      ...(P.staff || []).map((s) => h('option', { value: s.id, text: [s.name, s.name === s.role ? '' : s.role, s.dept].filter(Boolean).join(' · ') })));
    sel.value = curId || '';
    sel.onchange = () => onPick(sel.value || null, sel);
    return sel;
  }
  async function putStaff(body, what) {
    try { await api(`/tenants/${encodeURIComponent(cur)}/helpdesk`, { method: 'PUT', body }); toast(`${what}을 바꿨습니다`); P = await api(`/tenants/${encodeURIComponent(cur)}/page`); paint(); }
    catch (e) { toast(e.message || '지금은 바꿀 수 없습니다'); }
  }

  function services() {
    const tb = h('tbody');
    for (const s of P.services) {
      const none = s.default?.name ? `미지정 — ${s.default.name}(서비스 담당)이 받음` : '미지정 — LX 관리자가 받음';
      tb.append(h('tr', {},
        h('td', {}, h('b', { text: s.name }), h('small', { text: s.year ? `${s.year}년 사업` : '' })),
        h('td', {}, h('span.t-chip', { dataset: { lv: LV[s.status] || 'wait' }, text: s.status || '첫 결과 전' }), h('small', { text: s.round || (s.status === '운영' ? '' : '영상이 들어오면 분석') })),
        h('td.num', {}, s.edition ? `${nf(val(s.edition))}판` : '—', h('small', { text: s.edition_at ? ymd(s.edition_at) : '' })),
        h('td', {}, staffSel(s.staff?.id, none, (uid) => putStaff({ card_id: s.card, user_id: uid }, `${s.name} 헬프데스크 담당`)))));
    }
    const tbl = h('table.tp-t', {}, h('thead', {}, h('tr', {}, ...['서비스', '상태 · 최근 결과', '결과 설명서', 'LX 헬프데스크 담당'].map((t) => h('th', { text: t })))), tb);
    const shoot = h('section.t-card.tp-shoot', {},
      h('div', {}, h('b', { text: '촬영 요청은 누가 받나' }), h('p', { text: '관리자가 직접 답하거나, 직원 한 사람을 지정합니다. 비어 있으면 관리자 직접.' })),
      staffSel(P.shoot?.id, '관리자 직접', (uid) => putStaff({ shoot: true, user_id: uid }, '촬영 요청 담당')));
    return h('div.tp-svc', {},
      h('h2.tp-h2', {}, '받는 서비스와 담당', h('small', { text: '서비스마다 LX 헬프데스크 담당 — 검토 요청 · 분석 요청 · 못 읽는 파일을 받습니다' })),
      h('section.t-card.tp-card', {}, P.services.length ? tbl : h('p.tp-none', { text: '이 기관이 받는 서비스가 없습니다' }),
        h('p.tp-foot', { text: '담당을 바꾸면 처리 기록이 남고, 기관 화면에는 그 서비스의 LX 담당 이름만 보입니다.' })),
      h('h2.tp-h2', {}, '촬영 요청 담당', h('small', { text: '이 기관이 보내는 새 촬영 요청 — 시기 · 금액 답' })), shoot);
  }

  function images() {
    const oo = { id: cur, name: P.name };
    return h('div.tp-img', {}, h('section.t-card.tp-card', {}, shares(oo)), h('section.t-card.tp-card', {}, mainPhoto(oo)));
  }

  function usage() {
    const D = o().dims || {};
    const u = (k, label, sub) => {
      const x = val(D[k]?.used);
      const d = DIM[k] || { unit: '건', k: 1 };
      const n = x == null ? null : x * (d.k || 1);
      const small = k === 'storage_gb' && n != null && n > 0 && n < 1;
      return h('div.tp-u', {}, h('b.num', {}, n == null ? '—' : small ? nf(n * 1000) : nf(n, n < 10 ? 1 : 0), h('small', { text: small ? 'MB' : k === 'llm_requests_month' ? '건' : d.unit })), h('span', { text: label }), sub ? h('small', { text: sub }) : null);
    };
    const bd = D.storage_gb?.breakdown;
    const bsub = bd ? `결과 ${nf(val(bd.files_gb), 2)} · 대장 ${nf(val(bd.db_gb), 2)} · 올린 영상 ${nf(val(bd.uploads_gb), 3)} GB` : '';
    const use = h('section.t-card.tp-card', {}, h('div.tp-us', {}, u('storage_gb', '저장', bsub), u('gpu_s_month', 'GPU 시간', '분석 · 학습 포함'),
      u('area_km2_month', '분석 면적', '분석 요청으로 돌린 넓이'), u('llm_requests_month', 'XI ChatGEO 요청', '채팅으로 지도 제어 · 분석 · 보고서')),
    h('p.tp-foot', { text: '이번 달 · 얼마나 쓰고 있나만 봅니다(막는 한도 없음).' }));
    const acc = h('section.t-card.tp-card', {}, h('div.tp-hold'));
    empty(acc.firstChild, { kind: 'loading', compact: true });
    api(`/accounts/users?realm=tenant&tenant_id=${encodeURIComponent(cur)}`).then((j) => {
      const all = (j.items || []).filter((x) => x.tenant_id === cur);
      const on = all.filter((x) => x.status !== 'disabled'), off = all.filter((x) => x.status === 'disabled');
      const row = (x) => h('tr', {}, h('td', {}, h('b', { text: x.name || '이름 없음' }), h('small', { text: x.login })), h('td', { text: x.dept || '—' }),
        h('td', { text: x.role_ko || ROLE_KO[x.role] || '' }), h('td', { text: P.views?.[x.id] || '—' }),
        h('td', {}, x.last_login ? mdhm(x.last_login) : '—', x.last_login_where ? h('small', { text: x.last_login_where }) : null),
        h('td', {}, h('span.t-chip', { dataset: { lv: x.status === 'active' ? 'ok' : x.status === 'disabled' ? 'gap' : 'warn' }, text: x.status === 'active' ? '사용 중' : x.status === 'disabled' ? '사용 중지' : '잠김' })));
      const t = h('table.tp-t', {}, h('thead', {}, h('tr', {}, ...['이름', '부서', '역할', '볼 수 있는 서비스', '마지막 로그인', '상태'].map((s) => h('th', { text: s })))), h('tbody', {}, ...on.map(row)));
      const fold = off.length ? h('details.tp-fold', {}, h('summary', { text: `사용 중지 ${off.length} 보기` }), h('table.tp-t', {}, h('tbody', {}, ...off.map(row)))) : null;
      acc.replaceChildren(t, fold || '', h('p.tp-foot', {}, '가입 승인은 기관 관리자가 합니다. 잠금 · 임시 비밀번호는 ', h('a', { href: '/landxi/v3/ops-accounts/', text: '계정 관리' }), '에서.'));
    }).catch(() => { acc.replaceChildren(h('div.tp-hold')); empty(acc.firstChild, { kind: 'error', compact: true }); });
    return h('div.tp-use', {}, h('h2.tp-h2', {}, '사용 현황', h('small', { text: '이번 달' })), use,
      h('h2.tp-h2', {}, '계정', h('small', { text: `기관 관리자 ${nf(val(P.counts.managers))} · 부서 사용자 ${nf(val(P.counts.viewers))}${val(P.counts.disabled) ? ` · 사용 중지 ${nf(val(P.counts.disabled))}` : ''}` })), acc);
  }

  function paint() {
    if (!P) return;
    const body = tab === 'svc' ? services() : tab === 'img' ? images() : tab === 'use' ? usage() : overview();
    page.replaceChildren(head(), tabs(), h('div.tp-b', {}, body));
    document.title = `Land-XI · LX 관리자 화면 · 기관 · ${P.name}`;
  }

  route();
  return { route };
}
