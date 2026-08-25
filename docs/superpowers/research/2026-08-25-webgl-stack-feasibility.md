# Land-XI WebGL 시네마틱 스택 실현가능성 조사

작성일 2026-08-25 · 조사자 Claude (research agent) · 제품 코드 변경 없음
검증 프로브 위치: `C:\Users\oem\AppData\Local\Temp\claude\F--Land-XI-----01-----\67e4a754-5f9b-4174-a3aa-cdbbaade48d2\scratchpad\tech-probe\`
(`probe.html` v6 검증 / `probe2.html` v5+deck 검증 / `probe3.html` 권장 스택 통합 검증 / `shot.html` 시각 캡처 / `run.mjs`, `shot.mjs` 러너)

---

## 0. 핵심 결론 (먼저 읽을 것)

1. **MapLibre는 v5.6.0에 고정한다. v6로 올리면 안 된다.** v6.6.0은 2026년 현재 최신이지만 **ESM 전용 + UMD 번들 삭제**이고, 무엇보다 **deck.gl 9.3.10이 v6와 호환되지 않는다**. 브라우저 실측으로 확인했다 (§2).
2. **위성/항공 베이스맵은 키 없이 100% 가능하다.** V-World `xdworld` 위성 타일(z5~z19, 한국), EOX Sentinel-2 cloudless(전지구), NASA GIBS, Esri World Imagery 전부 `Access-Control-Allow-Origin: *`로 GitHub Pages 오리진에서 직접 로드된다. API 키·도메인 등록 불필요. 실측 검증 완료 (§3).
3. **"WebGL급 시네마틱"은 이 제약(정적 사이트·빌드 없음·CDN)에서 충분히 달성 가능하다.** 글로브+대기광+지형+deck.gl 인터리브드+three.js glTF+블룸 컴포저를 **한 페이지에서 전부 동시에** 띄우고 오류 0으로 렌더하는 것을 실측했다 (§5, §9).
4. **성능의 유일한 절벽은 `setTerrain`이다.** 소프트웨어 렌더러 기준 지형 OFF 66fps → 지형 ON 2.4fps (27배). 지형은 "특정 장면에서만 켜는 연출 도구"로 다뤄야 하며 상시 켜두면 안 된다 (§7).
5. **GSAP 전 플러그인이 2025년부터 상업용 포함 완전 무료**다(Webflow 인수 후). ScrollTrigger/Flip/SplitText 모두 CDN으로 바로 쓸 수 있다 (§6).

---

## 1. 검증 방법 및 환경

실제 브라우저에서 돌려서 확인했다. 문서만 읽고 추정한 항목은 본문에 `[문서 기준]`으로 표시했다.

- 러너: 프로젝트에 이미 설치된 `@playwright/test@1.62.1` + `chromium-1223` (HeadlessChrome/148)
- 고사양 기준선: `--use-angle=d3d11` → `ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)`
- 저사양 기준선: `--use-angle=swiftshader` → `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` (순수 CPU 래스터라이저)
- vsync 해제(`--disable-frame-rate-limit --disable-gpu-vsync`)로 상대 비교가 가능하게 함
- 뷰포트 1280×800 (FPS 측정) / 1440×900 (스크린샷)

> ⚠️ **주의**: 목표 기기인 "사무용 Windows 노트북 + Intel iGPU"는 이 두 기준선 **사이**에 있다. SwiftShader는 Intel Iris Xe보다 훨씬 느리므로 하한이고, 4090은 상한이다. §7에 추정 밴드를 제시했지만 **실제 사무용 노트북에서 `probe3.html`을 한 번 돌려보는 것을 강력히 권장한다** (파일 그대로 복사해서 `npx serve` 후 열기만 하면 됨).

---

## 2. MapLibre 버전 결정 — v5.6.0 고정 (가장 중요한 결정)

### 2.1 v6는 무엇이 바뀌었나

- 최신 배포: `maplibre-gl@6.6.0` (npm registry 실측, 2026-08-25 기준)
- **ESM 전용.** UMD 번들과 CSP 전용 빌드가 삭제되었다. `dist/maplibre-gl.js` → `dist/maplibre-gl.mjs`
- **WebGL2 필수.** WebGL1 폴백 제거
- `import maplibregl from 'maplibre-gl'` → `import * as maplibregl from 'maplibre-gl'` (default export 제거)
- `#pragma mapbox` → `#pragma maplibre` (커스텀 셰이더 영향)
- `styleimagemissing` 이벤트 → `Map#setMissingStyleImageResolver(id => ...)`
- `GeoJSONSource.setData`의 2번째 인자 `waitForCompletion` 제거, 체이닝용 `this` 반환 안 함
- GeoJSON feature properties의 중첩 객체/배열이 JSON 문자열이 아니라 **객체 그대로** 보존됨 → `JSON.parse(props.info)` 하던 코드 전부 깨짐
- `zoomLevelsToOverscale` 기본값 4로 변경 → `queryRenderedFeatures` 동작 미세 변화
- 성능 개선: 지형 렌더링 FBO 공유/텍스처 재사용, feature-state 약 3.4배 고속화, NPOT 래스터 타일 밉맵 지원

출처: <https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/> · <https://github.com/maplibre/maplibre-gl-js/issues/6427> · <https://geo.malagis.com/maplibre-gl-js-v6-mandatory-webgl-and-esm-only.html>

### 2.2 v6를 쓰면 안 되는 이유 — deck.gl 비호환 (실측)

`probe.html`에서 MapLibre 6.6.0(ESM) + deck.gl 9.3.10(UMD) + globe 조합을 실행한 결과:

| 항목 | 결과 |
|---|---|
| `maplibre-gl@6.6.0/dist/maplibre-gl.mjs` 동적 import | ✅ 성공 |
| globe + `sky` + `light` + raster 베이스 로드 | ✅ 성공 |
| `setTerrain` (terrarium) | ✅ 성공, `queryTerrainElevation` 162.7m 반환 |
| `setProjection({type:'mercator'})` ↔ `globe` 왕복 | ✅ 성공 |
| `setProjection({type:['interpolate',['linear'],['zoom'],4,'vertical-perspective',7,'mercator']})` | ✅ 성공 (줌 기반 투영 전환 표현식) |
| CustomLayerInterface (WebGL2 컨텍스트) | ✅ `gl instanceof WebGL2RenderingContext === true` |
| **`deck.MapboxOverlay({interleaved:true})`** | ❌ **`Cannot read properties of undefined (reading 'elevation')`** |
| **`deck.MapboxOverlay({interleaved:false})`** | ❌ **`Unsupported projection`** |

동일 코드를 MapLibre 5.6.0으로 바꾼 `probe2.html`에서는 **인터리브드/오버레이드 둘 다 오류 0으로 동작**했다.

즉 deck.gl 9.3.10은 아직 MapLibre v6의 투영/고도 내부 API를 따라가지 못했다. deck.gl 공식 문서도 여전히 `maplibre-gl@^4.0.0`을 예제 CDN으로 명시한다.
출처: <https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre>

### 2.3 v5에서 확인된 API 표면 (실측)

`probe.html`/`probe2.html`에서 존재 확인:

```
setProjection ✅  setSky ✅  setLight ✅  setTerrain ✅  queryTerrainElevation ✅
flyTo ✅  easeTo ✅  jumpTo ✅  setFeatureState ✅  maplibregl.addProtocol ✅
setPaintProperty ✅  cameraForBounds ✅  setVerticalFieldOfView ✅
setCenterClampedToGround ✅  setCenterElevation ✅
getFreeCameraOptions ❌ (MapLibre에는 없음 — Mapbox 전용 API)
```

> `getFreeCameraOptions`가 없다는 점이 중요하다. Mapbox 예제에서 흔히 보는 "자유 카메라로 경로 따라 비행" 연출은 MapLibre에서 그대로 안 된다. 대신 `easeTo`/`jumpTo`를 rAF로 매 프레임 호출하는 방식(§4.3)으로 구현해야 한다.

### 2.4 v6 전환 시점

deck.gl이 MapLibre v6를 지원하는 릴리스가 나오면 재검토한다. 확인 방법: `probe.html`을 그대로 다시 돌려 `deck-interleaved-globe`가 OK로 바뀌는지 보면 된다. deck.gl 이슈 트래커에서 관련 항목: <https://github.com/visgl/deck.gl/issues/9466> (globe↔mercator 전환 시 deck 동기화 문제), <https://github.com/visgl/deck.gl/issues/9554> (globe에서 IconLayer 깨짐), <https://github.com/visgl/deck.gl/issues/7920>

---

## 3. 위성/항공 영상 베이스맵 (신규 요구사항)

> 클라이언트 지시: **베이스맵은 위성/항공 영상**이어야 하고, 벡터 스타일은 라벨/경계 오버레이로만 쓴다.

