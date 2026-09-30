/* 인프라 뷰 — 큰 숫자 `동시 고부하 GPU {n} / {m}` + 장비 표 + 큐 + 저장 공간 + 언어 모델(모델별 줄 · 국산 모델 연결 자리 · 꺼졌을 때만 켜기) + 법령 색인 칸.
   성능 수치(부하 · 메모리 · 전력)는 플랫폼에서 이 표 한 곳에만. GPU 는 순번으로만(제품명 · 포트 · 경로 0). 갱신은 숫자만 바뀐다(튐 없음). */
import { bignum, table, esc, nf, toast, devlog } from './kit.js';
import { S, budget, HOT, HOT_W, gpuWork, hotNote, judgedAt, llmRows, startLlm, restartServer, waitBoot } from './data.js';

const val = (e) => (e && typeof e === 'object' ? e.value : e);
const pct = (a, b) => (a != null && b ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const gb = (mib) => (mib == null ? null : mib / 1024);

/** 끝점 라벨이 겹치지 않게(가까우면 위아래로 벌린다) */
function tagTops(ts) {
  const o = ts.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);
  for (let k = 1; k < o.length; k++) if (o[k].t - o[k - 1].t < 14) o[k].t = o[k - 1].t + 14;
  const over = o.length ? o[o.length - 1].t - 100 : 0;
  if (over > 0) o.forEach((x) => { x.t -= over; });
  return o.sort((a, b) => a.i - b.i).map((x) => x.t);
}
/** 전력 추이(장당 · 최근 몇 분) — 고부하 선 = 전력 규칙 선 */
function powerChart(el) {
  const W = 640, H = 120;
  const lim = Math.max(200, ...(S.gpus?.gpus || []).map((g) => val(g.power_limit_w) || 0));
  const series = [...S.watts.entries()].sort((a, b) => a[0] - b[0]);
  const n = Math.max(2, ...series.map(([, h]) => h.length));
  const x = (i, len) => W - ((len - 1 - i) / (n - 1)) * W;
  const y = (v) => H - (Math.min(lim, v) / lim) * H;
  const paths = series.map(([, h], si) => {
    const d = h.map((v, i) => `${i ? 'L' : 'M'}${x(i, h.length).toFixed(1)},${y(v).toFixed(1)}`).join('');
    return `<path class="ln ln-${si}" d="${d}"/>`;
  }).reverse().join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <line class="hot" x1="0" x2="${W}" y1="${y(HOT_W)}" y2="${y(HOT_W)}"/>${paths}</svg>
    <span class="hot-l" style="top:${(y(HOT_W) / H) * 100}%">고부하</span>
    <span class="tags">${tagTops(series.map(([, h]) => (y(h[h.length - 1] ?? 0) / H) * 100)).map((t, si) => `<i class="tg tg-${si}" style="top:${t.toFixed(1)}%">GPU ${series[si][0]}</i>`).join('')}</span>`;
}
/** 행 안 부하 추이(작은 면 그래프) */
function spark(h) {
  if (!h || h.length < 2) return '<svg class="spk" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"></svg>';
  const W = 200, H = 60, n = h.length;
  const pts = h.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - (Math.min(100, v) / 100) * (H - 4) - 2).toFixed(1)}`);
  const hot = H - (HOT / 100) * (H - 4) - 2;
  return `<svg class="spk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line class="hot" x1="0" x2="${W}" y1="${hot}" y2="${hot}"/><path class="ar" d="M0,${H} L${pts.join(' L')} L${W},${H}Z"/><path class="ln" d="M${pts.join(' L')}"/></svg>`;
}

