# login — 정문 보고서 (2026-09-27 · 판정 3차 불합격 4건 해소판)

소유 `landxi/v3/login/**` · 명세 LANDXI-FINAL-SPEC §2.2 · 커밋 없음. 모든 실측은 정문 폼 입력(POST /auth/login) · playwright · :4173 정적 + :8700 실서버 · 세션 주입 0.

## 재검증 (2026-09-29 · 판정 1차 지적 3건 — 코드는 이미 반영, 실서버 재실측)
auth.js · login.css 는 9/27 수정 그대로(추가 변경 없음). 새 브라우저 컨텍스트 · 정문 폼 입력(lx-staff) · :8700 실서버.

| # | 지적 | 조치 | 실측 (9/29) |
|---|---|---|---|
| 1 | `?logout` 뒤 `/me` 200 | probe() 게이트 없음 · `authed('/auth/logout','POST',token)` 바로 호출(네트워크 오류만 700ms 뒤 1회) → `session.clear()` | 로그아웃 전 토큰 `GET /me` **200** → `?logout` → 같은 토큰 **401** ✓ · `POST /auth/logout` 1회 · `/health` 0 · 로컬 세션 0 · pageerror 0 |
| 2 | 재방문 '계속' 미표시 | `GET /me` 바로(네트워크 오류만 1회 재시도) · 401 이면 `session.clear()` | 재방문 **'LX 직원으로 계속 →'** 표시: performance.now **171ms** · 이동 시작부터 **314ms**(3초 기준 안). 캡처 `fix2/1440-resume.png` |
| 3 | 390 첫 뷰 로그인 버튼 잘림 | 모바일 히어로 280 · door/lead 간격 축소 | 로그인 버튼 **top 755 · bottom 799 (< 844)** · scrollWidth 390(가로 스크롤 0) · 콘솔 오류 0. 캡처 `fix2/390.png` |
| 4 | (선택) 390 Ctrl K ↔ 결과 카드 7px | `.ask` bottom 96 | 18px(9/27 실측 · 변경 없음) |

산출물: `shots/final/login/fix2/1440.png` · `fix2/390.png` · `fix2/1440-resume.png` · 영상 `login-1440-e2e.mp4`(16.6초).

## 판정 3차 불합격 → 해소 (최신)
| # | 지적 | 조치 (파일) | 실측 (정문 폼 입력 · :8700 실서버) |
|---|---|---|---|
| 1 | `?logout` 이 `probe()` 에 막혀 서버 세션이 살아 있음(`/me` 200) | `auth.js`: `probe()` 게이트 삭제. 새 `authed(path, method, token)` — 저장된 세션 토큰을 직접 실어 `POST /auth/logout` 을 바로 부름 · **네트워크 오류일 때만 700ms 뒤 1회 재시도**(signIn 과 같은 규칙 · 서버가 답한 오류는 재시도 없음) → 그 뒤 `session.clear()`. 앞선 프로브의 `off` 판정에 걸리지 않도록 `api()` 대신 fetch 직접 | 로그아웃 전 토큰으로 `GET /me` **200** → `?logout` → 같은 토큰 `GET /me` **401** ✓ · 로컬 세션 제거 ✓ · 호출 `POST /auth/logout` 1회(헬스 프로브 0) |
| 2 | 정문 재방문 '계속' 미표시(hidden · `/me` 0회) | `auth.js`: `probe()/probe(true)` 삭제 → `GET /me` 를 바로(같은 `authed` · 네트워크 오류만 1회 재시도). **401 이면 `session.clear()`**, 연결 실패는 세션을 건드리지 않음 | lx-staff 로그인 → 정문 재방문: **'LX 직원으로 계속 →' 182ms**(performance.now) · 이동 시작부터 280ms(3초 기준 안) · `/me` **1회** · pageerror 0. 캡처 `fix1/1440-resume.png` |
| 3 | 390×844 첫 뷰에 로그인 버튼이 잘림(top 859) | `login.css`(≤960): 히어로 320 → **280** · door 여백 28/24 → 20·24·24 · door__body 24/20 → 16/12 · lead 간격 28 → 20. (260 은 장면 3 에서 Ctrl K 카드가 3축 글과 3px 겹쳐 280 으로 확정) | 로그인 버튼 **top 755 · bottom 799 (< 844)** · 겹침 0 · 가로 스크롤 0(scrollWidth − innerWidth = 0) · 콘솔 오류 0. 캡처 `login-390.png` |
| 4 | (선택) 390 장면 3 Ctrl K ↔ 결과 카드 간격 7px | `.ask` bottom 88 → **96** | Ctrl K 카드 bottom 196 ↔ 결과 카드 top 214 = **18px** · 3축 글 bottom 128 ↔ Ctrl K top 145 = **17px**. 캡처 `fix1/390-scene3.png` |

