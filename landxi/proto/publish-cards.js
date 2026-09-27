/* 카드 발행 — 발행된 AI 분석 카드 목록 (원본 landxi7/ai-card.html · 원판 B6-Publish-Cards · Cards-Empty).
   검색어(전체 · 카드 이름 · 프로젝트) + 공개 여부 · 초기화/검색 · 카드 발행 · 카드 8 · 페이지네이터(15/30/90) · 빈 상태.
   URL 이 상태다: ?field=name|project · ?q= · ?public=public|private · ?page= · ?size= */
import { mountShell, mountPager, say, icon, esc, $, ROLE } from './shell.js';
import * as D from './publish-data.js';
import { fig } from './publish-ui.js';
import { cardById } from '../assets/data/cards.js';
import { sees, opsUrl, XI_MAP } from '../assets/data/roles.js';

/* ══ 생산 딥링크(F2-R · 계약 v1.1-29) — ai-card.html?card=<카드 id>&version=<vX.Y> ══════════════════
   일원화의 '생산' 꼭짓점: 관제 배포 행 · XI맵 계보 칩의 '카드 ↗' 가 여기로 온다.
   카드(서비스 카드 · cards.js)를 연다 → 버전 행(그 버전 강조) → 배포 계보(데이터셋 › 런 › 모델 › 카드 버전 › 배포본 › 기관 › 작업)
   → 왕복 칩: `관제 배포 제어 ↗`(:8702 ?deploy=) · `XI맵에서 보기 ↗`(?svc=) · `생산 공정 ↗`(produce.html?deploy= · 관리자).
   값의 출처 = 배포 기록(landxi/xi/data/deploys-fixture.json · 게이트웨이 /registry 시드와 같은 파일) — 지어내지 않는다.
   ?card 로 온 직원(project)은 **열람만** 한다(roles.js SCREEN_DEEP) — 발행 · 편집 단추는 세우지 않는다. */
const DQ = new URLSearchParams(location.search);
const DEEP = { card: DQ.get('card') || '', version: DQ.get('version') || '' };
const CAN_PUBLISH = sees(ROLE, 'publish');
/* 서비스 카드(cards.js services) → 이 목록의 모델 카드(cid) — 이름이 같은 과제끼리 */
const SERVICE_MODEL = { farmland: [7], greenhouse: [6], feedcrop: [3, 4], silage: [5], pothole: [1, 2], trash: [8] };
const deepCids = () => { const c = cardById(DEEP.card); return c ? [...new Set((c.services || []).flatMap((x) => SERVICE_MODEL[x] || []))] : []; };
const KIND = { dataset: '데이터셋', run: '학습 런', model: '모델', card_version: '카드 버전', deploy: '배포본', tenant: '기관', job: '작업' };
const vKey = (v) => String(v || '').replace(/^card-[\w-]+@/, '').replace(/^v/i, '');

const PAGE = 'ai-card.html', SIZES = [15, 30, 90];
const S = {};
function read() {
  const q = new URLSearchParams(location.search);
  Object.assign(S, { field: ['name', 'project'].includes(q.get('field')) ? q.get('field') : 'all', q: q.get('q') || '', pub: ['public', 'private'].includes(q.get('public')) ? q.get('public') : 'all',
    page: Math.max(1, +q.get('page') || 1), size: SIZES.includes(+q.get('size')) ? +q.get('size') : 15 });
}
function go(patch, replace) {
  const n = { ...S, ...patch }, q = new URLSearchParams();
  if (n.field !== 'all') q.set('field', n.field); if (n.q) q.set('q', n.q); if (n.pub !== 'all') q.set('public', n.pub); if (n.page > 1) q.set('page', n.page); if (n.size !== 15) q.set('size', n.size);
  if (DEEP.card) { q.set('card', DEEP.card); if (DEEP.version) q.set('version', DEEP.version); }   // 딥링크는 검색해도 주소에 남는다
  const s = q.toString(); history[replace ? 'replaceState' : 'pushState'](null, '', PAGE + (s ? `?${s}` : '')); read(); render();
}
function filtered() {
  const k = S.q.trim().toLowerCase();                       // 원본: 세 검색 구분 모두 카드 이름(= 프로젝트명)에서 찾는다
  return D.CARDS.filter((c) => (!k || c.name.toLowerCase().includes(k)) && (S.pub === 'all' || (S.pub === 'public') === c.isPublic));
}

