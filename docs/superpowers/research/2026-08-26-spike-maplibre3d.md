# SPIKE — 「스크롤하면 지구 → 지구 안으로 → 주택·마을이 3D → 구름이 움직인다」

작성일 2026-08-26 · 브랜치 `plan1-foundation` · 실행 가능한 스파이크
코드: `landxi/proto/spikes/maplibre3d/` · 스크린샷: `shots/spikes/maplibre3d/`
전제 문서: [2026-08-25 WebGL 스택 실현가능성](2026-08-25-webgl-stack-feasibility.md) §2–§5

```
# 띄우기
node tools/serve.mjs                # 4173
open http://localhost:4173/landxi/proto/spikes/maplibre3d/

# 계측 + 스크린샷 (실 GPU 크롬, vsync 해제)
node landxi/proto/spikes/maplibre3d/_run.mjs
SHOTS=0 node landxi/proto/spikes/maplibre3d/_run.mjs     # FPS 만

# 풋프린트 다시 굽기 (Overpass → GeoJSON)
bash landxi/proto/spikes/maplibre3d/_fetch-footprints.sh
```

---

## 0. 결론 먼저

**판정: 기술은 된다. 막는 것은 데이터다.**

1. **「지구 → 마을 3D → 구름」은 이 스택으로 실제로 돌아간다.** MapLibre 5.6.0 + GSAP ScrollTrigger + Lenis + three 0.185.1,
   번들러 없이 정적 페이지 하나로 궤도(z2.05 globe)부터 거리(z17.5 pitch 68)까지 **끊김 없는 한 번의 스크롤**로 통과한다.
   스크린샷 8장이 `shots/spikes/maplibre3d/` 에 있다.
2. **3D 주택은 도심에서만 성립한다.** 전주 한옥마을은 6,289동이 위성영상 위에 빽빽하게 선다(`08-jeonju-dense.png`).
   **그러나 남원은 OSM 에 226동뿐이고 높이 태그는 0%다.** 정사영상에 보이는 지붕 수백 개가 3D 로 서지 않는다.
   → **막는 것은 렌더링이 아니라 풋프린트 데이터다.**
3. **V-World 키가 건물 API 를 열지 못한다.** 같은 키로 WMTS 위성은 200 인데 `lt_c_bldginfo` 를 주는 WFS·데이터 API 는
   `INCORRECT_KEY` 다 — **API 유형 추가 신청이 필요하다**(§2.2 에 요청 3종 전문 기록).
   그리고 **위성 타일에 한해 키는 무의미하다**: 키 WMTS 와 키 없는 `xdworld` 가 z12~z19 전 구간에서 바이트 단위로 같은 타일을 준다.
4. **우리 AI 검출 온실 폴리곤(남원 1,674동)이 이미 가장 좋은 3D 자산이다.** 금지면 코어에 345동을 청록 4m 로 세우니
   위성영상만으로는 못 얻는 그림이 나온다(`07-geumji-greenhouse.png`, `namwon-3d.first.webp`).
   **"우리 데이터가 그 장소를 3D 로 만든다"** — 이게 이 스파이크의 진짜 결론이다.
5. **성능은 문제가 아니다.** 4090 기준 전주 6,289동을 z17.3 pitch 68 로 스크럽하며 **232.7fps**.
   **유일한 절벽은 여전히 지형**이다(지형 ON 마을 장면 95.8fps). 그래서 지형은 진행도 0.34–0.70 구간만 켠다.
6. **구름은 한 안으로 안 된다.** 스케일별로 다른 안이 필요하다 — 고고도는 CSS 시차(a), 마을은 three 스프라이트(c).
   **`raster-translate` 는 MapLibre v5 래스터에 존재하지 않아** 과업이 지정한 GIBS 드리프트는 그대로는 불가능하다(§3.1).
7. **필름 레그로 굽힌다.** `window.__leg.seek(t)` 로 카메라·구름 위상이 t 하나에 못박히고,
   1280×720 25fps 141프레임을 Playwright 로 떠서 `landxi/assets/proto/film/legs/src/namwon-3d.mp4` 로 인코딩했다(§6).

---

## 1. 무엇을 만들었나

`landxi/proto/spikes/maplibre3d/` 는 **하나의 연속 스크롤**로 8단계를 통과하는 정적 페이지다.
번들러 없음, CDN 만, MapLibre `5.6.0` 핀(§전제문서 §2.2 — v6 는 deck.gl 비호환).

| 단계 | 진행도 | 카메라 | 무엇이 켜지나 |
|---|---|---|---|
| 궤도 | 0.00 | z1.35 globe | EOX Sentinel-2 무운 지구 + `sky` 대기광 |
| 접근 | 0.18 | z4.4 pitch 12 | 구름층 (a/b/c) |
| 국토 | 0.29 | z6.6 pitch 44 | V-World 위성 크로스페이드, globe→mercator 자동 전환 |
| 지역 | 0.50 | z11.8 pitch 60 | Mapterhorn 지형 ON (×1.5) |
| 마을 | 0.59 | z14.2 pitch 64 | 우리 정사영상 2m 페이드인, 건물 압출 시작 |
| 거리 | 0.74 | z17.5 pitch 68 | 3D 주택 (OSM 풋프린트), 지형 OFF |
| 금지면 | 0.88 | z17.2 pitch 68 | 정사영상 0.6m 코어 + AI 검출 온실 4m 청록 |
| 전주 | 1.00 | z17.3 pitch 68 | 밀집 대조군 |

