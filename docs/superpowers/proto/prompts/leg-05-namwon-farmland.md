# leg 05 — 농지이용 · 남원 사매면 4시점 AOI

| | |
|---|---|
| 앵커 | `[127.3512, 35.5331]` — 4-epoch AOI bounds `[127.3481, 35.5276, 127.3567, 35.5347]` (약 900 × 800 m) |
| 실측 | **2,098필지** · 경작지 1,291 / 비경작지 807 · **315.868 ha** · 평균 신뢰도 **0.4465** (`results.js` `namwon-farmland-2025`) |
| 영상 | `imagery.js` `namwon_2504 / 2506 / 2508 / 2510` — 동일 bounds, GSD **0.0108 / 0.0169 / 0.0154 / 0.0168 m**, 촬영 2025-04 · 06 · 08 · 10 |
| 고도 | 620 m → 240 m |
| 카메라 | pitch 44 → 36 · bearing −6 → +8 · **하강하며 남동으로 선회, 끝에서 거의 정지** |
| 제작 | **AI** · 크레딧 **64** |
| 카피 앵커 | **BL** |
| 정직성 등급 | **A** |

---

## 1. 레퍼런스 이미지 — 우리 유일한 4시점 실자산

| 파일 | epoch | 좌표 |
|---|---|---|
| `landxi/assets/proto/crops/namwon-epoch/1.jpg` | **2025-04** | `[127.351196, 35.533138]` |
| `…/namwon-epoch/2.jpg` | **2025-06** | 동일 |
| `…/namwon-epoch/3.jpg` | **2025-08** | 동일 |
| `…/namwon-epoch/4.jpg` | **2025-10** | 동일 |

전부 `source: 'ortho'` · GSD 0.243 m · **완전히 같은 좌표의 4시점**이다. 재질 변화의 유일한 실물 근거이며,
이 네 장을 나란히 놓고 보면 4월 맨흙 → 6월 물댄 논 → 8월 짙은 녹색 → 10월 황금색+수확 흔적이 그대로 보인다.

보조: `…/namwon-farmland-2025/7.jpg` `[127.350189, 35.37039]` — 로컬 ortho GSD 0.6 m,
경작지 conf **0.441** (이 결과의 낮은 신뢰도를 대표하는 실제 사례).

`--ref`에는 **4.jpg(2025-10)** 을 넣는다. 4시점 전환은 kling이 만들지 않고 **모형 재질 변화**로 프롬프트한다.

## 2. seedream 스틸

**PREAMBLE (verbatim)**

```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a block of Korean paddy and dry fields built as a handmade scale model, matching the reference plot layout exactly, plot for plot. Each field is a separate shallow tray. Flooded paddies are poured resin with visible surface reflection and tiny trapped bubbles; dry fields are sifted sand raked in fine lines; growing rice is cut real moss planted in rows; harvested plots are short brass-toned moss stubble. Plot boundaries are milled brass strips standing a hair proud of the surface. A narrow farm track of pale grit runs across the block. Some trays glow faintly from within with field green; others stay matt slate and unlit; roughly two thirds glow. The field block continues into further paddy blocks and low ridgeline on every side, out to a soft hazy horizon under an overcast sky; no board, table or edge anywhere in frame. Warm white, pale neutrals and slate, with field green as the only accent.
```

> **"roughly two thirds glow"가 실측을 지키는 문장이다.** 경작지 2,049,935 ㎡ / 비경작지 1,108,749 ㎡
> ≈ **65 : 35**. 필지 수로도 1,291 : 807 ≈ 62 : 38. 화면에서 이 비율이 읽혀야 한다 —
> 전부 초록으로 만들면 그 자체가 거짓 주장이다.

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a06.png   --ar 16:9 --ref landxi/assets/proto/crops/namwon-epoch/4.jpg
```

## 3. kling 모션 (5초)

```
The camera descends toward the field block and swings slowly to the left, tilting toward the horizontal, one smooth continuous move that eases almost to a stop by the end. The farm track stays running diagonally through frame from the first frame to the last. Midway through, the surface material of the fields changes in place, from raked sand to poured resin to planted moss to brass-toned stubble, while the camera keeps moving and the plot boundaries stay exactly where they are. Nothing enters or leaves frame. One single continuous take, no cuts, no shake. Slow, controlled.
```

**negative_prompt (verbatim)**

```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 결과가 룩 안에서 표현되는 방식

- **경작지 1,291** → 트레이 바닥이 `#1E9E6A` (`--s-done`)로 은은히 발광
- **비경작지 807** → `#6B7A8C` (`--s-hold`) 무광, 발광 없음
- **4시점** → 색이 아니라 **재질**로 시간을 말한다 (모래 → 레진 → 이끼 → 황동빛 이끼).
  카메라는 멈추지 않고, 필지 경계(밀링 놋쇠)는 네 시점 내내 **한 밀리도 움직이지 않는다**.
  그것이 "같은 필지를 네 번 찍었다"의 시각적 증명이다.

## 5. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 캡션 | `남원 사매면 · 2025-04 / 06 / 08 / 10 · 드론 · GSD 0.011–0.017 m` (재질 전환에 맞춰 날짜만 스텝) |
| DETECTED 카운터 | **`2,098 필지`** |
| 스택 바 | `경작지 1,291` · `비경작지 807` (2단, 실제 비율) |
| **신뢰도 병기** | **`평균 신뢰도 0.45`** — 카운터 옆 모노 11px, **필수** |
| 출처 칩 | `농림축산식품부 · 분석 2026-06-08 · 드론 정사영상 + AI 세그멘테이션` |
| 스캔 스트립 | **켬** |
| 카피 (앵커 **BL**) | `2,098필지.` / `경작 1,291, 비경작 807.` |

### 정직성 잠금

- 이 결과의 `confMean`은 **0.4465**로 낮다(`confMedian` 0.412, `confHist` 최빈 구간이 0.1–0.2).
  **숨기지 않고 병기한다.** 낮은 값을 감추면 leg 07의 0.79도, leg 09의 38,057도 못 믿게 된다.
- 4시점은 **재질 변화로만** 표현한다. **시점 간 증감 수치를 만들지 않는다** —
  `results.js`에 시계열 델타 산출물이 없다.
- `namwon-farmland-2025`의 `objTotal` 5,556은 **필지 내 탐지 객체 총수**이지 필지 수가 아니다.
  화면에 쓰지 않는다(쓰면 2,098과 충돌해 보인다).

## 6. 씸

- **04 → 05**: 얇은 층운 한 겹 (약 42 km 이격 흡수).
- **05 → 06**: 사매면 → 산내면 **약 30 km**. **계곡 안개**로 은폐 — 능선으로 오르는 동선이라 안개가 자연스럽다.
