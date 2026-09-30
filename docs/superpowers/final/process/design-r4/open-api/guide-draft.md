# Land-XI 연동 API 표준 가이드 (초안 v0.1)

> 2026-09-30 · 지위: **사용자 확인 전 초안** — 아직 열려 있지 않은 API 의 약속 문서다. 확인되면 이 문서가 외부 개발자 안내 페이지(3단)의 본문이 된다.
> 읽는 사람: 기관의 다른 시스템을 만드는 개발자(지자체 정보화 부서 · 기관이 맡긴 사업자 · 해외 기관 개발자).

---

## 1. 무엇을 할 수 있나
Land-XI 는 LX(한국국토정보공사)가 운영하는 GeoAI 실태조사 플랫폼입니다. 이 API 로 **여러분 기관이 받는 AI 분석 서비스의 결과**를 다른 시스템에서 직접 받아 가거나, **영상을 맡겨 분석을 받을 수** 있습니다.

| 할 수 있는 일 | 필요한 권한 |
|---|---|
| 서비스·지역 목록, 요약 숫자, 조각·필지 결과, 필지 하나 조회 | `results:read` |
| 결과 지도 조각(벡터 타일)을 GIS 에 띄우기 | `tiles:read` |
| 실태조사 보고서 받기 | `reports:read` |
| 영상 올리기 · 분석 맡기기 · 상태 · 결과 · 취소 | `analyses:write` |
| 결과 하나에 'AI 가 잘못 봤어요' 메모 한 줄 | `feedback:write` |

할 수 없는 일(학습·모델 바꾸기·원본 영상 내려받기·다른 기관 데이터·개인정보)은 [제공 범위](scope.md) 3절을 보세요.

> **AI 분석 결과는 참고자료입니다.** 행정 처분은 현장 확인 뒤 담당자가 판단합니다. 모든 결과 응답에 `"reference_only": true` 가 실립니다.

---

## 2. 시작하기 — 5분
1. **키 받기** — 기관 담당자가 LX 에 요청하면 LX 관리자가 키를 만들어 전달합니다. 키는 만들 때 **한 번만** 보입니다. 안전한 곳(비밀 저장소)에 두세요.
2. **첫 호출** — 이 키로 쓸 수 있는 서비스를 봅니다.
```bash
curl -s https://api.land-xi.dev/v1/services \
  -H "Authorization: Bearer $LANDXI_KEY"
```
3. **결과 받기** — 서비스 하나의 결과를 첫 쪽부터 받습니다.
```bash
curl -s "https://api.land-xi.dev/v1/services/card-farm/results?region=52190&limit=100" \
  -H "Authorization: Bearer $LANDXI_KEY"
```

---

## 3. 인증 — 기관별 API 키

### 3-1. 키
- 모양: `lxk_` + 공개 앞자리 8자 + `_` + 비밀 40자. 예: `lxk_7Hq2Lm9a_************************`
- 보내는 법: 모든 요청의 머리글에 `Authorization: Bearer <키>`. **주소(쿼리)에 키를 넣지 마세요** — 기록에 남습니다.
- 키 하나 = 기관 하나(또는 그 기관의 한 부서). 키는 **화면 로그인과 완전히 따로**입니다 — 키로 화면에 들어갈 수 없고, 화면 로그인 토큰으로 이 API 를 부를 수 없습니다.
- 서버는 키를 한 방향 암호(HMAC-SHA256)로만 저장합니다. 잃어버리면 다시 볼 수 없고, 새로 만들어야 합니다.

### 3-2. 키에 묶이는 것
| 항목 | 뜻 | 기본값 |
|---|---|---|
| 기관 | 키 주인. 결과·한도·기록이 모두 이 기관 몫 | (필수) |
| 할 수 있는 일(권한) | `results:read` `tiles:read` `reports:read` `analyses:write` `feedback:write` 중 고른 것 | 결과 보기 세 개 |
| 서비스 | 쓸 수 있는 서비스(부서 키는 그 부서 서비스만) | 그 기관의 서비스 전부 |
| 지역 | 관할 안에서 더 좁힌 지역(선택) | 관할 전체 |
| 끝나는 날 | 이 날 뒤로 거절 | 만든 날 + 1년 |
| 허용 IP(선택) | 이 주소에서 온 요청만 | 제한 없음 |
| 알림 받을 주소(선택) | 분석이 끝나면 알림을 보낼 https 주소 | 없음 |

