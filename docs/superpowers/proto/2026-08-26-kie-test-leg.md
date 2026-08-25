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
| 비디오 | `kling/v2-1-pro` 5 s i2v | `gen/namwon-greenhouse-test.mp4` | __VIDEO_CREDITS__ | __VIDEO_TIME__ |
| 스크럽 | ffmpeg | `gen/namwon-greenhouse-test.scrub.mp4` (1280×720) | 0 | __SCRUB_TIME__ |

크레딧: **66 → __CREDITS_AFTER__** (Δ __CREDITS_DELTA__)

### 실측으로 얻은 두 가지 함정

1. **seedream PNG 를 그대로 kling 에 먹이면 죽는다.** 2736×1520 / 6.7 MB PNG 는
   `createTask` 는 통과하고 곧바로 `internal error, please try again later` 로 실패한다.
   1920px / JPEG q2 로 줄이면 통과. `makeHead()` 가 이걸 자동으로 한다.
2. **`failCode 500` + `creditsConsumed 0` 은 무과금 일시 장애다.** 큐에 들어가기도 전에
   죽은 서버측 오류라 재시도가 안전하다. 클라이언트가 이 조건에서만 최대 12회,
   15 s → 90 s 백오프로 재시도한다 (커밋 `5a92020`). 이번 런에서도 __RETRY_NOTE__

---

## 2. 프롬프트

프리앰블(ORRERY)은 스틸·비디오 양쪽 맨 위에 **토씨 하나 안 바꾸고** 붙는다.
이게 leg 간 룩 일관성을 잡아주는 유일한 장치다.

```
__PREAMBLE__
```

모션(비디오 전용):

```
__MOVE__
```

네거티브(클라이언트 기본값):
`blur, distortion, low quality, warping, morphing, jitter, flicker, text, watermark,
subtitles, cut, scene change, people, vehicles` · `cfg_scale 0.5`

---

## 3. 검수

__VERDICT__

---

## 4. 10 leg 비용 산정

__PROJECTION__
