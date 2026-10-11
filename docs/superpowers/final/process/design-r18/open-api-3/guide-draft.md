# Land-XI API 표준 가이드 (초안)

> 초안 · 2026-10-11 · 사용자 확인 전. 확인되면 사이트 'API 안내' 페이지의 본문이 됩니다. 아래 한도 숫자는 **처음 값 제안**이며 LX 관리자가 키마다 바꿉니다.
> 이 안내는 Land-XI 분석 서비스를 다른 시스템에서 부르려는 개발자를 위한 것입니다.

## 1. 무엇을 할 수 있나
Land-XI의 **분석 서비스**(예: 건축물 · 경작 · 휴경 · 주차장) 하나하나가 API를 가집니다. 서비스마다 두 가지를 합니다.

| | 결과 조회 | 분석 호출 |
|---|---|---|
| 무엇 | 이미 만든 AI 분석 결과를 받습니다(지난 결과 포함) | 범위와 영상 원천을 정해 분석을 맡깁니다 |
| 응답 | 바로(쪽 나눠 받기) | 작업 번호 → 상태 → 결과(끝나면 알림) |

**API로 하지 않는 것:** 영상 올리기 · 영상 내려받기 · 학습 · 모델 바꾸기 · 키에 없는 서비스나 범위 밖 결과 · 개인정보.
**AI 결과는 참고자료입니다.** 처분 · 행정 결정은 사람이 확인한 뒤 합니다. 결과마다 '결과 확인' 상태(확인 전 · 확인됨 · 고침)가 붙습니다.

## 2. 시작하기
1. 사이트 'API 안내'에서 **키 신청** — 신청 구분(LX 내부 시스템 · LX 다른 서비스 · 외부 기관 시스템), 쓰는 시스템, 서비스, 권한(결과 조회 / 결과 조회 + 분석 호출), 범위, 목적.
2. **LX 관리자 승인** — 서비스마다 키가 하나씩 나옵니다. 키 값은 한 번만 전해 드립니다. 잃어버리면 폐기하고 새로 받습니다.
3. **확인 호출** — `GET /v1/me` 가 200이면 준비 끝.

## 3. 인증
- 모든 요청 머리글: `Authorization: Bearer lxk_…`
- 키는 **서버에만** 두세요. 웹 화면 코드 · 앱 · 저장소에 넣지 마세요.
- 키에는 범위(지역) · 권한 · 영상 원천 · 한도 · 끝나는 날 · (선택) 허용 서버 주소가 정해져 있습니다. `GET /v1/me` 로 확인합니다.
- Land-XI 화면 로그인으로는 API를 부를 수 없고, 키로는 화면을 쓸 수 없습니다.

## 4. 주소 체계
기본 주소: `https://api.land-xi.dev/v1`

| 메서드 · 주소 | 하는 일 |
|---|---|
| `GET /me` | 키 확인 — 신청 시스템 · 서비스 · 권한 · 범위 · 원천 · 한도와 남은 양 · 끝나는 날 |
| `GET /services` | 이 키로 쓸 수 있는 서비스 목록 |
| `GET /services/{서비스}` | 서비스 설명 — 찾는 대상(종류) · 서비스 판 · AI 모델 정확도 · 분석할 수 있는 영상 원천 · 형식 |
| `GET /imagery?region=…` · `?bbox=…` | 그 자리에서 쓸 수 있는 영상 원천과 연도 |
| `GET /services/{서비스}/coverage?region=…` | 결과가 이미 있는 곳 — 지역 × 원천 × 연도 × 분석한 날 × 건수 |
| `GET /services/{서비스}/results` | 결과 조회(GeoJSON 한 쪽 · 최대 1,000개) |
| `POST /services/{서비스}/results/search` | 결과 조회 — 범위를 GeoJSON 도형으로 보낼 때 |
| `GET /services/{서비스}/summary` | 요약 — 종류별 개수 · 넓이 · 읍면동별 |
| `GET /services/{서비스}/exports/{geojson|shp|parcels}` | 파일로 받기 |
| `POST /services/{서비스}/analyses/estimate` | 분석 견적 — 넓이 · 예상 시간 · 남은 한도(분석하지 않음) |
| `POST /services/{서비스}/analyses` | 분석 호출 → 202 + 작업 번호 |
| `GET /services/{서비스}/analyses` | 내가 맡긴 분석 목록 |
| `GET /services/{서비스}/analyses/{작업}` | 상태 |
| `GET /services/{서비스}/analyses/{작업}/results` | 그 분석의 결과(결과 조회와 같은 모양) |
| `DELETE /services/{서비스}/analyses/{작업}` | 취소(차례 기다림 · 영상 부르는 중일 때) |
| `GET /usage` | 내 호출 수 · 분석 넓이(오늘 · 이번 달) |

