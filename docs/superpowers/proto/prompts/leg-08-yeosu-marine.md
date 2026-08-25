# leg 08 — 해양쓰레기(드론) · 여수 가막만 · 돌산 연안

| | |
|---|---|
| 앵커 | `[127.6778, 34.6023] → [127.7215, 34.5690]` |
| 실측 bbox | `[127.642935, 34.568377, 127.712634, 34.636318]` (`results.js` `yeosu-marine-2026-drone`) |
| 실측 | **2,078건 · 8종** · 총면적 **0.518 ha** · 분석 **2026-05-13** · 드론 |
| 클래스 | styrofoam **1,790 (86%)** · buoy_bottle 75 · plastic_box 56 · other_debris 47 · rope 44 · buoy_blue 41 · net 14 · buoy_red 11 |
| 병기 회차 | **여수 항공 1,860건** · Styrofoam 단일 클래스 · 4.457 ha · 분석 2026-04-27 (`yeosu-marine-2025-aerial`) |
| 끝 카메라 | 기존 필름 `handoff` `[127.7215, 34.569] z13.6 p2 alt 11,212 m` 와 운 맞춤 |
| 고도 | 180 m → 85 m |
| 카메라 | pitch 22 → 12 · bearing +4 → −6 · **해안선을 넘어 해상으로 미끄러지는 저공 dolly** |
| 제작 | **AI** · 크레딧 **64** |
| 카피 앵커 | **TL** |
| 정직성 등급 | **A** |

---

## 1. 지명 주의 — "국동항"이라고 쓰면 거짓이 된다

가장 가까운 이름난 항구는 **국동항** `[127.7196, 34.7333]`이지만,
**우리 탐지가 실제로 있는 곳은 가막만**(bbox 34.568–34.636 N)이다. 국동항은 그 북쪽 약 15 km에 있고
탐지 bbox 밖이다. **캡션에 국동항을 쓰지 않는다.** 앵커 지명은 `여수 가막만`이다.

## 2. 레퍼런스 이미지

| 파일 | 좌표 | cls | conf | 면적 |
|---|---|---|---|---|
| `landxi/assets/proto/crops/yeosu-marine-2026-drone/1.jpg` | `[127.681332, 34.578158]` | styrofoam | **0.874** | 1.1 ㎡ |
| `…/yeosu-marine-2026-drone/2.jpg` | `[127.686912, 34.575592]` | rope | 0.870 | 3.7 ㎡ |
| `…/yeosu-marine-2026-drone/3.jpg` | `[127.680929, 34.578195]` | other_debris | 0.864 | 6.0 ㎡ |
| `…/yeosu-marine-2026-drone/5.jpg` | `[127.685394, 34.571733]` | styrofoam | 0.854 | 3.1 ㎡ |

`--ref`: **1.jpg**.

> ⚠️ **출처 표기 조건**: `crops.js` 주석대로 여수 크롭 8장은 **로컬 여수 정사영상이 없어
> V-World 위성 타일(z19, 3×3 스티칭, GSD 0.246 m)로 만든 것**이다.
> ㈜ 국토교통부 브이월드 — 개발자 가이드 이용약관에 따라 **출처 표시 조건부** 사용.
> **레퍼런스 입력으로 쓰는 것**과 **화면에 띄우는 것**은 다르다. 화면에 증거 썸네일로 띄우면
> `자료제공: 브이월드(www.vworld.kr)` 표기가 **필수**이고, 상업적 재배포 전 약관을 다시 확인해야 한다.

## 3. seedream 스틸

**PREAMBLE (verbatim)**

