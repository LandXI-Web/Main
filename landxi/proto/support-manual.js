/* 매뉴얼 — 좌 = 카테고리 5(SP_MANUALS · 시연), 우 = 선택 항목(화면 · 제목 · 설명 · 파일) + 점선 결손 "본문 미구성". 원판 B6-Support-Manual.
   원본 manual.html 의 본문(#manual-body)은 비어 있다(주석 "추후 HTML로 구성") — 없는 본문을 지어내지 않는다.
   URL: ?m=2 (고른 카테고리 · 기본 2 = 원판) */
import { boot, readQ, writeQ, fmtSize, bindDownloads, stagger, announce, icon, xicon, esc, $, $$ } from './support.js';
import { MANUALS, MAN_IMG } from './support-data.js';

if (boot('manual')) init();

function init() {
  const main = $('#main');
  const no = (i) => String(i + 1).padStart(2, '0');
  main.insertAdjacentHTML('beforeend', `
<div class="mn">
  <section class="mn-l" data-in aria-labelledby="mn-h">
    <h2 class="mn-h d" id="mn-h">${xicon('book', 16)}사용자 매뉴얼 <span class="n">${MANUALS.length}</span><em class="tag">시연</em></h2>
    <div class="mn-list" id="mn-list" role="group" aria-label="매뉴얼 카테고리">${MANUALS.map((m, i) => `<button type="button" class="mn-item" data-m="${i + 1}" aria-current="false">
<span class="mn-th${MAN_IMG[i] ? '' : ' mn-th--none'}">${MAN_IMG[i] ? `<img src="${esc(MAN_IMG[i].src)}" alt="" loading="lazy">` : '화면<br>없음'}</span>
<span class="mn-tx"><span class="mn-t1"><span class="n">${no(i)}</span><b>${esc(m.title)}</b></span><span class="mn-t2">${esc(m.desc)}</span><span class="mn-t3 mic">${icon('clip', 14)}<span>${esc(m.file)}</span><span class="n">(${esc(fmtSize(m.size))})</span></span></span></button>`).join('')}</div>
    <p class="mic mn-note">05 보고서 생성 — 개편 범위에 해당 화면이 없어 미리보기를 비워 두었다.</p>
  </section>
  <section class="mn-r" id="mn-r" data-in aria-label="선택한 매뉴얼" aria-live="off"></section>
</div>`);
  stagger(main);

  const st = { m: 2 };
  const fromUrl = () => { const v = parseInt(readQ().m, 10); st.m = v >= 1 && v <= MANUALS.length ? v : 2; };
  const list = $('#mn-list'), right = $('#mn-r');

  function draw(swap = false) {
    $$('.mn-item', list).forEach((b) => b.setAttribute('aria-current', String(+b.dataset.m === st.m)));
    const i = st.m - 1, m = MANUALS[i], im = MAN_IMG[i];
    right.innerHTML = `<div class="${swap ? 'sp-swap' : ''}">
${im ? `<figure class="mn-fig"><img src="${esc(im.src)}" alt="${esc(im.cap)}"><figcaption>${esc(im.cap)}</figcaption></figure>`
    : `<div class="mn-fig mn-fig--none">${icon('image', 30)}<span>화면 없음 — 개편 범위에 해당 화면이 없다</span></div>`}
<div class="mn-dt"><span class="n">${no(i)}</span><h2 class="d">${esc(m.title)}</h2></div>
<p class="mn-dd">${esc(m.desc)}</p>
<button type="button" class="file sp-file mn-file" data-dl="${esc(m.file)}"><span class="sp-file-ic">${icon('clip', 16)}</span><span class="sp-file-n">${esc(m.file)}</span><span class="n sp-file-s">(${esc(fmtSize(m.size))})</span><em class="tag">시연</em><span class="sp"></span><span class="sp-file-d">${icon('down', 16)}</span><span class="sr">내려받기</span></button>
<div class="mn-gap"><p class="mn-gap-t">본문 미구성</p>
<p class="mic">원본 manual.html 의 본문 영역(#manual-body)은 비어 있다 — 주석 “추후 HTML로 구성”.<br>본문이 정해지면 이 자리에 카테고리별 절(제목 · 단계 · 화면)로 들어간다. 지금 실제로 있는 것은 위 ${MANUALS.length}개 카테고리와 파일 시드뿐이다.</p>
<div class="mn-gap-ph" aria-hidden="true"><i style="width:120px"></i><i style="width:200px"></i><i style="width:160px"></i></div></div>
</div>`;
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.mn-item'); if (!b || +b.dataset.m === st.m) return;
    st.m = +b.dataset.m; writeQ({ m: st.m }); draw(true); announce(`${no(st.m - 1)} ${MANUALS[st.m - 1].title}`);
  });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const all = $$('.mn-item', list), i = all.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault();
    (e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[Math.min(all.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]).focus();
  });
  bindDownloads(right);
  window.addEventListener('popstate', () => { fromUrl(); draw(); });
  fromUrl(); draw();
}
