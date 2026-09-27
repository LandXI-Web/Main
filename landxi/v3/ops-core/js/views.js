/* 다섯 화면 — 화면마다 질문 하나 · 숫자 ≤ 5 · 1차 행동 1개 */
import { api } from '/landxi/shared/api-v1.js';
import {
  S, STAGE, NEXT, DIM, inbox, queue, who, shortName, decided, alerts, worstDisk, heavy, avgLoad, liveTenants, canonDeploys,
  tenantName, cardName, verOf, regionShort, decisionSince, loadDeploys, loadUsage, loadAll,
} from './store.js';
import { regions, fly, flyTo, paint } from './map.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (v) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString('ko-KR'));
const n1 = (v) => (v == null || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const val = (x) => (x && typeof x === 'object' ? x.value : x);
const dot = (stage) => `<i class="dot${stage === 'draft' ? ' draft' : ''}" style="--c:${STAGE[stage]?.c || '#fff'}"></i>`;
const MODEL_KO = { 'aerial25/best': '항공영상 토지 판독', car_v2_obb: '차량 검출', 'unsupervised-change': '변화 탐지', 'survey/rules': '실태조사 규칙',
  'index/ndvi_pc': '식생 지수', 'index/worldcover_hist': '토지피복 통계', cultivate_uncultivate: '경작 판별', growth_baseline: '생육 단계', production_baseline: '생산 기반',
  Vinyl_house: '비닐하우스', Silage: '곤포 사일리지' };
const modelKo = (id) => { if (MODEL_KO[id]) return MODEL_KO[id]; const k = id.split('/').filter((x) => !/^train\d*$|^best$/.test(x)).pop(); return MODEL_KO[k] || k.replace(/[_-]/g, ' '); };

export const ctx = { go: null, toast: null, refresh: null, sel: null };

/* ═══ 현황 ═══════════════════════════════════════════════ */
let scope = 'kr';
export function overview(v) {
  const box = inbox(); const al = alerts(); const wd = worstDisk(); const load = avgLoad();
  const q = queue();
  const todo = [
    ...box.slice(0, 2).map((x) => ({ t: x.tk, b: x.title, s: x.sub, c: x.type === 'promote' ? STAGE.canary.c : '#FFB633', go: () => ctx.go('approvals', x.key) })),
    ...al.slice(0, 1).map((a) => ({ t: '경보', b: a.title, s: '인프라', c: '#FF5A4E', go: () => ctx.go('infra') })),
    ...q.slice(0, 1).map((x) => ({ t: x.tk, b: x.title, s: x.sub, c: '#8F99A8', go: () => deploySheet(x.d) })),
  ];
  v.innerHTML = `
  <div class="ov-col">
    <section class="panel ov-hero enter">
      <div class="lbl">결재 대기</div>
      <div class="big num" id="ov-big">${box.length}<span class="unit">건</span></div>
      <div class="ov-stats">
        <div><span class="lbl">경보</span><span class="kv ${al.length ? 'warn' : ''}">${al.length}</span></div>
        <div><span class="lbl">GPU 부하</span><span class="kv" id="ov-load">${load == null ? '—' : n0(load)}<span class="unit">%</span></span></div>
        <div title="${wd ? esc(n0(wd.v.free_gb.value) + ' GB 남음') : ''}"><span class="lbl">저장 여유${wd ? ' · ' + wd.v.mount.replace(':', '') : ''}</span><span class="kv ${wd && wd.f < 0.1 ? 'warn' : ''}">${wd ? n0(wd.f * 100) : '—'}<span class="unit">%</span></span></div>
        <div><span class="lbl">운영 기관</span><span class="kv">${liveTenants().size}</span></div>
      </div>
    </section>
    <div class="ov-cta enter" style="animation-delay:60ms"><button class="btn-pri" id="ov-open" ${box.length ? '' : 'disabled'}>결재함 열기</button></div>
    <section class="panel todo enter" style="animation-delay:120ms">
      <h3 class="lbl">할 일</h3>
      ${todo.length ? todo.map((x, i) => `<a href="#" data-i="${i}"><i class="dot" style="--c:${x.c}"></i><span class="tx"><b>${esc(x.b)}</b><small>${esc(x.t)} · ${esc(x.s)}</small></span><span class="go">→</span></a>`).join('') : '<p class="empty" style="padding:12px 24px">없음</p>'}
    </section>
  </div>
  <div class="ov-seg enter">
    <div class="seg"><button data-s="kr" class="${scope === 'kr' ? 'on' : ''}">국내</button><button data-s="world" class="${scope === 'world' ? 'on' : ''}">해외</button></div>
    <div class="legend">${['ga', 'canary', 'shadow', 'draft'].map((s) => `<span>${dot(s)}${STAGE[s].ko}</span>`).join('')}</div>
  </div>`;
  v.querySelectorAll('.todo a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); todo[+a.dataset.i].go(); }));
  $('#ov-open', v).addEventListener('click', () => ctx.go('approvals', box[0]?.key));
  v.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.s; v.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b)); fly(scope); }));
}
export function overviewTick(v) {
  const el = $('#ov-load', v); const l = avgLoad();
  if (el && l != null) el.firstChild.nodeValue = n0(l);
}
export function regionSheet(r) {
  flyTo(r);
  openSheet(`
    <h2>${esc(r.name)}</h2>
    <div class="chain">${r.items.map((d, i) => `<div style="cursor:pointer" data-i="${i}"><span>${dot(d.stage)} ${STAGE[d.stage].ko}</span><b style="font-weight:500">${esc(cardName(d.card_id))} <em class="num" style="font-style:normal;color:var(--w3)">${esc(verOf(d))}</em></b></div>`).join('')}</div>
    <div class="acts"><button class="btn" id="rs-all">배포 매트릭스</button></div>`, (sh) => {
    sh.querySelectorAll('.chain div').forEach((row) => row.addEventListener('click', () => deploySheet(r.items[+row.dataset.i])));
    $('#rs-all', sh).addEventListener('click', () => { closeSheet(); ctx.go('deploys'); });
  });
}

