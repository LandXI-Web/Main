/* 프로젝트 · 배포 탭 — 모델 등록(`추정`) + 카드 발행 요청 → admin-publish.html + **카드 역추적**.
   원판 B5-Project-Deploy.png · B7-Project-{Model-Register,Model-Registered,Deploy-Picker}.png
   역추적: 이 프로젝트의 모델이 어느 서비스 카드로 갔는가 — cards.js 의 cardsOfService / projectId 두 갈래.
   유보 ① 모델 등록 폼은 원본에 없다(원본 = 빈 상태 + "pt 파일 등록 기능은 추후 개발 협의") → `추정` 표식. */
import { openModal, say, bindCounters, icon, esc, $, $$ } from './shell.js';
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

function reqBody(p, reqs, mds) {
  if (!reqs.length) return `${empty('발행 요청이 없습니다', mds.length ? '등록한 모델로 카드 발행을 요청하세요' : '학습 결과를 모델로 등록한 뒤 카드 발행을 요청합니다', 'layers')}${ptNote()}`;
  return `${reqs.map((r) => `<div style="border-bottom:1px solid var(--line);padding:10px 4px 12px">
    <p style="margin:0 0 6px;display:flex;align-items:baseline;gap:12px">${st(r.state)}<b style="font-size:17px">${esc(r.card)}</b><span class="sp" style="flex:1"></span><span class="n mic">${esc(r.at)}</span></p>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0 18px">
      ${[['학습 결과', esc((D.trainsOf(p.id).find((t) => t.id === r.train) || {}).name || '—')], ['모델명', esc(r.modelName)], ['과제 유형', esc(r.kind)], ['요청자', '내 계정' + (r.demo ? ' <em class="tag">시연</em>' : '')]]
        .map(([k, v]) => `<div><p class="lb" style="margin:0 0 2px">${k}</p><p style="margin:0;font-size:15px">${v}</p></div>`).join('')}</div>
    <p class="acts" style="justify-content:flex-start;margin-top:10px">${link('카드 발행 관리에서 보기 ›', 'go-publish')}</p></div>`).join('')}${ptNote()}`;
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
    ${trains.length ? `<div class="tbl-wrap"><table class="tbl"><colgroup><col style="width:40px"><col style="width:112px"><col><col style="width:96px"><col style="width:62px"><col style="width:54px"><col style="width:54px"></colgroup>
      <thead><tr><th class="sr">선택</th><th class="sr">미리보기</th><th>학습 결과</th><th>학습일</th><th class="r">라벨</th><th class="r">IoU</th><th class="r">F1</th></tr></thead>
      <tbody>${trains.map((t, i) => `<tr><td><input type="radio" name="md-tr" value="${esc(t.id)}"${i === 0 ? ' checked' : ''} aria-label="${esc(t.name)} 선택"></td>
        <td>${fig(p.thumbs[i % p.thumbs.length], '', '', { style: '--ar:104/58' })}</td>
        <td><b>${esc(t.name)}</b><br><span class="mic">${i === 0 ? '최근 학습 · ' : ''}${esc(t.base)}</span></td>
        <td class="num">${esc(t.at.slice(0, 10))}</td><td class="num r">${n(t.labels)}</td>
        <td class="num r"${t.iou != null ? ' style="color:var(--accent)"' : ''}>${t.iou != null ? t.iou.toFixed(2) : '—'}</td><td class="num r">${t.f1 != null ? t.f1.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : empty('완료된 학습 결과가 없습니다', '학습 탭에서 먼저 학습을 마치세요', 'clock')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
      ${[['기반 모델', trains[0] ? trains[0].base : '—'], ['탐지 형태', p.taskLabel], ['클래스', p.classes.map((c) => c.name).join(' · ')], ['데이터 유형', p.dataType]]
        .map(([k, v]) => `<div><p class="lb" style="margin:0 0 4px">${esc(k)} <em class="tag">자동</em></p><p style="margin:0;background:var(--t1);padding:8px 10px;font-size:15px">${esc(v)}</p></div>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label class="field-l" for="md-desc">설명</label><textarea id="md-desc" class="inp" rows="3" placeholder="모델 설명 입력"></textarea></div>
  </form></div>
  <footer class="panel-f"><span class="mic">등록한 모델은 카드 발행 요청에서 선택</span>${br('취소', 'md-cancel')}${cta('모델 등록', 'md-save')}</footer>`;
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
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'md-new': return go({ dep: 'model', reg: true });
      case 'md-cancel': return go({ reg: false });
      case 'md-close': return go({}, { replace: true });
      case 'md-drop': { const m0 = D.modelsOf(p.id)[0]; if (m0) { D.dropModel(p.id, m0.id); go({}); say('모델 등록을 해제했습니다 · 시연'); } return; }
      case 'md-save': return saveModel(p, go);
      case 'rq-new': return openPicker(p, go);
      case 'go-publish': return (location.href = 'admin-publish.html');
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

/* 카드 발행 요청 — 학습 결과 픽커(B7-Project-Deploy-Picker) → 실제로 admin-publish.html 로 나간다 */
function openPicker(p, go) {
  const mds = D.modelsOf(p.id), trains = D.trainsOf(p.id).filter((t) => t.state === '완료');
  if (!trains.length) { say('완료된 학습 결과가 없습니다.'); return; }
  const m = openModal({ title: '학습 결과 선택', tag: '시연', width: 680, content: `
    <div class="tbl-wrap"><table class="tbl"><colgroup><col style="width:40px"><col style="width:120px"><col><col style="width:100px"><col style="width:66px"><col style="width:58px"><col style="width:58px"></colgroup>
      <thead><tr><th class="sr">선택</th><th class="sr">미리보기</th><th>학습 결과</th><th>학습일</th><th class="r">라벨</th><th class="r">IoU</th><th class="r">F1</th></tr></thead>
      <tbody>${trains.map((t, i) => `<tr><td><input type="radio" name="pk" value="${esc(t.id)}"${i === 0 ? ' checked' : ''} aria-label="${esc(t.name)} 선택"></td>
        <td>${fig(p.thumbs[i % p.thumbs.length], '', '', { style: '--ar:112/64' })}</td><td><b>${esc(t.name)}</b></td>
        <td class="num">${esc(t.at.slice(0, 10))}</td><td class="num r">${n(t.labels)}</td>
        <td class="num r">${t.iou != null ? t.iou.toFixed(2) : '—'}</td><td class="num r">${t.f1 != null ? t.f1.toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="mic" style="margin:10px 0 0"><b class="n" id="pk-n" style="color:var(--accent)">선택 1 · ${esc(trains[0].name)}</b> — 카드 발행 관리로 넘어갑니다</p>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '발행 요청', kind: 'primary', onClick: () => {
      const t = trains.find((x) => x.id === $('input[name="pk"]:checked', m.el).value);
      D.addRequest(p.id, { card: `${p.name} ${t.name.replace(/^.*?(v[\d.]+|#\d+)$/, '$1')}`, train: t.id, modelName: mds[0] ? mds[0].name : t.name, kind: '신규 과제', state: '대기', at: '2026-06-08' });
      say('카드 발행을 요청했습니다 — 카드 발행 관리로 이동합니다 · 시연');
      setTimeout(() => { location.href = 'admin-publish.html'; }, 420);
      return true;
    } }] });
  $$('input[name="pk"]', m.el).forEach((r) => r.addEventListener('change', () => {
    const t = trains.find((x) => x.id === r.value); $('#pk-n', m.el).textContent = `선택 1 · ${t.name}`;
  }));
}
