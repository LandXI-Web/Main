/* rail.js — 6단 레일(반입→학습→조립→검수→배포·이식→운영)과 단별 서랍.
   ③ 조립 = matrix.js · ⑤ 배포·이식 = transplant.js. 나머지 넷은 여기. */
import { sse } from '../../shared/api-v1.js';
import { D, call, n, esc, mk, item, gsdText, metricOf, reportsBySet, retrainDue, openReports, tenantName, REPORT_MIN } from './data.js';
import * as M from './map.js';
import * as MX from './matrix.js';
import * as TP from './transplant.js';

export const STAGES = [
  { key: 'ingest', no: '01', t: '반입', h: '영상 · 대장' },
  { key: 'train', no: '02', t: '학습', h: '라벨 · 모델' },
  { key: 'assemble', no: '03', t: '조립', h: '만들 수 있는 서비스' },
  { key: 'review', no: '04', t: '검수', h: '의심 필지 검수' },
  { key: 'deploy', no: '05', t: '배포', h: '기관에 제공' },
  { key: 'ops', no: '06', t: '운영', h: '신고 · 재학습' },
];

export function railCounts() {
  const own = D.catalog.filter((i) => i.role === 'imagery' && i.source === 'pmtiles');
  const ready = MX.TASKS.map(MX.judge).filter((r) => r.ready).length;
  return { ingest: own.length, train: D.models.length, assemble: `${ready}/10`, review: D.rules.length, deploy: D.deploys.length, ops: openReports().length };
}

export function mountRail(el, ui) {
  const c = railCounts();
  el.innerHTML = STAGES.map((s) => `<button class="rstep${s.key === 'ops' && retrainDue().length ? ' is-flag' : ''}" data-k="${s.key}"><i>${s.no}</i><b>${s.t}</b><em>${c[s.key]}</em></button>`).join('');
  el.querySelectorAll('.rstep').forEach((b) => b.addEventListener('click', () => (ui.current === b.dataset.k ? ui.close() : ui.open(b.dataset.k, {}))));
}

export async function renderStage(key, body, ui, ctx) {
  if (key === 'assemble') { M.clear(ui.map); return MX.render(body, ui); }
  if (key === 'deploy') return TP.render(body, ui, ctx);
  if (key === 'ingest') return ingest(body, ui);
  if (key === 'train') return train(body, ui, ctx);
  if (key === 'review') return review(body, ui, ctx);
  if (key === 'ops') return ops(body, ui, ctx);
}

/* ── ① 반입: 영상 자산 + V-World 대조 레이어 ─────────────────── */
const VW = [
  ['lt_c_agrixue101', '농업진흥지역', 7], ['lt_c_ud801', '개발제한구역', 7], ['lt_c_uq111', '도시지역', 7], ['lp_pa_cbnd_bubun', '연속지적', 14],
];
const vwOn = new Set();
function ingest(body, ui) {
  const own = D.catalog.filter((i) => i.role === 'imagery' && i.source === 'pmtiles').sort((a, b) => a.gsd_m - b.gsd_m);
  const seen = new Set(); const rows = own.filter((i) => { const k = i.name.ko.replace(/\s*\d{4}-\d{2}\s*/, ''); if (seen.has(k + i.gsd_m)) return false; seen.add(k + i.gsd_m); return true; });
  body.innerHTML = `
    <section class="sec"><p class="sec__h"><span>V-World 대조 레이어</span></p>
      ${VW.map(([id, t, z]) => `<button class="sw" data-l="${id}" data-z="${z}" aria-pressed="${vwOn.has(id)}"><span>${t}${z > 10 ? '<small>확대 시</small>' : ''}</span><u></u></button>`).join('')}
    </section>
    <section class="sec"><p class="sec__h"><span>등록 영상</span><b>${own.length}</b></p>
      <ul class="rows">${rows.map((i) => `<li><button class="row" data-id="${esc(i.id)}"><span class="row__t">${esc(i.name.ko)}</span><span class="row__v num">${gsdText(i.gsd_m)}</span></button></li>`).join('')}</ul>
    </section>
    <p class="note">기관 대장은 기관 서비스 화면에서 올립니다.</p>`;
  M.clear(ui.map);
  M.setData(ui.map, 'foot', { type: 'FeatureCollection', features: own.filter((i) => i.bounds).map((i) => M.boxPoly(i.bounds, { id: i.id })) });
  body.querySelectorAll('.sw').forEach((b) => b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on); on ? vwOn.add(b.dataset.l) : vwOn.delete(b.dataset.l);
    M.wms(ui.map, b.dataset.l, on, { minzoom: +b.dataset.z, opacity: b.dataset.l === 'lp_pa_cbnd_bubun' ? .9 : .6 });
    if (on && ui.map.getZoom() < 9) M.fly(ui.map, [127.17, 35.29, 127.68, 35.58], { maxZoom: 11 });
  }));
  body.querySelectorAll('.row[data-id]').forEach((b) => b.addEventListener('click', () => {
    body.querySelectorAll('.row').forEach((x) => x.classList.toggle('is-on', x === b));
    const it = item(b.dataset.id);
    if (it?.bounds) { M.fly(ui.map, it.bounds, { maxZoom: 16 }); M.imagery(ui.map, it).catch(() => {}); }
  }));
}