### 3-3. 바꾸기 · 폐기
- **바꾸기**: 새 키를 받아 시스템에 넣고 → 잘 되는지 확인한 뒤 → 옛 키를 폐기합니다(두 키가 잠시 함께 살아 있어도 됩니다).
- **폐기**: LX 관리자 또는 기관 관리자가 폐기하면 **5초 안에** 그 키의 모든 요청이 `401` 이 됩니다. 새어 나간 것 같으면 바로 폐기를 요청하세요.

---

## 4. 주소 규칙
| 항목 | 규칙 |
|---|---|
| 바깥 주소 | `https://api.land-xi.dev/v1/…` (https 만) |
| 버전 | 주소 첫 칸의 `v1`. 화면용 내부 API 와 **분리** — 화면 쪽이 바뀌어도 이 주소의 약속은 그대로 |
| 이름 | 영어 소문자·복수형 명사(`services` `results` `analyses`) · 하이픈 없음 |
| 서비스 id | 서비스 카드 id(예: `card-farm` 영농관리 행정서비스 · `card-marine` 해양쓰레기 실태조사 서비스 · `card-change` 국토 변화 탐지 서비스) — `GET /v1/services` 로 확인 |
| 지역 코드 | 국내: 시군구 5자리 · 읍면동 8자리 행정 코드. 2026년 통합으로 바뀐 코드(예: 전남 46xxx → 12xxx)는 **옛 코드도 받아** 새 코드로 답합니다(`prev_code` 함께). 해외: `GET /v1/regions` 가 주는 구역 id |
| 언어 | `Accept-Language: ko`(기본) 또는 `en` — 메시지·분류 이름·까닭 문장 |

---

## 5. 요청·응답 형식

### 5-1. 공통
- 본문: JSON, UTF-8. 모르는 필드는 **무시**하세요(필드가 늘어나는 것은 같은 버전 안의 변경입니다).
- 모든 응답 머리글: `X-Request-Id`(문의할 때 알려 주세요) · `RateLimit-Limit` · `RateLimit-Remaining` · `RateLimit-Reset`.

### 5-2. 숫자는 '값 · 단위 · 근거 · 기준 시점 · 출처'로
보여 주는 숫자는 맨숫자로 나가지 않습니다. 모두 아래 모양입니다.
```json
{"value": 1857, "unit": "count", "label": "AI 탐지", "basis": "inferred",
 "as_of": "2026-06-08", "source": "AI 분석 결과(2023년 항공영상)"}
```
| 필드 | 뜻 |
|---|---|
| `value` | 값. 모르면 `null` + `note`(0 을 지어내지 않습니다) |
| `unit` | `count` `parcel` `m2` `km2` `ha` `ratio` `percent` `s` `bytes` 중 하나 |
| `basis` | `inferred`(AI 추정) · `recorded`(기록·대장) · `measured`(측정·계산) · `estimate`(예상) |
| `as_of` | 기준 시점(날짜 또는 시각) |
| `source` | 사람이 읽는 출처 한 줄 |

같은 이름의 숫자는 Land-XI 화면과 **같은 값**입니다(숫자 한 출처). 화면과 다르면 오류이니 알려 주세요.