데스크톱(>960) 규칙은 바꾸지 않았다. 5 착지 · `?next` · 틀린 비밀번호 동작은 그대로(`signIn` 경로 무변경). 1440 폼 입력 → `/landxi/v3/lx-console/` 착지 재확인.

**실측 중 참고**: 검증 도중 게이트웨이 :8700 이 외부(다른 워크플로)에서 약 30초 재기동되어 로그인 1회가 타임아웃 — 재기동 뒤 전 항목 재실측 통과. 정문 코드 문제 아님.

**산출물(3차)**: `shots/final/login/login-1440.png` · `login-390.png` · `fix1/1440-resume.png` · `fix1/390-scene3.png` · `login-1440-e2e.mp4`(16.6초: 정문 장면 → lx-staff 폼 입력 → 생산 콘솔 착지 → `?logout` 으로 정문 복귀).

---

## 현 서버 상태 (재실측 · 1차 보고의 '404' 서술은 폐기)
| 경로 | 상태 | 정문이 쓰는 방식 |
|---|---|---|
| `GET /auth/tenants` | **200** | 기관 목록 = 서버 값(`__login.orgSource()` = `server`). 어댑터 폴백은 코드에 남아 있으나 현재 미사용 |
| `GET /public/stats?set=river-occupy&by=sigungu` | **200** · 17ms | 합계 봉투 `total` = **651,478 건**(measured · 2026-04-12) · `breaks` 5분위 경계 4개 · `items[]` 252(bbox·geometry 없음) |
| `GET /public/stats?…&geom=1` | **200** · 약 1.8s · 3.1MB | `geojson` = 252 시군구 Polygon(`sgg_cd · name · sido · value`) |
| 응답 `tiles.pmtiles` | 200 · 294KB · CORS 허용 | 레이어 `river_occupy`(z4–10, 252 Polygon). 현재는 GeoJSON 을 쓰고, 타일은 미사용(아래 '남은 것') |

→ **장면 1 = 국가 결과 모드**(전국 · 하천구역 건물 점유 651,478 건 + 252 시군구 채움). 결과를 못 받을 때만 전국 지도로 물러난다.

