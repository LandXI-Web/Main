/* AI 판독 필지 색인 — 실태조사 정본 PMTiles(V-World 연속지적 × LX AI 2023 25cm)의 `parcels` 층을 z14 로 읽어
   pnu → {지목·면적·용도지역·농업진흥·AI 건물/경작/주차장/비닐하우스 ㎡·농경 비율, bbox} 색인을 만든다.
   XI맵이 그리는 같은 파일이다(숫자 출처 하나). 지오메트리는 bbox 만 푼다. */

const Z = 14;

export class AiIndex {
  constructor(url, pm) { this.url = url; this.pm = pm || new pmtiles.PMTiles(url); this.map = new Map(); this.tiles = new Set(); this.ms = 0; this.bytes = 0; }

  /** bbox 들을 덮는 z14 타일을 모두 읽는다. onTile(done,total) */
  async load(bboxes, onTile) {
    const t0 = performance.now();
    const want = [];
    for (const b of bboxes) {
      const [x0, y1] = tileXY(b[0], b[1], Z), [x1, y0] = tileXY(b[2], b[3], Z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + '/' + y; if (!this.tiles.has(k)) { this.tiles.add(k); want.push([x, y]); } }
    }
    let done = 0; const N = want.length;
    const worker = async () => {
      while (want.length) {
        const [x, y] = want.shift();
        try {
          const r = await this.pm.getZxy(Z, x, y);
          if (r && r.data) { this.bytes += r.data.byteLength; decodeParcels(new Uint8Array(r.data), x, y, Z, this.map); }
        } catch { /* 빈 타일 */ }
        onTile && onTile(++done, N);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    this.ms += performance.now() - t0;
    return N;
  }
  get(pnu) { return this.map.get(pnu); }
  /** 이어 열기용 — 대장 필지만 뽑아 두고(IndexedDB), 다음 방문엔 타일을 다시 읽지 않는다 */
  dump(pnus) {
    const K = ['jimok', 'yongdo', 'nongup', 'area_m2', 'bld_m2', 'crop_m2', 'park_m2', 'gh_m2', 'r23_farm'];
    const out = [];
    for (const pn of pnus) { const e = this.map.get(pn); if (!e) continue; const p = { pnu: pn }; for (const k of K) if (e.p[k] !== undefined) p[k] = e.p[k]; out.push([pn, p, e.bb]); }
    return out;
  }
  seed(list) { for (const [pn, p, bb] of list || []) if (!this.map.has(pn)) this.map.set(pn, { p, bb }); return this; }
  get size() { return this.map.size; }
}

export function tileXY(lon, lat, z) {
  const n = 2 ** z; const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
}

/* ── 최소 protobuf · MVT 디코더(속성 + bbox) ── */
function decodeParcels(buf, tx, ty, z, out) {
  const P = new Pbf(buf);
  while (P.pos < P.end) {
    const tag = P.varint(), f = tag >> 3, w = tag & 7;
    if (f === 3 && w === 2) { const len = P.varint(); const end = P.pos + len; layer(P, end, tx, ty, z, out); P.pos = end; }
    else P.skip(w);
  }
}
function layer(P, end, tx, ty, z, out) {
  let name = '', extent = 4096; const keys = [], vals = [], feats = [];
  while (P.pos < end) {
    const tag = P.varint(), f = tag >> 3, w = tag & 7;
    if (f === 1) name = P.string();
    else if (f === 2) { const len = P.varint(); feats.push([P.pos, P.pos + len]); P.pos += len; }
    else if (f === 3) keys.push(P.string());
    else if (f === 4) { const len = P.varint(); vals.push(value(P, P.pos + len)); }
    else if (f === 5) extent = P.varint();
    else P.skip(w);
  }
  if (name !== 'parcels') return;
  const n = 2 ** z;
  for (const [s, e] of feats) {
    P.pos = s; const props = {}; let bb = null;
    while (P.pos < e) {
      const tag = P.varint(), f = tag >> 3, w = tag & 7;
      if (f === 2) { const len = P.varint(), fe = P.pos + len; while (P.pos < fe) { const k = P.varint(), v = P.varint(); props[keys[k]] = vals[v]; } }
      else if (f === 4) { const len = P.varint(); bb = geomBBox(P, P.pos + len); }
      else P.skip(w);
    }
    if (!props.pnu) continue;
    let lb = null;
    if (bb) {
      const lon = (x) => ((tx + x / extent) / n) * 360 - 180;
      const lat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + y / extent)) / n))) * 180) / Math.PI;
      lb = [lon(bb[0]), lat(bb[3]), lon(bb[2]), lat(bb[1])];
    }
    const prev = out.get(props.pnu);
    if (prev) { if (lb && prev.bb) prev.bb = [Math.min(prev.bb[0], lb[0]), Math.min(prev.bb[1], lb[1]), Math.max(prev.bb[2], lb[2]), Math.max(prev.bb[3], lb[3])]; }
    else out.set(props.pnu, { p: props, bb: lb });
  }
}
function geomBBox(P, end) {
  let x = 0, y = 0, cmd = 0, cnt = 0; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  while (P.pos < end) {
    if (!cnt) { const ci = P.varint(); cmd = ci & 7; cnt = ci >> 3; if (cmd === 7) { cnt = 0; continue; } }
    cnt--;
    x += zz(P.varint()); y += zz(P.varint());
    if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y;
  }
  return isFinite(a) ? [a, b, c, d] : null;
}
const zz = (n) => (n >>> 1) ^ -(n & 1);
function value(P, end) {
  let v = null;
  while (P.pos < end) {
    const tag = P.varint(), f = tag >> 3, w = tag & 7;
    if (f === 1) v = P.string();
    else if (f === 2) { v = P.dv.getFloat32(P.pos, true); P.pos += 4; }
    else if (f === 3) { v = P.dv.getFloat64(P.pos, true); P.pos += 8; }
    else if (f === 4 || f === 5) v = P.varint();
    else if (f === 6) v = zz(P.varint());
    else if (f === 7) v = !!P.varint();
    else P.skip(w);
  }
  return v;
}
class Pbf {
  constructor(u8) { this.u8 = u8; this.pos = 0; this.end = u8.length; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  varint() {
    let r = 0, s = 0, b;
    do { b = this.u8[this.pos++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * 2 ** s; s += 7; } while (b >= 0x80);
    return r;
  }
  string() { const len = this.varint(); const s = td.decode(this.u8.subarray(this.pos, this.pos + len)); this.pos += len; return s; }
  skip(w) { if (w === 0) this.varint(); else if (w === 1) this.pos += 8; else if (w === 2) { const l = this.varint(); this.pos += l; } else if (w === 5) this.pos += 4; }
}
const td = new TextDecoder();