### 5-3. 지도 모양 — GeoJSON
- RFC 7946 GeoJSON. 좌표계 **EPSG:4326(경도, 위도)**, 소수점 7자리.
- 국내 GIS 용으로 `?crs=EPSG:5186` 을 붙이면 그 좌표계로 드립니다(이때는 RFC 7946 밖 — 응답 `meta.crs` 에 표시).
- 면적(`area_m2`)은 국내 EPSG:5186 평면, 해외는 타원체(GRS80) 기준으로 계산합니다.
- 결과 한 건(조각·점)의 속성:
```json
{"id": "r_9c1f0a2e7b",
 "class": "비닐하우스", "class_code": "greenhouse",
 "confidence": 0.87, "area_m2": 412.5,
 "pnu": "5219010300100110013", "emd_code": "52190103", "emd_name": "죽항동",
 "captured_on": "2025-05", "analyzed_at": "2026-06-08T14:02:11+09:00",
 "review": "unreviewed", "service_version": "1.2",
 "reference_only": true}
```
`review`: `unreviewed`(결과 확인 전) · `confirmed`(확인됨) · `rejected`(AI 가 잘못 봄으로 확인).

### 5-4. 시간
- ISO 8601 + 시간대(`2026-09-30T18:47:41+09:00`). 서버 기준 시간대는 한국 표준시(+09:00). 해외 기관도 같은 표기(시간대 포함)로 받습니다.
- 날짜만 있으면 `YYYY-MM-DD`, 촬영 월만 알면 `YYYY-MM`.
- `since` 에는 날짜나 시각을 넣습니다 — 그 뒤에 **새로 나오거나 바뀐** 결과만 옵니다(매달 가져가는 시스템용).

### 5-5. 페이지 나누기
- `limit`(1–1000, 기본 100) + `cursor`. 응답의 `meta.next_cursor` 를 다음 요청의 `cursor` 에 넣습니다. `null` 이면 끝.
- 쪽을 넘기는 동안 새 결과가 생겨도 빠지거나 겹치지 않습니다(결과 id 순 커서).
```json
{"type": "FeatureCollection", "features": [ … ],
 "meta": {"total": {"value": 2098, "unit": "count", "basis": "inferred", "as_of": "2026-06-08", "source": "AI 분석 결과(2025년 드론영상)"},
          "next_cursor": "c_eyJpZCI6MTIzNDV9", "crs": "EPSG:4326", "reference_only": true}}
```

---

## 6. 결과 보기(읽기)
| 요청 | 설명 |
|---|---|
| `GET /v1/services` | 이 키로 쓸 수 있는 서비스 × 지역: 이름 · 단계(운영/시범) · 최근 결과 날짜 · 분류 목록 |
| `GET /v1/regions` | 이 키의 관할: 시군구(광역이면 광역 전체 + 시군구) · 읍면동 · 경계(선택 `?geometry=1`) |
| `GET /v1/services/{service}/summary?region=` | 요약 숫자: AI 탐지 · 의심 필지 · 현장 확인 필요 · 결과 확인 대기 |
| `GET /v1/services/{service}/results?region=&bbox=&class=&since=&review=&limit=&cursor=&crs=` | 조각·점 결과(GeoJSON) |
| `GET /v1/services/{service}/parcels?region=&flag=&since=&limit=&cursor=` | 필지별 결과. `flag=check`(확인이 필요한 필지만) · `all` |
| `GET /v1/parcels/{pnu}?service=` | 필지 하나: 지번 · 공부상 지목 · AI 가 본 것 · 확인이 필요한 까닭 · 기준 시점 |
| `GET /v1/services/{service}/tiles.json?region=` | 결과 지도 조각 안내(TileJSON 3.0) — 12시간짜리 서명 주소가 들어 있음 |
| `GET /v1/services/{service}/reports?region=` | 받을 수 있는 보고서 목록(읍면동 단위) |
| `GET /v1/services/{service}/reports/{emd_code}.docx` | 보고서 파일(`.json` 은 같은 내용의 데이터) |
| `GET /v1/usage` | 이번 달 사용량과 한도(요청 · 분석 시간 · 분석 면적 · 저장 · 전송량) |

