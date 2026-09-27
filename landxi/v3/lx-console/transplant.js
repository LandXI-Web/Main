/* transplant.js — ⑤ 배포·이식: '어떻게 지자체에 주지?'
   배포본 하나를 고르면 6단(반입→학습→조립→검수→배포→운영)을 그 지역 실데이터로 점검해 '남은 일'을 보인다.
   출처: /deploys · /registry/lineage/{id} · /catalog/layers · /survey/findings?deploy_id · /feedback · /jobs */
import { D, call, n, esc, mk, shortRegion, cardShort, aoiBox, intersects, gsdText, STAGE_KO, STAGE_RANK, tenantName, REPORT_MIN } from './data.js';
import * as M from './map.js';

export async function render(body, ui, ctx = {}) {
  const list = D.deploys.filter((d) => !ctx.cardId || d.card_id === ctx.cardId)
    .sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || shortRegion(a).localeCompare(shortRegion(b)));
  const sel = ctx.deployId ? D.deploys.find((d) => d.id === ctx.deployId) : null;
  const groups = ['draft', 'canary', 'shadow', 'ga'].map((s) => [s, list.filter((d) => d.stage === s)]).filter(([, l]) => l.length);
  body.innerHTML = `
    <div id="tpSel"></div>
    ${ctx.cardId ? `<p class="note">${esc(cardShort(ctx.cardId))} 배포본만 · <button class="out" style="color:inherit" id="tpAll">전체</button></p>` : ''}
    ${groups.map(([s, l]) => `
      <section class="sec"><p class="sec__h"><span>${STAGE_KO[s]}</span><b>${l.length}</b></p>
        <ul class="rows">${l.map((d) => `<li><button class="row${sel && sel.id === d.id ? ' is-on' : ''}" data-id="${esc(d.id)}">
          <span class="row__t">${esc(shortRegion(d))} · ${esc(cardShort(d.card_id))}</span><span class="row__v num">${esc(d.version || '—')}</span>
          <span class="row__s">${esc(tenantName(d.tenant_id))}${d.from_deploy_id ? ' · 이식' : ''}</span></button></li>`).join('')}</ul></section>`).join('')}`;
  body.querySelectorAll('.row[data-id]').forEach((b) => b.addEventListener('click', () => ui.open('deploy', { ...ctx, deployId: b.dataset.id })));
  body.querySelector('#tpAll')?.addEventListener('click', () => ui.open('deploy', {}));
  if (sel) await steps(body.querySelector('#tpSel'), sel, ui);
  else M.clear(ui.map, []);
}

/** 선택 배포본의 6단 점검 */
async function steps(el, d, ui) {
  const box = aoiBox(d);
  M.clear(ui.map, []);
  if (d.aoi) M.setData(ui.map, 'focus', { type: 'Feature', properties: {}, geometry: d.aoi });
  if (box) M.fly(ui.map, box, { maxZoom: 11.5 });
  ui.pin(d.region_profile);
  el.innerHTML = `
    <div class="pair"><b>${esc(cardShort(d.card_id))} ${esc(d.version || '')}</b><i></i><b>${esc(shortRegion(d))}</b></div>
    <ul class="steps" id="tpSteps"><li class="step is-wait"><i>…</i><b>점검 중</b></li></ul>`;
  const [lin, fin] = await Promise.allSettled([call('/registry/lineage/' + encodeURIComponent(d.id)), call(`/survey/findings?deploy_id=${encodeURIComponent(d.id)}&limit=1`)]);
  const chain = lin.status === 'fulfilled' ? lin.value.chain || [] : [];
  const total = fin.status === 'fulfilled' ? fin.value.total : null;
  const near = D.catalog.filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && intersects(i.bounds, box));
  const rk = shortRegion(d).replace(/(특별자치도|특별시|광역시|시|군|구)$/, '');
  const imgs = near.filter((i) => i.id.startsWith(d.region_profile || '#') || (rk && (i.name?.ko || '').includes(rk)));
  const fine = imgs.filter((i) => i.gsd_m <= .5);
  const modelIds = chain.filter((c) => c.kind === 'model').map((c) => c.id);
  const model = D.models.find((m) => modelIds.includes(m.id)) || (d.model_override && D.models.find((m) => m.id === d.model_override));
  const on = (d.modules?.core?.length || 0) + Object.values(d.modules?.ext || {}).filter(Boolean).length;
  const jobs = D.jobs.filter((j) => j.deploy_id === d.id && j.state === 'done').length;
  const fb = D.feedback.filter((f) => f.tenant_id === d.tenant_id && f.state === 'open');
  const found = total?.value || 0;
  const S = [
    ['반입', fine.length ? 'ok' : 'todo', fine.length ? `영상 ${fine.length}벌 · ${esc(fine[0].name.ko)}` : imgs.length ? `${gsdText(Math.min(...imgs.map((i) => i.gsd_m)))} 영상만 · 25cm 등록 필요` : `25cm 영상 등록 필요${near.length ? ` · 인접 ${near.length}벌` : ''}`, near.length ? 'img' : null],
    ['학습', model ? 'ok' : 'todo', model ? esc((model.classes || []).join(' · ')) : '연결된 모델 없음', 'model'],
    ['조립', d.card_version_id ? 'ok' : 'todo', `카드 ${esc(d.version || '')} · 모듈 ${on}개`, null],
    ['검수', found || jobs ? 'ok' : 'todo', found ? `의심 ${n(found)}건 ${mk(total)}` : jobs ? `분석 ${jobs}회 완료` : '첫 분석 전', 'find'],
    ['배포', d.stage === 'draft' ? 'wait' : 'ok', d.stage === 'draft' ? `관리자 결재 대기 · 승인 ${(d.approvals || []).length}` : STAGE_KO[d.stage], null],
    ['운영', fb.length >= REPORT_MIN ? 'todo' : 'ok', fb.length ? `기관 신고 ${fb.length}건${fb.length >= REPORT_MIN ? ' · 재학습 검토' : ''}` : '신고 없음', fb.length ? 'fb' : null],
  ];
  const EM = { ok: '됨', todo: '할 일', wait: '대기' };
  const ul = el.querySelector('#tpSteps');
  ul.innerHTML = S.map(([t, s, line, act], i) => `<li class="step is-${s}" style="animation-delay:${i * 90}ms"${act ? ` data-act="${act}" role="button" tabindex="0"` : ''}><i>${i + 1}</i><b>${t}</b><em>${EM[s]}</em><span>${line}</span></li>`).join('');
  const todo = S.filter((x) => x[1] === 'todo').length;
  el.insertAdjacentHTML('beforeend', `<p class="note">${todo ? `남은 일 ${todo}` : '모든 단 완료'}</p>`);
  ul.querySelectorAll('[data-act]').forEach((li) => li.addEventListener('click', () => {
    const a = li.dataset.act;
    if (a === 'img') M.setData(ui.map, 'foot', { type: 'FeatureCollection', features: (imgs.length ? imgs : near).map((i) => M.boxPoly(i.bounds, { name: i.name.ko })) });
    if (a === 'fb') { M.setData(ui.map, 'fb', { type: 'FeatureCollection', features: fb.filter((f) => f.lnglat).map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: f.lnglat } })) }); }
    if (a === 'find') ui.open('review', {});
    if (a === 'model') ui.open('train', {});
  }));
}
