# leg 07 — 비닐하우스 · 남원 금지면 평야 **(peak · linger 0.42)**

> 필름의 클라이맥스. **길이가 아니라 카메라 정지로 만든다** — ORRERY는 10초 peak leg 하나(2.25vh)를 썼지만,
> 우리는 `data-sc-linger="0.42"`로 leg 중앙에서 카메라를 거의 멈춘다.
> `lingerEase`는 단조·양끝 고정이라 **씸 프레임이 바뀌지 않고**, 페이스 편차 0%가 유지되며, 크레딧도 안 든다.

| | |
|---|---|
| 앵커 | `[127.3050, 35.3390]` — 요천 서안 충적 평야, **읍면동 1위 금지면** |
| 실측 | **9,664동** (`objTotal`) / **1,674필지** (`count`) · 단동 1,469 / 다동 205 · **272.6 ha** · 평균 신뢰도 **0.7869** (`results.js` `namwon-greenhouse-2025`) |
| 읍면동 상위 5 | 금지 **397** · 운봉 275 · 인월 157 · 아영 147 · 송동 119 |
| 클래스 신뢰도 | 단동 **0.8085** / 다동 **0.6321** |
| 고도 | 460 m → 180 m |
| 카메라 | pitch 28 → 22 · bearing +22 → +4 · **평야를 따라 낮게 전진하는 dolly, 중앙에서 거의 정지** |
| 제작 | **AI** · 크레딧 **64** |
| 카피 앵커 | **ML** (기본 킷에 없는 위치 — ORRERY도 이 자리를 썼다) |
| 정직성 등급 | **A** |

---

## 1. 레퍼런스 이미지 — 전부 로컬 정사영상 (V-World 폴백 아님)

| 파일 | 좌표 | conf | 면적 | 비고 |
|---|---|---|---|---|
| `landxi/assets/proto/crops/namwon-greenhouse-2025/6.jpg` | `[127.303756, 35.352504]` | **0.9139** | 5,481.8 ㎡ | 최대 군집 — **`--ref` 로 이 장을 쓴다** |
| `…/namwon-greenhouse-2025/4.jpg` | `[127.310341, 35.339811]` | 0.8659 | 3,103.5 ㎡ | |
| `…/namwon-greenhouse-2025/5.jpg` | `[127.309098, 35.335162]` | 0.8455 | 3,070.1 ㎡ | |
| `…/namwon-greenhouse-2025/8.jpg` | `[127.300046, 35.320021]` | **0.9296** | 2,455.5 ㎡ | 최고 신뢰도 |

전부 `epoch: '2025-10'` · `source: 'ortho'` · **GSD 0.6 m** (`namwon_city_2510`의 고해상 core).
**비닐하우스가 실제로 어떤 간격과 방향으로 늘어서 있는지**의 원본이며, 이것이 우리가
"연상시키는 모형"이 아니라 "축척 모형"을 만들 수 있는 이유다.

## 2. seedream 스틸

**PREAMBLE (verbatim)**

```
Macro tilt-shift photograph of a handmade physical scale model, shot on a medium-format camera with a tilt-shift lens. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. High-key lighting: one large soft overhead source, a huge white bounce, near-shadowless with a single soft contact shadow. Seamless bone-white ground. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a flat Korean alluvial plain packed with rows of small arched greenhouses, built as a handmade scale model and matching the reference layout exactly, the same rows, the same spacing, the same north-south orientation, the same irregular gaps. Each greenhouse is a separate hand-built piece: milled brass ribs under a blown translucent acrylic skin, set on sifted sand and real moss ground. Most are single arches standing alone; a few are wide blocks of several arches fused side by side, and these are clearly rarer. Fibre-optic practicals run inside the arches. Some arches are lit from within with LX blue, brightest at the near end of a row and stepping through pale blue to near white; the wide fused blocks glow more faintly and with softer edges. A narrow grit farm track runs across the plain. Seamless bone-white ground at the frame edges. Warm white, pale neutrals and slate, with LX blue as the only accent.
```