### 3.1 소스별 실측 검증표

전부 `Origin: https://example.github.io` / `Referer: https://example.github.io/` 헤더를 붙여 curl로 확인했다.

| 소스 | 타일 URL 템플릿 | HTTP | CORS | 줌 | 형식 | 키 | 라이선스/표기 |
|---|---|---|---|---|---|---|---|
| **V-World 위성 (keyless)** | `https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg` | 200 | `*` | ~5–19 (z18/z19 실측 200) | JPEG 256px | **불필요** | 「© V-World / 국토교통부」 표기 권장 |
| **V-World 하이브리드(라벨+경계)** | `https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png` | 200 | `*` | ~5–19 | PNG(투명) 256px | 불필요 | 동일 |
| **V-World 배경(벡터풍 래스터)** | `https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png` | 200 | `*` | ~5–19 | PNG 256px | 불필요 | 동일 |
| **EOX Sentinel-2 cloudless 2024** | `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg` | 200 | 요청 Origin 에코 | 0–~15 | JPEG 256px | 불필요 | 「Sentinel-2 cloudless © EOX IT Services GmbH」 필수(CC BY-NC-SA 4.0 — **비상업 조건 확인 필요**) |
| **EOX Sentinel-2 cloudless 2020** | `.../s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg` | 200 | 동일 | 0–~15 | JPEG | 불필요 | 동일 |
| **Esri World Imagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | 200 | `*` | 0–19 | JPEG 256px | 불필요 | Esri 이용약관: ArcGIS 제품 내 사용 원칙. **공공 플랫폼 상시 사용은 법무 확인 권장** |
| **NASA GIBS VIIRS 트루컬러(일자별)** | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | 200 | `*` | 0–9 | JPEG | 불필요 | NASA 공개(사실상 퍼블릭 도메인), 「NASA EOSDIS GIBS」 표기 |
| **NASA GIBS 블랙마블(야간등)** | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png` | 200 | `*` | 0–8 | PNG | 불필요 | 동일 |
| **Mapterhorn 지형(DEM)** | `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` | 200 | `*` | 0–**12** (512px), z13+ 404 | WebP terrarium **512px** | 불필요 | BSD-3, 「© Mapterhorn」 표기 |
| **AWS Open Data terrarium DEM** | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | 200 | `*` | 0–**14** (256px) | PNG terrarium 256px | 불필요 | 퍼블릭. SLA 없음 |
| **OpenFreeMap 벡터(라벨/경계)** | `https://tiles.openfreemap.org/planet` (TileJSON) | 200 | `*` | 0–14 | MVT | 불필요 | 「OpenFreeMap © OpenMapTiles / OpenStreetMap」 |

**V-World 키 발급형 WMTS**도 별도로 존재한다:
`https://api.vworld.kr/req/wmts/1.0.0/{apiKey}/{layer}/{z}/{y}/{x}.{ext}` (layer = `Base`|`gray`|`midnight`|`Satellite`|`Hybrid`)
- 더미 키로 호출 시 `Access-Control-Allow-Origin: *` 헤더와 함께 OWS 예외 XML 반환: `<ExceptionText>등록되지 않은 인증키입니다.</ExceptionText>` → **CORS는 열려 있고 키만 검증한다**는 뜻
- 키 발급 시 "WMTS/TMS API" 유형을 선택해야 하고, **인증 도메인 등록이 필요**하다 (`localhost` 개발 시 별도 등록 필요, HTTPS가 아니거나 웹뷰어가 아닌 환경은 `&domain=인증받은도메인` 파라미터 추가)
- Capabilities: `https://api.vworld.kr/req/wmts/1.0.0/{apiKey}/WMTSCapabilities.xml`
- 배경지도 API 문서상 줌 범위는 `min_level: 7, max_level: 18`, 타일 256×256, EPSG:900913
출처: <https://www.vworld.kr/dev/v4dv_baseguide_s001.do> · <https://vworld.kr/dev/v4dv_wmtsguide_s001.do>

> **권장**: 데모/GitHub Pages 단계에서는 **키 없는 `xdworld` 엔드포인트**를 쓴다(도메인 등록 마찰이 없고 z19까지 나온다). 정식 서비스 전환 시 키 발급형 WMTS로 교체할 수 있도록 소스 URL을 상수 1곳(`landxi/assets/js/map/style.js`의 `ORTHO_TILES`처럼)에 모아둔다. **이미 프로젝트가 `xdworld` 위성 URL을 쓰고 있으므로 추가 작업이 거의 없다.**

### 3.2 합성 전략 — 「전지구 위성 → 한국 위성 → 우리 정사영상」 3단 크로스페이드

핵심은 **줌에 따라 raster-opacity를 보간해서 소스를 갈아끼우는 것**이다. `raster-fade-duration`이 타일 교체를 부드럽게 만든다.

```js
// 전지구(z0~7)  : EOX Sentinel-2 cloudless — 구름 없는 예쁜 지구, 글로브 연출용
// 한국(z6~19)   : V-World 위성 — 국내 고해상
// 로컬(z12~19)  : 우리 정사영상 (남원/드론/제주)
// 라벨/경계     : OpenFreeMap 벡터 (한글 라벨 name:ko) 또는 V-World Hybrid
sources: {
  eox:  { type:'raster', tiles:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
          tileSize:256, maxzoom:14, attribution:'Sentinel-2 cloudless © EOX' },
  vsat: { type:'raster', tiles:['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'],
          tileSize:256, minzoom:5, maxzoom:19, attribution:'© V-World' },
  vhyb: { type:'raster', tiles:['https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png'],
          tileSize:256, minzoom:5, maxzoom:19 },
  ofm:  { type:'vector', url:'https://tiles.openfreemap.org/planet' },
  ortho_namwon_2504: { type:'raster', tiles:['assets/tiles/namwon_2504/{z}/{x}/{y}.webp'],
          tileSize:256, minzoom:12, maxzoom:19, bounds:[127.3481,35.5276,127.3567,35.5347] },
  dem:  { type:'raster-dem', tiles:['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
          tileSize:512, maxzoom:12, encoding:'terrarium', attribution:'© Mapterhorn' }
},
layers: [
  { id:'bg', type:'background', paint:{ 'background-color':'#02040a' } },

  // 1단: 전지구 위성 — z7~9 사이에 사라진다
  { id:'eox', type:'raster', source:'eox',
    paint:{ 'raster-fade-duration':300,
            'raster-opacity':['interpolate',['linear'],['zoom'], 7,1, 9,0] } },

  // 2단: 한국 위성 — z6~8 사이에 올라온다. 살짝 채도/대비를 올려 "시네마틱 등급"을 만든다
  { id:'vsat', type:'raster', source:'vsat',
    paint:{ 'raster-opacity':['interpolate',['linear'],['zoom'], 6,0, 8,1],
            'raster-saturation':0.08, 'raster-contrast':0.05,
            'raster-hue-rotate':0, 'raster-fade-duration':300 } },

  // 3단: 우리 정사영상 — 해당 bounds 안에서만, z12부터
  { id:'ortho', type:'raster', source:'ortho_namwon_2504',
    paint:{ 'raster-opacity':['interpolate',['linear'],['zoom'], 12,0, 13.5,1], 'raster-fade-duration':250 } },

  // 오버레이: 벡터 경계 (글로우 라인)
  { id:'boundary', type:'line', source:'ofm', 'source-layer':'boundary',
    filter:['<=',['get','admin_level'],4],
    paint:{ 'line-color':'#7fd8ff', 'line-opacity':0.7, 'line-blur':0.6,
            'line-width':['interpolate',['linear'],['zoom'], 3,0.5, 10,1.6] } },

  // 오버레이: V-World 하이브리드(도로/지명) — 도심에서만
  { id:'vhyb', type:'raster', source:'vhyb',
    paint:{ 'raster-opacity':['interpolate',['linear'],['zoom'], 9,0, 11,0.85] } },

  // 오버레이: 한글 지명 라벨
  { id:'place', type:'symbol', source:'ofm', 'source-layer':'place',
    filter:['==',['get','class'],'city'],
    layout:{ 'text-field':['coalesce',['get','name:ko'],['get','name']],
             'text-font':['Noto Sans Regular'], 'text-size':12 },
    paint:{ 'text-color':'#eaf6ff', 'text-halo-color':'#001018', 'text-halo-width':1.4 } }
],
```

**이 스타일이 실제로 렌더된다는 증거**: `probe3.html`을 1440×900으로 실행해 캡처한 스크린샷 2장이
`scratchpad/tech-probe/v-korea.png`(z6.4, pitch 45 — 한반도 전체가 Sentinel-2 위성 위에 5,000점 히트맵 + deck.gl 아크 + 한글 지명 라벨 + 경계선과 함께 렌더됨)와
`scratchpad/tech-probe/v-namwon.png`(z11.5, pitch 72 — Mapterhorn 지형 기복 위에 V-World 위성 + 하이브리드 도로/지명 + 검출 포인트가 얹힌 시네마틱 사면 뷰)로 남아 있다.
`attributionControl`에 `© VWorld | © Mapterhorn | Sentinel-2 cloudless © EOX | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`이 모두 표시되어 소스가 전부 살아있음이 확인된다.