`{서비스}` 는 서비스 영문 이름입니다(예: `building` 건축물 · `farm` 경작 · 휴경 · `parking` 주차장 · `greenhouse` 비닐하우스). `GET /services` 의 `id`.

## 5. 범위 · 영상 원천 · 시점 정하기
**범위(셋 중 하나)**
| 방법 | 쓰는 법 |
|---|---|
| 행정구역 코드 | `region=45190`(시군구 5자리) · `region=4519025000`(읍면동 법정동 코드 10자리) · 쉼표로 여럿 |
| bbox | `bbox=127.38,35.40,127.41,35.42`(서 · 남 · 동 · 북 · 경위도) |
| GeoJSON 도형 | 본문 `{"geometry": {"type":"Polygon", …}}` — Polygon · MultiPolygon · 꼭짓점 10,000개까지 · 경위도 |
범위는 키의 범위 안이어야 합니다. 밖이면 '없음'(404)으로 답합니다.

**영상 원천**
| `source` | 무엇 | 시점 | 쓸 수 있는 키 |
|---|---|---|---|
| `ngii-aerial` | 국토지리정보원 항공 정사영상(영상 API) | `year` 2011–2025(2020년부터 약 25cm · 그 전 약 50cm) | 승인된 모든 키 |
| `vworld` | 브이월드 영상(가장 최근 항공영상) | 최신(연도 표시 없음 — 결과에는 '최신 · 불러온 날') | 승인된 모든 키 |
| `lx` | LX 보유 영상 | 등록된 시점(`id`) | LX 내부 시스템 키 |
서비스마다 분석할 수 있는 원천이 다릅니다(`GET /services/{서비스}` 의 `sources`). 맞지 않는 조합은 `422 unfit_source`.
보안 지역 등 영상이 가려진 곳 · 그 해 영상이 없는 곳은 결과가 비고, 응답의 `gaps` 에 적힙니다.

## 6. 결과 조회
```
GET /v1/services/building/results?region=45190&source=ngii-aerial&year=2025&limit=1000
```
| 매개변수 | 뜻 |
|---|---|
| `region` · `bbox` | 범위(없으면 키 범위 전체 — 큰 범위는 파일로 받기 권장) |
| `source` · `year` | 원천 · 연도(없으면 곳마다 가장 최근) |
| `kind` | 종류 거르기(서비스 설명의 종류 코드) |
| `since` | 이 시각 뒤에 새로 생기거나 바뀐 것만(ISO 8601) |
| `cursor` · `limit` | 다음 쪽 열쇠 · 한 쪽 개수(최대 1,000) |
| `crs` | `4326`(기본 · 경위도) · `5186` · `5179` |

응답(GeoJSON FeatureCollection):
```json
{
  "type": "FeatureCollection",
  "lx": {
    "service": {"id": "building", "name": "건축물", "version": "2.0"},
    "area": {"region": ["45190"]},
    "imagery": [{"source": "ngii-aerial", "year": 2025, "gsd_m": 0.25, "attribution": "국토지리정보원 2025 항공 정사영상"}],
    "total": 2310, "count": 1000, "next": "eyJ…", "crs": "EPSG:4326",
    "gaps": [], "notice": "AI 분석 결과는 참고자료입니다."
  },
  "features": [{
    "type": "Feature", "id": "…",
    "geometry": {"type": "Polygon", "coordinates": [[…]]},
    "properties": {
      "kind": "건물", "code": "building", "score": 0.912, "area_m2": 132.4,
      "emd": "도통동", "emd_cd": "4519010100", "parcel": "4519010100100120000",
      "check": "확인 전", "source": "ngii-aerial", "year": 2025,
      "service_version": "2.0", "analyzed_at": "2026-10-20T03:12:00+09:00"
    }
  }]
}
```
- `score` 는 AI 점수(0–1)이며 확률이 아닙니다. `area_m2` 는 ㎡. `parcel` 은 연속지적 필지 번호 19자리(글자) — 필지와 잇지 않은 서비스는 비어 있습니다.
- `id` 는 바뀌지 않습니다. 다시 분석해 바뀐 결과는 `since` 로 받습니다.
- **출처 표시:** 결과를 화면 · 문서에 쓸 때 `imagery[].attribution` 을 함께 적어 주세요(공공누리 제1유형).

