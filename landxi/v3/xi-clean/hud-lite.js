/* hud-lite.js — 큰 숫자 하나(현장 확인 필요 n필지) · 라벨 하나 · 신뢰 기호 하나 · 규칙 막대 3.
   숫자는 서버 조회(GET /survey/findings)에서만. 값이 바뀔 때만 굴린다(750 · e-arrive). */
const $ = (id) => document.getElementById(id);
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const ease = (t) => 1 - Math.pow(1 - t, 4);

export function createHud({ onBar } = {}) {
  const big = $('big'), where = $('where'), trust = $('trust'), bars = $('bars'), prog = $('prog');
  const S = { v: null, raf: 0, bars: [] };

  function roll(to, ms = 750) {
    cancelAnimationFrame(S.raf);
    const from = S.v ?? 0;
    S.v = to;
    if (RM() || from === to) { big.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      big.textContent = fmt(Math.round(from + (to - from) * ease(t)));
      if (t < 1) S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }

  return {
    S,
    /** n = 필지 수 · exact = 전수(✓) / 표본 추정(~) · tip = 근거 한 줄(호버) */
    set(n, { exact = true, tip = '', ms } = {}) {
      roll(n, ms);
      trust.textContent = exact ? '✓' : '~';
      trust.dataset.k = exact ? 'ok' : 'est';
      trust.title = (exact ? '확인됨 · ' : '추정치 · ') + tip;
    },
    add(d) { roll((S.v ?? 0) + d, 110); },
    blank() { cancelAnimationFrame(S.raf); S.v = null; big.textContent = '—'; },
    where(t) { where.textContent = t || ''; },
    /** rows = [{key, label, n}] 큰 순 3 */
    bars(rows) {
      const top = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 3), max = Math.max(1, ...top.map((r) => r.n));
      const same = top.length === S.bars.length && top.every((r, i) => S.bars[i]?.key === r.key);
      if (!same) {
        bars.innerHTML = top.map((r) => `<li data-rule="${r.key}" title="이 규칙만 보기"><span>${r.label}</span><em></em><i></i></li>`).join('');
        bars.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => onBar?.(li.dataset.rule)));
      }
      S.bars = top;
      requestAnimationFrame(() => top.forEach((r, i) => { const li = bars.children[i]; if (!li) return; li.querySelector('em').textContent = fmt(r.n); li.querySelector('i').style.setProperty('--w', (r.n / max) * 100 + '%'); }));
    },
    progress(done, total) {
      if (done == null) { prog.hidden = true; return; }
      prog.hidden = false;
      $('prog-i').style.setProperty('--p', (done / Math.max(1, total)) * 100 + '%');
      $('prog-t').textContent = `대조 ${done} / ${total}`;
    },
  };
}
