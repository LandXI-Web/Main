/* label-pre.js — 학습데이터 구축(라벨링) 화면이 열릴 때 가장 먼저 받기 시작한다(10-18 · 지도 준비 2초 안).
   app.js 의 첫 import — 화면 글(i18n) · 셸을 기다리지 않고 라벨링 자료 · 지도 엔진 · 화면 모듈을 바깥 주소 왕복(약 0.4초씩)과 겹쳐 받는다.
   로그인이 없거나 끝났으면 받지 않는다(로그인 확인은 auth-gate 가 한다). */
import { api, session } from '../../shared/api-v1.js';

export const LB_PRE = (() => {
  const q = new URLSearchParams(location.search), pid = q.get('project');
  if (q.get('stage') !== 'label' || !pid) return null;
  let saved = null;
  try { saved = localStorage.getItem('lx-label-view'); } catch { /* 보관함 없음 */ }
  const pre = { mod: import('./label-map.js'), work: import('./label.js') };
  if ((q.get('view') || saved) !== 'chip' && session.get()) {
    pre.map = api(`/projects/${encodeURIComponent(pid)}/labeling/map`);
    pre.map.catch(() => {});
    pre.mod.then((m) => m.warmMap()).catch(() => {});
  }
  return pre;
})();
