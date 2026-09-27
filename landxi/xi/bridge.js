/* bridge.js — window.XI: XI맵을 다른 에픽(F2-E 에이전트 · F2-C 관제 · F2-D Global · F2-R 레일)이 부르는 유일한 문(F2-A · D0).
   규칙: 봉투(F1-CONTRACT §2) 없는 숫자는 arrive · hud.set 이 throw(prov() 규칙 그대로). 지도·HUD 를 직접 만지지 말고 이 함수만 부른다.
   xi.js 가 부팅 끝에 install(impl) 로 구현을 꽂는다 — 그 전에 부르면 ready 를 기다린다(순서 무관).
   이벤트(on): view · job · mode · parcel · finding · frame · drawer · cmdk · deploy · ready */
import { assertEnvelope } from '../shared/api-v1.js';

const EVENTS = ['view', 'job', 'mode', 'parcel', 'finding', 'frame', 'drawer', 'cmdk', 'deploy', 'ready'];
const subs = new Map(EVENTS.map((e) => [e, new Set()]));
let impl = null, resolveReady;
const ready = new Promise((r) => { resolveReady = r; });
const need = (name) => async (...a) => { await ready; return impl[name](...a); };
const providers = new Map();   // 슬롯 제공자(예: 'report-draft' → F2-E 가 채운다)

/** XI.on(evt, fn) → off() */
function on(evt, fn) {
  if (!subs.has(evt)) throw new Error(`XI.on: 모르는 이벤트 ${evt} (${EVENTS.join(' ')})`);
  subs.get(evt).add(fn);
  return () => subs.get(evt).delete(fn);
}
/** 내부: 이벤트 발행(구독자 예외는 삼키고 경고만 — 한 에픽의 오류가 지도를 멈추지 않게) */
export function emit(evt, detail) {
  for (const fn of subs.get(evt) || []) { try { fn(detail); } catch (e) { console.warn('[XI]', evt, e); } }
  document.dispatchEvent(new CustomEvent('xi:' + evt, { detail }));
}

export const XI = {
  version: '2.0-f2a',
  ready,
  events: EVENTS,
  on,
  /** 세션(realm · role · tenant · 모드 on/off) — 동기. 부팅 전에는 null. */
  session: () => (impl ? impl.session() : null),
  /** 현재 뷰 { center, zoom, pitch, bearing, bbox, on:[setId], frame, svc, mode:'read'|'survey', epoch, api:'on'|'off', role } — 동기 */
  view: () => (impl ? impl.view() : null),
  /** 결과 층 켜기/끄기. setId = 카탈로그 id(예 namwon-landcover-2023) 또는 'survey:findings'. opts.filter = MapLibre 식 · opts.label(임시 층 이름)
      opts.features = GeoJSON FeatureCollection 이면 임시 층(에이전트 질의 · 저장 안 됨)으로 올린다. 반환 { id, layers } */
  layerOn: need('layerOn'),
  layerOff: need('layerOff'),
  /** 도착(7문법 #1) — { bbox, setId | features, count: Envelope, head?:{scene,title,unit}, camera? } · count 가 봉투가 아니면 throw */
  async arrive(o = {}) { assertEnvelope(o.count, 'XI.arrive count'); await ready; return impl.arrive(o); },
  /** 카메라 — { bbox | center, zoom?, pitch?, bearing? }, ms(1000·1250·1600·2400 중 · 기본 1600) */
  flyTo: need('flyTo'),
  /** 프레임 씌우기(견적 카드까지 · 실행은 사람이 누른다) — GeoJSON Polygon · opts.card=false 면 선만(견적 카드 없음) */
  frame: need('frame'),
  /** 열린 카드(필지 v2 · 필지 · 견적 · 읍면동) 닫기 → 닫은 수 */
  closeCard: need('closeCard'),
  /** 필지 카드 v2 — pnu(19자리) 또는 {lng, lat} */
  parcelCard: need('parcelCard'),
  /** 서랍 — 'findings'(의심 큐) · 'report'(보고서 · opts.tab='draft' 면 초안 슬롯) · 'stats' */
  openDrawer: need('openDrawer'),
  closeDrawer: need('closeDrawer'),
  /** 실태조사 모드 — 'read' | 'survey' (opts: {survey:'farmland', rule, priority, emd}) */
  setMode: need('setMode'),
  /** HUD — hud.set(Envelope, {title, sub, scene, unit}) · 봉투 아니면 throw */
  hud: {
    set(e, head = {}) { assertEnvelope(e, 'XI.hud.set'); if (!impl) return ready.then(() => impl.hudSet(e, head)); return impl.hudSet(e, head); },
    status(text) { return impl?.hudStatus(text); },
  },
  /** 토스트 한 줄 — basis 가 있으면 꼬리표(시연 · 추정 …) */
  toast: (msg, basis) => impl?.toast(msg, basis),
  /** 슬롯 — 'agent' | 'cmdk' | 'report-draft' → HTMLElement(없으면 null) */
  slot: (name) => impl?.slot(name) || null,
  /** 슬롯 제공자 등록(F2-E: XI.provide('report-draft', (el, opts) => {...; return true})) — true 를 돌려주면 그 슬롯을 맡는다 */
  provide(name, fn) { providers.set(name, fn); return () => providers.delete(name); },
  provider: (name) => providers.get(name) || null,
  /** 그 이벤트의 구독자 수(예: cmdk 를 맡은 에픽이 있는지) */
  listeners: (evt) => subs.get(evt)?.size || 0,
};

/** xi.js 가 부팅 끝에 한 번 */
export function install(i) {
  impl = i;
  window.XI = XI;
  resolveReady(XI);
  emit('ready', { version: XI.version });
}
window.XI = XI;   // 부팅 전에도 존재(ready 대기 가능) — 파일만 import 해도 전역
export default XI;
