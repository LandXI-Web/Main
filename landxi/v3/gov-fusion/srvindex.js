/* 서버 필지 색인 — 정적 필지 층(PMTiles)이 없는 관할(새 시군구)에서 AiIndex 자리를 대신한다.
   GET /t/{tenant}/survey/registry/{import_id}/parcels → 결합된 대장 필지(연속지적 × AI 피연산자 · GeoJSON).
   AI 값은 서버 규칙과 같은 출처(survey_parcel_ai) — 큰 숫자 · 지도 · 표 · 말 질의가 한 숫자. 인터페이스는 AiIndex 와 같다(get · load · dump · seed · size). */
import { api } from '../kit/util.js';

export class ServerIndex {
  constructor(tenant, importId) { this.server = true; this.tenant = tenant; this.id = importId; this.map = new Map(); this.features = []; this.ai = null; }

  /** 서버에서 한 번 받는다 → { ai, n } */
  async fetch() {
    const j = await api(`/t/${encodeURIComponent(this.tenant)}/survey/registry/${encodeURIComponent(this.id)}/parcels?ledger=1`);
    this.ai = j?.ai || null;
    this.features = (j?.features || []).filter((f) => f && f.geometry);
    for (const f of j?.features || []) {
      const p = f.properties || {};
      if (p.pnu) this.map.set(p.pnu, { p, bb: p.bbox || null });
    }
    return { ai: this.ai, n: this.map.size };
  }
  async load() { return 0; }              // 타일을 읽지 않는다(한 번에 받았다)
  get(pnu) { return this.map.get(pnu); }
  dump() { return []; }                   // 이어 열기 캐시 없음 — 새로 받는다(서버 정본)
  seed() { return this; }
  get size() { return this.map.size; }
}
