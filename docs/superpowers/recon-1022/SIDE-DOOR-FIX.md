# 옆문 닫기 (10-22 · 저장 체계 점검 질문 후보 1 ⓐ)

> 근거: 같은 폴더 STORAGE-AUDIT.md 3-4절 · 부록 B.
> 지운 파일, 옮긴 파일은 없다. 원본 영상은 손대지 않았다. 새로 만든 파일은 로그인 화면용 공개 발췌 한 개뿐이다(아래 3).

## 한 줄

**바깥 주소에서 로그인 없이 받아지던 기관 결과, 영상 조각, 필지 조사, 해외 원천이 이제 모두 404나 403이다.** 공용 기준 지도(세계 바탕, 해외 위성 바탕, 행정경계)만 그대로 열려 있다. 게스트, LX 직원, 남원, 광주전남으로 들어가면 지도와 결과가 모두 그려진다.

점검하다 **옆문이 하나 더** 있는 것을 찾아 함께 닫았다. 게이트웨이의 `results/lx/…` 이름으로도 같은 파일을 서명 없이 받을 수 있었다. 예를 들어 광주전남 해양 결과는 기관 이름으로 받으면 403이지만, LX 이름으로는 206이었다.

## 전후 표 (바깥 주소 · 로그인 없이 · 처음 100바이트)

| 파일 | 전 | 후 |
|---|---|---|
| 파일 목록 manifest.json | 206 | **404** |
| 남원 농지 결과(정적 길) | 206 | **404** |
| 여수 해양 결과 2025 항공(정적 길) | 206 | **404** |
| 여수 해양 2026 드론 · 해양쓰레기 · 남원 변화 · 남원 건물 · 제주 불법(정적 길) | 206 | **404** |
| 토지피복 GT 2020(pmtiles · geojson) | 206 | **404** |
| 남원 필지 조사 pmtiles(정적 길) | 206 | **404** |
| 등록 영상 조각 img-44790 · img-12130(LX 전용) | 206 | **404** |
| 남원 드론 · 항공 · 국산 · 제주 영상 pmtiles(정적 길) | 206 | **404** |
| 해외 원천 EMSR798 zip · 미얀마 피해 GeoJSON · Maxar 조각 | 206 | **404** ※ |
| 남원 항공 낱장 조각(정적 길) | 200 | **404** ※ |
| 공개 결과 폴더 river-occupy(정적 길) | 206 | **404**(게이트웨이 공개 길은 그대로) |
| 화면 폴더 안 결과 사본(여수 2025 항공 · 남원 변화 geojson) | 200 | **404** |
| 게이트웨이 `results/lx/yeosu-marine-2025-aerial`(= 광주전남 서비스 파일) | **206** | **403** |
| 게이트웨이 `results/lx/namwon-change`(= 남원 변화 서비스 파일) | 206 | **403** |
| 게이트웨이 `imagery/namwon_2504` · `namwon_ap25_2023` · `jeju_2022` | 206 | **403** |
| 게이트웨이 `reference/parcels-namwon`(LX 내부 필지) | 206 | **403** |
| 게이트웨이 `/tiles/xyz/namwon_ap25_2023/…`(원본 항공 낱장) | 204(받을 수 있음) | **403** |
| 전국 결과 조각 `/tiles/national/…` | 200 | **403** |
| 남원 필지 조사 서명 길 `results/namwon/parcel-survey`(새 이름) | — | 403(서명 없음) |
| 기관 별칭 dp-nw-farm-25 · dp-gj-marine-25 | 403 | 403(그대로) |
| **남길 것** 시도 · 시군구 · 국토 윤곽 · 남원 읍면동 pmtiles | 206 | **206** |
| **남길 것** 세계 바탕 world-bm · 해외 Sentinel-2 바탕 | 206 | **206** |
| **남길 것** 시군구 경계(게이트웨이 reference) | 206 | **206** |
| 로그인 화면 공개 발췌 `public/login-ledger` | — | 206(공개 판) |

