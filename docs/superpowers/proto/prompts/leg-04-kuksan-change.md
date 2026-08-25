# leg 04 — 변화탐지 · 전북 국산리 드론 AOI

| | |
|---|---|
| 앵커 | `[126.983, 35.832]` — 실자산 bounds `[126.973996, 35.825613, 126.992145, 35.838284]` (약 1.6 × 1.4 km) |
| 실측 | **드론 변화탐지 486건** · `services.js` `change` · `real: true` · 최근 분석 **2026-08-05** · LX 한국국토정보공사 |
| 영상 | `imagery.js` `kuksan_a68` / `kuksan_a71` — **GSD 0.05 m** · 2025-08 · 같은 자리 2회차 |
| 고도 | 22 km → 620 m |
| 카메라 | pitch 62 → 44 · bearing −25 → −6 · **서쪽으로 활공하며 하강(glide)** |
| 제작 | **AI** · 크레딧 **64** |
| 카피 앵커 | **BR** |
| 정직성 등급 | **A**(변화탐지) + **B**(방치쓰레기·불법소각장 모티프) |

---

## 1. 레퍼런스 이미지 (전부 로컬 실자산)

| 파일 | 좌표 | 비고 |
|---|---|---|
| `landxi/assets/proto/crops/kuksan-change/1.jpg` | `[126.977989, 35.828401]` | a68 회차 · ortho · GSD 0.2421 m |
| `landxi/assets/proto/crops/kuksan-change/2.jpg` | 동일 좌표 | **a71 회차** — 1.jpg와 짝 |
| `landxi/assets/proto/crops/kuksan-change/3.jpg` | `[126.977989, 35.833722]` | a68 |
| `landxi/assets/proto/crops/kuksan-change/4.jpg` | 동일 좌표 | a71 |

`--ref`에는 **a68(1.jpg)** 을 넣는다 — 모형은 "이전 회차"를 만든 것이고, 변화는 오버레이가 켠다.
2.jpg(a71)는 어떤 객체가 바뀌었는지 **우리가 눈으로 대조해 씬 문장에 반영**하기 위한 참고다.

`crops.js` 주석대로 이 4장은 `cls`/`conf`/`area_m2`가 전부 `null`이다 —
등록된 탐지가 아니라 **순수 시계열 비교용 크롭**이다. 그래서 이 leg의 오버레이는 **총계 486만** 쓴다.

## 2. seedream 스틸

**PREAMBLE (verbatim)**

```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a small Korean farming hamlet built as a handmade scale model, matching the reference layout exactly: the same road, the same stream, the same block of houses and sheds in the same positions. Houses are painted plaster with laser-cut acrylic roofs; the two long sheds are milled brass corrugated sheet, hand-painted; the stream is poured resin over sifted sand with real grit on the bed; the paddy levees are real moss. Three or four small heaps of odd debris sit on the waste ground beside the stream, made of resin offcuts and sand, colourless. At one corner of a field there is a single scorched circular mark on the soil with one thin wisp of cotton smoke rising from it. The hamlet's fields and stream continue into more paddy and hedgerow on every side, out to a soft hazy horizon under an overcast sky; no board, table or edge anywhere in frame. Warm white, pale neutrals and slate only. No accent colour anywhere in this frame.
```

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a05.png   --ar 16:9 --ref landxi/assets/proto/crops/kuksan-change/1.jpg
```

## 3. kling 모션 (5초)

```
The camera glides forward and to the left, descending steadily over the hamlet in one smooth continuous move, tilting slowly toward the horizontal. The road runs diagonally through frame and stays in frame the whole time. The single wisp of smoke drifts upward very slightly. Nothing else moves; every building is a still physical model. One single continuous take, no cuts, no shake, no change of direction. Slow, controlled.
```

**negative_prompt (verbatim)**

```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 결과가 룩 안에서 표현되는 방식

| 항목 | 등급 | 모형 | 색 |
|---|---|---|---|
| **변화탐지 486건** | **A** | a68 모형 위, a71에서 바뀐 객체에만 **실선 테두리**가 씌워진다 | `#F2622A` (`--s-found`) |
| **방치쓰레기** | **B** | 하천변 공터의 잡동사니 더미 3–4개 | **무채색** `rgba(17,28,45,.40)` 헤어라인 깃발 |
| **불법소각장** | **B** | 밭 모서리 그을린 원형 자국 + 흰 연기 한 줄기 | **무채색** 헤어라인 |

**점등 순서가 중요하다**: 테두리는 한꺼번에 켜지지 않고 **카메라가 지나가는 순서대로 하나씩** 켜진다.
비행 자체가 스캔이라는 뜻이고, 이것이 이 서비스가 파는 것이다. 변화가 없는 나머지 모형은 끝까지 색이 없다.

## 5. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 캡션 | `전북 국산리 · 2025-08 · 드론 · GSD 0.05 m` |
| DETECTED 카운터 | 테두리 점등에 맞춰 상승 → **`486 건`** |
| 출처 칩 | `LX 한국국토정보공사 · 2026-08-05` |
| 스캔 스트립 | **켬** — 상단에서 `--sc-segp`에 묶여 훑고 내려감 |
| 방치쓰레기 / 불법소각장 라벨 | `라인업 · 미조사` (회색 칩) |
| 카피 (앵커 **BR**) | `같은 자리를 두 번 찍으면` / `달라진 것만 남는다.` |

### 정직성 잠금

- `services.js`의 `trash` **631개소**, `incinerator` **274개소**는 **`real:false` 예시 수치다.
  화면에 절대 쓰지 않는다.** 모티프는 보여주되 숫자는 없다.
- 변화탐지는 `results.js`에 GPKG 산출물이 없다 → **클래스 내역·신뢰도 분포를 만들어 쓰지 않는다.**
  총계 486과 분석일만 표시한다.

## 6. 씸

- **03 → 04**: 계곡 안개 은폐 (최고 위험 씸). 프레임 공유 필수.
- **04 → 05**: 국산리 → 남원 사매면 **약 42 km 이격**. 하강 중 **얇은 층운 한 겹**이 프레임을 가로지르는
  순간에 씸을 놓는다. 고도가 계속 내려가고 있으므로 수평 이동이 하강으로 읽힌다.