## 판정 2차 불합격 → 해소
| # | 지적 | 조치 (파일) | 실측 |
|---|---|---|---|
| 1 | 장면 1 재도착 카메라 어긋남(앞 장면 padding 누적) | `plate.js camOf('korea')`: 계산 직전 `map.setPadding(0)` → `cameraForBounds(KOREA,{padding:pad()})` → 원래 padding 복원, 결과를 **카드 크기별로 캐시**(크기가 바뀌면 다시 계산). 돌려주는 카메라에 `padding:0` 을 실어 도착하면 앞 장면이 남긴 padding 도 걷힘 | **1440**: 첫 도착 z5.854 · 128.200/34.785 · pad 0 → 한 바퀴 뒤(55.5s) 재도착 **z5.854 · 128.200/34.785 · pad 0** (동일). **390**: z3.525 · 128.200/36.217 → 56.9s 재도착 동일. 순환 national 0s → ledger 11.3 → marine 23.4 → sprawl 35.8 → national 47.3s. 캡처 `login-1440.png` ↔ `login-1440-again.png`, `login-390.png` ↔ `login-390-again.png` |
| 2 | 장면 1 '전역 추론 차오름' 부재(피처 0) | `scenes.json national.shape` = `&geom=1` 질의 추가. `plate.js nationalScene`: 가벼운 합계 질의를 먼저 보내고 면 질의가 바로 뒤따름(첫 장면 대기 최대 6s · 스틸이 덮는 동안). 252 면에 5분위 농도(0.06→0.66)·색(청록 3단)을 속성으로 싣고, 페인트 식은 스타일에 고정 · `feature-state`로만 켬. 도착 때 **채움 스윕(1.8s · 고른 속도 · 청록 글로)** 이 지나가는 x 를 매 프레임 읽어, 지난 시군구부터 켜고 막 켜진 면은 320ms 더 밝게 섰다 가라앉음. 스윕이 끝나면 합계 카드가 선다. 떠날 때 `removeFeatureState`로 비움. 면을 못 받으면 전국 지도만(지어내지 않음) | 채움 진행 로그(1440): 0.42s 1곳 → 0.62s 18 → 0.75s 126 → 0.95s 188 → 1.15s **251** → 1.55s **252/252**. 도착 후 `queryRenderedFeatures(kr-fill)` 고유 시군구 **1440: 252 · 390: 248**(390 은 z3.5 에서 1px 미만 소형 구 4곳이 래스터화되지 않음 · 켜진 상태 252/252). 캡처 `login-1440-filling.png`(180/252 채움 중) · `login-390-filling.png`(214/252) · 완료 `login-1440.png` · `login-390.png` |
| 3 | 문 카드 넘침(1366×768 · 1280×720) | `login.css`: `max-height ≤ 800` 에서 바깥 여백 32 · door padding 32 · 가운데 정렬 `safe center`(넘치면 위부터) · lead 28 · 탭 16 · 필드 8 · 로그인 16. `≤ 740` 에서 헤드라인 32/42 · lead 20. **기관 문(기관 칸 +76)** 은 `:has()`로 위 여백부터 내줌 | door `scrollHeight − clientHeight`: **1280×720 0 · 1366×768 0 · 1440×900 0 · 1920×1080 0**(기본). 최악(기관 탭 + 빈 입력 오류 문구)도 **4 해상도 모두 0**. LX 로고·LX 로크업 카드 안 ✓. 캡처 `login-fit-{1280x720,1366x768,1440x900,1920x1080}.png` · `login-fit-1366x768-tenant.png` |
| 4 | 히어로 하단 음영 .62×48% | `.hero__shade` → **rgba(17,19,23,.28) × 30%**(모바일 상단 동일 .28×30%). 3축 글자 가독은 text-shadow(`0 1px 2px .45 + 0 0 12px .35`)로 | `login-1440.png` · `login-390.png`: 지도가 카드 끝까지 읽히고 3축 글자 흰색 판독 ✓ |
| 5 | 보고서 서버 서술 오류 | 이 표로 교체(위 '현 서버 상태') | — |

### 모바일 카메라(390) 보정
3축 글이 위, 결과 카드가 아래에 얹히므로 좁은 화면 패딩을 `top 0.34 · bottom 0.3`(카드 높이 대비)로 바꿈(`auth.js` pad). 전국 전체(제주 포함)가 글과 카드 사이에 들어온다. 대가로 전국 줌이 z3.5 로 작다 — 판정 의견을 받고 싶은 항목.

## 합격선 재실측 (2차 해소 후)
| 기준 | 결과 |
|---|---|
| 5 착지(폼 입력) | lx-staff → `/v3/lx-console/` · lx-admin → `/v3/ops-core/` · lx-sales → `/v3/sales/` · namwon-manager → `/v3/gov-fusion/` · kgz-agri-manager → `/v3/global/` ✓ |
| `?next` | `//evil…` · `https://evil…` · `/v3/../../x/` · 권한 밖 ops-core → lx-console · 권한 안 lx-review → lx-review ✓ |
| 첫 뷰 글자 / 버튼 / 금지어 | 1440: 159자 · 2 · 0 / 390: 152자 · 1(첫 화면 안) · 0 |
| 390 가로 스크롤 | scrollWidth 390 |
| 콘솔 오류 | 1440 · 390 한 바퀴(55s) 동안 **0**. (`requestfailed` 11–13건 = 카메라 이동 때 브라우저가 취소한 외부 영상 타일 `ERR_ABORTED` · 콘솔 오류 아님) |
| 순환 결과 | 651,478 건(전국) · 20,852 필지(남원) · 2,078 건(여수) · 44.4 ㎢(비슈케크) |