구현 노트:
- **투영 전환은 코드가 아니라 표현식**이다. `projection: {type: ['interpolate',['linear'],['zoom'], 4,'vertical-perspective', 7,'mercator']}` 하나로 "우주에서 지구 → 평면"이 자동으로 된다. 스크롤 카메라는 `zoom` 만 밀면 된다.
- **카메라는 GSAP ScrollTrigger `onUpdate` → `map.jumpTo()`**. MapLibre 에는 `getFreeCameraOptions` 가 없으므로(전제문서 §2.3) 키프레임 배열을 직접 보간했다(`KEYS`/`camAt`). Lenis 로 관성을 준다.
- **정사영상 소스를 2개로 쪼갰다.** `namwon_city_2510` 은 전역 2m(z11–15)와 코어 0.6m(z16–17)가 한 피라미드에 섞여 있다. 소스 하나로 두면 코어 밖에서 z15 타일을 z17.5 까지 늘려 심하게 뭉갠다. `ortho_city`(maxzoom 15, 레이어 maxzoom 15.8)와 `ortho_core`(bounds=코어, minzoom 15)로 나누니 **코어 밖은 V-World 위성(z19, ~0.25m)이 그대로 살아** 선명하다.

---

## 2. 3D 주택 — 풋프린트 소스 품질 (핵심 결과)

### 2.1 실측표

OSM Overpass 로 4개 AOI 를 실제로 받아 구웠다 (`data/buildings-*.geojson`, `_fetch-footprints.sh`).

| AOI (bbox) | 동수 | `height` 태그 | `building:levels` | 기본값 추정 | 파일 |
|---|---:|---:|---:|---:|---:|
| **남원 시내** 35.375–35.445 / 127.355–127.435 (≈7.8×6.3km) | **226** | 0 (0%) | 1 (0.4%) | 225 (99.6%) | 69KB |
| **남원 금지면** 35.305–35.375 / 127.265–127.360 | **11** | 0 | 0 | 11 (100%) | 3KB |
| **전주 한옥마을** 35.800–35.835 / 127.135–127.175 | **6,289** | 35 (1%) | 288 (5%) | 5,966 (95%) | 1.58MB |
| **여수 여객선터미널** 34.730–34.765 / 127.720–127.765 | **13,557** | 1 (0%) | 81 (1%) | 13,475 (99%) | 3.63MB |

**OpenFreeMap `building`** (브라우저에서 `querySourceFeatures` 실측, `_run.mjs` §3):

| 위치 | 뷰포트 내 피처 | `render_height` 보유 |
|---|---:|---:|
| 남원 시내 z17.5 pitch 68 | **6** | 4 |
| 전주 한옥마을 z17.3 pitch 68 | **140** | 139 |

> **판정.** 도심(전주·여수)에서는 OSM 만으로도 "마을이 3D 로 선다"가 **시각적으로 성립한다**
> (`08-jeonju-dense.png` — 한옥마을 지붕이 위성영상 위에 빽빽하게 일어선다).
> 그러나 **남원 같은 시골에서는 성립하지 않는다.** 정사영상에는 수백 채의 지붕이 또렷이 보이는데
> 압출되는 상자는 30개 남짓이다(`06-street-3d.png`). 그리고 **높이 태그가 사실상 0%**라
> 전부 같은 키의 판지 상자가 된다.
>
> 스파이크에서는 기본 높이에 **바닥면적 보정**(`_bake-footprints.mjs`, 40m² ×0.72 ~ 2,000m² ×1.9)을
> 넣어 실루엣을 살렸다. 보기에는 낫지만 **실측이 아니라 추정**이다 — 문서에 명시해 두고
> V-World 층수로 교체하는 것이 정공법이다.

### 2.2 V-World `lt_c_bldginfo` — 키가 통과하지 못한다 (요청 전문 기록)

`.env.local` 의 `VWORLD_KEY` 는 **WMTS 위성 타일에서는 200 을 반환**하지만, 건물 레이어를 주는
WFS 와 데이터 API 두 곳 모두 `INCORRECT_KEY` 로 거절한다. 실측한 요청은 다음과 같다.

```bash
# ① WFS — 200 OK 이지만 본문은 ServiceException
curl "https://api.vworld.kr/req/wfs?SERVICE=WFS&REQUEST=GetFeature&VERSION=1.1.0\
&TYPENAME=lt_c_bldginfo&BBOX=127.380,35.400,127.400,35.420&SRSNAME=EPSG:4326\
&OUTPUT=application/json&MAXFEATURES=5&KEY=$VWORLD_KEY&DOMAIN=http://localhost:4173"
# → <ServiceException code="INCORRECT_KEY">인증키 정보가 올바르지 않습니다.</ServiceException>

# ② 데이터 API (2.0) — 동일
curl "https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_BLDGINFO\
&key=$VWORLD_KEY&domain=localhost&geomFilter=BOX(127.380,35.400,127.400,35.420)\
&size=5&format=json&crs=EPSG:4326"
# → {"status":"ERROR","error":{"code":"INCORRECT_KEY","text":"인증키 정보가 올바르지 않습니다."}}

# ③ 같은 키로 WMTS 위성 — 정상 (키 자체는 살아 있다)
curl "https://api.vworld.kr/req/wmts/1.0.0/$VWORLD_KEY/Satellite/14/6467/13990.jpeg"
# → HTTP 200, image/jpeg, 15,295 B  ✅
```

