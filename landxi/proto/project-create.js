/* 프로젝트 만들기 — 한 화면. 이름 → 무엇을 찾을 것인가 → (영상은 선택).
   원판 B5-Project-Create.png · B5-Project-Create-Review.png · 빈 목록 안내 B7-Projects-Empty.png
   ?step=review 로 검토. 만들면 세션 저장에 들어가 목록에 실제로 나타난다(새로 고치면 시드 복귀).

   2026-09-20 개편 — 발주자가 실제로 써 보고 짚은 네 가지를 고쳤다.
     "처음 하면 뭐가 뭔지 잘 모르겠다"
        → 번호 붙은 세 단계로 세웠다. 각 단계가 한 문장으로 무엇을 정하는지 말한다.
     "오브젝트 디텍션 · 세그멘테이션이 잘 안 보인다"
        → 오른쪽 좁은 칸에서 **화면 한가운데로** 올리고 크게 키웠다.
     "인터렉티브하지 않다. 로보플로우는 인터렉티브하던데"
        → 고르면 원본 크롭 위로 **실제 판독 결과가 덮인다.** 비닐하우스에는 상자가,
          농지에는 면이 그려진 실제 산출물이다(results.js 1,674동 · 315.9 ha).
          두 방식이 무엇이 다른지 말로 설명하지 않고 보여 준다.
     "굳이 첫 화면부터 아카이브 선택을 해야 하는건가?"
        → 아니다. 영상은 **선택**으로 내렸다. 프로젝트를 먼저 만들고 데이터 탭에서 넣어도 된다.
          고르고 싶으면 그 자리에서 아카이브가 열린다.
   함께 걷어낸 것: 폼 아래 남원 지도. 만들기 시점에 필요 없고, 이 화면에서 뜨지도 않았다. */
