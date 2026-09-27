/* confirm-card.js — 쓰기 도구 확인 카드(견적 카드와 같은 문법 · AGENT-SPEC §4.1).
   승인 전 POST /jobs 0(서버가 막는다 · 카드는 사람의 손). 승인 = 채움 · 거부 = 헤어라인. 60s 카운트다운은 초가 바뀔 때만 갱신.
   영업(sales)은 demo:true 강제 표기. 게스트는 에이전트 자체가 없다. */
import { chip, esc } from './answer.js';

export function confirmCard(host, d, { onDecide, replay = false } = {}) {
  const q = d.quote || {};
  const m = d.meta || {};
  const el = document.createElement('section');
  el.className = 'ag-confirm'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', '확인 카드');
  el.dataset.confirm = d.confirm_id;
  const rows = [
    ['모델', esc(m.model || '')], ['영상', `${esc(m.imagery || '')}${m.gsd_m ? ` · GSD ${esc(m.gsd_m)} m` : ''}`], ['대상', esc(m.cls || '')],
    ['면적', q.area_km2 ? chip(q.area_km2, { meaning: '프레임 면적', id: 'q_area' }) : '—'],
    ['shard', q.shards_env ? chip(q.shards_env, { meaning: '칩 조각 수', id: 'q_shards' }) : '—'],
    ['GPU·s', q.gpu_s ? chip(q.gpu_s, { meaning: '예상 GPU·s(models.perf 실측 계수 × shard)', id: 'q_gpu' }) : '—'],
    ['예상 소요', q.eta_s ? chip(q.eta_s, { meaning: '예상 소요', id: 'q_eta' }) : '—'],
    // 값이 숫자일 때만 실측 칩 — 무제한(hard=null)·결손은 상태 글자 그대로(값 없는 '— 실측' 꼬리표 금지)
    ['쿼터 잔여', typeof q.quota?.remaining?.value === 'number' ? chip(q.quota.remaining, { meaning: `기관 쿼터 ${q.quota.dim || ''}`, id: 'q_quota' })
      : `<span class="ag-qstate" title="${esc(q.quota?.remaining?.source || '')}">${esc(q.quota?.remaining?.note === '무제한' || /hard=None|hard=null/.test(q.quota?.remaining?.source || '') ? '무제한' : (q.quota?.remaining?.note || '—'))}</span>`],
  ];
  el.innerHTML = `<h4>${d.tool === 'jobs_submit' ? 'GPU 분석 실행' : '상태 변경'}<small>사람 승인 필요${d.demo ? ' · 시연(demo)' : ''}${replay ? ' · 기록 재생' : ''}</small></h4>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${d.metering ? `<p class="ag-meter">${esc(d.metering)}${q.pool ? ` · 풀 ${esc(q.pool)}` : ''}</p>` : ''}
    <div class="ag-count"><i style="width:100%"></i></div><p class="ag-cd"></p>
    <div class="ag-btns"><button type="button" class="ag-btn ag-btn--fill" data-d="approve">승인 · 실행</button><button type="button" class="ag-btn ag-btn--line" data-d="reject">거부</button></div>
    <p class="ag-dec" hidden></p>`;
  host.appendChild(el);
  const ttl = d.ttl_s || 60;
  const t0 = performance.now();
  const bar = el.querySelector('.ag-count i'), cd = el.querySelector('.ag-cd');
  let last = -1, timer = null, done = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil(ttl - (performance.now() - t0) / 1000));
    if (left !== last) { last = left; bar.style.width = `${(left / ttl) * 100}%`; cd.textContent = `만료까지 ${left}초 · 승인 전에는 아무것도 실행되지 않습니다`; }
    if (left <= 0) { finish('expired'); return; }
    timer = setTimeout(tick, 250);
  };
  const finish = (decision) => {
    if (done) return; done = true; clearTimeout(timer);
    el.dataset.done = '1';
    const p = el.querySelector('.ag-dec'); p.hidden = false;
    p.textContent = decision === 'approve' ? '승인됨 · 제출' : decision === 'reject' ? '거부됨 · 실행하지 않음' : '만료 · 실행하지 않음';
    p.style.color = decision === 'approve' ? 'var(--ag-ai)' : 'var(--ag-sub)';
  };
  tick();
  el.querySelectorAll('.ag-btn').forEach((b) => b.addEventListener('click', async () => {
    const dec = b.dataset.d;
    el.querySelectorAll('.ag-btn').forEach((x) => { x.disabled = true; });
    try { await onDecide?.(dec); finish(dec); }
    catch (e) { el.querySelectorAll('.ag-btn').forEach((x) => { x.disabled = false; }); const p = el.querySelector('.ag-dec'); p.hidden = false; p.textContent = `${e.code || '오류'} · ${e.message || ''}`; }
  }));
  // 포커스·스크롤은 panel.showConfirm 이 카드 전체를 뷰포트 안에 맞춘 뒤 준다(여기서 preventScroll 포커스를 주면 버튼이 레인 밖에 남는다)
  return { el, decided: (dec) => finish(dec) };
}