즉 **키가 죽은 것이 아니라 API 유형이 다르다.** V-World 는 발급 시 유형을 고르게 되어 있고
(`WMTS/TMS`, `2D 지도 API`, `데이터 API`, `WFS/WMS` …), 현재 키는 WMTS 계열만 열려 있다.
`Hybrid` 레이어도 같은 키로 `FileNotFound / 서비스 제공영역이 아닙니다` 를 반환한다 —
위성만 열려 있다는 뜻이다.

> **조치**: <https://www.vworld.kr> 마이페이지에서 같은 키에 **「데이터 API」 또는 「WFS」 유형을 추가 신청**하고
> 인증 도메인에 배포 도메인 + `localhost` 를 등록해야 한다. `lt_c_bldginfo`(건물통합정보)는
> **`bdtyp_cd`(용도), `gro_flo_co`(지상층수), `und_flo_co`(지하층수), `bd_mgt_sn`, `buld_nm`** 를 갖고 있어
> 층수×3.3 이 아니라 **실제 층수 기반 높이**가 나온다. 이것이 한국 3D 건물의 정답 소스다.

### 2.2b ✅ 해소됨 — Overture CN-EAB 실측 풋프린트 (스파이크 진행 중 도착)

병렬 조사([2026-08-26 한국 3D 데이터 조달](2026-08-26-spike-korea-3d-data.md))가 **Overture Maps 의
CN-EAB(ML) 건물**을 남원에 붙여 `landxi/assets/data/3d/namwon-buildings.geojson` 로 내려주었다.
스파이크를 즉시 이쪽으로 갈아탔다.

| | OSM (내가 구운 것) | **Overture CN-EAB** |
|---|---:|---:|
| 남원 시내 동수 | 226 | **5,109** (22.6배) |
| bbox | 35.375–35.445 / 127.355–127.435 | 35.374–35.446 / 127.346–127.434 |
| 높이 | `height` 0% · `levels` 0.4% | `height_m` 전량, 단 **5,106/5,109 가 면적 기반 추정**(`height_is_estimate: true`) |
| 부가 속성 | `building` 태그만 | `area_m2`, `floors_est`, `use_est`(단독주택/근린생활…), `height_src` |

**시각적 차이가 결정적이다.** 같은 카메라(레그 마지막 프레임)에서 OSM 은 상자 15개가 흩어져 있을 뿐이지만,
Overture 는 **남원 시내가 통째로 3D 로 선다** (`legs/src/anchors/namwon-3d-2.png`).
즉 §0-2 의 "시골에서는 성립하지 않는다"는 **풋프린트 소스를 바꾸면 해소된다.**

남은 한계는 **높이가 여전히 추정치**라는 것 — 실측 3동뿐이다. §2.2 의 V-World `lt_c_bldginfo` 층수가
붙어야 스카이라인이 진짜가 된다.

지형도 같이 로컬로 내려왔다: `landxi/assets/data/3d/terrain-namwon/` (terrarium PNG, z9–13, 30m 원해상도,
bounds 127.24–127.54 / 35.28–35.54). **네트워크 왕복이 없어 프레임 렌더링 중 DEM 로딩 편차가 사라진다** —
필름 파이프라인에서는 Mapterhorn 보다 이쪽이 옳다.

### 2.3 대안 소스 조사 결과

| 소스 | 남원 커버리지 | 높이 | 판정 |
|---|---|---|---|
| **OSM Overpass** (`out geom`) | 시골 매우 희박 | `height`≈0%, `building:levels` 0~5% | ⚠️ 도심만 쓸만하다 |
| **OpenFreeMap `building`** (OpenMapTiles v3.16) | OSM 파생 → 동일 | `render_height` 는 OSM 태그가 없으면 기본값 | ⚠️ 위와 동일 한계 |
| **Microsoft GlobalMLBuildingFootprints** | ❌ **한국 미포함** | — | ❌ |
| **Overture Maps CN-EAB(ML)** | **남원 5,109동** | `height_m` (면적 추정 99.9%) | ✅ **채택. 형상은 해결** (§2.2b) |
| **V-World `lt_c_bldginfo`** | 전국 법정 건물대장 | 지상/지하 층수 실측 | ✅ **높이의 정답. 키 유형 추가 필요** |
| **우리 AI 검출 비닐하우스** (`namwon-greenhouse-2025.geojson`) | 남원 1,674동 (금지면 397) | 균일 4m 가정 | ✅ **이미 우리 자산** |

Microsoft 미포함은 실측했다. `dataset-links.csv`(7.2MB, 226개 Location)에 `Korea` 문자열이 0건이고,
남원/전주/여수의 level-9 쿼드키(`132112121`, `132112102`, `132112123`)가 모두 목록에 없다.

Overture Maps 건물 PMTiles(`overturemaps-tiles-us-west-2-beta.s3.amazonaws.com`)는
`Access-Control-Allow-Origin: *` 이지만 릴리스 경로 추정이 모두 403 이었다 — **후속 조사 항목**.