※ Cloudflare 가장자리 보관 때문에 **주소를 그대로 부르면 한동안 옛 응답이 나온다**. EMSR798 zip은 보관 24시간, 항공 낱장은 4시간이다. 같은 주소에 `?nb=1`을 붙여 보관을 비켜 가면 404나 403이 나온다(확인함). 관문은 이미 막았다. 보관을 바로 비우려면 Cloudflare 화면에서 '캐시 비우기'를 해야 한다(남은 것 1).

## 무엇을 바꿨나

1. **공개 관문 허용 목록**(`tools/public-gate.mjs`): `/landxi/data/`에서는 `tiles/world-bm/` · `tiles/overseas-s2/`와 행정경계 pmtiles 4개만 연다. 화면 폴더 안의 결과 사본 중 공개가 아닌 것(여수 2025 항공 · 남원 변화 geojson)도 막았다.
2. **게이트웨이 서명 규칙**(`server/landxi_api/catalog.py` · `tiles.py`):
   - `restricted_set`: sets.yaml의 layers · imagery 가운데 공개가 아닌 세트에 서명을 요구한다. 공개는 export_policy public, 결과라면 security_review cleared까지 갖춘 것이다.
   - 카탈로그의 `signed` 표시도 같은 규칙을 따른다. 그래서 화면은 고치지 않아도 `tileUrl` · `sourceSpec`이 `/tiles/sign`을 부른다.
   - `/tiles/sign`: LX가 아닌 사람은 **그 기관 카탈로그에 있는 세트만** 서명을 받는다. 배포본 결과, 공유받은 영상, 참조 층이 그 범위다.
   - `/tiles/xyz/{폴더}`: 공개 아닌 영상 폴더는 서명이 있어야 받는다(이 길을 부르는 화면은 없다).
   - 새 이름 `results/{기관}/parcel-survey`는 그 기관의 필지 조사 파일(`survey/{기관}-parcel-survey.pmtiles`)을 가리킨다. 지역 하드코딩은 없다.
3. **필지 조사**(`ledger.py` · `gov-fusion/app.js` · `xi/survey/survey-mode.js`): 서버의 `parcel_tiles`가 정적 경로 대신 서명 주소를 준다. 화면은 그 주소를 쓰고, 주소가 없으면 그 기관 세트로 서명을 받는다.
4. **전국 결과 조각**(`national.py` · `xi-clean/national.js`): 근거는 이렇다. 진행 장부(`/national/progress`)는 LX 전용이고, 이 조각을 쓰는 화면도 XI맵(LX)뿐이다. 게스트 첫 화면과 로그인 화면은 `/public/stats`(하천 점유 · 공개 판)를 쓴다. 그래서 **로그인 뒤로 옮겼다**. 진행 장부가 서명(`tile_sig` · 6시간 칸)을 주고, 조각은 그 서명이 있어야 받는다.
5. **서비스 상세 지도**(`service-detail/app.js`): `it.url`을 그대로 쓰지 않고 `tileUrl(it)`을 쓴다. 서명이 필요한 결과도 이제 그려진다.
6. **로그인 화면 장면**(`login/plate.js` · `scenes.json`):
   - '대장 대조' 장면은 남원 필지 조사 파일 전체(PNU · 주소 · 근거 포함)를 정적 길로 읽고 있었다.
   - 이것을 **공개 발췌** `02. 데이터/tiles/public/login-ledger.pmtiles`로 바꿨다. 장면 카메라 둘레 약 6×4km만 담았고, 필지 모양과 의심 우선순위만 남겼다(2.5MB). 게이트웨이 공개 길(`/tiles/pmtiles/public/…`)로 읽는다.
   - '도시 확장' 장면은 화면 폴더의 같은 파일(`global/data/kgz-sprawl-2017-2025-esri.json` · 내용 같음 확인)로 바꿨다.