필지 결과 한 줄 예:
```json
{"pnu": "5219010300100110013", "jibun": "11-13", "jimok": "답",
 "ai": {"seen": [{"class": "건물", "area_m2": {"value": 188.2, "unit": "m2", "basis": "inferred", "as_of": "2026-06-08", "source": "AI 분석 결과(2025년 드론영상)"}}]},
 "check": [{"reason_code": "farmland_building", "reason": "공부상 농지인데 건물이 보입니다", "priority": "A"}],
 "state": "unreviewed", "as_of": "2026-09-24", "reference_only": true}
```

### 지도 조각을 GIS 에 띄우기
1. `GET /v1/services/card-marine/tiles.json?region=12130` → `tiles` 에 `https://api.land-xi.dev/v1/tiles/card-marine/{z}/{x}/{y}.mvt?exp=…&sig=…` 가 옵니다.
2. 이 주소를 QGIS(벡터 타일 연결) · OpenLayers · MapLibre 에 넣습니다. 서명 주소에는 키가 없습니다 — 브라우저 지도에도 안전하게 넣을 수 있습니다.
3. 12시간마다 `tiles.json` 을 다시 받아 주소를 바꿉니다. 지난 서명은 `403`.

---

## 7. 분석 맡기기(비동기 작업)

```
영상 올리기(선택) → 견적 → 등록(202) → 상태 조회 또는 알림 → 결과
```

### 7-1. 영상 올리기 — 조각으로, 끊겨도 이어서
| 요청 | 설명 |
|---|---|
| `POST /v1/uploads` `{filename, size, sha256?}` | 올리기 시작 → `upload_id` · `chunk_size`(8MB) · `received`(이어 올릴 자리) |
| `PUT /v1/uploads/{id}?offset=N` | 본문 = N 바이트부터 한 조각. 자리가 어긋나면 `409` + 받은 바이트 |
| `GET /v1/uploads/{id}` | 받은 바이트(끊긴 뒤 이어 올릴 자리) |
| `POST /v1/uploads/{id}/finish` | 다 받았으면 파일에서 읽기 → 촬영일 · 해상도 · 범위 · 좌표계 · 관할 안인지 |

- 받는 파일: 위치 정보가 든 GeoTIFF(COG 권장). 해상도·촬영일·범위·좌표계는 **파일에서 읽습니다** — 따로 적지 않습니다. 촬영일이 파일에 없으면 `captured_on` 을 한 줄로 알려 달라고 답합니다.
- 범위가 관할 밖으로 나가면 `400 outside_scope`. 한 파일 20GB 까지. 올린 영상은 90일 보관(결과는 남습니다).

### 7-2. 견적 — 분석 기계를 쓰지 않습니다
```bash
curl -s https://api.land-xi.dev/v1/analyses/quote \
  -H "Authorization: Bearer $LANDXI_KEY" -H "Content-Type: application/json" \
  -d '{"service": "card-marine", "upload_id": "up_01J9ZQ4M2B"}'
```
```json
{"allowed": true, "reasons": [],
 "area": {"value": 3.42, "unit": "km2", "basis": "measured", "as_of": "2026-09-30T19:02:00+09:00", "source": "올린 영상 범위 ∩ 관할"},
 "compute": {"value": 210, "unit": "s", "basis": "estimate", "as_of": "…", "source": "이 서비스의 처리 속도 기록"},
 "queue_ahead": 2,
 "quota_left": {"value": 18658, "unit": "s", "basis": "measured", "as_of": "…", "source": "이번 달 기관 분석 시간 한도 − 사용"}}
```
범위를 주는 방법은 셋 중 하나입니다: `upload_id`(올린 영상) · `region`(읍면동·시군구 — 이미 있는 영상으로) · `aoi`(GeoJSON Polygon — 이미 있는 영상으로).

