# kie.ai 테스트 leg — 남원 금지면 비닐하우스 (미니어처 다이어라마)

> 2026-08-26 · 브랜치 `plan1-foundation` · 러너 `tools/kie/leg-namwon-greenhouse.mjs`

10 leg 짜리 디오라마 필름을 전부 돌리기 전에, **leg 1개를 끝까지(스틸 → 5초 비디오 →
스크럽 인코딩 → 프레임 검수) 관통**시켜서 (1) 룩이 버티는지 (2) 크레딧이 실제로 얼마나
드는지 (3) 첫/끝 프레임을 leg 이음새(seam)로 쓸 수 있는지를 실측한 기록.

앵커는 로컬 실자산이다: `landxi/assets/proto/crops/namwon-greenhouse-2025/6-clean.jpg`
— 127.303756E / 35.352504N, 정사영상 `namwon_city_2510` (GSD 0.6 m), 탐지 conf 0.9139,
비닐하우스_단동 5,481.8 ㎡. 탐지 폴리곤이 구워진 `@2x` 대신 clean 판을 쓴다
(파란 선이 다이어라마에 그대로 새어들기 때문).

---

## 1. 파이프라인 실측

| 단계 | 모델 | 산출물 | 크레딧 | 소요 |
|---|---|---|---|---|
| 스틸 | `seedream/5-pro-image-to-image` | `gen/namwon-greenhouse-test.png` (2736×1520) | (이전 세션) | — |
| head 준비 | ffmpeg | `gen/namwon-greenhouse-test.head.jpg` (1920px, q2) | 0 | <1 s |
| 비디오 | `kling/v2-1-pro` 5 s i2v | `gen/namwon-greenhouse-test.mp4` | **50** | 생성 ~70 s / 벽시계 **626.8 s** |
| 스크럽 | ffmpeg | `gen/namwon-greenhouse-test.scrub.mp4` (1280×720) | 0 | ~6 s |

크레딧: **66 → 16** (Δ 50 — 스토리보드 §9 추정치와 **정확히 일치**)

### 실측으로 얻은 두 가지 함정

1. **seedream PNG 를 그대로 kling 에 먹이면 죽는다.** 2736×1520 / 6.7 MB PNG 는
   `createTask` 는 통과하고 곧바로 `internal error, please try again later` 로 실패한다.
   1920px / JPEG q2 로 줄이면 통과. `makeHead()` 가 이걸 자동으로 한다.
2. **`failCode 500` + `creditsConsumed 0` 은 무과금 일시 장애다.** 큐에 들어가기도 전에
   죽은 서버측 오류라 재시도가 안전하다. 클라이언트가 이 조건에서만 최대 12회,
   15 s → 90 s 백오프로 재시도한다 (커밋 `5a92020`). 이번 런에서도 **8회 연속 500 후 9번째에 통과**했다. 그동안 잔액은 66에서 1도 움직이지 않았다(런 중 별도 확인). 즉 500은 돈이 아니라 **시간**을 먹는다 — 이번 건 벽시계 626.8 s 중 약 9분이 백오프 대기였고, 실제 생성은 ~70 s였다.

---

## 2. 프롬프트

프리앰블(ORRERY)은 스틸·비디오 양쪽 맨 위에 **토씨 하나 안 바꾸고** 붙는다.
이게 leg 간 룩 일관성을 잡아주는 유일한 장치다.

```
Handmade physical scale model, macro tilt-shift, 100mm on a medium-format body. Milled brass, painted plaster, real moss, poured resin, sifted sand, fibre-optic practicals, with visible glue seams and dust on the baseboard. One large soft overhead studio source with a huge white bounce, near-shadowless, a single soft contact shadow under the model. Low-saturation colour grade of warm white, pale neutral and dusty green, with one cobalt-blue accent and nothing else saturated. Medium-format sharpness, fine grain, real depth-of-field falloff at the edges of the board. Photographic realism. NOT a 3D render, NOT clay, NOT illustration, NOT CGI, no digital glow, no plastic sheen, no toy-town cuteness, no isometric game look.
```

씬(스틸 전용):

```
Handmade architectural model diorama of a Korean rural plain in Namwon: rows of tiny arched white vinyl greenhouses running in parallel across the board, rice paddies, a small river, low hills behind; overhead-oblique view looking down at about 55 degrees; white paper sky; soft studio light; muted palette with a single cobalt-blue accent; the model sits on a seamless bone-white paper ground and the upper third of the frame is empty white; no text, no people, no road labels.
```

모션(비디오 전용):