## 산출물 (2차 갱신분)
- `shots/final/login/login-1440.png` · `login-1440-again.png` · `login-1440-filling.png`
- `shots/final/login/login-390.png` · `login-390-again.png` · `login-390-filling.png` · `login-390-scene2.png`
- `shots/final/login/login-fit-1280x720.png` · `-1366x768.png` · `-1440x900.png` · `-1920x1080.png` · `-1366x768-tenant.png`
- `shots/final/login/login-1440-e2e.mp4` (12.6초): 스틸 → 전국 252 시군구 채움 스윕 → 651,478 건 카드 → lx-staff 폼 입력 → 생산 콘솔 착지
- 그 밖 `-t0 · -scene2..4 · -wrong · -drawer · -resume` 은 1차 해소판 그대로(2차 변경 영향 없음)

## 남은 것 · 키트 요청
- 면 GeoJSON 이 3.1MB · 1.8s 다. 응답에 이미 `tiles.pmtiles`(294KB)가 있으니, 스윕 순서용 시군구 중심 x 만 서버가 `items[].center`(또는 `bbox`)로 주면 타일로 바꿔 첫 장면 대기를 줄일 수 있다(서버 요청).
- 키트 요청(1차와 같음): K3 `createStage`에 `preserveDrawingBuffer` 옵션 · K5 서랍의 마스트 없는 화면 변형.

---

## (참고) 판정 1차 불합격 → 해소
| # | 지적 | 조치 | 실측 |
|---|---|---|---|
| 1 | `계속` 링크 화살표 두 개(`… 계속 → →`) | `auth.js` 문구를 `{이름}으로 계속`으로. 화살표는 키트 `.t-btn--text::after` 하나만 | 정문 로그인 후 재방문: 텍스트 `LX 직원으로 계속` + `::after` `→` = 화살표 1 (`login-1440-resume.png`) |
| 2 | 장면 1 `HYPER PERFORMANCE / 전국` 밑에 비슈케크 노출 | S-4 없을 때 장면 1 = **전국 지도만**(K3 기본 카메라 = `kit/stage.js` `KOREA` bounds · 캡션·숫자·스윕 없음 · 결과 카드 숨김). 비슈케크는 **GeoAI 축 보조 장면**(여수 드론 뒤 위성)으로 이동. 첫 페인트 스틸도 전국(`still-national.webp`, 지도 캔버스에서 직접 캡처)으로 교체, 구 스틸 삭제. 전국 저줌에서 V-World 사각 경계가 드러나지 않게 K3와 같은 넘김(z6.5→7.4) | 순환 실측(1440): 3.9s 전국(카드 숨김 · `© EOX`) → 14.9s 남원 대장 대조 → 27.3s 여수 Ctrl K → 39.8s 비슈케크(`HYPER GEOAI`) → 50s 전국. 축 색인은 3개 그대로(같은 축 보조 장면은 제목을 다시 띄우지 않음) |
| 3 | 헬스 프로브 1.5초 타임아웃으로 정상 로그인 실패 | 로그인 전 프로브 제거. `POST /auth/login`을 바로 부르고, **응답이 없을 때(네트워크 오류)만 700ms 뒤 1회 재시도**. 서버가 답한 오류(401 등)는 재시도 없이 그대로. 앞선 느린 프로브의 `off` 판정은 해제(`lx_api_mode=off` 수동 설정은 존중). `계속` 줄의 프로브도 1회 재시도 | 첫 로그인 요청 강제 끊김 → 재시도로 착지 ✓ · 헬스 3초 지연 → 착지 ✓ · 두 번 다 끊김 → `서버에 연결할 수 없습니다` ✓ · 정상 계정 반복 9회 실패 **0** |
| 4 | 캡션 · Ctrl K 문장 · 카메라가 JS 상수 | 새 데이터 파일 `login/scenes.json`로 이동: 장면별 `axis · kind · where · unit · credit · cam · ask · data · tiles · value · basis · source`, 공개 전국 결과(S-4) 캡션·질의도 `national` 항목에. `plate.js`는 kind(`view · findings · points · grid · stats`)별 읽기·그리기만. 층·소스 이름도 지역명 → kind 이름(`ld-* · pt-* · grid-heat`) | `plate.js · auth.js · index.html · login.css`에서 `남원 · 여수 · 비슈케크 · namwon · yeosu · kgz` 및 좌표 리터럴 grep 0건 |

