/* hud.js — 우상 HUD(≤ 420 유리) + 124px 숫자(영상 위 흰 잉크 · Vantor 7.75×) + 해설 줄 + 프로비넌스.
   HUD 숫자는 봉투에서만(prov 강제). 작업(job) 줄은 job.progress 로만 갱신(설계서 §3.3 · 계약 §5.1). */
import { digits } from '../fx/arrive.js';
import { prov, numHtml, void_ } from '../fx/provenance.js';
import { textIn, D, EASE } from '../fx/glass.js';
import { assertEnvelope, fmt, env } from '../../shared/api-v1.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function createHud() {
  const el = { root: $('hud'), chip: $('hud-chip'), z: $('hud-z'), scene: $('hud-scene'), title: $('hud-title'), status: $('hud-status'), big: $('hud-big'), unit: $('hud-unit'),
    note: $('hud-note'), prov: $('hud-prov'), job: $('hud-job'), tier: $('hud-tier'), live: $('hud-live'), bot: $('hud-bot') };
  let chipKey = '', lastCount = null, lastHead = {}, lastDet = null;
  /* 작업 창 GPU 표본(job.started→done) — job.done 뒤 순간값 대신 창 집계를 쓴다(F2 통합 · F2-A/F2-B must_fix) */
  let gwin = [];
  const H = {
    el,
    /** 출처 칩 — 층이 바뀔 때만 다시 쓴다(유휴 모션 0). 기록은 테스트용. */
    chips: [],
    chip(text, item) {
      if (text === chipKey) return;
      chipKey = text;
      el.chip.innerHTML = `<b>출처</b> ${text.replace(/[<>&]/g, '')}`;
      el.chip.dataset.src = item?.id || '';
      H.chips.push({ t: Math.round(performance.now()), text, id: item?.id || null });
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) el.chip.animate([{ backgroundSize: '0% 1px' }, { backgroundSize: '100% 1px' }], { duration: D.d180, easing: EASE.ui });   // 밑줄 스윕 180
    },
    zoom(z, c) { el.z.textContent = `z${z.toFixed(1)} · ${c[1].toFixed(4)}N ${c[0].toFixed(4)}E`; },
    status(text, state = '') { el.status.textContent = text; el.status.dataset.state = state; el.live.dataset.on = state === 'live' ? '1' : '0'; },
    pending(head = {}) {
      el.scene.textContent = head.scene || '불러오는 중';
      el.title.textContent = head.title || '';
      H.status(head.pending || '결과 불러오는 중', 'pending');
      el.big.textContent = ''; el.big.removeAttribute('data-basis'); el.unit.textContent = '';
      el.note.innerHTML = ''; el.prov.innerHTML = ''; el.bot.hidden = true;
    },
    /** 도착의 마지막 단계: 124px 숫자 글자별 40 + 해설 줄 텍스트 인 60 스태거 + 봉투 칩 */
    async count(e, head = {}, note = [], { waitNote = true } = {}) {
      assertEnvelope(e, 'HUD 숫자');
      lastCount = e;
      el.scene.textContent = head.scene || el.scene.textContent;
      el.title.textContent = head.title || el.title.textContent;
      el.unit.textContent = head.unit || e.unit;
      el.big.dataset.basis = e.basis;
      H.status(head.done || '분석 완료', 'live');
      el.bot.hidden = false;
      el.note.innerHTML = note.map((s) => `<span class="seg">${s}</span>`).join('');
      el.prov.innerHTML = ''; const p = document.createElement('span'); el.prov.appendChild(p); prov(p, e, { label: head.provLabel || '', tagText: head.provTag || '' }); lastHead = head;
      const tn = textIn(el.note); await digits(el.big, fmt(e)); if (waitNote) await tn;
    },
    /** 숫자만 제자리 교체(텍스트 인 없음 — 시점 스크럽처럼 자주 바뀌는 값) */
    set(e, head = {}, note = null) {
      assertEnvelope(e, 'HUD 숫자');
      el.big.textContent = fmt(e); el.big.dataset.basis = e.basis; el.big.setAttribute('aria-label', fmt(e));
      if (head.unit) el.unit.textContent = head.unit;
      if (head.scene) el.scene.textContent = head.scene;
      if (head.title) el.title.textContent = head.title;
      if (note) el.note.innerHTML = note.map((s) => `<span class="seg">${s}</span>`).join('');
      el.bot.hidden = false;
      el.prov.innerHTML = ''; const p = document.createElement('span'); el.prov.appendChild(p); prov(p, e, { label: head.provLabel || '', tagText: head.provTag || '' });
    },
    restore() { if (lastCount) H.set(lastCount, lastHead); },
    /** 작업 줄 — job.progress 봉투만. live=true(on · SSE)면 [실측·지금], replay 면 [시연].
        v1.1-5: chips_per_s 는 계량 창 ≥ 1 s 이고 완료 shard ≥ 8 일 때만 값 — 그 전엔 '칩/s — · 창 짧음'(창 하한 0.5 s 인공값 n/0.5 금지).
        v1.1-7: GPU 는 카드 전체 이용률(공유 · 최근 5표본 이동평균 util_ma5 우선) + 전력 W. '이 작업' 몫은 job.done 의 두 줄(jobFinal). */
    job(d, { live }) {
      el.job.hidden = false;
      const B = live ? 'measured' : 'demo';
      const shards = env(d.shards_done, 'count', B, 'job.progress', `${d.shards_done}/${d.shards_total}`);
      const total = Object.values(d.counts || {}).reduce((a, b) => a + b, 0);
      const det = env(total, 'count', live ? 'inferred' : 'demo', 'job.progress.counts');
      const c = d.chips_per_s && typeof d.chips_per_s === 'object' ? d.chips_per_s : null;
      const cpsOk = c && c.value != null && (d.shards_done ?? 0) >= 8 && (d.elapsed_s == null || d.elapsed_s >= 1);
      const cps = cpsOk ? `${numHtml({ ...c, basis: live ? c.basis : 'demo' }, { unit: false, digits: 1 })}칩/s` : '<i class="xi-cps" title="v1.1-5 · 계량 창 ≥ 1 s 이고 완료 shard ≥ 8 일 때만 처리량을 쓴다(창 하한 0.5 s 인공값 금지)">칩/s — · 창 짧음</i>';
      const g0 = (d.gpu || [])[0];
      const util = g0 ? (g0.util_ma5 ?? g0.util_pct) : null;
      const pw = g0 && g0.power_w != null ? (typeof g0.power_w === 'object' ? g0.power_w : env(g0.power_w, 'W', B, 'job.progress.gpu.power_w · nvidia-smi power.draw')) : null;
      const gpu = util != null ? `<span class="xi-gpuu" title="nvidia-smi utilization.gpu${g0.util_ma5 != null ? ' · 최근 5표본 이동평균' : ''} · 카드 전체 · 같은 카드의 다른 작업 포함">GPU${g0.index ?? 0} 이용률(공유) ${numHtml(typeof util === 'object' ? util : env(util, '%', B, 'job.progress.gpu · nvidia-smi · 카드 전체'), { unit: false })}%${pw ? ` · ${numHtml(pw, { unit: false, digits: 0 })} W` : ''}</span>` : 'GPU 이용률 —';
      if (g0 && util != null) { const u = typeof util === 'object' ? util.value : util, w = pw ? (typeof pw === 'object' ? pw.value : pw) : null; if (u != null) gwin.push({ t: Date.now(), u: +u, w: w != null ? +w : null, i: g0.index ?? 0 }); }
      const pg = d.power_gate && d.power_gate.waiting ? `<span class="xi-gate" title="job.progress.power_gate · 전력 규칙(두 장 동시 고부하 금지)">${esc(d.power_gate.reason || '전력 규칙 · 대기')} · ${d.power_gate.waited_s ?? 0}s</span>` : '';
      lastDet = det;
      el.job.innerHTML = `<b>${live ? '실측 · 지금' : '예시 · 저장 결과 재생'}</b><span class="xi-det">탐지 ${numHtml(det, { unit: false })}</span><span>shard ${numHtml(shards, { unit: false })}/${d.shards_total}</span><span class="xi-gpul">${gpu}</span><span class="xi-cpsl">${cps}</span>${pg}`;
      el.job.dataset.live = live ? '1' : '0';
      H.lastProgress = d;
    },
    /** job.done 뒤: ① 'shard 합 → 전역 NMS 후' ② 두 줄 실측(v1.1-6) — 'GPU 초당 n.n칩 · 벽시계 n.n칩/s' / '이 작업 x.xx GPU·s · y.y s'.
        서버가 chips_per_gpu_s · chips_per_wall_s 를 주면 그 봉투, 없으면 shards ÷ gpu_s · shards ÷ elapsed_s 를 프론트가 계산(source '프론트 계산'). */
    jobFinal(fin, { shardSum = null, shardsDone = null, shardsTotal = null, live = false, gpuS = null, elapsedS = null, perGpu = null, perWall = null, via = 'job.done' } = {}) {
      assertEnvelope(fin, 'job.done');
      const B = live ? 'measured' : 'demo';
      const n = shardsTotal ?? shardsDone;
      const gs = gpuS && typeof gpuS === 'object' && 'basis' in gpuS ? gpuS : gpuS != null ? env(+gpuS, 'gpu_s', B, via + '.gpu_s') : null;
      const es = elapsedS && typeof elapsedS === 'object' ? elapsedS : elapsedS != null ? env(+elapsedS, 's', B, via + '.elapsed_s', '제출 → 전역 NMS 완료') : null;
      const pg = perGpu && typeof perGpu === 'object' && perGpu.value != null ? perGpu : perGpu != null && typeof perGpu !== 'object' ? env(+perGpu, 'chips_per_gpu_s', B, via + '.chips_per_gpu_s')
        : gs?.value ? env(+(n / gs.value).toFixed(1), 'chips_per_gpu_s', gs.basis === 'demo' ? 'demo' : B, '프론트 계산 · shards ÷ gpu_s', `${n} ÷ ${gs.value}`) : null;
      const pw = perWall && typeof perWall === 'object' && perWall.value != null ? perWall : perWall != null && typeof perWall !== 'object' ? env(+perWall, 'chips_per_wall_s', B, via + '.chips_per_wall_s')
        : es?.value ? env(+(n / es.value).toFixed(1), 'chips_per_wall_s', B, '프론트 계산 · shards ÷ elapsed_s', `${n} ÷ ${es.value}`) : null;
      el.job.querySelectorAll('.xi-own, .xi-cpsl').forEach((x) => x.remove());
      const l1 = document.createElement('span'); l1.className = 'xi-own xi-own1';
      l1.innerHTML = `GPU 초당 ${pg ? numHtml(pg, { unit: false, digits: 1 }) : `<i>—${gs && gs.value == null ? ' · ' + esc(gs.note || '계량 없음') : ''}</i>`}칩 · 벽시계 ${pw ? numHtml(pw, { unit: false, digits: 1 }) : '<i>—</i>'}칩/s`;
      const l2 = document.createElement('span'); l2.className = 'xi-own xi-own2';
      l2.innerHTML = `이 작업 ${gs && gs.value != null ? numHtml(gs, { unit: false, digits: 2 }) : '<i>—</i>'} GPU·s · ${es && es.value != null ? numHtml(es, { unit: false, digits: 1 }) : '<i>—</i>'} s`;
      l1.title = `${pg?.source || ''} · ${pw?.source || ''}`; l2.title = `${gs?.source || ''} · ${es?.source || ''}${es?.note ? ' · ' + es.note : ''}`;
      l1.dataset.basis = pg?.basis || 'demo'; l2.dataset.basis = gs?.basis || 'demo';
      el.job.appendChild(l1); el.job.appendChild(l2);
      el.job.querySelectorAll('.xi-gate').forEach((x) => x.remove());
      // GPU 줄: 끝난 뒤 nvidia-smi 순간값(유휴 0 % · 18 W)은 '안 썼다'로 읽힌다 → 작업 창 안 job.progress.gpu 표본의 최대 · 평균(프론트 집계)
      const gl = el.job.querySelector('.xi-gpul');
      if (gl) {
        const n0 = gwin.length;
        if (n0) {
          const umax = Math.max(...gwin.map((x) => x.u)), umean = gwin.reduce((a, x) => a + x.u, 0) / n0;
          const ws = gwin.map((x) => x.w).filter((x) => x != null), wmax = ws.length ? Math.max(...ws) : null;
          const last = new Date(gwin[n0 - 1].t).toLocaleTimeString('en-GB', { hour12: false });
          const src = `프론트 집계 · job.progress.gpu ${n0}표본(작업 창 job.started→done) · nvidia-smi 5표본 이동평균 · 카드 전체(공유)`;
          const eU = env(+umax.toFixed(1), '%', B, src, `평균 ${umean.toFixed(1)} % · 마지막 표본 ${last}`);
          const eW = wmax != null ? env(Math.round(wmax), 'W', B, src + ' · power.draw 최대') : null;
          gl.innerHTML = `<span class="xi-gpuu" data-agg="window" title="${esc(src)} · 평균 ${umean.toFixed(1)} % · 마지막 표본 ${last}">작업 중 GPU${gwin[n0 - 1].i} 최대 ${numHtml(eU, { unit: false })}%${eW ? ` · ${numHtml(eW, { unit: false, digits: 0 })} W` : ''} · 표본 ${n0} · 마지막 ${last}</span>`;
        } else {
          gl.innerHTML = `<span class="xi-gpuu" data-agg="none"><i>이용률 · 표본 없음(${es && es.value != null && es.value < 1.5 ? '작업 < 1 s' : '작업 창 표본 0'})</i></span>`;
        }
      }
      H.perf = { per_gpu_s: pg, per_wall_s: pw, gpu_s: gs, elapsed_s: es, shards: n };
      const s = el.job.querySelector('.xi-det'); if (!s) return;
      const det = shardSum != null ? env(shardSum, 'count', live ? 'inferred' : 'demo', 'shard.done n 합', '전역 NMS 전') : lastDet; if (!det) return;
      const same = det.value === fin.value;
      s.innerHTML = same ? `shard 합 ${numHtml(det, { unit: false })} = 최종 ${numHtml(fin, { unit: false })}`
        : `shard 합 ${numHtml(det, { unit: false })} → 전역 NMS 후 ${numHtml(fin, { unit: false })}`;
      s.title = same ? 'shard 경계 중복 없음' : 'shard 경계에 걸친 중복 탐지를 서버 전역 NMS 가 합쳤다(job.done counts_env)';
      const sh = [...el.job.querySelectorAll('span')].find((x) => /^shard \d/.test(x.textContent));
      if (sh && shardsDone != null) sh.innerHTML = `shard ${numHtml(env(shardsDone, 'count', B, 'shard.done', `${shardsDone}/${shardsTotal}`), { unit: false })}/${shardsTotal}`;
    },
    /** 대조 작업 줄(실태조사) — shard.done(읍면동) 합만 · 봉투 */
    surveyJob({ done, total, parcels, findings = null, basis = 'demo', name = '', ms = null, final = null }) {
      el.job.hidden = false;
      const src = basis === 'measured' ? 'kind:survey shard.done' : basis === 'recorded' ? '대조 녹음 재생 · 02. 데이터/survey/replay' : '합성 리플레이 · findings-emd.json';
      const head = basis === 'measured' ? '실측 · 대조' : basis === 'recorded' ? '기록 · 대조 재생' : '시연 · 대조 재생';
      let tail = name ? `<span>${esc(name)}${ms != null ? ` · ${numHtml(env(ms, 'ms', basis, src, '이 읍면동 규칙 재평가'), { unit: false })}ms` : ''}</span>` : '';
      if (final) {
        const es = final.elapsed_s != null ? (typeof final.elapsed_s === 'object' ? final.elapsed_s : env(final.elapsed_s, 's', basis, src + ' · job.done.elapsed_s')) : null;
        const pw = final.chips_per_wall_s && typeof final.chips_per_wall_s === 'object' && final.chips_per_wall_s.value != null ? { ...final.chips_per_wall_s, basis: basis === 'measured' ? final.chips_per_wall_s.basis : basis } : null;
        tail = `<span class="xi-own xi-own1">대조 ${es ? numHtml(es, { unit: false, digits: 1 }) : '—'} s · 벽시계 ${pw ? numHtml(pw, { unit: false, digits: 1 }) : '—'}칸/s · CPU(GPU 0)</span>`;
      }
      el.job.innerHTML = `<b>${head}</b><span>읍면동 ${numHtml(env(done, 'count', basis, src, `${done}/${total}`), { unit: false })}/${total}</span><span>의심 ${numHtml(env(parcels, '필지', basis === 'measured' ? 'inferred' : basis, src), { unit: false })}필지</span>${findings != null ? `<span>${numHtml(env(findings, 'count', basis === 'measured' ? 'inferred' : basis, src, '규칙별 1행'), { unit: false })}건</span>` : ''}${tail}`;
      el.job.dataset.live = basis === 'measured' ? '1' : '0';
    },
    /** 버전 이력 칩(배포본 · 버전 · 모델) — GET /deploys + tenant 스트림 deploy.changed(실시간) · 없으면 폴링 */
    lineage(o) {
      const L = $('hud-lin'); if (!L) return;
      if (!o) { L.hidden = true; return; }
      L.hidden = false;
      L.innerHTML = `<b>배포본</b><span class="d">${esc(o.deploy_id)}</span><span class="v" data-basis="${esc(o.basis || 'measured')}">${esc(o.version)}</span><span class="m" title="${esc(o.model || '')}">${esc(o.model || '모델 —')}</span><i>${esc(o.via)}</i>${o.card_id ? `<a class="c" href="../proto/ai-card.html?card=${encodeURIComponent(o.card_id)}&version=${encodeURIComponent(o.version || '')}" title="AI 카드 · 이 배포본의 모델 버전 이력(같은 버전 강조)">카드 ↗</a>` : ''}`;
      L.title = `${o.source || ''}${o.changed_at ? ' · 갱신 ' + o.changed_at : ''}`;
      L.dataset.version = o.version; L.dataset.via = o.via;
      if (o.flash && !matchMedia('(prefers-reduced-motion: reduce)').matches) L.querySelector('.v').animate([{ backgroundSize: '0% 1px' }, { backgroundSize: '100% 1px' }], { duration: D.d380, easing: EASE.ui });
    },
    /** 작업 줄 뒤에 상태 꼬리표 하나(병합 대기 · 재접속 등) — 숫자는 건드리지 않는다 */
    jobNote(text) { let n = el.job.querySelector('.xi-jobnote'); if (!text) { n && n.remove(); return; } if (!n) { n = document.createElement('span'); n.className = 'xi-jobnote'; el.job.appendChild(n); } n.textContent = text; },
    jobState(text, { live = null } = {}) { gwin = []; el.job.hidden = false; el.job.innerHTML = `<b>${live === true ? '실측 · 지금' : live === false ? '시연' : '작업'}</b><span>${text}</span>`; if (live != null) el.job.dataset.live = live ? '1' : '0'; },
    jobClear() { gwin = []; el.job.hidden = true; el.job.innerHTML = ''; },
    tier(t) {
      el.tier.innerHTML = `<span class="xi-tierv">${t.tier} · p95 ${numHtml(t.env, { digits: 1 })} <b data-basis="measured">실측</b></span>`;
      el.tier.dataset.tier = t.tier; el.tier.dataset.why = t.why || '';
      el.tier.title = `최근 60프레임 p95 · 판정 창 ${(t.windows || []).map((w) => `${w.at} ${w.p95.toFixed(1)} ms`).join(' · ')}${t.boot ? ` · 부팅 계측 ${t.boot.p95.toFixed(1)} ms(글로브·타일 적재 중 · 판정 제외)` : ''} · ${t.env.note || ''}`;
    },
    /** 판정 전(부팅 창) — 숫자 없이 '부팅 계측' 꼬리표 */
    tierPending() { el.tier.innerHTML = '<span class="xi-tierv">티어 · 부팅 계측 중</span>'; el.tier.dataset.tier = ''; el.tier.title = '첫 60프레임은 부팅 계측(판정 제외) · 첫 idle 뒤 60프레임으로 판정'; },
    voidNote(text) { el.bot.hidden = false; el.note.innerHTML = ''; void_(el.note.appendChild(document.createElement('span')), text); },
  };
  return H;
}