### 7-3. 등록
```bash
curl -s https://api.land-xi.dev/v1/analyses \
  -H "Authorization: Bearer $LANDXI_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 2026-10-marine-yeosu-001" \
  -d '{"service": "card-marine", "upload_id": "up_01J9ZQ4M2B",
       "callback_url": "https://hook.example.org/landxi", "label": "10월 1차 해안 촬영"}'
```
`202 Accepted`:
```json
{"id": "an_01J9ZR0C7K", "state": "queued", "queue_ahead": 2,
 "status_url": "https://api.land-xi.dev/v1/analyses/an_01J9ZR0C7K"}
```
- `Idempotency-Key`: 같은 열쇠로 다시 보내면 **같은 작업**을 돌려줍니다(네트워크가 끊겨 다시 보내도 두 번 분석하지 않음). 같은 열쇠에 다른 내용이면 `409 conflict`. 24시간 유지.
- 등록은 **등록된 서비스 카드**로만, 그 서비스가 그 지역에 공개돼 있을 때만 됩니다.

### 7-4. 상태 → 결과
| 요청 | 설명 |
|---|---|
| `GET /v1/analyses/{id}` | `queued` → `running`(`progress` 0–1) → `done` · `failed` · `cancelled` |
| `GET /v1/analyses?state=&since=&limit=&cursor=` | 이 기관이 맡긴 분석 목록 |
| `GET /v1/analyses/{id}/results?limit=&cursor=&crs=` | 결과(GeoJSON, 6절과 같은 모양) — `done` 뒤에만 |
| `GET /v1/analyses/{id}/summary` | 요약 숫자 |
| `POST /v1/analyses/{id}/cancel` | 취소(대기·분석 중일 때) |

- 상태를 물을 때는 **30초에 한 번 이하**로. 알림(웹훅)을 쓰면 묻지 않아도 됩니다.
- 약속하는 시간: 등록 뒤 **24시간 안**(보통 몇십 분). 화면에서 기다리는 사용자의 분석이 먼저 돕니다.

### 7-5. 알림(웹훅)
분석이 끝나거나(또는 실패) 서비스에 새 결과가 공개되면 키에 적어 둔 주소로 `POST` 를 보냅니다.
```json
{"id": "ev_01J9ZT3P8Q", "type": "analysis.done", "created_at": "2026-09-30T19:41:05+09:00",
 "data": {"analysis_id": "an_01J9ZR0C7K", "service": "card-marine", "state": "done",
          "results_url": "https://api.land-xi.dev/v1/analyses/an_01J9ZR0C7K/results"}}
```
| 종류 | 언제 |
|---|---|
| `analysis.done` · `analysis.failed` | 맡긴 분석이 끝났을 때 |
| `results.updated` | 이 키의 서비스 × 지역에 새 결과가 공개됐을 때(매달 가져가는 시스템용) |

- 머리글: `X-LX-Event`(종류) · `X-LX-Delivery`(보낸 번호) · `X-LX-Signature: t=<유닉스초>,v1=<서명>`.
- 서명 확인: `서명 = HMAC-SHA256(알림 비밀, "<t>.<본문 그대로>")` 의 16진수. 5분보다 오래된 `t` 는 버리세요.
- 받는 쪽은 **10초 안에 2xx** 로 답하고 일은 나중에 하세요. 못 받으면 1분 · 5분 · 30분 · 2시간 · 6시간 · 24시간 뒤 다시 보냅니다(6번). 같은 `id` 가 두 번 올 수 있으니 한 번만 처리하세요.
- 알림에는 결과가 들어 있지 않습니다 — 주소를 받아 결과를 가져가세요.

### 7-6. AI 가 잘못 봤어요(메모 한 줄)
```bash
curl -s https://api.land-xi.dev/v1/feedback -H "Authorization: Bearer $LANDXI_KEY" \
  -H "Content-Type: application/json" -d '{"result_id": "r_9c1f0a2e7b", "memo": "비닐하우스가 아니라 창고 지붕"}'
```
메모는 200자까지. 정리와 재학습 판단은 LX 가 합니다.

---

