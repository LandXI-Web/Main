# leg 06 — 산림식생 · 지리산 반야봉 능선 (남원 산내면)

> **이 leg가 필름 전체의 신뢰를 만든다.** 아무것도 세지 않는 화면을 5초 내주는 서비스는
> 나머지 화면의 숫자를 믿게 만든다.

| | |
|---|---|
| 앵커 | `[127.617, 35.318]` — 남원 산내면, 뱀사골에서 반야봉으로 오르는 능선 |
| 커버리지 근거 | `imagery.js` `namwon_city_2510` bounds `[127.182606, 35.302858, 127.637309, 35.561786]` **안쪽 동남단**. `namwon-farmland-2025` bbox 동단이 127.6577이므로 조사 범위와 지리적으로 이어진다 |
| 실측 | **없음.** 산림식생은 `services.js` 13종에 **없는 항목** |
| 고도 | 240 m → 460 m (**10 leg 중 유일하게 오른다**) |
| 카메라 | pitch 36 → 28 · bearing +8 → +22 · **능선 따라 저공 lateral 트래킹 + 완만한 상승** |
| 제작 | **AI** · 크레딧 **64** |
| 카피 앵커 | **TL** |
| 정직성 등급 | **C — 조사 항목 아님** |

---

## 1. 레퍼런스 이미지 — 없다. 우리가 만든다 (크레딧 0)

이 좌표에는 실물 크롭이 없다. `tools/film/render.html`이 이미 MapLibre + V-World 위성 +
Mapterhorn terrarium DEM을 결정론적으로 렌더하므로 **카메라만 새로 꽂아 PNG 한 장을 뽑으면 그게 레퍼런스**다.

```bash
node tools/serve.mjs &                                  # 4173
# render.html 의 SEG 에 임시 구간 추가:
#   { id:'ref06', t0:0, t1:0.04, ease:easeLin,
#     a:{c:[127.617,35.318], z:13.6, p:62, b:20}, b:{ ...동일 } }
node tools/film/frames.mjs --from 0 --to 0 --out build/film/refs
mv build/film/refs/f_0000.png build/film/refs/ref06-jirisan.png
```

**실제 지리산 능선의 실제 골격**이 레퍼런스에 들어간다. ORRERY의 파타고니아는 연상일 뿐이지만,
우리 능선은 DEM에서 나온 진짜 지형이다.

## 2. seedream 스틸

**PREAMBLE (verbatim)**

```
Macro tilt-shift photograph of a handmade physical scale model, shot on a medium-format camera with a tilt-shift lens. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. High-key lighting: one large soft overhead source, a huge white bounce, near-shadowless with a single soft contact shadow. Seamless bone-white ground. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

**SCENE**

```
Scene: a forested mountain ridge built as a handmade scale model, following the reference ridgeline exactly, the same spurs and the same valley cutting in from the left. The ridge skeleton is painted plaster. The forest canopy is real moss and dyed lichen packed dense, so no individual tree reads, only surface texture: fine grey-green on the shaded slope, coarser and warmer on the sunlit slope. A thin band of real cotton fog lies in the valley and crosses the lower left of frame. Bare rock outcrops near the summit are unpainted plaster. Seamless bone-white ground at the frame edges. Warm white, pale neutrals and slate. No accent colour anywhere in this frame, nothing lit, nothing marked.
```

**CLI**

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/a07.png   --ar 16:9 --ref build/film/refs/ref06-jirisan.png
```

## 3. kling 모션 (5초)

```
The camera tracks sideways along the ridge and rises very gently at the same time, one smooth continuous move, tilting slowly toward the horizontal so more sky enters the top of frame. The summit outcrop stays in frame from the first frame to the last. The valley fog drifts slowly and thins. Over the course of the move the canopy on the sunlit slope shifts colour, from grey-green toward a warm copper, while its texture stays identical. Nothing else moves. One single continuous take, no cuts, no shake. Slow, controlled.
```

**negative_prompt (verbatim)**

```
text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

## 4. 결과가 룩 안에서 표현되는 방식 — **표현하지 않는다**

| 항목 | 처리 |
|---|---|
| 산림식생 | **탐지 색이 단 하나도 켜지지 않는다** (`#4E86F7`·`#FF9A2E`·`#1E9E6A` 전부 금지) |
| 계절 변화 | 능선 한쪽 사면 수관 색이 4월 회녹 → 10월 적동색으로 이동. **이것은 관측 가능한 사실이고 수치가 아니다** |
| 카운터 | **없음** |
| 스캔 스트립 | **꺼짐** — 스캔하지 않는 곳에 스캔선을 그리는 건 거짓말이다 |

## 5. 페이지 오버레이

| 요소 | 내용 |
|---|---|
| 캡션 | `남원 산내면 · 2025-10 · 정사영상 · GSD 2.0 m` (`namwon_city_2510`, 원본 sourceGsd 0.0168 m) |
| 미조사 칩 | **`산림식생 · 조사 항목 아님`** (회색) |
| DETECTED 카운터 | **없음** |
| 스캔 스트립 | **꺼짐** |
| 카피 (앵커 **TL**) | `여기는 아직 세지 않았다.` / `세지 않은 것은 색이 없다.` |

### 정직성 잠금

- 산림식생은 `services.js` 13종에 없다. **면적·수종·피복률 어떤 수치도 만들지 않는다.**
- GSD 2.0 m는 `namwon_city_2510`(전역 커버리지)의 실제 타일 해상도다.
  원본이 0.0168 m라고 해서 캡션에 0.0168을 쓰면 안 된다 — **화면에 실제로 보이는 타일의 GSD**를 쓴다.
- 상승 구간이므로 이 leg의 `rate`가 다르게 느껴질 수 있다. 그러나 가중치는 다른 leg와 **동일한 1.09vh**다
  (페이스는 스크롤 대비 필름 시간이지 고도가 아니다).

## 6. 씸

- **05 → 06**: 계곡 안개.
- **06 → 07**: 산내면 → 금지면 **약 32 km 서향**. leg 06 끝의 **상승이 시야를 넓히고**
  leg 07 시작이 다시 내려온다 — 고도 변화가 수평 이격을 흡수한다.