7. **옛 해외 화면**(`global/js/disaster-swipe.js`): Maxar 조각에 닿지 않으면 공개 위성(S2) 전후로 넘어간다.
8. **시험**(`server/tests/test_guards.py` · `test_impl22_national.py`): 서명 없는 요청은 403, 서명이 있으면 200인지 확인하도록 고쳤다. 21개 중 해당분 통과.

손대지 않은 것: `landxi/ops/*`(옛 관리자 화면)와 `ops/js/overview.js`. 이 화면들은 :8702 포트에서만 열린다(포트 관문). 그 포트의 `serve-ops.mjs`가 자료를 바로 내주므로 바깥 주소와 관계없다. overview의 json 대체 읽기는 원래 바깥 주소에서 404였고, 실패해도 조용히 넘어간다.

## 화면 확인 (바깥 주소 · 로그인 폼 frontDoor · 그림은 로컬 `docs/superpowers/final/process/impl-46/side-door/`)

| 누구 | 화면 | 결과 | 그림 |
|---|---|---|---|
| 게스트 | 로그인 | 세 장면 모두 그려짐. 대장 대조 장면에 의심 필지가 청록으로 서고, 의심 필지 21,123이 나옴. 도시 확장 장면도 그려짐 | guest-login-ledger.png · guest-login-sprawl.png |
| 게스트 | 메인 | 지구본(세계 바탕)이 그려짐. 공개 자료만 씀 | guest-main.png |
| LX 직원 | XI맵 | 전국 결과 면(서명 조각) · 서비스 결과가 그려짐 · 실패 요청 0 | lx-staff-xi-map.png |
| 남원 기관 | XI맵 | 남원 서비스 결과가 그려짐 · 실패 요청 0 | namwon-xi-map.png |
| 남원 기관 | 대장 대조(기관 융합) | 필지 조사 층(서명) · 결과 6필지가 그려짐 | namwon-gov-fusion.png |
| 광주전남 기관 | XI맵 | 해양 결과 칸이 그려짐 · 실패 요청 0 | gwangju-jeonnam-xi-map.png |

**권한 확인** (로그인한 화면에서 서명을 받고 그 주소로 받기):

| 누가 | 남원 농지 | 남원 필지 조사 | 광주전남 해양(기관 이름) | 해양(LX 이름) | 남원 변화 |
|---|---|---|---|---|---|
| LX 직원 | — | 서명 · 206 | — | 서명 · 206 | — |
| 남원 | 서명 · 206 | 서명 · 206 | **403** | **403** | — |
| 광주전남 | **403** | **403** | 서명 · 206 | 서명 · 206 | **403** |

→ **다른 기관 계정으로는 남원 결과가 열리지 않는다.**

## 남은 것

1. **Cloudflare 가장자리 보관 비우기(사용자 조치):** 막기 전 받아 간 주소는 보관 시간 동안 옛 응답이 나온다. EMSR zip은 최대 24시간, 낱장 webp는 4시간, pmtiles는 5분이다. 관문 쪽 열쇠가 없어 이 PC에서는 비울 수 없다. Cloudflare 화면에서 land-xi.dev의 Caching → Purge Everything을 하거나, `/landxi/data/` 아래 주소만 골라 비우면 된다.
2. **남원 농지 결과의 공개 여부(결정 필요):**
   - 남원 농지 2025(`results/lx/namwon-farmland-2025`)는 sets.yaml에 **public · cleared**로 적혀 있다. 그래서 서명 없이 206이 나온다.
   - 그런데 이 파일은 남원 서비스 dp-nw-farm-25@2.1과 같은 파일이다. 남원 토지피복 2023도 같은 사정이다.
   - '기관 결과는 그 기관만'으로 갈지, 'LX 공개 결과'로 둘지 정해야 한다. 정하면 sets.yaml 한 줄만 바꾸면 된다. now 질문 후보다.