### 3.3 글로브 스케일 위성 + 대기광 + 주야 터미네이터

```js
const map = new maplibregl.Map({
  container:'map', style, center:[127.5,36], zoom:1.6,
  antialias:true, maxPitch:85
});
```

스타일 JSON에 다음을 넣는다:

```js
projection: { type:'globe' },
sky: {
  'atmosphere-blend': ['interpolate',['linear'],['zoom'], 0,1, 5,1, 7,0], // 줌인하면 대기광 소멸
  'sky-color'        : '#0b1e46',
  'horizon-color'    : '#8fc0f0',
  'fog-color'        : '#e6f0ff',
  'fog-ground-blend' : 0.45,
  'horizon-fog-blend': 0.6,
  'sky-horizon-blend': 0.85
},
light: { anchor:'map', position:[1.5, 90, 80], color:'#ffffff', intensity:0.45 }
```

출처: <https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/>

**주야 터미네이터** 구현 2가지:

1. **SunCalc + `setLight`** (가벼움, 권장). `suncalc@1.9.0`을 CDN으로 로드해 태양 고도/방위를 구하고 `map.setLight({anchor:'map', position:[r, azimuth_deg, polar_deg]})`를 갱신한다. `probe3.html`에서 `SunCalc.getPosition(new Date(),37.5,127)` → `{alt:0.9, az:0.947}` 정상 반환 확인.
   `https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js` (3KB wire)
2. **야간등 레이어 크로스페이드**. NASA GIBS `VIIRS_Black_Marble`을 별도 raster 레이어로 깔고 `raster-opacity`를 태양고도에 따라 rAF로 보간한다. "낮 위성영상 → 밤 도시 불빛"으로 넘어가는 연출이 매우 잘 먹힌다.

참고 구현(MIT, 단일 정적 HTML): <https://github.com/romainoir/Maplibre-Globe> — SunCalc 기반 터미네이터 + 야간등 + 대기광 + 히트맵 블렌딩을 MapLibre 글로브에서 전부 한다. Mapterhorn 지형 사용. **가장 가까운 레퍼런스 구현이므로 반드시 읽어볼 것.**
대안 플러그인: <https://github.com/jonathanlurie/crepuscule> (브라우저에서 주야 타일 동적 생성, z0~22, 박명 그라디언트) — 단 npm CDN 경로 확인 실패, GitHub에서 직접 벤더링 필요.

---

## 4. MapLibre v5 시네마틱 능력 — 항목별 판정

### 4.1 투영 전환 (globe ↔ mercator)

- `map.setProjection({type:'globe'})` / `{type:'mercator'}` — ✅ 실측, 왕복 전환 시 애니메이션이 자동으로 들어간다
- **줌 기반 자동 전환 표현식** — ✅ 실측:
  ```js
  map.setProjection({ type:['interpolate',['linear'],['zoom'], 4,'vertical-perspective', 7,'mercator'] });
  ```
  이걸 스타일에 넣어두면 "우주에서 지구 → 줌인하면 평면 지도"가 **코드 없이 자동으로** 된다. Scene 1→2 전환의 핵심 도구.
- CustomLayer는 `args.defaultProjectionData.projectionTransition` (0=mercator, 1=globe)으로 전환 진행도를 받는다 — ✅ 실측값 `1` 확인
- ⚠️ 알려진 제약: 글로브에서 `calculateFogMatrix is not supported on globe projection.` 경고가 뜬다(무해, 콘솔 노이즈)

### 4.2 지형 (terrain)

```js
map.setTerrain({ source:'dem', exaggeration:1.4 });
map.queryTerrainElevation([127.39, 35.41]); // → 141.45 (남원, Mapterhorn 기준) ✅ 실측
```
- Mapterhorn(권장, Copernicus 30m + swissALTI3D 0.5m): `tileSize:512, maxzoom:12, encoding:'terrarium'`
- AWS terrarium(대체): `tileSize:256, maxzoom:14, encoding:'terrarium'`
- ⚠️ **`encoding:'terrarium'`을 명시하지 않으면 기본값 `'mapbox'`로 해석되어 조용히 틀린 고도가 나온다.** 무료 DEM은 거의 전부 terrarium이다.
- ⚠️ 성능: §7 참조. **이게 유일한 절벽이다.**
- MapLibre 자체 이슈: <https://github.com/maplibre/maplibre-gl-js/issues/7363> "지형 성능 개선 필요 — 특히 회전/피치 및 근거리 상호작용 시" — 고피치에서 FPS가 급락하고 프레임타임이 불안정해진다고 공식 확인됨. 우리 측정과 일치한다.

### 4.3 카메라 연출 (flyTo / easeTo / 체인)

- `flyTo({center, zoom, pitch, bearing, duration, curve, speed, screenSpeed, easing})` — 커스텀 이징 함수 지원 ✅ 실측
  ```js
  map.flyTo({ center:[127.39,35.41], zoom:12.5, pitch:68, bearing:35,
              duration:6000, curve:1.5, easing: t => 1 - Math.pow(1-t, 4) });
  ```
- **체인 카메라 패스**: `map.once('moveend', next)`로 잇거나, GSAP 타임라인으로 카메라 상태 객체를 트윈하고 `onUpdate`에서 `map.jumpTo()`를 호출하는 방식이 훨씬 통제하기 좋다:
  ```js
  const cam = { lng:127.5, lat:36, zoom:2, pitch:0, bearing:0 };
  gsap.timeline({ onUpdate: () => map.jumpTo({ center:[cam.lng,cam.lat], zoom:cam.zoom, pitch:cam.pitch, bearing:cam.bearing }) })
    .to(cam, { zoom:6.4, pitch:45, duration:2.4, ease:'power2.inOut' })
    .to(cam, { lng:127.39, lat:35.41, zoom:12.5, pitch:68, bearing:35, duration:3.2, ease:'power3.inOut' }, '-=0.4');
  ```
  이 패턴이 `getFreeCameraOptions` 부재(§2.3)를 메운다. **GSAP 타임라인 + jumpTo가 사실상의 표준 해법이다.**
- `AnimationOptions.essential: true`로 두면 `prefers-reduced-motion`을 무시한다 — **연출용 애니메이션에는 절대 쓰지 말 것** (§7.3)
- `cameraForBounds(bounds, {padding, pitch, bearing})`로 목표 카메라를 계산해 `easeTo`에 넘기면 "이 지역으로 딱 맞게 들어가기"가 된다

### 4.4 레이어별 연출 도구 — 전부 ✅ 실측 (`probe3.html`의 `layers-present`)

| 기법 | 구현 | 확인 |
|---|---|---|
| 히트맵 | `type:'heatmap'` + `heatmap-weight/radius/opacity` 줌 보간 | ✅ 5,000점 렌더, 글로브에서도 정상 |
| 데이터 흐름 트레일 | `type:'line'` + `lineMetrics:true` 소스 + `line-gradient`(`['line-progress']`) | ✅ |
| 대시 애니메이션 | `setPaintProperty('line-dasharray', [...])`를 rAF에서 오프셋 순환 | ✅ [문서 기준·표준 패턴] |
| 포인트 펄스 | `feature-state` + `circle-radius: ['case',['boolean',['feature-state','hover'],false], 9, 3.2]` + rAF에서 `setFeatureState` | ✅ `setFeatureState/getFeatureState` 동작 확인 |
| 3D 건물 | `fill-extrusion` + `render_height`/`render_min_height` + `fill-extrusion-vertical-gradient` | ✅ OpenFreeMap `building` 레이어 (스키마: OpenMapTiles v3.16) |
| 조명 | `map.setLight({anchor:'map', position:[r,az,polar], color, intensity})` | ✅ |
| 래스터 색보정 | `raster-hue-rotate`, `raster-saturation`, `raster-contrast`, `raster-brightness-min/max`, `raster-fade-duration` | ✅ |
| 커스텀 WebGL2 셰이더 | `CustomLayerInterface` (`type:'custom'`, `renderingMode:'3d'`) | ✅ `gl instanceof WebGL2RenderingContext === true`, render args = `{farZ, nearZ, fov, modelViewProjectionMatrix, projectionMatrix, shaderData, defaultProjectionData, getProjectionData}` |
| 프로토콜 확장 | `maplibregl.addProtocol('pmtiles', protocol.tile)` | ✅ pmtiles 4.5.0과 함께 등록 성공 |

