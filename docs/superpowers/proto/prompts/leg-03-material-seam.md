# leg 03 — 재질 전환 · 전북 상공 구름층

> **필름에서 가장 중요한 leg.** 사진이 모형으로 바뀌는 **단 하나의** 지점이다.
> 이 전환이 두 번 일어나면 관객은 룩을 믿지 않고, 한 번도 일어나지 않으면 디오라마가 성립하지 않는다.

| | |
|---|---|
| 앵커 | `[127.55, 35.68] → [127.326, 35.347]` — 전라북도 상공 → 남원 분지 진입 |
| 끝 카메라 | `manifest.json` leg 03 `endCamera` = `z12.6 · pitch 62 · bearing −25 · altitudeM 22,212 · mpp 20.567` **정확히 일치시킬 것** |
| 고도 | 158 km → 22 km |
| 카메라 | pitch 37 → 62 · bearing −16 → −25 · **구름층을 수직 관통하며 하강** |
| 제작 | **AI** (seedream image-to-image → kling v2-1-pro) |
| 크레딧 | 스틸 14 + 클립 50 = **64** |
| 가중치 | `data-sc-w="1.09"` · 5.0초 |
| 카피 앵커 | **C** (이 leg에서만 화면 중앙) |
| 정직성 등급 | — (조사 결과 없음. 대신 **고지**를 담당) |

---

## 1. 레퍼런스 이미지

```
anchors/a03.png   ← assets/leg02.mp4 의 마지막 프레임 (인코딩 산출물에서 -sseof -0.15)
```

hero.mp4 t≈10.00s. `SEG.descent` (8.70–11.90) 의 k≈0.41 지점 — 실제 Sentinel-2 cloudless + Mapterhorn
terrarium 지형 위에서 렌더된 **진짜 전라북도**다. 이 프레임의 산줄기·하천 배치가 모형으로 그대로 넘어간다.

## 2. seedream 스틸

**PREAMBLE (verbatim)**

```
Photograph of a handmade physical miniature world, shot on a medium-format camera with a tilt-shift lens: continuous and borderless, no board, table, plinth or studio edge ever in frame — the world simply continues past its edges. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. Soft high daylight, gentle key, near-shadowless with long soft falloff toward a pale hazy horizon. Real cotton-wool cloud drifts through the frame. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: the same terrain as the reference image, at the same camera angle and the same layout of ridges, river valleys and paddy basins, but rebuilt as a handmade physical scale model. A thick deck of real cotton-wool cloud crosses the upper half of frame and the camera is emerging from underneath it. Below the deck the land is painted plaster for the ridgelines, sifted sand and thin laser-cut acrylic panels for the flooded paddy blocks, poured resin for the river, real moss along the levees. Field boundaries are scribed into the surface as shallow hairline grooves with no colour in them at all. The terrain continues unbroken beneath the cloud deck to a soft hazy horizon on every side; no board, table or edge anywhere in frame. Brilliant white cloud, warm white sky, pale neutrals and slate. No accent colour anywhere in this frame.
```

> **"no accent colour anywhere in this frame"가 이 씬의 잠금장치다.** 여기서 색이 하나라도 켜지면
> §7 정직성 등급이 무너진다 — 색은 실측 탐지에만 켜진다.

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a04.png   --ar 16:9 --ref anchors/a03.png
```

## 3. kling 모션 (5초)

**MOVE**

```
The camera continues straight down through the cotton cloud deck in one smooth continuous descent, tilting further forward so the ground fills more of the frame. The cloud passes the lens and clears. The terrain below stays exactly where it is in frame throughout, the same ridges and the same river, only getting closer. Everything is a still physical model; nothing on the ground moves. One single continuous take, no cuts, no shake, no change of direction. Slow, heavy, controlled.
```

**negative_prompt (verbatim)**

```
board, table, plinth, base plate, edge, studio, white background, blue sky paint, text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

**CLI**

```bash
node <skill>/scripts/kie.mjs shot "<MOVE>" anchors/a03.png out/leg03.mp4 --dur 5 --tail anchors/a04.png
```

## 4. 재질 전환이 실패하는 3가지 방식과 대응

| 실패 | 증상 | 대응 |
|---|---|---|
| 전환이 **너무 일찍** | 구름 위에서 이미 모형 → 관객이 전환을 목격한다 | 씬에서 구름 두께를 늘린다 (`thick deck` → `dense unbroken deck`) |
| 전환이 **안 일어남** | 끝까지 위성사진 | `--ref` 가중을 낮추고 씬 첫 문장을 `rebuilt as a handmade physical scale model` 로 시작하도록 어순을 바꾼다 |
| **카메라 후퇴** | 와이드샷으로 물러남 (양끝 고정 충돌) | `--tail` 을 빼고 시작 이미지만으로 체이닝(규칙 A 원형)한다. 대신 leg 04 앵커를 이 leg 결과에서 다시 뽑는다 |

리테이크 3회까지는 예산에 반영되어 있다(스틸 ×1.6 / 클립 ×1.4).

## 5. 페이지 오버레이 — **고지 leg**

| 요소 | 내용 |
|---|---|
| 카피 (앵커 **C**) | `여기부터는 축척 모형이다.` / `배치는 실제 필지에서 가져왔다.` |
| 캡션 | 없음 |
| 카운터 | **없음** |
| 스캔 스트립 | **꺼짐** |

**이 두 줄이 필름 전체의 정직성 계약이다.** 관객에게 "지금부터 보는 것은 사진이 아니다"를 명시적으로 알린다.
이 고지가 없으면 leg 04–09의 모든 화면이 위조가 된다. 카피 윈도우는 **plateau 형**으로 열어
(순수 삼각형은 opacity 1을 한 순간만 스쳐서 흐리게 읽힌다) 최소 1.2초 이상 완전 불투명으로 머문다.

## 6. 씸

- **02 → 03**: 프레임 공유. 구름 상단.
- **03 → 04**: **최고 위험.** 구름 하단 + 계곡 안개로 은폐. 프레임 공유 + 안개 밀도 0.6 이상 유지.
  `anchors/a04.png` = `assets/leg03.mp4`의 마지막 프레임 (인코딩 산출물에서).