function lanes(el) {
  const L = S.queues?.lanes || [];
  const running = Object.values(S.queues?.pools || {}).reduce((a, p) => a + (p.running || 0), 0);
  const now = Date.now(), span = 24 * 60 * 60 * 1000, t0 = now - span;
  const label = (w) => { const m = /^(a6000|cpu|a100)-(\d+)$/.exec(w || ''); return m ? (m[1] === 'cpu' ? 'CPU ' : 'GPU ') + m[2] : '작업기'; };
  const hours = [0, 6, 12, 18, 24].map((h) => `<em style="left:${(h / 24) * 100}%">${h === 24 ? '지금' : h === 0 ? '24시간 전' : ''}</em>`).join('');
  el.innerHTML = L.map((ln) => {
    const blocks = (ln.blocks || []).filter((b) => (b.to || (running && (S.jobs || []).some((j) => j.id === b.job_id && j.state === 'running'))) && new Date(b.to || now).getTime() >= t0).map((b) => {
      const a = Math.max(0, (new Date(b.from).getTime() - t0) / span), z = Math.min(1, ((b.to ? new Date(b.to).getTime() : now) - t0) / span);
      return `<i class="${b.to ? '' : 'run'}" style="left:${(a * 100).toFixed(3)}%;width:max(2px,${((z - a) * 100).toFixed(3)}%)"></i>`;
    }).join('');
    return `<div class="lane"><span>${esc(label(ln.worker))}</span><b>${blocks}</b></div>`;
  }).join('') + `<div class="lane lane-ax"><span></span><b>${hours}</b></div>`;
}

const bar = (p, cls = '') => `<span class="mbar ${cls}"><i style="width:${p.toFixed(1)}%"></i></span>`;

function rows() {
  return (S.gpus?.gpus || []).map((g) => {
    const load = val(g.util_ma5) ?? val(g.util_pct) ?? 0;
    const mu = gb(val(g.mem_used_mib)), mt = gb(val(g.mem_total_mib));
    const w = val(g.power_w), wl = val(g.power_limit_w);
    return { g, load, mu, mt, w, wl, idx: g.index, work: gpuWork(g), hot: hotNote(g), caution: !!g.caution, fault: !!g.fault };
  });
}
const COLS = [
  { key: 'idx', label: '장비', fmt: (v, r) => `<span class="dev"><i class="dot${r.fault ? ' dot--f' : r.caution ? ' dot--c' : ''}"></i><b>GPU ${esc(v)}</b>${r.fault ? '<em class="warn">장애</em>' : ''}</span>` },
  { key: 'load', label: '부하', num: true, fmt: (v, r) => `<span class="cell cell--load"><span class="n" data-k="load">${nf(v, 0)}</span><small>%</small>${spark(S.hist.get(r.idx))}</span>` },
  { key: 'mu', label: '메모리', num: true, fmt: (v, r) => `<span class="cell"><span class="n">${nf(v, 1)}</span><small>/ ${nf(r.mt, 0)} GB</small>${bar(pct(v, r.mt), r.caution ? 'mbar--tick' : '')}</span>` },
  { key: 'w', label: '전력', num: true, fmt: (v, r) => `<span class="cell"><span class="n">${nf(v, 0)}</span><small>/ ${nf(r.wl, 0)} W</small>${bar(pct(v, r.wl))}</span>` },
  { key: 'work', label: '작업', fmt: (v, r) => `<span class="work${(v === '대기' || v === '—') && !r.hot ? ' idle' : ''}">${esc(v)}</span>${r.hot ? `<em class="hotn" data-hot="1">${esc(r.hot)}</em>` : ''}` },
];

