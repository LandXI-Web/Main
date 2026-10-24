/* 글자 잘림 검사(10-24 원칙 330 · 규칙 9 — "분석 서비스 카드 '모델 갱신 2026.10.1…' 이 카드 끝에서 잘렸다 … 여러번 지적했는데 왜 계속 잊어버리지?")
   겹침 검사(overlap.mjs)가 잡지 못한 '글자가 상자 밖으로 나가거나 잘림'을 잰다. 브라우저 안에서 도는 식(CLIP) — measureState 의 extra 로 돌린다.
   보이는 글자 마디마다 그 글자 줄의 상자를 재어:
     clip     — 글자가 overflow hidden/clip 인 윗대 상자 밖으로 일부 나가 잘림(스크롤 상자 · 통째로 밖인 것(캐러셀)은 제외)
     cut      — 요소 scrollWidth > clientWidth+1 인데 overflow hidden 이고 말줄임(…)이 아님
     box      — 글자가 자기 카드(배경 · 테두리 · 그림자가 있는 가장 가까운 윗대)를 2px 넘게 벗어남
     page     — 글자가 화면 가로를 벗어남(스크롤 상자 안은 제외)
     ellipsis — 말줄임으로 실제 잘렸는데 title 도 없음(경고)
     orphan   — 제목 · 이름표가 줄바꿈되어 마지막 줄에 낱말 하나만 남음(경고)
   결과: { hard[], warn[] } — 각 {kind, sel, text, detail}. hard 가 하나라도 있으면 실패. 일부러 자르는 상자는 data-clip-ok 로 표시. */
