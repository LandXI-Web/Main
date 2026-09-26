/* hud.js — 우상 HUD(≤ 420 유리) + 124px 숫자(영상 위 흰 잉크 · Vantor 7.75×) + 해설 줄 + 프로비넌스.
   HUD 숫자는 봉투에서만(prov 강제). 작업(job) 줄은 job.progress 로만 갱신(설계서 §3.3 · 계약 §5.1). */
import { digits } from '../fx/arrive.js';
import { prov, numHtml, void_ } from '../fx/provenance.js';
import { textIn, D, EASE } from '../fx/glass.js';
import { assertEnvelope, fmt, env } from '../../shared/api-v1.js';

const $ = (id) => document.getElementById(id);
export function createHud() {
  const el = { root: $('hud'), chip: $('hud-chip'), z: $('hud-z'), scene: $('hud-scene'), title: $('hud-title'), status: $('hud-status'), big: $('hud-big'), unit: $('hud-unit'),
    note: $('hud-note'), prov: $('hud-prov'), job: $('hud-job'), tier: $('hud-tier'), live: $('hud-live'), bot: $('hud-bot') };
  let chipKey = '', lastCount = null, lastHead = {}, lastDet = null;
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
      el.scene.textContent = head.scene || '도착';
      el.title.textContent = head.title || '';
      H.status(head.pending || '결과 도착 중', 'pending');
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
      H.status(head.done || '도착', 'live');
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
    /** 작업 줄 — job.progress 봉투만. live=true(on · SSE)면 [실측·지금], replay 면 [시연]. */
    job(d, { live }) {
      el.job.hidden = false;
      const shards = env(d.shards_done, 'count', live ? 'measured' : 'demo', 'job.progress', `${d.shards_done}/${d.shards_total}`);
      const total = Object.values(d.counts || {}).reduce((a, b) => a + b, 0);
      const det = env(total, 'count', live ? 'inferred' : 'demo', 'job.progress.counts');
      const cps = d.chips_per_s && typeof d.chips_per_s === 'object' ? { ...d.chips_per_s, basis: live ? d.chips_per_s.basis : 'demo' } : env(null, 'chips_per_s', live ? 'measured' : 'demo', 'job.progress', '첫 shard 뒤 채워짐');
      const g0 = (d.gpu || [])[0];
      // GPU 이용률은 그 카드 전체(nvidia-smi) — 같은 카드에서 도는 다른 작업 몫이 섞인다(2차 판정 'GPU 수치 귀속'). '이 작업' 몫은 job.done 의 gpu_s 로(jobFinal).
      const gpu = g0 && g0.util_pct != null ? `<span title="nvidia-smi utilization.gpu · 같은 카드의 다른 작업 포함">GPU${g0.index ?? 0} 이용률(공유) ${numHtml(env(g0.util_pct, '%', live ? 'measured' : 'demo', 'job.progress.gpu · nvidia-smi · 카드 전체'), { unit: false })}%</span>` : 'GPU 이용률 —';
      lastDet = det;
      el.job.innerHTML = `<b>${live ? '실측 · 지금' : '시연 · 저장 결과 재생'}</b><span class="xi-det">탐지 ${numHtml(det, { unit: false })}</span><span>shard ${numHtml(shards, { unit: false })}/${d.shards_total}</span><span>${gpu}</span><span>${numHtml(cps, { unit: false, digits: cps.value == null ? 0 : 1 })}칩/s</span>`;
      el.job.dataset.live = live ? '1' : '0';
    },
    /** job.done 뒤: 작업 줄의 '탐지 n'(shard 합 · 전역 NMS 전)과 큰 숫자(job.done counts_env · 전역 NMS 후)의 관계를 한 줄로 */
    jobFinal(fin, { shardSum = null, shardsDone = null, shardsTotal = null, live = false, gpuS = null, elapsedS = null } = {}) {
      assertEnvelope(fin, 'job.done');
      // 이 작업의 몫: gpu_s(usage_events · 이 작업 shard 들의 wall_s × gpus) + 제출→완료 elapsed_s — 공유 이용률 % 대신 이 작업의 실측
      if (gpuS && typeof gpuS === 'object' && 'basis' in gpuS) {
        let own = el.job.querySelector('.xi-own'); if (!own) { own = document.createElement('span'); own.className = 'xi-own'; el.job.appendChild(own); }
        const el2 = elapsedS != null ? env(+elapsedS, 's', live ? 'measured' : 'demo', 'job.done.elapsed_s', '제출 → 전역 NMS 완료') : null;
        own.innerHTML = `이 작업 ${gpuS.value == null ? `GPU·s <i>${gpuS.note || '계량 없음'}</i>` : `${numHtml(gpuS, { unit: false, digits: 2 })} GPU·s`}${el2 ? ` · ${numHtml(el2, { unit: false, digits: 1 })} s` : ''}`;
        own.title = `${gpuS.source || ''}${gpuS.note ? ' · ' + gpuS.note : ''}`;
        own.dataset.basis = gpuS.basis;
      }
      const s = el.job.querySelector('.xi-det'); if (!s) return;
      // shard 합은 shard.done 이벤트의 n 을 더한 값(job.progress 가 성기게 와도 정확) — 없으면 마지막 progress 값
      const det = shardSum != null ? env(shardSum, 'count', live ? 'inferred' : 'demo', 'shard.done n 합', '전역 NMS 전') : lastDet; if (!det) return;
      const same = det.value === fin.value;
      s.innerHTML = same ? `shard 합 ${numHtml(det, { unit: false })} = 최종 ${numHtml(fin, { unit: false })}`
        : `shard 합 ${numHtml(det, { unit: false })} → 전역 NMS 후 ${numHtml(fin, { unit: false })}`;
      s.title = same ? 'shard 경계 중복 없음' : 'shard 경계에 걸친 중복 탐지를 서버 전역 NMS 가 합쳤다(job.done counts_env)';
      // shard 칸 수도 done 기준으로(마지막 progress 가 done 보다 늦게/빠지는 경우)
      const sh = [...el.job.querySelectorAll('span')].find((x) => /^shard \d/.test(x.textContent));
      if (sh && shardsDone != null) sh.innerHTML = `shard ${numHtml(env(shardsDone, 'count', live ? 'measured' : 'demo', 'shard.done', `${shardsDone}/${shardsTotal}`), { unit: false })}/${shardsTotal}`;
    },
    /** 작업 줄 뒤에 상태 꼬리표 하나(병합 대기 · 재접속 등) — 숫자는 건드리지 않는다 */
    jobNote(text) { let n = el.job.querySelector('.xi-jobnote'); if (!text) { n && n.remove(); return; } if (!n) { n = document.createElement('span'); n.className = 'xi-jobnote'; el.job.appendChild(n); } n.textContent = text; },
    jobState(text, { live = null } = {}) { el.job.hidden = false; el.job.innerHTML = `<b>${live === true ? '실측 · 지금' : live === false ? '시연' : '작업'}</b><span>${text}</span>`; if (live != null) el.job.dataset.live = live ? '1' : '0'; },
    jobClear() { el.job.hidden = true; el.job.innerHTML = ''; },
    tier(t) {
      el.tier.innerHTML = `<span class="xi-tierv">${t.tier} · p95 ${numHtml(t.env, { digits: 1 })} <b data-basis="measured">실측</b></span>`;
      el.tier.dataset.tier = t.tier; el.tier.title = t.env.note || '';
    },
    voidNote(text) { el.bot.hidden = false; el.note.innerHTML = ''; void_(el.note.appendChild(document.createElement('span')), text); },
  };
  return H;
}
