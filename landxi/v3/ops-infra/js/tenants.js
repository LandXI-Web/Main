/* 기관 뷰 — 카드 밀도 그리드(기관 · 저장 · GPU 시간 · 분석 면적 · 3링) + 시트(한도 조정 → 결재 요청).
   한도 변경은 결재 요청 한 건(impl-1 · R&R '요청자 = 승인자' 막기) — 요청한 관리자가 아닌 다른 관리자가 결재함에서 승인해야 바뀐다.
   한도를 넘은 기관은 새 작업(분석 · AI 도우미 질문)을 받지 않는다(서버 quota.over_hard) — 카드에 한 줄로 알린다.
   기관 서랍 '공유 영상' 칸(확인 대장 5차 역할-4 ⓑ — LX 관리자가 기관마다 고름): 관할 안 LX 영상 목록에서 켜고 끈다. 켠 영상만 그 기관이
   지도에서 보고 분석 의뢰에 불러온다(서버가 거른다 · 공유 = 권한 한 줄 · 복사 0). */
import { drawer, toast, esc, nf, api, h, empty } from './kit.js';
import { S, DIM, RING_DIMS, POLICY, STATE_KO, dimState, orgs, loadUsage, llmUsage } from './data.js';
import { D as AP, loadPending } from '../../ops-core/js/data.js';
import { openBrand } from './brand.js';   // 기관 서랍 · 기관 정보(구현 2차 T3)
/** 이 기관의 한도 변경 결재가 대기 중인가(결재 표 한 출처 — 레일 배지와 같은 목록) */
const quotaPending = (id) => (AP.srvApprovals || []).some((a) => a.kind === 'quota' && (a.subject?.id || a.subject_id) === id && (a.state || 'pending') === 'pending');
/** 새 작업을 받지 않는 항목(하드 한도를 넘음) — 서버 판정과 같은 항목(분석: GPU 시간 · 분석 면적 · 저장 / AI 도우미) */
const BLOCK_DIMS = ['gpu_s_month', 'area_km2_month', 'storage_gb', 'llm_tokens_month'];
const blocked = (o) => BLOCK_DIMS.filter((k) => dimState(o.dims?.[k]) === 'over').map((k) => DIM[k]?.ko).filter(Boolean);

const R = 44, C = 2 * Math.PI * R;
/** 사용량 글자 — 저장은 1 GB 아래면 MB 로(0.007 GB → 7 MB) · 나머지는 항목 단위 */
function amount(D, used) {
  if (used == null) return { n: '—', unit: D.unit };
  const x = used * D.k;
  if (D.unit === 'GB' && x > 0 && x < 1) return { n: nf(x * 1000, x * 1000 < 1 ? 1 : 0), unit: 'MB' };
  return { n: nf(x, x && x < 10 ? D.d || 1 : 0), unit: D.unit };
}
function ring(dim, v) {
  const D = DIM[dim];
  const used = v?.used?.value, hard = v?.hard, soft = v?.soft;
  const unset = hard == null || v?.limit_set === false;      // 한도 미설정 = % 를 만들지 않고 실사용량만
  const st = unset ? 'unset' : dimState(v);
  const f = !unset && used != null && hard ? Math.min(1, used / hard) : 0;
  const pct = unset ? '' : used > 0 && f < 0.01 ? '&lt;1' : String(Math.round(f * 100));
  const tick = !unset && soft && hard ? soft / hard : null;
  const ta = tick != null ? tick * 2 * Math.PI - Math.PI / 2 : 0;
  const u = amount(D, used);
  const cap = unset ? `<small class="unset">한도 미설정</small>`
    : `<b class="num">${u.n}${u.unit !== D.unit ? `<small> ${esc(u.unit)}</small>` : ''}/${nf(hard * D.k, 0)}<small> ${esc(D.unit)}</small></b>`;
  return `<figure class="ring" data-st="${st}" data-metric="${esc(D.ko)}" data-v="${used ?? ''}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="bg" cx="60" cy="60" r="${R}"/>
      <circle class="fg" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${(C * (1 - f)).toFixed(2)}" transform="rotate(-90 60 60)"/>
      ${tick != null ? `<line class="tk" x1="${60 + (R - 7) * Math.cos(ta)}" y1="${60 + (R - 7) * Math.sin(ta)}" x2="${60 + (R + 7) * Math.cos(ta)}" y2="${60 + (R + 7) * Math.sin(ta)}"/>` : ''}
    </svg>
    <span class="rc num">${unset ? `${u.n}<small>${esc(u.unit)}</small>` : `${pct}<small>%</small>`}</span>
    <figcaption><span>${esc(D.ko)}</span>${cap}</figcaption>
  </figure>`;
}

