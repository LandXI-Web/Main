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

/** ① 전국 결과 지도(10-22 첫인상-메인 ⓐ) — 공개 그림 한 장의 설명서(범위 · 기준 해 · 종류 색). 결과 조각(/tiles/national)은 로그인 뒤라 부르지 않는다(옆문 규칙) */
export async function nationalStill() {
  const base = await local('national-result.json');
  /* 숫자는 공개 API(GET /public/national — XI맵과 같은 장부 · 같은 셈)가 있으면 그 값, 없으면 사본(만든 날 값) */
  const s = await server('/public/national');
  const K = { farm: ['farm', '경작지'], greenhouse: ['farm', '비닐하우스'], river: ['river', '건물'] };
  if (s?.assets) {
    const v = (e) => (e && typeof e === 'object' ? e.value : e);
    base.classes = base.classes.map((c) => { const x = s.assets[K[c.key][0]]?.counts?.[K[c.key][1]]; return x ? { ...c, n: v(x.net ?? x.n), km2: v(x.km2) } : c; });
    if (s.imagery) base.imagery = s.imagery;
    SRC.national = 'server';
  } else SRC.national = 'public-copy';
  return base;
}

/** (지난 필지 장면 · 지금 메인은 쓰지 않음) 익명 필지 카드 1 */
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

/** ch4 · ch5 · 지금까지의 실적(QA-Q2 ⓐ · QA-Q3 ⓐ) — 결과를 낸 시군구 · 서비스 · 운영 기관 · 행정 업무 서비스 이름. 서버가 그 자리에서 센다(사본 없음 · 못 읽으면 null) */
export async function record() {
  const r = await server('/public/record');
  SRC.record = r ? 'server' : 'none';
  return r;
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