## 7. 분석 호출(비동기)
```
POST /v1/services/building/analyses
Idempotency-Key: 6c1f0e8a-…            (같은 열쇠로 다시 보내면 같은 작업 — 24시간)
Content-Type: application/json

{
  "area":    {"bbox": [127.38, 35.40, 127.41, 35.42]},
  "imagery": {"source": "ngii-aerial", "year": 2025},
  "reuse":   true,
  "callback_url": "https://my-system.example/landxi/hook",
  "client_ref":   "내 시스템의 요청 번호(선택)"
}
```
- `area` 는 `{"region": "4519025000"}` · `{"bbox": […]}` · `{"geometry": {…}}` 중 하나.
- `reuse: true`(기본) — 같은 서비스 · 같은 자리 · 같은 원천 · 연도 · 서비스 판의 결과가 이미 있으면 다시 돌리지 않고 그 결과를 줍니다(빠르고 한도를 쓰지 않음).
- 한 번에 넓이 한도(처음 값 25㎢)를 넘으면 `413 area_too_large` + 나누는 방법(읍면동 목록). 먼저 `analyses/estimate` 로 넓이 · 예상 시간을 보세요.

응답 `202`:
```json
{"id": "an_01JA…", "status": "queued",
 "estimate": {"area_km2": 8.4, "cells": 1260, "minutes": 9, "reused_share": 0.0},
 "links": {"self": "/v1/services/building/analyses/an_01JA…", "results": "/v1/services/building/analyses/an_01JA…/results"}}
```
예상 시간은 대부분 영상을 부르는 시간입니다(1㎢에 약 1분). 화면에서 사람이 누른 분석이 먼저 돌고, API 분석은 차례를 기다립니다.

## 8. 상태
| `status` | 뜻 | 다음 |
|---|---|---|
| `held` | 한도를 넘어 LX 관리자 확인을 기다림 | `queued` 또는 `rejected` |
| `queued` | 차례 기다림 | `fetching` |
| `fetching` | 영상 부르는 중 | `analyzing` |
| `analyzing` | AI 분석 중(`progress` = 끝난 칸 / 전체 칸) | `done` · `failed` |
| `done` | 끝 — 결과를 받으세요 | — |
| `failed` | 실패(`reason` 사람 말 한 줄) | 다시 호출 |
| `cancelled` · `rejected` | 취소 · 반려(`reason`) | — |
상태 묻기는 30초에 한 번이면 충분합니다. 알림 주소를 주면 묻지 않아도 됩니다.

## 9. 알림(웹훅)
- `callback_url` 로 `POST` — 사건: `analysis.done` · `analysis.failed` · `analysis.held` · `analysis.rejected` · (구독 시) `results.new`.
```json
{"event": "analysis.done", "id": "an_01JA…", "service": "building", "status": "done", "at": "2026-10-20T03:20:11+09:00",
 "links": {"results": "/v1/services/building/analyses/an_01JA…/results"}}
```
- 서명 머리글 `LandXI-Signature: t=1760897411,v1=<HMAC-SHA256(알림 비밀, t + "." + 본문)>` — 알림 비밀은 키와 함께 한 번 전해 드립니다. 5분보다 오래된 `t` 는 버리세요.
- 2xx로 답하지 않으면 1분 · 5분 · 30분 · 2시간 · 6시간 · 24시간 뒤 다시 보냅니다. 같은 알림이 두 번 올 수 있으니 `id` + `event` 로 거르세요.

## 10. 공통 형식
- JSON · UTF-8. 시각은 ISO 8601(한국 시각 `+09:00`). 좌표는 경위도(EPSG:4326) 기본.
- 모든 응답 머리글에 `X-Request-Id` — 문의할 때 알려 주세요.
- 오류 모양:
```json
{"error": {"code": "area_too_large", "message": "한 번에 25㎢까지 분석합니다. 읍면동으로 나눠 보내 주세요.", "detail": {"area_km2": 61.2, "split": ["4519025000", "4519031000"]}, "request_id": "req_…"}}
```

## 11. 오류
| HTTP | `code` | 뜻 |
|---|---|---|
| 400 | `bad_request` | 매개변수 · 본문이 맞지 않음 |
| 401 | `unauthorized` · `key_revoked` · `key_expired` | 키 없음 · 틀림 · 폐기 · 기간 끝 |
| 403 | `key_paused` · `forbidden` | LX 관리자가 멈춘 키 · 키 권한 밖(예: 조회 키로 분석 호출 · 범위에 없는 형식) |
| 404 | `not_found` | 없는 주소 · 서비스 · 작업, **또는 키 범위 밖**(범위 밖은 있다는 사실도 알리지 않음) |
| 409 | `idempotency_conflict` | 같은 열쇠에 다른 본문 |
| 413 | `area_too_large` | 한 번 넓이 한도 초과(나누는 방법 포함) |
| 422 | `no_imagery` · `unfit_source` · `bad_geometry` | 그 자리 · 연도 영상 없음 · 이 서비스에 맞지 않는 원천 · 도형 오류 |
| 429 | `rate_limited` · `area_quota` | 호출 한도 · 분석 넓이 한도(`Retry-After` 머리글) |
| 503 | `busy` | 잠시 받을 수 없음(점검 · 전력 보호) — `Retry-After` 뒤 다시 |

