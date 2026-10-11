/* explain.js — 프로젝트 '학습' · '추론' 탭 맨 위 설명 칸(원칙 181 · 10-11 "학습은 무슨 모델?? … 자동으로 타일링 추론 처리하는 개념인가??").
   접지 않은 두세 줄 + 작은 그림 하나. 말은 모두 코드에서 확인한 사실만(근거 = docs/superpowers/final/process/impl-13/a/README.md):
   · 학습 = server/adapters/adapter_train_yolo.py — ultralytics YOLO 로 기반 모델(models 표에 등록된 가중치)을 이 프로젝트 학습데이터로 다시 가르친다.
     기본 3회 반복(lx-train/flow.js epochs 3) · 검증 몫 = 올린 묶음의 val 폴더, 없으면 다섯 장에 한 장(landxi_api/training.py).
     등록된 학습 모델 = YOLO11 영역 분할(yolo11-seg · yolo11x-seg · yolo11n-seg) · YOLO11 회전 상자(yolo11x-obb).
   · 추론 = landxi_api/release.py 프로젝트 추론 작업 options chip 1024 · overlap 0.125 → workers/tiling.py 격자(조각 수는 영상 · 범위 크기로 자동,
     조각 크기는 해상도와 상관없이 1024 — 프로젝트 추론은 해상도 맞춤(upsample) 없음) · 겹친 폭의 절반씩 '내 것'(core) · 같은 분류가 겹치면 확신 높은 쪽만
     (workers/postprocess.py) · 최소 크기 = 미터 면적(㎡)으로 버림(postprocess min_area · cpu_worker min_area_m2) · 신뢰도 기준 = 모델 predict conf. */
import { h } from '../kit/util.js';

let cssOn = false;
function sheet() {
  if (cssOn || document.querySelector('link[data-lxp-ex]')) return;
  cssOn = true;
  document.head.append(h('link', { rel: 'stylesheet', href: new URL('./explain.css', import.meta.url).href, dataset: { lxpEx: '1' } }));
}

const NS = 'http://www.w3.org/2000/svg';
function svg(w, hgt, label, draw) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  s.setAttribute('width', String(w)); s.setAttribute('height', String(hgt));
  s.setAttribute('role', 'img'); s.setAttribute('aria-label', label);
  s.classList.add('lxp-ex-g');
  const el = (tag, at, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v)); if (text) e.textContent = text; s.append(e); return e; };
  draw(el);
  return s;
}
const arrow = (el, x1, x2, y) => { el('line', { x1, y1: y, x2: x2 - 1, y2: y, class: 'ln' }); el('path', { d: `M${x2 - 6} ${y - 4} L${x2} ${y} L${x2 - 6} ${y + 4}`, class: 'ln' }); };
const lines = (...parts) => { const p = h('p'); parts.forEach((t, i) => { if (i) p.append(' '); p.append(h('span', { text: t })); }); return p; };

/** 모델 종류(사람 말) — task seg · obb · det */
export const kindWord = (task) => ({ seg: '영역 분할(테두리를 도형으로)', obb: '회전 상자(기울어진 상자로)', det: '상자(네모 상자로)' }[task] || null);