## 8. 오류
모양은 하나입니다.
```json
{"error": {"code": "outside_scope", "message": "관할 밖 범위가 들어 있습니다", "detail": {"outside_ratio": 0.18}},
 "request_id": "req_4f1a9c0b2d7e6a51"}
```
| HTTP | `code` | 뜻 · 할 일 |
|---|---|---|
| 400 | `invalid_request` | 형식 오류 — `detail.errors` 를 보고 고치기 |
| 400 | `outside_scope` | 범위가 관할을 벗어남 — `GET /v1/regions` 의 경계 안으로 |
| 400 | `area_too_large` | 한 번에 맡길 넓이 초과 — 범위를 나눠서 |
| 401 | `unauthorized` | 키 없음 · 틀림 · 끝남 · 폐기됨 |
| 403 | `permission_denied` | 키에 그 권한(예: `analyses:write`)이 없음 · 허용 IP 밖 |
| 403 | `signature_expired` | 지도 조각 서명이 지남 — `tiles.json` 다시 받기 |
| 404 | `not_found` | 없음. **관할 밖·다른 기관의 것도 404** — 있는지조차 알리지 않습니다 |
| 409 | `conflict` | 같은 중복 방지 열쇠에 다른 내용 · 올리기 자리 어긋남 |
| 409 | `no_imagery` | 그 범위를 덮는 영상이 없음 — 영상을 올려서 맡기기 |
| 409 | `service_not_ready` | 그 서비스가 그 지역에 공개되지 않음 |
| 422 | `imagery_unreadable` | 위치 정보를 읽을 수 없는 파일 |
| 429 | `rate_limited` | 잠깐 너무 많이 — `Retry-After` 초 뒤 다시 |
| 429 | `quota_exceeded` | 이번 달 기관 한도 초과 — `detail.resets_at` 이후 또는 한도 조정 요청 |
| 500 | `server_error` | 우리 쪽 문제 — `request_id` 와 함께 알려 주세요 |
| 503 | `unavailable` | 점검·재기동 중 — `Retry-After` 뒤 다시 |

분석이 실패하면 HTTP 오류가 아니라 작업 `state: "failed"` + `error.code`(`imagery_unreadable` · `no_imagery` · `cancelled_by_operator` · `server_error`)로 알립니다.

---

## 9. 한도
- 한도는 **기관 한도와 같은 장부**입니다 — 화면에서 쓴 분석 시간과 API 로 맡긴 분석 시간이 합쳐집니다. `GET /v1/usage` 로 언제든 확인하세요.
- 초기값(기관별로 바뀔 수 있음): 키당 1분 60회 · 기관당 하루 20,000회 · 지도 조각 키당 1분 1,200장 · 한 번에 1,000행 · 분석 한 번 항공·위성 150㎢ / 드론 5㎢ · 기관당 하루 분석 등록 10건 · 영상 파일 하나 20GB.
- 잠깐 넘으면 `429 rate_limited` + `Retry-After`. 이번 달 한도를 넘으면 `429 quota_exceeded`(분석은 순서가 뒤로 밀리거나 거절 — 기관 한도 정책을 따름).

## 10. 범위 가드 — 관할 밖은 없다
- 모든 요청은 키의 기관 관할(과 키에 적은 서비스·지역) 안에서만 답합니다. 광역 기관은 광역 전체와 시군구 둘 다.
- 읽기에서 관할 밖을 가리키면 `404 not_found` — 있다는 사실도 알리지 않습니다.
- 분석 범위가 관할을 **조금이라도** 벗어나면 `400 outside_scope`(잘라서 분석하지 않습니다 — 무엇이 분석됐는지 헷갈리지 않게).
- 해외 기관은 배포 범위(사업 구역) 안에서만.

## 11. 기록(감사)
- 모든 요청을 1년 보관합니다: 시각 · 키 앞자리 · 기관 · 요청 종류 · 지역 · 결과 코드 · 크기 · 보낸 주소.
- 기관 관리자는 자기 기관 기록을 내려받을 수 있고, LX 관리자는 전부 봅니다.
- 키 만들기·폐기·한도 바꾸기·분석 등록·취소는 누가 했는지 따로 남습니다.

