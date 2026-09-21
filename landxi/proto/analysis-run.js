/* 분석 서비스 › 분석 실행 · 실행중 · 완료 — 원본 analysis-ai.html 3탭을 기능 1:1 로.
   원판 B5-Analysis-Run-Review.png · B5-Analysis-Run-Progress.png · B5-Analysis-Result.png ·
        B7-Analysis-Progress-Overlay.png · B7-Analysis-Result-Edit.png · B7-Analysis-Share.png
   실지도는 MapLibre + V-World + 실 GeoJSON(assets/data/geo/results/**) 청록. 손 배치 폴리곤 없음.
   화면 장치(필지 표 · 구간 등급 · 히트맵 · 타임라인 · 영상 플레이어)는 **카드의 종류 선언**이 켠다
   (analysis-kind.js · cards.js `kind`/`needsOf`) — 카드 이름으로 분기하지 않는다. */
import { esc, icon, openModal, confirmDialog, say, mountPager, bindRows, $, $$, nf } from './shell.js';
import { cardById, modelsOfCard, needsOf, kindName, OUTPUT_KINDS } from '../assets/data/cards.js';
import {
  ARCHIVE, archiveById, modelsForService, allRuns, runById, runsByState, addRun, patchRun, dropRun,
  RUN_STATE, RUN_STEPS, SHARE_ORGS, SHARE_N, roleName, resultById, serviceById, editsOf, saveEdit, AS_OF, runThumb,
} from './analysis-data.js';
import { inputSets, devicesOf, kindLine } from './analysis-kind.js';
import { mountMap, setResult, setPick, frame, loadGeo, bboxOf, setHybrid, setResultVisible, hasGL, centroid } from './analysis-map.js';
import { commit } from './analysis.js';

const pct = (n) => `${Math.round(n)} %`;
const km2 = (n) => `${n.toFixed(2)} km²`;
const cm = (g) => `${(g * 100).toFixed(2)} cm`;

/* ══════════════════════════════════════════════════════════════════════════
   1. 분석 실행 — 과제 선택 → 모델 → 영상 → 실행 (원본 3단 픽커)
   ══════════════════════════════════════════════════════════════════════════ */
const RUN_FACETS = [['all', '전체'], ['recent', '최근'], ['shared', '공유'], ['mine', '내 영상']];
let pick = { imgs: [], facet: 'all', q: '', page: 1, size: 9, model: '' };