/* ═══ 인프라 ═════════════════════════════════════════════ */
export function infra(v) {
  const G = S.gpus?.gpus || [];
  const pools = S.queues?.pools || {};
  const queued = Object.values(pools).reduce((s, p) => s + (p.queued || 0), 0);
  const running = Object.values(pools).reduce((s, p) => s + (p.running || 0), 0);
  const hv = heavy(); const cap = 1;
  const watts = G.reduce((s, g) => s + (val(g.power_w) ?? 0), 0);
  const resident = S.models.filter((m) => m.resident_on?.length);
  const llm = S.llm.filter((m) => m.resident && m.backend === 'vllm');
  v.innerHTML = `
  <div class="grid">
    ${G.map((g, i) => gpuTile(g, i)).join('') || '<section class="panel gpu"><p class="empty">GPU 수신 없음</p></section><section class="panel gpu"></section>'}
    <section class="panel pw enter" style="animation-delay:120ms">
      <div><div class="lbl">전력 예산</div>
        <div class="pw-row" style="margin-top:14px"><span class="mid num ${hv > cap ? 'warn' : ''}" id="pw-hv"><span data-k="hv">${hv}</span><span class="unit">/ ${cap}</span></span></div>
        <p class="sub" style="margin-top:10px" title="전원 용량 규칙: 고부하 GPU는 한 번에 한 장">고부하 GPU · 지금 <span id="pw-w">${n0(watts)}</span> W</p></div>
      <div style="border-top:1px solid var(--hl);padding-top:18px;display:grid;grid-template-columns:1fr 1fr">
        <div><div class="lbl">대기</div><div class="kv num" style="margin-top:10px">${queued}</div></div>
        <div><div class="lbl">실행</div><div class="kv num" style="margin-top:10px">${running}</div></div>
      </div>
      <div style="margin-top:auto"><button class="btn" id="join">노드 추가</button></div>
    </section>
    <section class="panel disks enter" style="animation-delay:180ms">
      <div class="sec-h"><span class="lbl">저장소</span></div>
      ${(S.storage?.volumes || []).map((vol) => { const p = vol.used_gb.value / vol.total_gb.value; const c = p >= 0.9 ? 'var(--warn)' : p >= 0.8 ? 'var(--amb)' : 'var(--w)'; return `
        <div class="meter"><div class="meter-h"><span>${esc(vol.mount.replace(':', ''))} 드라이브</span><b class="${p >= 0.9 ? 'warn' : ''}">${n0(p * 100)}%</b></div>
        <div class="bar" style="--c:${c}"><i data-w="${(p * 100).toFixed(1)}"></i></div><div class="meter-h"><span>${n0(vol.free_gb.value)} GB 남음</span><span>${vol.total_gb.value >= 1024 ? n1(vol.total_gb.value / 1024) + ' TB' : n0(vol.total_gb.value) + ' GB'}</span></div></div>`; }).join('') || '<p class="empty">수신 전</p>'}
    </section>
    <section class="panel models enter" style="animation-delay:240ms">
      <div class="sec-h"><span class="lbl">상주 모델</span><span class="sub">${resident.length + llm.length}</span></div>
      <ul>${resident.map((m) => `<li class="mrow"><b>${esc(modelKo(m.model_id))}</b><span class="sub">GPU ${esc(String(m.resident_on[0]).replace('a6000-', ''))}</span><span class="num sub">${mem(m.vram_mib?.value)}</span></li>`).join('')}
      ${llm.map((m) => `<li class="mrow"><b>${m.role?.includes('router') ? '언어 모델 · 분류' : '언어 모델 · 분석'}</b><span class="sub">${esc(String(m.gpu).replace('GPU', 'GPU '))}</span><span class="sub ok">응답</span></li>`).join('')}</ul>
      ${resident.length + llm.length ? '' : '<p class="empty">없음</p>'}
    </section>
    <section class="panel lanes enter" style="animation-delay:300ms">
      <div class="sec-h"><span class="lbl">최근 24시간 작업</span><span class="sub">${laneCount()}건</span></div>
      <ul>${lanes()}</ul>
      <div class="lane-axis"><span>-24h</span><span>-12h</span><span>지금</span></div>
      <ul style="margin-top:22px">${byTenant().map(([t, n]) => `<li class="mrow"><b>${esc(t)}</b><span></span><span class="num sub">${n}건</span></li>`).join('')}</ul>
    </section>
  </div>`;
  requestAnimationFrame(() => v.querySelectorAll('.bar i[data-w]').forEach((i) => { i.style.width = i.dataset.w + '%'; }));
  $('#join', v).addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { const r = await api('/ops/nodes/join-token', { method: 'POST', body: {} }); try { await navigator.clipboard.writeText(r.token); } catch { /* */ } ctx.toast('가입 토큰 발급 · 24시간 유효 · 복사됨'); }
    catch (err) { ctx.toast(err.message || '실패'); }
    e.currentTarget.disabled = false;
  });
}
const mem = (mib) => (mib == null ? '' : mib >= 1024 ? n1(mib / 1024) + ' GB' : n0(mib) + ' MB');
function roles(g) {
  const r = [];
  if (g.worker) r.push('AI 추론');
  const llm = S.llm.some((m) => m.resident && String(m.gpu) === 'GPU' + g.index) || (g.external || []).some((x) => /llama|vllm|ollama/i.test(x.name));
  if (llm) r.push('언어 모델');
  return r.join(' · ') || '대기';
}
function gm(g) { return { used: val(g.mem_used_mib), total: val(g.mem_total_mib), w: val(g.power_w), lim: val(g.power_limit_w) }; }
function gpuTile(g, i) {
  const util = g.util_ma5?.value ?? g.util_pct?.value ?? 0;
  const m = gm(g); const vr = m.used / m.total;
  return `<section class="panel gpu enter" style="animation-delay:${i * 60}ms" data-gpu="${g.index}">
    <div class="gpu-h"><span class="lbl">GPU ${g.index}</span><span class="gpu-role">${roles(g)}</span></div>
    <div class="mid num"><span data-k="util">${n0(util)}</span><span class="unit">% 부하</span></div>
    <svg class="spark" data-k="spark" viewBox="0 0 300 44" preserveAspectRatio="none">${spark(S.gpuHist.get(g.index))}</svg>
    <div class="meter"><div class="meter-h"><span>메모리</span><b data-k="vram">${n1(m.used / 1024)} / ${n0(m.total / 1024)} GB</b></div><div class="bar" style="--c:var(--w)"><i data-k="vbar" data-w="${(vr * 100).toFixed(1)}"></i></div></div>
    <div class="meter"><div class="meter-h"><span>전력</span><b data-k="pw">${n0(m.w)} / ${n0(m.lim)} W</b></div><div class="bar" style="--c:var(--ai)"><i data-k="pbar" data-w="${((m.w / m.lim) * 100).toFixed(1)}"></i></div></div>
  </section>`;
}
function spark(h = []) {
  if (!h.length) return '';
  const n = 90, W = 300, H = 44, pts = h.slice(-n).map((v, i, a) => [W - (a.length - 1 - i) * (W / (n - 1)), H - 2 - (Math.min(100, v) / 100) * (H - 4)]);
  const line = pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ');
  return `<polyline points="${pts[0][0].toFixed(1)},${H} ${line} ${W},${H}" fill="rgba(43,217,207,.10)" stroke="none"/><polyline points="${line}" fill="none" stroke="#2BD9CF" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
}
export function infraTick(v) {
  for (const g of S.gpus?.gpus || []) {
    const t = v.querySelector(`[data-gpu="${g.index}"]`); if (!t) continue;
    const util = g.util_ma5?.value ?? 0;
    t.querySelector('[data-k="util"]').textContent = n0(util);
    t.querySelector('[data-k="spark"]').innerHTML = spark(S.gpuHist.get(g.index));
    const m = gm(g);
    t.querySelector('[data-k="vram"]').textContent = `${n1(m.used / 1024)} / ${n0(m.total / 1024)} GB`;
    t.querySelector('[data-k="pw"]').textContent = `${n0(m.w)} / ${n0(m.lim)} W`;
    t.querySelector('[data-k="vbar"]').style.width = (m.used / m.total * 100).toFixed(1) + '%';
    t.querySelector('[data-k="pbar"]').style.width = (m.w / m.lim * 100).toFixed(1) + '%';
  }
  const hv = heavy(), hvEl = v.querySelector('#pw-hv'), wEl = v.querySelector('#pw-w');
  if (hvEl) { hvEl.querySelector('[data-k="hv"]').textContent = hv; hvEl.classList.toggle('warn', hv > 1); }
  if (wEl) wEl.textContent = n0((S.gpus?.gpus || []).reduce((s, g) => s + (val(g.power_w) ?? 0), 0));
}
function byTenant() {
  const since = Date.now() - 864e5; const m = new Map();
  for (const l of S.queues?.lanes || []) for (const b of l.blocks) if (new Date(b.to || b.from).getTime() >= since && b.state === 'done') { const k = b.tenant_id === 'lx' ? 'LX' : shortName(b.tenant_id); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
}
function laneCount() { const since = Date.now() - 864e5; return (S.queues?.lanes || []).reduce((s, l) => s + l.blocks.filter((b) => new Date(b.to || b.from).getTime() >= since).length, 0); }
function lanes() {
  const now = Date.now(), span = 864e5;
  return (S.queues?.lanes || []).map((l) => {
    const lbl = /a6000-(\d)/.test(l.worker) ? 'GPU ' + l.worker.split('-')[1] : 'CPU ' + (Number(l.worker.split('-')[1]) + 1);
    const bl = l.blocks.filter((b) => now - new Date(b.to || b.from).getTime() <= span).map((b) => {
      const a = Math.max(0, (new Date(b.from).getTime() - (now - span)) / span), z = Math.min(1, (new Date(b.to || now).getTime() - (now - span)) / span);
      return `<i class="${b.state === 'done' || b.state === 'running' ? '' : 'x'}" style="left:${(a * 100).toFixed(2)}%;width:${Math.max(0.15, (z - a) * 100).toFixed(2)}%" title="${esc(tenantName(b.tenant_id))} · ${b.state === 'done' ? '완료' : b.state === 'running' ? '실행' : '취소'}"></i>`;
    }).join('');
    return `<li class="lane"><span class="sub">${lbl}</span><div class="lane-t">${bl}</div></li>`;
  }).join('');
}

/* ═══ 기관 ═══════════════════════════════════════════════ */
export function tenants(v) {
  const rows = S.usage.filter((u) => u.tenant_id !== 'lx-demo').sort((a, b) => (a.tenant_id === 'lx') - (b.tenant_id === 'lx') || a.tenant_id.localeCompare(b.tenant_id));
  const svc = (tid) => canonDeploys().filter((d) => d.tenant_id === tid).length;
  v.innerHTML = `<section class="panel tlist enter">
    <div class="trow head"><span>기관</span>${Object.values(DIM).map((d) => `<span>${d.ko}</span>`).join('')}<span>서비스</span><span></span></div>
    ${rows.map((u) => {
      const t = S.tenants.find((x) => x.id === u.tenant_id); const iso = u.isolation;
      return `<div class="trow"><div class="tname"><b>${esc(shortName(u.tenant_id))}</b><small>${t?.scope === 'global' ? '해외' : '국내'}${iso && iso.rls && !iso.raw_routes ? ' · 격리 정상' : ''}</small></div>
      ${Object.entries(DIM).map(([k, d]) => meter(u.dims?.[k], d)).join('')}
      <span class="tsvc num">${svc(u.tenant_id)}</span>
      ${u.tenant_id === 'lx' ? '<span></span>' : `<button class="btn" data-q="${esc(u.tenant_id)}">한도 조정</button>`}</div>`;
    }).join('')}
  </section>`;
  requestAnimationFrame(() => v.querySelectorAll('.bar i[data-w]').forEach((i) => { i.style.width = i.dataset.w + '%'; }));
  v.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => quotaSheet(b.dataset.q)));
}
function meter(x, d) {
  if (!x) return '<span class="sub">—</span>';
  const used = x.used?.value == null ? null : x.used.value * d.k; const hard = x.hard == null ? null : x.hard * d.k; const soft = x.soft == null ? null : x.soft * d.k;
  const p = hard ? Math.min(1, (used || 0) / hard) : 0;
  const c = soft && used >= soft ? 'var(--amb)' : 'var(--w)';
  return `<div class="meter"><div class="meter-h"><span><b>${used == null ? '—' : n1(used)}</b> ${hard ? '/ ' + n0(hard) : ''} ${d.unit}</span><span>${hard ? '' : '한도 없음'}</span></div>
    <div class="bar" style="--c:${c}"><i data-w="${(p * 100).toFixed(2)}"></i>${soft && hard ? `<span class="soft" style="left:${(soft / hard * 100).toFixed(1)}%"></span>` : ''}</div></div>`;
}
function quotaSheet(tid) {
  const u = S.usage.find((x) => x.tenant_id === tid); if (!u) return;
  openSheet(`
    <h2>${esc(tenantName(tid))}</h2>
    ${Object.entries(DIM).map(([k, d]) => { const x = u.dims?.[k] || {}; return `<label class="field"><span>${d.ko} 한도</span><span class="in"><input class="num" type="number" min="0" step="any" data-k="${k}" value="${x.hard == null ? '' : +(x.hard * d.k).toFixed(1)}"><em>${d.unit}</em></span></label>`; }).join('')}
    <p class="note">알림은 한도의 80%에서 켜집니다.</p>
    <label class="field"><span>사유</span><input id="q-why" maxlength="80" placeholder="한 줄"></label>
    <p class="err" id="q-err"></p>
    <div class="acts"><button class="btn-pri" id="q-ok">변경</button></div>`, (sh) => {
    $('#q-ok', sh).addEventListener('click', async (e) => {
      const why = $('#q-why', sh).value.trim(); if (!why) { $('#q-err', sh).textContent = '사유를 적어 주세요'; return; }
      const dims = {};
      sh.querySelectorAll('input[data-k]').forEach((i) => {
        const k = i.dataset.k, d = DIM[k], cur = u.dims?.[k] || {}; if (i.value === '') return;
        const hard = Number(i.value) / d.k; dims[k] = { hard, soft: Math.round(hard * 0.8 * 1000) / 1000, policy: cur.policy || 'notify' };
      });
      e.currentTarget.disabled = true;
      try { await api(`/tenants/${tid}/quota`, { method: 'PUT', body: { dims, reason: why } }); await loadUsage(); closeSheet(); ctx.toast('한도를 바꿨습니다'); ctx.refresh(); }
      catch (err) { $('#q-err', sh).textContent = err.message; e.currentTarget.disabled = false; }
    });
  });
}

/* ═══ 배포 ═══════════════════════════════════════════════ */
export function deploys(v) {
  const ds = canonDeploys();
  const cols = [...new Set(ds.map((d) => d.tenant_id))].sort((a, b) => {
    const s = (t) => (S.tenants.find((x) => x.id === t)?.scope === 'global' ? 1 : 0) * 10 + (t === 'lx' ? 5 : 0);
    return s(a) - s(b) || a.localeCompare(b);
  });
  const cards = S.cards.filter((c) => ds.some((d) => d.card_id === c.id));
  const wait = new Set(inbox().filter((x) => x.type === 'promote').map((x) => x.d.id));
  const nextOf = new Set(queue().map((x) => x.d.id));
  v.innerHTML = `<section class="panel mx enter"><table>
    <thead><tr><th style="padding-left:24px">서비스</th>${cols.map((t) => `<th>${esc(shortName(t))}<small>${t === 'lx' ? esc(regionShort(ds.find((d) => d.tenant_id === t))) : S.tenants.find((x) => x.id === t)?.scope === 'global' ? '해외' : '국내'}</small></th>`).join('')}</tr></thead>
    <tbody>${cards.map((c) => `<tr><td class="card">${esc(cardName(c.id))}</td>${cols.map((t) => {
      const here = ds.filter((x) => x.card_id === c.id && x.tenant_id === t).sort((a, b) => (STAGE[b.stage].order - STAGE[a.stage].order) || (a.year || 0) - (b.year || 0));
      if (!here.length) return '<td><span class="none">·</span></td>';
      return `<td>${here.slice(0, 2).map((d) => `<button class="cell${here.length > 1 ? ' two' : ''}" data-id="${esc(d.id)}">${dot(d.stage)}<span>${STAGE[d.stage].ko}</span><em>${esc(verOf(d) || '')}${here.length > 1 && d.year ? ' · ' + d.year : ''}</em>${wait.has(d.id) ? '<b class="wait">승인</b>' : nextOf.has(d.id) ? '<b class="wait nx">다음</b>' : ''}</button>`).join('')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>
    <div class="mx-foot">${['ga', 'canary', 'shadow', 'draft', 'rolled_back'].map((s) => `<span>${dot(s)}${STAGE[s].ko}</span>`).join('')}</div>
  </section>`;
  v.querySelectorAll('.cell').forEach((b) => b.addEventListener('click', () => {
    v.querySelectorAll('.cell').forEach((x) => x.classList.toggle('sel', x === b));
    deploySheet(ds.find((d) => d.id === b.dataset.id));
  }));
}

/* ═══ 결재 ═══════════════════════════════════════════════ */
let filt = 'all';
export function approvals(v, selKey) {
  const box = inbox();
  const types = [['all', '전체'], ['promote', '배포 승격'], ['quota', '한도']];
  const q = queue();
  const list = box.filter((x) => filt === 'all' || x.type === filt);
  const hist = decided(6);
  v.innerHTML = `<div class="ap">
    <div class="ap-filter enter">${types.map(([k, ko]) => `<button data-f="${k}" class="${filt === k ? 'on' : ''}">${ko} <span class="num">${k === 'all' ? box.length : box.filter((x) => x.type === k).length}</span></button>`).join('')}</div>
    <section class="panel ap-list enter" style="animation-delay:60ms">${list.length ? list.map((x) => `
      <button class="ap-item" data-k="${esc(x.key)}"><span class="t">${dot(x.type === 'promote' ? 'canary' : x.type === 'progress' ? x.d.stage : 'rolled_back')} ${esc(x.tk)}</span><span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span><span class="go">→</span></button>`).join('') : '<p class="empty" style="padding:20px 24px">대기 없음</p>'}</section>
    ${q.length ? `<section class="panel ap-done enter" style="animation-delay:90ms"><h3 class="lbl">진행 대기</h3><ul>${q.map((x) => `<li class="qrow" data-k="${esc(x.key)}"><span>${dot(x.d.stage)} ${esc(x.tk)}</span><span>${esc(x.title)}</span><span class="sub">${esc(x.sub)}</span></li>`).join('')}</ul></section>` : ''}
    <section class="panel ap-done enter" style="animation-delay:120ms"><h3 class="lbl">최근 결정</h3><ul>${hist.map(({ d, a }) => `<li><span class="${a.decision === 'approve' ? 'ok' : 'warn'}">${a.decision === 'approve' ? '승인' : '반려'}</span><span>${esc(who(d))} · ${esc(cardName(d.card_id))}</span><span class="num">${hhmm(a.at)}</span></li>`).join('')}</ul></section>
  </div>`;
  v.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filt = b.dataset.f; approvals(v); }));
  v.querySelectorAll('.qrow').forEach((r) => r.addEventListener('click', () => deploySheet(q.find((x) => x.key === r.dataset.k)?.d)));
  v.querySelectorAll('.ap-item').forEach((b) => b.addEventListener('click', () => pickItem(v, box.find((x) => x.key === b.dataset.k))));
  const first = box.find((x) => x.key === selKey) || (!document.querySelector('#sheet.open') && list[0]);
  if (first) pickItem(v, first);
}
function pickItem(v, x) {
  if (!x) return;
  v.querySelectorAll('.ap-item').forEach((b) => b.classList.toggle('sel', b.dataset.k === x.key));
  if (x.type === 'quota') return quotaSheet(x.tid);
  deploySheet(x.d);
}

/* ═══ 배포본 시트(결재·매트릭스·지도 공용) ═══════════════ */
export async function deploySheet(d) {
  if (!d) return;
  const st = STAGE[d.stage]; const dec = decisionSince(d);
  const order = ['draft', 'shadow', 'canary', 'ga'];
  const cur = d.stage === 'rolled_back' ? 2 : order.indexOf(d.stage);
  let acts = '';
  if (d.stage === 'canary' && !dec) acts = `<label class="field"><span>의견</span><input id="a-why" maxlength="80" placeholder="반려 시 필수"></label><p class="err" id="a-err"></p><div class="row"><button class="btn-pri" data-a="approve">승인</button><button class="btn" data-a="reject">반려</button></div>`;
  else if (d.stage === 'canary' && dec?.decision === 'approve') acts = `<p class="note ok">승인됨 · ${hhmm(dec.at)}</p><p class="err" id="a-err"></p><button class="btn-pri" data-a="ga">운영 전환</button>`;
  else if (d.stage === 'canary' && dec?.decision === 'reject') acts = `<p class="note warn">반려됨 · ${esc(dec.reason || '')}</p>`;
  else if (NEXT[d.stage] && d.card_version_id) acts = `<p class="err" id="a-err"></p><button class="btn-pri" data-a="${NEXT[d.stage]}">${STAGE[NEXT[d.stage]].ko} 단계로</button>`;
  else if (d.stage === 'rolled_back') acts = `<p class="err" id="a-err"></p><button class="btn-pri" data-a="canary">다시 시범</button>`;
  if ((d.stage === 'canary' || d.stage === 'ga') && d.prev_card_version_id) acts += `<button class="btn" data-a="rollback">이전 버전으로</button>`;
  openSheet(`
    <div class="lbl">${esc(d.tenant_id === 'lx' ? 'LX 자체 · ' + regionShort(d) : shortName(d.tenant_id) === regionShort(d) ? shortName(d.tenant_id) : shortName(d.tenant_id) + ' · ' + regionShort(d))}</div>
    <h2>${esc(cardName(d.card_id))} <span class="num" style="color:var(--w3);font-weight:500">${esc(verOf(d))}</span></h2>
    <div class="steps" style="--c:${st.c}">${order.map((s, i) => `<div class="${i < cur ? 'done' : i === cur ? 'cur' : ''}"><i></i>${STAGE[s].ko}</div>`).join('')}</div>
    <div class="chain" id="chain"><div><span>계보</span><span class="sub">…</span></div></div>
    <div class="acts">${acts || '<p class="note">조치할 것 없음</p>'}</div>`, (sh) => {
    sh.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(d, b.dataset.a, sh, b)));
  });
  try {
    const L = await api('/registry/lineage/' + encodeURIComponent(d.id));
    const ch = L.chain || [];
    const ds = ch.find((x) => x.kind === 'dataset'), mo = ch.find((x) => x.kind === 'model');
    const rows = [['데이터', ds ? ds.label || '확보' : null], ['모델', mo ? modelKo(mo.id) : null], ['카드', `${cardName(d.card_id)} ${verOf(d)}`], ['기관', who(d)]];
    const el = $('#chain'); if (el) el.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><span>${v ? esc(v) : '<span class="sub">기록 없음</span>'}</span></div>`).join('');
  } catch { const el = $('#chain'); if (el) el.innerHTML = `<div><span>계보</span><span class="sub">기록 없음</span></div>`; }
}
async function act(d, a, sh, btn) {
  const err = $('#a-err', sh); const why = $('#a-why', sh)?.value.trim();
  if (a === 'reject' && !why) { if (err) err.textContent = '반려 사유를 적어 주세요'; return; }
  btn.disabled = true;
  try {
    if (a === 'approve' || a === 'reject') await api(`/deploys/${d.id}/approve`, { method: 'POST', body: { decision: a, reason: why || null } });
    else if (a === 'rollback') await api(`/deploys/${d.id}/rollback`, { method: 'POST', body: {} });
    else await api(`/deploys/${d.id}/rollout`, { method: 'POST', body: { stage: a } });
    await loadDeploys();
    ctx.toast({ approve: '승인했습니다', reject: '반려했습니다', rollback: '이전 버전으로 되돌렸습니다' }[a] || `${STAGE[a].ko} 단계로 옮겼습니다`);
    closeSheet(); paint(false); ctx.refresh();
  } catch (e) { if (err) err.textContent = e.message; btn.disabled = false; }
}

/* ═══ 시트 ═══════════════════════════════════════════════ */
export function openSheet(html, bind) {
  const sh = $('#sheet');
  sh.innerHTML = `<button class="sheet-x" aria-label="닫기">×</button>${html}`;
  sh.classList.add('open'); sh.setAttribute('aria-hidden', 'false');
  $('.sheet-x', sh).addEventListener('click', closeSheet);
  bind && bind(sh);
}
export function closeSheet() {
  const sh = $('#sheet'); sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.cell.sel,.ap-item.sel').forEach((x) => x.classList.remove('sel'));
}
export { regions, loadAll };