## (참고) 1차 해소판 실측
| 기준 | 결과 |
|---|---|
| 빈 입력 / 틀린 비밀번호 / 관리자 문에 직원 | `아이디와 비밀번호를 입력하세요` / `아이디 또는 비밀번호가 맞지 않습니다` / `관리자 계정이 아닙니다` ✓ |
| 5 착지 | lx-staff → `/v3/lx-console/` · lx-admin → `/v3/ops-core/` · lx-sales → `/v3/sales/` · namwon-manager → `/v3/gov-fusion/` · kgz-agri-manager → `/v3/global/` ✓ |
| e2e 합계 | 11/11 PASS + 반복 9회 실패 0 |
| 첫 뷰 글자 | 1440 · 390 모두 126자(≤ 200) |
| 390 | scrollWidth 390(가로 스크롤 0) |
| 콘솔 오류 | 1440 · 390 장면 4개 전 순환 동안 0 |

## 산출물 (갱신)
- `shots/final/login/login-1440.png`(장면 1 전국) · `-t0`(0.5초 첫 페인트) · `-scene2`(남원 대장 대조) · `-scene3`(여수 Ctrl K) · `-scene4`(비슈케크 · GeoAI) · `-wrong` · `-drawer` · `-resume`(화살표 1)
- `shots/final/login/login-390.png` · `-t0` · `-scene2..4` · `-full`
- `shots/final/login/login-1440-e2e.mp4` (19.5초): 전국 장면 → 폼 입력 → 남원 장면 도착 → 로그인 → 생산 콘솔 착지

---

## (이하 1차 보고 — 참고용)

