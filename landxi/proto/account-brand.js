/* 사이드바 브랜드 심볼 적용 — 원본 assets/js/layout.js 의 applyCustomSymbol() 과 같은 일.
   localStorage('lx_custom_symbol') = { src(dataURL), w(16–50) } 를 읽어 셸 레일 머리(#rail-mark)에 심볼을 얹는다.
   셸 파일은 고치지 않는다 — 셸이 세운 DOM 에 <img> 하나와 data-sym 을 더할 뿐이고, 모양은 account.css 가 맡는다.
   다른 화면의 레일에도 반영하려면 그 화면(또는 shell.js)이 이 함수를 mountShell 뒤에 한 번 부르면 된다. */
import { loadSymbol } from './account-data.js';

const SAFE_SRC = /^data:image\/(png|svg\+xml)[;,]/i;                       // 저장된 값이라도 이미지 dataURL 만 받는다

export function applyCustomSymbol(cfg = loadSymbol(), mark = document.getElementById('rail-mark')) {
  if (!mark) return null;
  mark.querySelector('img[data-sym-img]')?.remove();
  if (!cfg || !SAFE_SRC.test(cfg.src)) { mark.removeAttribute('data-sym'); mark.style.removeProperty('--sym-w'); return null; }
  const img = new Image();
  img.alt = ''; img.dataset.symImg = ''; img.src = cfg.src; img.style.width = `${cfg.w}px`;
  mark.prepend(img);
  mark.dataset.sym = ''; mark.style.setProperty('--sym-w', `${cfg.w}px`);
  return img;
}
export const isSymbolSrc = (s) => SAFE_SRC.test(s || '');
