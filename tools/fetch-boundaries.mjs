// 대한민국 행정경계(시도/시군구/국가 외곽선) 실데이터를 내려받아 웹용으로 단순화한다.
//
// 소스 1 (경계 지오메트리 + 현재 법정동코드): raqoon886/Local_HangJeongDong
//   https://github.com/raqoon886/Local_HangJeongDong (2021-04 vuski/admdongkor 스냅샷의 시도별 재배포본)
//   원본: vuski/admdongkor https://github.com/vuski/admdongkor (행정안전부/통계청 SGIS 행정동 경계)
//   라이선스: 코드(스크립트)는 MIT, 데이터는 CC BY 4.0 + 공공누리 제1유형(출처표시) — LICENSE-DATA 참고.
// 소스 2 (2018 KOSTAT 코드 대조용, code2018 필드에만 사용): southkorea/southkorea-maps
//   https://github.com/southkorea/southkorea-maps (kostat/2018 vintage, KOSTAT 통계지리정보서비스 SGIS 코드)
//
// raqoon886 데이터는 2021-04 스냅샷이라 강원도(42)/전라북도(45)가 아직 특별자치도 개편 전 이름·코드다.
// 개편 이후 실제 행정코드(강원=51, 전북=52)로 이 스크립트에서 직접 치환한다(RENAME_SIDO).
// 전주시 완산구(45111)/덕진구(45113)는 landxi/assets/data/geo/sigungu-sample.geojson 관례에 맞춰
// 병합 전 시(市) 단위 코드(45110→52110)로 합친다.
//
// 실행: node tools/fetch-boundaries.mjs
// 의존성: Node 24 내장 fetch/fs 만 사용, 단순화는 `npx mapshaper` 호출로 수행(레포에 mapshaper를 의존성으로 추가하지 않음).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const OUT_DIR = 'landxi/assets/data/geo';
const CACHE_DIR = path.join(os.tmpdir(), 'landxi-boundary-cache');

const RAQOON_BASE = 'https://raw.githubusercontent.com/raqoon886/Local_HangJeongDong/master/';
const RAQOON_SOURCE_NOTE =
  'raqoon886/Local_HangJeongDong (vuski/admdongkor 2021-04 스냅샷 재배포, 원출처: 행정안전부·통계청 SGIS 행정동 경계)';
const RAQOON_LICENSE = 'CC BY 4.0 + 공공누리 제1유형(출처표시 필요) — https://github.com/vuski/admdongkor/blob/master/LICENSE-DATA';

const SOUTHKOREA_MAPS_PROVINCES =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-geo.json';
const SOUTHKOREA_MAPS_MUNI =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json';

// raqoon886 저장소의 17개 시도 파일명(2021-04 스냅샷 기준 옛 이름을 그대로 사용)
const SIDO_FILE_NAMES = [
  '강원도', '경기도', '경상남도', '경상북도', '광주광역시', '대구광역시', '대전광역시', '부산광역시',
  '서울특별시', '세종특별자치시', '울산광역시', '인천광역시', '전라남도', '전라북도', '제주특별자치도',
  '충청남도', '충청북도',
];

// 특별자치도 개편으로 시도코드·이름이 바뀐 곳만 치환한다 (2018/2021 스냅샷의 옛 코드 → 현재 코드).
const RENAME_SIDO = {
  '42': { code: '51', name: '강원특별자치도' }, // 강원도 → 강원특별자치도 (2023-06)
  '45': { code: '52', name: '전북특별자치도' }, // 전라북도 → 전북특별자치도 (2024-01)
};

// 2018 스냅샷 이후 이름이 바뀐 시군구(코드는 그대로) — code2018 대조용 별칭.
const NAME_ALIAS_2018 = {
  '인천광역시|미추홀구': '인천광역시|남구', // 2018-07 개칭
};

function log(...args) {
  console.log(...args);
}

function cacheKeyFor(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

async function fetchCached(url, label) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${cacheKeyFor(url)}.json`);
  if (fs.existsSync(cachePath)) {
    log(`CACHE ${label}`);
    return fs.readFileSync(cachePath, 'utf8');
  }
  log(`FETCH ${label}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  fs.writeFileSync(cachePath, text);
  return text;
}

