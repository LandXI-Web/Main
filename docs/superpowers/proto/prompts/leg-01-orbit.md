# leg 01 — 궤도 · 지구 저궤도

| | |
|---|---|
| 앵커 | `[109.0, 29.6] → [122.6, 33.6]` (`render.html` `SEG.orbit`) |
| 고도 | 41,061 km → 8,200 km |
| 카메라 | pitch 0 → 0 · bearing 0 → −2 · **자전 드리프트 + 감지될까 말까 한 push-in** |
| 제작 | **자체 렌더 (크레딧 0)** |
| 가중치 | `data-sc-w="1.09"` · 5.0초 |
| 카피 앵커 | **BL** |
| 정직성 등급 | — (조사 결과 없음) |

---

## 1. 이 leg는 AI로 만들지 않는다

`landxi/assets/proto/film/hero.mp4` (1280×720 · 25fps · 575프레임 · 23.00초) 의 t 0.00–5.00 구간을
리컷 + 하이키 그레이드 + 스크럽 전용 재인코딩만 한다. 실제 Sentinel-2 cloudless + MapLibre 결정론 렌더라
**재현 가능**하고 크레딧이 들지 않는다.

```bash
ffmpeg -y -ss 0 -t 5.0 -i landxi/assets/proto/film/hero.mp4 -an   -vf "scale=-2:1080:flags=lanczos,eq=brightness=0.06:contrast=1.04:saturation=0.86,format=yuv420p"   -c:v libx264 -profile:v high -preset slow -crf 20 -g 8 -keyint_min 8 -sc_threshold 0   -movflags +faststart out/leg01.mp4
bash encode.sh out/leg01.mp4 assets/leg01-m.mp4 mobile
ffmpeg -sseof -0.15 -i assets/leg01.mp4 -frames:v 1 -q:v 2 anchors/a02.png
ffmpeg -i assets/leg01.mp4 -frames:v 1 -q:v 3 assets/p01.webp
```

> `eq` 값은 **측정 후 확정한다.** `ffmpeg -i hero.mp4 -vf signalstats -f null -` 로 YMIN/YMAX를 재고
> `colorlevels`로 확장한 뒤 위 숫자를 갈아 끼운다(`assets.md` 권장 순서). 위 값은 시작점일 뿐이다.

**참고 프레임**: `shots/film/k_0090.png` (t 0.90 · 궤도 · 파일명 = t×100)

## 2. 하이키 전환의 핵심

원본은 우주 배경이 `#01030a` 오프블랙이다. 흰 아틀라스로 가려면 **우주를 본 화이트 `#E9EEF1`로 뺀다.**
`render.html`의 `#bg` background-color 와 `#vig` 라디얼 비네트를 뒤집는 것이 가장 깨끗하다
(그레이드로 검정을 흰색까지 들어올리면 지구 림이 뭉갠다). 지구 림에만 `#9FC6FF` 헤어라인 대기광을 남긴다.

어두운 우주로 시작하면 `client-taste-profile` 스펙(흰 에디토리얼 아틀라스)과 정면으로 싸운다.
**첫 프레임이 흰색이어야 나머지 아홉 leg가 성립한다.**

## 3. 재생성이 필요할 때만 쓰는 백업 프롬프트

자체 렌더 경로가 막혔을 때만. 그 경우에도 이 leg는 **모형이 아니라 사진**이어야 한다
(재질 전환은 leg 03에서 딱 한 번 일어난다) — 그래서 프리앰블을 붙이되 씬에서 모형어를 뺀다.

**PREAMBLE (verbatim)**

```
Macro tilt-shift photograph of a handmade physical scale model, shot on a medium-format camera with a tilt-shift lens. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. High-key lighting: one large soft overhead source, a huge white bounce, near-shadowless with a single soft contact shadow. Seamless bone-white ground. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: the Earth photographed from low orbit against a seamless bone-white void instead of black space. The Korean peninsula is just entering the right-hand limb of the globe, small and precise. Ocean reads as poured resin under a huge soft overhead source; landmass reads as pale sifted sand and slate. A single hairline pale-blue atmospheric rim, no glow bloom. The globe is perfectly still and centred slightly left of frame, occupying about 62 percent of the frame height. Vast empty white above and below. Nothing else in frame.
```

**MOVE (kling, 5s)**

```
The globe rotates almost imperceptibly on its axis while the camera pushes forward in one smooth continuous dolly-in, barely closing distance. The Korean peninsula drifts a few degrees further onto the visible limb. The globe stays perfectly centred and fully in frame from the first frame to the last. One single continuous take, no cuts, no shake. Extremely slow, cinematic, controlled.
```

**negative_prompt (verbatim)**

```
text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 카피 (앵커 **BL**) | `국토는 매년 촬영된다.` / `읽히는 것은 그중 일부다.` |
| 워드마크 | `LAND-XI` 좌상단 |
| 계기 | 좌하단 웨이포인트 레일 — 전부 미점등 |
| 캡션 | 없음 |
| 카운터 | **없음** |
| 스캔 스트립 | **꺼짐** |

**숫자 0개.** 히어로에서 숫자를 쓰면 마지막 leg의 수치가 힘을 잃는다.

## 5. 씸

- **01 → 02**: 위험 낮음. 대기 림 헤어라인이 유일한 랜드마크라 프레임 공유만으로 충분하다.
- 다음 leg 시작 이미지: `anchors/a02.png` = `assets/leg01.mp4`의 마지막 프레임 (**인코딩 산출물에서** 추출).
