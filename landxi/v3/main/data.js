/* data.js — 게스트 메인의 숫자·지오메트리 한 출처.
   서버 공개 API(§3 S-3 · S-4 · S-6 · S-7)가 열려 있으면 그것을 읽고, 아직 없으면 같은 모양의 공개 사본(./data/*.json)을 읽는다.
   사본은 tools/build-data.py 가 실데이터(전국 하천구역 건물 점유 분석 · 연속지적 × AI 판독 · 배포 기록)로 만든다 — 지어낸 숫자 0.
   hasRoute() 로 먼저 확인해 없는 경로를 부르지 않는다(404 콘솔 오류 0). */
import { api, hasRoute, isEnvelope, session, API } from '../kit/util.js';
import { devlog } from '../kit/dev-drawer.js';

const LOCAL = new URL('./data/', import.meta.url).href;
const local = (f) => fetch(LOCAL + f).then((r) => (r.ok ? r.json() : Promise.reject(new Error(f))));
export const SRC = {};   // 어디서 왔는가(개발자 서랍만)

/* 게스트가 부를 수 있는 경로인가 — /public/* 는 경로가 있으면, 기존 경로의 ?public=1 은 계약에 public 인자가 있을 때만(없으면 로그인 전용 → 부르지 않는다) */
let OAS = null;
async function guestOk(path) {
  const [p, q] = path.split('?');
  if (!(await hasRoute(p))) return false;
  if (p.startsWith('/public/') || session.get()) return true;
  if (!/(^|&)public=1/.test(q || '')) return false;
  OAS ||= fetch(API.prefix + '/openapi.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const j = await OAS;
  const op = j?.paths?.['/api/v1' + p]?.get || j?.paths?.[p]?.get;
  if (op && !op.parameters) return true;   // 바깥 주소의 줄인 계약(공개 관문 slimOpenapi)은 인자 목록을 싣지 않는다 — 경로가 있으면 부른다(서버 카드 이름 한 출처)
  return !!op?.parameters?.some((x) => x.name === 'public');
}

async function server(path, pick) {
  try {
    if (!(await guestOk(path))) return null;
    const j = await api(path);
    return pick ? pick(j) : j;
  } catch { return null; }
}

/** ch1 · 전국 하천구역 건물 점유(시군구) — 경계는 사본, 값은 서버가 있으면 서버 */
export async function riverStats() {
  const base = await local('public-stats.json');
  const s = await server('/public/stats?set=river-occupy&by=sigungu');
  if (s && isEnvelope(s.total)) {
    const by = new Map((s.items || []).map((r) => [String(r.sgg_cd), r]));
    for (const f of base.geojson.features) { const r = by.get(String(f.properties.sgg_cd)); if (r) f.properties.value = isEnvelope(r.value) ? r.value.value : r.value ?? f.properties.value; }
    base.total = s.total; if (isEnvelope(s.n_sgg)) base.n_sgg = s.n_sgg;
    SRC.stats = 'server';
  } else SRC.stats = 'public-copy';
  devlog('ch1', SRC.stats);
  return base;
}

/** ch2 · 익명 필지 카드 1 */
export async function sampleParcel() {
  const s = await server('/public/sample-parcel');
  if (s && s.parcel && s.ledger) { SRC.parcel = 'server'; return s; }
  SRC.parcel = 'public-copy';
  return local('sample-parcel.json');
}

/** ch3 · XI ChatGEO 장면(남원시 비닐하우스 — 원판 모델 결과 파일 값 · 동 면 · 읍면동 집계) */
export const agentScene = () => local('greenhouse-scene.json');

/** ch4 · ch5 · 실결과 있는 배포본과 카드 */
export async function deploys() {
  const [c, d] = await Promise.all([server('/registry/cards?public=1'), server('/deploys?public=1')]);
  if (c?.items && d?.items) {
    SRC.deploys = 'server';
    return { cards: c.items, deploys: d.items.map((x) => ({ ...x, center: x.center || centerOf(x.aoi), bbox: x.bbox || null })) };
  }
  SRC.deploys = 'public-copy';
  return local('public-deploys.json');
}

/** ch6 · 키르기스스탄 군별 농경지 — 이미 있는 실제 분석 결과(Sentinel-2 10 m AI 토지피복 2025 · 군 폴리곤 안 경작지 면적)의 공개 사본(tools/build-kgz.py) */
export const kgzCrop = () => local('kgz-crop-2025.json');

/** ch6 · 키르기스스탄 1단계 행정구역(읽기) */
export const kgz = () => fetch('/landxi/global/data/kgz-adm1.geojson').then((r) => r.json());

function centerOf(g) {
  if (!g) return null;
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(walk); };
  walk(g.coordinates);
  return [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2];
}