import { mountShell, say, mountPager, bindCounters, icon, esc, openModal, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { demo, guess, fig, kv, cta, br, link, miss, n } from './project-ui.js';

const PAGE = 'ai-project-create.html';
const F = { name: '', det: 'detect', dataType: 'ortho', files: [], reco: 'auto', ds: [], invite: [], role: '편집자' };
let step = new URLSearchParams(location.search).get('step') === 'review' ? 'review' : 'form';
let page = 1; const SIZE = 6;

mountShell({ active: 'project', title: '프로젝트 만들기', titleRule: 0, asOf: false, fit: true,
  crumbIcon: 'chevR', crumbs: [{ label: '프로젝트 목록', href: 'ai-project.html' }, { label: '프로젝트 만들기' }],
  subtitle: step === 'review' ? '<span style="color:var(--accent)">검토</span>' : '' });
$('#page-head')?.setAttribute('data-pj', '');

const main = $('#main');

/* ── 탐지 유형 — 말이 아니라 실제 산출물로 보여 준다 ────────────────────────
   원본 크롭과 결과가 그려진 크롭이 둘 다 있다(project-data.js CLEAN / MARK).
   고르면 결과가 덮인다. 숫자는 results.js 실측이다. */
const KIND = [
  { id: 'detect', name: 'Object Detection', ko: '하나씩 세기',
    what: '상자를 씌워 <b>개수</b>를 센다', when: '동수 · 건수 · 대수를 세야 할 때',
    clean: D.CLEAN.gh[0], mark: D.MARK.gh[0],
    proof: '남원 비닐하우스 <b class="n">1,674</b>동 — 단동 1,469 · 다동 205' },
  { id: 'segment', name: 'Segmentation', ko: '윤곽까지 따기',
    what: '면을 따라 <b>넓이</b>를 잰다', when: '면적 · 경계 · 비율을 내야 할 때',
    clean: D.CLEAN.fl[0], mark: D.MARK.fl[0],
    proof: '남원 농지 <b class="n">315.9</b> ha — 경작 1,291 · 비경작 807 필지' },
];
const kindOf = (id) => KIND.find((k) => k.id === id) || KIND[0];

render();   // KIND 를 쓰므로 선언 뒤에 부른다(const 는 끌어올려지지 않는다)

function render() {
  $$('#main > :not(#page-head)').forEach((e) => e.remove());
  main.insertAdjacentHTML('beforeend', `<div id="pj-root"><div class="split pj-body" style="--l:820fr;--r:396fr">
    <section class="split-l"><div class="panel-b" style="padding-top:0">${step === 'review' ? reviewLeft() : formLeft()}</div></section>
    <aside class="split-r panel" aria-label="새 프로젝트">${sidePanel()}</aside></div></div>`);
  bind();
}

/* ── ① 폼 — 세 단계, 한 화면 ─────────────────────────────────────────── */
function formLeft() {
  return `
  <section class="cr-step">
    <h2 class="cr-h"><b class="cr-n">01</b>이름<span>목록에서 이 이름으로 찾는다</span></h2>
    <div class="field"><div class="field-h"><span class="cnt" data-for="cr-name"></span></div>
      <input id="cr-name" class="inp cr-name" maxlength="100" value="${esc(F.name)}"
        placeholder="예) 남원 비닐하우스 2026" aria-label="프로젝트명"></div>
  </section>

  <section class="cr-step">
    <h2 class="cr-h"><b class="cr-n">02</b>무엇을 찾을 것인가<span>골라 보면 결과가 어떻게 나오는지 그 자리에서 보인다</span></h2>
    <div class="cr-kinds" role="radiogroup" aria-label="탐지 유형">
      ${KIND.map((k) => `
      <label class="cr-kind" data-kind="${k.id}">
        <input type="radio" name="cr-det" value="${k.id}"${F.det === k.id ? ' checked' : ''}>
        <span class="cr-shot">
          <img class="cr-shot-a" src="${esc(k.clean)}" alt="" loading="lazy" decoding="async">
          <img class="cr-shot-b" src="${esc(k.mark)}" alt="${esc(k.name)} 결과 예시" loading="lazy" decoding="async">
          <span class="cr-shot-tag">${F.det === k.id ? '판독 결과' : '원본'}</span>
        </span>
        <span class="cr-kind-b">
          <b>${esc(k.ko)}<em>${esc(k.name)}</em></b>
          <span class="cr-what">${k.what}</span>
          <span class="cr-when">${esc(k.when)}</span>
          <span class="cr-proof">${k.proof}</span>
        </span>
      </label>`).join('')}
    </div>
  </section>

  <section class="cr-step cr-step--last">
    <h2 class="cr-h"><b class="cr-n">03</b>자료<span class="cr-opt">선택 — 영상 · 학습데이터 · 모델. 만든 뒤 데이터 탭에서 넣어도 된다</span></h2>
    <div class="cr-src">
      ${F.files.length ? `<span class="cr-thumbs">${F.files.slice(0, 4).map((f) => `<img src="${esc((D.archiveById(f) || {}).thumb || '')}" alt="" loading="lazy">`).join('')}</span>
        <span class="cr-src-t"><b>${F.files.length}건 선택</b><span class="mic">${pickedText()}</span></span>
        <span class="sp" style="flex:1"></span>${br('바꾸기', 'pick-img')}
        <button type="button" class="link link--ink" data-act="clear-img">비우기</button>`
    : `<span class="cr-src-t"><b>아직 없음</b><span class="mic">나중에 넣어도 프로젝트는 만들어진다</span></span>
        <span class="sp" style="flex:1"></span>${br('지금 아카이브에서 고르기', 'pick-img')}`}
    </div>
  </section>`;
}

/** 고른 것을 **종류별로** 말한다 — `3건 선택` 만으로는 무엇을 골랐는지 알 수 없다. */
function pickedText() {
  const by = new Map();
  F.files.map((f) => D.archiveById(f)).filter(Boolean).forEach((a) => by.set(a.kind, (by.get(a.kind) || 0) + 1));
  const parts = [...by].map(([k, n]) => `${k} ${n}`);
  const g = gsdText();
  return parts.join(' · ') + (g !== '—' ? ` · GSD ${g}` : '');
}
function gsdText() {
  const gs = F.files.map((f) => D.archiveById(f)).filter((a) => a && a.gsd).map((a) => a.gsd * 100);
  return gs.length ? `${Math.min(...gs).toFixed(2)} – ${Math.max(...gs).toFixed(2)} cm` : '—';
}
function recoLabel() {
  const gs = F.files.map((f) => D.archiveById(f)).filter((a) => a && a.gsd).map((a) => a.gsd * 100);
  if (!gs.length) return '영상을 넣으면 정해진다';
  return `≤ ${(Math.ceil(Math.max(...gs)) / 100).toFixed(2)} m/px`;
}

/* ── 아카이브 고르기 — 필요할 때만 연다 ───────────────────────────────────
 *   발주자(2026-09-21): "영상 뿐만아니라 AI 학습데이터도 골라야 할텐데.
 *                        이런 것도 좀 분류 체계가 디테일하게 살아 있어야 한다."
 *
 * 고르개를 **공유 방식(단)** 으로 세운다 — 원본 · 타일 · 학습데이터 · 모델.
 * 종류 이름을 손으로 적지 않는다(registry.js ASSET_TIERS 가 정본, 대장에 실제로
 * 들어 있는 단만 선다). 한 장마다 **밖으로 줄 수 있는지**가 배지로 붙는다.
 * 앞의 고르개는 `전체/정사영상/…` 을 세워 놓고 **아무 데도 안 이어져 있었다**(거르지 않았다). */
let tierF = '전체';
let qF = '';
const tiers = () => D.archiveTiers();
const filtered = () => {
  const q = qF.trim().toLowerCase();
  return D.archiveByTier(tierF).filter((a) => !q || a.name.toLowerCase().includes(q));
};
const SHARE_TONE = { raw: 'dim', tile: 'acc', label: 'teal', model: 'teal' };

function archiveBody() {
  const all = filtered(), slice = all.slice((page - 1) * SIZE, page * SIZE);
  return `<div class="pj-bar cr-arc-bar">
    <span class="chip-b" role="group" aria-label="자산 종류">
      <button type="button" data-tier="전체" aria-pressed="${tierF === '전체'}">전체 <b class="n">${D.ARCHIVE.length}</b></button>
      ${tiers().map((t) => `<button type="button" data-tier="${esc(t.id)}" aria-pressed="${tierF === t.id}" title="${esc(t.how)}">${esc(t.name)} <b class="n">${t.n}</b></button>`).join('')}
    </span>
    <label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" id="cr-q" value="${esc(qF)}" placeholder="이름 검색" aria-label="이름 검색"></label>
    <span class="sp" style="flex:1"></span><span class="mic">${all.length}건 · 선택 <span class="n" id="cr-selN">${F.files.length}</span></span></div>
  ${tierF !== '전체' ? `<p class="cr-arc-how">${esc((tiers().find((t) => t.id === tierF) || {}).how || '')}</p>` : ''}
  <div class="pj-tiles" id="cr-tiles" style="grid-template-columns:repeat(3,1fr)">${
  slice.length ? slice.map((a) => tile(a)).join('')
    : '<p class="cr-arc-none">이 조건에 맞는 자산이 없습니다 — 고르개를 전체로 돌리면 대장 전부가 보입니다.</p>'}</div>
  <nav id="cr-pager" style="margin-top:14px"></nav>`;
}
function tile(a) {
  const on = F.files.includes(a.id);
  const t = tiers().find((x) => x.id === a.tier);
  return `<button type="button" class="pj-tile" data-pick="${esc(a.id)}" aria-selected="${on}">
    <span style="position:relative;display:block">${a.thumb ? fig(a.thumb, a.name, '', { style: '--ar:240/147' }) : `<figure class="imgcard imgcard--none" style="--ar:240/147">${esc(a.kind)}</figure>`}
      ${on ? `<span style="position:absolute;right:8px;top:8px;width:20px;height:20px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center">${icon('check', 14)}</span>` : ''}</span>
    <span class="pj-tile-c"><span>${esc(a.name)}</span>${a.demo ? demo() : ''}</span>
    ${/* 종류 배지와 메타를 **한 줄에 다투게 두지 않는다** — 긴 메타에 밀려 `학..` 으로 뭉갰다.
         분류가 뭉개지면 분류가 있으나 마나다. 배지 줄 · 메타 줄로 나눈다. */''}
    <span class="pj-tile-c cr-tile-m" style="padding-top:0">
      <span class="st st--${SHARE_TONE[a.tier] || 'dim'}">${esc(a.kind)}</span>
      ${t ? `<span class="mic cr-tile-s">${esc(t.share)}</span>` : ''}</span>
    <span class="pj-tile-c cr-tile-n" style="padding-top:0"><span class="mic n">${esc(a.captured)} · ${esc(a.gsdLabel)}</span></span></button>`;
}
function openArchive() {
  const m = openModal({ title: '아카이브에서 고르기', tag: '선택', width: 920, content: archiveBody(),
    actions: [{ label: '취소' }, { label: '넣기', kind: 'primary', onClick: () => { render(); say(`자료 ${F.files.length}건을 넣었습니다 · 시연`); } }] });
  /* 판을 통째로 다시 그린다 — 고르개·안내·타일·쪽넘김이 한 몸이라 부분만 갈면 어긋난다. */
  const redraw = () => { m.el.querySelector('.md-body, [class*="body"]')?.scrollTo?.(0, 0); paint(); };
  const paint = () => {
    const host = $('#cr-tiles', m.el)?.parentElement;
    if (host) host.innerHTML = archiveBody();
    wire();
  };
  const wire = () => {
    const all = filtered();
    if (page > Math.max(1, Math.ceil(all.length / SIZE))) page = 1;
    mountPager($('#cr-pager', m.el), { total: all.length, page, size: SIZE, sizes: [SIZE],
      onChange: (s) => { page = s.page; paint(); } });
    $$('[data-tier]', m.el).forEach((b) => b.addEventListener('click', () => {
      tierF = b.dataset.tier; page = 1; redraw();
    }));
    const q = $('#cr-q', m.el);
    if (q) {
      q.addEventListener('input', () => { qF = q.value; page = 1; paint(); $('#cr-q', m.el)?.focus(); });
    }
    $$('[data-pick]', m.el).forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.pick;
      F.files = F.files.includes(id) ? F.files.filter((x) => x !== id) : [...F.files, id];
      paint();
    }));
  };
  wire();
}