---

## 3. 움직이는 구름 — 3안 비교

### 3.1 ⚠️ MapLibre v5 래스터에는 `raster-translate` 가 없다 (실측)

과업이 지정한 "GIBS 를 `raster-translate` 로 흘린다"는 **v5.6.0 에서 불가능**하다.
스타일 검증이 즉시 거부하고, 그 상태로는 `map.on('load')` 자체가 오지 않는다:

```
layers[2].paint.raster-translate-anchor: unknown property "raster-translate-anchor"
layers[2].paint.raster-translate: unknown property "raster-translate"
```

v5 래스터가 가진 페인트 속성은 `raster-opacity / -hue-rotate / -brightness-min|max /
-saturation / -contrast / -resampling / -fade-duration` 뿐이다.
→ **지도에 고정된 구름을 흘리려면 `image` 소스 + `setCoordinates()`** 를 매 프레임 호출해야 한다.
스파이크는 이 방식(`cloudsheet` 소스)을 b 안에 함께 넣었다.

### 3.2 3안 실측

세 안을 같은 페이지에서 토글로 갈아 끼우며 재고, 같은 카메라(z4.6 pitch 15)에서 캡처했다.
캡처: `cloud-a.png` / `cloud-b.png` / `cloud-c.png`.

| 안 | 구현 | 어느 고도에서 보이나 | 지도와 함께 눕나 | 실제로 움직이나 | 인상 |
|---|---|---|---|---|---|
| **a · CSS 시차 덱** | 우리 `clouds/*.webp` 4장을 지도 캔버스 위 `mix-blend-mode:screen` div 로 겹치고 `background-position`+`transform` 을 rAF 로 민다 | z2.6–13.2 (직접 지정) | ❌ **화면 공간** — 피치/베어링과 무관 | ✅ 연속 | **가장 그럴듯하다.** 볼륨감·층위감이 있다 |
| **b · GIBS 래스터** | `MODIS_Terra_CorrectedReflectance_TrueColor` WMTS + `image` 소스 구름장 | z0–9 | ✅ 지도 고정 | ⚠️ 래스터는 **정지**(그날의 실제 구름), `image` 소스만 `setCoordinates` 로 이동 | 진짜 구름이지만 **MODIS 궤도 이음매(검은 쐐기)가 그대로 보이고**, 알파 합성이라 지표를 회색으로 덮는다 |
| **c · three 스프라이트 덱** | CustomLayer, 스프라이트 46장을 실고도 1.5–3km 에 배치, 경도를 매 프레임 증가 | **z12 이상에서만** — z4.6 에서는 서브픽셀이라 **안 보인다**(실측, `cloud-c.png`) | ✅ 완전한 3D — 카메라가 **밑을 통과한다** | ✅ 연속 | 마을 스케일에서 유일하게 "구름 아래로 내려간다"가 성립 |

### 3.2b ⚠️ 스프라이트 덱은 "월드 고정"이면 프레임에 안 잡힌다 (실측)

처음에는 스프라이트 58장을 남원 상공 15×12km 상자에 흩뿌렸다. **z16 이상에서 프레임이 가로 2km 밖에 안 되므로
평균 1장도 화면에 들어오지 않는다.** 렌더된 필름 프레임에 구름이 통째로 없었다.

→ **카메라 고정 무한 구름장**으로 바꿨다. 각 스프라이트는 절대 좌표가 아니라 **카메라 중심 기준 오프셋**을 갖고,
매 프레임 `±spread` 안으로 감아 돌린다:

```js
let dx = u.ox + u.v * t;                              // 서풍 드리프트
dx = ((dx + S) % (2*S) + 2*S) % (2*S) - S;            // ±S 로 wrap → 끝이 없다
const m = MercatorCoordinate.fromLngLat([c.lng + dx, c.lat + u.oy], u.alt);
```

`spread 0.026°(≈2.3km)`, 72장, 고도 950–2200m. 이러면 줌이 바뀌어도 밀도가 유지되고,
`t` 만 주면 위상이 결정되므로 **필름 결정론도 지킨다**.
`depthWrite:false, depthTest:false` 로 두어야 압출 건물과 싸우지 않는다.

### 3.2c ❌ 미해결 — three.js CustomLayer 가 화면에 아무것도 그리지 못한다

**c 안은 코드가 돌지만 픽셀이 나오지 않는다.** 스크롤 데모·필름 레그 어느 쪽에서도 구름이 보이지 않았다.
소진한 가설과 실측 결과를 그대로 남긴다 — 다음 사람이 여기서 이어받으면 된다.

계측(브라우저에서 `render()` 를 래핑해 확인):
```
{ renders: 152, on: true, n: 72, texImg: true, texW: 2048,
  pos0: [2293, 1373, 1284],        // 중심 기준 미터. 정상 범위
  scale0: [2441, 1729], opacity0: 0.29 }
```
→ **render() 는 5초에 152회 불리고, 텍스처(2048px)도 붙었고, 위치·스케일도 합리적이다.**
그런데 화면에는 없다.