```
Macro tilt-shift photograph of a handmade physical scale model, shot on a medium-format camera with a tilt-shift lens. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. High-key lighting: one large soft overhead source, a huge white bounce, near-shadowless with a single soft contact shadow. Seamless bone-white ground. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a sheltered Korean inner bay built as a handmade scale model, matching the reference coastline exactly. The sea is poured resin, cast thicker where the water is deeper so the shallows read paler. A breakwater of cast plaster tetrapods runs along the left. Long lines of aquaculture floats are tiny beads threaded on wire, laid out in the same rows as the reference. Two small fishing boats are milled brass hulls, hand painted, moored still. The tide line is real grit and gravel. Scattered thinly along the tide line and drifting in the shallows are small pieces of amber-coloured debris, mostly broken irregular lumps, with a few small cylinders, a few angular boxes, a few loose threads and a few round beads among them; the broken lumps clearly outnumber everything else. They are sparse, not a carpet, with plenty of clean empty water between them. Seamless bone-white ground at the frame edges. Warm white, pale neutrals and slate, with warm amber as the only accent.
```

> **"They are sparse, not a carpet"가 실측을 지키는 문장이다.** 총 탐지면적은 **0.518 ha**로 아주 작다.
> 알갱이가 화면을 덮으면 그 자체가 거짓 주장이 된다.
> **"the broken lumps clearly outnumber everything else"** 는 스티로폼 86%를 형태 비율로 옮긴 것이다.
> **색은 앰버 하나뿐** — 8종에 8색을 주면 흰 아틀라스가 무너지고, 클래스별 색 대응을 관객이 외울 수도 없다.

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a09.png   --ar 16:9 --ref landxi/assets/proto/crops/yeosu-marine-2026-drone/1.jpg
```

## 4. kling 모션 (5초)

```
The camera slides forward off the land and out over the water in one smooth continuous low dolly, tilting steadily toward the horizontal so more of the bay opens up ahead. The breakwater slides past on the left as parallax and stays in frame. The resin sea does not ripple; it is a solid cast surface. Thin brackets of pale amber corner marks settle over the densest patches of debris one group at a time, in the order the camera reaches them. Nothing else moves; nothing enters or leaves frame. One single continuous take, no cuts, no shake. Slow, controlled.
```

**negative_prompt (verbatim)**

```
text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 5. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 캡션 | `여수 가막만 · 2026-05-13 · 드론 · 탐지객체 2,078` |
| DETECTED 카운터 | 브래킷이 씌워질 때마다 상승 → **`2,078 건`** |
| 보조 | `8종 · 스티로폼 1,790(86%) · 총면적 0.52 ha` |
| 출처 칩 | `해양수산부 · 분석 2026-05-13` |
| **회차 병기** | `2025 항공 1,860건 (2026-04-27)` / `2026 드론 2,078건 (2026-05-13)` + **`≠ 비교 불가`** |
| 증거 썸네일 | `crops/yeosu-marine-2026-drone/1.jpg` · `[127.681332, 34.578158]` · conf 0.874 · 1.1 ㎡ + **`자료제공: 브이월드(www.vworld.kr)`** |
| 스캔 스트립 | **켬** |
| 카피 (앵커 **TL**) | `여수 가막만.` / `2,078건. 86%가 스티로폼이었다.` |

### 정직성 잠금

- **1,860 → 2,078을 증가로 잇지 않는다.** 두 회차는 센서(항공 vs 드론), 범위
  (항공 bbox `[127.509, 34.555, 127.750, 34.750]` vs 드론 `[127.643, 34.568, 127.713, 34.636]`),
  클래스 체계(단일 vs 8종)가 전부 다르다. **증감 화살표 금지, `≠ 비교 불가` 표기 필수.**
- 항공 4.457 ha 와 드론 0.518 ha 도 같은 이유로 나란히 놓되 차이를 계산하지 않는다.
- 8종 목록은 `stats.classes` 실측 그대로 쓴다. 반올림하거나 "기타"로 합치지 않는다.

## 6. 씸

- **07 → 08**: **계획된 화이트아웃** (역광 해무 6프레임). 필름 최대 이격 95 km.
- **08 → 09**: 여수 → 신안 **약 150 km 서향.** 은폐: **해무 + 수면 연속.**
  leg 08 끝에서 레진 수면이 프레임을 가득 채우고, leg 09 시작이 같은 레진 수면에서 열린다.
  **물은 어디서나 같아 보인다** — 이 씸의 유일한 자산이다. 마지막 프레임에 육지를 남기지 말 것.