/* ── ② 검토 ── */
function reviewLeft() {
  const first = D.archiveById(F.files[0]);
  const k = kindOf(F.det);
  const rows = [
    ['탐지 유형', `${esc(k.ko)} · ${esc(k.name)}`],
    ['학습데이터 유형', F.dataType === 'ortho' ? '정사영상 (ortho)' : '이미지셋 (imageset)'],
    ['권장 해상도', `${esc(recoLabel())}${F.files.length ? ` · 자동 · GSD ${gsdText()}` : ''}`],
    [`영상 ${F.files.length}`, F.files.length
      ? `<span style="display:inline-flex;gap:6px;vertical-align:-14px">${F.files.slice(0, 2).map((f) => fig(D.archiveById(f).thumb, '', '', { style: '--ar:52/30;width:52px;display:inline-block' })).join('')}</span> ${esc(F.files.map((f) => D.archiveById(f).name).join(' · '))}`
      : miss('없음 — 데이터 탭에서 나중에 넣는다')],
    [`학습데이터 ${F.ds.length}`, F.ds.length ? esc(F.ds.join(' · ')) : miss('선택 없음 — 라벨링 탭에서 나중에')],
    [`구성원 ${1 + F.invite.length}`, `소유자 · 내 계정${F.invite.length ? ` · ${esc(F.invite.join(' · '))} ${esc(F.role)}` : ''}`],
  ];
  return `<p class="lb" style="margin:0 0 6px">대표 이미지 · 자동</p>
  ${fig(first ? first.thumb : kindOf(F.det).mark, '대표 이미지', '', { style: '--ar:778/300' })}
  <h2 style="margin:16px 0 14px;font-family:var(--disp);font-weight:700;font-size:34px;letter-spacing:-.02em">${esc(F.name || '이름 없는 프로젝트')}</h2>
  <table class="tbl tbl--l"><colgroup><col style="width:172px"><col><col style="width:72px"></colgroup><tbody>
    ${rows.map(([kk, v]) => `<tr><td>${esc(kk)}</td><td>${v}</td><td class="r"><button type="button" class="link" data-act="back">수정 ›</button></td></tr>`).join('')}
  </tbody></table>`;
}

