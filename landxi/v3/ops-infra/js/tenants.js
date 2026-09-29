/* 기관 뷰 — 카드 밀도 그리드(기관 · 저장 · GPU 시간 · 분석 면적 · 3링) + 시트(한도 조정 → 결재 요청). */
import { drawer, toast, esc, nf, api, h } from './kit.js';
import { S, DIM, RING_DIMS, POLICY, STATE_KO, dimState, orgs, loadUsage, llmUsage } from './data.js';

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
  const d = drawer({ title: o.name, body, slot: 'right' });
  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = body.querySelector('.qs-err'); err.textContent = '';
    const dims = {};
    for (const r of body.querySelectorAll('.qs-r')) {
      const k = r.dataset.k, D = DIM[k];
      const sv = r.querySelector('[name=soft]').value.trim(), hv = r.querySelector('[name=hard]').value.trim();
      if (!sv && !hv && DIM[k].ring === false) continue;            // 한도 미설정 항목(AI 도우미 사용량)은 비워 두면 그대로
      const s = parseFloat(sv), hd = parseFloat(hv);
      if (!(s >= 0) || !(hd > 0) || s > hd) { err.textContent = `${D.ko}: 소프트는 하드보다 클 수 없습니다`; r.querySelector('[name=soft]').focus(); return; }
      dims[k] = { soft: +(s / D.k).toFixed(4), hard: +(hd / D.k).toFixed(4), policy: r.querySelector('[name=policy]').value };
    }
    const reason = body.querySelector('[name=reason]').value.trim();
    if (!reason) { body.querySelector('[name=reason]').focus(); return; }
    const btn = body.querySelector('.qs-go'); btn.disabled = true;
    try {
      await api(`/tenants/${encodeURIComponent(o.id)}/quota`, { method: 'PUT', body: { dims, reason } });
      d.close(); toast('요청했습니다'); await loadUsage(); onDone?.();
    } catch { err.textContent = '지금은 요청할 수 없습니다'; btn.disabled = false; }
  });
  return d;
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
    grid.innerHTML = list.map((o) => `
      <section class="t-card org" data-id="${esc(o.id)}">
        <header><h2>${esc(o.name)}</h2><span class="t-chip" data-lv="${o.state === 'over' ? 'warn' : o.state === 'ok' ? 'wait' : ''}" data-st="${o.state}">${STATE_KO[o.state]}</span></header>
        <div class="rings">${RING_DIMS.map((k) => ring(k, o.dims[k])).join('')}</div>
        <button class="t-btn t-btn--2 adj" type="button">한도 조정</button>
      </section>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => grid.querySelectorAll('.fg').forEach((c) => c.setAttribute('stroke-dashoffset', c.dataset.off))));
    paintLlm();
  }
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.org'); if (!card) return;
    const o = orgs().find((x) => x.id === card.dataset.id); if (o) sheet(o, paint);
  });
  return { paint, open(id) { const o = orgs().find((x) => x.id === id); if (o) sheet(o, paint); } };
}