function runMapshaper(args) {
  const res = spawnSync('npx', ['--yes', 'mapshaper', ...args], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    throw new Error(`mapshaper failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function withMapshaper(inputObj, mapshaperArgs) {
  const tmpIn = path.join(CACHE_DIR, `tmp-in-${crypto.randomBytes(6).toString('hex')}.geojson`);
  const tmpOut = path.join(CACHE_DIR, `tmp-out-${crypto.randomBytes(6).toString('hex')}.geojson`);
  fs.writeFileSync(tmpIn, JSON.stringify(inputObj));
  const output = runMapshaper([tmpIn, ...mapshaperArgs, '-o', tmpOut, 'format=geojson']);
  const result = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
  fs.rmSync(tmpIn, { force: true });
  fs.rmSync(tmpOut, { force: true });
  return { result, log: output };
}

async function loadAllDong() {
  const all = [];
  for (const name of SIDO_FILE_NAMES) {
    const url = RAQOON_BASE + `hangjeongdong_${encodeURIComponent(name)}.geojson`;
    const text = await fetchCached(url, `raqoon886 ${name}`);
    const geo = JSON.parse(text);
    for (const feat of geo.features) {
      const p = feat.properties;
      let sgg = p.sgg;
      let sggnm = p.sggnm;
      // 전주시 완산구/덕진구 → 전주시(시 단위 코드)로 병합 — sigungu-sample.geojson 관례를 따른다.
      if (sgg === '45111' || sgg === '45113') {
        sgg = '45110';
        sggnm = '전주시';
      }
      all.push({
        type: 'Feature',
        properties: { sgg, sggnm, sido: p.sido, sidonm: p.sidonm },
        geometry: feat.geometry,
      });
    }
  }
  return { type: 'FeatureCollection', features: all };
}

function newSidoCodeName(oldCode, oldName) {
  return RENAME_SIDO[oldCode] || { code: oldCode, name: oldName };
}

function buildCode2018Join(provincesJson, municipalitiesJson) {
  const provByCode = {};
  for (const f of provincesJson.features) provByCode[f.properties.code] = f.properties.name;
  const join = {};
  for (const f of municipalitiesJson.features) {
    const p = f.properties;
    const sidoName = provByCode[p.code.slice(0, 2)];
    join[`${sidoName}|${p.name}`] = p.code;
  }
  return join;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── 1) 읍면동 단위 원자료 수집 (실제 WGS84 경계, 현재 5자리 법정동코드 포함) ──
  const allDong = await loadAllDong();
  log(`읍면동 features: ${allDong.features.length}`);

  const provincesJson = JSON.parse(await fetchCached(SOUTHKOREA_MAPS_PROVINCES, 'southkorea-maps provinces 2018'));
  const municipalitiesJson = JSON.parse(await fetchCached(SOUTHKOREA_MAPS_MUNI, 'southkorea-maps municipalities 2018'));
  const join2018 = buildCode2018Join(provincesJson, municipalitiesJson);

  // ── 2) 읍면동 → 시군구 dissolve ──
  const { result: sigunguRaw } = withMapshaper(allDong, ['-dissolve', 'fields=sgg,sggnm,sido,sidonm']);
  log(`시군구 features (raw): ${sigunguRaw.features.length}`);

  // ── 3) 시군구 → 시도 dissolve ──
  const { result: sidoRaw } = withMapshaper(sigunguRaw, ['-dissolve', 'fields=sido,sidonm']);
  log(`시도 features (raw): ${sidoRaw.features.length}`);

  // ── 4) 시도 코드/이름 개편 반영 + 최종 속성 구성 ──
  const sidoNormalized = {
    type: 'FeatureCollection',
    features: sidoRaw.features.map((f) => {
      const { code, name } = newSidoCodeName(f.properties.sido, f.properties.sidonm);
      return { type: 'Feature', properties: { code, name }, geometry: f.geometry };
    }),
  };

  let code2018Matched = 0;
  const code2018Unmatched = [];
  const sigunguNormalized = {
    type: 'FeatureCollection',
    features: sigunguRaw.features.map((f) => {
      const p = f.properties;
      const { code: sidoCode, name: sidoName } = newSidoCodeName(p.sido, p.sidonm);
      const code = sidoCode + p.sgg.slice(2);
      let key = `${p.sidonm}|${p.sggnm}`;
      if (NAME_ALIAS_2018[key]) key = NAME_ALIAS_2018[key];
      const code2018 = join2018[key] || null;
      if (code2018) code2018Matched++;
      else code2018Unmatched.push(`${p.sidonm} ${p.sggnm} (신규코드 ${code})`);
      return {
        type: 'Feature',
        properties: { code, name: p.sggnm, sido: sidoName, code2018 },
        geometry: f.geometry,
      };
    }),
  };
  log(`code2018 매칭: ${code2018Matched}/${sigunguNormalized.features.length} (미매칭: ${code2018Unmatched.join(', ') || '없음'})`);

  // ── 5) 웹용 단순화 (mapshaper -simplify, keep-shapes로 작은 구/섬이 소실되지 않게 함) ──
  const { result: sidoSimplified, log: sidoLog } = withMapshaper(sidoNormalized, [
    '-simplify', '3%', 'keep-shapes',
    '-clean',
  ]);
  const { result: sigunguSimplified, log: sigunguLog } = withMapshaper(sigunguNormalized, [
    '-simplify', '4%', 'keep-shapes',
    '-clean',
  ]);

  const sidoOut = {
    type: 'FeatureCollection',
    source: `${RAQOON_SOURCE_NOTE} — ${RAQOON_BASE}`,
    license: RAQOON_LICENSE,
    note: '시도 17개, mapshaper -simplify 3% keep-shapes -clean 으로 단순화. 강원/전북은 특별자치도 개편 후 코드(51/52)·이름 반영.',
    features: sidoSimplified.features,
  };

  const sigunguOut = {
    type: 'FeatureCollection',
    source: `${RAQOON_SOURCE_NOTE} — ${RAQOON_BASE}`,
    license: RAQOON_LICENSE,
    note:
      '시군구 249개(전국 250개 시군구 중 전주시 완산구·덕진구를 전주시 52110 하나로 병합해 1개 감소). ' +
      'code 는 현재(강원=51/전북=52 반영) 5자리 법정동코드, code2018 은 southkorea-maps 2018 KOSTAT 코드(대조 실패 시 null). ' +
      'mapshaper -simplify 4% keep-shapes -clean 으로 단순화.',
    features: sigunguSimplified.features,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'sido.geojson'), JSON.stringify(sidoOut));
  fs.writeFileSync(path.join(OUT_DIR, 'sigungu.geojson'), JSON.stringify(sigunguOut));
  log(`sido.geojson: ${sidoOut.features.length} features, ${fs.statSync(path.join(OUT_DIR, 'sido.geojson')).size} bytes`);
  log(`sigungu.geojson: ${sigunguOut.features.length} features, ${fs.statSync(path.join(OUT_DIR, 'sigungu.geojson')).size} bytes`);
  log(sidoLog.trim());
  log(sigunguLog.trim());

  // ── 6) 국가 외곽선 (mainland + 제주 + 주요 섬) ──
  const { result: nationalDissolved } = withMapshaper(sigunguRaw, ['-dissolve']);
  // no-fields dissolve 는 GeometryCollection 을 만들므로 단일 Feature 로 다시 감싼다.
  const nationalGeometry = nationalDissolved.geometries
    ? nationalDissolved.geometries[0]
    : nationalDissolved.features[0].geometry;
  const nationalFeature = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: '대한민국' }, geometry: nationalGeometry }],
  };
  const { result: nationalSimplified, log: nationalLog } = withMapshaper(nationalFeature, [
    '-simplify', '5%', 'keep-shapes',
    '-filter-islands', 'min-area=3km2',
    '-clean',
  ]);

  const koreaOutlineOut = {
    type: 'FeatureCollection', // 기존 placeholder 파일과 동일한 최상위 shape 유지 (type/note/features)
    note: `실제 해안선(본토+제주+주요 도서, 면적 3km² 미만 섬 생략). 출처: ${RAQOON_SOURCE_NOTE}`,
    source: RAQOON_BASE,
    license: RAQOON_LICENSE,
    features: nationalSimplified.features,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'korea-outline.geojson'), JSON.stringify(koreaOutlineOut));
  log(`korea-outline.geojson: ${fs.statSync(path.join(OUT_DIR, 'korea-outline.geojson')).size} bytes`);
  log(nationalLog.trim());

  log('완료.');
}

await main();