/* ── 우측 판 ── */
function sidePanel() {
  const k = kindOf(F.det);
  if (step === 'review') {
    return `<header class="panel-h"><h2>새 프로젝트</h2><span class="sp"></span><span class="mic" style="color:var(--accent)">확인하고 만들기</span></header>
    <div class="panel-b">${kv([['프로젝트명', esc(F.name)], ['탐지 유형', `${esc(k.ko)} · ${esc(k.name)}`],
      ['학습데이터 유형', F.dataType === 'ortho' ? '정사영상 (ortho)' : '이미지셋 (imageset)'],
      ['영상', F.files.length ? `<span class="n">${F.files.length}</span> · <span class="n">${gsdText()}</span>` : miss('없음')],
      ['권장 해상도', `<span class="n">${esc(recoLabel())}</span>${F.files.length ? guess() : ''}`],
      ['학습데이터', F.ds.length ? esc(F.ds.join(' · ')) : miss('선택 없음')],
      ['구성원', `<span class="n">${1 + F.invite.length}</span> · 소유자${F.invite.length ? ` + 편집자 ${F.invite.length}` : ''}`]])}</div>
    <footer class="panel-f"><a class="link link--ink" href="ai-project.html">목록</a>${br('뒤로', 'back')}${cta('프로젝트 만들기', 'make')}</footer>`;
  }
  return `<header class="panel-h"><h2>새 프로젝트</h2></header>
  <div class="panel-b">
    ${kv([
    ['이름', F.name.trim() ? esc(F.name) : miss('아직 없음')],
    ['탐지 유형', `${esc(k.ko)}<br><span class="mic">${esc(k.name)}</span>`],
    ['영상', F.files.length ? `<span class="n">${F.files.length}</span>건 · <span class="n">${gsdText()}</span>` : '<span class="mic">나중에</span>'],
    ['권장 해상도', `<span class="mic">${esc(recoLabel())}</span>`],
  ])}
    <hr class="hr" style="margin:16px 0">
    <details class="cr-more"><summary>세부 설정<span class="mic">학습데이터 유형 · 구성원 초대</span></summary>
      <div class="field" style="margin-top:14px"><label class="field-l" for="cr-dt">학습데이터 유형</label>
        <span class="sel"><select id="cr-dt"><option value="ortho"${F.dataType === 'ortho' ? ' selected' : ''}>정사영상 (ortho)</option><option value="imageset"${F.dataType === 'imageset' ? ' selected' : ''}>이미지셋 (imageset)</option></select></span></div>
      <p class="lb" style="margin:14px 0 6px">학습데이터 불러오기</p>
      <p style="display:flex;align-items:center;gap:12px;margin:0 0 14px">${br('데이터셋 · 라벨링 데이터', 'pick-ds')}<span class="mic">선택 <span class="n">${F.ds.length}</span></span></p>
      <p class="lb" style="margin:0 0 6px">구성원 초대</p>
      <p style="display:flex;align-items:center;gap:10px;margin:0"><input class="inp inp--s" id="cr-inv" placeholder="아이디" aria-label="초대할 아이디" style="flex:1">
        <button type="button" class="link link--ink" data-act="inv-check">확인</button>
        <span class="sel sel--s"><select id="cr-role" aria-label="역할"><option>편집자</option><option>뷰어</option></select></span></p>
      <p style="display:flex;align-items:baseline;margin:12px 0 0;font-size:15px"><b>소유자 · 내 계정</b><span class="sp" style="flex:1"></span><span class="mic n">${1 + F.invite.length} 명</span></p>
    </details>
  </div>
  <footer class="panel-f"><a class="link link--ink" href="ai-project.html">목록</a>${br('취소', 'cancel')}${cta('다음 · 검토', 'review')}</footer>`;
}

