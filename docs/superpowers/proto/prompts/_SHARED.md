# 공유 프리앰블 · 네거티브 (10개 파일에 토씨 하나 안 바꾸고 들어간다)

> `assets.md` 원칙: **모든 프롬프트 = preamble + 빈 줄 + scene.** preamble은 매번 verbatim.
> 따로 생성한 스틸 10장을 "한 번의 촬영"처럼 보이게 만드는 **유일한** 장치다.
> 한 글자라도 바꾸면 그 leg만 다른 촬영으로 읽히고, 씸에서 재질이 튄다.

기본 킷 #2 High-key editorial 를 우리 흰 아틀라스 + ORRERY 재질어로 합성한 것이다.
(`worlds.md` #2 원문: *"Editorial still-life photography on a seamless bone-white cyclorama.
Large soft overhead source, huge white bounce, near-shadowless with one soft contact shadow.
High key, gentle contrast, colour grade of warm white and pale neutrals. Medium-format sharpness,
fine grain. Photographic realism, no CGI."*)

---

## PREAMBLE (verbatim)

```
Macro tilt-shift photograph of a handmade physical scale model, shot on a medium-format camera with a tilt-shift lens. Milled brass, painted plaster, real moss, poured resin, sifted sand, laser-cut acrylic, fibre-optic practicals. High-key lighting: one large soft overhead source, a huge white bounce, near-shadowless with a single soft contact shadow. Seamless bone-white ground. Colour grade of warm white, pale neutrals and slate grey, with accents of LX blue #4E86F7, warm amber #FF9A2E and field green #1E9E6A only. Medium-format sharpness, fine grain, true whites, no crushed blacks. Photographic realism. NOT a 3D render, NOT clay, NOT an illustration, NOT CGI, no digital glow, no plastic sheen, no purple, no magenta, no neon, no text, no lettering, no numbers, no watermark.
```

## NEGATIVE (verbatim, kling `negative_prompt`)

```
text, letters, numbers, captions, subtitles, watermark, logo, signature, cut, jump cut, dissolve, camera shake, handheld wobble, zoom snap, speed ramp, people entering frame, vehicles entering frame, birds entering frame, anything entering or leaving frame, purple, magenta, neon, plastic sheen, glossy toy plastic, CGI, 3d render, clay, cartoon, illustration, dark shadows, crushed blacks, lens flare
```

---

## 스크럽 클립 4대 철칙 (`assets.md` — 모션 프롬프트를 쓸 때마다 다시 읽을 것)

1. **한 방향의 연속 이동 하나만.** 컷·스냅·방향 전환은 휠 아래에서 충격이 된다.
2. **미리보기에서 "느리다" 싶을 만큼 느리게.** 2~3 뷰포트 높이에 걸쳐 펼쳐진다.
3. **피사체가 처음부터 끝까지 프레임 안에.** 독자가 아무 데나 주차할 수 있다.
4. **아무것도 들어오거나 나가지 않는다.** 사람이 걸어 들어오면 1프레임과 120프레임이 서로 다른 샷이 되고 포스터가 둘 다와 안 맞는다.

## 공통 파라미터

| 항목 | 값 |
|---|---|
| 스틸 | `seedream/5-pro-image-to-image` (ref 있음) / `-text-to-image` (없음) |
| `--ar` | `16:9` → 2736×1520. **`4:5`는 거부된다** |
| 필수 파라미터 | `aspect_ratio` · `quality` · `output_format` **3개 전부** |
| 클립 | `kling/v2-1-pro`, `{"duration":"5"}` |
| 씸 | leg N+1 시작 이미지 = leg N **인코딩된** mp4 마지막 프레임 (`-sseof -0.15`) |
| 크레딧 | 스틸 14 / 5초 클립 50 (kie.ai Logs 실측) |

## CLI 템플릿

```bash
node <skill>/scripts/kie.mjs still "<PREAMBLE>\n\n<SCENE>" anchors/aNN.png --ar 16:9 --ref <REF>
node <skill>/scripts/kie.mjs shot  "<MOVE>" anchors/aNN.png out/legNN.mp4 --dur 5 --tail anchors/aNN+1.png
bash  <skill>/scripts/encode.sh out/legNN.mp4 assets/legNN.mp4
bash  <skill>/scripts/encode.sh out/legNN.mp4 assets/legNN-m.mp4 mobile
ffmpeg -sseof -0.15 -i assets/legNN.mp4 -frames:v 1 -q:v 2 anchors/aNN+1.png
ffmpeg -i assets/legNN.mp4 -frames:v 1 -q:v 3 assets/pNN.webp
```
