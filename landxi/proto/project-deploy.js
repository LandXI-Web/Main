/* 프로젝트 · 배포 탭 — 모델 등록(`추정`) + 카드 발행 요청 → **내 요청 이력**(7열 표) + **카드 역추적**.
   발행 요청은 lx_publish_v1(publish-data.js) 단일 저장소에 `pa-N` 으로 들어가 관리자 큐 맨 위에 선다(E0-8 · PP-1).
   직원은 승인 화면으로 보내지 않는다 — 요청 뒤 이 탭의 이력에 착지한다(B1). 승인은 관리자 사이트의 몫이다.
   원판 B5-Project-Deploy.png · B7-Project-{Model-Register,Model-Registered,Deploy-Picker}.png
   역추적: 이 프로젝트의 모델이 어느 서비스 카드로 갔는가 — cards.js 의 cardsOfService / projectId 두 갈래.
   유보 ① 모델 등록 폼은 원본에 없다(원본 = 빈 상태 + "pt 파일 등록 기능은 추후 개발 협의") → `추정` 표식. */
import { openModal, say, bindCounters, bindRows, allowed, icon, esc, $, $$ } from './shell.js';
import { ST_CLASS } from './publish-data.js';
import * as D from './project-data.js';
import { n, demo, guess, fig, kv, st, empty, cta, br, link, miss } from './project-ui.js';