**OpenFreeMap 벡터 레이어 목록** (실측, TileJSON에서 추출):
`aerodrome_label, aeroway, boundary, building, housenumber, landcover, landuse, mountain_peak, park, place, poi, transportation, transportation_name, water, water_name, waterway`
maxzoom 14, 타일 URL `https://tiles.openfreemap.org/planet/{버전}/{z}/{x}/{y}.pbf`, 폰트 `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`

---

## 5. 오버레이 스택 (번들러 없이)

### 5.1 deck.gl — `dist.min.js` UMD 단일 번들

```html
<script src="https://cdn.jsdelivr.net/npm/deck.gl@9.3.10/dist.min.js"></script>
```
1,609KB raw / **446KB wire(gzip)**. 전역 `deck`으로 노출.

**번들에 포함된 것 실측 확인**: `MapboxOverlay, ArcLayer, TripsLayer, ScatterplotLayer, HeatmapLayer, BitmapLayer, TileLayer, ScenegraphLayer, Tile3DLayer, GeoJsonLayer, PathLayer, ColumnLayer, _GlobeView` — 별도 모듈 로드 불필요.

**MapLibre 5.6.0 + globe에서 실측 동작 확인**:
```js
const overlay = new deck.MapboxOverlay({
  interleaved: true,          // MapLibre의 WebGL2 컨텍스트에 직접 그린다
  layers: [
    new deck.ArcLayer({ id:'arcs', data, getSourcePosition:d=>d.s, getTargetPosition:d=>d.t,
      getSourceColor:[0,220,255], getTargetColor:[255,110,0], getWidth:1.6, getHeight:0.4 }),
    new deck.ScenegraphLayer({ id:'drone', data:[{p:[127.39,35.41,900]}],
      scenegraph:'.../Duck.glb', getPosition:d=>d.p, sizeScale:300, _lighting:'pbr' }),
    new deck.TripsLayer({ id:'trips', data, getPath:d=>d.path, getTimestamps:d=>d.timestamps,
      currentTime:t, trailLength:40, widthMinPixels:3, getColor:[0,255,200] })
  ]
});
map.addControl(overlay);   // IControl 인터페이스
```
→ `deck-interleaved` 단계에서 **map error 0건**. Arc 250개 + glTF ScenegraphLayer + TripsLayer 동시 렌더.

**인터리브드 vs 오버레이드**