export function mountInfra(root) {
  root.innerHTML = `
  <div class="v v-infra">
    <section class="t-card hero">
      <div class="hero-n" id="big"></div>
      <p class="hero-tail" id="tail"></p>
      <div class="chart" id="chart"></div>
    </section>
    <section class="t-card gpu"><div id="gpu-t"></div></section>
    <section class="t-card q">
      <div class="q-n"><span><small>대기</small><b class="num" id="q-wait">—</b></span><span><small>진행</small><b class="num" id="q-run">—</b></span></div>
      <div class="lanes" id="lanes"></div>
      <p class="q-24"><span>최근 24시간 작업</span><b class="num" id="j24" data-metric="최근 24시간 작업">—</b></p>
    </section>
    <aside class="side">
      <section class="t-card disk">
        <p class="row"><span>저장 공간</span><b class="num" id="disk-n">—</b></p>
        <div class="tanks" id="vols"></div>
      </section>
      <section class="t-card llm" aria-label="언어 모델">
        <p class="row"><span>언어 모델</span><b class="num" id="llm-n">—</b></p>
        <ul class="llm-l" id="llm-l"></ul>
        <p class="row sub llm-pr"><span>국산 모델 연결</span><b id="llm-pr" data-metric="국산 모델 연결">—</b></p>
        <p class="row sub"><span>마지막 재기동</span><b class="num" id="boot">—</b><button class="t-btn t-btn--2 srv-go" type="button" id="srv-go">다시 시작</button></p>
      </section>
      <section class="t-card law" id="law" aria-label="법령 색인" hidden></section>
    </aside>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const big = bignum($('#big'), null, { label: '동시 고부하 GPU' });
  const T = table($('#gpu-t'), { cols: COLS, rows: [] });

  function paintGpus() {
    const b = budget();
    const env = { value: b.n, unit: 'count', basis: 'measured', as_of: S.gpus?.power_budget?.at || S.gpus?.at || new Date().toISOString(), source: 'GPU 장비 기록' };
    big.set(env, { unit: `/ ${b.m}` });
    const tail = $('#tail');
    const ov = S.gpus?.power_budget?.overlap?.n?.value;
    const jt = judgedAt();
    tail.textContent = (jt ? `${jt} 기준 · ` : '') + (b.ok ? '전력 예산 안' : '전력 예산 초과') + (ov != null ? ` · 최근 2시간 두 장 동시 고부하 ${nf(ov)}회` : '');
    tail.dataset.at = jt || ''; tail.dataset.hot = b.n;
    tail.dataset.overlap = ov ?? '';
    tail.classList.toggle('warn', !b.ok);
    const rs = rows();
    const tb = $('#gpu-t tbody');
    // 행 수가 같으면 숫자만 바꾼다(표를 다시 그리지 않음 → 튐 없음)
    if (tb && tb.children.length === rs.length) {
      rs.forEach((r, i) => COLS.forEach((c, j) => { const td = tb.children[i].children[j]; const html = c.fmt(r[c.key], r); if (td.innerHTML !== html) td.innerHTML = html; }));
    } else T.set(rs);
    powerChart($('#chart'));
  }
  function paintRest() {
    const P = Object.values(S.queues?.pools || {});
    $('#q-wait').textContent = nf(P.reduce((s, p) => s + (p.queued || 0), 0));
    $('#q-run').textContent = nf(P.reduce((s, p) => s + (p.running || 0), 0));
    lanes($('#lanes'));
    const j = $('#j24'); if (S.jobs24) { j.textContent = nf(S.jobs24.value); j.dataset.v = S.jobs24.value; }
    const V = S.storage?.volumes || [];
    if (V.length) {
      const used = V.reduce((s, v) => s + (val(v.used_gb) || 0), 0), tot = V.reduce((s, v) => s + (val(v.total_gb) || 0), 0);
      $('#disk-n').innerHTML = `${nf(used / 1024, 1)}<small> / ${nf(tot / 1024, 1)} TB</small>`;
      $('#vols').innerHTML = V.map((v) => { const u = val(v.used_gb), t = val(v.total_gb), p = pct(u, t); return `<div class="tank"><span class="tb"><i style="height:${p.toFixed(1)}%"></i>${p >= 90 ? '<em class="tick"></em>' : ''}</span><b class="num">${nf(u / 1024, 1)}</b><small class="num">/ ${nf(t / 1024, 1)} TB</small></div>`; }).join('');
    }
    paintLlm();
    const boot = S.health?.boot_at;
    if (boot) { const d = new Date(boot); $('#boot').textContent = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  }
  /* 언어 모델 — 모델별 줄(역할 · 이름 · 켜짐/꺼짐 · GPU 순번). '켜기'는 꺼진 두뇌·라우터에만 열리고 켜진 동안 잠긴다(끄기·재시작 없음). */
  const starting = new Set();
  function paintLlm() {
    const L = llmRows();
    const ul = $('#llm-l');
    if (!L) { $('#llm-n').textContent = '—'; ul.innerHTML = '<li class="llm-x">연결 없음</li>'; $('#llm-pr').textContent = '연결 전'; return; }
    $('#llm-n').innerHTML = `${nf(L.on)}<small> / ${nf(L.items.length)} 켜짐</small>`;
    ul.innerHTML = L.items.map((x) => {
      const busy = starting.has(x.slot) && !x.on;
      const btn = x.startable ? `<button class="t-btn t-btn--2 llm-go" type="button" data-slot="${esc(x.slot)}"${x.on || busy ? ' disabled aria-disabled="true"' : ''} title="${x.on ? '켜져 있는 동안은 잠겨 있습니다' : busy ? '켜는 중' : '꺼져 있을 때만 켤 수 있습니다'}">${busy ? '켜는 중' : '켜기'}</button>` : '';
      return `<li data-slot="${esc(x.slot)}" data-on="${x.on ? 1 : 0}"><i class="dot${x.on ? ' dot--on' : ' dot--f'}"></i><span class="llm-t"><b>${esc(x.role)}</b><small>${esc(x.name)}</small></span><em>${x.on ? '켜짐' : '꺼짐'}${x.gpu ? ` · ${esc(x.gpu)}` : ''}</em>${btn}</li>`;
    }).join('');
    $('#llm-pr').textContent = L.promo;
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('.llm-go'); if (!b || b.disabled) return;
    const slot = b.dataset.slot;
    b.disabled = true;
    try {
      const r = await startLlm(slot);
      starting.add(slot); toast(r?.message || '켜기를 시작했습니다');
    } catch (err) {
      devlog('llm start', `${slot} · ${err.code || err.message}`);
      toast(err.message && !/^[a-z_]+$/.test(err.message) ? err.message : '지금은 켤 수 없습니다');
    }
    paintLlm();
  });
  /* 서버 다시 시작 — 두 번 눌러야 시작(4초 안). 게이트웨이만 다시 뜨고 작업기 · 언어 모델은 그대로. 새 기동 시각이 보이면 끝 */
  let armT = 0;
  const srv = $('#srv-go');
  srv.addEventListener('click', async () => {
    if (srv.disabled) return;
    if (!srv.dataset.arm) {
      srv.dataset.arm = '1'; srv.textContent = '한 번 더 누르면 시작';
      clearTimeout(armT); armT = setTimeout(() => { delete srv.dataset.arm; srv.textContent = '다시 시작'; }, 4000);
      return;
    }
    clearTimeout(armT); delete srv.dataset.arm;
    srv.disabled = true; srv.textContent = '다시 시작하는 중';
    const prev = S.health?.boot_at;
    try {
      const r = await restartServer();
      toast(r?.message || '서버를 다시 시작합니다');
      const h = await waitBoot(r?.boot_at || prev);
      toast(h ? '서버가 다시 시작됐습니다' : '서버 응답을 기다리는 중입니다. 잠시 뒤 새로 고치세요');
      paintRest();
    } catch (err) {
      devlog('server restart', err.code || err.message);
      toast(err.message && !/^[a-z_]+$/.test(err.message) ? err.message : '지금은 다시 시작할 수 없습니다');
    }
    srv.disabled = false; srv.textContent = '다시 시작';
  });
  /* 법령 색인 칸 — c2-report-law 의 mountLaw(host). 모듈이 아직 없으면 칸을 숨긴 채 둔다 */
  import('./law.js').then((m) => { const host = $('#law'); if (typeof m.mountLaw === 'function') { host.hidden = false; m.mountLaw(host); } })
    .catch((e) => devlog('법령 칸', `불러오기 전 · ${e.message || e}`));

  return { paintGpus, paintRest };
}