| 가설 | 조치 | 결과 |
|---|---|---|
| `THREE.Sprite` 가 빈 Camera 의 단위 `matrixWorld` 때문에 엉뚱한 방향을 본다 | `PlaneGeometry` + `MeshBasicMaterial` 수평 판으로 교체 | ❌ 변화 없음 |
| MapLibre 가 타일 클리핑 스텐실을 켠 채로 넘긴다 (`resetState()` 는 스텐실을 안 건드린다) | `gl.disable(STENCIL_TEST/DEPTH_TEST)`, `depthMask(false)`, 명시적 `blendFuncSeparate` | ❌ 변화 없음 |
| 극단적 스케일의 `mainMatrix` 탓에 three 프러스텀 컬링이 전부 잘라낸다 | `mesh.frustumCulled = false` | ❌ 변화 없음 |

다음에 볼 것 (미시도):
- `args.defaultProjectionData.mainMatrix` 대신 `args.projectionMatrix` / `getProjectionData()` 를 써 본다 —
  전제 문서 §5.2 는 globe 기준으로 `mainMatrix` 를 권했지만 **이 스파이크는 mercator** 다. v5 에서
  mercator 경로의 행렬 규약이 다를 수 있다.
- 알려진 좌표의 큰 불투명 박스(`MeshBasicMaterial` 단색) 하나만 띄워 **위치 문제인지 재질 문제인지** 가른다.
- `renderer.getContext() === gl` 인지, `renderer.state.reset()` 을 추가로 부르는지 확인.
- MapLibre 공식 three 예제(`add-a-3d-model-to-globe-using-threejs`)를 그대로 복사해 최소 재현부터 만든다.

**영향 범위**: 「구름이 움직인다」의 마을 스케일 연출이 현재 불가. 고고도는 a(CSS 시차)로 대체 가능하나
z12 이상에서는 대안이 없다. 필름 레그에서는 **구름을 끄고** 깨끗한 판으로 굽고 있다
(image-to-video 앵커로는 오히려 이쪽이 낫다 — 대기는 생성 모델이 얹는다).

### 3.3 순위 — 하나를 고르는 문제가 아니다

1. **z2.5–9 (궤도·국토)** → **a (CSS 시차)**. 다만 실측 스크린샷에서 **너무 진해 지도를 덮었다**.
   레이어 불투명도를 `.34/.48/.62/.30` → `.16/.22/.30/.14` 로 낮췄다. 화면 공간이라 고피치에서는 어색하므로 pitch ≤ 25 구간에만 쓴다.
2. **z12–17.5 (마을·거리)** → **c (three 판 덱)** 이 유일한 후보지만 **현재 렌더가 안 된다**(§3.2c).
   비용은 이미 확인됐다(4090 기준 마을 스케일 231fps) — 남은 것은 행렬 규약 규명뿐이다.
3. **b (GIBS)** 는 **분위기 소재가 아니라 데이터 레이어**로 쓴다 — 「오늘 이 지역의 실제 구름」
   토글. `mix-blend-mode: screen` 이 필요하면 지도를 두 번 겹쳐야 하는데(MapLibre 레이어에는 블렌드 모드가 없다) 비용 대비 이득이 없다.

권장 조합: **a + c 동시**. 실측 비용은 a+c 가 c 단독과 거의 같다(§4).

---

## 4. 성능

### 4.1 계측 조건 (중요)

- 실 GPU: `chromium.launch({channel:'chrome'})` — **headless shell 을 쓰면 SwiftShader 로 떨어져 측정이 무의미하다**
  (`ANGLE (NVIDIA, RTX 4090, D3D11)` 확인).
- `--disable-frame-rate-limit --disable-gpu-vsync`. **이 플래그 없이 재면 전 구간이 30fps 로 평평해진다**(실측 1차).
- 1600×1000, `deviceScaleFactor: 1`.
- "정지"는 카메라 고정 3초, "스크럽"은 진행도를 ±0.04 로 흔들며 3초 — **후자가 실제 스크롤에 가깝다**.
- ⚠️ **60 근처 값은 성능이 아니라 rAF 상한이다.** MapLibre 는 변화가 없으면 다시 그리지 않으므로,
  구름을 전부 끄면 rAF 가 디스플레이 주사율(≈60)로 떨어진다. 표의 `전부 OFF` 59.2 는
  "가장 느린 구성"이 아니라 **"아무것도 다시 그리지 않는 구성"**이다.

### 4.2 단계별 (RTX 4090, vsync 해제)

| 단계 | 정지 avg / min | 스크럽 avg / min | 프리웜 |
|---|---:|---:|---:|
| S1 궤도 z2.05 globe | 923.6 / 129.9 | 480.3 / 135.1 | 0.9s |
| S2 대기권 z4.4 | 328.9 / 38.8 | 240.8 / 70.4 | 3.1s |
| S3 국토 z6.6 p44 | 306.6 / 45.9 | 223.0 / **13.4** | 2.7s |
| S4 남원 z11.8 p60 **지형 ON** | 261.3 / 82.6 | **109.8** / 36.6 | 4.1s |
| S5 마을 z14.2 p64 **지형 ON** | 233.8 / 122.0 | **95.8** / 34.0 | 2.2s |
| S6 거리 z17.5 p68 3D 건물 | 560.5 / 87.7 | 186.8 / 38.9 | 1.6s |
| S7 금지면 z17.2 p68 온실 | 561.8 / 104.2 | 160.8 / 37.5 | 1.8s |
| S8 전주 z17.3 p68 밀집 6.3천동 | 570.9 / 112.4 | **232.7** / 40.0 | 1.8s |

