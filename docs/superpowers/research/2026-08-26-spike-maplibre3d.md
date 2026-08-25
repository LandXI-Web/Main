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

<!-- VERDICT -->

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

### 2.3 대안 소스 조사 결과

| 소스 | 남원 커버리지 | 높이 | 판정 |
|---|---|---|---|
| **OSM Overpass** (`out geom`) | 시골 매우 희박 | `height`≈0%, `building:levels` 0~5% | ⚠️ 도심만 쓸만하다 |
| **OpenFreeMap `building`** (OpenMapTiles v3.16) | OSM 파생 → 동일 | `render_height` 는 OSM 태그가 없으면 기본값 | ⚠️ 위와 동일 한계 |
| **Microsoft GlobalMLBuildingFootprints** | ❌ **한국 미포함** | — | ❌ |
| **V-World `lt_c_bldginfo`** | 전국 법정 건물대장 | 지상/지하 층수 실측 | ✅ **정답. 키 유형 추가 필요** |
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

### 3.3 순위 — 하나를 고르는 문제가 아니다

1. **z2.5–9 (궤도·국토)** → **a (CSS 시차)**. 다만 실측 스크린샷에서 **너무 진해 지도를 덮었다**.
   레이어 불투명도를 `.34/.48/.62/.30` → `.16/.22/.30/.14` 로 낮췄다. 화면 공간이라 고피치에서는 어색하므로 pitch ≤ 25 구간에만 쓴다.
2. **z12–17.5 (마을·거리)** → **c (three 스프라이트)**. 「구름이 움직인다」의 정서적 핵심은 여기다.
   덱 하나(46장)로 4090 기준 마을 스케일 231fps.
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
| **5. 구름이 그림자를 드리우지 않는다** | 구름 밑이 어두워지지 않아 "떠 있다"는 느낌이 약하다. | three 스프라이트와 같은 위치에 지상 어두운 원판(`fill`, opacity 0.12)을 깔면 값싸게 흉내난다 | 하 |
| **6. 전지구 스케일에 구름이 없다** | c 는 z12+ 에서만 보이고, a 는 화면 공간이라 글로브에서 어색하다. | 글로브 전용: three CustomLayer 에 **지구 반지름+10km 구면 셸**을 두고 구름 텍스처를 회전시킨다 | 중 |
| **7. 대기광이 약하다** | `sky.atmosphere-blend` 만으로는 림 라이트가 얇다. | 지도 위 `radial-gradient` + `mix-blend-mode:screen` 오버레이(전제 문서 §6.1) | 하 |
| **8. 전환이 '카메라 이동'으로만 읽힌다** | 소스 크로스페이드가 눈에 띈다. | `raster-fade-duration` 확대 + 전환 순간 그레인/블러 오버레이로 덮기 | 하 |

가장 값싼 3개(5·7·8)만 해도 체감이 크게 올라간다. 1·3 은 데이터 문제이지 렌더 문제가 아니다.

---

## 6. 다음 단계

**즉시 (데이터)**
1. V-World 키에 **「데이터 API」/「WFS」 유형 추가 신청** + 도메인 등록 → `lt_c_bldginfo` 로 남원 건물 실측 층수 확보. §2.2 의 curl 3줄로 바로 재확인 가능.
2. 그 사이 대체안: 남원 정사영상에 **우리 검출 모델로 지붕 폴리곤**을 뽑는다. 온실 파이프라인(1,674동)과 동일한 구조이므로 재사용 가능하다.
3. Overture Maps 건물 PMTiles 릴리스 경로 확인(403 이었음).

**즉시 (연출)**
4. 구름은 **a(z2.5–9) + c(z12–17.5)** 로 확정. b 는 「오늘의 실제 구름」 데이터 토글로 격리.
5. 지형은 `TERRAIN_IN` 구간 유지. 거리 장면은 지형 OFF 가 옳다(성능 + 건물 정합 둘 다).
6. §5 의 5·7·8 (구름 그림자 원판 / 대기광 오버레이 / 전환 그레인) 적용 — 전부 CSS 합성, 비용 0.

**검증**
7. `_run.mjs` 를 **대상 사무용 노트북**에서 1회 실행 → §4.4 추정표를 실측으로 교체.
8. `_measure.json` 을 회귀 기준선으로 커밋해 두고 변경 시 비교.

**본선 반영 시 주의**
- V-World 소스에 `bounds: [124.4, 32.9, 132.1, 38.8]` 를 **반드시** 넣는다. 없으면 글로브/국토 스케일에서
  국외 타일을 1,900여 회 요청해 전부 OWS 예외 XML 로 실패한다(실측).
- 키는 `.env.local` → `tools/serve.mjs` 의 `/landxi/proto/env.js` 경로로만 주입한다. 소스에 넣지 않는다.
- 그런데 **위성 타일에 한해 키는 무의미하다**: 키 WMTS 와 키 없는 `xdworld` 가 z12~z19 전 구간에서
  **바이트 단위로 동일한 타일**을 돌려준다(실측). 키는 데이터/WFS API 를 위한 것이다.