function sheet(o, onDone) {
  const body = h('form.qs', { autocomplete: 'off' });
  body.innerHTML = `
    <div class="qs-h"><span>항목</span><span>소프트</span><span>하드</span><span>정책</span></div>
    ${Object.entries(DIM).map(([k, D]) => {
      const v = o.dims[k] || {};
      const sv = v.soft == null ? '' : +(v.soft * D.k).toFixed(D.d), hv = v.hard == null ? '' : +(v.hard * D.k).toFixed(D.d);
      return `<div class="qs-r" data-k="${k}"><span class="qs-n">${esc(D.ko)}<small>${esc(D.unit)}</small></span>
        <input class="t-input num" name="soft" inputmode="decimal" value="${sv}" aria-label="${esc(D.ko)} 소프트">
        <input class="t-input num" name="hard" inputmode="decimal" value="${hv}" aria-label="${esc(D.ko)} 하드">
        <select class="t-input" name="policy" aria-label="${esc(D.ko)} 정책">${Object.entries(POLICY).map(([p, ko]) => `<option value="${p}"${(v.policy || 'notify') === p ? ' selected' : ''}>${ko}</option>`).join('')}</select></div>`;
    }).join('')}
    <label class="qs-why"><span>사유</span><textarea class="t-input" name="reason" rows="3" required></textarea></label>
    <p class="qs-err" role="alert"></p>
    <button class="t-btn qs-go" type="submit">결재 요청</button>`;
  const wrap = h('div.qs-w', {}, body, shares(o));
  const d = drawer({ title: o.name, body: wrap, slot: 'right' });
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = body.querySelector('.qs-err'); err.textContent = '';
    const dims = {};
    for (const r of body.querySelectorAll('.qs-r')) {
      const k = r.dataset.k, D = DIM[k], v = o.dims[k] || {};
      const sv = r.querySelector('[name=soft]').value.trim(), hv = r.querySelector('[name=hard]').value.trim();
      if (!sv && !hv && DIM[k].ring === false) continue;            // 한도 미설정 항목(AI 도우미 사용량)은 비워 두면 그대로
      const s = parseFloat(sv), hd = parseFloat(hv);
      if (!(s >= 0) || !(hd > 0) || s > hd) { err.textContent = `${D.ko}: 소프트는 하드보다 클 수 없습니다`; r.querySelector('[name=soft]').focus(); return; }
      const next = { soft: +(s / D.k).toFixed(4), hard: +(hd / D.k).toFixed(4), policy: r.querySelector('[name=policy]').value };
      const same = v.soft != null && v.hard != null && Math.abs(next.soft - v.soft) < 1e-6 && Math.abs(next.hard - v.hard) < 1e-6 && next.policy === (v.policy || 'notify');
      if (!same) dims[k] = next;                                     // 바뀐 항목만 결재에 올린다
    }
    if (!Object.keys(dims).length) { err.textContent = '바뀐 값이 없습니다'; return; }
    const reason = body.querySelector('[name=reason]').value.trim();
    if (!reason) { body.querySelector('[name=reason]').focus(); return; }
    const btn = body.querySelector('.qs-go'); btn.disabled = true;
    try {
      await api(`/tenants/${encodeURIComponent(o.id)}/quota`, { method: 'PUT', body: { dims, reason } });
      d.close(); toast('결재를 요청했습니다. 다른 관리자가 승인하면 바뀝니다'); await Promise.all([loadUsage(), loadPending().catch(() => null)]); onDone?.();
    } catch { err.textContent = '지금은 요청할 수 없습니다'; btn.disabled = false; }
  });
  return d;
}