## 12. 한도(처음 값 제안 · 키마다 다름)
| 한도 | 처음 값 |
|---|---|
| 호출 | 1분 60회 · 하루 20,000회 |
| 분석 넓이 | 한 번 25㎢ · 하루 100㎢ · 한 달 1,000㎢ |
| 동시 분석 | 키마다 1건(나머지는 차례 기다림) |
| 결과 한 쪽 | 1,000개 |
남은 양은 `GET /v1/me` · `GET /v1/usage`. 넘으면 429와 다시 해도 되는 때를 알려 드립니다. 넓이 한도를 넘는 분석은 `held` 로 LX 관리자에게 갑니다(설정에 따라).

## 13. 기록
- 모든 호출이 기록됩니다(시각 · 키 끝 네 자리 · 무엇을 · 몇 건 · 크기 · 결과 · 접속 주소). 1년 보관합니다.
- 맡긴 분석의 범위 도형과 요청 기록은 부른 쪽과 LX 관리자만 봅니다.

## 14. 버전
- 주소의 `/v1` 안에서는 **더하기만** 합니다(새 필드 · 새 주소). 모르는 필드는 무시하도록 만들어 주세요.
- 바꾸거나 빼야 할 때는 `/v2` 를 열고 `/v1` 을 12개월 더 둡니다. 끝날 주소에는 `Deprecation` · `Sunset` 머리글이 붙습니다.
- 서비스(AI 모델) 판이 바뀌면 결과의 `service_version` 이 바뀝니다. 지난 판 결과는 지난 시점 결과로 남습니다.

## 15. 예제
### curl
```bash
# 키 확인
curl -H "Authorization: Bearer $LANDXI_KEY" https://api.land-xi.dev/v1/me

# 그 자리에서 쓸 수 있는 영상
curl -H "Authorization: Bearer $LANDXI_KEY" "https://api.land-xi.dev/v1/imagery?bbox=127.38,35.40,127.41,35.42"

# 결과 조회(남원시 · 2025 항공)
curl -H "Authorization: Bearer $LANDXI_KEY" \
  "https://api.land-xi.dev/v1/services/building/results?region=45190&source=ngii-aerial&year=2025"

# 분석 호출
curl -X POST https://api.land-xi.dev/v1/services/building/analyses \
  -H "Authorization: Bearer $LANDXI_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"area":{"bbox":[127.38,35.40,127.41,35.42]},"imagery":{"source":"ngii-aerial","year":2025}}'
```

### Python
```python
import os, time, uuid, requests

BASE = "https://api.land-xi.dev/v1"
S = requests.Session()
S.headers["Authorization"] = "Bearer " + os.environ["LANDXI_KEY"]

def results(service, path="results", **params):
    """결과를 끝까지 받기(쪽 나눠 받기). path = "results" 또는 "analyses/{작업}/results"."""
    feats, cursor = [], None
    while True:
        r = S.get(f"{BASE}/services/{service}/{path}", params={**params, "cursor": cursor} if cursor else params, timeout=60)
        r.raise_for_status()
        page = r.json()
        feats += page["features"]
        cursor = page["lx"]["next"]
        if not cursor:
            return feats

def analyze(service, area, imagery):
    """분석 호출 → 끝날 때까지 기다림 → 결과."""
    r = S.post(f"{BASE}/services/{service}/analyses",
               json={"area": area, "imagery": imagery},
               headers={"Idempotency-Key": str(uuid.uuid4())}, timeout=60)
    if r.status_code == 413:
        raise SystemExit(r.json()["error"]["message"])     # 나눠 보내기
    r.raise_for_status()
    job = r.json()
    while job["status"] not in ("done", "failed", "cancelled", "rejected"):
        time.sleep(30)
        job = S.get(BASE + job["links"]["self"].removeprefix("/v1"), timeout=30).json()
    if job["status"] != "done":
        raise SystemExit(job.get("reason"))
    return results(service, path=f"analyses/{job['id']}/results")

feats = results("building", region="45190", source="ngii-aerial", year=2025)
print(len(feats), "건")
```

### 알림 서명 확인(Python)
```python
import hmac, hashlib, time
def verify(secret: bytes, header: str, body: bytes) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    want = hmac.new(secret, f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, parts["v1"])
```

## 16. 문의
키 신청과 같은 창(사이트 'API 안내')에서 받습니다. 문의할 때 `X-Request-Id` 를 함께 알려 주세요.