```
The camera descends slowly and steadily toward the rows of white greenhouses, one smooth continuous dolly-down with a very slight forward drift. Soft cloud shadows drift across the paddies from left to right. The low hills behind shift with a gentle parallax against the plain as the camera lowers. The greenhouse rows stay in frame from the first frame to the last; nothing enters and nothing leaves. One single continuous take, no cuts, no camera shake, no zoom snap. Slow, controlled, no text.
```

네거티브(클라이언트 기본값):
`blur, distortion, low quality, warping, morphing, jitter, flicker, text, watermark,
subtitles, cut, scene change, people, vehicles` · `cfg_scale 0.5`

---

## 3. 검수

검수 프레임 6장: `shots/kie/namwon-greenhouse-test-00..05.jpg` (t = 0 / 1.01 / 2.02 / 3.03 / 4.03 / 5.00).
스크럽 판은 `gen/namwon-greenhouse-test.scrub.mp4` (1280×720, 2.3 MB, GOP 8).
원본은 1932×1072 / 24 fps / 121 프레임 / 5.04 s / 9.5 MB.

### ① 미니어처 리얼리즘 — **유지된다. 이게 이번 테스트의 핵심 성과다.**

5초 내내 "실제로 만든 물건"으로 읽힌다. 석고 baseboard의 두께와 잘린 단면, 이끼 언덕,
체로 친 모래 농로, 놋쇠 하우스 골조, 부어 굳힌 레진 수로, 언덕에 박힌 광섬유 점광원까지
스틸의 재질이 프레임마다 그대로 살아 있다. **CGI/클레이/장난감으로 흘러내리지 않았고**,
하우스 열이 morphing 되거나 개수가 바뀌는 현상도 없다. 프리앰블의 네거티브 목록
(NOT a 3D render / no plastic sheen / no toy-town cuteness)이 비디오 단계에서도 먹힌다.

### ② 모션 coherence — **양호. 단, 지시 하나를 오독했다.**

카메라는 요구대로 **한 번의 연속 dolly-down + 미세 전진**을 그린다. 컷 없음, 셰이크 없음,
줌 스냅 없음. 하우스 열은 첫 프레임부터 끝 프레임까지 화면 안에 남는다. 추가한
"언덕 패럴랙스"도 의도대로 나왔다 — 카메라가 낮아지며 뒤 언덕이 하우스 뒤로 가라앉는다.
보드 모서리의 직선도 원근상 일관되게 돈다(기하가 무너지지 않았다).

**결함 1건 — 구름 그림자 지시가 "하늘"로 잘못 해석됐다.**
`Soft cloud shadows drift across the paddies` 를 논에 드리우는 *그림자*가 아니라
배경 백색 호리존에 **실제 파란 하늘과 구름을 그려 넣는 것**으로 처리했다.
씬 스펙의 `white paper sky` / `상단 1/3은 빈 흰색` 규칙 위반이다.

정량화(우상단 1/3 × 1/4 크롭의 평균 채도, `signalstats SATAVG`):

| | 값 |
|---|---|
| 기준선(흰 배경) | ≈ 0.9 |
| 파란 하늘 구간 | **t = 1.67 – 2.62 s** (약 0.95 s, 전체의 19%) |
| 피크 | **3.64 @ t = 2.04 s** |

t = 0 과 t = 5.00 에서는 채도가 기준선으로 돌아와 **첫/끝 프레임은 깨끗하다**.

### ③ 이음새(seam) 사용 가능성 — **가능. 양쪽 다 쓸 수 있다.**

- **첫 프레임(t=0)**: head 스틸과 프레이밍이 거의 일치한다. 앞 leg 의 꼬리를 여기에 물리면 된다.
- **끝 프레임(t=5.00)**: 하늘이 흰색으로 복귀했고 재질이 선명하다. 그대로
  **다음 leg 의 `image_url` head 로 재사용 가능**하다. 다만 1932×1072 PNG 를 그대로 넣지 말고
  §1의 함정 1대로 1920px JPEG 로 줄여서 넣어야 한다.

### 판정

**합격 — 파이프라인을 10 leg 로 확대해도 된다.** 룩·모션·이음새 세 가지 다 통과했다.
구름 하늘 결함은 재생성 없이 프롬프트로 고친다:

1. `Soft cloud shadows drift across the paddies` →
   **`Soft grey shadows slide across the paddy surfaces from left to right, cast from off-frame;
   the background stays seamless matte white.`**
   (`cloud` 라는 단어를 모션 프롬프트에서 빼는 게 요점 — 이 단어가 배경에 하늘을 부른다.)