| | interleaved: true | interleaved: false |
|---|---|---|
| 렌더 대상 | MapLibre의 WebGL2 컨텍스트 (컨텍스트 공유) | MapLibre 컨트롤 컨테이너 안 별도 `<canvas>` |
| 레이어 순서 | `beforeId`/`slot`으로 MapLibre 레이어 사이에 끼울 수 있음 | 항상 지도 위 |
| 지형 가려짐(depth) | 지형/3D건물에 정상적으로 가려짐 ✅ | 항상 위에 뜸 |
| MapLibre 컨트롤/플러그인 | 사용 불가 | 사용 가능 |
| 요구사항 | WebGL2 (`maplibre-gl@>3`) | 없음 |
| 알려진 이슈 | MapLibre v3+deck v9에서 타일 "체커보드" 회귀 보고 (<https://github.com/visgl/deck.gl/issues/8602>) | globe 전환 시 동기화 문제 (#9466) |

**권장**: 지형/건물에 가려져야 하는 것(아크, 궤적, 지상 산점도)은 **interleaved**, HUD성 오버레이는 **overlaid**. 두 오버레이를 동시에 `addControl` 할 수 있다(실측).

deck.gl v9.1(2025-01) 릴리스 노트에 "MapLibre v5 글로브 뷰를 3가지 통합 모드 모두에서 지원"이 명시되어 있다. 출처: <https://deck.gl/docs/whats-new>

### 5.2 three.js — importmap ESM

```html
<script type="importmap">
{"imports":{
  "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"
}}
</script>
<script type="module">
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
  import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
</script>
```
`three.module.js` 127KB wire + 내부적으로 끌어오는 `three.core.js` 257KB wire = **384KB wire**.
`probe3.html` 실측: `THREE.REVISION === "185"`, GLTFLoader/EffectComposer/UnrealBloomPass 전부 로드 ✅

**글로브 위 CustomLayer 패턴** (실측 동작, `three-custom-layer-globe` 단계):
```js
map.addLayer({
  id:'three-orbit', type:'custom', renderingMode:'3d',
  onAdd(map, gl) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene  = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    // ★ MapLibre의 캔버스/컨텍스트를 그대로 재사용한다 (컨텍스트 공유)
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias:true });
    this.renderer.autoClear = false;
    this.composer = new EffectComposer(this.renderer);  // ✅ 생성 성공 확인
    new GLTFLoader().load(url, g => this.scene.add(g.scene));  // ✅ 로드 성공 확인
  },
  render(gl, args) {
    const pd = args.defaultProjectionData;      // { mainMatrix, fallbackMatrix, clippingPlane, projectionTransition }
    const merc = maplibregl.MercatorCoordinate.fromLngLat([127.5, 36], 400000);
    const s = merc.meterInMercatorCoordinateUnits() * 200000;
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(pd.mainMatrix)
      .multiply(new THREE.Matrix4().makeTranslation(merc.x, merc.y, merc.z))
      .multiply(new THREE.Matrix4().makeScale(s, -s, s));
    this.renderer.resetState();                 // ★ 필수. 빼면 MapLibre 렌더가 깨진다
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
});
```
실측 결과: `{renders:3161, hasMainMatrix:true, projectionTransition:1, bloomComposer:true, gltfLoaded:true}`

⚠️ **핵심 함정**: v4→v5에서 투영 방식이 바뀌어 threebox 등 기존 라이브러리가 깨졌다. `args.modelViewProjectionMatrix`가 아니라 **`args.defaultProjectionData.mainMatrix`**를 써야 글로브에서 위치가 맞는다. 논의: <https://github.com/maplibre/maplibre-gl-js/discussions/5559>
⚠️ **블룸 후처리 주의**: `EffectComposer`는 생성은 되지만 MapLibre 캔버스에 렌더타깃을 붙이면 MapLibre의 프레임버퍼 상태와 충돌한다. **지도 캔버스 위에 별도 `<canvas>`를 얹고 `mix-blend-mode:screen`으로 블룸을 합성하는 방식(§6.1)이 훨씬 안전하다.**

공식 예제: <https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/> (three 0.169.0 사용)
스타필드 스카이박스 참고 구현: <https://github.com/geoql/maplibre-gl-starfield>
타일 셰이더 레이어: <https://github.com/geoblocks/maplibre-gl-shader-layer>

### 5.3 플러그인 — 정확한 패키지명과 CDN

| 기능 | 패키지 | CDN (실측 200) |
|---|---|---|
| 스와이프 비교(시점 비교) | `@maplibre/maplibre-gl-compare@0.5.0` ⚠️ 스코프 있음 | `https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-compare@0.5.0/dist/maplibre-gl-compare.js` + 같은 경로 `.css` |
| PMTiles | `pmtiles@4.5.0` | `https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js` (전역 `pmtiles`) |
| DEM→등고선 | `maplibre-contour@0.1.0` | `https://cdn.jsdelivr.net/npm/maplibre-contour@0.1.0/dist/index.min.js` |
| 태양 위치 | `suncalc@1.9.0` | `https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js` |
| 지도 내보내기(PNG/PDF) | `@watergis/maplibre-gl-export@5.0.0` | jsdelivr `dist/maplibre-gl-export.umd.js` |

⚠️ `maplibre-gl-compare` (스코프 없는 이름)는 npm에 **없다**. `@maplibre/maplibre-gl-compare`가 맞다. 이걸 잘못 쓰면 404가 난다 (실측 확인).

### 5.4 PMTiles로 우리 데이터 배포

현재 `landxi/assets/tiles/`에 21MB 정사영상 타일이 개별 파일로 들어있다(전체 assets 42MB). GitHub Pages는 **저장소 1GB 권장 / 대역폭 월 100GB 소프트리밋**이므로 아직 문제는 없지만, 타일 개수가 늘면 git 성능이 급격히 나빠진다.

→ **PMTiles 단일 파일**로 묶으면 파일 1개가 되고 HTTP Range 요청으로 부분 로드된다:
```js
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);   // ✅ 실측 성공
// 소스: { type:'raster', url:'pmtiles://assets/tiles/namwon.pmtiles', tileSize:256 }
```
⚠️ GitHub Pages가 `Range` 요청을 지원하는지 확인 필요 (일반적으로 지원하나 CDN 캐시 동작 검증 권장). 대안은 Cloudflare R2(무료 티어 10GB) 호스팅.

---

## 6. 비-지도 WebGL / 분위기 / 스크롤

### 6.1 지도 위 포스트 이펙트 — CSS 레이어 합성 (권장)

지도 캔버스 자체에 후처리를 넣는 것보다, **지도 위에 `pointer-events:none` 캔버스/div를 겹치고 `mix-blend-mode`로 합성**하는 편이 압도적으로 안전하고 저렴하다. `probe3.html`에서 `mix-blend-mode`, `backdrop-filter`, `color-mix(in oklab, ...)` 전부 지원 확인.

| 효과 | 구현 | 비용 |
|---|---|---|
| 비네트 | 겹친 div + `radial-gradient(ellipse, transparent 55%, rgba(0,8,20,.55))` | 0 (합성만) |
| 필름 그레인 | 128×128 노이즈 PNG(data URI) 타일링 + `mix-blend-mode:overlay` + `opacity:.05` + `background-position` rAF 지터 | 매우 낮음 |
| 렌즈 플레어 / 블룸 | 별도 2D 캔버스에 방사형 그라디언트 → `mix-blend-mode:screen` | 낮음 |
| 색수차 | 텍스트/UI에 `text-shadow: -0.4px 0 rgba(255,0,80,.35), 0.4px 0 rgba(0,220,255,.35)` (지도 전체에는 걸지 말 것) | 0 |
| 앰비언트 파티클 | 별도 캔버스 2D 200~400개 점 rAF, 또는 three.js `Points` | 낮음~중간 |
| 스캔라인/HUD 그리드 | `repeating-linear-gradient` + `mask-image` | 0 |

> 이 방식이면 **지도 FPS에 사실상 영향이 없다**. WebGL 포스트프로세싱을 지도 컨텍스트에 넣으면 프레임마다 풀스크린 렌더타깃 왕복이 생겨 Intel iGPU에서 바로 무너진다.

### 6.2 스크롤 구동 애니메이션

| 기술 | 2026년 지원 | 판정 |
|---|---|---|
| CSS `animation-timeline: scroll()` / `view()` | Chrome/Edge 115+, Safari 26, **Firefox는 여전히 플래그 뒤** (전세계 ~84%) | **보조로만.** `@supports (animation-timeline: scroll())`로 점진적 향상 |
| GSAP ScrollTrigger | 전 브라우저 | **주력.** 지도 카메라를 스크롤에 묶는 유일한 실용적 방법 |
| Lenis 부드러운 스크롤 | 전 브라우저, MIT | 선택. ScrollTrigger와 궁합 좋음 |
| View Transitions API (same-document) | Chrome 111+, Safari 18+, Firefox 144+ | **장면 전환에 적극 사용 가능** |
| View Transitions (cross-document) | Chrome/Edge/Opera + Safari 18.2+ + Firefox(2026 중반) | 페이지 간 전환에 사용 가능, 폴백은 그냥 일반 내비게이션 |

출처: <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline> · <https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API> · <https://caniuse.com/mdn-css_properties_animation-timeline_scroll>

`probe3.html`에서 `CSS.supports('animation-timeline: scroll()')`, `typeof document.startViewTransition` 등 런타임 감지 코드가 정상 동작함을 확인했다.

### 6.3 라이선스 정리 (전부 공개 서비스에 무료)

| 라이브러리 | 라이선스 | 비고 |
|---|---|---|
| MapLibre GL JS | BSD-3-Clause | 완전 자유 |
| deck.gl | MIT | 완전 자유 |
| three.js | MIT | 완전 자유 |
| **GSAP (전 플러그인)** | **표준 라이선스 — 상업용 포함 100% 무료** | 2025-04 Webflow가 GreenSock 인수 후 SplitText/MorphSVG/DrawSVG/ScrollTrigger 등 유료 플러그인 전부 무료화. 출처: <https://webflow.com/updates/gsap-becomes-free> |
| Lenis | MIT | 완전 자유 |
| motion (Framer Motion vanilla) | MIT | 완전 자유 |
| ECharts | Apache-2.0 | 완전 자유 |
| pmtiles / maplibre-contour / suncalc | BSD-3 / MIT / BSD-2 | 완전 자유 |

---

## 7. 성능 예산

### 7.1 실측 데이터 (1280×800, vsync 해제)

**probe2** — MapLibre 5.6.0 + deck.gl 9.3.10, 글로브, V-World/EOX 위성 + 5,000점

| 장면 | RTX 4090 (D3D11) | SwiftShader (CPU) |
|---|---|---|
| 글로브 + 위성 래스터 + 히트맵 5k, 정지 | **297.4 fps** | **66.1 fps** |
| + deck 인터리브드 (Arc 300 + Scatter 5k) | 57.5 fps ※ | 75.0 fps ※ |
| flyTo, 글로브 + **지형** + deck | **110.3 fps** | **2.4 fps** ⚠️ |
| 정지, z12 + **지형** + deck | **140.1 fps** | **4.6 fps** ⚠️ |
| 서울 z16, 3D건물 + **지형** + deck, pitch 70 | **92.3 fps** | **3.2 fps** ⚠️ |
| 서울 z16, 3D건물, **지형 OFF**, mercator | **558.7 fps** | (미측정) |

※ 이 두 칸은 측정 창이 타일 네트워크 로딩과 겹쳐 신뢰도가 낮다. 순서가 뒤집힌 것이 그 증거다.

**probe3** — 권장 스택 전체(MapLibre v5 + deck + three.js + pmtiles + GSAP + Compare + SunCalc), RTX 4090

| 장면 | fps |
|---|---|
| S1 글로브 + EOX 위성 + 히트맵 5k (타일 로딩 중) | 58.0 |
| S2 글로브 + three.js 커스텀 레이어(궤도 + glTF) | **1101** |
| S3 글로브 + three.js + deck(Arc 250 + Scenegraph glTF + Trips) | **494.5** |
| S4 flyTo + **Mapterhorn 지형** + 전부 | **95.7** |
| S5 정지 z12.5 + **지형** + 전부 | **163.7** |

### 7.2 해석과 목표 기기 추정

- **지형이 유일한 절벽이다.** 소프트웨어 렌더러에서 지형 OFF 66fps → ON 2.4fps (**27배**). GPU가 있어도 지형은 다른 모든 요소를 합친 것보다 비싸다(558.7 → 92.3, 6배). MapLibre 이슈 #7363이 이를 공식 확인한다.
- three.js 커스텀 레이어와 deck.gl 오버레이는 **거의 공짜에 가깝다** (1101fps, 494fps). 시각적 화려함 대비 비용이 가장 좋은 투자다.
- 5,000점 히트맵/서클은 성능 요인이 아니다.

**Intel Iris Xe / UHD 급 사무용 노트북 추정 밴드** (⚠️ 추정 — 실측 필요):

| 구성 | 추정 fps | 판정 |
|---|---|---|
| 글로브 + 위성 + 히트맵 + deck + three, **지형 OFF** | 45–60 | ✅ 안전 |
| 위 + **지형 ON**, pitch ≤ 45 | 25–40 | ⚠️ 연출 순간에만 |
| 위 + **지형 ON**, pitch 70 + 3D건물 | 12–25 | ❌ 상시 금지 |
| 메르카토르 + 위성 + 벡터, 지형 OFF (대시보드 상시) | 60+ | ✅ |

### 7.3 폴백 및 `prefers-reduced-motion` 전략

프로젝트에 이미 `landxi/assets/js/pages/home-orbit.js`에 `matchMedia('(prefers-reduced-motion: reduce)')` 패턴이 있다. 이를 3단계 품질 티어로 확장하는 것을 권장한다.

```js
// 1) 능력 감지 (1회)
const gl = document.createElement('canvas').getContext('webgl2');
const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
const soft   = /SwiftShader|Software|llvmpipe|Microsoft Basic/i.test(renderer);
const weak   = /Intel.*(HD|UHD) Graphics (5|6)\d\d/i.test(renderer);   // 구형 Intel
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowMem = (navigator.deviceMemory || 8) <= 4;

const TIER = (!gl || soft) ? 'fallback' : (reduce || weak || lowMem) ? 'lite' : 'full';
```

| 티어 | 글로브 | 지형 | deck.gl | three.js | 파티클/그레인 | 카메라 |
|---|---|---|---|---|---|---|
| `full` | ✅ | 연출 순간만 (exaggeration 1.4) | interleaved 전부 | ✅ | ✅ | flyTo 6s |
| `lite` | ✅ (대기광 유지) | **OFF** | overlaid, Arc/Trips 개수 1/3 | 궤도만, 블룸 OFF | 그레인만 | `jumpTo` 또는 duration 0 |
| `fallback` | 기존 절차적 캔버스 폴백 (`landxi/assets/js/map/fallback.js`) | — | — | — | — | 즉시 전환 |

**`prefers-reduced-motion` 규칙**:
- 카메라 자동 비행 → `map.jumpTo()`로 즉시 도착
- MapLibre `AnimationOptions.essential: true`는 **쓰지 않는다** (이 플래그는 reduced-motion을 무시시킨다 — 접근성 위반)
- GSAP: `gsap.globalTimeline.timeScale(reduce ? 1000 : 1)` 또는 ScrollTrigger를 `scrub:false`로
- CSS: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }`

**추가 최적화 (MapLibre 공식 권고, <https://maplibre.org/maplibre-gl-js/docs/guides/large-data/>)**:
- GeoJSON 소스에 `maxzoom: 12` 명시 (기본 22 → 타일링 비용 급감). 해양쓰레기 5,000점에 즉시 적용 가능
- 밀집 포인트는 `cluster: true`
- `antialias: true`는 MSAA를 켜므로 iGPU에서 비싸다 — `lite` 티어에서는 `false`
- 뷰포트 밖 레이어는 `visibility:'none'` (스타일에서 제거하지 말고 토글)

### 7.4 전송 용량 (실측, gzip/br 적용)

| 라이브러리 | wire | raw |
|---|---|---|
| maplibre-gl 5.6.0 | 242 KB | 917 KB |
| deck.gl 9.3.10 | 446 KB | 1,609 KB |
| three 0.185.1 (module + core) | 384 KB | 2,043 KB |
| echarts 5.5.0 | 325 KB | 1,005 KB |
| gsap + ScrollTrigger | 45 KB | 114 KB |
| pmtiles + compare + suncalc + lenis | 19 KB | 56 KB |
| **합계** | **≈1.46 MB** | ≈5.7 MB |

→ **분할 로딩 필수**. 홈(시네마틱)은 maplibre + deck + three + gsap(≈1.12MB), 대시보드는 maplibre + echarts + gsap(≈0.61MB)만 로드. `<link rel="modulepreload">` / `<link rel="preload" as="script">`로 우선순위를 준다.

---

## 8. 한국 데이터 소스

| 데이터 | 접근 | 실사용 가능성 |
|---|---|---|
| **V-World 위성/하이브리드 타일** | keyless `xdworld` 또는 키 발급형 WMTS | ✅ **즉시 사용**. §3.1 |
| **V-World 3D (건물/지형)** | 웹지엘 3D 지도 API 3.0 — **Cesium JS 래퍼** | ❌ MapLibre와 직접 호환 불가. 3D Tiles `tileset.json`을 별도로 얻을 수 있다면 `deck.Tile3DLayer`(번들 포함 확인됨)로 시도 가능하나 CORS·엔드포인트 미확인. 2026년 "4단계 고도화"로 3D 분석 OpenAPI 제공 발표됨 — 재조사 가치 있음. 출처: <https://www.etnews.com/20250115000170>, <https://www.data.go.kr/data/3073144/openapi.do> |
| **국토지리정보원 DEM (5m)** | 국토정보플랫폼 <https://map.ngii.go.kr/> 에서 도엽별 파일 다운로드. 대용량 전송 S/W 필요, 라이브 타일 서비스 **없음** | ⚠️ 직접 XYZ 서비스 불가. 실무안: 관심 지역(남원/제주) DEM을 내려받아 `gdal_translate` + `rio-rgbify`로 **terrarium PNG 타일**로 변환 → PMTiles로 묶어 GitHub Pages에 호스팅. 전지구는 Mapterhorn으로 커버. |
| **행안부/통계청 시군구 경계** | ✅ GitHub 공개 저장소들 | `github.com/statgarten/maps` (SGIS 기반 시도/시군구 GeoJSON+SVG) · `github.com/vuski/admdongkor` (2001~2023 전 시기 읍면동/시군구/시도) · `github.com/cubensys/Korea_District` (GeoJSON+TopoJSON) · `github.com/raqoon886/Local_HangJeongDong` (행정동). **mapshaper로 단순화 후 사용 권장** (원본은 수십 MB) |
| **공공데이터포털 항공영상** | <https://www.data.go.kr/data/15067637/fileData.do> (항공사진 수치표고성과 내역) 등 파일 데이터 | 파일 다운로드 방식. 타일 서비스 아님 |
| **OpenFreeMap 벡터(라벨/경계)** | 현재 이미 사용 중 | ✅ 유지. 한글 라벨 `['coalesce',['get','name:ko'],['get','name']]` |

> 프로젝트의 `landxi/assets/data/imagery.js`가 이미 남원/드론/제주 정사영상 타일 카탈로그(bounds, minzoom/maxzoom 포함)를 갖고 있어 §3.2의 3단 합성에 그대로 꽂힌다.

---

## 9. 권장 스택 — 복붙 가능한 CDN 블록

```html
<!-- ============ CSS ============ -->
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-compare@0.5.0/dist/maplibre-gl-compare.css">

