# tools/kling — Kling AI API 클라이언트

Node 24, 의존성 없음(`fetch`만). 2026-08-26 공식 문서(<https://kling.ai/document-api>) 기준.

## 인증

신형 **API Key** 방식. 헤더에 그대로 넣으면 된다 — JWT 서명 불필요.

```
Authorization: Bearer api-key-kling-…
Content-Type: application/json
```

구형 **Access Key + Secret Key → JWT(HS256)** 방식은 여전히 유효하지만 **신규 모델은 지원하지 않는다**.
우리 키는 `api-key-kling-…` (57자) 이므로 신형이다. `auth()`가 접두어를 검사한다.

키는 리포 루트 `.env.local` 의 `KLING_API_KEY` 에서 읽는다. **절대 커밋/출력 금지.**
에러 메시지는 `redact()`로 `api-key-<REDACTED>` 처리된다.

## Base URL

| 리전 | Base | 우리 키 |
| --- | --- | --- |
| 국제(싱가포르) | `https://api-singapore.klingai.com` | ✅ 200 |
| 국제(별칭) | `https://api.klingai.com` | ✅ 200 (동일 응답) |
| 중국 | `https://api-beijing.klingai.com` | ❌ 401 `1002 api key not found` |

`KLING_BASE_URL` 환경변수로 재정의 가능. 기본값은 싱가포르.

## 엔드포인트

| 용도 | 메서드 · 경로 |
| --- | --- |
| 리소스팩/잔여량 | `GET /account/costs?start_time=&end_time=` (ms, 둘 다 필수) |
| 이미지 생성 | `POST /v1/images/generations` → `GET /v1/images/generations/{id}` |
| i2v (구형 스키마) | `POST /v1/videos/image2video` → `GET /v1/videos/image2video/{id}` |
| i2v (신형 스키마) | `POST /image-to-video/kling-2.5-turbo` \| `…/kling-2.6` \| `…/kling-3.0` |
| 태스크 조회(신형) | `GET /tasks?task_ids=` 또는 `?external_task_ids=` |
| 태스크 목록(커서) | `POST /tasks` (`start_time`/`end_time`/`cursor`/`limit`/`filters`) |

> ⚠️ `GET /tasks` 의 쿼리 파라미터는 **`task_ids`** 다. 문서 예시에는 `external_task_ids` 만
> 나와 있고 `ids` 는 400 `1201`을 돌려준다 — 실측으로 확인함.

### 두 가지 i2v 스키마

**구형** (`kling-v1` … `kling-v2-1-master`) — 평면 바디:
`model_name`, `image`, `image_tail`, `prompt`, `negative_prompt`, `mode`(`std`/`pro`/`4k`),
`duration`, `aspect_ratio`, `cfg_scale`(v2.x 미지원), `static_mask`/`dynamic_masks`,
`camera_control`, `callback_url`, `external_task_id`.
`image_tail` · `dynamic_masks/static_mask` · `camera_control` 은 **상호 배타적**.

**신형** (`kling-v2-5-turbo`, `kling-v2-6`, `kling-v3` 계열) — 구조화 바디:

```json
{
  "contents": [
    { "type": "prompt",      "text": "…" },
    { "type": "first_frame", "url": "https://… 또는 raw base64" },
    { "type": "last_frame",  "url": "…" }
  ],
  "settings": { "resolution": "1080p", "duration": 5 },
  "options":  { "callback_url": "", "external_task_id": "", "watermark_info": { "enabled": false } }
}
```

- `mode` std/pro 대신 `resolution` `720p`/`1080p`.
- `negative_prompt` 필드 없음 → 이 클라이언트는 프롬프트에 `Avoid: …` 로 병합한다.
- **첫+끝 프레임은 1080p 에서만 동작.** `imageTail` 을 넘기면 자동으로 1080p 로 올린다.
- 끝 프레임 단독(첫 프레임 없이)은 **불가**.

## 사용

```js
import { balance, image, video, poll, waitFor, download } from './tools/kling/kling.mjs';

await balance();                                  // 무과금
const t = await video({                           // 과금
  prompt: '…', negative: '…',
  image: 'https://…/first.png',
  imageTail: 'https://…/last.png',                // 선택 — 있으면 1080p 강제
  model: 'kling-v2-5-turbo', resolution: '1080p', seconds: 5,
});
const done = await waitFor(t);
await download(done.urls[0], 'landxi/assets/proto/film/legs/gen/ch1-leg-01-globe.mp4');
```

CLI 는 **조회 전용**이다 (실수로 크레딧을 태우지 않도록 생성은 노출하지 않음):

```
node tools/kling/kling.mjs balance
node tools/kling/kling.mjs poll <id> [tasks|v1-video|v1-image]
node tools/kling/kling.mjs download <url> <path>
```

## 주의

- 결과 URL은 **생성 30일 후 삭제**된다. 즉시 `download()` 할 것.
- `remaining_quantity` 통계는 최대 **12시간 지연**된다.
- 동시성은 계정 × 모델 × 팩 타입(video/image/try-on)별로 계산되며 모든 API 키가 공유한다.
  조회 API는 동시성을 소모하지 않는다. QPS 제한은 없다.
- `kling-v2-1` / `kling-v2-1-master` / `kling-v1.x` / `kling-v2-0-master` 는 **2026-09-15 폐지**.
  신규 작업은 `kling-v2-5-turbo` 이상을 쓸 것.

자세한 조사 결과: `docs/superpowers/proto/2026-08-26-kling-api-check.md`