export function renderRun(host, S) {
  const card = cardById(S.card) || cardById('card-farm');
  const svc = modelsOfCard(card)[0] || null;
  const sets = inputSets(card), n = needsOf(card);
  const models = svc ? modelsForService(svc.id) : [];
  if (!pick.model || !models.some((m) => m.id === pick.model)) pick.model = models[0]?.id || '';

  host.innerHTML = `
<div class="an-run">
  <div class="split" style="--l:840fr;--r:376fr">
    <section class="split-l" aria-label="분석 실행 준비">
      <div class="step-h"><span class="step-n n">01</span><h2>영상</h2>
        <button type="button" class="link" id="sel-sum">선택 <b class="n">0</b> · <span class="n" id="sel-km">0.00 km²</span></button>
        <span class="sp"></span>
        <span class="chips"><button type="button" class="chip-b" aria-pressed="true" id="from-arch">아카이브에서 불러오기</button><button type="button" class="chip-b" id="from-up">영상 업로드</button></span>
        <label class="inp-ic run-q">${icon('search')}<input class="inp inp--s" id="rq" placeholder="영상명 · 지역" aria-label="영상 검색"></label>
      </div>
      <div class="run-pick">
        <div class="run-arch">
          <div class="run-facets"><span class="chips" role="group" aria-label="영상 묶음">${RUN_FACETS.map(([k, l]) => `<button type="button" class="chip-b" data-facet="${k}" aria-pressed="${pick.facet === k}">${l}</button>`).join('')}</span><span class="sp"></span><span class="mic">아카이브 <b class="n" id="arch-n">0</b></span></div>
          <div class="thumbs" id="thumbs" role="group" aria-label="정사영상 아카이브"></div>
          <div class="empty empty--s" id="arch-empty" hidden></div>
          <nav id="arch-pager" aria-label="아카이브 페이지"></nav>
        </div>
        <div class="run-side">
          <div class="plate" id="run-plate" aria-label="선택 범위 지도"><p class="plate-wait">지도 준비 중</p></div>
          <p class="mic" id="run-extent">선택 범위 —</p>
          <div class="up-box"><p class="up-t">${icon('down', 20)}</p><p class="up-l">영상 업로드 — 끌어다 놓거나 클릭</p><p class="mic">최대 1 TB · ECW TIF · 검증 3</p><a class="link link--ink" href="dataset.html">데이터 관리 › 업로드와 같은 기능 ›</a></div>
          <div class="in-kinds"><p class="lb">이 카드가 받는 입력</p>${sets.map((s) => `<p class="in-k" data-input="${s.id}"><b>${esc(s.name)}</b><span class="n">${s.items.length}</span>${s.gap ? `<span class="mic">${esc(s.gap)}</span>` : `<span class="mic">${esc(s.note)}</span>`}</p>`).join('')}</div>
        </div>
      </div>

      <div class="step-two">
        <div class="step-c"><div class="step-h"><span class="step-n n">02</span><h2>과제</h2><span class="sp"></span><button type="button" class="link" id="ch-card">변경 ›</button></div>
          <div class="pick-card">${svc ? `<span class="pick-n">${esc(card.name)}</span><span class="mic">${esc(card.duty)}</span><span class="mic">${esc(kindLine(card))}</span>` : `<span class="pick-n">${esc(card.name)}</span><span class="st st--dim">모델 없음</span><span class="mic">${esc(card.gap || '모델 개발 전 — 실행 불가')}</span>`}</div></div>
        <div class="step-c"><div class="step-h"><span class="step-n n">03</span><h2>모델</h2><span class="sp"></span><button type="button" class="link" id="ch-model"${models.length ? '' : ' disabled'}>변경 ›</button></div>
          <div class="pick-card" id="pick-model">${models.length ? '' : '<span class="st st--dim">학습 모델 없음</span><span class="mic">프로젝트에서 모델을 학습해 카드에 묶어야 한다</span>'}</div></div>
      </div>
    </section>

    <aside class="split-r panel an-panel" aria-label="실행 요약">
      <header class="panel-h"><h2>실행 요약</h2><span class="sp"></span><span class="st st--acc">검토</span></header>
      <div class="panel-b"><dl class="kv kv--l" id="run-sum" style="--kw:80px"></dl>
        <p class="help" id="run-why"></p></div>
      <footer class="panel-f"><button type="button" class="btn btn--block" id="go-run">분석 실행</button></footer>
    </aside>
  </div>
</div>`;

  /* 모델 카드 */
  const drawModel = () => {
    const m = models.find((x) => x.id === pick.model);
    if (!m) return;
    $('#pick-model').innerHTML = `<span class="pick-n">${esc(m.name)}</span><span class="mic">${esc(m.task)} · 클래스 ${m.classes.length} · <span class="n">${m.sizeMB} MB</span> · 학습 <span class="n">${esc(m.trainedAt)}</span>${m.inferred ? ' <em class="tag">추정</em>' : ''}</span><span class="mic">${esc(m.classes.join(' · '))}</span>`;
  };
  drawModel();

  /* 아카이브 목록 — 입력 선언이 허용하는 것만 */
  const pool = () => sets.flatMap((s) => s.items);
  const filtered = () => pool().filter((a) => (pick.facet === 'all' || (pick.facet === 'recent' && a.recent) || (pick.facet === 'mine' && a.mine) || (pick.facet === 'shared' && !a.mine))
    && (!pick.q || a.label.toLowerCase().includes(pick.q.toLowerCase())));
  const pager = mountPager($('#arch-pager'), { total: 0, page: pick.page, size: pick.size, sizes: [9, 18], onChange: ({ page, size }) => { pick.page = page; pick.size = size; drawThumbs(); } });

  function drawThumbs() {
    const all = filtered(), page = all.slice((pick.page - 1) * pick.size, pick.page * pick.size);
    $('#thumbs').innerHTML = page.map((a) => `
<label class="thumb" data-img="${a.id}">
  <input type="checkbox" ${pick.imgs.includes(a.id) ? 'checked' : ''} aria-label="${esc(a.label)} 선택">
  ${a.thumb ? `<img src="${esc(a.thumb)}" alt="" loading="lazy">` : '<span class="thumb-none">미리보기 없음</span>'}
  <span class="thumb-t">${esc(a.label)}</span>
  <span class="thumb-s n">${esc(a.sensor)} · ${cm(a.gsd)} · ${km2(a.km2)}</span>
</label>`).join('');
    $('#arch-n').textContent = String(pool().length);
    $('#arch-empty').hidden = !!all.length;
    if (!all.length) $('#arch-empty').textContent = pool().length ? `“${pick.q}” 에 맞는 영상이 없습니다 — 묶음을 전체로 바꾸거나 검색어를 지우세요` : (sets.find((s) => s.gap)?.gap || '이 카드가 받는 입력의 아카이브가 비어 있습니다');
    pager.set({ total: all.length, page: pick.page, size: pick.size });
    drawSum();
  }

  function drawSum() {
    const imgs = pick.imgs.map(archiveById).filter(Boolean);
    const area = imgs.reduce((a, x) => a + x.km2, 0);
    $('#sel-sum').innerHTML = `선택 <b class="n">${imgs.length}</b> · <span class="n">${km2(area)}</span>`;
    const m = models.find((x) => x.id === pick.model);
    const b = imgs.length ? imgs.reduce((acc, x) => [Math.min(acc[0], x.bounds[0]), Math.min(acc[1], x.bounds[1]), Math.max(acc[2], x.bounds[2]), Math.max(acc[3], x.bounds[3])], [180, 90, -180, -90]) : null;
    $('#run-extent').textContent = b ? `선택 범위 ${b[0].toFixed(3)}–${b[2].toFixed(3)} E · ${b[1].toFixed(3)}–${b[3].toFixed(3)} N` : '선택 범위 — 영상을 고르면 지도에 선다';
    $('#run-sum').innerHTML = [
      ['영상', imgs.length ? `<b class="n">${imgs.length}</b> · ${esc(imgs.map((x) => x.label).join(' · '))}` : '<span class="dim">선택 전</span>'],
      ['면적', imgs.length ? `<span class="n">${km2(area)}</span>` : '<span class="dim">—</span>'],
      ['GSD', imgs.length ? `<span class="n">${imgs.map((x) => cm(x.gsd)).join(' · ')}</span>` : '<span class="dim">—</span>'],
      ['과제', esc(card.name)],
      ['모델', m ? `${esc(m.name)} · <span class="n">${esc(m.trainedAt)}</span>` : '<span class="dim">없음</span>'],
      ['산출물', 'GPKG · GeoJSON · XLSX'],
      ['좌표계', esc(card.scope === 'global' ? 'EPSG:4326' : 'EPSG:5186 · PNU 결합')],
      ['켜는 장치', devicesOf(card).map((d) => esc(d.name)).join(' · ') || '결과 레이어'],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    const why = !imgs.length ? '영상을 한 장 이상 골라야 실행할 수 있다.' : !m ? '이 카드에 묶인 학습 모델이 없다 — 프로젝트에서 먼저 학습한다.' : '';
    $('#run-why').textContent = why;
    $('#go-run').disabled = !!why;
    drawPlate(imgs);
  }

  /* 선택 범위 지도 — 영상의 실제 bounds 로만 그린다(손 배치 없음) */
  let plate = null;
  async function drawPlate(imgs) {
    const el = $('#run-plate'); if (!el) return;
    if (!hasGL()) { el.innerHTML = '<p class="plate-wait">지도 라이브러리를 불러오지 못했습니다 — 선택 범위는 위 좌표로 확인</p>'; return; }
    if (!plate) { el.textContent = ''; plate = await mountMap(el, { center: [127.42, 35.43], zoom: 9 }); }
    if (!el.isConnected) return;                       // 그 사이 다른 탭으로 갔다
    const fc = { type: 'FeatureCollection', features: imgs.map((a) => ({ type: 'Feature', properties: { cls: a.label }, geometry: { type: 'Polygon', coordinates: [[[a.bounds[0], a.bounds[1]], [a.bounds[2], a.bounds[1]], [a.bounds[2], a.bounds[3]], [a.bounds[0], a.bounds[3]], [a.bounds[0], a.bounds[1]]]] } })) };
    if (!fc.features.length) { setResult(plate, { type: 'FeatureCollection', features: [] }); return; }
    setResult(plate, fc);
    frame(plate, bboxOf(fc.features), { pad: 34, maxZoom: 13 });
  }

  $('#thumbs').addEventListener('change', (e) => {
    const l = e.target.closest('[data-img]'); if (!l) return;
    const id = l.dataset.img;
    pick.imgs = e.target.checked ? [...new Set([...pick.imgs, id])] : pick.imgs.filter((x) => x !== id);
    drawSum();
  });
  $('.run-facets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-facet]'); if (!b) return;
    pick.facet = b.dataset.facet; pick.page = 1;
    $$('[data-facet]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawThumbs();
  });
  $('#rq').addEventListener('input', (e) => { pick.q = e.target.value.trim(); pick.page = 1; drawThumbs(); });
  $('#ch-card').addEventListener('click', () => commit({ tab: 'cards' }));
  $('#ch-model').addEventListener('click', () => models.length && openModelPick(models, (id) => { pick.model = id; drawModel(); drawSum(); }));
  $('#go-run').addEventListener('click', () => startRun(card, models.find((x) => x.id === pick.model), pick.imgs.map(archiveById)));
  /* 업로드는 **데이터 관리에 진짜 드롭존이 있다**(드래그·클릭·검증 3). 여기서 흉내만 내면
     같은 기능이 둘이 되고, 하나는 동작하지 않는 가짜가 된다. 그래서 **그 자리로 보낸다** —
     돌아올 곳(?next)을 들고 가므로 올리고 나면 이 화면으로 돌아온다(2026-09-21). */
  $('#from-up').addEventListener('click', () => {
    say('데이터 관리 › 업로드로 이동합니다');
    location.href = `dataset.html?tab=upload&next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
  });

  drawThumbs();
}

function openModelPick(models, onPick) {
  let sel = models[0].id;
  const m = openModal({
    title: '학습 모델 선택', tag: '시연', width: 680,
    content: `<div class="tbl-wrap"><table class="tbl tbl--l" aria-label="학습 모델"><colgroup><col style="width:36px"><col><col style="width:88px"><col style="width:80px"><col style="width:92px"></colgroup>
<thead><tr><th scope="col"><span class="sr">선택</span></th><th scope="col">모델</th><th scope="col">형태</th><th scope="col">크기</th><th scope="col">학습</th></tr></thead>
<tbody>${models.map((x, i) => `<tr data-row data-id="${x.id}" tabindex="0" aria-selected="${i === 0}"><td><label class="rd"><input type="radio" name="mp" value="${x.id}"${i === 0 ? ' checked' : ''} aria-label="${esc(x.name)}"></label></td><td>${esc(x.name)}<span class="mic"> ${esc(x.classes.join(' · '))}</span></td><td>${esc(x.task)}</td><td class="num"><span class="n">${x.sizeMB} MB</span></td><td class="num"><span class="n">${esc(x.trainedAt)}</span></td></tr>`).join('')}</tbody></table></div>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '선택', kind: 'primary', onClick: () => { onPick(sel); } }],
  });
  bindRows($('tbody', m.el), (row) => { sel = row.dataset.id; $(`input[value="${sel}"]`, m.el).checked = true; });
  m.el.addEventListener('change', (e) => { if (e.target.name === 'mp') sel = e.target.value; });
}