<!-- ============ 클래식 스크립트 (전역 노출) ============ -->
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>            <!-- maplibregl -->
<script src="https://cdn.jsdelivr.net/npm/deck.gl@9.3.10/dist.min.js"></script>            <!-- deck -->
<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js"></script>         <!-- pmtiles -->
<script src="https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-compare@0.5.0/dist/maplibre-gl-compare.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>          <!-- gsap -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/Flip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/suncalc@1.9.0/suncalc.js"></script>              <!-- SunCalc -->
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.26/dist/lenis.min.js"></script>        <!-- 선택 -->
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>     <!-- 대시보드 전용 -->

<!-- ============ ESM importmap ============ -->
<script type="importmap">
{"imports":{
  "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"
}}
</script>
```

**전부 실측 200 + `probe3.html`에서 한 페이지에 동시 로드하여 충돌 없음 확인.**
`probe3.html`의 `globals` 검사 결과: `{maplibre:true, deck:true, pmtiles:true, gsap:true, ScrollTrigger:true, Compare:true, SunCalc:true, three:"185", GLTFLoader:true, EffectComposer:true, UnrealBloomPass:true}`

버전 고정 이유:
- `maplibre-gl@5.6.0` — v6는 deck.gl 비호환(§2.2). **`@^5`가 아니라 정확한 버전으로 핀할 것**
- `deck.gl@9.3.10` — MapLibre v5 글로브 3모드 전부 지원(v9.1+)
- `three@0.185.1` — 최신. MapLibre 공식 예제는 0.169.0이나 0.185.1에서도 `defaultProjectionData.mainMatrix` 패턴 정상 동작 확인
- `echarts@5.5.0` — 이미 프로젝트가 사용 중. v6.1.0이 나왔으나 마이그레이션 이득 없음

CSP를 쓴다면 `worker-src 'self' blob:`가 필요하다(MapLibre 워커).

---

## 10. 능력 매트릭스 (기능 × 난이도 × 리스크)

난이도: S(0.5일) M(1–2일) L(3–5일) / 리스크: 낮음·중간·높음

| # | 기능 | 스택 | 난이도 | 리스크 | 검증 |
|---|---|---|---|---|---|
| 1 | 위성 베이스맵 3단 크로스페이드 | MapLibre raster + opacity 보간 | S | 낮음 | ✅ 실측 렌더 |
| 2 | 글로브 + 대기광/스카이/포그 | `projection:globe` + `sky` | S | 낮음 | ✅ |
| 3 | 줌 기반 globe↔mercator 자동 전환 | `setProjection` 보간 표현식 | S | 낮음 | ✅ |
| 4 | GSAP 타임라인 카메라 연출 | GSAP + `jumpTo` | M | 낮음 | ✅ (패턴) |
| 5 | 5,000점 히트맵 + 서클 펄스 | heatmap + `feature-state` + rAF | S | 낮음 | ✅ |
| 6 | line-gradient 데이터 흐름 트레일 | `lineMetrics` + `line-progress` | S | 낮음 | ✅ |
| 7 | deck.gl ArcLayer 지역간 연결 | MapboxOverlay interleaved | S | 낮음 | ✅ 오류 0 |
| 8 | deck.gl TripsLayer 드론 항적 | TripsLayer + rAF `currentTime` | M | 낮음 | ✅ |
| 9 | deck.gl ScenegraphLayer glTF 드론 | ScenegraphLayer + `.glb` | M | 중간 | ✅ 로드 성공 (모델 제작 필요) |
| 10 | 지형 (Mapterhorn/terrarium) | `setTerrain` | S | **높음(성능)** | ✅ 동작, 성능 절벽 |
| 11 | `queryTerrainElevation` 기반 HUD | 지형 + 표고 표시 | S | 중간 | ✅ 141.45m |
| 12 | 3D 건물 fill-extrusion | OpenFreeMap `building` | S | 중간 | ✅ (z14+ 필요) |
| 13 | three.js 위성 궤도 + glTF | CustomLayer + `mainMatrix` | **L** | 중간 | ✅ 3161 프레임 |
| 14 | 주야 터미네이터 + 야간등 | SunCalc + `setLight` + GIBS 블랙마블 | M | 낮음 | ✅ SunCalc 동작 |
| 15 | 스와이프 시점 비교 | `@maplibre/maplibre-gl-compare` | S | 낮음 | ✅ 로드 |
| 16 | CSS 합성 포스트 이펙트 (그레인/비네트/블룸) | 겹친 canvas + `mix-blend-mode` | M | 낮음 | ✅ CSS 지원 |
| 17 | ScrollTrigger 스크롤 연출 | GSAP ScrollTrigger | M | 낮음 | ✅ |
| 18 | View Transitions 장면 전환 | `document.startViewTransition` | S | 낮음 | ✅ |
| 19 | PMTiles 단일파일 타일 | pmtiles + `addProtocol` | M | 중간 (Range 지원 확인) | ✅ 프로토콜 등록 |
| 20 | three.js EffectComposer 블룸 (지도 컨텍스트 내) | EffectComposer | L | **높음** | ⚠️ 생성만 확인, FBO 충돌 위험 → #16으로 대체 권장 |
| 21 | V-World 3D Tiles (건물) | `deck.Tile3DLayer` | L | **높음** | ❌ 엔드포인트·CORS 미확인 |
| 22 | 커스텀 WebGL2 셰이더 레이어 (글로브 대기산란 등) | CustomLayerInterface | L | 중간 | ✅ WebGL2 컨텍스트 확인 |

---

## 11. 시그니처 모먼트 5 (홈/대시보드)

전부 위 매트릭스의 **낮음~중간 리스크 항목만으로** 구성했다. 즉 실현 가능성이 검증된 조합이다.

### M1. 「궤도에서 국토로」 — 홈 오프닝 (기능 2,3,4,13,14)
우주 흑배경에서 **Sentinel-2 cloudless 지구**가 대기광을 두르고 자전한다. three.js CustomLayer가 위성·항공기·드론 3개 궤도 링을 글로브 주위로 돌린다(기존 `home-orbit.js`의 SVG 궤도를 3D로 승격). SunCalc가 만든 터미네이터가 실제 현재 시각의 낮/밤 경계를 그리고, 밤 쪽엔 NASA 블랙마블 야간등이 켜진다. 스크롤 시작 → GSAP 타임라인이 카메라를 한반도로 끌어당기고, `setProjection` 보간 표현식이 z4~7 구간에서 **글로브를 평면으로 펴며** 베이스맵이 EOX → V-World 위성으로 크로스페이드된다.
*비용*: three 1101fps / 지형 미사용 → **iGPU 안전**

### M2. 「전국이 켜진다」 — 서비스 현황 (기능 1,5,6,7)
한반도 z6.4, pitch 45. V-World 위성 위에 시군구 경계가 시안색 글로우 라인으로 그려지고(`line-blur`), 해양쓰레기 5,000점이 히트맵으로 붉게 번진 뒤 줌인하면 개별 서클로 분해된다(`raster-opacity`처럼 `heatmap-opacity`와 `circle` minzoom을 교차 보간). 동시에 deck.gl ArcLayer가 LX 본사 ↔ 지역본부를 잇는 아크를 순차 발화시키고, `line-gradient` 트레일이 데이터 흐름처럼 흐른다.
*근거*: `v-korea.png` 스크린샷이 이 장면을 이미 렌더한 상태다.
*비용*: 지형 미사용 → **iGPU 안전**

### M3. 「남원 사면 강하」 — 정사영상 진입 (기능 4,10,11,12)
카메라가 남원으로 하강. **이 순간에만** `setTerrain({exaggeration:1.4})`을 켠다. 지리산 능선이 솟아오르고 pitch가 68°까지 눕는다. z13.5에서 우리 1cm급 정사영상이 V-World 위성 위로 페이드인되고, HUD에 `queryTerrainElevation`으로 읽은 실제 표고(m)가 카운트업된다. 카메라가 멈추면 **1.5초 후 지형을 자동으로 끈다**(`setTerrain(null)`) — 정지 상태에서는 지형이 시각적으로 거의 기여하지 않으면서 프레임만 먹기 때문이다.
*근거*: `v-namwon.png` 스크린샷.
*비용*: 지형 ON 구간 3~4초로 한정 → iGPU에서 25–40fps로 통과. `lite` 티어는 지형 생략하고 pitch만 준다.

### M4. 「4시점 스와이프」 — 변화 탐지 (기능 1,15,16)
남원 4개 에폭(2025.04/06/08/…)을 `@maplibre/maplibre-gl-compare` 스와이프로 가른다. 핸들을 끌면 좌우가 시점별 정사영상. 변화 픽셀 위에 deck.gl `ScatterplotLayer`가 검출 결과를 펄스로 얹고, 겹친 캔버스가 스캔라인 + 그레인을 합성해 "판독 장비" 질감을 만든다. `raster-hue-rotate`로 우측 영상에 미세한 색 편이를 줘 시점 차이를 무의식적으로 인지시킨다.
*비용*: 래스터 2장 + 산점도 → **iGPU 안전**

### M5. 「드론이 난다」 — AI 검출 파이프라인 (기능 8,9,16)
제주 불법건축물 검출 장면. deck.gl `ScenegraphLayer`가 실제 glTF 드론 모델을 900m 고도에 띄우고, `TripsLayer`가 비행 항적을 시안색 꼬리로 그린다(rAF에서 `currentTime` 증분). 드론이 지나간 자리마다 검출 폴리곤이 순차적으로 팝업되고, 겹친 캔버스의 렌즈 플레어가 드론 위치를 따라 미끄러진다. ECharts 미니 차트가 우측 HUD에서 검출 건수를 실시간 갱신.
*비용*: deck 494fps 구간 → **iGPU 안전**. 드론 glTF는 §12의 gltf-transform으로 <200KB로 압축.

---

## 12. 설치를 권하는 도구 / 스킬 / MCP / CLI

클라이언트가 "품질을 올리는 것은 뭐든 설치하겠다"고 했으므로 우선순위대로 정리했다.

### 12.1 최우선 — AI 에이전트가 이 작업을 잘하게 만드는 것

| 도구 | 설치 | 왜 |
|---|---|---|
| **MapLibre Agent Skills** | `npx skills add maplibre/maplibre-agent-skills` 또는 `.claude/skills/`에 md 복사 | MapLibre 커뮤니티가 관리하는 AI용 가이드 스킬 세트. `maplibre-terrain-patterns`(지형/힐셰이드/DEM 인코딩), `maplibre-tile-sources`(빈 지도 디버깅), `maplibre-cartography`(스타일링/타이포/스프라이트), `maplibre-pmtiles-patterns`, `maplibre-mapbox-migration`. Promptfoo로 검증된 스킬. **§4.2의 terrarium 인코딩 함정 같은 걸 정확히 막아준다.** MIT. <https://github.com/maplibre/maplibre-agent-skills> |
| **Chrome DevTools MCP** | `claude mcp add` (Anthropic 공식 플러그인 존재) | 29개 도구 — 성능 트레이스 기록, 메모리 스냅샷, **Lighthouse 감사**, 네트워크 분석. WebGL 프레임타임 병목 진단에 필수. <https://claude.com/plugins/chrome-devtools-mcp> |
| **Playwright MCP** | `npx @playwright/mcp` | 50+ 도구. 이 조사에서 쓴 것과 같은 방식으로 **에이전트가 스스로 지도를 띄우고 스크린샷/FPS를 측정해 검증**할 수 있게 한다. 프로젝트에 Playwright 1.62.1이 이미 있으므로 MCP만 붙이면 됨 |
| **GSAP 스킬** | `greensock/gsap-plugins` 에이전트 스킬 | GSAP 플러그인 API를 에이전트가 정확히 쓰게 함. <https://mcpservers.org/agent-skills/greensock/gsap-plugins> |

### 12.2 검증·측정 (프로젝트에 이미 절반 있음)

- **Playwright trace + video**: `playwright.config.mjs`에 `use: { video:'on', trace:'on' }` → 시네마틱 연출을 **동영상으로 회귀 검증**. `chromium-1223`(풀 크롬)을 `executablePath`로 지정해야 실제 GPU가 붙는다 (headless shell은 SwiftShader로 떨어짐 — 이번 조사에서 확인)
- **ffmpeg**: 이미 `ms-playwright/ffmpeg-1011/ffmpeg-win64.exe`로 설치되어 있음. Playwright 영상을 스크럽용 mp4/webm으로 변환하거나, 스크롤 스크럽 배경 영상 제작에 사용
- **Lighthouse CI**: `npm i -D @lhci/cli` — 정적 사이트 성능/접근성 회귀 게이트
- **Spector.js** (WebGL 프레임 캡처): `https://cdn.jsdelivr.net/npm/spectorjs@0.9.30/dist/spector.bundle.js` — draw call 단위로 어느 레이어가 비싼지 본다. 개발 빌드에만 주입
- **stats.js**: `https://cdn.jsdelivr.net/npm/stats.js@0.17.0/build/stats.min.js` — 개발 중 FPS/메모리 오버레이