읽는 법:
- **지형(S4·S5)이 여전히 유일한 절벽이다.** 스크럽 fps 가 다른 구간의 절반(95.8 vs 232.7)이다.
  전제 문서 §7.2 결론이 이 스택에서도 그대로 재현됐다. 그래서 스파이크는 지형을
  진행도 **0.34–0.70 구간에서만** 켜고 거리 장면에서 끈다(`TERRAIN_IN`).
- **3D 건물은 싸다.** 전주 6,289동을 z17.3 pitch 68 에서 그리면서 스크럽 232.7fps —
  지형 켠 마을 장면(95.8)보다 **2.4배 빠르다.** "3D 마을"은 성능 리스크가 아니다.
- **최소 fps 가 진짜 위험이다.** S3 스크럽에서 min 13.4 (프레임 75ms) — globe↔mercator 투영 전환과
  래스터 소스 교체가 겹치는 구간이다. 프리웜/`raster-fade-duration` 으로 완화해야 한다.
- **프리웜은 2–4초.** 스크린샷·데모에서는 `map.areTilesLoaded()` 를 기다려야 뭉갠 화면이 안 나온다(`_run.mjs prewarm()`).

### 4.3 구름 안별 비용

| 구성 | 대기권 z4.4 | 마을 z14.2 |
|---|---:|---:|
| a CSS 시차 | 439.9 | 58.5 † |
| b GIBS 래스터 + image 드리프트 | 309.5 | 187.7 |
| c three 스프라이트 | 454.3 | 237.9 |
| **a + c 동시** | **295.4** | **234.5** |
| 전부 OFF | 59.2 † | 59.4 † |

† = rAF 상한(§4.1). a 는 지도 프레임버퍼를 건드리지 않으므로 **지도를 다시 그리게 하지 않는다** —
즉 마을 스케일 58.5 는 "느리다"가 아니라 "지도가 쉬고 있다"는 뜻이다. **a 의 실비용은 사실상 0.**
c 를 켜면 `triggerRepaint()` 로 매 프레임 렌더가 강제되며, 그 상태에서도 234.5fps 다.

→ **a + c 동시가 정답이고, c 단독 대비 비용 차이가 없다.**

### 4.4 사무용 노트북(Intel iGPU) 추정

전제 문서 §7.2 의 4090↔SwiftShader 비율(대략 6~25배)을 이 측정에 대입하면:

| 구성 | 추정 스크럽 fps | 판정 |
|---|---|---|
| 궤도·국토, 지형 OFF, a 구름 | 45–60 | ✅ |
| 거리 z17.5 3D 건물 6천동, 지형 OFF, a+c | 25–45 | ✅ (연출 가능) |
| 지형 ON pitch 60+ | 10–20 | ⚠️ **3–4초로 한정** |

⚠️ **여전히 실측이 필요하다.** `_run.mjs` 를 대상 노트북에서 한 번 돌리면 이 표가 실측으로 바뀐다.

---

## 5. 포토리얼과의 간극

이 스파이크가 **포토리얼이 아닌 이유**를 솔직하게 적는다.

| 간극 | 무엇이 부족한가 | 메울 방법 | 난이도 |
|---|---|---|---|
| **1. 건물이 판지 상자다** | 지붕 형상·재질·창이 없다. 색은 높이 보간 한 줄. | ① V-World 층수로 실제 높이, ② `fill-extrusion-pattern` 으로 지붕 텍스처, ③ 랜드마크만 glTF(`deck.ScenegraphLayer`) | 중 |
| **2. 그림자가 없다** | MapLibre `fill-extrusion` 은 자체 그림자를 드리우지 않는다. `fill-extrusion-vertical-gradient` 의 면별 명암이 전부다. | v5 로는 불가. three CustomLayer 로 건물을 다시 그리며 섀도맵을 걸거나, 태양 방위에 맞춘 **오프셋 반투명 폴리곤을 가짜 그림자로** 깐다 | 중~상 |
| **3. 시골 건물이 대부분 없다** | §2 — 남원 226동. 정사영상의 지붕 수백 개가 3D 로 서지 않는다. | V-World `lt_c_bldginfo`. 혹은 **우리 AI 로 지붕을 검출**해 폴리곤을 만든다(온실 파이프라인과 동일한 방법) | 상 (그러나 **우리 제품의 정체성 그 자체**) |
| **4. 지형과 건물이 따로 논다** | 지형 ON 구간에서 건물은 z=0 기준으로 선다. 경사지 마을에서 건물이 땅에 파묻히거나 뜬다. | `fill-extrusion-base` 에 `queryTerrainElevation` 값을 굽거나, 거리 장면에서 지형을 끈다(현재 선택) | 중 |
| **0. three CustomLayer 가 안 그려진다** | §3.2c — 마을 스케일 구름이 통째로 빠져 있다 | 행렬 규약(mercator `mainMatrix`) 규명 · 최소 재현부터 | **최우선** |
| **5. 구름이 그림자를 드리우지 않는다** | 구름 밑이 어두워지지 않아 "떠 있다"는 느낌이 약하다. | three 스프라이트와 같은 위치에 지상 어두운 원판(`fill`, opacity 0.12)을 깔면 값싸게 흉내난다 | 하 |
| **6. 전지구 스케일에 구름이 없다** | c 는 z12+ 에서만 보이고, a 는 화면 공간이라 글로브에서 어색하다. | 글로브 전용: three CustomLayer 에 **지구 반지름+10km 구면 셸**을 두고 구름 텍스처를 회전시킨다 | 중 |
| **7. 대기광이 약하다** | `sky.atmosphere-blend` 만으로는 림 라이트가 얇다. | 지도 위 `radial-gradient` + `mix-blend-mode:screen` 오버레이(전제 문서 §6.1) | 하 |
| **8. 전환이 '카메라 이동'으로만 읽힌다** | 소스 크로스페이드가 눈에 띈다. | `raster-fade-duration` 확대 + 전환 순간 그레인/블러 오버레이로 덮기 | 하 |

