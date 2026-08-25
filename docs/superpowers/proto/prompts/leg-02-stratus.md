# leg 02 — 성층운 돌파 · 한반도 상공

| | |
|---|---|
| 앵커 | `[122.6, 33.6] → [127.55, 35.68]` (`SEG.dive` → `SEG.korea` 앞부분) |
| 고도 | 8,200 km → 158 km |
| 카메라 | pitch 0 → 37 · bearing −2 → −16 · **한 방향 급강하(dive), 감속 없음** |
| 제작 | **자체 렌더 (크레딧 0)** |
| 가중치 | `data-sc-w="1.09"` · 5.0초 |
| 카피 앵커 | **BR** |
| 정직성 등급 | — (조사 결과 없음) |

---

## 1. 자체 렌더

`hero.mp4` t 5.00–10.00. leg 01과 동일한 그레이드·인코딩을 쓴다 — **같은 촬영으로 읽혀야 하므로
`eq` 파라미터를 한 글자도 바꾸지 않는다.**

```bash
ffmpeg -y -ss 5.00 -t 5.0 -i landxi/assets/proto/film/hero.mp4 -an   -vf "scale=-2:1080:flags=lanczos,eq=brightness=0.06:contrast=1.04:saturation=0.86,format=yuv420p"   -c:v libx264 -profile:v high -preset slow -crf 20 -g 8 -keyint_min 8 -sc_threshold 0   -movflags +faststart out/leg02.mp4
ffmpeg -sseof -0.15 -i assets/leg02.mp4 -frames:v 1 -q:v 2 anchors/a03.png   # ← leg 03 AI 입력
```

**참고 프레임**: `shots/film/k_0440.png` (t 4.40 · dive), `k_0610.png` (t 6.10 · 구름), `k_0740.png` (t 7.40)

> `anchors/a03.png`가 이 필름에서 가장 중요한 한 장이다. **실사에서 모형으로 넘어가는 유일한 입력**이고,
> leg 03의 seedream/kling이 이 프레임에서 출발한다. 흐리거나 구름에 절반이 먹힌 프레임을 쓰면
> 재질 전환이 씸이 아니라 사고로 읽힌다. `-sseof` 값을 −0.15 → −0.20 → −0.10으로 세 장 뽑아 고른다.

## 2. 이 leg의 진짜 임무: 구름을 주인공으로 만들기

씸 은폐가 이 필름의 절반이고, **흰 구름이 우리의 어둠이다.** ORRERY는 어둠으로 씸을 숨겼다.
하이키에서는 반대로 **화이트아웃**이 같은 일을 한다. leg 02 끝에서 구름이 프레임의 70% 이상을 덮어야
leg 03의 재질 전환이 보이지 않는다.

`render.html`의 `.cl` 구름 레이어(2048×2048 스프라이트, `opacity`·`transform` 애니메이션)
불투명도 커브를 **leg 끝쪽으로 밀어서** 재타이밍한다. 새 에셋이 필요 없다.

## 3. 백업 프롬프트 (자체 렌더가 막혔을 때만)

**PREAMBLE (verbatim)**

```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a descending view from the upper stratosphere. The horizon is still curved but flattening. Below, a continuous deck of real cotton-wool cloud, brilliant white under a huge soft overhead source, fills the lower two thirds of frame and is beginning to rise toward the lens. Through a thin break in the deck, pale sifted-sand coastline and slate water are just readable, small and undramatic. Everything above the deck is empty warm white. A single hairline pale-blue atmospheric band at the horizon. Nothing else in frame.
```

**MOVE (kling, 5s)**

```
The camera falls straight down toward the cloud deck in one smooth continuous descent, tilting gently forward as it goes, so the horizon slowly leaves the top of frame and the cloud deck rises to fill more of it. The cloud stays soft and volumetric, passing the lens rather than the lens passing it. One single continuous take, no cuts, no shake, no acceleration. Slow, heavy, controlled.
```

**negative_prompt (verbatim)**

```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 카피 (앵커 **BR**) | `1.5 cm 해상도로 찍어도` / `누가 세어 주지 않으면 숫자가 되지 않는다.` |
| 캡션 | 없음 |
| 카운터 | **없음** |
| 스캔 스트립 | **꺼짐** |

**"1.5 cm"의 근거**: 남원 원본 정사영상 4종(`nw_2504/2506/2508/2510.tif`, EPSG:5186)의 원본 GSD.
`imagery.js`의 재계산값은 0.0108 / 0.0169 / 0.0154 / 0.0168 m 이므로 **"1.5 cm 급"이 정확한 표현**이다.
카피에 쓰는 숫자도 실측이어야 한다.

## 5. 씸

- **02 → 03**: 위험 낮음. 구름 상단면이 프레임의 70%를 덮는 시점에 씸을 배치한다.
- 다음 leg 시작 이미지: `anchors/a03.png` (**leg 03의 seedream `--ref` 이자 kling 시작 프레임**).