### 12.3 지오 데이터 파이프라인 (CLI)

| 도구 | 설치 | 용도 |
|---|---|---|
| **GDAL** | 이미 있음 (메모리에 GDAL env 기록됨) | `gdal2tiles.py` 정사영상 타일링, `gdalwarp` 재투영, DEM 처리 |
| **rio-rgbify** | `pip install rio-rgbify` | 국토지리정보원 5m DEM → **terrarium PNG 타일** 변환 (§8) |
| **PMTiles CLI** | `npm i -g pmtiles` 또는 go 바이너리 | 타일 디렉터리 → 단일 `.pmtiles`. `pmtiles convert in.mbtiles out.pmtiles` |
| **tippecanoe** | `brew`/WSL 또는 `felt/tippecanoe` | 5,000점 GeoJSON → 벡터타일 (줌별 단순화, 클러스터링) |
| **mapshaper** | `npm i -g mapshaper` | 행안부 시군구 경계 단순화. `mapshaper in.geojson -simplify 5% -o out.geojson` |
| **maputnik** | `npx maputnik` 또는 <https://maputnik.github.io/editor/> | MapLibre 스타일 JSON 시각 편집 — 위성+오버레이 합성 튜닝에 매우 유용 |

### 12.4 3D 에셋 (드론/위성 glTF)