mountShell({ active: 'publish', title: '카드 발행', titleRule: 1, subtitle: CAN_PUBLISH ? '학습 완료된 모델을 AI 분석 과제로 발행하고 관리합니다' : '카드 버전 · 배포 계보 열람 — 발행 · 편집은 LX 관리자', demo: true, crumbIcon: 'layers',
  crumbs: CAN_PUBLISH ? [{ label: '카드 발행 관리', href: 'admin-publish.html' }, { label: '카드 발행' }] : [{ label: '카드 발행' }, { label: '계보 열람' }], headRight: '<div class="pst-band" id="pst" aria-label="발행 카드 수"></div>' });
$('#main').insertAdjacentHTML('beforeend', `${DEEP.card ? '<section class="cd-deep" id="cd-deep" aria-label="카드 버전 · 배포 계보" aria-busy="true"></section>' : ''}
<form class="cd-tool" id="cd-tool" role="search" aria-label="발행 카드 검색">
  <label class="f-lab" for="cd-field">검색어</label><span class="sel"><select id="cd-field"><option value="all">전체</option><option value="name">카드 이름</option><option value="project">프로젝트</option></select></span>
  <input class="inp" id="cd-q" placeholder="검색어" aria-label="검색어" autocomplete="off">
  <label class="f-lab" for="cd-pub">공개 여부</label><span class="sel"><select id="cd-pub"><option value="all">전체</option><option value="public">공개</option><option value="private">비공개</option></select></span>
  <button type="reset" class="q-reset">초기화</button><button type="submit" class="btn-br">검색</button>
  ${CAN_PUBLISH ? `<a class="btn" href="ai-card-edit.html">${icon('plus', 14)}카드 발행</a>` : '<span class="mic" style="margin-left:auto;font-size:14px">열람 전용 · 발행은 LX 관리자</span>'}
</form>
<div class="cd-h"><h2 class="d" id="cd-title">발행 카드 목록</h2><span class="n q-n" id="cd-n"></span></div>
<div class="cd-scroll"><div id="cd-list" aria-labelledby="cd-title"></div></div>
<nav id="pager"></nav>
<p class="sr" id="cd-live" aria-live="polite"></p>`);

const pager = mountPager($('#pager'), { total: 0, page: 1, size: 15, sizes: SIZES, onChange: ({ page, size }) => go({ page, size }) });