## 반영한 차이(현행 v3 login 유지 + §2.2 차이)
| 항목 | 반영 |
|---|---|
| 3축 문구 | `HYPER PERFORMANCE / 전국을 바로 읽습니다` · `HYPER SOLUTION / 대장 대조에서 보고서까지` · `HYPER GEOAI / 위성·항공·드론을 한 지도에` (장면과 동기) |
| 장면 캡션 | `{지역명} · {업무명}` 형식: `비슈케크 · 도시 확장` · `남원시 · 농지 실태조사` · `여수시 · 해양쓰레기` (예시 지역 3곳 · 남원은 하나) |
| 장면 3 = Ctrl K → 지도 | 흰 카드 한 줄 `Ctrl K 여수시 해양쓰레기 지도에 보여줘`가 타이핑된 뒤 지도가 날아감 |
| 장면 숫자 + 기호 (K6) | 결과를 봉투로 세우고 키트 `sig()`가 기호를 붙임, 호버는 키트 풍선(예: `2025년 위성 영상 · 2026.09.26 기준`). 자체 툴팁은 뺌 |
| 기관 목록 (S-1) | `hasRoute('/auth/tenants')` → `GET /auth/tenants`. **서버에 아직 없어 어댑터로 폴백**(공개 디렉터리 파일을 `{id,name,scope}` 모양으로 접음, `__login.orgSource()` = `adapter`). S-1이 올라오면 코드 수정 없이 서버 값을 씀 |
| 착지 | 키트 K2 `keyOf` + `landingFor`(허용표 한 곳). 해외 기관(`scope=global`) → `/landxi/v3/global/` 추가 |
| `?next` 화이트리스트 | 키트 `ALLOW`의 집 이름 전부(main · service-detail · help-my · lx-* · gov-* · ops-* · sales · xi-clean · global) + 그 사람 권한 대조 |
| 401 | 서버 문구 그대로(기관 문도 같은 문구 · 기관 칸만 함께 표시) |
| 계속 | `{이름}으로 계속 →` |
| 계정 찾기 · 신청 | 모달 대신 K5 서랍(`drawer`) · 3행 · Esc 닫기 |
| CSS | `kit/kit.css` 한 벌(토큰 포함)로 교체 |
| 장면 1 (S-4) | `GET /public/stats`가 생기면 장면 1을 `전국 · 하천구역 건물 점유`(합계 봉투 + 시군구 열점)로 교체. **2차: 경로가 없으면 전국 지도만**(위 표 #2) |

## 합격선 실측 (정문 폼 입력 · playwright · :8700 실서버)
| 기준 | 결과 |
|---|---|
| 첫 뷰 ≤ 200자 | 1440: **148자** · 390: 140자 |
| 버튼 3 | 1440 첫 뷰: 2 (로그인 · 계정 찾기). 세션이 있으면 `계속`까지 3 |
| 금지어 (K16 `scan`) | 1440 · 390 모두 0 |
| 빈 입력 | `아이디와 비밀번호를 입력하세요` |
| 틀린 비밀번호 | `아이디 또는 비밀번호가 맞지 않습니다` + 흔들림 |
| 관리자 문에 lx-staff | `관리자 계정이 아닙니다` (발급된 토큰은 즉시 폐기) |
| 5 착지 | lx-staff → `/v3/lx-console/` · lx-admin → `/v3/ops-core/` · lx-sales → `/v3/sales/` · namwon-manager → `/v3/gov-fusion/` · kgz-agri-manager → `/v3/global/` |
| 오픈 리다이렉트 0 | `//evil…` · `https://evil…` · `/v3/../../x/` → 모두 lx-console. 권한 밖 `next=/v3/ops-core/`(직원) → lx-console. 권한 안 `next=/v3/lx-review/` → lx-review |
| `?logout` | 서버 세션 종료 후 로컬 세션 null |
| 390 | 가로 스크롤 0 · 축 글과 결과 카드 겹침 0 |
| 콘솔 오류 | 390: 0. 1440: 1건 = 틀린 비밀번호 검사에서 나온 `401` 네트워크 로그(브라우저가 남기는 것 · 의도된 거절). 그 외 0 |
| 장면 순환 | 3장면 모두 도착 (44.4 ㎢ · 20,852 필지 · 2,078건) |
| 지역 하드코딩 | 장면 id를 `sprawl · ledger · marine`으로 바꿈. 지역 문자열은 결과 파일 이름과 캡션 데이터에만 남음 |

## 산출물
- `shots/final/login/login-1440.png` · `login-1440-scene3.png`(Ctrl K 장면) · `login-1440-wrong.png` · `login-1440-drawer.png` · `login-390.png` · `login-390-full.png`
- `shots/final/login/login-1440-e2e.mp4` (15.8초): 정문 → 장면 → lx-staff 폼 입력 → 콘솔 착지

## 키트 요청
1. **K3 `createStage`에 `preserveDrawingBuffer` 옵션을 추가해 주세요** (또는 프레임 스냅샷 도우미). 히어로 카드는 대륙을 건너는 장면 전환 때 떠나는 프레임을 덮개로 씁니다. 그래서 무대는 아직 자체 MapLibre(plate.js)로 두었고, 이 옵션이 생기면 K3로 옮깁니다.
2. K5 서랍의 `top`이 `--mast`를 기준으로 잡혀 있습니다. 마스트가 없는 화면을 위한 변형(`top: var(--margin)`)이 있으면 정문의 덮어쓰기 한 줄을 지울 수 있습니다.

## 서버 의존 (1차 당시 기록 · 현재는 위 '현 서버 상태'가 맞음)
- (1차 당시) S-1 `GET /auth/tenants`와 S-4 `GET /public/stats`는 그 시점 :8700에서 404였습니다. 정문은 `openapi.json`으로 경로가 있는지 먼저 보고 부르므로 404가 콘솔에 남지 않습니다. 두 경로가 올라오면 자동으로 전환됩니다(재검증 필요).
- S-4 응답 모양이 명세에 없어 `total | value | summary.total` 중 봉투인 것과 `items[].bbox`를 읽도록 했습니다. 서버 팀이 모양을 정하면 맞춰야 합니다.

## 제안 (구현은 명세대로)
- `기관을 선택하세요` · `서버에 연결할 수 없습니다` · `잠시 후 다시 시도하세요` 세 문구는 §2.2 문구 목록에 없습니다. 기관을 안 골랐을 때와 서버 연결이 끊겼을 때 쓰는 문구라 남겨 두었고, 명세 추가를 제안합니다.
- (2차에서 해소) 장면 1 폴백은 이제 전국 지도만입니다.
