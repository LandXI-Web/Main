/* 경보 스트립 — '경보 없음 · 마지막 점검 hh:mm:ss' 또는 열린 경보. 규칙 임계는 전부 [목표](config/alerts.yaml · 운영 2주 뒤 실측 분포로 조정). */
import { h, hhmmss, setText, goal } from './boot.js';

const RULE_KO = {
  gpu_temp_gt_85_5m: 'GPU 온도 > 85°C 5분', vram_gt_95_5m: 'VRAM > 95% 5분', worker_heartbeat_miss_30s: '워커 하트비트 30s 누락',
  queue_p95_gt_600s: '큐 대기 p95 > 10분', disk_e_free_lt_200gb: 'E: 여유 < 200GB', vworld_calls_day_80pct: 'V-World 일일 80%',
  gpu_power_concurrency: '동시 고부하 GPU > 1(전력 규칙)',
};
export const ruleKo = (r) => RULE_KO[r] || r;

export function alertStrip(host, { compact = false } = {}) {
  const dot = h('i', { class: 'al-dot' }); const txt = h('span', { class: 'og-num' }); const when = h('span', { class: 'og-num', 'data-k': 'last-check' });
  const rules = h('span', { class: 'al-rules' });
  const box = h('div', { class: 'og-alerts', 'data-level': 'ok', role: 'status', 'aria-live': 'polite' }, dot, txt, h('span', { class: 'og-lbl' }, '마지막 점검'), when, compact ? null : rules);
  host.append(box);
  let open = [];
  const render = () => {
    const lvl = open.some((a) => a.level === 'fault') ? 'fault' : open.length ? 'caution' : 'ok';
    box.dataset.level = lvl;
    setText(txt, open.length ? open.map((a) => `${ruleKo(a.rule)}${a.gpu != null ? ' · GPU' + a.gpu : ''}`).join(' · ') : '경보 없음');
    txt.className = 'og-num' + (lvl === 'fault' ? ' og-fault' : lvl === 'caution' ? ' og-caution' : '');
  };
  return {
    el: box,
    load(j) {
      open = (j?.items || []).filter((a) => !a.closed_at);
      if (!compact && j?.rules) rules.replaceChildren(...j.rules.slice(0, 4).map((r) => h('span', { class: 'og-tag', 'data-dashed': '' }, ruleKo(r.rule), ' ', goal())));
      if (j?.last_check) setText(when, hhmmss(j.last_check));
      render();
    },
    event(a) { open = open.filter((x) => x.id !== a.id); if (!a.closed_at) open.push(a); render(); },
    checked(iso) { setText(when, hhmmss(iso)); },
  };
}