가장 값싼 3개(5·7·8)만 해도 체감이 크게 올라간다. 1·3 은 데이터 문제이지 렌더 문제가 아니다.

---

## 6. 필름 레그 — 스크롤 스크럽 영상으로 굽기

> 방향 정정(`2026-08-26-QUI6-segment-0522.md`): 최종 경험은 **살아 있는 지도가 아니라 스크롤로 스크럽하는 필름**이다.
> 그렇다면 이 스파이크의 값어치는 **"구체적인 실제 장소의 필름 한 구간(leg)을 렌더하는 렌더러"** 다.

### 6.1 결정론 카메라 `window.__leg`

```js
window.__leg = { fps: 25, duration: 5.6, frames: 141, seek(t), settled() }
```

`seek(t)` 하나가 카메라 + **구름 위상**까지 못박는다. 필름은 같은 `t` 를 다시 렌더했을 때 픽셀이 같아야 하므로
결정론이 아니면 안 된다. 그래서 두 가지를 고쳤다:

- **시계 교체.** 구름 드리프트가 `performance.now()` 를 보면 재렌더마다 위상이 달라진다 → `legTime` 을 쓴다(`clock()`).
- **난수 제거.** three 스프라이트 58장의 배치가 `Math.random()` 이면 새로고침마다 구름이 바뀐다
  → **고정 시드 LCG**(`seed = 20260826`)로 대체.

레그 경로 (`?film=1`, UI 전부 숨김, 지형 OFF):

| t | 위치 | z / pitch / bearing | 무엇이 보이나 |
|---|---|---|---|
| 0.0s | 금지면 온실 지대 | 15.35 / 58 / −34 | 0.6m 정사영상 + **AI 검출 온실 345동 청록 4m** |
| 1.3s | 온실 위 스침 | 16.05 / 63 / −22 | 구름층(1.1–2.6km) 진입 |
| 2.6s | 논밭 → 취락 | 16.35 / 66 / −8 | 구름 통과 |
| 4.1s | 요천 따라 북동 | 16.20 / 67 / +12 | V-World 위성으로 인계 |
| 5.6s | 남원 시내 주택가 | 17.25 / 68 / +26 | **OSM 풋프린트 3D 주택** |

### 6.2 ⚠️ `areTilesLoaded()` 만 믿으면 빈 프레임이 나온다 (실측)

큰 `jumpTo` 직후 MapLibre 는 **아직 타일을 요청조차 하지 않은 상태에서 `areTilesLoaded() === true`** 를 돌려준다.
그대로 캡처하면 위성·정사영상이 통째로 빠지고 압출 건물만 허공에 뜬 프레임이 나온다(실제로 겪었다).

```js
let lastData = 0;
map.on('dataloading', () => lastData = performance.now());
map.on('data',        () => lastData = performance.now());
map.on('sourcedata',  () => lastData = performance.now());

settled: () => map.loaded() && map.areTilesLoaded() && !map.isMoving()
               && performance.now() - lastData > 480      // 데이터 이벤트가 조용해졌는가
```

`seek()` 안에서도 `lastData` 를 현재 시각으로 밀어 **이동 직후는 무조건 미정착**으로 본다.

### 6.2b ⚠️ 스타일에 남은 죽은 원격 소스가 렌더를 통째로 멈춘다 (실측)

필름 레그는 z15–17.5 만 훑으므로 EOX Sentinel-2 도, GIBS 도 한 픽셀도 쓰지 않는다.
그런데 **스타일에 소스로 남아 있기만 해도 하나가 죽으면 `map.on('load')` 자체가 오지 않는다.**
실제로 EOX 가 응답하지 않는 동안(`curl` 타임아웃 확인) 프레임 렌더가 120초 대기 후 실패했다.

```js
if (FILM) {
  for (const id of ['eox', 'gibs', 'cloudsheet']) delete style.sources[id];
  style.layers = style.layers.filter(l => !['eox','gibs-clouds','cloudsheet'].includes(l.id));
}
```

**필름 파이프라인 규칙: 그 레그가 실제로 쓰는 소스만 스타일에 남긴다.**
지형도 같은 이유로 로컬 미러(`assets/data/3d/terrain-namwon/`)를 쓴다.

### 6.3 산출물

```
node tools/serve.mjs &
node landxi/proto/spikes/maplibre3d/_leg.mjs          # 141프레임 → mp4 + first/last webp
node landxi/proto/spikes/maplibre3d/_leg.mjs --keys   # 첫/끝 프레임만 (빠른 확인)
```

