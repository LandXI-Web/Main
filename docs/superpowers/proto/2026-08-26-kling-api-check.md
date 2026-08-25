# Kling AI API 검증 (2026-08-26) — 무과금 확인만 수행

**결론 먼저**: 인증은 **정상 작동**한다. 하지만 이 계정에는 **API 리소스팩이 0개**다.
콘솔에 보이는 66 크레딧은 API Unit 이 아니라 소비자 웹앱(klingai.com) 크레딧이며,
API 는 별도 선불 리소스팩을 쓴다. **지금 상태로 생성 요청을 보내면 `1102`(리소스팩 소진/만료)로 실패한다.**

이번 작업에서 생성 API는 **한 번도 호출하지 않았다.** 조회 엔드포인트만 호출했다.

---

## 1) 인증 방식

우리 키는 `api-key-kling-…` (57자) → **신형 API Key 방식**.

```
Authorization: Bearer api-key-kling-…
Content-Type: application/json
```

- 구형 **Access Key + Secret Key → JWT(HS256, `iss`=AK, `exp`≈+30분, `nbf`≈-5초)** 서명 방식은
  아직 유효하지만 **신규 모델을 지원하지 않는다.** 우리는 서명 로직이 전혀 필요 없다.

## 2) Base URL — 실측

| Base | 결과 |
| --- | --- |
| `https://api-singapore.klingai.com` | **200 SUCCEED** ← 우리 리전 |
| `https://api.klingai.com` | 200 SUCCEED (동일 응답) |
| `https://api-beijing.klingai.com` | 401 `{"code":1002,"message":"api key not found"}` |

키는 국제(싱가포르) 리전에 등록되어 있다. 중국 리전은 사용 불가.

## 3) 실제 HTTP 응답 (키 마스킹)

### 잔액 / 리소스팩 — `GET /account/costs`

```
GET https://api-singapore.klingai.com/account/costs?start_time=1785105307503&end_time=1787697307419
Authorization: Bearer <REDACTED>

HTTP 200
{"code":0,"message":"SUCCEED","data":{"code":0,"msg":"success"}}
```

문서상 정상 응답은 `data.resource_pack_subscribe_infos[]` 배열에 팩 목록
(`resource_pack_name`, `total_quantity`, `remaining_quantity`, `status`: `online`/`expired`/`runOut` …)이 담긴다.
**우리 응답에는 그 키 자체가 없다 → 보유 리소스팩 0개.**

### 인증 음성 대조군 (인증이 실제로 검증되고 있음을 증명)

```
Bearer api-key-kling-BOGUS  → HTTP 401 {"code":1002,"message":"api key not found"}
헤더 없음                    → HTTP 401 {"code":1001,"message":"Authorization is empty"}
```

### 무과금 목록 조회 (모두 200, 계정에 태스크 없음)

```
GET /v1/videos/image2video?pageNum=1&pageSize=5 → 200 {"code":0,"message":"SUCCEED","data":[]}
GET /v1/images/generations?pageNum=1&pageSize=5 → 200 {"code":0,"message":"SUCCEED","data":[]}
GET /v1/videos/text2video?pageNum=1&pageSize=5  → 200 {"code":0,"message":"SUCCEED","data":[]}
GET /tasks?external_task_ids=landxi-probe-none  → 200 {"code":0,"message":"SUCCEED","data":[]}
POST /tasks {start_time,end_time,cursor,limit,filters}
                                                → 200 {"code":0,...,"data":{"count":0,"has_more":false}}
```

문서에 없던 실측 사항 하나: `GET /tasks` 의 ID 파라미터는 **`task_ids`** 다.
`ids` 로 보내면 `400 {"code":1201,"message":"task_ids or external_task_ids is required"}`.

## 4) 엔드포인트

| 용도 | 경로 |
| --- | --- |
| 리소스팩/잔여량 | `GET /account/costs?start_time=&end_time=` (ms, 둘 다 필수) |
| 이미지 생성 | `POST /v1/images/generations` → `GET /v1/images/generations/{id}` |
| i2v 구형 | `POST /v1/videos/image2video` → `GET /v1/videos/image2video/{id}` |
| i2v 신형 | `POST /image-to-video/kling-2.5-turbo` \| `…/kling-2.6` \| `…/kling-3.0` |
| 태스크 조회 | `GET /tasks?task_ids=` / `?external_task_ids=` , `POST /tasks` (커서) |

### i2v 스키마가 두 가지다

**구형** (`kling-v1` … `kling-v2-1-master`) — 평면 바디:
`model_name`, `image`, `image_tail`, `prompt`, `negative_prompt`, `mode`(`std`/`pro`/`4k`),
`duration`, `aspect_ratio`, `cfg_scale`(**kling-v2.x 미지원**), `static_mask`/`dynamic_masks`,
`camera_control`, `callback_url`, `external_task_id`.
`image_tail` · `dynamic_masks/static_mask` · `camera_control` 은 **상호 배타적**.
이미지: `.jpg/.jpeg/.png`, ≤10MB, 최소 300px, 종횡비 1:2.5~2.5:1. Base64는 `data:` 접두어 금지.