/** 공유 영상 칸 — 관할 안 LX 영상 · 켜고 끄기(지도에서 보기 · 분석 의뢰에 쓰기). 값은 서버(GET/PUT /tenants/{id}/imagery-shares) 한 곳 */
const CAP = (x) => (x.view && x.analyze ? '지도 · 분석 의뢰' : x.analyze ? '분석 의뢰' : x.view ? '지도' : '');
function shares(o) {
  const sec = h('section.sh', { 'aria-label': '공유 영상' });
  const head = h('header.sh-h', {}, h('h3', { text: '공유 영상' }), h('span.sh-n.num'));
  const ul = h('ul.sh-l');
  const hold = h('div.sh-e');
  sec.append(head, h('p.sh-d', { text: '켠 LX 영상만 이 기관이 지도에서 보고 분석 의뢰에 불러옵니다' }), hold, ul);
  empty(hold, { kind: 'loading', compact: true });
  let items = [];
  const paint = () => {
    hold.hidden = !!items.length;
    if (!items.length) { hold.innerHTML = ''; empty(hold, { kind: 'first', title: '이 기관 관할에 LX 영상이 없습니다', compact: true }); }
    head.querySelector('.sh-n').textContent = items.length ? `${items.filter((x) => x.shared).length} / ${items.length}` : '';
    ul.innerHTML = items.map((x) => `<li data-id="${esc(x.id)}"><div class="t"><b>${esc(x.name)}</b><span>${esc([x.year ? x.year + '년' : '', x.gsd_word, CAP(x)].filter(Boolean).join(' · '))}</span></div>
      <button type="button" class="sw" role="switch" aria-checked="${x.shared}" aria-label="${esc(x.name)} 공유"><i></i></button></li>`).join('');
  };
  api(`/tenants/${encodeURIComponent(o.id)}/imagery-shares`).then((j) => { items = j.items || []; paint(); })
    .catch(() => { hold.innerHTML = ''; empty(hold, { kind: 'error', compact: true }); });
  ul.addEventListener('click', async (e) => {
    const b = e.target.closest('.sw'); if (!b) return;
    const x = items.find((i) => i.id === b.closest('li').dataset.id); if (!x) return;
    b.disabled = true;
    try {
      const r = await api(`/tenants/${encodeURIComponent(o.id)}/imagery-shares/${encodeURIComponent(x.id)}`, { method: 'PUT', body: { shared: !x.shared } });
      x.shared = !!r.shared; paint();
      toast(x.shared ? `${o.name}에 공유했습니다` : '공유를 껐습니다');
    } catch (err) { toast(err.message || '지금은 바꿀 수 없습니다'); b.disabled = false; }
  });
  return sec;
}

export function mountTenants(root) {
  root.innerHTML = `<div class="v v-org" id="org"></div>
    <section class="t-card llmu" aria-label="AI 도우미 사용량">
      <header class="llmu-h"><h2>AI 도우미 사용량</h2><span class="t-chip">이번 달</span></header>
      <table class="llmu-t"><thead><tr><th>기관</th><th class="num">사용량</th><th class="num">한도</th></tr></thead><tbody id="llmu"></tbody></table>
    </section>`;
  const grid = root.querySelector('#org');
  const llmu = root.querySelector('#llmu');
  function paintLlm() {
    llmu.innerHTML = llmUsage().map((r) => {
      const u = r.used?.value;
      return `<tr data-id="${esc(r.id)}" data-st="${r.state}"><th scope="row">${esc(r.name)}</th>
        <td class="num"><b data-metric="AI 도우미 사용량" data-tenant="${esc(r.id)}" data-v="${u ?? ''}">${u == null ? '—' : nf(u, 0)}</b><small> 토큰</small></td>
        <td class="num">${r.hard == null ? '<small>한도 미설정</small>' : `${nf(r.hard, 0)}<small> 토큰</small>`}</td></tr>`;
    }).join('');
  }
  function paint() {
    const list = orgs();
    grid.style.setProperty('--n', list.length);
    grid.innerHTML = list.map((o) => {
      const bl = blocked(o), pend = quotaPending(o.id);
      return `
      <section class="t-card org" data-id="${esc(o.id)}">
        <header><h2>${esc(o.name)}</h2><span class="t-chip" data-lv="${o.state === 'over' ? 'warn' : o.state === 'ok' ? 'wait' : ''}" data-st="${o.state}">${STATE_KO[o.state]}</span></header>
        <div class="rings">${RING_DIMS.map((k) => ring(k, o.dims[k])).join('')}</div>
        ${bl.length ? `<p class="org-stop" data-stop="1">${esc(bl.join(' · '))} 한도를 넘어 새 작업을 받지 않습니다</p>` : ''}
        <div class="org-acts"><button class="t-btn t-btn--2 adj" type="button"${pend ? ' data-pend="1"' : ''}>${pend ? '한도 변경 결재 대기' : '한도 조정'}</button><button class="t-btn t-btn--2 brand-b" type="button">기관 정보</button></div>
      </section>`;
    }).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => grid.querySelectorAll('.fg').forEach((c) => c.setAttribute('stroke-dashoffset', c.dataset.off))));
    paintLlm();
  }
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.org'); if (!card) return;
    const o = orgs().find((x) => x.id === card.dataset.id); if (!o) return;
    if (e.target.closest('.brand-b')) return openBrand(o);   // 마크 · 이름 · 색 · 소개 글(기관 관리자와 같은 칸)
    sheet(o, paint);
  });
  return { paint, open(id) { const o = orgs().find((x) => x.id === id); if (o) sheet(o, paint); } };
}