2. 네거티브에 `sky, clouds, horizon, blue background` 를 추가한다.

이 두 줄이면 50 크레딧짜리 리테이크 1회를 절약한다.

**세 가지 모두 이 커밋에 이미 반영했다** (재생성은 하지 않았다 — 잔액 16으로 불가능하고,
다음 실전 런에서 검증하면 된다):

1. `MOVE` 에서 `cloud` 제거 + `the background stays seamless matte white` 추가 — `leg-namwon-greenhouse.mjs`
2. 기본 네거티브에 `sky, clouds, horizon, blue background` 추가 — `kie.mjs`
3. `video()` 재시도 상한 12 → **24** — `kie.mjs` (이번에 9번째에 통과해 여유가 3회뿐이었다)

나머지 leg 프롬프트(`docs/superpowers/proto/prompts/leg-*.md`)에도 1번과 같은 치환을
실전 런 전에 적용할 것 — 아직 안 했다.

---

## 4. 10 leg 비용 산정

### 이번 런에서 확정된 단가

| | 실측 | 스토리보드 §9 추정 | |
|---|---|---|---|
| 5초 클립 `kling/v2-1-pro` | **50** | 50 | 일치 ✅ |
| 스틸 `seedream/5-pro-i2i` | 14 (직전 세션) | 14 | 일치 ✅ |

**1 leg = 64 크레딧.** 환산 $0.0156/크레딧 가정 시 **≈ $1.00/leg** — 브리프 목표에 정확히 맞는다.

### 재시도가 예산에 미치는 영향: **0**

이번 런의 500 실패 8회는 `creditsConsumed 0` 이었고 잔액은 66에서 미동도 없었다.
따라서 **인프라 재시도는 크레딧 예산에 넣을 필요가 없다.** 예산에 넣어야 하는 건
오직 *미학적 리테이크*(결과가 마음에 안 들어 다시 뽑는 것)뿐이다.
대신 **시간 예산**에 넣어야 한다 — 아래 참조.

### 10 leg 총액 (계획안: 자체 렌더 3 + AI 7)

| 항목 | 수량 | 크레딧 | $ |
|---|---|---|---|
| 앵커 스틸 (a03–a10 + 꼬리 a11) | 9 × 14 | 126 | 1.97 |
| 스틸 미학 리테이크 ×1.6 | +5.4 × 14 | 76 | 1.19 |
| 5초 클립 (leg 03–09) | 7 × 50 | 350 | 5.46 |
| 클립 미학 리테이크 ×1.4 | +2.8 × 50 | 140 | 2.18 |
| 자체 렌더 (leg 01·02·10) | 3 | 0 | 0 |
| **합계** | 10 leg | **692** | **≈ $10.8** |

이번 테스트가 리테이크 배수를 바꿀 근거는 아직 없다(표본 1). 스틸 1/1 채택,
클립 1/1 채택(결함은 프롬프트로 수선 가능). 다만 구름 결함 같은 **지시 오독이
실재한다**는 게 확인됐으므로 클립 ×1.4 는 낙관이 아니라 적정선으로 본다.

### 시간 예산 — 여기가 진짜 리스크다

| | 실측 |
|---|---|
| 순수 생성 시간 | ~70 s / 클립 |
| **벽시계(500 백오프 포함)** | **626.8 s ≈ 10.5 분 / 클립** |
| 500 대기가 차지한 비중 | 약 9분 (86%) |

클립 10회(초판 7 + 리테이크 2.8) × 10.5분 ≈ **1.8 시간**, 스틸까지 더하면 **2.5–3 시간**.
`kling/v2-1-pro` 가 계속 이 상태라면 10 leg 전량 생성은 하루 안에 끝나지만 **한 번에
자동으로 돌려두고 자리를 비울 수 있어야 한다.** 재시도 상한 12는 이번에 9번째에 통과했으므로
**여유가 3회밖에 없다. 실전 배치 전 `retries` 를 24로 올릴 것.**

### ⚠️ 잔액 경보

**현재 잔액 16 크레딧.** 클립 1개(50)도, 스틸 1장(14) 뒤 클립도 불가능하다.
10 leg 계획안 692 크레딧을 돌리려면 **약 680 크레딧(≈ $10.6) 충전이 선행되어야 한다.**
충전 시 스토리보드 §9의 안전장치대로 `landxi-film` 키에 Safe-Spend Limit 을 걸 것.
충전 화면에서 **$↔크레딧 실환산을 확인**해 위 $0.0156/크레딧 가정을 검증할 것.