**신형** (`kling-v2-5-turbo`, `kling-v2-6`, `kling-v3` 계열) — `contents`/`settings`/`options` 구조:

```json
{
  "contents": [
    { "type": "prompt",      "text": "…" },
    { "type": "first_frame", "url": "…" },
    { "type": "last_frame",  "url": "…" }
  ],
  "settings": { "resolution": "720p|1080p", "duration": 5 },
  "options":  { "callback_url": "", "external_task_id": "", "watermark_info": { "enabled": false } }
}
```

- `mode` std/pro 가 **없어지고** `resolution` 으로 대체됐다.
- `negative_prompt` **별도 필드 없음** → 프롬프트 안에 부정 서술로 넣어야 한다.
- 이미지 ≤50MB, 최소 300px, 종횡비 1:2.5~2.5:1.

## 5) `image_tail`(끝 프레임) 지원 — 씸 품질의 핵심

| 모델 | 첫+끝 프레임 | 조건 |
| --- | --- | --- |
| `kling-v2-1` / `-master` (구형) | ✅ `image_tail` | **2026-09-15 폐지** |
| `kling-v2-5-turbo` | ✅ `last_frame` | **1080p 필수** |
| `kling-v2-6` | ✅ `last_frame` | **1080p 필수** |
| `kling-v3` / `3.0-turbo` / `3.0-omni` | ✅ | Capability Map 기준 |

- **끝 프레임 단독**(첫 프레임 없이)은 신형에서 **불가**. 구형은 `image`/`image_tail` 중 하나만 있어도 된다.
- 즉 우리 필름의 leg 간 씸 전략(“Leg N의 마지막 프레임 = Leg N+1의 첫 프레임”)은
  **첫 프레임만으로도 성립**하고, 더 강하게 잠그고 싶으면 `last_frame` 을 주되 **1080p 로 고정**해야 한다.

## 6) ⚠️ 모델 폐지 공지 (2026-09-15)

프롬프트 팩이 지정한 **Kling 2.1 Pro/Master 는 3주 뒤 폐지된다.**

- 영상: `kling-v1`, `kling-v1-5`, `kling-v1-6`, `kling-v2-0-master`, **`kling-v2-1`**, **`kling-v2-1-master`**
- 이미지: Kling Image 1.0 / 1.5 / 2.0 / 2.0 New
- Virtual Try-On API, 비디오 이펙트 템플릿 119종

→ **10개 leg 전체를 `kling-v2-5-turbo` 로 잡아야 한다.** (2.1 Pro 대비 오히려 싸다: 1080p 0.7 → 0.5 Unit/s)

## 7) 가격표 (1 video Unit = $0.14, 1 image Unit = $0.0035, 정가)

영상 — **초당** 과금:

| 모델 | 720P | 1080P | 4K |
| --- | --- | --- | --- |
| **Kling 2.5 Turbo** | **0.3 U ($0.042)/s** | **0.5 U ($0.07)/s** | — |
| Kling 2.6 (오디오 없음) | 0.3 U ($0.042)/s | 0.5 U ($0.07)/s | — |
| Kling 2.6 (네이티브 오디오) | — | 1.0 U ($0.14)/s | — |
| Kling 2.1 *(폐지 예정)* | 0.4 U ($0.056)/s | 0.7 U ($0.098)/s | — |
| Kling 2.1 Master *(폐지 예정)* | — | 2.0 U ($0.28)/s | — |
| Kling 3.0 (오디오 없음) | 0.6 U ($0.084)/s | 0.8 U ($0.112)/s | 3.0 U ($0.42)/s |
| Kling 3.0 Turbo (오디오) | 0.8 U ($0.112)/s | 1.0 U ($0.14)/s | — |

`std`/`pro` 는 신형에서 해상도로 대체됐으므로 **720p = 구 std, 1080p = 구 pro** 로 읽으면 된다.
5초/10초 구분 없이 **초당 단가 × 초** 다.

이미지:

| 모델 | 해상도 | 가격 |
| --- | --- | --- |
| Kling Image 3.0 / 3.0-omni / O1 | 1K, 2K | 8 U ($0.028) / 장 |
| Kling Image 3.0-omni | 4K | 16 U ($0.056) / 장 |
| Kling Image 2.1 | 1K, 2K | text2img 4 U ($0.014) / img2img 8 U ($0.028) |

