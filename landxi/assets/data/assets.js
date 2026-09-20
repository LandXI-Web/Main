// 자산 종류 선언 — 파일마다 무엇을 보여 주고 무엇을 할 수 있는가 (2026-09-20 발주자 지적)
//
//   "업로드 완료를 보면 **엑셀도 지도 레이어 발행 버튼**이 있네?"
//   "정사영상을 클릭해 보면 하나는 **지도와 겹쳐서 보이고** 하나는 **그냥 이미지만 보이고**"
//   "이런 것도 좀 **통일성있게 잘 체계적으로** 해야지. 이런 것도 제대로 설계가 안되어있는 거 같자나"
//
// ── 맞는 지적이다 ──────────────────────────────────────────────────────────
// 지금까지는 파일을 만날 때마다 화면이 임기응변으로 처리했다. 그래서 엑셀에 지도 발행
// 버튼이 붙고, 같은 정사영상인데 누를 때마다 다른 판이 떴다. 버그를 하나씩 고쳐 봐야
// 다음 파일에서 또 어긋난다 — **규칙이 없기 때문이다.**
//
// 카드에서 이미 같은 문제를 풀었다. 카드는 `kind: { input, output, viz }` 를 선언하고
// 화면은 `needsOf()` 만 보고 장치를 켠다(cards.js). 화면은 카드 이름을 모른다.
// 자산도 똑같이 한다 — **파일이 무엇을 가졌는지 선언하고, 화면은 그 선언만 본다.**
//
//   자산 종류(KIND)  그 종류가 원래 가질 수 있는 것
//        +
//   그 파일의 실제 상태(좌표계가 있나 · 타일이 구워졌나)
//        ↓
//   capsOf(file)     이 파일로 **지금** 할 수 있는 일과 보여 줄 것
//
// 규칙 하나: **할 수 없는 일은 버튼을 흐리게 두지 않고 아예 내보내지 않는다.**
// 흐린 버튼은 "언젠가 되나?" 하는 궁금증만 만든다. 대신 왜 못 하는지 한 줄로 말한다.

/* ══ 1. 자산 종류 — 그 종류가 원래 가질 수 있는 것 ═══════════════════════ */
export const ASSET_KINDS = {
  ortho: {
    name: '정사영상', ext: ['tif', 'tiff', 'ecw', 'img'],
    geo: true,            // 좌표를 가질 수 있다
    preview: 'image',     // 미리보기는 그림
    can: ['map', 'tile', 'analyze', 'download'],
    what: '좌표를 가진 항공·드론 영상. 지도에 얹고 타일로 구워 공유한다.',
  },
  vector: {
    name: '공간정보', ext: ['shp', 'geojson', 'gpkg'],
    geo: true,
    preview: 'shape',     // 미리보기는 도형 윤곽
    can: ['map', 'analyze', 'download'],
    what: '점·선·면으로 된 공간자료. 좌표계가 있어야 지도에 얹힌다.',
  },
  imageset: {
    name: '이미지셋', ext: ['jpg', 'jpeg', 'png'],
    geo: false,           // 좌표가 없다 — 학습용 낱장 묶음
    preview: 'image',
    can: ['label', 'analyze', 'download'],
    what: '좌표 없는 낱장 이미지 묶음. 라벨링과 학습에 쓴다.',
  },
  table: {
    name: '표 자료', ext: ['xlsx', 'xls', 'csv'],
    geo: false,
    preview: 'table',     // 미리보기는 표 머리
    can: ['attrs', 'join', 'download'],
    what: '행정정보 같은 표. 필지 번호로 공간자료에 붙여 쓴다.',
  },
  bundle: {
    name: '묶음 파일', ext: ['zip', '7z'],
    geo: false,
    preview: 'tree',      // 미리보기는 안에 든 목록
    can: ['unpack', 'download'],
    what: '여러 파일을 묶은 것. 풀어야 무엇인지 안다.',
  },
};

/** 할 수 있는 일의 이름과 설명 — 화면은 이 말을 그대로 쓴다. */
export const CAPS = {
  map: { name: '지도에서 보기', what: '좌표를 읽어 지도 위에 얹는다' },
  tile: { name: '타일 생성', what: '웹에서 볼 수 있게 구워 둔다 — 기관에 공유하는 것은 이것이다' },
  analyze: { name: '분석에 쓰기', what: 'AI 분석의 입력으로 넣는다' },
  label: { name: '라벨링', what: '학습데이터를 만든다' },
  attrs: { name: '속성 보기', what: '행과 열을 표로 연다' },
  join: { name: '공간자료에 붙이기', what: '필지 번호 같은 열쇠로 이어 붙인다' },
  unpack: { name: '풀기', what: '묶음을 풀어 안의 파일을 낱개로 등록한다' },
  download: { name: '내려받기', what: '원본을 받는다' },
};