## 12. 버전과 폐기 정책
- 같은 `v1` 안에서는 **더하기만** 합니다(필드·요청·오류 코드 추가). 이름을 바꾸거나 빼는 변경은 `v2` 로.
- `v2` 가 나와도 `v1` 은 **최소 12개월** 유지합니다. 폐기가 정해지면 응답 머리글 `Deprecation` · `Sunset`(끝나는 날)과 기관 담당자 안내로 알립니다.
- 바뀐 점은 안내 페이지의 '바뀐 점' 목록에 날짜와 함께 적습니다.

## 13. 예제 — Python
```python
import hashlib, hmac, os, time
import requests

BASE = "https://api.land-xi.dev/v1"
S = requests.Session()
S.headers["Authorization"] = f"Bearer {os.environ['LANDXI_KEY']}"

def results_since(service: str, region: str, since: str):
    """지난번 이후 새로 나오거나 바뀐 결과를 끝까지 받는다(매달 가져가기)."""
    cursor = None
    while True:
        r = S.get(f"{BASE}/services/{service}/results",
                  params={"region": region, "since": since, "limit": 1000, "cursor": cursor}, timeout=60)
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", "5"))); continue
        r.raise_for_status()
        body = r.json()
        yield from body["features"]
        cursor = body["meta"]["next_cursor"]
        if not cursor:
            break

def submit(service: str, upload_id: str, key: str) -> dict:
    """분석 맡기기 — 같은 key 로 다시 보내도 작업은 하나."""
    q = S.post(f"{BASE}/analyses/quote", json={"service": service, "upload_id": upload_id}, timeout=60).json()
    if not q["allowed"]:
        raise RuntimeError(q["reasons"])
    r = S.post(f"{BASE}/analyses", json={"service": service, "upload_id": upload_id},
               headers={"Idempotency-Key": key}, timeout=60)
    r.raise_for_status()
    return r.json()

def verify_hook(secret: bytes, header: str, raw_body: bytes) -> bool:
    """알림 서명 확인 — X-LX-Signature: t=…,v1=…"""
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    mac = hmac.new(secret, parts["t"].encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, parts["v1"])

for f in results_since("card-farm", "52190", "2026-09-01"):
    print(f["properties"]["pnu"], f["properties"]["class"], f["properties"]["review"])
```

## 14. 예제 — curl 로 영상 올려 분석 맡기기
```bash
KEY=$LANDXI_KEY; F=coast_2026-10-02.tif; SIZE=$(stat -c %s "$F")
UP=$(curl -s https://api.land-xi.dev/v1/uploads -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d "{\"filename\":\"$F\",\"size\":$SIZE}" | jq -r .upload_id)
# 8MB 씩 올리기(끊기면 GET /v1/uploads/$UP 의 received 부터 다시)
OFF=0; while [ $OFF -lt $SIZE ]; do
  dd if="$F" bs=8M skip=$((OFF/8388608)) count=1 status=none | \
  curl -s -X PUT "https://api.land-xi.dev/v1/uploads/$UP?offset=$OFF" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/octet-stream" --data-binary @- > /dev/null
  OFF=$((OFF+8388608)); done
curl -s -X POST "https://api.land-xi.dev/v1/uploads/$UP/finish" -H "Authorization: Bearer $KEY"
curl -s https://api.land-xi.dev/v1/analyses -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Idempotency-Key: coast-2026-10-02" \
  -d "{\"service\":\"card-marine\",\"upload_id\":\"$UP\"}"
```

## 15. 문의
`X-Request-Id` 와 요청 시각을 함께 기관 담당자를 거쳐 LX 에 알려 주세요.

---
*이 초안의 예시 값 가운데 서비스 이름과 AI 탐지 수(1,857 · 2,098)·기준 시점만 지금 서버의 실제 값입니다. 필지 번호·지번·면적·신뢰도·결과 id·작업 id·올리기 id·견적 값은 모양을 보이기 위한 자리 값입니다.*