/* ── ② 학습: 재학습 대상 + 모델 목록(같은 클래스는 한 줄) ──────── */
function train(body, ui) {
  const due = retrainDue();
  const groups = new Map();
  const TASK = { seg: '분할', obb: '회전 박스', det: '검출', index: '지수' };
  const NAME = [[/ndvi/, '식생지수(NDVI)'], [/worldcover/, '토지피복 이력'], [/^survey\/rules/, '실태조사 대조 규칙'], [/unsupervised-change/, '변화 탐지(비지도)']];
  const CLS = { vehicle: '차량', veg_gain: '식생 증가', veg_loss: '식생 감소', built_gain: '건물 증가', built_loss: '건물 감소' };
  const label = (m) => (NAME.find(([r]) => r.test(m.id)) || [])[1] || (m.classes || []).map((c) => CLS[c] || c.replace(/_/g, ' ')).join(' · ');
  for (const m of D.models) { const k = label(m); groups.set(k, [...(groups.get(k) || []), m]); }
  body.innerHTML = `
    ${due.length ? `<section class="sec"><p class="sec__h"><span>재학습 대상</span><b>${due.length}</b></p>
      <ul class="rows">${due.map((g, i) => `<li><button class="row" data-due="${i}"><span class="row__t">${esc(g.name)}</span><span class="row__v num">신고 ${g.list.length}</span>
        <span class="row__s">신고 ${REPORT_MIN}건 이상 · 오탐 라벨로 추가</span></button></li>`).join('')}</ul></section>` : ''}
    <section class="sec"><p class="sec__h"><span>등록 모델</span><b>${D.models.length}</b></p>
      <ul class="rows">${[...groups.entries()].map(([k, ms]) => { const m = ms[0]; const me = ms.map(metricOf).find(Boolean);
        return `<li><div class="row"><span class="row__t">${esc(k)}</span><span class="row__v num">${me ? n(me.env.value, 3).replace(/^0/, '') + mk(me.env) : ''}</span>
        <span class="row__s">${TASK[m.task] || m.task}${m.gsd_trained_m ? ' · ' + gsdText(m.gsd_trained_m) + ' 영상' : ''}${ms.length > 1 ? ` · 학습 ${ms.length}회` : ''}</span></div></li>`; }).join('')}</ul></section>`;
  M.clear(ui.map);
  body.querySelectorAll('[data-due]').forEach((b) => b.addEventListener('click', () => showReports(ui, due[+b.dataset.due].list)));
  if (due.length) showReports(ui, due[0].list);
}

