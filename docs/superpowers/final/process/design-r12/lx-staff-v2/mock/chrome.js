/* 시안 공통 틀 — 마스트 · 왼쪽 메뉴(10차 메뉴 1안) · XI ChatGEO 버튼 · 시안 도장. 실제 화면과 같은 자리(구현 3차 틀). */
(function () {
  const I = {
    home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>',
    projects: '<path d="M3 5h5l2 2h7v9H3z"/>',
    analyze: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
    cards: '<path d="M3 4h14v12H3z M3 8h14"/>',
    data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
    inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>',
    more: '<path d="M3 5h14 M3 10h14 M3 15h14"/>',
  };
  const RAIL = [['home', '대시보드'], ['projects', '프로젝트'], ['analyze', '분석하기'], ['cards', '서비스 카드', 'more-hide'], ['data', '데이터', 'more-hide'], ['inbox', '요청함'], ['more', '메뉴', 'more']];
  window.chrome = function (active, stamp, opts = {}) {
    const app = document.getElementById('app');
    const mast = `<header class="mast"><span class="word">LAND-XI</span><span class="home">LX 직원 대시보드</span><span class="sp"></span><span class="fresh"><i></i><span>${opts.time || '16:01'}</span></span><span class="role">LX 직원 <span style="color:var(--sub);font-size:11px">▼</span></span><span class="mb">XI맵</span><span class="mb help">?</span><span class="mb">나가기</span></header>`;
    const rail = `<nav class="rail" aria-label="LX 직원 메뉴">${RAIL.map(([k, t, c]) => `<span class="ri${k === active ? ' on' : ''}${c ? ' ' + c : ''}"><svg viewBox="0 0 20 20">${I[k]}</svg><span>${t}</span></span>`).join('')}</nav>`;
    app.insertAdjacentHTML('afterbegin', mast + rail);
    document.body.insertAdjacentHTML('beforeend', `<div class="chat"><span>XI ChatGEO</span><i>LX</i></div><span class="stamp" id="stamp">${stamp}</span>`);
    const st = document.createElement('style');
    st.textContent = '.ri .bdg{position:absolute;right:8px;top:4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--warn);color:#fff;font:600 11px/18px var(--font-num);font-style:normal;text-align:center}';
    document.head.append(st);
    const Q = new URLSearchParams(location.search);
    if (Q.get('stamp') === '0') { document.getElementById('stamp').remove(); document.body.classList.remove('has-stamp'); }
    const f = (Q.get('f') || '').split(',').filter(Boolean);
    f.forEach((id) => { const n = document.getElementById('n-' + id); if (n) n.classList.add('on'); const k = document.getElementById('k-' + id); if (k) k.classList.add('hi'); });
  };
  window.CK = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>';
})();
