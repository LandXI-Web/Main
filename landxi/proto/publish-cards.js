/* 카드 발행 — 발행된 AI 분석 카드 목록 (원본 landxi7/ai-card.html · 원판 B6-Publish-Cards · Cards-Empty).
   검색어(전체 · 카드 이름 · 프로젝트) + 공개 여부 · 초기화/검색 · 카드 발행 · 카드 8 · 페이지네이터(15/30/90) · 빈 상태.
   URL 이 상태다: ?field=name|project · ?q= · ?public=public|private · ?page= · ?size= */
import { mountShell, mountPager, icon, esc, $ } from './shell.js';
import * as D from './publish-data.js';
import { fig } from './publish-ui.js';

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
  const s = q.toString(); history[replace ? 'replaceState' : 'pushState'](null, '', PAGE + (s ? `?${s}` : '')); read(); render();
}
function filtered() {
  const k = S.q.trim().toLowerCase();                       // 원본: 세 검색 구분 모두 카드 이름(= 프로젝트명)에서 찾는다
  return D.CARDS.filter((c) => (!k || c.name.toLowerCase().includes(k)) && (S.pub === 'all' || (S.pub === 'public') === c.isPublic));
}

mountShell({ active: 'publish', title: '카드 발행', titleRule: 1, subtitle: '학습 완료된 모델을 AI 분석 과제로 발행하고 관리합니다', demo: true, crumbIcon: 'layers',
  crumbs: [{ label: '카드 발행 관리', href: 'admin-publish.html' }, { label: '카드 발행' }], headRight: '<div class="pst-band" id="pst" aria-label="발행 카드 수"></div>' });
$('#main').insertAdjacentHTML('beforeend', `
<form class="cd-tool" id="cd-tool" role="search" aria-label="발행 카드 검색">
  <label class="f-lab" for="cd-field">검색어</label><span class="sel"><select id="cd-field"><option value="all">전체</option><option value="name">카드 이름</option><option value="project">프로젝트</option></select></span>
  <input class="inp" id="cd-q" placeholder="검색어" aria-label="검색어" autocomplete="off">
  <label class="f-lab" for="cd-pub">공개 여부</label><span class="sel"><select id="cd-pub"><option value="all">전체</option><option value="public">공개</option><option value="private">비공개</option></select></span>
  <button type="reset" class="q-reset">초기화</button><button type="submit" class="btn-br">검색</button>
  <a class="btn" href="ai-card-edit.html">${icon('plus', 14)}카드 발행</a>
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
    ? `<div class="cd-grid" role="list">${rows.map((c) => `<a class="cd" role="listitem" href="ai-card-edit.html?cid=${c.cid}&mc=0" data-cid="${c.cid}"><div class="cd-th">${fig(c.thumb, { alt: `${c.name} 실크롭`, long: true })}</div><div class="cd-b"><div class="cd-n">${esc(c.name)}</div><div class="cd-m"><span class="st ${c.isPublic ? 'st--acc' : 'st--dim'}">${c.isPublic ? '공개' : '비공개'}</span><span class="go">열람 ›</span><span class="n">${esc(c.published)}</span></div></div></a>`).join('')}</div>`
    : `<div class="cd-none">${icon('layers', 36)}<h3 class="d">발행된 카드가 없습니다</h3><p>프로젝트에서 학습을 완료한 후 결과를 카드로 발행하세요</p><a class="btn btn--l" href="ai-card-edit.html">${icon('plus', 14)}카드 발행</a></div>
       <div class="cd-steps" aria-label="카드 발행 3단계">${[['1', '프로젝트 선택', '학습을 마친 AI 개발 프로젝트'], ['2', '학습 결과 선택', '이미 발행된 학습 결과는 선택할 수 없습니다'], ['3', '정보 입력', '모델 명 · 도커 이미지 · 탐지 형태 · 타일링 크기']].map(([no, k, s]) => `<div><b>${no}</b><strong>${k}</strong><span>${s}</span></div>`).join('')}</div>`;
  pager.set({ total: list.length, page: S.page, size: S.size });
  $('#cd-live').textContent = `발행 카드 ${list.length}건`;
}

$('#cd-tool').addEventListener('submit', (e) => { e.preventDefault(); go({ field: $('#cd-field').value, q: $('#cd-q').value.trim(), pub: $('#cd-pub').value, page: 1 }); });
$('#cd-tool').addEventListener('reset', (e) => { e.preventDefault(); go({ field: 'all', q: '', pub: 'all', page: 1 }); $('#cd-q').focus(); });
addEventListener('popstate', () => { read(); render(); });
read(); render();
