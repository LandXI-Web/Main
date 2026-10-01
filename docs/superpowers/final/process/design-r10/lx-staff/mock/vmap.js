/* K-4 갈림길 — '영상 없이 만들 때' 지도에서 지역을 정하는 그림. V-World 배경 지도(공개 타일 · make-map.py 가 내려받음) 위에
   ⓐ 시군구를 눌러 고른 모습(남원시 · 행정경계) ⓑ 범위를 직접 그린 모습(예시 다각형). 좌표 · 줌 값은 화면에 쓰지 않는다. */
window.renderVmap = function (el, mode = 'pick') {
  const D = window.VMAP;
  const ox = Math.round(el.clientWidth / 2 - D.pick.cx), oy = Math.round(el.clientHeight / 2 - D.pick.cy);
  const tiles = D.tiles.map((t) => `<img src="${t.src}" alt="" style="left:${t.x}px;top:${t.y}px">`).join('');
  const neigh = D.neigh.map((n) => `<path class="nb" d="${n.d}"/><text class="sm" x="${n.cx}" y="${n.cy}" text-anchor="middle">${n.name}</text>`).join('');
  const pick = `<path class="pk" d="${D.pick.d}"/><text x="${D.pick.cx}" y="${D.pick.cy + 5}" text-anchor="middle">${D.pick.name}</text>`;
  const pts = D.draw.d.replace(/[MZ]/g, '').trim().split(' ');
  const dots = []; for (let i = 0; i < pts.length; i += 2) dots.push(`<circle class="dr-pt" cx="${pts[i]}" cy="${pts[i + 1]}" r="4"/>`);
  const draw = mode === 'draw' ? `<path class="dr" d="${D.draw.d}"/>${dots.join('')}` : '';
  el.innerHTML = `<div class="tiles" style="width:${D.w}px;height:${D.h}px;transform:translate(${ox}px,${oy}px)">${tiles}</div>
    <svg width="${D.w}" height="${D.h}" style="transform:translate(${ox}px,${oy}px)">${neigh}${pick}${draw}</svg>
    <div class="tool"><span class="${mode === 'pick' ? 'on' : ''}">시군구 고르기</span><span class="${mode === 'draw' ? 'on' : ''}">범위 그리기</span></div>
    <div class="srch">시군구 이름 검색</div>
    <span class="src">배경 지도 V-World</span>`;
};