/** 학습 탭 설명 칸 — model = 이 프로젝트 모델(registry 항목 · 없으면 null) */
export function trainExplain(model = null) {
  sheet();
  const g = svg(240, 84, '학습데이터와 기반 모델로 새 모델을 만드는 그림', (el) => {
    el('rect', { x: 1, y: 10, width: 60, height: 46, rx: 4, class: 'bx' });
    el('path', { d: 'M10 20 h18 v13 h-18 z', class: 'lab' }); el('path', { d: 'M36 36 l13 -4 l4 12 l-13 4 z', class: 'lab' });
    el('text', { x: 31, y: 74, class: 'tx' }, '학습데이터');
    arrow(el, 66, 88, 33);
    el('rect', { x: 91, y: 10, width: 60, height: 46, rx: 4, class: 'bx' });
    el('text', { x: 121, y: 37, class: 'tm' }, 'YOLO11');
    el('text', { x: 121, y: 74, class: 'tx' }, '기반 모델');
    arrow(el, 156, 178, 33);
    el('rect', { x: 179, y: 10, width: 60, height: 46, rx: 4, class: 'bx on' });
    el('text', { x: 209, y: 37, class: 'tm' }, '새 모델');
    el('text', { x: 209, y: 74, class: 'tx' }, '이 프로젝트');
  });
  const kind = model ? kindWord(model.task) : null;
  return h('section.lxp-ex', { 'aria-label': '학습은 이렇게 합니다' }, g,
    h('div.lxp-ex-t', {},
      h('h3', { text: '학습은 이렇게 합니다' }),
      lines('지금 있는 AI 모델(기반 모델)을', '이 프로젝트 학습데이터로 다시 가르쳐', '새 모델을 만듭니다.'),
      lines('모델은 YOLO11 입니다 —', '영역 분할은 대상의 테두리를 도형으로 그리고,', '회전 상자는 차량처럼 기울어진 상자로 찾습니다.'),
      lines('학습데이터를 3번 반복해 보며 배우고,', '떼어 둔 검증 몫으로 정확도를 잽니다', '(검증 폴더가 없으면 다섯 장에 한 장).'),
      kind ? h('p.lxp-ex-k', {}, h('b', { text: '이 프로젝트 모델' }), ' ', h('span', { text: `YOLO11 ${kind}` })) : null));
}

/** 추론 탭 설명 칸 */
export function inferExplain() {
  sheet();
  const g = svg(240, 84, '큰 영상을 겹치는 조각으로 나눠 보고 다시 이어 붙이는 그림', (el) => {
    el('rect', { x: 1, y: 6, width: 90, height: 56, rx: 4, class: 'bx' });
    for (const x of [31, 61]) el('rect', { x: x - 3, y: 6, width: 6, height: 56, class: 'ov' });
    el('rect', { x: 1, y: 31, width: 90, height: 6, class: 'ov' });
    for (const x of [31, 61]) el('line', { x1: x, y1: 6, x2: x, y2: 62, class: 'cut' });
    el('line', { x1: 1, y1: 34, x2: 91, y2: 34, class: 'cut' });
    el('text', { x: 46, y: 78, class: 'tx' }, '1024 화소 조각');
    arrow(el, 98, 142, 34);
    el('text', { x: 118, y: 27, class: 'tm' }, 'AI');
    el('rect', { x: 149, y: 6, width: 90, height: 56, rx: 4, class: 'bx' });
    el('path', { d: 'M160 15 h18 v13 h-18 z', class: 'lab' }); el('path', { d: 'M186 26 h22 v15 h-22 z', class: 'lab' });
    el('path', { d: 'M213 43 l14 -4 l3 11 l-14 4 z', class: 'lab' }); el('path', { d: 'M164 45 h12 v9 h-12 z', class: 'lab' });
    el('text', { x: 194, y: 78, class: 'tx' }, '이어 붙인 결과');
  });
  return h('section.lxp-ex', { 'aria-label': '추론은 이렇게 합니다' }, g,
    h('div.lxp-ex-t', {},
      h('h3', { text: '추론은 이렇게 합니다' }),
      lines('큰 영상을 1024×1024 화소 조각으로 자동으로 나눠', 'AI가 조각마다 보고', '결과를 다시 이어 붙입니다.'),
      lines('이웃 조각과 12.5%(128화소)씩 겹쳐', '경계에 걸린 것도 놓치지 않고,', '두 번 잡힌 것은 확신이 높은 쪽만 남깁니다.'),
      lines('조각 크기는 영상 해상도와 상관없이 같고,', '조각 수는 영상과 범위 크기에 따라 정해집니다.')));
}