**선불 팩 최소 구매 단위**: 영상 5,000 Unit = **$700** (180일, 이월 없음, 동시성 20).
이미지 100,000 Unit = $350 (동시성 9). 영상/이미지 팩은 **별개**다.

## 8) 레이트 리밋 / 동시성

- **QPS 제한 없음.** 제한되는 것은 **동시 실행 태스크 수**다.
- 계정 × 모델 버전 × 팩 타입(video/image/try-on) 별로 독립 계산, 모든 API 키가 쿼터를 공유.
- 영상 태스크 = 1 슬롯. 이미지 태스크 = `n` 값만큼 슬롯.
- **조회 API는 동시성을 소모하지 않는다.**
- 동시성 쿼터 = 활성 팩 중 최댓값. 최소 영상 팩도 동시성 20 → 우리 10-leg 파이프라인엔 충분.
- 초과 시: `429/1303`. 그 외 `429/1302`(레이트), `429/1102`(팩 소진), `400/1301`(콘텐츠 정책).
- 권장: 지수 백오프(초기 지연 ≥1초) + 태스크 큐.

## 9) Leg 1 권장 호출 (`docs/superpowers/proto/prompts/ch1-leg-01-globe.md`) — **실행하지 않음**

프롬프트 팩의 "Kling 2.1 Pro" 지정은 폐지 대상이므로 **2.5 Turbo 1080p** 로 대체 권장.
Leg 1은 끝 프레임을 비워 두므로(Leg 2가 이 끝 프레임을 받음) `last_frame` 없이 간다.

```js
// 1) 스틸 3장 — 24 image Unit ($0.084)
await image({
  model: 'kling-v3',
  prompt: /* 프롬프트 팩 §1 긍정 */,
  negative: /* 프롬프트 팩 §1 네거티브 */,
  ar: '16:9', resolution: '2k', n: 3,
  externalId: 'landxi-ch1-leg01-still',
});
// 참고: ref(참조 이미지)를 쓰면 negative_prompt 가 무시되므로,
//       orbit-0.png 를 참조로 넣을 때는 네거티브를 프롬프트 본문에 녹여야 한다.

// 2) 영상 5초 — 2.5 video Unit ($0.35)
await video({
  model: 'kling-v2-5-turbo',
  resolution: '1080p',
  seconds: 5,
  image: '<선택한 스틸의 공개 URL 또는 raw base64>',
  // imageTail 생략 — Leg 2가 이 마지막 프레임을 이어받는다
  prompt: /* 프롬프트 팩 §2 모션 프롬프트 */,
  negative: /* 프롬프트 팩 §2 네거티브 — 신형 스키마라 프롬프트에 병합된다 */,
  externalId: 'landxi-ch1-leg01-video',
});
```

**예상 비용**

| 항목 | Unit | USD |
| --- | --- | --- |
| 스틸 3장 (Image 3.0, 2K) | 24 image U | $0.084 |
| 영상 5초 (2.5 Turbo, 1080p) | 2.5 video U | $0.35 |
| 영상 재시도 1회 포함 최대 | 5.0 video U | $0.70 |
| **Leg 1 합계 (재시도 포함)** | — | **≈ $0.78** |
| 10개 leg × 5초 × 1080p, 각 2테이크 | 50 video U | **$7.00** |

즉 필름 전체 영상비는 **$7 수준**이다. 문제는 단가가 아니라 **최소 구매 $700**.

## 10) 다음 액션 (판단 필요)

1. **결제 없이는 생성 불가.** 콘솔의 66 크레딧으로는 API 가 돌지 않는다.
   → klingai.com 웹 UI에서 수동 생성하고 결과물을 내려받는 경로가 현실적인 대안.
2. API 로 가려면 영상 $700 + (스틸까지 API로 뽑으려면) 이미지 $350 팩이 필요하다.
   스틸은 이미 쓰고 있는 KIE 경로로 뽑고, 영상만 Kling 으로 가는 편이 낫다.
3. 어느 쪽이든 **모델은 2.1이 아니라 2.5 Turbo** 로 프롬프트 팩을 고쳐야 한다 (9/15 폐지).

---

**출처** (2026-08-26 확인)

- <https://kling.ai/document-api/api/get-started/authentication>
- <https://kling.ai/document-api/api/get-started/error-codes>
- <https://kling.ai/document-api/api/get-started/concurrency-rules>
- <https://kling.ai/document-api/api/assets/account-usage>
- <https://kling.ai/document-api/api/video/2-1/image-to-video> (폐지 예정)
- <https://kling.ai/document-api/api/video/2-5-turbo/image-to-video>
- <https://kling.ai/document-api/api/video/2-6/image-to-video>
- <https://kling.ai/document-api/api/image/3-0-omni>
- <https://kling.ai/document-api/guides/capability-map/video>
- <https://kling.ai/document-api/pricing/base/video>, <https://kling.ai/dev/pricing>