function showReports(ui, list) {
  const pts = list.filter((f) => f.lnglat);
  M.setData(ui.map, 'fb', { type: 'FeatureCollection', features: pts.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: f.lnglat } })) });
  if (pts.length) { const xs = pts.map((f) => f.lnglat[0]), ys = pts.map((f) => f.lnglat[1]); M.fly(ui.map, [Math.min(...xs) - .01, Math.min(...ys) - .008, Math.max(...xs) + .01, Math.max(...ys) + .008], { maxZoom: 14 }); }
}

/* ── ④ 검수: 규칙별 의심 · 표본 분석(실제 GPU 작업) ────────────── */
let findCache = null;
async function review(body, ui) {
  const tot = D.rules.reduce((s, r) => s + (r.counts?.total?.value || 0), 0);
  body.innerHTML = `
    <section class="sec"><p class="sec__h"><span>A등급 검수 대기</span><b>${n(D.reviewA?.value)} ${mk(D.reviewA)}</b></p></section>
    <section class="sec"><p class="sec__h"><span>규칙별 의심</span><b>${n(tot)}</b></p>
      <ul class="rows">${D.rules.map((r) => { const c = r.counts || {}; const t = c.total?.value || 1; const w = (k) => ((c[k]?.value || 0) / t * 100).toFixed(1);
        return `<li><button class="row" data-r="${r.id}"><span class="row__t">${esc(r.name)}</span><span class="row__v num">${n(c.total?.value)}${mk(c.total)}</span>
        <span class="bar"><i class="a" style="width:${w('A')}%"></i><i class="b" style="width:${w('B')}%"></i><i class="c" style="width:${w('C')}%"></i></span></button></li>`; }).join('')}</ul>
    </section>
    <section class="sec"><p class="sec__h"><span>표본 분석</span><b id="swN"></b></p>
      <p class="note" id="swLine">A등급 1순위 필지 주변을 AI로 다시 판독합니다.</p>
      <div class="prog" hidden id="swProg"><i></i></div>
      <div class="act"><button class="btn btn--ink" id="swGo">분석 실행</button></div>
    </section>`;
  M.clear(ui.map);
  try {
    findCache ||= await call('/survey/findings?priority=A&state=open&limit=2000');
    drawFind(ui, findCache.items);
  } catch { /* 목록 결손 — 막대는 남는다 */ }
  body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', async () => {
    body.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('is-on', x === b));
    const j = await call(`/survey/findings?rule=${b.dataset.r}&priority=A&limit=2000`).catch(() => null);
    if (j) drawFind(ui, j.items);
  }));
  body.querySelector('#swGo').addEventListener('click', (e) => sweep(e.currentTarget, body, ui));
}

function drawFind(ui, items) {
  const fs = items.filter((f) => f.lnglat).map((f) => ({ type: 'Feature', properties: { p: f.priority, id: f.id }, geometry: { type: 'Point', coordinates: f.lnglat } }));
  M.setData(ui.map, 'find', { type: 'FeatureCollection', features: fs });
  if (fs.length) M.fly(ui.map, M.bboxOf({ type: 'FeatureCollection', features: fs }), { maxZoom: 12 });
  ui.hud(fs.length ? { v: n(fs.length), l: 'A등급 의심 필지' } : null);
}