export function deployTab(p, S) {
  const reqs = D.requestsOf(p.id), mds = D.modelsOf(p.id), dep = S.dep;
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
  <section class="split-l">
    <div class="pj-seg" role="tablist" aria-label="배포 구분">
      <button type="button" role="tab" data-dep="request" aria-selected="${dep === 'request'}">발행 요청 <span class="n">${reqs.length}</span></button>
      <button type="button" role="tab" data-dep="model" aria-selected="${dep === 'model'}">모델 등록 <span class="n">${mds.length}</span></button>
      <span class="pj-seg-r">${S.reg ? `<span class="pj-tb" aria-pressed="true" style="background:var(--t1);border-color:var(--accent);color:var(--accent)">모델 등록</span>` : br('모델 등록', 'md-new')}${mds.length ? cta('카드 발행 요청', 'rq-new') : ''}</span></div>
    <div class="panel-b" style="padding-top:0">
      ${dep === 'request' ? reqBody(p, reqs, mds) : mdBody(p, mds)}
      <div style="margin-top:24px">${cardTrace(p, {})}</div></div></section>
  <aside class="split-r panel" aria-label="${S.reg ? '모델 등록' : '모델 정보'}">${S.reg ? regForm(p) : mdPanel(p, mds, reqs)}</aside></div>`;
}

/* 내 요청 이력 — 7열 표. 행은 관리자 큐와 같은 저장소에서 온다(requestsOf). ?req=pa-N 은 방금 보낸 요청 = 선택 행. */
const reqParam = () => new URLSearchParams(location.search).get('req') || '';
/* 열 폭은 백분율(합 100 · 과제명이 나머지) — 1280 · 1440 · 1920 어느 판 폭에서도 열이 겹치지 않는다. 긴 이름은 두 줄로 접는다. */
const REQ_COLS = [['상태', 9], ['과제명', null], ['학습 결과', 16], ['모델명', 16], ['과제 유형', 11], ['요청자', 10], ['요청일', 15]];
const TD = 'padding:8px;height:auto;line-height:1.35', WRAP = `${TD};white-space:normal;overflow-wrap:anywhere`;
function reqBody(p, reqs, mds) {
  if (!reqs.length) return `${empty('발행 요청이 없습니다', mds.length ? '등록한 모델로 카드 발행을 요청하세요' : '학습 결과를 모델로 등록한 뒤 카드 발행을 요청합니다', 'layers')}${ptNote()}`;
  const want = reqParam(), sel = reqs.find((r) => r.id === want) || null, just = !!sel && sel.from === p.id && want.startsWith('pa-');
  return `${just ? `<div class="pj-ok" id="rq-just">${icon('check', 16)}<b>요청 완료</b><span>“${esc(sel.card)}” 발행을 요청했습니다 — 관리자 검토 큐에 <span class="n">${esc(sel.id)}</span> 로 섰습니다</span><span class="sp" style="flex:1"></span>${link('×', 'ok-x', ' aria-label="알림 닫기"')}</div>` : ''}
  <div class="pj-hist-h" style="margin-top:${just ? 14 : 0}px"><h3>내 요청 이력</h3><span class="n" style="color:var(--accent)">${reqs.length}</span><span class="sp" style="flex:1"></span><span class="mic">시연 · 이 브라우저에 저장</span></div>
  <div class="tbl-wrap"><table class="tbl" id="rq-hist" aria-label="카드 발행 요청 이력"><colgroup>${REQ_COLS.map(([, w]) => (w ? `<col style="width:${w}%">` : '<col>')).join('')}</colgroup>
    <thead><tr>${REQ_COLS.map(([k]) => `<th style="padding:0 8px">${k}</th>`).join('')}</tr></thead>
    <tbody>${reqs.map((r) => `<tr data-row tabindex="0" data-id="${esc(r.id)}" aria-selected="${r === sel}">
      <td style="${TD}"><span class="st ${ST_CLASS[r.status] || ''}">${esc(r.status || '—')}</span></td>
      <td style="${WRAP}"><b>${esc(r.card)}</b>${r.demo ? demo() : ''}</td><td style="${WRAP}">${esc(r.training || '—')}</td><td class="num" style="${WRAP}">${esc(r.model || '—')}</td>
      <td style="${WRAP}">${esc(r.type || '—')}</td><td style="${WRAP}">${esc(r.requester || '—')}</td><td class="num" style="${TD};padding-right:4px;font-size:14px;letter-spacing:0">${esc(String(r.date || '').slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>
  <p class="acts" id="rq-go" style="justify-content:flex-start;align-items:baseline;gap:12px;margin-top:10px">${goPublish(sel || reqs[0])}</p>${ptNote()}`;
}
/* '카드 발행 관리에서 보기 ›' — 승인 권한(approve)이 있는 계정만 링크. 직원은 비활성 + 이유 한 줄(말만 하는 버튼 0). */
function goPublish(r) {
  const label = '카드 발행 관리에서 보기 ›';
  if (allowed('approve') && r && String(r.id).startsWith('pa-')) return `<a class="link" href="admin-publish.html?open=${encodeURIComponent(r.id)}">${label}</a>`;
  return `<button type="button" class="link" disabled aria-describedby="rq-go-why">${label}</button><span class="mic" id="rq-go-why">관리자 사이트에서 승인합니다</span>`;
}
function mdBody(p, mds) {
  const trains = D.trainsOf(p.id).filter((t) => t.state === '완료');
  const usedT = new Set(mds.map((m) => m.train));
  if (!mds.length) return `${empty('등록된 모델이 없습니다', trains.length ? '학습 결과를 골라 모델로 등록하세요' : '먼저 학습을 마쳐야 합니다', 'layers')}${ptNote()}`;
  const m0 = mds[0], t = trains.find((t) => t.id === m0.train);
  return `<div class="pj-ok">${icon('check', 16)}<b>등록 완료</b><span>“${esc(m0.name)}” 모델을 등록했습니다</span><span class="sp" style="flex:1"></span>${link('×', 'ok-x', ' aria-label="알림 닫기"')}</div>
  <div class="pj-model" style="margin-top:14px">${fig(p.hero, m0.name, '', { style: '--ar:376/224' })}
    <dl><dt>학습 결과</dt><dd>${esc(t ? t.name : '—')}</dd><dt>기반 모델</dt><dd>${esc(t ? t.base : '—')}</dd>
      <dt>탐지 형태</dt><dd>${esc(p.taskLabel)} · 클래스 ${p.classes.length}</dd>
      <dt>IoU · F1</dt><dd class="n">${t && t.iou != null ? `${t.iou.toFixed(2)} · ${t.f1.toFixed(2)}` : '—'}</dd></dl></div>
  ${trains.filter((t) => !usedT.has(t.id)).length ? `<div class="pj-hist-h" style="margin-top:20px"><h3>등록하지 않은 학습 결과</h3><span class="n" style="color:var(--accent)">${trains.filter((t) => !usedT.has(t.id)).length}</span><em class="tag">시연</em></div>
    ${trains.filter((t) => !usedT.has(t.id)).map((t, i) => `<div class="pj-cardlink">${fig(p.thumbs[(i + 1) % p.thumbs.length], '', '', { style: '--ar:78/44' })}
      <span><b>${esc(t.name)}</b><br><span class="mic n">${esc(t.at.slice(0, 10))} · 라벨 ${n(t.labels)}</span></span>
      <span class="mic n">IoU ${t.iou != null ? t.iou.toFixed(2) : '—'} · F1 ${t.f1 != null ? t.f1.toFixed(2) : '—'}</span>
      <button type="button" class="link" data-act="md-new" data-train="${esc(t.id)}">등록 ›</button></div>`).join('')}` : ''}
  ${ptNote()}`;
}
const ptNote = () => `<div class="pj-todo" style="margin-top:18px">외부 모델 (pt 파일) 등록 <em class="tag">준비 중</em><span class="sp" style="flex:1"></span><span>pt 파일 등록 기능은 추후 개발 협의</span></div>`;

function mdPanel(p, mds, reqs) {
  const m0 = mds[0];
  if (!m0) return `<header class="panel-h"><h2>모델 정보</h2></header><div class="panel-b">${empty('등록한 모델 없음', '학습 결과를 모델로 등록하면 카드 발행을 요청할 수 있습니다', 'layers')}</div>`;
  const t = D.trainsOf(p.id).find((x) => x.id === m0.train);
  return `<header class="panel-h"><h2>모델 정보</h2><em class="tag">추정</em></header>
  <div class="panel-b">${fig(p.hero, m0.name)}
    <p class="mic" style="margin:8px 0 12px">${esc((p.files[0] || {}).name || '')} · 검증 셋 20 %</p>
    ${t && t.iou != null ? `<div class="pj-kpi" style="grid-template-columns:1fr 1fr"><div><b class="n">${t.iou.toFixed(2)}</b><span>IoU 영역 일치도</span></div><div><b class="n" style="color:var(--ink)">${t.f1.toFixed(2)}</b><span>F1 종합 정확도</span></div></div>` : ''}
    ${kv([['모델명', esc(m0.name)], ['등록 방식', esc(m0.how || '학습 결과에서 등록')], ['기반 모델', esc(t ? t.base : '—')],
      ['탐지 형태', esc(p.taskLabel)], ['학습 결과', t ? `${esc(t.name)} · <span class="n">${esc(t.at.slice(0, 10))}</span>${demo()}` : miss('—')],
      ['클래스', esc(p.classes.map((c) => c.name).join(' · '))], ['데이터 유형', esc(p.dataType)],
      ['카드 발행', reqs.length ? `요청 ${reqs.length} · ${esc(reqs[0].state)}` : miss('요청 없음')]])}</div>
  <footer class="panel-f">${link('닫기', 'md-close')}${link('등록 해제', 'md-drop')}${cta('카드 발행 요청', 'rq-new')}</footer>`;
}

/* 모델 등록 폼 — 원본에 없다(유보 ①). 발행 폼이 이미 가진 필드만 빌렸다 → `추정`. */
function regForm(p) {
  const trains = D.trainsOf(p.id).filter((t) => t.state === '완료');
  return `<header class="panel-h"><h2>모델 등록</h2><em class="tag">추정</em><span class="sp"></span>${link('닫기', 'md-cancel')}</header>
  <div class="panel-b"><form class="form" id="md-form" style="display:block">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div><p class="lb" style="margin:0 0 6px">등록 방식</p>
        <label class="rd"><input type="radio" name="md-how" value="학습 결과에서 등록" checked>학습 결과에서 등록</label>
        <label class="rd" style="margin-top:6px"><input type="radio" name="md-how" value="외부 모델(pt)" disabled>외부 모델(pt) <em class="tag">준비 중</em></label></div>
      <div class="field"><div class="field-h"><label class="field-l" for="md-name">모델명<em class="req">*</em></label><span class="cnt" data-for="md-name"></span></div>
        <input id="md-name" class="inp" maxlength="100" value="${esc(p.name)} ${esc(trains[0] ? trains[0].name.replace(/^.*?(v[\d.]+)$/, '$1') : 'v1.0')}"></div></div>
    <p class="lb" style="margin:16px 0 6px">학습 결과 <em class="req">*</em><span class="sp" style="flex:1"></span></p>
    ${trains.length ? trainTable(p, trains, 'md-tr')
      : empty('완료된 학습 결과가 없습니다', '학습 탭에서 먼저 학습을 마치세요', 'clock')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
      ${[['기반 모델', trains[0] ? trains[0].base : '—'], ['탐지 형태', p.taskLabel], ['클래스', p.classes.map((c) => c.name).join(' · ')], ['데이터 유형', p.dataType]]
        .map(([k, v]) => `<div><p class="lb" style="margin:0 0 4px">${esc(k)} <em class="tag">자동</em></p><p style="margin:0;background:var(--t1);padding:8px 10px;font-size:15px">${esc(v)}</p></div>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label class="field-l" for="md-desc">설명</label><textarea id="md-desc" class="inp" rows="3" placeholder="모델 설명 입력"></textarea></div>
  </form></div>
  <footer class="panel-f"><span class="mic">등록한 모델은 카드 발행 요청에서 선택</span>${br('취소', 'md-cancel')}${cta('모델 등록', 'md-save')}</footer>`;
}

/* 학습 결과 고르기 표 — 모델 등록 폼(판 440fr)과 발행 요청 픽커(모달 680)가 같이 쓴다(B9).
   열 폭은 백분율로 합 100 = 표 폭 — 고정 px 합이 판 폭을 넘어 `학습 결과` 열이 22px 로 짜부라지던 것을 없앤다.
   학습일은 학습 결과 아래 줄로, IoU · F1 은 한 칸 두 줄로 접는다. */
function trainTable(p, trains, name) {
  const P = 'padding:6px 8px;height:auto';
  return `<div class="tbl-wrap"><table class="tbl pj-mdtbl" data-pick="${name}"><colgroup><col style="width:9%"><col style="width:21%"><col style="width:40%"><col style="width:14%"><col style="width:16%"></colgroup>
      <thead><tr><th><span class="sr">선택</span></th><th><span class="sr">미리보기</span></th><th style="padding:0 8px">학습 결과 · 학습일</th><th class="r" style="padding:0 8px">라벨</th><th class="r" style="padding:0 8px">IoU · F1</th></tr></thead>
      <tbody>${trains.map((t, i) => `<tr><td style="padding:0 6px;text-align:center"><input type="radio" name="${name}" value="${esc(t.id)}"${i === 0 ? ' checked' : ''} aria-label="${esc(t.name)} 선택"></td>
        <td style="padding:6px 6px 6px 0">${fig(p.thumbs[i % p.thumbs.length], '', '', { style: '--ar:104/58' })}</td>
        <td style="${P}" title="${esc(t.name)} · ${esc(t.base || '')}"><b>${esc(t.name)}</b><br><span class="mic n">${esc(t.at.slice(0, 10))}${i === 0 ? ' · 최근' : ''}</span></td>
        <td class="num r" style="${P}">${n(t.labels)}</td>
        <td class="num r" style="${P}"><span${t.iou != null ? ' style="color:var(--accent)"' : ''}>${t.iou != null ? t.iou.toFixed(2) : '—'}</span><br>${t.f1 != null ? t.f1.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ══ 카드 역추적 — 개요 · 배포 양쪽에 ═══════════════════════════════════════
   cards.js 만 읽는다(R5). 카드를 더해도 이 코드는 고치지 않는다. */
export function cardTrace(p, { compact = false }) {
  const cards = D.cardsOfProject(p.id);
  const head = `<div class="pj-hist-h"><h3>이 모델이 간 서비스 카드</h3><span class="n" style="color:var(--accent)">${cards.length}</span>
    <span class="sp" style="flex:1"></span>${p.serviceName ? `<span class="mic">모델 → ${esc(p.serviceName)}${p.serviceInferred ? ' <em class="tag">추정</em>' : ''}</span>` : ''}</div>`;
  if (!cards.length) {
    return `${head}<div class="pj-todo">아직 어떤 서비스 카드에도 실리지 않았습니다<span class="sp" style="flex:1"></span><span>배포 탭에서 모델 등록 → 카드 발행 요청</span></div>`;
  }
  return `${head}${cards.slice(0, compact ? 3 : cards.length).map((c) => `<a class="pj-cardlink" href="analysis-ai.html?card=${encodeURIComponent(c.id)}">
    ${icon('layers', 18)}<span><b>${esc(c.name)}</b><br><span class="mic">${esc(c.duty)} · ${esc(c.scope === 'global' ? '글로벌 사업' : '지자체 사업')}${c.version ? ` · ${esc(c.version)}` : ''}</span></span>
    <span class="mic">${st(c.status)}${c.via === 'project' ? ' · 이 프로젝트가 만든 카드' : ' · 모델 공유'}</span>${icon('chevR', 14)}</a>`).join('')}
  <p class="mic" style="margin-top:8px">${esc(cards.map((c) => c.name).join(' · '))} — 분석 서비스에서 열립니다</p>`;
}

/* ── 동작 ── */
export function bindDeploy(p, S, go) {
  bindCounters($('#pj-root'));
  $$('#main [data-dep]').forEach((b) => b.addEventListener('click', () => go({ dep: b.dataset.dep, reg: false })));
  const tb = $('#rq-hist tbody');
  if (tb) {
    bindRows(tb, (row) => {                                          // 행 선택 = URL 의 req · 아래 링크가 그 요청을 가리킨다
      const r = D.requestsOf(p.id).find((x) => x.id === row.dataset.id); if (!r) return;
      const q = new URLSearchParams(location.search); q.set('req', r.id); history.replaceState(null, '', `${location.pathname.split('/').pop()}?${q}`);
      $('#rq-go').innerHTML = goPublish(r);
    });
  }
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'md-new': return go({ dep: 'model', reg: true });
      case 'md-cancel': return go({ reg: false });
      case 'md-close': return go({}, { replace: true });
      case 'md-drop': { const m0 = D.modelsOf(p.id)[0]; if (m0) { D.dropModel(p.id, m0.id); go({}); say('모델 등록을 해제했습니다 · 시연'); } return; }
      case 'md-save': return saveModel(p, go);
      case 'rq-new': return openPicker(p, go);
      case 'ok-x': return a.closest('.pj-ok').remove();
      default: return undefined;
    }
  });
}
function saveModel(p, go) {
  const name = $('#md-name').value.trim(), tr = $('input[name="md-tr"]:checked');
  if (!name) { say('모델명을 입력해 주세요.'); $('#md-name').focus(); return; }
  if (!tr) { say('등록할 학습 결과를 고르세요.'); return; }
  D.addModel(p.id, { name, train: tr.value, how: $('input[name="md-how"]:checked').value, desc: $('#md-desc').value.trim(), at: '2026-06-08' });
  go({ dep: 'model', reg: false }); say(`“${name}” 모델을 등록했습니다 · 시연`);
}

/* 카드 발행 요청 — 학습 결과 픽커(B7-Project-Deploy-Picker) → lx_publish_v1 에 `pa-N` → 이 탭의 내 요청 이력에 착지(B1) */
function openPicker(p, go) {
  const mds = D.modelsOf(p.id), trains = D.trainsOf(p.id).filter((t) => t.state === '완료');
  if (!trains.length) { say('완료된 학습 결과가 없습니다.'); return; }
  const m = openModal({ title: '학습 결과 선택', tag: '시연', width: 680, content: `
    ${trainTable(p, trains, 'pk')}
    <p class="mic" style="margin:10px 0 0"><b class="n" id="pk-n" style="color:var(--accent)">선택 1 · ${esc(trains[0].name)}</b> — 요청은 관리자 검토 큐에 서고, 이 탭의 내 요청 이력에 남습니다</p>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '발행 요청', kind: 'primary', onClick: () => {
      const t = trains.find((x) => x.id === $('input[name="pk"]:checked', m.el).value);
      const id = D.addRequest(p.id, { card: `${p.name} ${t.name.replace(/^.*?(v[\d.]+|#\d+)$/, '$1')}`, train: t.id, modelName: mds[0] ? mds[0].name : t.name, kind: '신규 과제' });
      say(`카드 발행을 요청했습니다 — ${id} · 내 요청 이력으로 갑니다 · 시연`);
      setTimeout(() => { location.href = `ai-project.html?pid=${encodeURIComponent(p.id)}&tab=deploy&req=${encodeURIComponent(id)}`; }, 420);
      return true;
    } }] });
  $$('input[name="pk"]', m.el).forEach((r) => r.addEventListener('change', () => {
    const t = trains.find((x) => x.id === r.value); $('#pk-n', m.el).textContent = `선택 1 · ${t.name}`;
  }));
}
