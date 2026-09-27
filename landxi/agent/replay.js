/* replay.js — LX_API=off · llm_unavailable 때 '실제 run 녹음'(server/agent/record.py 가 Redis 스트림에서 뽑은 ndjson)을 같은 이벤트로 재생.
   한 줄 = { t(ms · 녹음 시각 차), event, data } · 첫 줄 replay.meta. 확인 카드(agent.confirm)에서 멈추고 사람의 결정을 기다린다(시연 · 제출 0).
   마스트 표기: '기록 · 저장 결과 재생' + 이유('시연 · 에이전트 연결 없음'). */

export const RECORDINGS = [
  { url: '/landxi/agent/data/replay/ag0-namwon.ndjson', match: /의심|필지|상위|보여|답|건물/, kind: 'map' },
  { url: '/landxi/agent/data/replay/ag0-verify.ndjson', match: /몇\s*건|대략|맞지|만\s*건|전체/, kind: 'map' },
  { url: '/landxi/agent/data/replay/ag0-frame.ndjson', match: /프레임|비닐하우스|분석해/, kind: 'map' },
  { url: '/landxi/agent/data/replay/ag0-report.ndjson', match: /보고서|초안/, kind: 'report' },
];

/** 녹음 시각 꼬리표 — 리플레이 이벤트의 ms·tok/s 는 '실측'이 아니라 '기록'(그 run 을 녹음한 시각). '실측'은 이 세션에서 잰 값에만. */
export function recAt(iso, short = false) {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(+t)) return '기록';
  const p2 = (n) => String(n).padStart(2, '0');
  const hm = `${p2(t.getHours())}:${p2(t.getMinutes())}`;
  return short ? `기록 ${hm}` : `기록 · ${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${hm} 녹음`;
}

export function pick(message, kind = 'map') {
  const cands = RECORDINGS.filter((r) => r.kind === kind);
  return (cands.find((r) => r.match.test(message || '')) || cands[0]).url;
}

export async function load(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.text()).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }
}

/** play(lines, on, {speed}) → { close(), resume(), meta, done:Promise } */
export function play(lines, on, { speed = 1 } = {}) {
  const meta = lines.find((l) => l.event === 'replay.meta')?.data || {};
  const evs = lines.filter((l) => l.event !== 'replay.meta');
  let idx = 0, closed = false, timer = null, base = performance.now(), offset = 0, waiting = false, resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const step = () => {
    if (closed) return;
    while (idx < evs.length) {
      const ln = evs[idx];
      const due = base + (ln.t - offset) / speed;
      const now = performance.now();
      if (due > now + 4) { timer = setTimeout(step, Math.min(250, due - now)); return; }
      idx++;
      on(ln.event, { ...ln.data, replay: true, recorded_at: meta.recorded_at || null });
      if (ln.event === 'agent.confirm') { waiting = true; offset = ln.t; return; }     // 사람 결정까지 멈춤
      if (['agent.done', 'agent.failed', 'agent.rejected'].includes(ln.event)) { resolveDone(); return; }
    }
    resolveDone();
  };
  timer = setTimeout(step, 0);
  return {
    meta, done,
    close() { closed = true; clearTimeout(timer); resolveDone(); },
    /** 확인 카드 결정 뒤 재개 — 녹음 쪽 결정과 다르면(거부 등) 녹음의 결과 대신 '실행하지 않음'으로 끝낸다 */
    resume(decision) {
      if (!waiting) return; waiting = false;
      const next = evs[idx];
      if (decision !== 'approve' || (next && next.event === 'agent.confirm.decided' && next.data?.decision !== 'approve')) {
        on('agent.confirm.decided', { decision, replay: true, recorded_at: meta.recorded_at || null });
        on('agent.done', { replay: true, recorded_at: meta.recorded_at || null, answer_md: '확인 카드에서 실행하지 않았습니다(시연 · 저장 결과 재생 · 제출 0).', envelopes: {}, env_meta: {}, unverified: [], citations: [], tokens: null, model: meta.model || null });
        resolveDone(); return;
      }
      base = performance.now(); offset = evs[idx - 1]?.t || offset; step();
    },
  };
}
