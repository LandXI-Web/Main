/* 시안 ② 한 페이지 — 페이지를 다시 열지 않고 판 안의 내용만 바꾼다(업로드는 이 페이지가 계속 쥔다).
   운영 화면을 한 페이지로 다시 짜는 일은 시안에서 할 수 없어, 판 안은 '모양만 비슷한 화면'(칸 이름 · 회색 줄)이다 — 숫자는 넣지 않는다.
   메뉴를 누른 뒤 새 내용이 화면에 그려질 때까지 걸린 시간을 머리줄 '시안' 표시에 적는다. */
import { boot, SCREENS } from '../common.js';
import { h } from '../../../../v3/kit/util.js';

const q = () => { const s = new URLSearchParams(location.search).get('screen'); return SCREENS.includes(s) ? s : 'home'; };
let cur = q();
window.__uc = [];

const { S, timeTag } = await boot({ which: 'b', current: cur, onPick: (id) => { if (id === cur) return; history.pushState({ screen: id }, '', '?screen=' + id); show(id); } });

const bars = (n, w = [92, 76, 84, 60, 70]) => h('div.ub-bars', {}, ...Array.from({ length: n }, (_, i) => h('i', { style: { width: w[i % w.length] + '%' } })));
const card = (title, n, cls = '') => h('section.ub-card' + cls, {}, h('b.ub-card-h', { text: title }), bars(n));
const note = () => h('p.ub-note', { html: '모양만 비슷하게 그린 화면입니다. 실제 화면을 한 페이지로 다시 짜는 일은 시안에서 할 수 없습니다.<br>메뉴가 바뀌는 빠르기와 업로드가 이어지는지만 보세요.' });

const VIEW = {
  home: () => h('div.ub-page', {}, h('h1.ub-h', { text: '대시보드' }), note(),
    h('div.ub-grid.ub-grid--dash', {}, card('공지사항', 3, '.w8'), card('메모', 3, '.w4'), card('진행 현황', 4, '.w5'), card('요청함', 4, '.w3'), card('저장 용량', 4, '.w4'), card('달력', 6, '.w4'), card('최근 진행한 프로젝트', 6, '.w8'))),
  projects: () => h('div.ub-page', {}, h('h1.ub-h', { text: '프로젝트' }), note(),
    h('div.ub-grid.ub-grid--3', {}, ...['데이터 올리기', '학습데이터 구축', '학습', '추론', '결과 확인', '배포 신청'].map((t) => card(t, 4)))),
  analyze: () => h('div.ub-page', {}, h('h1.ub-h', { text: '분석 서비스' }), note(),
    h('div.ub-grid.ub-grid--cards', {}, ...Array.from({ length: 6 }, () => h('section.ub-card.ub-svc', {}, h('div.ub-pic'), bars(3))))),
  mapsvc: () => h('div.ub-page.ub-page--map', {}, h('aside.ub-side', {}, h('h1.ub-h', { text: '지도 서비스' }), note(), bars(6)), h('div.ub-map', {}, h('span', { text: '지도' }))),
};

function show(id) {
  cur = id;
  S.go(SCREENS.indexOf(id));
  const t0 = performance.now();
  S.main.replaceChildren(VIEW[id]());
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ms = Math.round(performance.now() - t0);
    window.__uc.push({ screen: id, ms });
    timeTag(`방금 메뉴 ${(ms / 1000).toFixed(2)}초`);
  }));
}
history.replaceState({ screen: cur }, '', '?screen=' + cur);
addEventListener('popstate', () => show(q()));
show(cur);