| 도구 | 설치 | 용도 |
|---|---|---|
| **glTF-Transform CLI** | `npm i -g @gltf-transform/cli` | `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` — 드론 모델을 200KB 이하로. Draco/Meshopt/KTX2 지원. <https://gltf-transform.dev/> |
| **gltfpack (meshoptimizer)** | `npm i -g gltfpack` | 더 공격적인 압축 |
| **Blender + CLI** | `blender --background --python script.py` | 드론/위성 모델 제작·리토폴로지·glTF 익스포트 자동화 |
| **glTF Viewer** | <https://gltf-viewer.donmccurdy.com/> | 압축 후 PBR 결과 육안 검증 |
| **무료 모델 소스** | Khronos glTF-Sample-Assets (CORS `*` 실측 확인), Sketchfab CC0, NASA 3D Resources | 프로토타입용 |

### 12.5 참고로 열어둘 레퍼런스 구현

- <https://github.com/romainoir/Maplibre-Globe> — **가장 가까운 목표물**. 글로브 + 터미네이터 + 야간등 + Mapterhorn 지형, 단일 정적 HTML, MIT
- <https://github.com/geoql/maplibre-gl-starfield> — three.js 스타필드 스카이박스 CustomLayer (M1의 우주 배경)
- <https://deck.gl/gallery/maplibre-overlay> — deck.gl 인터리브드 공식 갤러리
- <https://github.com/jonathanlurie/maplibre-demo> — globe + light + sky + fog 최소 데모
- <https://github.com/geoblocks/maplibre-gl-shader-layer> — three.js 기반 타일 셰이더 레이어

---

## 13. 리스크 및 미검증 항목

| 항목 | 상태 | 대응 |
|---|---|---|
| **Intel iGPU 실측 FPS** | ❌ 미검증 (4090/SwiftShader만) | `probe3.html`을 대상 노트북에서 1회 실행. §7.2 밴드 검증 |
| EOX Sentinel-2 라이선스 (CC BY-NC-SA?) | ⚠️ 비상업 조건 확인 필요 | 공공기관 플랫폼이므로 대체로 무방하나 **법무 확인 권장**. 대체재: NASA GIBS(제약 없음), V-World(전지구 커버는 없음) |
| Esri World Imagery 이용약관 | ⚠️ ArcGIS 제품 외 사용 제약 가능 | 데모용으로만. 정식 서비스에는 V-World + GIBS 조합 권장 |
| V-World `xdworld` keyless 엔드포인트 영속성 | ⚠️ 비공식 경로 | 소스 URL을 상수 1곳에 모아두고, 정식 전환 시 키 발급형 WMTS로 교체 가능하게 설계 |
| GitHub Pages `Range` 요청 (PMTiles) | ❌ 미검증 | 실제 배포 후 확인. 실패 시 Cloudflare R2(무료 10GB) |
| three.js EffectComposer + MapLibre FBO 충돌 | ⚠️ 생성만 확인, 실렌더 미검증 | §6.1의 CSS 블렌드 합성으로 대체 (권장) |
| deck.gl 인터리브드 "체커보드" 회귀 | ⚠️ MapLibre v3+deck v9 보고, v5에서는 미재현 | 이번 조사에서 v5.6.0 + deck 9.3.10 오류 0. 계속 모니터 (<https://github.com/visgl/deck.gl/issues/8602>) |
| V-World 3D Tiles 접근 | ❌ 엔드포인트 미확인 | V-World 4단계 고도화 OpenAPI 재조사 필요 |
| Mapterhorn maxzoom 12 (512px) | ✅ 실측 (z13+ 404) | 고줌 지형이 필요하면 AWS terrarium(maxzoom 14, 256px)으로 폴백하거나 두 소스를 줌으로 스위치 |
| `calculateFogMatrix is not supported on globe projection.` 경고 | ✅ 무해 | 콘솔 노이즈. 무시 |

---

## 부록 A. 재현 방법

```bash
# 1) 프로브 파일들이 있는 디렉터리
cd "C:\Users\oem\AppData\Local\Temp\claude\F--Land-XI-----01-----\67e4a754-5f9b-4174-a3aa-cdbbaade48d2\scratchpad\tech-probe"

# 2) 프로젝트 루트에서 실행 (playwright-core 해석용)
cd "F:\Land-XI 플랫폼\01. 디자인"

# 권장 스택 통합 검증 (실 GPU)
PAGE=probe3.html node "<scratchpad>/tech-probe/run.mjs"

# 저사양 하한 (SwiftShader)
PAGE=probe2.html node "<scratchpad>/tech-probe/run.mjs" --sw

# MapLibre v6 비호환 재확인
PAGE=probe.html  node "<scratchpad>/tech-probe/run.mjs"

# 시네마틱 스크린샷 3장 (v-globe.png / v-korea.png / v-namwon.png)
node "<scratchpad>/tech-probe/shot.mjs"
```

`run.mjs`는 `executablePath`로 `chromium-1223/chrome-win64/chrome.exe`(풀 크롬)를 직접 지정한다. **playwright의 기본 headless shell을 쓰면 GPU가 안 붙어 SwiftShader로 떨어지므로 성능 측정이 무의미해진다** — 이번 조사에서 실제로 겪은 함정이다.

## 부록 B. 주요 출처

- MapLibre v5→v6 마이그레이션: <https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/>
- MapLibre v6 breaking changes 이슈: <https://github.com/maplibre/maplibre-gl-js/issues/6427>
- MapLibre 글로브 + 대기광 예제: <https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/>
- MapLibre three.js 글로브 예제: <https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/>
- MapLibre 대용량 데이터 최적화: <https://maplibre.org/maplibre-gl-js/docs/guides/large-data/>
- MapLibre 지형 성능 이슈 #7363: <https://github.com/maplibre/maplibre-gl-js/issues/7363>
- MapLibre v4→v5 three.js 투영 변경 논의: <https://github.com/maplibre/maplibre-gl-js/discussions/5559>
- deck.gl MapLibre 통합: <https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre>
- deck.gl What's New (v9.1 글로브 지원): <https://deck.gl/docs/whats-new>
- deck.gl globe 이슈: <https://github.com/visgl/deck.gl/issues/9466>, <https://github.com/visgl/deck.gl/issues/9554>, <https://github.com/visgl/deck.gl/issues/8602>
- MapLibre Agent Skills: <https://github.com/maplibre/maplibre-agent-skills>
- Mapterhorn 지형: <https://mapterhorn.com/> · <https://protomaps.com/blog/mapterhorn-terrain/>
- GSAP 무료화: <https://webflow.com/updates/gsap-becomes-free>
- V-World 배경지도 API: <https://www.vworld.kr/dev/v4dv_baseguide_s001.do> · WMTS: <https://vworld.kr/dev/v4dv_wmtsguide_s001.do>
- NASA GIBS API: <https://nasa-gibs.github.io/gibs-api-docs/access-basics/>
- 국토정보플랫폼(DEM): <https://map.ngii.go.kr/>
- 한국 행정경계: <https://github.com/statgarten/maps> · <https://github.com/vuski/admdongkor> · <https://github.com/cubensys/Korea_District>
- Scroll-driven animations 지원: <https://caniuse.com/mdn-css_properties_animation-timeline_scroll>
- View Transitions API: <https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API>
- glTF-Transform: <https://gltf-transform.dev/>
- 레퍼런스 글로브 구현: <https://github.com/romainoir/Maplibre-Globe>
