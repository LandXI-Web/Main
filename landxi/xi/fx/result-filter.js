/* result-filter.js — 결과 레이어 거르기(원칙 193). arrive.js addResultLayers 가 층을 등록하고, 화면 · XI ChatGEO 채팅창(kit/cmdk.js)이 조건을 건다.
   다른 모듈에 기대지 않는 작은 파일(채팅창은 모든 화면에 있으므로 지도 엔진을 끌어오지 않는다). */
/* ── 결과 레이어 거르기(원칙 193 · XI ChatGEO '비닐하우스 단동만' · '1,000㎡ 넘는 것만' · '○○면만') ──
   속성 = 결과 타일 그대로(cls · area_m2 · emd) — 서버가 그 값이 실제 결과에 있는지 먼저 보고 보낸다. addResultLayers 로 올린 층만 · 원래 거르기는 그대로 두고 더한다.
   cond = {cls?:[...], emd?:[...], area_min?, area_op_min?('>'|'>='), area_max?, area_op_max?('<'|'<=')} · clear:true = 원래대로. 반환 = 거른 층 수. 바로 반영(타일 다시 받지 않음). */
const RES = new WeakMap();      // map → Map(층 id → 원래 거르기)
const FILT = new WeakMap();     // map → 지금 조건(새로 올리는 결과 층에도 같은 조건)
const OFF = new WeakMap();      // map → 끈 클래스(XI맵 '층' 판 체크박스 · 10-15 사용자 "체크박스 클래스 온오프도 없네?")
const HIDE = new WeakMap();     // map → Map(층 id → Set(객체 id)) — 고친 자리 층이 새 클래스 색으로 대신 그리는 원래 객체(클래스 바꿈 · 수정)
const FID = ['case', ['has', 'id'], ['to-string', ['get', 'id']], ['to-string', ['id']]];
function condExpr(c) {
  if (!c) return null;
  const area = ['to-number', ['get', 'area_m2'], 0];
  const parts = [];
  if (c.cls?.length) parts.push(['in', ['to-string', ['get', 'cls']], ['literal', c.cls]]);
  if (c.emd?.length) parts.push(['in', ['to-string', ['get', 'emd']], ['literal', c.emd]]);
  if (c.area_min != null) parts.push([c.area_op_min === '>=' ? '>=' : '>', area, +c.area_min]);
  if (c.area_max != null) parts.push([c.area_op_max === '<=' ? '<=' : '<', area, +c.area_max]);
  return parts.length ? (parts.length === 1 ? parts[0] : ['all', ...parts]) : null;
}
function applyFilter(map, id, c) {
  if (!map.getLayer(id)) return false;
  const orig = RES.get(map)?.get(id) ?? null, x = condExpr(c);
  const off = OFF.get(map), hid = HIDE.get(map)?.get(id);
  const parts = [orig, x, off?.length ? ['!', ['in', ['to-string', ['get', 'cls']], ['literal', off]]] : null, hid?.size ? ['!', ['in', FID, ['literal', [...hid]]]] : null].filter(Boolean);
  map.setFilter(id, parts.length > 1 ? ['all', ...parts] : (parts[0] || null));
  return true;
}
export function registerResult(map, ids) {
  const reg = RES.get(map) || new Map(); RES.set(map, reg);
  for (const id of ids) reg.set(id, map.getFilter(id) ?? null);
  if (FILT.has(map) || OFF.has(map) || HIDE.get(map)?.size) for (const id of ids) applyFilter(map, id, FILT.get(map) || null);
}
/** 끈 클래스(체크박스) — 등록된 모든 결과 층에서 그 클래스를 숨긴다 · 빈 목록 = 모두 보임. 반환 = 바뀐 층 수 */
export function excludeClasses(map, list) {
  if (list?.length) OFF.set(map, list.map(String)); else OFF.delete(map);
  const reg = RES.get(map); let n = 0;
  if (reg) for (const id of reg.keys()) if (applyFilter(map, id, FILT.get(map) || null)) n += 1;
  return n;
}
export const excludedClasses = (map) => OFF.get(map) || [];
/** 원래 객체 숨김 — 고친 자리 층(xe-live)이 새 클래스 색으로 대신 그리는 객체(클래스 바꿈 · 수정). fids 빈 목록 = 다시 보임 */
export function hideResults(map, ids, fids) {
  const m = HIDE.get(map) || new Map(); HIDE.set(map, m);
  for (const id of ids) { if (fids?.length) m.set(id, new Set(fids.map(String))); else m.delete(id); applyFilter(map, id, FILT.get(map) || null); }
}
export function filterResults(map, cond) {
  const reg = RES.get(map);
  if (!reg) return 0;
  const c = cond && !cond.clear ? cond : null;
  if (c) FILT.set(map, c); else FILT.delete(map);
  let n = 0;
  for (const id of reg.keys()) if (applyFilter(map, id, c)) n += 1;
  return n;
}
export const resultFilter = (map) => FILT.get(map) || null;
/* 도형 하나(결과 타일 속성)가 조건에 맞는지 — condExpr 과 같은 식(지도 서비스가 고른 도형이 조건에서 빠지면 속성 칸을 닫는다 · GPT4-1) */
export function matchCond(p, c) {
  if (!c || c.clear) return true;
  const a = Number(p?.area_m2 ?? 0) || 0;
  if (c.cls?.length && !c.cls.includes(String(p?.cls))) return false;
  if (c.emd?.length && !c.emd.includes(String(p?.emd))) return false;
  if (c.area_min != null && !(c.area_op_min === '>=' ? a >= +c.area_min : a > +c.area_min)) return false;
  if (c.area_max != null && !(c.area_op_max === '<=' ? a <= +c.area_max : a < +c.area_max)) return false;
  return true;
}