function render() {
  const all = D.CARDS, list = filtered(), pub = all.filter((c) => c.isPublic).length;
  $('#pst').innerHTML = [['발행 카드', all.length, 'pst--acc'], ['공개', pub, ''], ['비공개', all.length - pub, '']].map(([k, v, c]) => `<div class="pst ${c}${v ? '' : ' pst--zero'}"><span class="pst-l">${k}</span><span class="pst-v"><b>${v}</b><span>건</span></span></div>`).join('');
  $('#cd-field').value = S.field; $('#cd-q').value = S.q; $('#cd-pub').value = S.pub;
  const n = $('#cd-n'); n.textContent = list.length; n.toggleAttribute('data-zero', !list.length);
  const pages = Math.max(1, Math.ceil(list.length / S.size)); if (S.page > pages) S.page = pages;
  const rows = list.slice((S.page - 1) * S.size, S.page * S.size);
  $('#cd-list').innerHTML = rows.length
    ? `<div class="cd-grid" role="list">${rows.map((c) => `<${CAN_PUBLISH ? 'a' : 'div'} class="cd" role="listitem"${CAN_PUBLISH ? ` href="ai-card-edit.html?cid=${c.cid}&mc=0"` : ''} data-cid="${c.cid}"${deepCids().includes(c.cid) ? ' data-lineage="1"' : ''}><div class="cd-th">${fig(c.thumb, { alt: `${c.name} 실크롭`, long: true })}</div><div class="cd-b"><div class="cd-n">${esc(c.name)}</div><div class="cd-m"><span class="st ${c.isPublic ? 'st--acc' : 'st--dim'}">${c.isPublic ? '공개' : '비공개'}</span><span class="go">열람 ›</span><span class="n">${esc(c.published)}</span></div></div></${CAN_PUBLISH ? 'a' : 'div'}>`).join('')}</div>`
    : `<div class="cd-none">${icon('layers', 36)}<h3 class="d">발행된 카드가 없습니다</h3><p>프로젝트에서 학습을 완료한 후 결과를 카드로 발행하세요</p><a class="btn btn--l" href="ai-card-edit.html">${icon('plus', 14)}카드 발행</a></div>
       <div class="cd-steps" aria-label="카드 발행 3단계">${[['1', '프로젝트 선택', '학습을 마친 AI 개발 프로젝트'], ['2', '학습 결과 선택', '이미 발행된 학습 결과는 선택할 수 없습니다'], ['3', '정보 입력', '모델 명 · 도커 이미지 · 탐지 형태 · 타일링 크기']].map(([no, k, s]) => `<div><b>${no}</b><strong>${k}</strong><span>${s}</span></div>`).join('')}</div>`;
  pager.set({ total: list.length, page: S.page, size: S.size });
  $('#cd-live').textContent = `발행 카드 ${list.length}건`;
}

/* 검색 — 점검기(tools/proto/audit.mjs)가 `검색`을 "눌러도 반응 없음"으로 잡았다.
   코드를 확인해 보니 죽은 것이 아니라, 조건이 비어 있을 때 결과가 그대로여서
   화면이 안 바뀐 것이었다(검색어 `농지` → 8장 → 1장으로 제대로 걸러진다).
   그래도 사용자 입장에서는 눌렀는데 아무 말이 없는 셈이라, 몇 건이 걸렸는지
   한 줄로 알린다. 조건이 있으면 무엇으로 걸렀는지도 함께 말한다. */
$('#cd-tool').addEventListener('submit', (e) => {
  e.preventDefault();
  go({ field: $('#cd-field').value, q: $('#cd-q').value.trim(), pub: $('#cd-pub').value, page: 1 });
  const cond = [S.q ? `“${S.q}”` : '', S.pub === 'all' ? '' : S.pub === 'public' ? '공개' : '비공개'].filter(Boolean).join(' · ');
  say(`${cond ? cond + ' — ' : ''}발행 카드 ${filtered().length}건`);
});
$('#cd-tool').addEventListener('reset', (e) => { e.preventDefault(); go({ field: 'all', q: '', pub: 'all', page: 1 }); $('#cd-q').focus(); });
addEventListener('popstate', () => { read(); render(); });
read(); render();