/* ── 동작 ── */
function bind() {
  bindCounters($('#pj-root'));
  if (step === 'form') {
    // 이름은 치는 즉시 오른쪽 판에 반영한다(고쳐 놓고 어디에 들어갔는지 몰라 헤매지 않게)
    $('#cr-name')?.addEventListener('input', (e) => { F.name = e.target.value; refreshSide(); });
    // 유형을 고르면 그 카드에만 판독 결과가 덮인다
    $$('input[name="cr-det"]').forEach((r) => r.addEventListener('change', () => {
      F.det = r.value;
      $$('.cr-kind').forEach((l) => { const on = l.dataset.kind === F.det;
        $('.cr-shot-tag', l).textContent = on ? '판독 결과' : '원본'; });
      refreshSide();
    }));
  }
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'review': keep();
        if (!F.name.trim()) { say('프로젝트 이름을 지어 주세요.'); $('#cr-name')?.focus(); return; }
        step = 'review'; history.pushState(null, '', PAGE + '?step=review'); render(); return;
      case 'back': step = 'form'; history.pushState(null, '', PAGE); render(); return;
      case 'cancel': location.href = 'ai-project.html'; return;
      case 'make': return make();
      case 'pick-img': keep(); openArchive(); return;
      case 'clear-img': keep(); F.files = []; render(); say('영상 선택을 비웠습니다'); return;
      case 'pick-ds': keep(); F.ds = F.ds.length ? [] : ['비닐하우스 라벨 v3']; render(); say(F.ds.length ? '학습데이터 1건을 선택했습니다 · 시연' : '학습데이터 선택을 해제했습니다'); return;
      case 'inv-check': { keep(); const v = $('#cr-inv').value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { $('#cr-inv').setAttribute('aria-invalid', 'true'); say('아이디를 확인해 주세요.'); return; }
        F.invite = [...new Set([...F.invite, v.split('@')[0]])]; render(); say(`${v.split('@')[0]} 님을 초대 목록에 넣었습니다 · 시연`); return; }
      default: return undefined;
    }
  });
  addEventListener('popstate', () => { step = new URLSearchParams(location.search).get('step') === 'review' ? 'review' : 'form'; render(); }, { once: true });
}
/** 오른쪽 요약만 다시 그린다 — 입력 중에 포커스를 잃지 않게. */
function refreshSide() {
  const aside = $('.split-r'); if (!aside) return;
  const open = $('.cr-more')?.open;
  aside.innerHTML = sidePanel();
  if (open) $('.cr-more').open = true;
}
function keep() {
  if (step !== 'form') return;
  F.name = ($('#cr-name') || {}).value ?? F.name;
  F.det = ($('input[name="cr-det"]:checked') || {}).value || F.det;
  F.dataType = ($('#cr-dt') || {}).value || F.dataType;
  F.role = ($('#cr-role') || {}).value || F.role;
}
function make() {
  const mid = F.det === 'segment' ? 'best-road' : 'best-vinylhouse';
  const id = D.addProject({ name: F.name.trim(), mid, crop: F.det === 'segment' ? 'fl' : 'gh', files: F.files, created: '2026-06-08 09:30', reco: recoLabel() });
  location.href = `ai-project.html?pid=${encodeURIComponent(id)}&tab=overview`;
}