> **"a few are wide blocks … clearly rarer"가 실측을 지키는 문장이다.** 단동 1,469 : 다동 205 ≈ **88 : 12**.
> **"the wide fused blocks glow more faintly and with softer edges"** 는 다동 신뢰도 0.6321이
> 단동 0.8085보다 낮다는 사실을 **밝기로** 옮긴 것이다. 숫자를 화면에 더 쓰지 않고 낮은 확신을 말한다.

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a08.png   --ar 16:9 --ref landxi/assets/proto/crops/namwon-greenhouse-2025/6.jpg
```

## 3. kling 모션 (5초)

```
The camera moves forward low over the plain in one smooth continuous dolly, easing almost to a standstill halfway through and then creeping on, tilting very slightly toward the horizontal. The rows of greenhouses slide past beneath as parallax and stay in frame the whole time. Fibre-optic lights inside the arches come on one after another in the order the camera reaches them, never all at once. Nothing else moves; nothing enters or leaves frame. One single continuous take, no cuts, no shake. Very slow, cinematic, controlled.
```

**negative_prompt (verbatim)**

```
text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 결과가 룩 안에서 표현되는 방식

- **점등 순서**: 광섬유가 **카메라가 지나가는 순서대로 하나씩** `#4E86F7 → #9FC6FF → #E6F0FF` 3단.
  기존 `tools/film/render.html`의 `ACCENT_GH / GH2 / GH3` 필라멘트 문법을 모형 안으로 옮긴 것 —
  **이미 승인된 룩이라 새로 설득할 필요가 없다.**
- **형태로 클래스 구분**: 단동 = 아치 하나, 다동 = 아치 여러 개가 붙은 덩어리. 색은 하나뿐이다.
- **밝기로 신뢰도**: 다동은 덜 밝고 가장자리가 흐릿하다.

## 5. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 캡션 | `남원 금지면 · 2025-10 · 정사영상 · GSD 0.6 m` |
| DETECTED 카운터 | 점등에 맞춰 상승 → **`9,664 동`** |
| 보조 스택 | `1,674 필지 · 단동 1,469 / 다동 205 · 평균 신뢰도 0.79` |
| 읍면동 막대 5 | `금지 397 · 운봉 275 · 인월 157 · 아영 147 · 송동 119` — **금지면 막대만 LX 블루**, 나머지 슬레이트 |
| 출처 칩 | `농림축산식품부 · 분석 2026-06-06` |
| 스캔 스트립 | **최대 강도.** `linger` 정지 구간에서 스트립도 함께 멈춘다 |
| 카피 (앵커 **ML**) | `9,664동.` / `한 동씩 세었다.` |

### 정직성 잠금

- **9,664는 `objTotal`(동), 1,674는 `count`(필지)다. 두 단위를 같은 줄에 쓰지 않는다.**
  카운터의 큰 숫자는 `9,664 동`이고, 필지는 그 아래 보조 스택에서 단위를 명시해 따로 쓴다.
  섞는 순간 "9,664필지"라는 존재하지 않는 사실이 생긴다.
- 읍면동 막대는 `stats.emd` 실측 상위 5개다. 이 leg가 금지면에 서 있으므로 금지면만 액센트.
- 평균 신뢰도 0.79는 우리 결과 중 가장 높다 — 그래서 leg 05의 0.45를 숨길 이유가 더 없다.

## 6. 씸

- **06 → 07**: 고도 변화(상승 → 하강)가 32 km 이격을 흡수.
- **07 → 08**: 남원 내륙 → 여수 연안 **약 95 km. 이 필름 최대 이격이자 최고 위험 씸.**
  → **계획된 화이트아웃**: 역광 해무가 프레임을 완전히 흰색으로 채우는 **6프레임 구간**을
  leg 07 끝에 심는다. ORRERY가 어둠으로 한 것을 우리는 흰색으로 한다.
  기존 `hero.mp4`도 정확히 이 지점(17.55s)에서 하드컷을 냈다 — 같은 문제를 정면으로 처리한다.
  검사 기준: 화이트아웃 씸만 `lumaDrop` **양방향 3.0 이내**(밝아지므로 음수로 나온다).