| 파일 | 내용 |
|---|---|
| `landxi/assets/proto/film/legs/src/namwon-3d.mp4` | 1280×720 25fps 5.6s · H.264 `-crf 20 -g 8`(스크럽용 촘촘한 키프레임) |
| `landxi/assets/proto/film/legs/src/namwon-3d.first.webp` | 첫 프레임 — 금지면 온실 |
| `landxi/assets/proto/film/legs/src/namwon-3d.last.webp` | 끝 프레임 — 남원 시내 주택 |
| `landxi/assets/proto/film/legs/src/anchors/namwon-3d-{0,1,2}.png` | **1920×1080 앵커 스틸 3장** — image-to-video(kling) 참조 프레임 |
| `build/film/legs/namwon-3d/f_*.png` | 원본 프레임(빌드 산출물, 커밋 안 함) |

렌더 속도: 프레임당 약 1.0–1.5초(타일 정착 대기 포함) → **5.6초 레그에 약 2.5분**.

### 6.4 앵커 스틸 — 왜 중간 컷만 레그 경로를 벗어나는가

AI 미니어처 디오라마(kling) 의 참조 프레임으로 쓸 1920×1080 스틸 3장을 함께 굽는다.

| # | 카메라 | 무엇이 보이나 |
|---|---|---|
| 0 | 레그 `t=0` — 127.310/35.332 z15.35 p58 | 0.6m 정사영상 + **AI 검출 온실 345동 청록 4m** |
| 1 | **경로 밖 포즈** 127.3742/35.4020 z16.15 p69 b22 | **남원 시내 전체가 3D 로 선 채 좌측에 청록 온실** — 두 자산이 한 프레임에 |
| 2 | 레그 `t=5.6` — 127.389/35.408 z17.25 p68 | **Overture 실측 풋프린트로 선 남원 시내** |

처음에는 온실 슬라이스를 0.6m 정사영상 코어(금지면)로만 잘라 두어 주택과 겹치지 않았다.
실측 풋프린트 bbox 안을 다시 세어 보니 **AI 검출 온실이 84동 더 있었다** → 슬라이스를 두 영역의
합집합(345 → **439동**)으로 넓혔더니 남원 시내 한 프레임에 **주택 + 온실이 함께** 잡힌다.
레그 경로를 벗어난 카메라가 필요해 `window.__leg.pose({center,zoom,pitch,bearing,t})` 를 두었다
(구름 위상 `t` 도 함께 못박으므로 재렌더 시 픽셀이 같다).

---

## 7. 다음 단계

**즉시 (데이터)**
1. V-World 키에 **「데이터 API」/「WFS」 유형 추가 신청** + 도메인 등록 → `lt_c_bldginfo` 로 남원 건물 실측 층수 확보. §2.2 의 curl 3줄로 바로 재확인 가능.
2. 그 사이 대체안: 남원 정사영상에 **우리 검출 모델로 지붕 폴리곤**을 뽑는다. 온실 파이프라인(1,674동)과 동일한 구조이므로 재사용 가능하다.
3. **§3.2c 규명** — three CustomLayer 가 mercator 에서 왜 안 그려지는가. 최소 재현(단색 박스 1개)부터.

**즉시 (연출)**
4. 구름은 **a(z2.5–9) + c(z12–17.5)** 로 확정. b 는 「오늘의 실제 구름」 데이터 토글로 격리.
5. 지형은 `TERRAIN_IN` 구간 유지. 거리 장면은 지형 OFF 가 옳다(성능 + 건물 정합 둘 다).
6. §5 의 5·7·8 (구름 그림자 원판 / 대기광 오버레이 / 전환 그레인) 적용 — 전부 CSS 합성, 비용 0.

**검증**
7. `_run.mjs` 를 **대상 사무용 노트북**에서 1회 실행 → §4.4 추정표를 실측으로 교체.
8. `_measure.json` 을 회귀 기준선으로 커밋해 두고 변경 시 비교.

**필름 파이프라인**
9. 이 레그는 **실지오메트리 폴백**이자 **kling image-to-video 의 앵커 소스**다. 앵커 3장은 UI 없는 1920×1080 이라 그대로 참조 프레임으로 넣을 수 있다.
10. 다른 레그를 추가할 때는 `KEYS`/`LEG` 만 갈아 끼우면 된다 — 나머지(결정론 시계·고정 시드 구름·정착 판정)는 재사용 가능하다.

**본선 반영 시 주의**
- V-World 소스에 `bounds: [124.4, 32.9, 132.1, 38.8]` 를 **반드시** 넣는다. 없으면 글로브/국토 스케일에서
  국외 타일을 1,900여 회 요청해 전부 OWS 예외 XML 로 실패한다(실측).
- 키는 `.env.local` → `tools/serve.mjs` 의 `/landxi/proto/env.js` 경로로만 주입한다. 소스에 넣지 않는다.
- 그런데 **위성 타일에 한해 키는 무의미하다**: 키 WMTS 와 키 없는 `xdworld` 가 z12~z19 전 구간에서
  **바이트 단위로 동일한 타일**을 돌려준다(실측). 키는 데이터/WFS API 를 위한 것이다.
