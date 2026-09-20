/* 프로젝트 · 데이터 탭 — 파일(주석 썸네일 그리드) + 데이터셋.
   원판 B5-Project-Data.png · B7-Project-File-{Add,Progress,Fail}.png · B7-Project-Dataset-{Create,Detail}.png */
import { openModal, mountPager, bindCounters, say, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, guess, fig, kv, st, empty, cta, br, link, bars, meter, miss } from './project-ui.js';

const KINDS = ['전체', '정사영상', '이미지셋', '공간정보'];

export function dataTab(p, S) {
  const files = p.files, dss = D.datasetsOf(p.id), up = D.uploadOf(p.id);
  const seg = `<div class="pj-seg" role="tablist" aria-label="데이터 구분">
    <button type="button" role="tab" data-seg="files" aria-selected="${S.seg === 'files'}">파일 <span class="n">${files.length}</span></button>
    <button type="button" role="tab" data-seg="datasets" aria-selected="${S.seg === 'datasets'}">데이터셋 <span class="n">${dss.length}</span></button>
    ${S.seg === 'files' ? `<span class="pj-seg-r">
      <span class="sel sel--s"><select id="f-kind" aria-label="유형">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></span>
      <span class="sel sel--s"><select aria-label="검색 필드"><option>데이터명</option><option>촬영</option></select></span>
      <label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" id="f-q" placeholder="검색어" aria-label="검색어"></label>
      <button type="button" class="link link--ink" data-act="f-reset">초기화</button><button type="button" class="link link--ink" data-act="f-search">검색</button>
      <label class="ck"><input type="checkbox" id="f-ex">선택 제외</label>${br('파일 추가', 'file-add')}</span>`
    : `<span class="pj-seg-r">${S.dsnew || S.ds ? `${link('‹ 데이터셋 목록', 'ds-list')}` : `<span class="sel sel--s"><select aria-label="검색 필드"><option>데이터셋명</option></select></span>
      <label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" placeholder="검색어" aria-label="검색어"></label>
      <button type="button" class="link link--ink" data-act="f-reset">초기화</button><button type="button" class="link link--ink" data-act="f-search">검색</button>
      ${link('선택 삭제', 'ds-drop')}${br('데이터셋 만들기', 'ds-new')}`}</span>`}</div>`;

  const body = S.seg === 'files' ? filesBody(p, S, up) : S.dsnew ? dsCreate(p, S) : dsBody(p, S, dss);
  const panel = S.seg === 'files'
    ? (up ? uploadPanel(p, up) : filePanel(p, S))
    : S.dsnew ? suggestPanel(p, S) : dsPanel(p, S, dss);
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
    <section class="split-l">${seg}<div class="panel-b" style="padding-top:0">${body}</div></section>
    <aside class="split-r panel" aria-label="${S.seg === 'files' ? (up ? '추가 현황' : '파일 조회') : '데이터셋 정보'}">${panel}</aside></div>`;
}

/* ── 파일 그리드 ──────────────────────────────────────────────────────────── */
function filesBody(p, S, up) {
  if (!p.files.length) return empty('파일이 없습니다', '데이터 관리 아카이브에서 정사영상을 불러오세요 — 파일 추가', 'image');
  const order = up ? [...p.files].sort((a, b) => (up.items.some((x) => x.id === b.id) ? 1 : 0) - (up.items.some((x) => x.id === a.id) ? 1 : 0)) : p.files;
  const max = 9, show = order.slice(0, max), rest = order.length - show.length;
  const lab = Object.fromEntries(D.labelingOf(p.id).map((l) => [l.file, l]));
  return `<div class="pj-tiles">${show.map((f, i) => tile(p, f, i, S, up, lab[f.id], i === max - 1 && rest > 0 ? rest : 0)).join('')}</div>
  ${dsStrip(p, S)}`;
}
function tile(p, f, i, S, up, lab, more) {
  const u = up && up.items.find((x) => x.id === f.id);
  const on = S.file === f.id;
  const cls = ['pj-tile', u && u.state === '대기' ? 'pj-tile--mute' : '', u && u.state === '추가 실패' ? 'pj-tile--fail pj-tile--mute' : '', u && u.state === '추가 중' ? 'pj-tile--prog' : ''].filter(Boolean).join(' ');
  const badge = u ? `<span class="pj-badge${u.state === '추가 실패' ? ' pj-badge--warn' : u.state === '대기' ? ' pj-badge--mute' : ''}">${esc(u.state)}${u.state === '추가 중' ? ` ${u.pct} %` : u.reason ? ` · ${esc(u.reason)}` : ''}</span>` : '';
  return `<button type="button" class="${cls}" data-file="${esc(f.id)}" aria-selected="${on}"${u && u.state === '추가 중' ? ` style="--p:${u.pct}%"` : ''}>
    <span style="position:relative;display:block">${fig(f.thumb, f.name, '', { style: '--ar:240/147' })}${badge}${more ? `<span class="pj-more">+${more}</span>` : ''}</span>
    <span class="pj-tile-c"><span>${esc(f.name)}</span>${lab ? `<span class="n">라벨 ${n(lab.labels)}</span>` : ''}</span></button>`;
}
function dsStrip(p, S) {
  const dss = D.datasetsOf(p.id);
  if (!dss.length) return '';
  return `<div class="pj-ds"><div class="pj-ds-h"><h3>데이터셋 ${dss.length}</h3><span class="sp" style="flex:1"></span>${link('선택 삭제', 'ds-drop')}${link('데이터셋 만들기 ›', 'ds-new')}</div>
    ${dss.map((d) => `<div class="pj-act" style="grid-template-columns:auto 1fr auto auto auto;gap:14px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
      <input type="checkbox" aria-label="${esc(d.name)} 선택"><span>${esc(d.name)}${d.inferred ? guess() : ''}</span>
      <span class="n">${esc(d.ver)}</span><span class="n" style="color:var(--accent)">라벨 ${n(d.labels)}</span><span class="n">${esc(d.created)}</span></div>`).join('')}</div>`;
}

/* ── 우측 판: 파일 조회 / 추가 현황 ── */
function filePanel(p, S) {
  const f = p.files.find((x) => x.id === S.file) || p.files[0];
  if (!f) return `<header class="panel-h"><h2>파일 조회</h2></header><div class="panel-b">${empty('선택한 파일 없음', '왼쪽 그리드에서 파일을 고르세요')}</div>`;
  const lab = D.labelingOf(p.id).find((l) => l.file === f.id);
  return `<header class="panel-h"><h2>파일 조회</h2><span class="sp"></span><span class="mic n">${p.files.indexOf(f) + 1} / ${p.files.length}</span></header>
  <div class="panel-b">${fig(f.thumb, f.name)}
    <h3 class="panel-t" style="margin:12px 0 4px">${esc(f.name)}</h3>
    <p class="mic" style="margin:0 0 12px">${esc(f.kind)} · <span class="n">${esc(f.captured)}</span>${f.demo ? demo() : ''}</p>
    ${kv([['유형', esc(f.kind)], ['촬영', `<span class="n">${esc(f.captured)}</span>`], ['GSD · 규모', `<span class="n">${esc(f.gsdLabel)}</span>`],
      ['용량', `<span class="n">${f.sizeGB >= 1 ? f.sizeGB + ' GB' : (f.sizeGB * 1024).toFixed(1) + ' MB'}</span>`],
      ['좌표계', f.bounds ? 'EPSG:5186' : miss('좌표계 없음')],
      ['범위', f.bounds ? `<span class="n">${f.bounds[0].toFixed(3)}–${f.bounds[2].toFixed(3)} E · ${f.bounds[1].toFixed(3)}–${f.bounds[3].toFixed(3)} N</span>` : miss('범위 없음')],
      ['라벨', lab ? `<span class="n" style="color:var(--accent)">${n(lab.labels)}</span> · ${st(lab.state)}${lab.demo ? demo() : ''}` : miss('미작업')]])}</div>
  <footer class="panel-f"><span class="mic">데이터 관리 › 아카이브에서 불러온 파일</span>${br('선택 제외', 'f-drop')}${cta('라벨링 열기 ›', 'f-label')}</footer>`;
}
function uploadPanel(p, up) {
  const cur = up.items.find((x) => x.state === '추가 중') || up.items.find((x) => x.state === '추가 실패') || up.items[0];
  const f = D.archiveById(cur.id), fail = up.kind === 'fail';
  const done = up.items.filter((x) => x.state === '추가됨').length;
  return `<header class="panel-h"><h2>추가 현황</h2><span class="sp"></span><span class="mic n">${up.items.length}건 · ${fail ? `완료 ${done} · 실패 1` : `진행 중 ${up.items.filter((x) => x.state === '추가 중').length}`}</span></header>
  <div class="panel-b">${fig(f.thumb, f.name, '', { cls: fail ? 'pj-stateimg' : '' })}
    <h3 class="panel-t" style="margin:12px 0 4px">${esc(f.name)}</h3>
    <p class="mic" style="margin:0 0 14px">${cur.state === '추가 실패' ? `<span class="st st--warn">추가 실패 · ${esc(cur.reason)}</span>` : `<span style="color:var(--accent)">추가 중 · ${cur.pct} %</span>`}${demo()}</p>
    <table class="tbl tbl--s"><colgroup><col style="width:44px"><col><col style="width:64px"><col style="width:92px"><col style="width:72px"></colgroup>
      <thead><tr><th class="sr">미리보기</th><th>파일</th><th>상태</th><th>진행률</th><th class="r">잔여</th></tr></thead>
      <tbody>${up.items.map((x) => { const a = D.archiveById(x.id); return `<tr><td>${fig(a.thumb, '', '', { style: '--ar:44/26' })}</td><td>${esc(a.name)}</td>
        <td>${st(x.state)}</td><td>${meter(x.pct)}<span class="n" style="font-size:14px">${x.pct}%</span></td>
        <td class="num r">${x.state === '추가됨' ? '0' : ((a.sizeGB * (100 - x.pct)) / 100).toFixed(1) + ' GB'}</td></tr>`; }).join('')}</tbody></table>
    ${kv(fail
      ? [['사유', `좌표계 없음 — EPSG 미지정 TIF`], ['조치', '데이터 관리 › 발행에서 좌표계 지정 후 다시 추가'], ['크기', `<span class="n">${f.sizeGB} GB · ${cur.pct} % 에서 멈춤</span>`], ['추가 후 파일', `<span class="n">${p.files.length} / ${p.files.length + 1}</span>`]]
      : [['원본', '데이터 관리 › 아카이브'], ['크기', `<span class="n">${f.sizeGB} GB · 잔여 ${((f.sizeGB * (100 - cur.pct)) / 100).toFixed(1)} GB</span>`], ['좌표계', 'EPSG:5186'], ['추가 후 파일', `<span class="n">${p.files.length}</span>`]])}</div>
  <footer class="panel-f">${fail ? `${link('선택 제외', 'up-drop')}${link('좌표계 지정 ›', 'up-crs')}${cta('다시 시도', 'up-retry')}`
    : `${link('일시정지', 'up-pause')}${link('취소', 'up-cancel')}<span class="mic">끝나면 파일 ${p.files.length} · 라벨링 가능</span>`}</footer>`;
}

/* ── 데이터셋 ─────────────────────────────────────────────────────────────── */
function dsBody(p, S, dss) {
  if (!dss.length) return empty('데이터셋이 없습니다', '라벨링을 마친 데이터를 묶어 학습용 데이터셋을 만듭니다 — 데이터셋 만들기', 'grid');
  const labs = D.labelingOf(p.id);
  return `${dss.map((d) => dsCard(p, d, S)).join('')}
  <div class="pj-ds" style="border-top-color:var(--line)"><div class="pj-ds-h"><h3>라벨링 데이터 <span class="n" style="color:var(--accent)">${labs.length}</span></h3></div>
    ${labs.length ? labs.map((l) => `<div class="pj-act" style="grid-template-columns:78px 1fr auto auto auto;gap:14px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)">
      ${fig(l.img.thumb, '', '', { style: '--ar:78/44' })}<span>${esc(l.img.name)}</span><span class="n">${esc(l.img.gsdLabel)}</span>
      <span class="n"${l.real ? ' style="color:var(--accent)"' : ''}>라벨 ${n(l.labels)}</span>${l.demo ? demo() : ''}
      <span class="mic">${esc(inDataset(dss, l.file) || '데이터셋 없음')}</span></div>`).join('') : `<p class="mic">${esc('라벨링한 데이터가 없습니다')}</p>`}</div>`;
}
const inDataset = (dss, file) => dss.filter((d) => (d.items || []).includes(file)).map((d) => d.name.replace(/ 라벨셋$/, '')).join(' · ');
function dsCard(p, d, S) {
  const shots = p.thumbs;
  return `<button type="button" class="pj-dscard" data-ds="${esc(d.id)}" aria-selected="${S.ds === d.id}">
    <span class="pj-samples" style="grid-template-columns:repeat(4,1fr)">${[0, 1, 2, 3].map((i) => fig(shots[(i + (d.id.endsWith('2') ? 4 : 0)) % shots.length], '')).join('')}</span>
    <span class="pj-dscard-t"><span>${esc(d.name)}</span>${d.inferred ? guess() : ''}<span class="sp" style="flex:1"></span><span class="n" style="color:var(--accent)">라벨 ${n(d.labels)}</span></span>
    <span class="pj-dscard-s"><span class="n">${esc(d.ver)}</span> · 생성 <span class="n">${esc(d.created)}</span> · 내 계정</span></button>`;
}
function dsPanel(p, S, dss) {
  const d = dss.find((x) => x.id === S.ds) || dss[0];
  if (!d) return `<header class="panel-h"><h2>데이터셋 정보</h2></header><div class="panel-b">${empty('데이터셋 없음', '라벨링 데이터를 묶어 만드세요')}</div>`;
  const cls = p.classes.map((c) => [c.name, c.name === d.cls ? 1 : (c.n || 0) / Math.max(1, d.labels), c.name === d.cls]);
  const t = D.trainsOf(p.id).find((x) => x.state === '완료');
  return `<header class="panel-h"><h2>데이터셋 정보</h2></header>
  <div class="panel-b">${fig(p.hero, d.name)}
    <h3 class="panel-t" style="margin:12px 0 4px">${esc(d.name)}</h3>
    <p class="mic" style="margin:0 0 12px"><span class="n">${esc(d.ver)}</span> · <span class="n" style="color:var(--accent)">라벨 ${n(d.labels)}</span>${d.inferred ? guess() : ''}</p>
    ${kv([['라벨링 데이터', esc((d.items || []).map((f) => (D.archiveById(f) || {}).name).filter(Boolean).join(' · ') || '—')],
      ['생성', `<span class="n">${esc(d.created)}</span> · 내 계정`], ['기준 해상도', `<span class="n">${d.gsd} cm</span>`],
      ['타일 · 겹침', `<span class="n">${d.tile} px · ${d.overlap} %</span>`],
      ['학습에 사용', t ? `${esc(t.name)}${demo()}` : miss('사용한 학습 없음')]])}
    <p class="lb" style="margin:16px 0 8px">클래스</p>
    <div class="pj-bars">${p.classes.map((c) => `<span>${esc(c.name)}</span><span><i class="${c.name === d.cls ? '' : 'a'}" style="width:${c.name === d.cls ? 100 : 18}%;${c.name === d.cls ? 'background:var(--teal)' : 'background:var(--line)'}"></i></span><span class="n">${n(c.n)}${c.name === d.cls ? '' : ' <span class="dim">제외</span>'}</span>`).join('')}</div>
    <p class="lb" style="margin:16px 0 8px">샘플</p>
    <div class="pj-samples">${p.thumbs.slice(0, 3).map((s) => fig(s, '')).join('')}</div></div>
  <footer class="panel-f">${link('닫기', 'ds-close')}${link('삭제', 'ds-del')}${link('이 데이터셋으로 학습 ›', 'ds-train')}</footer>`;
}

/* 데이터셋 만들기 — 원본 폼 2필드 + 라벨링 데이터 체크 목록 + 자동 제안 드로어 */
function dsCreate(p, S) {
  const labs = D.labelingOf(p.id);
  const total = labs.reduce((a, l) => a + l.labels, 0);
  const gsds = labs.map((l) => l.img.gsd * 100);
  return `<form class="form" id="ds-form" style="display:block">
    <div class="pj-hist-h"><h3 style="font-size:22px">데이터셋 만들기</h3><span class="mic" style="color:var(--accent)">라벨링 데이터 <span class="n" id="ds-sel">${labs.length}</span>건 선택</span></div>
    <div style="display:grid;grid-template-columns:1fr 280px;gap:22px;margin:12px 0 18px">
      <div class="field"><div class="field-h"><label class="field-l" for="ds-name">데이터셋명<em class="req">*</em></label><span class="cnt" data-for="ds-name"></span></div>
        <input id="ds-name" class="inp" maxlength="100" value="${esc(p.name.replace(/ 탐지| 세그멘테이션| 분류/, ''))} 통합 라벨셋"></div>
      <div class="field"><label class="field-l" for="ds-ver">버전<em class="req">*</em></label><input id="ds-ver" class="inp inp--num" value="v1.0"></div></div>
    <div class="pj-hist-h"><h3 style="font-size:16px">라벨링 데이터 선택 <em class="req">*</em></h3><span class="sp" style="flex:1"></span><span class="mic" style="color:var(--accent)"><span class="n">${labs.length}</span>건 중 <span class="n" id="ds-sel2">${labs.length}</span> 선택</span></div>
    <table class="tbl tbl--l"><colgroup><col style="width:40px"><col style="width:112px"><col><col style="width:88px"><col style="width:96px"><col style="width:104px"></colgroup>
      <thead><tr><th><input type="checkbox" id="ds-all" checked aria-label="전체 선택"></th><th class="sr">미리보기</th><th>라벨링 데이터</th><th>GSD</th><th>라벨</th><th>최근 작업</th></tr></thead>
      <tbody>${labs.map((l) => `<tr><td><input type="checkbox" class="ds-ck" checked data-file="${esc(l.file)}" aria-label="${esc(l.img.name)} 선택"></td>
        <td>${fig(l.img.thumb, '', '', { style: '--ar:104/58' })}</td>
        <td><b>${esc(l.img.name)}</b><br><span class="mic">${esc(l.file)} · 드론</span></td>
        <td class="num">${esc(l.img.gsdLabel)}</td><td class="num"${l.real ? ' style="color:var(--accent)"' : ''}>${n(l.labels)}${l.demo ? demo() : ''}</td>
        <td class="num">${esc(l.last)}</td></tr>`).join('')}</tbody></table>
    <p class="mic" style="margin:10px 0 0">공간정보(shp)는 데이터셋 생성 대상에서 제외</p>
    <div class="pj-kpi" style="margin-top:18px">
      <div><b class="n" style="color:var(--ink)">${labs.length}</b><span>라벨링 데이터</span></div>
      <div><b class="n">${n(total)}</b><span>라벨 합계</span></div>
      <div><b class="n" style="color:var(--ink)">${labs.length}</b><span>${esc(labs.map((l) => l.img.captured).join(' ~ ').replace(/^(\S+).*\s(\S+)$/, '$1 – $2'))}</span></div>
      <div><b class="n" style="color:var(--ink)">${gsds.length ? Math.min(...gsds).toFixed(2) + '–' + Math.max(...gsds).toFixed(2) : '—'}</b><span>GSD 범위 (cm)</span></div></div>
  </form>`;
}
function suggestPanel(p, S) {
  const labs = D.labelingOf(p.id), sg = D.suggest(labs.map((l) => l.file));
  if (!sg) return `<header class="panel-h"><h2>데이터셋 설정</h2></header><div class="panel-b">${empty('제안할 값이 없습니다', '라벨링 데이터를 먼저 고르세요')}</div>`;
  return `<header class="panel-h"><h2>데이터셋 설정</h2><em class="tag">자동 제안</em></header>
  <div class="panel-b">${fig(p.hero, '타일 격자 미리보기')}
    <p class="mic" style="margin:8px 0 12px">타일 <span class="n">${sg.tile} px</span> · 이웃 타일과 <span class="n">${sg.overlap} %</span> 겹침</p>
    <div class="pj-kpi" style="grid-template-columns:repeat(3,1fr)">
      <div><b class="n" style="color:var(--accent)" id="sg-gsd">${sg.gsd}</b><span>기준 해상도 (cm)</span></div>
      <div><b class="n" style="color:var(--ink)">${sg.tile}</b><span>타일 크기 (px)</span></div>
      <div><b class="n" style="color:var(--ink)">${sg.overlap}</b><span>겹침 비율 (%)</span></div></div>
    <p class="lb" style="margin:18px 0 8px">근거 · 선택 영상 해상도<span class="sp" style="flex:1"></span></p>
    <div class="pj-bars">${labs.map((l) => { const g = +(l.img.gsd * 100).toFixed(2); const on = g === sg.gsd;
      return `<span class="n">${esc(l.img.captured)}</span><span><i class="${on ? 'a' : ''}" style="width:${Math.round((g / sg.max) * 100)}%"></i></span><span class="n">${g} cm${on ? ' <span style="color:var(--accent)">기준</span>' : ''}</span>`; }).join('')}</div>
    <p class="mic" style="margin-top:14px">모든 선택 영상을 기준 해상도로 통일한 뒤 타일 크기로 잘라 학습 이미지를 만듭니다</p>
    <p class="acts" style="justify-content:flex-start;margin-top:14px">${link('데이터셋 설정 수정 ›', 'sg-edit')}${link('제안값 복원', 'sg-reset')}</p></div>
  <footer class="panel-f">${link('목록', 'ds-list')}${br('취소', 'ds-list')}${cta('만들기', 'ds-make')}</footer>`;
}

/* ── 동작 ─────────────────────────────────────────────────────────────────── */
export function bindData(p, S, go) {
  bindCounters($('#pj-root'));
  $$('#main .pj-seg [data-seg]').forEach((b) => b.addEventListener('click', () => go({ seg: b.dataset.seg, file: '', ds: '', dsnew: false })));
  $$('#main .pj-tile[data-file]').forEach((b) => b.addEventListener('click', () => go({ file: b.dataset.file }, { replace: true })));
  $$('#main .pj-dscard[data-ds]').forEach((b) => b.addEventListener('click', () => go({ ds: b.dataset.ds }, { replace: true })));
  $('#ds-all')?.addEventListener('change', (e) => { $$('#main .ds-ck').forEach((c) => { c.checked = e.target.checked; }); countSel(); });
  $$('#main .ds-ck').forEach((c) => c.addEventListener('change', countSel));
  function countSel() { const k = $$('#main .ds-ck:checked').length; $('#ds-sel').textContent = k; $('#ds-sel2').textContent = k; }

  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'file-add': return openArchive(p, S, go);
      case 'ds-new': return go({ seg: 'datasets', dsnew: true, ds: '' });
      case 'ds-list': return go({ seg: 'datasets', dsnew: false, ds: '' });
      case 'ds-close': return go({ ds: '' }, { replace: true });
      case 'ds-train': return go({ tab: 'train', trnew: true, seg: 'files', ds: '' });
      case 'f-label': return go({ tab: 'labeling', file: S.file || (p.files[0] || {}).id || '' });
      case 'f-reset': case 'f-search': return say('검색 조건을 적용했습니다 · 시연');
      case 'ds-drop': case 'ds-del': return say('선택한 데이터셋을 삭제했습니다 · 시연');
      case 'f-drop': return say('파일을 프로젝트에서 제외했습니다 · 시연');
      case 'up-pause': return say('추가를 일시정지했습니다 · 시연');
      case 'up-cancel': case 'up-drop': D.setUpload(p.id, null); return go({ up: '' });
      case 'up-retry': return retry(p, go);
      case 'up-crs': return (location.href = 'dataset.html');
      case 'sg-edit': case 'sg-reset': return say('데이터셋 설정을 제안값으로 되돌렸습니다 · 시연');
      case 'ds-make': return makeDataset(p, S, go);
      default: return undefined;
    }
  });
}
function makeDataset(p, S, go) {
  const name = $('#ds-name').value.trim(), ver = $('#ds-ver').value.trim();
  const items = $$('#main .ds-ck:checked').map((c) => c.dataset.file);
  if (!name || !ver || !items.length) { say('데이터셋명 · 버전 · 라벨링 데이터를 확인해 주세요.'); return; }
  const sg = D.suggest(items);
  const labels = D.labelingOf(p.id).filter((l) => items.includes(l.file)).reduce((a, l) => a + l.labels, 0);
  D.addDataset(p.id, { name, ver, items, labels, created: '2026-06-08', gsd: sg.gsd, tile: sg.tile, overlap: sg.overlap, cls: p.classes[0].name });
  go({ seg: 'datasets', dsnew: false, ds: '' }); say(`데이터셋 “${name}”을 만들었습니다 · 시연`);
}
function retry(p, go) {
  const u = D.uploadOf(p.id); if (!u) return;
  D.setUpload(p.id, { kind: 'progress', items: u.items.map((x) => (x.state === '추가 실패' ? { ...x, state: '추가 중', pct: 63, reason: '' } : x)) });
  go({ up: 'progress' }); say('다시 시도합니다 · 시연');
}

/* 파일 추가 — 아카이브 목록 모달(B7-Project-File-Add) */
function openArchive(p, S, go) {
  const have = new Set(p.files.map((f) => f.id));
  const rows = D.ARCHIVE;
  const m = openModal({ title: '파일 추가', width: 920, content: `
    <div class="filters" style="margin-bottom:10px"><span class="sel sel--s"><select id="ar-kind" aria-label="유형">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></span>
      <label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" id="ar-q" placeholder="검색어" aria-label="검색어"></label>
      <button type="button" class="link link--ink" id="ar-reset">초기화</button><button type="button" class="link link--ink" id="ar-search">검색</button>
      <span class="sp" style="flex:1"></span><span class="mic">아카이브 <b class="n">${rows.length}</b>건 중 <span class="n">1~${Math.min(8, rows.length)}</span>행</span></div>
    <div class="tbl-wrap"><table class="tbl"><colgroup><col style="width:40px"><col style="width:92px"><col><col style="width:88px"><col style="width:84px"><col style="width:100px"><col style="width:86px"><col style="width:66px"></colgroup>
      <thead><tr><th><input type="checkbox" id="ar-all" aria-label="전체 선택"></th><th>미리보기</th><th>데이터명</th><th>유형</th><th>촬영</th><th>GSD · 규모</th><th>용량</th><th>상태</th></tr></thead>
      <tbody id="ar-body"></tbody></table></div>
    <nav id="ar-pager" style="margin-top:8px"></nav>
    <p class="mic" style="margin:10px 0 0"><b class="n" id="ar-n" style="color:var(--accent)">선택 0건</b></p>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '파일 추가', kind: 'primary', onClick: () => {
      const ids = $$('#ar-body input:checked', m.el).map((c) => c.dataset.id);
      if (!ids.length) { say('추가할 파일을 고르세요.'); return false; }
      D.addFiles(p.id, ids);
      D.setUpload(p.id, { kind: 'progress', items: ids.map((id, i) => (i === 0 ? { id, state: '추가 중', pct: 63 } : { id, state: '대기', pct: 0 })) });
      go({ seg: 'files', up: 'progress', file: ids[0] }); say(`${ids.length}건을 추가합니다 · 시연`); return true;
    } }] });

  let page = 1; const size = 8;
  function draw() {
    const kind = $('#ar-kind', m.el).value, q = $('#ar-q', m.el).value.trim().toLowerCase();
    const list = rows.filter((a) => (kind === '전체' || a.kind === kind) && (!q || a.name.toLowerCase().includes(q)));
    const slice = list.slice((page - 1) * size, page * size);
    $('#ar-body', m.el).innerHTML = slice.map((a) => { const had = have.has(a.id);
      return `<tr${had ? ' class="is-dim"' : ''}><td><input type="checkbox" data-id="${esc(a.id)}" data-gb="${a.sizeGB}"${had ? ' disabled' : ''} aria-label="${esc(a.name)} 선택"></td>
        <td>${a.thumb ? fig(a.thumb, '', '', { style: '--ar:78/44' }) : '<figure class="imgcard imgcard--none" style="--ar:78/44">SHP</figure>'}</td>
        <td>${esc(a.name)}${a.demo ? demo() : ''}</td><td>${esc(a.kind)}</td><td class="num">${esc(a.captured)}</td>
        <td class="num">${esc(a.gsdLabel)}</td><td class="num">${had ? '—' : a.sizeGB >= 1 ? a.sizeGB + ' GB' : (a.sizeGB * 1024).toFixed(1) + ' MB'}</td>
        <td>${had ? '<span class="st st--dim">추가됨</span>' : '<span class="st st--acc">선택</span>'}</td></tr>`; }).join('');
    pager.set({ total: list.length, page });
    $$('#ar-body input', m.el).forEach((c) => c.addEventListener('change', tot));
    tot();
  }
  function tot() {
    const cs = $$('#ar-body input:checked', m.el);
    const gb = cs.reduce((a, c) => a + (+c.dataset.gb || 0), 0);
    $('#ar-n', m.el).textContent = `선택 ${cs.length}건${cs.length ? ` · ${gb.toFixed(1)} GB` : ''}`;
  }
  const pager = mountPager($('#ar-pager', m.el), { total: rows.length, page, size, sizes: [8], onChange: (s) => { page = s.page; draw(); } });
  $('#ar-all', m.el).addEventListener('change', (e) => { $$('#ar-body input:not(:disabled)', m.el).forEach((c) => { c.checked = e.target.checked; }); tot(); });
  ['ar-search', 'ar-reset'].forEach((id) => $('#' + id, m.el).addEventListener('click', () => { if (id === 'ar-reset') { $('#ar-q', m.el).value = ''; $('#ar-kind', m.el).selectedIndex = 0; } page = 1; draw(); }));
  draw();
}