/* ── 실행 → 진행 오버레이(B7-Analysis-Progress-Overlay) ─────────────────── */
function startRun(card, model, imgs) {
  const svc = modelsOfCard(card)[0];
  const id = `run-new-${Date.now().toString(36)}`;
  const first = imgs[0];
  const run = {
    id, name: `${AS_OF.slice(0, 4)}년 ${+AS_OF.slice(5, 7)}월 ${card.name} 실행`, serviceId: svc?.id || null, cardId: card.id,
    imageryId: first?.id || null, state: 'run', at: AS_OF, owner: 'mine', demo: true, resultId: null,
    count: null, unit: svc?.unit || '건', region: '전북 남원시', share: ['lx-admin'], step: 1, pct: 0,
    doneN: 0, totalN: imgs.length, modelId: model?.id || null,
  };
  addRun(run);

  const total = imgs.reduce((a, x) => a + x.km2, 0);
  let p = 0, step = 0;
  const m = openModal({
    title: '분석 진행 중', tag: '시연', width: 640, dismissible: true,
    content: `<div class="prog" id="prog">
  ${first?.thumb ? `<figure class="imgcard" style="--ar:16/7"><img src="${esc(first.thumb)}" alt="${esc(first.label)}"></figure>` : '<div class="imgcard imgcard--none" style="--ar:16/9">미리보기 없음</div>'}
  <p class="mic">${esc(first?.label || '영상 없음')} · ${esc(first?.sensor || '')} ${first ? cm(first.gsd) : ''} · 영상 <span class="n">1</span> / <span class="n">${imgs.length}</span></p>
  <div class="meter" id="p-bar" style="--v:0%"><i></i></div>
  <div class="steps prog-steps" id="p-steps">${RUN_STEPS.map((s, i) => `<span${i === 0 ? ' aria-current="step"' : ''}>${s}</span>`).join('')}</div>
  <div class="prog-nums">
    <p><b class="big" id="p-n">0</b> <span class="n">/ ${nf.format(total ? Math.round(total * 1000) : imgs.length)}</span><span class="lb">처리 단위 진행 <em class="tag">시연</em></span></p>
    <p><b class="big n" id="p-t">--:--</b><span class="lb">시작 시각 <em class="tag">시연</em></span></p>
  </div>
  <p class="mic" id="p-note">실행중 목록에 추가됨</p>
</div>`,
    actions: [
      { label: '새로 분석하기', kind: 'bracket', onClick: (ctx) => { ctx.close(); commit({ tab: 'run' }); return false; } },
      { label: '분석 결과 보기', kind: 'primary', onClick: (ctx) => { ctx.close(); commit({ tab: 'running', run: id }); return false; } },
    ],
    onClose: () => clearInterval(timer),
  });
  $('.modal-h h2', m.el).insertAdjacentHTML('afterend', '<span class="sp"></span><span class="prog-h"><span id="p-stage">전처리</span><b class="n" id="p-pct">0 %</b></span>');
  const now = new Date();
  $('#p-t', m.el).textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const units = total ? Math.round(total * 1000) : imgs.length;
  const timer = setInterval(() => {
    p = Math.min(100, p + 7);
    step = p < 2 ? 0 : p < 95 ? 1 : p < 98 ? 2 : p < 100 ? 3 : 4;      // 원본 JS 임계 2 % / 95 %
    const bar = $('#p-bar', m.el); if (!bar) return clearInterval(timer);
    bar.style.setProperty('--v', `${p}%`);
    $$('#p-steps > span', m.el).forEach((s, i) => (i === step ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
    $('#p-n', m.el).textContent = nf.format(Math.round((units * p) / 100));
    $('#p-stage', m.el).textContent = RUN_STEPS[step];
    $('#p-pct', m.el).textContent = pct(p);
    patchRun(id, { pct: p, step });
    if (p >= 100) {
      clearInterval(timer);
      patchRun(id, { state: 'done', pct: 100, step: 4, count: units, doneN: imgs.length });
      $('#p-note', m.el).textContent = '완료 — 완료 탭에 추가됨';
    }
  }, 380);
}

/* ══════════════════════════════════════════════════════════════════════════
   2. 실행중 — 상태 칩 · 등록자 · 새로고침 · 검색 · 페이지네이션 + 진행 판
   ══════════════════════════════════════════════════════════════════════════ */
const RUN_FILTERS = [['all', '전체'], ['wait', '대기 중'], ['run', '처리 중'], ['fail', '처리 실패']];
let rs = { st: 'all', owner: 'all', q: '', page: 1, size: 10 };

export function renderRunning(host, S) {
  host.innerHTML = `
<div class="an-running"><div class="split" style="--l:452fr;--r:764fr">
  <section class="split-l" aria-label="실행중 목록">
    <div class="run-bar">
      <span class="chips" role="group" aria-label="상태">${RUN_FILTERS.map(([k, l]) => `<button type="button" class="chip-b" data-st="${k}" aria-pressed="${rs.st === k}">${l}</button>`).join('')}</span>
      <span class="sp"></span>
      <span class="chips" role="group" aria-label="등록자"><button type="button" class="chip-b" data-own="all" aria-pressed="${rs.owner === 'all'}">전체</button><button type="button" class="chip-b" data-own="mine" aria-pressed="${rs.owner === 'mine'}">내 것</button><button type="button" class="chip-b" data-own="shared" aria-pressed="${rs.owner === 'shared'}">공유받은 것</button></span>
      <button type="button" class="btn-br btn-br--s" id="rl-refresh" aria-label="새로고침">${icon('reset', 14)}</button>
    </div>
    <label class="inp-ic"> ${icon('search')}<input class="inp inp--s" id="rl-q" placeholder="분석명 · 과제명 · 범위정보" aria-label="실행 검색" value="${esc(rs.q)}"></label>
    <div class="rl" id="rl" role="listbox" aria-label="실행중 목록"></div>
    <div class="empty" id="rl-empty" hidden><p class="empty-t">실행중인 분석이 없습니다.</p><p class="empty-w" id="rl-why"></p></div>
    <nav id="rl-pager" aria-label="실행중 페이지"></nav>
  </section>
  <aside class="split-r panel an-panel" id="rp" aria-label="진행 상황" aria-live="polite"></aside>
</div></div>`;

  const pager = mountPager($('#rl-pager'), { total: 0, page: rs.page, size: rs.size, onChange: ({ page, size }) => { rs.page = page; rs.size = size; draw(); } });
  const list = () => runsByState('running').filter((r) => (rs.st === 'all' || r.state === rs.st) && (rs.owner === 'all' || r.owner === rs.owner)
    && (!rs.q || `${r.name} ${serviceById(r.serviceId)?.name || ''} ${r.region || ''}`.toLowerCase().includes(rs.q.toLowerCase())));

  function draw() {
    const all = list(), page = all.slice((rs.page - 1) * rs.size, rs.page * rs.size);
    if (S.run && !all.some((r) => r.id === S.run)) S.run = '';
    if (!S.run && page.length) S.run = page[0].id;
    $('#rl').innerHTML = page.map((r) => {
      const svc = serviceById(r.serviceId), th = runThumb(r);
      const tone = r.state === 'fail' ? 'st--warn' : r.state === 'wait' ? 'st--dim' : 'st--acc';
      return `<button type="button" class="lcard" data-run="${r.id}" role="option" aria-selected="${r.id === S.run}">
  ${th ? `<figure class="imgcard"><img src="${esc(th)}" alt="" loading="lazy"></figure>` : '<div class="imgcard imgcard--none">—</div>'}
  <span class="lcard-x"><span class="lcard-t"><span>${esc(r.name)}</span>${r.demo ? '<em class="tag">시연</em>' : ''}</span>
  <span class="lcard-s">${esc(svc?.name || '과제 미정')} · <span class="n">${esc(r.at)}</span></span>
  <span class="lcard-s"><span class="st ${tone}">${RUN_STATE[r.state]}</span>${r.totalN ? ` <span class="n">${r.doneN || 0}/${r.totalN}</span>` : ''}${r.state === 'run' ? ` · <span class="n">${pct(r.pct || 0)}</span>` : ''}</span></span>
</button>`;
    }).join('');
    $('#rl-empty').hidden = !!all.length;
    if (!all.length) $('#rl-why').textContent = `상태 = ${RUN_FILTERS.find(([k]) => k === rs.st)[1]} · 등록자 = ${rs.owner === 'all' ? '전체' : rs.owner === 'mine' ? '내 것' : '공유받은 것'}${rs.q ? ` · 검색어 “${rs.q}”` : ''} — 조건을 지우면 전체가 돌아온다`;
    pager.set({ total: all.length, page: rs.page, size: rs.size });
    drawPanel();
  }

  function drawPanel() {
    const p = $('#rp'), r = runById(S.run);
    if (!r) { p.innerHTML = `<header class="panel-h"><h2>진행 상황</h2></header><div class="empty"><p class="empty-t">선택된 실행이 없습니다</p><p class="empty-w">왼쪽 목록에서 실행을 고르면 단계 · 진행률 · 영상별 상태를 본다</p></div>`; return; }
    const svc = serviceById(r.serviceId), im = archiveById(r.imageryId), card = cardById(r.cardId);
    const fail = r.state === 'fail', step = r.step ?? 0;
    p.innerHTML = `
<header class="panel-h"><h2>${RUN_STATE[r.state]}</h2><span class="sp"></span><span class="mic">${esc(svc?.name || '')} · <span class="n">${esc(r.at)}</span></span></header>
<div class="panel-b">
  ${runThumb(r) ? `<figure class="imgcard rp-img" style="--ar:21/9"><img src="${esc(runThumb(r))}" alt="${esc(im?.label || '')}"><figcaption><span>${esc(im.label)}</span><span class="sp"></span><span>${esc(im.sensor)} ${cm(im.gsd)}</span></figcaption></figure>`
    : '<div class="imgcard imgcard--none rp-img" style="--ar:21/9">미리보기 없음</div>'}
  ${fail ? `<p class="rp-fail"><span class="st st--warn">처리 실패</span> ${esc(r.why || '사유 미기록')}</p>`
    : `<div class="meter" style="--v:${r.pct || 0}%"><i></i></div>
       <div class="steps rp-steps">${RUN_STEPS.map((s, i) => `<span${i === step ? ' aria-current="step"' : ''}>${s}<b class="n">${i < step ? '완료' : i === step ? pct(r.pct || 0) : '대기'}</b></span>`).join('')}</div>`}
  <dl class="kv kv--l" style="--kw:84px">
    <div><dt>과제 · 모델</dt><dd>${esc(card?.name || '—')} · ${esc(svc?.name || '—')}</dd></div>
    <div><dt>영상</dt><dd>${esc(im?.label || '—')}${r.totalN ? ` · <span class="n">${r.doneN || 0}/${r.totalN}</span>` : ''}</dd></div>
    <div><dt>등록자</dt><dd>${r.owner === 'mine' ? '내 것' : '공유받은 것'}</dd></div>
    <div><dt>산출물</dt><dd>GPKG · GeoJSON · XLSX · EPSG:5186</dd></div>
  </dl>
  <p class="mic">진행 수치는 <em class="tag">시연</em> — 실제 실행 엔진과 연결되어 있지 않다.</p>
</div>
<footer class="panel-f">${fail ? '<button type="button" class="btn-br" id="rp-retry" style="width:110px">다시 시도</button>' : ''}<button type="button" class="btn-br" id="rp-cancel" style="width:110px">${fail ? '삭제' : '취소'}</button></footer>`;

    $('#rp-retry')?.addEventListener('click', () => { patchRun(r.id, { state: 'wait', step: 0, pct: 0 }); say('다시 실행 대기로 돌렸습니다 · 시연'); draw(); });
    $('#rp-cancel')?.addEventListener('click', async () => {
      if (!await confirmDialog({ title: '확인', body: fail ? '실패한 실행을 삭제하시겠습니까?' : '실행을 취소하시겠습니까?', okLabel: fail ? '삭제' : '취소하기', danger: true })) return;
      dropRun(r.id); S.run = ''; say(fail ? '실행을 삭제했습니다 · 시연' : '실행을 취소했습니다 · 시연'); commit({ run: '' });
    });
  }

  $('.run-bar').addEventListener('click', (e) => {
    const s = e.target.closest('[data-st]'), o = e.target.closest('[data-own]');
    if (s) { rs.st = s.dataset.st; rs.page = 1; $$('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === s))); commit({ run: '' }, false); return; }
    if (o) { rs.owner = o.dataset.own; rs.page = 1; $$('[data-own]').forEach((x) => x.setAttribute('aria-pressed', String(x === o))); commit({ run: '' }, false); return; }
    if (e.target.closest('#rl-refresh')) { draw(); say('목록을 새로 읽었습니다'); }
  });
  $('#rl-q').addEventListener('input', (e) => { rs.q = e.target.value.trim(); rs.page = 1; draw(); });
  $('#rl').addEventListener('click', (e) => { const b = e.target.closest('[data-run]'); if (b) commit({ run: b.dataset.run }); });

  draw();
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 완료 — 목록 · 실지도 결과 · 결과 편집 · 공유 설정 · 다운로드
   ══════════════════════════════════════════════════════════════════════════ */
let ds = { owner: 'all', q: '', page: 1, size: 10 };
let dmap = null, dgeo = null, dfeat = [], dedit = null;

export function renderDone(host, S) {
  if (dmap) { try { dmap.remove(); } catch { /* 이미 떨어진 그릇 */ } dmap = null; }   // 그릇이 새로 서므로 지도도 새로
  host.innerHTML = `
<div class="an-done">
  <section class="dl" aria-label="완료 목록">
    <div class="dl-h"><h2>완료 <span class="n" id="dl-n">0</span></h2><span class="sp"></span>
      <span class="chips" role="group" aria-label="등록자"><button type="button" class="chip-b" data-own="all" aria-pressed="${ds.owner === 'all'}">전체</button><button type="button" class="chip-b" data-own="mine" aria-pressed="${ds.owner === 'mine'}">내 것</button><button type="button" class="chip-b" data-own="shared" aria-pressed="${ds.owner === 'shared'}">공유받은 것</button></span>
      <button type="button" class="btn-br btn-br--s" id="dl-refresh" aria-label="새로고침">${icon('reset', 14)}</button></div>
    <label class="inp-ic">${icon('search')}<input class="inp inp--s" id="dl-q" placeholder="분석명 · 과제명" aria-label="완료 검색" value="${esc(ds.q)}"></label>
    <div class="rl" id="dl" role="listbox" aria-label="완료 목록"></div>
    <div class="empty" id="dl-empty" hidden><p class="empty-t">완료된 분석이 없습니다.</p><p class="empty-w" id="dl-why"></p></div>
    <nav id="dl-pager" aria-label="완료 페이지"></nav>
  </section>

  <section class="dm" aria-label="결과 지도">
    <div class="dm-bar" id="dm-bar"></div>
    <div class="dm-stage">
      <div class="dm-plate" id="dm-plate"><p class="plate-wait">지도 준비 중</p></div>
      <div class="dm-tools" id="dm-tools" role="group" aria-label="지도 도구">
        <button type="button" data-map="fit" aria-label="결과 범위로 맞춤">${icon('grid', 16)}</button>
        <button type="button" data-map="labels" aria-pressed="false" aria-label="지명 표시">${icon('list', 16)}</button>
        <button type="button" data-map="in" aria-label="확대">${icon('plus', 16)}</button>
        <button type="button" data-map="out" aria-label="축소"><svg class="ic" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h12"/></svg></button>
      </div>
    </div>
    <div class="dm-foot" id="dm-foot"></div>
  </section>

  <aside class="panel an-panel dp" id="dp" aria-label="결과" aria-live="polite"></aside>
</div>`;

  const pager = mountPager($('#dl-pager'), { total: 0, page: ds.page, size: ds.size, onChange: ({ page, size }) => { ds.page = page; ds.size = size; drawList(); } });
  const list = () => runsByState('done')
    .filter((r) => (ds.owner === 'all' || r.owner === ds.owner) && (!ds.q || `${r.name} ${serviceById(r.serviceId)?.name || ''}`.toLowerCase().includes(ds.q.toLowerCase())))
    .filter((r) => !S.svc || r.cardId === cardById(S.card)?.id);      // 포털 맥락이면 그 서비스 카드의 실행만

  function drawList() {
    const all = list(), page = all.slice((ds.page - 1) * ds.size, ds.page * ds.size);
    if (S.run && !all.some((r) => r.id === S.run)) S.run = '';
    if (!S.run && page.length) S.run = page[0].id;
    $('#dl-n').textContent = String(all.length);
    $('#dl').innerHTML = page.map((r) => {
      const svc = serviceById(r.serviceId), th = runThumb(r), res = r.resultId ? resultById(r.resultId) : null;
      return `<button type="button" class="lcard" data-run="${r.id}" role="option" aria-selected="${r.id === S.run}">
  ${th ? `<figure class="imgcard"><img src="${esc(th)}" alt="" loading="lazy"></figure>` : '<div class="imgcard imgcard--none">—</div>'}
  <span class="lcard-x"><span class="lcard-t"><span>${esc(r.name)}</span>${r.demo ? '<em class="tag">시연</em>' : ''}</span>
  <span class="lcard-s">${esc(svc?.name || '')} · <span class="n">${esc(r.at)}</span></span>
  <span class="lcard-s">${res ? `<b class="n st--teal">${nf.format(res.stats.count)} ${esc(res.unit)}</b>` : '<span class="st st--dim">산출물 없음</span>'}</span></span>
</button>`;
    }).join('');
    $('#dl-empty').hidden = !!all.length;
    if (!all.length) $('#dl-why').textContent = `등록자 = ${ds.owner === 'all' ? '전체' : ds.owner === 'mine' ? '내 것' : '공유받은 것'}${ds.q ? ` · 검색어 “${ds.q}”` : ''}${S.svc ? ' · 서비스 카드 맥락' : ''} — 조건을 지우면 전체가 돌아온다`;
    pager.set({ total: all.length, page: ds.page, size: ds.size });
    drawResult();
  }

  $('.dl-h').addEventListener('click', (e) => {
    const o = e.target.closest('[data-own]');
    if (o) { ds.owner = o.dataset.own; ds.page = 1; $$('[data-own]').forEach((x) => x.setAttribute('aria-pressed', String(x === o))); commit({ run: '' }, false); return; }
    if (e.target.closest('#dl-refresh')) { drawList(); say('목록을 새로 읽었습니다'); }
  });
  $('#dl-q').addEventListener('input', (e) => { ds.q = e.target.value.trim(); ds.page = 1; drawList(); });
  /* 지도 도구 — maplibre 기본 컨트롤(라운드·그림자)을 쓰지 않고 각진 버튼이 같은 일을 한다. */
  $('#dm-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-map]'); if (!b || !dmap) return;
    const k = b.dataset.map;
    if (k === 'in') dmap.zoomIn(); else if (k === 'out') dmap.zoomOut();
    else if (k === 'labels') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); setHybrid(dmap, on); }
    else { const r = runById(S.run), res = r?.resultId ? resultById(r.resultId) : null; if (res) frame(dmap, res.stats.bbox, { pad: 30, maxZoom: 13.4 }); }
  });
  $('#dl').addEventListener('click', (e) => { const b = e.target.closest('[data-run]'); if (b) { dedit = null; commit({ run: b.dataset.run, edit: '' }); } });

  /* ── 결과 판 + 지도 ── */
  async function drawResult() {
    const r = runById(S.run), panel = $('#dp');
    if (!panel) return;                                 // #view 는 남고 안쪽만 갈리므로 판을 기준으로 본다
    const res = r?.resultId ? resultById(r.resultId) : null;
    const card = r ? cardById(r.cardId) : null;
    const n = card ? needsOf(card) : { parcelRef: true, grid: false, lineRef: false, timeAxis: false, videoPlayer: false };
    const editing = S.edit === '1' && !!res;

    if (!r) {
      panel.innerHTML = `<header class="panel-h"><h2>결과</h2></header><div class="empty"><p class="empty-t">선택된 분석이 없습니다</p><p class="empty-w">왼쪽 목록에서 완료된 분석을 고르면 지도 · 통계 · 공유를 본다</p></div>`;
      $('#dm-bar').innerHTML = ''; $('#dm-foot').innerHTML = ''; $('#dm-tools').innerHTML = '';
      return;
    }
    drawMapBar(r, res, editing, n);
    drawPanel(r, res, card, n, editing);
    await drawMap(r, res, editing);
    if (!panel.isConnected) return;                    // 그 사이 다른 탭으로 갔다
    drawFoot(r, res, n, editing);
  }

  function drawMapBar(r, res, editing, n) {
    $('#dm-bar').innerHTML = editing
      ? `<button type="button" class="chip-b" data-tool="move" aria-pressed="true">${icon('pin', 14)} 이동</button>
         <button type="button" class="chip-b" data-tool="del" aria-pressed="false">${icon('x', 14)} 삭제</button>
         <span class="dm-chg">변경 <b class="n" id="dm-chg">0</b></span><span class="sp"></span>
         <button type="button" class="btn-br btn-br--s" id="ed-cancel">취소</button><button type="button" class="btn btn--s" id="ed-save" style="width:78px">저장</button>`
      : `<button type="button" class="chip-b" data-layer="ortho" aria-pressed="false">정사영상</button>
         <button type="button" class="chip-b" data-layer="res" aria-pressed="true">결과</button>
         ${res ? '<button type="button" class="btn btn--s" id="ed-open" style="width:98px">결과 편집</button>' : ''}
         <span class="sp"></span>
         ${res ? `<span class="dm-cnt"><b class="big n">${nf.format(res.stats.count)}</b><span class="n">${esc(res.unit)}</span><span class="lb">${esc(Object.keys(res.stats.classes).length)} 클래스 · 실측</span></span>`
      : '<span class="dm-cnt"><span class="st st--dim">결과 산출물 없음</span><span class="lb">시드 실행 · 지도에 올릴 도형이 없다</span></span>'}`;
    $('#dm-bar').addEventListener('click', onBar);
  }
  function onBar(e) {
    const l = e.target.closest('[data-layer]'), t = e.target.closest('[data-tool]');
    if (l) { const on = l.getAttribute('aria-pressed') !== 'true'; l.setAttribute('aria-pressed', String(on)); if (dmap) { if (l.dataset.layer === 'res') setResultVisible(dmap, on); else setHybrid(dmap, on); } return; }
    if (t) { $$('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === t))); dedit.tool = t.dataset.tool; return; }
    if (e.target.closest('#ed-open')) { dedit = { moved: [], removed: [], tool: 'move' }; commit({ edit: '1' }); }
    if (e.target.closest('#ed-cancel')) { dedit = null; say('편집을 취소했습니다'); commit({ edit: '' }); }
    if (e.target.closest('#ed-save')) {
      saveEdit(S.run, dedit.moved.length, dedit.removed.length);
      say(`변경 ${dedit.moved.length + dedit.removed.length}건을 저장했습니다 · 시연`);
      dedit = null; commit({ edit: '' });
    }
  }

  async function drawMap(r, res, editing) {
    const el = $('#dm-plate'); if (!el) return;
    if (!hasGL()) { el.innerHTML = '<p class="plate-wait">지도 라이브러리를 불러오지 못했습니다 — 결과 수치는 오른쪽 판에서 확인</p>'; return; }
    if (!dmap) { el.textContent = ''; dmap = await mountMap(el, { center: [127.42, 35.43], zoom: 9 }); }
    if (!el.isConnected || !dmap) return;
    if (!res) { dgeo = null; dfeat = []; setResult(dmap, { type: 'FeatureCollection', features: [] }); setPick(dmap, []); return; }
    if (dgeo?._id !== res.id) {
      el.dataset.loading = '1';
      const geo = await loadGeo('../' + res.geojson);
      if (!el.isConnected || !dmap) return;
      geo._id = res.id; dgeo = geo; dfeat = geo.features;
      el.removeAttribute('data-loading');
    }
    setResult(dmap, dgeo, { dashClasses: Object.keys(res.stats.classes).slice(1) });
    frame(dmap, res.stats.bbox, { pad: 30, instant: true, maxZoom: 13.4 });
    setPick(dmap, editing && dedit ? markFeatures() : []);
  }
  const markFeatures = () => {
    if (!dedit) return [];
    const ids = new Set([...dedit.moved, ...dedit.removed]);
    return dfeat.filter((f, i) => ids.has(i)).map((f, k) => ({ ...f, properties: { ...f.properties, _gone: dedit.removed.includes(dfeat.indexOf(f)) } }));
  };

  /* 아래 띠 — 카드의 출력 선언이 켜는 장치. 이름으로 분기하지 않는다. */
  function drawFoot(r, res, n, editing) {
    const foot = $('#dm-foot');
    const dev = [];
    if (n.parcelRef) dev.push(parcelPanel(res, editing));
    if (n.lineRef) dev.push(devBox('구간 등급 범례', 'lineRef', res ? '선형 기준(노선 · 해안선) 레이어를 받으면 구간 등급을 칠한다' : '결과 산출물 없음'));
    if (n.grid) dev.push(devBox('히트맵 · 격자 집계', 'grid', '밀도 출력 — 격자 색 농도로 칠한다'));
    if (n.timeAxis) dev.push(devBox('타임라인 · 시간 재생', 'timeAxis', '시계열 출력 — 시각을 끌면 그때 상태를 본다'));
    if (n.videoPlayer) dev.push(devBox('영상 플레이어', 'videoPlayer', '드론 영상 입력 — 프레임을 골라 결과와 맞춘다'));
    foot.innerHTML = dev.join('') || '<p class="mic">이 카드는 결과 레이어만 켠다</p>';
    if (n.parcelRef && res) bindParcel(res, editing);
  }
  const devBox = (name, key, why) => `<div class="devbox" data-device="${key}"><p class="devbox-t">${esc(name)}</p><p class="mic">${esc(why)}</p><p class="devbox-n">원천 대기 — 이 카드의 선언이 켠 자리다</p></div>`;

  function parcelPanel(res, editing) {
    if (!res) return `<div class="devbox" data-device="parcelRef"><p class="devbox-t">필지 행정정보</p><p class="mic">결과 산출물이 없어 표를 세울 수 없다</p></div>`;
    const hasPnu = !!res.fields.pnu;
    const cols = hasPnu ? [['연번', 36], ['시도', 52], ['시군구', 66], ['읍면동', 62], ['본번', 44], ['부번', 40], ['탐지 클래스', 0], ['면적 ㎡', 96]]
      : [['연번', 40], ['탐지 클래스', 0], ['면적 ㎡', 96], ['신뢰도', 64]];
    return `<div class="devbox devbox--tbl" data-device="parcelRef">
  <div class="dm-foot-h"><h3>${hasPnu ? '필지 행정정보' : '탐지 객체 정보'}</h3><span class="mic" id="pc-sum"></span><span class="sp"></span><label class="inp-ic pc-q">${icon('search')}<input class="inp inp--s" id="pc-q" placeholder="${hasPnu ? '읍면동 · 본번' : '클래스'}" aria-label="행정정보 검색"></label></div>
  <div class="tbl-wrap"><table class="tbl tbl--s" id="pc-tbl" aria-label="${hasPnu ? '필지 행정정보' : '탐지 객체 정보'}"><colgroup>${cols.map(([, w]) => `<col${w ? ` style="width:${w}px"` : ''}>`).join('')}</colgroup>
    <thead><tr>${cols.map(([l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
  <nav id="pc-pager" aria-label="행정정보 페이지"></nav>
  ${editing ? '<p class="mic">편집 중 — 행을 고르면 지도에서 표시되고, 면적(㎡) 칸만 직접 고칠 수 있다.</p>' : ''}
</div>`;
  }

  function bindParcel(res, editing) {
    const hasPnu = !!res.fields.pnu;
    const [sido, sgg] = (res.region || '').split(' ');
    let q = '', page = 1, size = 5;
    const rows = () => dfeat.map((f, i) => ({ i, p: f.properties }))
      .filter(({ p }) => !q || `${p.emd || ''} ${p.cls || ''} ${p.pnu || ''}`.toLowerCase().includes(q.toLowerCase()));
    const pcPager = mountPager($('#pc-pager'), { total: 0, page, size, sizes: [5, 10, 20], onChange: (v) => { page = v.page; size = v.size; drawRows(); } });
    function drawRows() {
      const all = rows(), pageRows = all.slice((page - 1) * size, page * size);
      $('#pc-tbl tbody').innerHTML = pageRows.map(({ i, p }) => {
        const gone = dedit?.removed.includes(i), moved = dedit?.moved.includes(i);
        const area = editing ? `<input class="inp inp--s inp--num pc-area" value="${(p.area ?? 0).toFixed ? (+p.area).toFixed(0) : esc(p.area)}" data-i="${i}" aria-label="면적 수정">` : `<span class="n">${nf.format(Math.round(+p.area || 0))}</span>`;
        const cells = hasPnu
          ? `<td class="num"><span class="n">${i + 1}</span></td><td>${esc(sido || '')}</td><td>${esc(sgg || '')}</td><td>${esc(p.emd || '—')}</td><td class="num"><span class="n">${esc(String(p.pnu || '').slice(11, 15).replace(/^0+/, '') || '—')}</span></td><td class="num"><span class="n">${esc(String(p.pnu || '').slice(15, 19).replace(/^0+/, '') || '—')}</span></td><td>${esc(p.cls || '—')}</td><td class="r">${area}</td>`
          : `<td class="num"><span class="n">${i + 1}</span></td><td>${esc(p.cls || '—')}</td><td class="r">${area}</td><td class="num r"><span class="n">${p.conf == null ? '—' : (+p.conf).toFixed(2)}</span></td>`;
        return `<tr data-row data-i="${i}" tabindex="0" aria-selected="false"${gone ? ' class="is-dim"' : ''}>${cells}</tr>`;
      }).join('');
      $('#pc-sum').innerHTML = `총 <b class="n">${nf.format(all.length)}</b>건 · 실 GeoJSON 속성${res.fields.pnu ? ' · PNU 결합' : ''}`;
      pcPager.set({ total: all.length, page, size });
    }
    $('#pc-q').addEventListener('input', (e) => { q = e.target.value.trim(); page = 1; drawRows(); });
    bindRows($('#pc-tbl tbody'), (row) => {
      const i = +row.dataset.i;
      if (editing && dedit) {
        if (dedit.tool === 'del') { dedit.removed = dedit.removed.includes(i) ? dedit.removed.filter((x) => x !== i) : [...dedit.removed, i]; }
        else { dedit.moved = dedit.moved.includes(i) ? dedit.moved.filter((x) => x !== i) : [...dedit.moved, i]; }
        $('#dm-chg').textContent = String(dedit.moved.length + dedit.removed.length);
        setPick(dmap, markFeatures());
        drawRows(); drawPanel(runById(S.run), res, cardById(runById(S.run).cardId), needsOf(cardById(runById(S.run).cardId)), true);
      }
      if (dmap && dfeat[i]) dmap.easeTo({ center: centroid(dfeat[i]), zoom: Math.max(dmap.getZoom(), 15.5), duration: 700 });
    });
    $('#pc-tbl').addEventListener('change', (e) => {
      const inp = e.target.closest('.pc-area'); if (!inp || !dedit) return;
      const i = +inp.dataset.i;
      if (!dedit.moved.includes(i)) dedit.moved.push(i);
      $('#dm-chg').textContent = String(dedit.moved.length + dedit.removed.length);
      say(`${i + 1}번 면적을 ${inp.value} ㎡ 로 고쳤습니다 · 저장 전`);
    });
    drawRows();
  }

  /* ── 오른쪽 결과 판 ── */
  function drawPanel(r, res, card, n, editing) {
    const panel = $('#dp'), svc = serviceById(r.serviceId), im = archiveById(r.imageryId);
    const ed = editsOf(r.id), chg = editing && dedit ? dedit.moved.length + dedit.removed.length : 0;
    const st = res?.stats;
    const cls = st ? Object.entries(st.classes).sort((a, b) => b[1] - a[1]) : [];
    const max = cls.length ? cls[0][1] : 1;
    panel.innerHTML = `
<header class="panel-h"><h2>분석명</h2><span class="sp"></span>${res ? `<a class="link link--ink" href="ximap.html?result=${esc(res.id)}" id="to-map">지도 서비스에서 열기 ›</a>` : ''}</header>
<div class="panel-b">
  <h3 class="panel-t">${esc(r.name)}</h3>
  <p class="panel-meta"><span>${esc(svc?.name || '과제 미정')}</span><span>${editing ? '결과 편집 중' : '처리 완료'}</span><span>${esc(im?.sensor || '')} ${esc(im?.captured || '')}</span></p>
  ${editing ? `<div class="ed-strip"><p class="lb">저장 전 변경 <b class="n">${chg}</b></p>
    ${dedit.moved.map((i) => `<p><span class="st st--acc">이동</span> #${i + 1} · ${esc(dfeat[i]?.properties.emd || '')} ${esc(dfeat[i]?.properties.cls || '')}<span class="sp"></span><span class="n">${nf.format(Math.round(+dfeat[i]?.properties.area || 0))} m²</span></p>`).join('')}
    ${dedit.removed.map((i) => `<p><span class="st st--warn">삭제</span> #${i + 1} · ${esc(dfeat[i]?.properties.emd || '')} ${esc(dfeat[i]?.properties.cls || '')}<span class="sp"></span><span class="n">${nf.format(Math.round(+dfeat[i]?.properties.area || 0))} m²</span></p>`).join('')}
    ${chg ? '' : '<p class="mic">지도 도구나 아래 표에서 도형을 고르면 여기 쌓인다</p>'}</div>` : ''}
  <dl class="kv" style="--kw:84px">
    <div><dt>분석일</dt><dd><span class="n">${esc(r.at)}</span>${r.demo ? ' <em class="tag">시연</em>' : ''}</dd></div>
    <div><dt>공유 권한</dt><dd>${esc((r.share || []).map(roleName).join(' · ') || '없음')}</dd></div>
    <div><dt>정사영상</dt><dd>${esc(im?.label || '—')}${im ? ` · <span class="n">${cm(im.gsd)} · ${km2(im.km2)}</span>` : ''}</dd></div>
    <div><dt>종류 선언</dt><dd>${esc(card ? kindLine(card) : '—')}</dd></div>
  </dl>
  ${st ? `
  <div class="dp-nums"><p><b class="big" id="dp-n">${nf.format(st.count - (editing && dedit ? dedit.removed.length : 0))}</b><span class="lb">탐지 ${esc(res.unit)}${editing && dedit?.removed.length ? ` · 저장 시 −${dedit.removed.length}` : ''}</span></p>
    <p><b class="big n">${st.areaHa.toFixed(1)}</b><span class="u">ha</span><span class="lb">면적 합계</span></p></div>
  <h4 class="sec-h">클래스 <span class="n">${cls.length}</span></h4>
  <ul class="bars">${cls.map(([k, v], i) => `<li><span class="bar-k">${esc(k)}</span><span class="bar"${i === 0 ? ' data-first' : ''}><i style="width:${Math.round((v / max) * 100)}%"></i></span><b class="n">${nf.format(v)}</b></li>`).join('')}</ul>
  <h4 class="sec-h">신뢰도 <span class="n">평균 ${st.confMean.toFixed(2)} · 중앙값 ${st.confMedian.toFixed(2)}</span></h4>
  <div class="hist" role="img" aria-label="신뢰도 분포 — 평균 ${st.confMean.toFixed(2)}">
    ${st.confHist.map((v, i) => `<i style="height:${Math.max(2, Math.round((v / Math.max(...st.confHist)) * 100))}%" data-on="${st.confBins[i] >= st.confMean}"></i>`).join('')}
    <span class="hist-m" style="left:${(st.confMean * 100).toFixed(1)}%"><b class="n">${st.confMean.toFixed(2)}</b></span>
  </div>
  <p class="hist-ax"><span class="n">0</span><span class="sp"></span><span class="n">0.5</span><span class="sp"></span><span class="n">1.0</span></p>
  <p class="mic">GeoJSON · GPKG (${esc(st.crsSrc)}) · 원본 ${esc(res.src)}</p>`
      : `<p class="empty empty--s">결과 산출물이 없는 시드 실행입니다 — 지도·통계를 세울 도형이 없다</p>`}
  ${ed ? `<p class="mic">이 세션에 저장한 편집 — 이동 <b class="n">${ed.moved}</b> · 삭제 <b class="n">${ed.removed}</b></p>` : ''}
</div>
<footer class="panel-f">
  <button type="button" class="btn-br" id="dp-share"${editing ? ' disabled' : ''} style="width:104px">${icon('layers', 14)} 공유 설정</button>
  <button type="button" class="btn-br" id="dp-down"${res && !editing ? '' : ' disabled'} style="width:104px">${icon('down', 14)} 다운로드</button>
  <button type="button" class="btn-br" id="dp-del"${editing ? ' disabled' : ''} style="width:72px">삭제</button>
  ${editing ? '<span class="mic dp-hint">저장·취소 후 다시 활성</span>' : ''}
</footer>`;

    $('#dp-share')?.addEventListener('click', () => openShare(r, res));
    /* **실제로 떨어진다.** 전에는 토스트만 띄웠다 — 눌렀는데 아무것도 안 받아지는 버튼이었다.
       결과 GeoJSON 이 저장소에 있으면 그것을, 없으면 무엇을 받았는지 적힌 파일을 만들어 준다. */
    $('#dp-down')?.addEventListener('click', async () => {
      const src = res?.geojson ? `../${res.geojson}` : '';
      const how = await downloadGeoJSON(r.name, src, null);
      if (how === '원본') { say(`${r.name} · GeoJSON 을 내려받았습니다`); return; }
      downloadNote(`${String(r.name).replace(/[\/:*?"<>|]/g, '_')}.txt`, [
        `분석 결과 · ${r.name}`,
        res ? `건수 ${res.stats?.count ?? '—'} ${res.unit || ''} · 시점 ${res.year || '—'}` : '연결된 산출이 없습니다',
      ]);
      say(`${r.name} · 내려받았습니다 — 결과 원본이 연결되면 GeoJSON 으로 떨어집니다`);
    });
    $('#dp-del')?.addEventListener('click', async () => {
      if (!await confirmDialog({ title: '확인', body: '분석 결과를 삭제하시겠습니까?\n결과의 수정·삭제 권한은 LX 에 있습니다.', okLabel: '삭제', danger: true })) return;
      dropRun(r.id); say('분석 결과를 삭제했습니다 · 시연'); commit({ run: '' });
    });
  }

  drawList();
}

/* ── 공유 설정(B7-Analysis-Share) — 기관 3 묶음 · 역할 9 ─────────────────── */
function openShare(run, res) {
  let sel = new Set(run.share || []);
  const body = () => `<div class="share">
  <div class="share-h">${runThumb(run) ? `<figure class="imgcard" style="--ar:100/64"><img src="${esc(runThumb(run))}" alt=""></figure>` : ''}
    <div><p class="share-t">${esc(run.name)}</p><p class="mic">${res ? `${nf.format(res.stats.count)} ${esc(res.unit)} · ` : ''}처리 완료</p></div></div>
  <p class="share-l">분석 결과를 공유할 기관·역할을 선택하세요.</p>
  ${SHARE_ORGS.map((o) => `<div class="share-g"><p class="share-gh">${esc(o.name)}<span class="sp"></span><span class="n">${o.roles.filter((x) => sel.has(x.id)).length} / ${o.roles.length}</span></p>
    ${o.roles.map((x) => `<label class="ck share-r"><input type="checkbox" value="${x.id}"${sel.has(x.id) ? ' checked' : ''}>${esc(x.name)}</label>`).join('')}</div>`).join('')}
</div>`;
  const m = openModal({
    title: '공유 설정', width: 520, content: body(),
    actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: () => { patchRun(run.id, { share: [...sel] }); say(`공유 대상 ${sel.size}건을 저장했습니다 · 시연`); commit({}, false); } }],
  });
  const foot = document.createElement('span');
  foot.className = 'mic share-n';
  $('.modal-f', m.el).prepend(foot);
  const count = () => { foot.innerHTML = `선택 <b class="n">${sel.size}</b> / ${SHARE_N}`; };
  count();
  m.el.addEventListener('change', (e) => {
    const c = e.target.closest('input[type=checkbox]'); if (!c) return;
    if (c.checked) sel.add(c.value); else sel.delete(c.value);
    $$('.share-gh .n', m.el).forEach((s, i) => { s.textContent = `${SHARE_ORGS[i].roles.filter((x) => sel.has(x.id)).length} / ${SHARE_ORGS[i].roles.length}`; });
    count();
  });
}
