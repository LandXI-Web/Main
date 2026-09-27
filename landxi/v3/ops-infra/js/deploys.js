/* 배포 뷰 — 매트릭스(카드 × 기관 · 버전 · 단계) + 행 시트([단계 올리기] [롤백] [모듈] [모델 교체] [GPU 배치]). */
import { drawer, toast, table, stepper, empty, esc, api, h } from './kit.js';
import { S, STAGE, STAGES, FORWARD, deploys, whoOf, cardName, verOf, verOfId, modName, swapModels, currentModels, loadLineage, poolName, POOL, loadDeploys } from './data.js';

const chip = (st) => `<span class="stg" data-st="${esc(st)}"><i></i>${esc(STAGE[st] || st)}</span>`;
/** 단계 궤적 — 초안 → 검증 → 시범 → 운영 네 칸(지난 칸 잉크 · 현재 칸 굵게) + 단계 이름 */
function track(st) {
  const at = st === 'rolled_back' ? -1 : STAGES.indexOf(st);
  return `<span class="trk" data-st="${esc(st)}">${STAGES.map((s, i) => `<i class="${i < at ? 'on' : i === at ? 'now' : ''}"></i>`).join('')}<b>${esc(STAGE[st] || st)}</b></span>`;
}
const COLS = [
  { key: 'card', label: '카드', fmt: (v) => `<b class="dcard">${esc(v)}</b>` },
  { key: 'org', label: '기관' },
  { key: 'ver', label: '버전', fmt: (v, r) => `<span class="num dver">${esc(v || '—')}</span>${r.prev ? `<small class="dprev num">${esc(r.prev)}</small>` : ''}` },
  { key: 'stage', label: '단계', fmt: (v) => track(v) },
];

function sheet(d0, repaint) {
  let d = d0, open = null, lin = [];
  loadLineage(d.id).then((x) => { lin = x || []; draw(); });
  const body = h('div.ds');
  const dr = drawer({ title: `${cardName(d.card_id)} · ${whoOf(d)}`, body, slot: 'right' });
  const act = async (path, payload, done) => {
    try {
      const r = await api(`/deploys/${encodeURIComponent(d.id)}/${path}`, { method: 'POST', body: payload });
      d = r.deploy || r; toast(done);
      await loadDeploys(); d = S.deploys.find((x) => x.id === d.id) || d; draw(); repaint();
    } catch (e) {
      if (e.code === 'approval_required') toast('결재 후 올릴 수 있습니다', { action: { label: '결재', href: '/landxi/v3/ops-core/#/approvals' } });
      else toast('지금은 요청할 수 없습니다');
    }
  };
  function draw() {
    const ci = STAGES.indexOf(d.stage);
    const next = FORWARD[d.stage];
    const canBack = (d.stage === 'canary' || d.stage === 'ga') && !!d.prev_card_version_id;
    const ext = Object.entries(d.modules?.ext || {});
    const models = swapModels(d, lin);
    const using = new Set(currentModels(d, lin));
    const pools = Object.keys(S.queues?.pools || POOL);
    body.innerHTML = `
      <div class="ds-top"><span class="num ds-v">${esc(verOf(d) || '—')}</span>${chip(d.stage)}</div>
      <div class="ds-steps"></div>
      ${d.prev_card_version_id ? `<p class="ds-lin">이전 버전 <b class="num">${esc(verOfId(d.prev_card_version_id))}</b></p>` : ''}
      <div class="ds-b">
        <button class="t-btn" type="button" data-a="up"${next ? '' : ' disabled'}>단계 올리기</button>
        <button class="t-btn t-btn--2" type="button" data-a="back"${canBack ? '' : ' disabled'}>롤백</button>
      </div>
      <div class="ds-tabs" role="tablist">
        <button type="button" role="tab" data-p="mod" aria-selected="${open === 'mod'}">모듈</button>
        <button type="button" role="tab" data-p="model" aria-selected="${open === 'model'}">모델 교체</button>
        <button type="button" role="tab" data-p="gpu" aria-selected="${open === 'gpu'}">GPU 배치</button>
      </div>
      <div class="ds-p" data-p="mod"${open === 'mod' ? '' : ' hidden'}>${ext.length ? ext.map(([k, on]) => `<label class="sw"><span>${esc(modName(k))}</span><input type="checkbox" data-mod="${esc(k)}"${on ? ' checked' : ''}><i></i></label>`).join('') : '<div class="ds-empty"></div>'}</div>
      <div class="ds-p" data-p="model"${open === 'model' ? '' : ' hidden'}>${models.length ? models.map((r) => `<label class="rd"><input type="radio" name="model" value="${esc(r.id)}"${using.has(r.id) && (!d.model_override || d.model_override === r.id) ? ' checked' : ''}><span>${esc(r.label)}</span>${r.mark ? `<em class="pm" data-m="${r.mark === '✓' ? 'hi' : 'mid'}" title="${r.mark === '✓' ? '정밀도 높음' : '정밀도 보통'}">${r.mark}</em>` : ''}</label>`).join('') : '<div class="ds-empty"></div>'}</div>
      <div class="ds-p" data-p="gpu"${open === 'gpu' ? '' : ' hidden'}>${pools.map((p) => `<label class="rd"><input type="radio" name="pool" value="${esc(p)}"${(d.gpu_pool || '') === p ? ' checked' : ''}><span>${esc(poolName(p))}</span></label>`).join('')}</div>`;
    stepper(body.querySelector('.ds-steps'), STAGES.map((s) => ({ t: STAGE[s] })), { current: ci < 0 ? 0 : ci, done: d.stage === 'ga' ? [0, 1, 2, 3] : undefined });
    body.querySelectorAll('.ds-empty').forEach((em) => empty(em, { kind: 'first' }));
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.a === 'up') act('rollout', { stage: FORWARD[d.stage] }, '요청했습니다');
    else if (b.dataset.a === 'back') act('rollback', {}, '롤백했습니다');
    else if (b.dataset.p) { open = open === b.dataset.p ? null : b.dataset.p; draw(); }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.mod) act('modules', { ext: { [t.dataset.mod]: t.checked } }, '요청했습니다');
    else if (t.name === 'model') act('model', { model_id: t.value }, '요청했습니다');
    else if (t.name === 'pool') act('gpu', { pool: t.value }, '요청했습니다');
  });
  draw();
  return dr;
}

export function mountDeploys(root) {
  root.innerHTML = `<div class="v v-dep"><section class="t-card dep-t"><div id="dep-t"></div></section></div>`;
  const open = (id) => { const d = S.deploys.find((x) => x.id === id); if (d) sheet(d, paint); };
  const T = table(root.querySelector('#dep-t'), { cols: COLS, rows: [], limit: 20, onRow: (r) => open(r.id) });
  function paint() {
    const list = deploys();
    if (!list.length) { root.querySelector('.v-dep').innerHTML = '<div class="dep-0"></div>'; empty(root.querySelector('.dep-0'), { kind: 'first', text: '배포본이 없습니다' }); return; }
    T.set(list.map((d) => ({ id: d.id, card: cardName(d.card_id), org: whoOf(d), ver: verOf(d), prev: d.prev_card_version_id ? verOfId(d.prev_card_version_id) : '', stage: d.stage })));
  }
  return { paint, open };
}
