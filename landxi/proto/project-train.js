/* 프로젝트 · 학습 탭 — 워크플로우 캔버스 + 학습 곡선 + 학습 이력 + 새로 학습하기(11필드) + 진행 중 + 결과.
   원판 B5-Project-Train.png · B7-Project-Train-{Fix,New,Running}.png
   곡선에 실측이 없다 — 형태 견본(`견본`)을 식으로 그린다(notes/B7-project-states.md ⑥). */
import { say, bindCounters, bindRows, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, guess, fig, kv, st, empty, cta, br, link, bars, meter, miss } from './project-ui.js';

export function trainTab(p, S) {
  const runs = D.trainsOf(p.id);
  const cur = runs.find((r) => r.id === S.tr) || (S.trnew ? null : runs.find((r) => r.state === '완료') || runs[0] || null);
  const c = D.trainCounts(p.id);
  /* 설정 중 = 아직 없는 학습. 폼의 기본값으로 캔버스를 미리 그린다(B7-Project-Train-New). */
  const draft = { id: '', name: `학습 #${runs.length + 1}`, state: '설정 중', epoch: 0, total: 100, labels: (D.datasetsOf(p.id)[0] || {}).labels || 0,
    iou: null, f1: null, at: '', base: 'XI-VFM v2.1', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25', took: '' };
  const head = S.trnew ? draft : cur || runs.find((r) => r.state === '완료') || runs[0] || null;
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
  <section class="split-l">
    <div class="pj-bar" style="padding-bottom:12px"><label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" id="tr-q" placeholder="학습명" aria-label="학습명"></label>
      <span class="sp" style="flex:1"></span>${S.trnew ? `<span class="pj-tb" aria-pressed="true" style="background:var(--t1);border-color:var(--accent);color:var(--accent)">새로 학습하기</span>` : cta('새로 학습하기', 'tr-new')}</div>
    <div class="panel-b" style="padding-top:0">
      ${runs.length || S.trnew ? flow(p, head, S) : empty('학습 이력이 없습니다', '데이터셋을 만든 뒤 새로 학습하기로 첫 학습을 시작하세요', 'clock')}
      ${runs.length || S.trnew ? curveBlock(p, head, S) : ''}
      ${runs.length ? history(p, runs, c, S) : ''}
    </div></section>
  <aside class="split-r panel" aria-label="${S.trnew ? '새로 학습하기' : '학습 결과'}">${S.trnew ? newForm(p, runs) : cur ? detail(p, cur) : pick(p, runs)}</aside></div>`;
}

/* ── 워크플로우 캔버스 6노드 ── */
function flow(p, t, S) {
  const ds = D.datasetsOf(p.id)[0];
  const setting = S.trnew, running = t && t.state === '진행 중', done = t && t.state === '완료';
  const pct = t && t.total ? Math.round((t.epoch / t.total) * 100) : 0;
  const nodes = [
    { k: setting ? '선택됨' : 'Cached', t: ds ? `데이터셋 ${ds.ver.replace('.0', '')}` : '데이터셋', img: p.thumbs[0], chips: [ds ? `${n(ds.labels)} 라벨` : '라벨 —'], on: true, sel: setting },
    { k: '—', t: '증강 없음', note: '원본 옵션 없음', chips: ['추가 안 함'], wait: true },
    { k: 'Cached', t: t ? t.base : 'XI-VFM v2.1', chips: ['🔒 YOLO11', '이어가기 없음', p.detLabel === 'Segmentation' ? '세그멘테이션' : '객체 탐지'], on: true },
    { k: done ? `완료 ${t.epoch} / ${t.total}` : running ? `진행 중 ${t.epoch} / ${t.total}` : setting ? '설정 중' : '대기', t: t ? t.name : '학습',
      chips: t ? [`에폭 ${t.total}`, `배치 ${t.batch}`, t.size.replace(/ /g, '').replace('×', ' px ').split(' px ')[0] + ' px', t.ratio] : [], on: !!t, sel: setting || running,
      bar: running || done ? pct : null, foot: done ? t.took : running ? `경과 ${t.took || '—'}` : setting ? '시작 전' : '' },
    { k: done ? '완료' : '대기', t: '검증 20 %', chips: done ? [`IoU ${t.iou.toFixed(2)} · F1 ${t.f1.toFixed(2)}`, `임계 ${t.thr}`] : [`임계 ${t ? t.thr : '0.5 · 0.25'}`], on: done, wait: !done },
    { k: done ? '완료' : '대기', t: '결과', img: done ? p.hero : null, chips: done ? [] : [], on: done, wait: !done, link: done ? '배포 ›' : '' },
  ];
  return `<p class="pj-curve-h" style="margin-bottom:8px">워크플로우 · ${esc(t ? t.name : '새 학습')}<span class="sp" style="flex:1"></span>
    <span${done ? ' style="color:var(--accent)"' : ''}>${esc(done ? `완료 · ${t.took} · ${t.at.slice(0, 10)}` : running ? `진행 중 · ${t.epoch} / ${t.total} · ${t.at}` : setting ? '설정 중' : '대기')}</span></p>
  <div class="pj-flow">${nodes.map((x) => `<div class="pj-node"${x.on ? ' data-on' : ''}${x.sel ? ' data-sel' : ''}${x.wait ? ' data-wait' : ''}>
    <span class="pj-node-k">${x.k === '—' ? '—' : /완료|진행/.test(x.k) ? `<b>${esc(x.k)}</b>` : esc(x.k)}</span>
    <span class="pj-node-t">${esc(x.t)}</span>
    ${x.img ? fig(x.img, '', '', { style: '--ar:16/9' }) : ''}
    ${x.note ? `<span class="mic">${esc(x.note)}</span>` : ''}
    ${x.chips && x.chips.length ? `<span class="pj-chipline">${x.chips.map((c) => `<span class="pj-chip">${esc(c)}</span>`).join('')}</span>` : ''}
    ${x.bar != null ? meter(x.bar) : ''}
    ${x.foot ? `<span class="mic">${esc(x.foot)}</span>` : ''}
    ${x.link ? `<a class="link" href="${esc(location.pathname)}?pid=${esc(p.id)}&tab=deploy">${esc(x.link)}</a>` : ''}</div>`).join('')}</div>`;
}

/* ── 학습 곡선 — 실측 없음 → 형태 견본 ── */
function curveBlock(p, t, S) {
  if (!t || !t.total) return '';
  const done = t.state === '완료', running = t.state === '진행 중';
  const pts = D.curve(t.total, done ? 0.19 : 0.19, done ? (t.f1 || 0.87) : 0.87);
  const W = 760, H = 150, X = (e) => 40 + (e / t.total) * (W - 210), Y = (v) => 10 + (1 - v) * H;
  const path = (key, upto) => pts.filter((q) => q.e <= upto).map((q, i) => `${i ? 'L' : 'M'}${X(q.e).toFixed(1)} ${Y(q[key]).toFixed(1)}`).join(' ');
  const upto = running ? t.epoch : t.total;
  const cutL = pts[Math.min(upto, pts.length - 1)];
  return `<section class="pj-curve">
    <p class="pj-curve-h">학습 곡선 · 에폭
      <span><i style="background:var(--ink)"></i>loss ${esc(t.name.replace(/^.*?(v[\d.]+|#\d+)$/, '$1'))}</span>
      <span><i style="background:var(--accent)"></i>precision ${esc(t.name.replace(/^.*?(v[\d.]+|#\d+)$/, '$1'))}</span>
      ${running ? '<span><i style="border-top:2px dashed var(--grey-3);background:none"></i>예측 · 참조</span>' : ''}
      <span class="sp" style="flex:1"></span><em class="tag">견본</em></p>
    <svg viewBox="0 0 ${W} ${H + 46}" role="img" aria-label="학습 곡선 — loss ${cutL.loss} · precision ${cutL.prec} (형태 견본)">
      ${[0, 0.5, 1].map((v) => `<line x1="40" y1="${Y(v)}" x2="${W - 20}" y2="${Y(v)}" stroke="#DDDDDD" stroke-width="1"/><text x="24" y="${Y(v) + 4}" font-size="14" fill="#686868" text-anchor="end" font-family="Inter">${v.toFixed(1)}</text>`).join('')}
      ${running ? `<path d="${pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.e).toFixed(1)} ${Y(q.prec).toFixed(1)}`).join(' ')}" fill="none" stroke="#CCCCCC" stroke-width="1.2" stroke-dasharray="3 3"/>
        <path d="${pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.e).toFixed(1)} ${Y(q.loss).toFixed(1)}`).join(' ')}" fill="none" stroke="#CCCCCC" stroke-width="1.2" stroke-dasharray="3 3"/>` : ''}
      <path d="${path('loss', upto)}" fill="none" stroke="#010102" stroke-width="1.6"/>
      <path d="${path('prec', upto)}" fill="none" stroke="#006DF7" stroke-width="1.6"/>
      <circle cx="${X(upto)}" cy="${Y(cutL.loss)}" r="3.5" fill="#fff" stroke="#010102" stroke-width="1.4"/>
      <circle cx="${X(upto)}" cy="${Y(cutL.prec)}" r="3.5" fill="#fff" stroke="#006DF7" stroke-width="1.4"/>
      <text x="${X(upto) + 10}" y="${Y(cutL.loss) + 4}" font-size="14" fill="#010102" font-family="Inter">loss ${cutL.loss.toFixed(2)}</text>
      <text x="${X(upto) + 10}" y="${Y(cutL.prec) + 4}" font-size="14" fill="#006DF7" font-family="Inter">precision ${cutL.prec.toFixed(2)}</text>
      ${running ? `<line x1="${X(upto)}" y1="10" x2="${X(upto)}" y2="${H + 10}" stroke="#006DF7" stroke-width="1"/>
        <rect x="${X(upto) - 15}" y="${H + 12}" width="30" height="20" fill="#fff" stroke="#006DF7"/><text x="${X(upto)}" y="${H + 26}" font-size="14" fill="#006DF7" text-anchor="middle" font-family="Inter">${t.epoch}</text>` : ''}
      ${[0, 20, 40, 60, 80, 100].map((e) => `<text x="${X((e / 100) * t.total)}" y="${H + 40}" font-size="14" fill="#686868" text-anchor="middle" font-family="Inter">${e}</text>`).join('')}
    </svg></section>`;
}

/* ── 학습 이력 ── */
function history(p, runs, c, S) {
  return `<section class="pj-hist"><div class="pj-hist-h"><h3>학습 이력</h3><span class="mic n" style="color:var(--accent)">${runs.length}</span><em class="tag">시연</em>
    <span class="pj-mini"><span class="pj-mini--dash"><b></b><span>대기 ${c['대기']}</span></span><span class="pj-mini--acc"><b></b><span>진행 ${c['진행 중']}</span></span>
      <span class="pj-mini--teal"><b></b><span>완료 ${c['완료']}</span></span><span class="pj-mini--dash"><b></b><span>실패 ${c['실패']}</span></span></span></div>
    <div class="tbl-wrap"><table class="tbl"><colgroup><col style="width:56px"><col><col style="width:132px"><col style="width:74px"><col style="width:58px"><col style="width:58px"><col style="width:148px"></colgroup>
      <thead><tr><th class="sr">미리보기</th><th>학습명</th><th>상태</th><th class="r">라벨</th><th class="r">IoU</th><th class="r">F1</th><th class="r">시작</th></tr></thead>
      <tbody id="tr-body">${runs.map((r, i) => `<tr data-row tabindex="0" aria-selected="${r.id === S.tr}" data-tr="${esc(r.id)}">
        <td>${fig(p.thumbs[i % p.thumbs.length], '', '', { style: '--ar:48/28' })}</td>
        <td><b>${esc(r.name)}</b></td>
        <td>${st(r.state.split(' · ')[0], r.state === '완료' ? r.took : r.state === '진행 중' ? `${r.epoch} / ${r.total}` : r.state.split(' · ')[1] || '')}</td>
        <td class="num r">${n(r.labels)}</td><td class="num r">${r.iou != null ? r.iou.toFixed(2) : '—'}</td><td class="num r">${r.f1 != null ? r.f1.toFixed(2) : '—'}</td>
        <td class="num r">${esc(r.at)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

/* ── 우측 판 ── */
function pick(p, runs) {
  return `<header class="panel-h"><h2>학습 결과</h2></header><div class="panel-b">${empty('선택한 학습 없음', runs.length ? '학습 이력에서 한 줄을 고르세요' : '학습을 시작하면 결과가 여기에 쌓입니다', 'clock')}</div>`;
}
function detail(p, t) {
  const done = t.state === '완료', running = t.state === '진행 중';
  return `<header class="panel-h"><h2>${esc(t.name)}</h2><em class="tag">시연</em><span class="sp"></span>${st(t.state.split(' · ')[0])}</header>
  <div class="panel-b">${fig(done ? p.hero : p.thumbs[1] || p.thumb, t.name)}
    <p class="mic" style="margin:8px 0 12px">${esc((p.files[0] || {}).name || '')} · ${done ? '검증 셋 20 %' : running ? '학습 셋 80 %' : '대기'}</p>
    ${done ? `<div class="pj-kpi" style="grid-template-columns:1fr 1fr">
        <div><b class="n">${t.iou.toFixed(2)}</b><span>IoU 영역 일치도</span></div>
        <div><b class="n" style="color:var(--ink)">${t.f1.toFixed(2)}</b><span>F1 종합 정확도${t.prev ? ` <span class="n">+${(t.f1 - t.prev).toFixed(2)}</span>` : ''}</span></div></div>`
      : running ? `<div class="pj-kpi" style="grid-template-columns:1fr 1fr">
        <div><b class="n">${t.epoch}<span style="font-size:24px;color:var(--grey)"> / ${t.total}</span></b><span>에폭</span></div>
        <div>${miss('IoU · 검증 후 표시')}<span style="display:block;margin-top:6px">IoU · 검증 후 표시</span></div></div>`
      : `<div class="pj-kpi" style="grid-template-columns:1fr 1fr"><div>${miss('대기 중')}<span style="display:block;margin-top:6px">IoU</span></div><div>${miss('대기 중')}<span style="display:block;margin-top:6px">F1</span></div></div>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 18px;margin-top:16px">
      ${[['학습 시작', `<span class="n">${esc(t.at)}</span>`], [done ? '소요' : '경과', `<span class="n">${esc(t.took || '—')}</span>`],
        ['라벨', `<span class="n">${n(t.labels)}</span>`], ['데이터셋', esc(t.dataset || (D.datasetsOf(p.id)[0] || {}).name || '—')],
        ['기반 모델', esc(t.base)], ['이미지 크기', `<span class="n">${esc(t.size)}</span>`],
        ['학습 : 검증', `<span class="n">${esc(t.ratio)}</span>`], ['에폭 · 배치', `<span class="n">${t.total} · ${t.batch}</span>`],
        ['IoU · Conf', `<span class="n">${esc(t.thr)}</span>`], ...(running ? [['현재 loss · precision', `<span class="n">${t.loss} · ${t.prec}</span> <em class="tag">견본</em>`]] : [])]
        .map(([k, v]) => `<div style="padding:8px 0"><p class="lb" style="margin:0 0 2px">${esc(k)}</p><p style="margin:0;font-size:15.5px">${v}</p></div>`).join('')}</div>
    ${done ? `<div style="display:grid;grid-template-columns:1fr 190px;gap:22px;margin-top:16px">
      <div><p class="lb" style="margin-bottom:8px">클래스별 F1</p>${t.classF1 ? bars(t.classF1.map(([k, v], i) => [k, v, i > 0])) : miss('검증 전')}</div>
      <div><p class="lb" style="margin-bottom:8px">오분류 행렬</p>${t.cm ? `<table class="pj-cm"><tbody>${t.cm.map((row, i) => `<tr>${row.map((v, j) => `<td class="n${i === j ? ' hit' : ''}">${n(v)}</td>`).join('')}<td class="dim">—</td></tr>`).join('')}<tr><td class="dim">—</td><td class="dim">—</td><td class="dim">—</td></tr></tbody></table>` : miss('검증 전')}</div></div>`
      : running ? `<p class="mic" style="margin-top:14px">단계 · 데이터셋 · 기반 모델 · <b style="color:var(--accent)">학습</b> · 검증 · 결과</p>` : ''}</div>
  <footer class="panel-f"><span class="mic">${done ? '' : running ? '끝나면 결과 5섹션으로 바뀜' : '대기 중'}</span>${link('닫기', 'tr-close')}${done ? link('배포 탭에서 이 결과 발행 ›', 'tr-deploy') : ''}</footer>`;
}

/* ── 새로 학습하기 — 11필드(B7-Project-Train-New) ── */
function newForm(p, runs) {
  const dss = D.datasetsOf(p.id);
  const prev = runs.filter((r) => r.state === '완료');
  return `<header class="panel-h"><h2>새로 학습하기</h2><span class="sp"></span>${link('닫기', 'tr-cancel')}</header>
  <div class="panel-b"><form class="form" id="tr-form" style="display:block">
    <div class="field"><div class="field-h"><label class="field-l" for="tn-name">학습명<em class="req">*</em></label><span class="cnt" data-for="tn-name"></span></div>
      <input id="tn-name" class="inp" maxlength="100" value="학습 #${runs.length + 1}"></div>
    <p class="lb" style="margin:16px 0 6px">기반 모델 (백본)</p>
    <div style="background:var(--t1);padding:12px 14px;display:flex;align-items:center;gap:12px">${icon('layers', 20)}
      <span><b style="font-family:var(--disp);font-size:18px">XI-VFM v2.1</b> ${icon('lock', 14)}<br><span class="mic">이 분석 과제는 위 기반 모델 위에서 학습됩니다</span></span></div>
    <div class="field" style="margin-top:16px"><label class="field-l" for="tn-prev">이전 학습 이어가기</label>
      <span class="sel"><select id="tn-prev"><option value="">없음 (새로 시작)</option>${prev.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} · IoU ${r.iou != null ? r.iou.toFixed(2) : '—'}</option>`).join('')}</select></span>
      <p class="help">이 과제의 이전 학습 결과를 이어받아 추가 학습 (선택)</p></div>
    <div class="field" style="margin-top:14px"><label class="field-l" for="tn-ds">데이터셋<em class="req">*</em></label>
      <span class="sel"><select id="tn-ds">${dss.length ? dss.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} ${esc(d.ver)}</option>`).join('') : '<option value="">데이터셋 없음 — 데이터 탭에서 먼저 만드세요</option>'}</select></span>
      <p class="help">${dss.length ? `승계 · 기준 해상도 ${dss[0].gsd} cm · 타일 ${dss[0].tile} px · 겹침 ${dss[0].overlap} %` : '데이터셋이 없으면 학습을 시작할 수 없습니다'}</p></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div class="field"><label class="field-l" for="tn-det">탐지 형태</label><input id="tn-det" class="inp" value="${esc(p.taskLabel)}" readonly aria-readonly="true"><p class="help">프로젝트 설정을 따름 (변경 불가)</p></div>
      <div class="field"><label class="field-l" for="tn-size">이미지 크기</label><span class="sel"><select id="tn-size"><option>640 × 640</option><option>1024 × 1024</option><option>1280 × 1280</option></select></span></div></div>
    <hr class="hr" style="margin:18px 0 12px"><p class="lb" style="margin:0 0 10px">고급 옵션</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field"><label class="field-l" for="tn-ratio">학습 : 검증 비율</label><span class="sel"><select id="tn-ratio"><option>80 : 20</option><option>70 : 30</option><option>90 : 10</option></select></span></div>
      <div class="field"><label class="field-l" for="tn-batch">배치 크기</label><span class="sel"><select id="tn-batch"><option>16</option><option>8</option><option>32</option></select></span></div>
      <div class="field"><label class="field-l" for="tn-ep">에폭 (Epochs)</label><input id="tn-ep" class="inp inp--num" value="100" inputmode="numeric"></div>
      <div class="field"><label class="field-l" for="tn-iou">IoU 임계값</label><input id="tn-iou" class="inp inp--num" value="0.5" inputmode="decimal"></div>
      <div class="field"><label class="field-l" for="tn-conf">Conf 임계값</label><input id="tn-conf" class="inp inp--num" value="0.25" inputmode="decimal"></div></div>
  </form></div>
  <footer class="panel-f">${br('취소', 'tr-cancel')}${cta('학습 시작', 'tr-start')}</footer>`;
}

export function bindTrain(p, S, go) {
  bindCounters($('#pj-root'));
  const body = $('#tr-body');
  if (body) bindRows(body, (row) => go({ tr: row.dataset.tr, trnew: false }, { replace: true }));
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'tr-new': return go({ trnew: true, tr: '' });
      case 'tr-cancel': return go({ trnew: false });
      case 'tr-close': return go({ tr: '' }, { replace: true });
      case 'tr-deploy': return go({ tab: 'deploy', reg: true, tr: '' });
      case 'tr-start': return start(p, S, go);
      default: return undefined;
    }
  });
}
function start(p, S, go) {
  const name = $('#tn-name').value.trim(), dsEl = $('#tn-ds');
  if (!name) { say('학습명을 입력해 주세요.'); $('#tn-name').focus(); return; }
  if (!dsEl.value) { say('데이터셋이 없습니다 — 데이터 탭에서 먼저 만드세요.'); return; }
  const ds = D.datasetsOf(p.id).find((d) => d.id === dsEl.value);
  const t = { name, state: '진행 중', epoch: 1, total: +$('#tn-ep').value || 100, labels: ds ? ds.labels : 0, iou: null, f1: null,
    at: '2026-06-08 09:30', base: 'XI-VFM v2.1', dataset: ds ? `${ds.name} ${ds.ver}` : '—', size: $('#tn-size').value,
    ratio: $('#tn-ratio').value, batch: +$('#tn-batch').value, thr: `${$('#tn-iou').value} · ${$('#tn-conf').value}`, took: '0분', loss: 0.92, prec: 0.2 };
  D.addTrain(p.id, t);
  go({ trnew: false, tr: '' }); say(`“${name}” 학습을 시작했습니다 · 시연`);
}