3. **이미 공개 저장소에 있는 사본:**
   - `landxi/assets/data/geo/`(여수 2025 항공 · 남원 변화 · 남원 농지 · 비닐하우스 geojson)는 GitHub 공개 저장소에 추적되어 있다.
   - `landxi/global/data/mm-meiktila-damage.geojson`도 마찬가지다.
   - 바깥 주소에서는 막았지만 저장소 기록에는 남는다. 추적을 끊을지는 사용자가 정한다. 파일 삭제 금지 규칙에 따라 손대지 않았다.
4. **sets.yaml 밖의 세트:**
   - 해양쓰레기(marine-debris)와 여수 2026 드론은 공개 규칙(policy)이 적혀 있지 않아 서명 없이 열린다. 2026 드론은 로그인 화면 장면이 공개로 쓴다.
   - 작업 결과(`results/lx/{작업번호}`)와 전국 결과 묶음도 서명이 없다. 작업 번호는 추측하기 어려운 ULID라 그대로 두었다.
   - 공개 규칙을 sets.yaml에 적으면 같은 규칙이 바로 걸린다.
5. **필지(parcels-namwon) 범위:** 기관 서명 규칙이 '그 기관 카탈로그에 있으면'이다. 참조 층은 지역으로 거르지 않으므로 다른 기관도 남원 필지 서명을 받을 수 있다(전과 같음 · 로그인은 필요). 지역 거르기는 카탈로그 쪽 일이다.
6. **e2e 시험:** `tests/e2e/f1b-public-guard` · `f2s-parcel-card` · `impl22-national`은 이번에 돌리지 않았다. 개발 서버(:4173)는 정적 길을 그대로 내주므로 영향이 적을 것으로 본다.

## 이런 것도 필요하지 않을까요?

- **배포마다 '로그인 없이 받아지는 파일' 자동 점검**(누가: 보안 담당). 이번 표의 주소 목록으로 바깥 주소를 두드리는 시험을 배포 끝에 붙인다. 기준 지도가 아닌데 열린 것이 있으면 알린다.
- **sets.yaml에 공개 규칙이 없는 세트는 기본 서명**(누가: 데이터 관리자). 지금은 적힌 것만 막는다. 새 결과를 올리고 규칙을 빠뜨리면 다시 열린다. '모르면 닫힘'으로 바꾸려면 화면 몇 곳을 함께 점검해야 한다.
- **기관 카탈로그의 참조 층을 관할로 거르기**(누가: 기관 담당). 광주전남이 남원 필지 층을 받을 수 있는 것을 막는다.

## 개발자 부록

- 바뀐 파일:
  - `tools/public-gate.mjs`
  - `server/landxi_api/catalog.py` · `tiles.py` · `ledger.py` · `national.py`
  - `server/tests/test_guards.py` · `test_impl22_national.py`
  - `landxi/v3/xi-clean/national.js` · `v3/gov-fusion/app.js` · `v3/service-detail/app.js` · `v3/login/plate.js` · `v3/login/scenes.json` · `xi/survey/survey-mode.js` · `global/js/disaster-swipe.js`
- 새 데이터 파일: `02. 데이터/tiles/public/login-ledger.pmtiles`
  - 원천: `survey/namwon-parcel-survey.pmtiles`
  - 범위: 127.59–127.66, 35.495–35.535
  - 층: parcels(모양만) · suspects(priority만)
  - 줌: z12–16 · ogr2ogr(gcs) · 원천은 그대로
- 재시작:
  - 게이트웨이 작업 프로세스 4개를 하나씩 PID로 내렸고, uvicorn 감독이 다시 띄웠다. 감독 프로세스와 DB · docker는 건드리지 않았다.
  - 공개 관문은 PID 57744만 끄고 `server/start-public.ps1`로 다시 켰다. cloudflared는 그대로 두었다.
- 검증 스크립트는 스크래치(`sidedoor.mjs` · `hero.mjs` · `probe.sh`)에 있다. 기록은 `impl-46/side-door/log*.json`에 있다.