export const CLIP = `(() => {
  const vw = innerWidth, DW = document.documentElement.scrollWidth, DH = document.documentElement.scrollHeight;
  const hard = [], warn = [], seen = new Set();
  const cs = (e) => getComputedStyle(e);
  const sel = (e) => { const p = []; for (let n = e, i = 0; n && n.nodeType === 1 && n !== document.body && i < 4; n = n.parentElement, i++) p.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + [...n.classList].slice(0, 2).map((c) => '.' + c).join('')); return p.join(' > '); };
  const surface = (s) => { const a = /rgba?\\(([^)]*)\\)/.exec(s.backgroundColor); const p = a ? a[1].split(/[ ,\\/]+/) : []; const alpha = p.length > 3 ? parseFloat(p[3]) : (a ? 1 : 0);
    return alpha > 0.05 || s.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some((d) => parseFloat(s['border' + d + 'Width']) > 0 && s['border' + d + 'Style'] !== 'none') || s.boxShadow !== 'none'; };
  const visible = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = cs(n); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0 || n.hidden) return false; if (n.tagName === 'DETAILS' && !n.open && !e.closest('summary')) return false; } return true; };
  const skipTag = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'TEXTAREA', 'OPTION']);
  const add = (list, kind, e, text, detail) => { const k = kind + '|' + sel(e) + '|' + text; if (seen.has(k)) return; seen.add(k); list.push({ kind, sel: sel(e), text: text.slice(0, 40), detail }); };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n, count = 0;
  const r = document.createRange();
  while ((n = w.nextNode())) {
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim();
    if (!t) continue;
    const e = n.parentElement;
    if (!e || skipTag.has(e.tagName.toUpperCase()) || e.closest('svg,canvas,.maplibregl-map,[data-clip-ok]')) continue;
    if (!visible(e)) continue;
    r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
    if (!rects.length) continue;
    const tr = { l: Math.min(...rects.map((q) => q.left)), r: Math.max(...rects.map((q) => q.right)), t: Math.min(...rects.map((q) => q.top)), b: Math.max(...rects.map((q) => q.bottom)) };
    if (tr.r < 0 || tr.b < 0 || tr.l > DW || tr.t > DH) continue;
    count++;
    if (cs(e).textOverflow === 'ellipsis' && /hidden|clip/.test(cs(e).overflowX) && e.scrollWidth > e.clientWidth + 1) { if (!e.title && !e.closest('[title]')) add(warn, 'ellipsis', e, t, '말줄임인데 title 없음'); continue; }   // 말줄임은 일부러 자른 것
    const se = cs(e);
    let scroller = null;
    for (let a = e; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
      const s = cs(a);
      if (/auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY)) { scroller = a; break; }   // 스크롤 상자 안에서 밀려 보이는 글자는 그 위 상자가 자르는 게 아니다
      const clipX = s.overflowX === 'hidden' || s.overflowX === 'clip', clipY = s.overflowY === 'hidden' || s.overflowY === 'clip';
      if (!(clipX || clipY)) continue;
      const q = a.getBoundingClientRect(); if (q.width < 1 || q.height < 1) continue;
      if (!(tr.r > q.left && tr.l < q.right && tr.b > q.top && tr.t < q.bottom)) continue;   // 통째로 밖 = 일부러 숨긴 것
      if (a.closest('[data-clip-ok]')) continue;
      const over = Math.max(clipX ? tr.r - q.right : 0, clipX ? q.left - tr.l : 0, clipY ? tr.b - q.bottom : 0, clipY ? q.top - tr.t : 0);
      if (over > 1.5) {
        if ((cs(e).textOverflow === 'ellipsis' || s.textOverflow === 'ellipsis') && a.scrollWidth <= a.clientWidth + 1 && e.scrollWidth <= e.clientWidth + 1) continue;   // 글자 끝 반올림 오차(안 잘림)
        if (cs(e).textOverflow === 'ellipsis' || s.textOverflow === 'ellipsis') { if (!e.title && !e.closest('[title]') && !a.title) add(warn, 'ellipsis', e, t, '말줄임인데 title 없음'); continue; }
        if (s.webkitLineClamp && s.webkitLineClamp !== 'none') { if (!a.title && !a.closest('[title]')) add(warn, 'ellipsis', e, t, '줄 줄임인데 title 없음'); continue; }
        add(hard, 'clip', e, t, '상자 ' + sel(a) + ' 밖으로 ' + Math.round(over) + 'px');
      }
    }
    if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && (se.overflowX === 'hidden' || se.overflowX === 'clip')) {
      if (se.textOverflow === 'ellipsis') { if (!e.title && !e.closest('[title]')) add(warn, 'ellipsis', e, t, '말줄임인데 title 없음'); }
      else if (!(se.webkitLineClamp && se.webkitLineClamp !== 'none')) add(hard, 'cut', e, t, 'scrollWidth ' + e.scrollWidth + ' > ' + e.clientWidth);
    }
    {
      for (let a = e.parentElement; a && a !== document.body && a !== document.documentElement && a !== scroller; a = a.parentElement) {
        const s = cs(a);
        if (s.display === 'contents' || !surface(s)) continue;
        const q = a.getBoundingClientRect(); if (q.width < 20 || q.height < 10) continue;
        const o = Math.max(tr.r - q.right, q.left - tr.l, tr.b - q.bottom, q.top - tr.t);
        if (o > 2 && s.position !== 'fixed') add(hard, 'box', e, t, '카드 ' + sel(a) + ' 밖으로 ' + Math.round(o) + 'px');
        break;
      }
      if (!scroller && tr.r > vw + 1 && tr.l < vw && cs(document.documentElement).overflowX !== 'hidden') add(hard, 'page', e, t, '화면 가로 밖으로 ' + Math.round(tr.r - vw) + 'px');
    }
    if ((/^(H[1-6]|LABEL|LEGEND|SUMMARY)$/.test(e.tagName) || /(^|[-_ ])(t|ttl|title|name|head|lbl|label)($|[-_ ])/.test(String(e.className))) && t.includes(' ') && t.length > 6 && rects.length > 1) {
      const lines = {};
      for (let i = 0; i < n.nodeValue.length; i++) { r.setStart(n, i); r.setEnd(n, i + 1); const q = r.getClientRects()[0]; if (!q || !q.width) continue; (lines[Math.round(q.top / 4)] ||= []).push(n.nodeValue[i]); }
      const ks = Object.keys(lines).map(Number).sort((a, b) => a - b);
      if (ks.length > 1) { const last = lines[ks[ks.length - 1]].join('').trim(); if (last && !/\\s/.test(last) && last.length <= 4) add(warn, 'orphan', e, t, '마지막 줄에 ' + last + ' 만 남음'); }
    }
  }
  return { hard: hard.slice(0, 60), warn: warn.slice(0, 40), n: count };
})()`;