async function sweep(btn, body, ui) {
  const top = findCache?.items?.[0];
  const img = item('ap25-namwon-2023');
  const line = body.querySelector('#swLine'), prog = body.querySelector('#swProg'), bar = prog.querySelector('i'), num = body.querySelector('#swN');
  if (!top || !img) { line.textContent = '분석할 필지를 찾지 못했습니다.'; return; }
  btn.disabled = true;
  const [x, y] = top.lnglat, dx = .0016, dy = .0012;
  const bb = [x - dx, y - dy, x + dx, y + dy];
  const aoi = M.boxPoly(bb).geometry;
  M.clear(ui.map, ['find']);
  M.setData(ui.map, 'focus', { type: 'Feature', properties: {}, geometry: aoi });
  await M.imagery(ui.map, img).catch(() => {});
  M.fly(ui.map, bb, { maxZoom: 17.4, pitch: 30, ms: 2400, pad: { top: 140, bottom: 140, left: 140, right: 520 } });
  ui.hud(null);
  line.textContent = `${top.addr.replace(/^\S+\s/, '')} 주변 판독 중`;
  prog.hidden = false;
  let j;
  try {
    j = await call('/jobs', { method: 'POST', body: { kind: 'infer', model_id: 'aerial25/best', imagery_id: img.id, aoi, options: { chip: 1024, conf: .25, overlap: .125 }, label: '콘솔 표본 분석' } });
  } catch (e) { line.textContent = e.message || '제출하지 못했습니다.'; btn.disabled = false; return; }
  const job = j.job; D.lastJob = job.id; D.onlog?.();
  const t0 = performance.now();
  const s = sse(j.events_url.replace(/^\/api\/v1/, ''), {
    on: async (name, d) => {
      if (name === 'job.progress' || name === 'shard.done') { const done = d?.shards_done ?? 0, tot = d?.shards_total ?? job.shards_total ?? 1; bar.style.width = Math.max(8, done / tot * 100) + '%'; }
      if (name === 'job.done' || name === 'snapshot.ready') {
        if (s.closed) return; s.closed = true; s.close();
        bar.style.width = '100%';
        const fc = await call(`/results/${job.result_set}/features?limit=2000`).catch(() => null);
        if (fc) M.setData(ui.map, 'res', fc);
        const cnt = fc?.lx?.count;
        const sec = ((performance.now() - t0) / 1000).toFixed(1);
        num.innerHTML = cnt ? `${n(cnt.value)} ${mk(cnt)}` : '';
        line.textContent = `AI 탐지 ${cnt ? n(cnt.value) : 0}개 · ${sec}초`;
        ui.hud(cnt ? { v: n(cnt.value), l: 'AI 탐지 · 검수 전' } : null);
        btn.disabled = false; btn.textContent = '다시 실행';
      }
      if (name === 'job.failed' || name === 'job.cancelled') { s.close(); line.textContent = '분석이 끝나지 못했습니다.'; btn.disabled = false; }
    },
  });
}

/* ── ⑥ 운영: 기관 신고 · 최근 분석 ─────────────────────────── */
function ops(body, ui) {
  const open = openReports();
  const recent = D.jobs;
  const cnt = (s) => recent.filter((j) => j.state === s).length;
  const done = cnt('done'), failed = cnt('failed'), running = cnt('running') + cnt('queued');
  body.innerHTML = `
    <section class="sec"><p class="sec__h"><span>기관 신고</span><b>${open.length}</b></p>
      <ul class="rows">${reportsBySet().map((g) => `<li><div class="row"><span class="row__t">${esc(g.name)}</span><span class="row__v num">${g.list.length}</span>
        <span class="row__s">${esc(tenantName(g.list[0].tenant_id))} · 오탐 · 최근 ${esc(String(g.list[0].at).slice(5, 10).replace('-', '.'))}</span></div></li>`).join('') || '<li class="void">열린 신고 없음</li>'}</ul>
      ${retrainDue().length ? `<div class="act"><button class="btn btn--line" id="goTrain">재학습으로</button></div>` : ''}
    </section>
    <section class="sec"><p class="sec__h"><span>최근 분석 작업</span><b>${recent.length}</b></p>
      <ul class="rows"><li><div class="row"><span class="row__t">진행</span><span class="row__v num">${running}</span></div></li>
      <li><div class="row"><span class="row__t">완료</span><span class="row__v num">${done}</span></div></li>
      <li><div class="row"><span class="row__t">실패</span><span class="row__v num">${failed}</span></div></li></ul>
    </section>`;
  M.clear(ui.map);
  showReports(ui, open);
  body.querySelector('#goTrain')?.addEventListener('click', () => ui.open('train', {}));
}
