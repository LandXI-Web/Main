/* K20 farm-dash.js — 기관 '통계 · 보고서' 대시보드 모양(10-21 원칙 299 · 영농-6).
   XI ChatGEO 통계 보고서 보기(report-view.js)와 같은 칸 부품(xi-clean/dash.js 의 큰 숫자 · 도넛 · 막대 · 선)을 쓴다 — 한 벌.
   숫자는 호출한 화면이 서버 값으로 넘긴 것 그대로(지어낸 값 0 · 값이 없는 칸은 그리지 않는다).
     farmDash({ kpis, classes, emds, trend, yields, onEmd }) → Promise<HTMLElement>
       kpis    [{label,value,unit,sub,d}] 첫 칸이 큰 숫자
       classes [{label,v}] 종류별 도넛(색은 종류 색)   classUnit
       emds    [{label,v,k}] 읍면동별 가로 막대(많은 곳부터 · 눌러 그 읍면동)   emdUnit
       trend   [{t,v}] 시점 비교(둘 이상일 때만)        trendUnit
       yields  [{label,value,unit,sub}] 곤포 생산량 같은 칸(값 있을 때만) */
import { esc } from './util.js';

let D = null, cssP = null;
function css(href) {
  const u = new URL(href, import.meta.url).href;
  if ([...document.styleSheets].some((s) => s.href === u) || document.querySelector(`link[href="${u}"]`)) return Promise.resolve();
  return new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.onload = l.onerror = () => ok(); document.head.append(l); });
}
export function ready() {
  cssP ||= Promise.all([css('../xi-clean/dash.css'), css('./farm-dash.css'), import('../xi-clean/dash.js').then((m) => { D = m; })]);
  return cssP;
}
const TOP = 10;

export async function farmDash(o = {}) {
  await ready();
  const root = document.createElement('div');
  root.className = 'fd';
  let all = false;
  const hue = 'teal';
  const kp = (o.kpis || []).filter((k) => k && k.value != null && !Number.isNaN(Number(k.value))).slice(0, 4);
  const yl = (o.yields || []).filter((k) => k && k.value != null && Number(k.value) > 0);
  const cls = (o.classes || []).filter((r) => r.v > 0);
  const emds = (o.emds || []).filter((r) => r.v > 0);
  const trend = (o.trend || []).filter((x) => x.v != null);
  const draw = () => {
    const nk = kp.length;
    const bars = emds.length ? (() => {
      const list = all ? emds : emds.slice(0, TOP);
      const more = emds.length > TOP ? `<button type="button" class="fd-more">${all ? '접기' : `더 보기 · ${emds.length}곳 모두`}</button>` : '';
      return `<div class="xd-card xd-p xd-p--bar fd-bar" style="${D.panelVars(hue)}">${D.drawPanel({ type: 'bar', orient: 'h', title: o.emdTitle || '읍면동별', unit: o.emdUnit || '', rows: list.map((r, i) => ({ k: r.k ?? r.label, label: r.label, v: r.v })) }, hue)}${more}</div>`;
    })() : '';
    const dn = cls.length ? `<div class="xd-card xd-p xd-p--donut fd-donut" style="${D.panelVars(hue)}">${D.drawPanel({ type: 'donut', title: o.classTitle || '종류별', unit: o.classUnit || '', rows: cls.map((r) => ({ k: r.label, label: r.label, v: r.v })) }, hue)}</div>` : '';
    const ln = trend.length >= 2 ? `<div class="xd-card xd-p xd-p--line fd-line" style="${D.panelVars(hue)}">${D.drawPanel({ type: 'line', title: o.trendTitle || '시점 비교', unit: o.trendUnit || '', grain: 'month', points: trend, _w: 11 }, hue)}</div>` : '';
    const yd = yl.length ? `<div class="fd-yields">${yl.map((k) => D.kpiHtml(k, false, hue)).join('')}</div>` : '';
    root.innerHTML = `${nk ? `<div class="xd-kpis fd-kpis" style="grid-template-columns:${nk > 1 ? `minmax(0,1.5fr) repeat(${nk - 1},minmax(0,1fr))` : 'minmax(0,1fr)'}">${kp.map((k, i) => D.kpiHtml(k, i === 0, hue)).join('')}</div>` : ''}
      ${dn || bars ? `<div class="fd-row">${dn}${bars}</div>` : ''}${ln}${yd}`;
  };
  draw();
  const untip = D.bindTips(root);
  root.addEventListener('click', (e) => {
    if (e.target.closest('.fd-more')) { all = !all; draw(); return; }
    const hr = e.target.closest('.fd-bar .xd-hr[data-k]');
    if (hr && o.onEmd) o.onEmd(hr.dataset.k);
  });
  root.addEventListener('mouseleave', untip);
  if (o.onEmd) root.classList.add('is-pick');
  return root;
}
export { esc };