/* ── 딥링크 판 ─────────────────────────────────────────────────────────── */
const DEEP_CSS = `
.cd-deep{ flex:none; margin:0 0 18px; border:1px solid var(--ink); background:#fff; }
.cd-deep-h{ display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; padding:12px 18px 10px; border-bottom:1px solid var(--line); }
.cd-deep-h .lb{ font-size:14px; color:var(--grey); letter-spacing:.02em; }
.cd-deep-h h2{ margin:0; font-size:22px; line-height:28px; }
.cd-deep-h .dq{ margin-left:auto; font-size:14px; color:var(--grey); }
.cd-deep-b{ display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); }
.cd-deep-b > div{ padding:12px 18px 14px; min-width:0; }
.cd-deep-b > div + div{ border-left:1px solid var(--line); }
.cd-ver{ width:100%; border-collapse:collapse; font-size:15px; }
.cd-ver th{ text-align:left; font-weight:500; font-size:14px; color:var(--grey); padding:4px 8px; border-bottom:1px solid var(--line); }
.cd-ver td{ padding:7px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }
.cd-ver tr[aria-current="true"] td{ background:var(--t1, #E8F1FF); }
.cd-ver tr[aria-current="true"] td:first-child{ box-shadow:inset 3px 0 0 var(--accent); font-weight:700; }
.cd-chain{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 4px; margin:2px 0 12px; }
.cd-ln{ display:inline-flex; flex-direction:column; padding:4px 9px; border:1px solid var(--line); min-width:0; }
.cd-ln i{ font-style:normal; font-size:14px; color:var(--grey); line-height:18px; }
.cd-ln b{ font-size:14px; font-weight:500; line-height:20px; white-space:nowrap; }
.cd-ln[data-kind="card_version"],.cd-ln[data-kind="deploy"]{ border-color:var(--accent); }
.cd-ln-to{ color:var(--grey); font-size:14px; }
.cd-go{ display:flex; flex-wrap:wrap; align-items:stretch; gap:8px; }
.cd-go a{ display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--ink); font-size:14.5px; font-weight:500; white-space:nowrap; transition:background var(--hov) var(--hove), color var(--hov) var(--hove); }
.cd-go a:hover,.cd-go a:focus-visible{ background:var(--ink); color:#fff; }
.cd-go .chip-dp b{ color:var(--accent); }
.cd-note{ margin:10px 0 0; font-size:14px; color:var(--grey); }
.cd[data-lineage="1"] .cd-b{ border-color:var(--accent); background:var(--t1, #E8F1FF); }
.cd[data-lineage="1"] .cd-th::before{ content:"이 카드 구성 모델"; position:absolute; left:0; top:0; z-index:2; padding:3px 10px; background:var(--accent); color:#fff; font-size:14px; line-height:20px; }
@media (max-width:1100px){ .cd-deep-b{ grid-template-columns:1fr; } .cd-deep-b > div + div{ border-left:0; border-top:1px solid var(--line); } }`;
async function deep() {
  const el = $('#cd-deep'); if (!el) return;
  if (!document.getElementById('cd-deep-css')) { const st = document.createElement('style'); st.id = 'cd-deep-css'; st.textContent = DEEP_CSS; document.head.append(st); }
  const card = cardById(DEEP.card);
  if (!card) {
    el.innerHTML = `<div class="cd-deep-h"><span class="lb">카드 버전 · 배포 계보</span><h2 class="d">카드를 찾지 못했습니다</h2><span class="dq">?card=${esc(DEEP.card)}</span></div><p class="cd-note" style="padding:0 18px 12px">등록된 서비스 카드 id 가 아닙니다 — 아래 발행 카드 목록에서 찾으세요.</p>`;
    el.removeAttribute('aria-busy'); el.dataset.state = 'missing'; return;
  }
  let fx = null;
  try { const r = await fetch('../xi/data/deploys-fixture.json', { cache: 'no-store' }); fx = r.ok ? await r.json() : null; } catch { fx = null; }
  const dps = (fx?.items || []).filter((d) => d.card_id === card.id);
  /* 버전 행 — 배포 기록에 실제로 나오는 버전만(지금 운영 · 직전 운영). 없으면 카드 선언 버전 한 줄. */
  const vers = new Map();
  const at = (v) => vers.get(v) || vers.set(v, { v, now: [], before: [] }).get(v);
  for (const d of dps) {
    const cur = vKey(d.card_version_id || d.version), prev = vKey(d.prev_card_version_id);
    if (cur) at(cur).now.push(d);
    if (prev) at(prev).before.push(d);
  }
  if (!vers.size && card.version) at(vKey(card.version));
  const rows = [...vers.values()].sort((a, b) => b.v.localeCompare(a.v, 'en', { numeric: true }));
  const want = vKey(DEEP.version) || rows[0]?.v || '';
  const hit = rows.find((r) => r.v === want);
  const dp = hit?.now[0] || hit?.before[0] || dps[0] || null;
  const chain = (dp && fx?.lineage?.[dp.id]?.chain) || [];
  const canProduce = sees(ROLE, 'produce');
  el.innerHTML = `<div class="cd-deep-h"><span class="lb">카드 버전 · 배포 계보</span><h2 class="d" id="cd-deep-name">${esc(card.name)}</h2><span class="lb">${esc(card.duty || '')}</span>
      <span class="dq">?card=${esc(card.id)}${DEEP.version ? `&amp;version=${esc(DEEP.version)}` : ''}</span></div>
    <div class="cd-deep-b"><div>
      <table class="cd-ver" id="cd-ver"><thead><tr><th>버전</th><th>지금 운영</th><th>직전 운영</th><th>스냅숏</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-ver="v${esc(r.v)}"${r.v === want ? ' aria-current="true"' : ''}><td>v${esc(r.v)}</td><td>${r.now.map((d) => esc(d.id)).join(' · ') || '—'}</td><td>${r.before.map((d) => esc(d.id)).join(' · ') || '—'}</td><td>${esc(r.now[0]?.snapshot_current?.split('/').pop() || r.before[0]?.snapshot_prev?.split('/').pop() || '—')}</td></tr>`).join('')}
      </tbody></table>
      ${DEEP.version && !hit ? `<p class="cd-note" id="cd-ver-miss">${esc(DEEP.version)} 은 배포 기록에 없는 버전입니다 — 기록된 버전만 보입니다.</p>` : ''}
    </div><div>
      <div class="cd-chain" id="cd-chain" aria-label="배포 계보">${chain.length ? chain.map((n, i) => `<span class="cd-ln" data-kind="${esc(n.kind)}"><i>${esc(KIND[n.kind] || n.kind)}</i><b>${esc(n.label || n.id)}</b></span>${i < chain.length - 1 ? '<span class="cd-ln-to" aria-hidden="true">›</span>' : ''}`).join('') : '<span class="cd-note">계보 · 기록 없음</span>'}</div>
      ${dp ? `<div class="cd-go" id="cd-go">
        <span class="cd-ln chip-dp" data-kind="deploy" id="cd-dp-chip"><i>배포 계보</i><b>${esc(dp.id)} · v${esc(want)}</b></span>
        <a id="cd-go-ops" href="${esc(opsUrl('deploys.html', 'deploy=' + dp.id))}" title="LX/OPS 관제 :8702 — 관제 로그인 뒤 그 배포 행">관제 배포 제어 ↗</a>
        <a id="cd-go-xi" href="${esc(XI_MAP)}?svc=${encodeURIComponent(dp.id)}">XI맵에서 보기 ↗</a>
        ${canProduce ? `<a id="cd-go-produce" href="produce.html?deploy=${encodeURIComponent(dp.id)}">생산 공정 ↗</a>` : ''}
      </div>` : '<p class="cd-note">이 카드는 아직 배포본이 없습니다.</p>'}
      <p class="cd-note">출처 · 배포 기록(xi/data/deploys-fixture.json · 게이트웨이 /registry 시드) · 계보 체인은 기록 시점 그대로(${esc(chain.find((n) => n.kind === 'card_version')?.id || '—')}) · 관제는 다른 origin(:8702) — 관제 로그인 한 번 더</p>
    </div></div>`;
  el.removeAttribute('aria-busy');
  el.dataset.state = 'ready'; el.dataset.card = card.id; el.dataset.version = want ? 'v' + want : '';
  say(`${card.name} · v${want} 계보를 열었습니다${dp ? ' · ' + dp.id : ''}`);
}
deep();