/** 확장자 → 종류. 목록에 없으면 null(모르는 것을 아는 척하지 않는다). */
export function kindOf(name = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  const hit = Object.entries(ASSET_KINDS).find(([, k]) => k.ext.includes(ext));
  return hit ? hit[0] : null;
}

/* ══ 2. 이 파일로 지금 할 수 있는 일 ═══════════════════════════════════
 * 종류가 원래 가질 수 있는 것 ∩ 이 파일이 실제로 가진 것.
 * 좌표계가 없는 shp 은 `지도에서 보기` 를 내보내지 않는다 — 버튼을 흐리게 두지 않고 뺀다.
 */
export function capsOf(file = {}) {
  const kindId = file.kind && ASSET_KINDS[file.kind] ? file.kind : kindOf(file.name);
  const kind = ASSET_KINDS[kindId];
  if (!kind) {
    return { kindId: null, kind: null, caps: ['download'], preview: null,
      blocked: [{ cap: 'map', why: '무슨 형식인지 알 수 없다 — 등록된 자산 종류가 아니다' }] };
  }
  const caps = [], blocked = [];
  // 지도에 얹으려면 **범위(bounds)** 가 있어야 한다. 좌표계만 있고 범위가 없는 파일은 얹을 데를 모른다.
  // (2026-09-20 보강: 원래 `bounds || crs` 였는데, 그러면 아래 whyNoGeo 의 `좌표계는 있으나 범위가 없다`
  //  가지가 영영 닿지 않는다 — 규칙이 스스로 준비해 둔 자리를 쓰지 못하고 있었다.
  //  아카이브 `남원 도로파손 라벨 쉐입`(EPSG:5186 선언, 기하 파일 없음)이 바로 그 경우다.)
  const hasGeo = kind.geo && !!file.bounds;

  kind.can.forEach((c) => {
    if ((c === 'map' || c === 'tile') && !hasGeo) {
      blocked.push({ cap: c, why: whyNoGeo(kindId, file) });
      return;
    }
    if (c === 'tile' && kindId === 'vector') return;     // 벡터는 타일을 굽지 않는다
    caps.push(c);
  });
  return { kindId, kind, caps, blocked, hasGeo, preview: kind.preview };
}

/** 좌표가 없는 이유는 형식마다 다르다. 뭉뚱그리지 않는다. */
function whyNoGeo(kindId, file) {
  if (kindId === 'ortho') {
    return file.crs
      ? '좌표계는 있으나 범위(bounds)가 없다 — 월드파일(.tfw)이나 GeoTIFF 태그를 확인해야 한다'
      : '좌표 정보가 없다 — 월드파일(.tfw)이나 GeoTIFF 태그가 없어 지도에 얹을 수 없다';
  }
  if (kindId === 'vector') {
    return file.crs
      ? `좌표계(${file.crs})는 있으나 기하 범위가 없다 — 원본 도형 파일(.shp · .shx · .dbf)을 다시 올려야 지도에 얹을 수 있다`
      : '좌표계가 없다 — .prj 를 함께 올려야 지도에 얹을 수 있다';
  }
  return '좌표를 가지지 않는 자료다';
}

/* ══ 3. 화면이 읽는 두 줄 ═══════════════════════════════════════════════ */

/** 이 파일을 누르면 오른쪽 판에 무엇이 서나 — 종류가 같으면 **같은 자리에 같은 모양**이다. */
export function panelOf(file = {}) {
  const c = capsOf(file);
  if (!c.kind) return { head: '알 수 없는 형식', body: 'none', note: c.blocked[0].why, caps: c.caps };
  const geoBlocked = c.blocked.find((b) => b.cap === 'map');
  return {
    head: c.kind.name,
    // 지도 자리는 늘 같은 자리다. 좌표가 있으면 지도가, 없으면 그 이유가 그 자리에 선다.
    body: c.hasGeo ? 'map' : (geoBlocked ? 'map-gap' : c.preview),
    note: geoBlocked ? geoBlocked.why : c.kind.what,
    caps: c.caps, blocked: c.blocked, preview: c.preview,
  };
}

/** 목록 타일의 미리보기 종류 — 그림 · 도형 · 표 · 목록. 없는 것을 지어내지 않는다. */
export const previewOf = (file) => (capsOf(file).preview || 'none');

/** 점검용 — 자산 대장에 규칙을 어기는 줄이 있나. 배포 전에 비어 있어야 한다. */
export function assetCheck(list = []) {
  const bad = [];
  list.forEach((f) => {
    const k = kindOf(f.name);
    if (!k) bad.push({ file: f.name, why: '등록되지 않은 확장자 — ASSET_KINDS 에 더하거나 목록에서 빼야 한다' });
    else if (ASSET_KINDS[k].geo && !f.bounds && !f.crs) bad.push({ file: f.name, why: whyNoGeo(k, f) });
  });
  return { ok: !bad.length, rows: bad };
}
