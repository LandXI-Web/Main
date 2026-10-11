/* result-filter.js — 결과 레이어 거르기(원칙 193). arrive.js addResultLayers 가 층을 등록하고, 화면 · XI ChatGEO 채팅창(kit/cmdk.js)이 조건을 건다.
   다른 모듈에 기대지 않는 작은 파일(채팅창은 모든 화면에 있으므로 지도 엔진을 끌어오지 않는다). */
/* ── 결과 레이어 거르기(원칙 193 · XI ChatGEO '비닐하우스 단동만' · '1,000㎡ 넘는 것만' · '○○면만') ──
   속성 = 결과 타일 그대로(cls · area_m2 · emd) — 서버가 그 값이 실제 결과에 있는지 먼저 보고 보낸다. addResultLayers 로 올린 층만 · 원래 거르기는 그대로 두고 더한다.
   cond = {cls?:[...], emd?:[...], area_min?, area_op_min?('>'|'>='), area_max?, area_op_max?('<'|'<=')} · clear:true = 원래대로. 반환 = 거른 층 수. 바로 반영(타일 다시 받지 않음). */
const RES = new WeakMap();      // map → Map(층 id → 원래 거르기)
const FILT = new WeakMap();     // map → 지금 조건(새로 올리는 결과 층에도 같은 조건)
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
  map.setFilter(id, x && orig ? ['all', orig, x] : (x || orig));
  return true;
}
export function registerResult(map, ids) {
  const reg = RES.get(map) || new Map(); RES.set(map, reg);
  for (const id of ids) reg.set(id, map.getFilter(id) ?? null);
  if (FILT.has(map)) for (const id of ids) applyFilter(map, id, FILT.get(map));
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
