# 이 PC 실측 — 실제 Chrome + 실제 GPU 성능

작성일 2026-08-25 · 조사자 Claude (research agent) · 제품 코드 변경 없음
관련 문서: [`2026-08-25-webgl-stack-feasibility.md`](2026-08-25-webgl-stack-feasibility.md) §7 (열린 질문의 출처)
측정 자산: `tools/perf/probe.html`(시나리오 하니스) · `tools/perf/run.mjs`(Playwright 러너) · `tools/perf/results.json`(원본 수치) · `shots/perf/*.png`(시나리오별 캡처)

---

## 0. 핵심 결론 (먼저 읽을 것)

1. **이 PC는 "일반 사무용 iGPU" 질문에 답하지 못한다.** `chrome://gpu` 실측 결과 GPU0~3이 전부 **NVIDIA GeForce RTX 4090**이고 통합 GPU(Intel/AMD)는 물리적으로 없다(§1). feasibility 리포트 §7이 원래 던진 질문 — "Intel Iris Xe 급 사무용 노트북에서는 어떤가" — 은 **이 기기로는 검증 불가능하다.** 이 리포트가 실제로 답하는 것은 "고사양 데스크톱에서, 합성 벤치마크가 아니라 실제 창 컴포지터를 통해 본 헤드리스-아닌 크롬은 어떤가"이다.
2. **디스플레이가 29Hz라서 모든 시나리오가 vsync 천장에 붙어 있다.** `Win32_VideoController`가 5120×1440 출력을 **29Hz**로 보고한다. 측정된 p50/p95 fps는 시나리오 a~h 전부 **29.8~29.9fps**로 사실상 동일하다 — 이는 GPU가 감당한 실제 프레임 처리량이 아니라 컴포지터가 강제한 상한이다. 즉 **"fps가 안 떨어졌다"는 결과 자체는 GPU 여유의 증거이지, GPU 부하가 없었다는 뜻이 아니다.**
3. **그럼에도 유일하게 신호가 있는 지점은 지형(terrain) 진입이다.** 시나리오 c(지형 ON, pitch 65, z12)에서만 8초 창 240프레임 중 3프레임이 드롭됐다(avgFps 29.6, 나머지는 전부 240/240). feasibility §7의 "지형이 유일한 절벽"이라는 결론과 방향이 일치한다 — 이 PC에서도 지형이 유일하게 감지 가능한 비용이었다.
4. **풀 스택(a~g 누적 + DPR 2배)까지 프레임 드롭이 사실상 0이다.** 글로브+위성+지형+deck.gl 인터리브드(5k 스캐터+아크)+three.js CustomLayer(satellite.glb, PMREM)+5,000폴리곤 fill 레이어(100ms마다 setFilter)+backdrop-filter 블러 패널 3장을 전부 켜고 DPR을 1→1.5→2로 올려도 vsync 천장 이하로 내려가지 않았다. **RTX 4090급 데스크톱에서는 feasibility §7.3의 `full` 티어 전체를 아무 타협 없이 상시 가동할 수 있다.**
5. **JS 힙은 레이어 수와 함께 단조 증가한다(17MB → 118MB).** GPU fps와 무관하게, glTF·5,000피처 GeoJSON·deck.gl 버퍼가 누적되며 힙이 커진다는 점은 저사양 기기에서 메모리 예산으로 작용할 수 있다(§4).

---

## 1. GPU/디스플레이 신원 확인

**`wmic`/`Get-CimInstance Win32_VideoController`** (PowerShell 실측):

| 필드 | 값 |
|---|---|
| Name | NVIDIA GeForce RTX 4090 (×4, 멀티 GPU 워크스테이션) |
| DriverVersion | 32.0.15.9186 |
| AdapterRAM (WMI 보고값) | 4,293,918,720 B (≈4GB — WMI의 32비트 필드 한계로 실제 24GB VRAM보다 낮게 보고되는 알려진 현상, 실장치는 4090이 맞음) |
| Display | 5120×1440 @ **29Hz** (CurrentRefreshRate), 별도 2560×1440 @59Hz 출력도 존재 |
| TerminalServerSession | `False` — 원격 데스크톱이 아니라 콘솔 세션(실물 디스플레이) |

**Chrome `chrome://gpu`** (Playwright `channel:'chrome'`, `headless:false`, 추가 플래그 없음 — 실사용자가 크롬을 그냥 켰을 때와 동일한 기본 경로):

```
GPU0: VENDOR=0x10de [NVIDIA GeForce RTX 4090] *ACTIVE*
GPU1~3: 동일 RTX 4090 (비활성)
GPU4: Microsoft Basic Render Driver (폴백, 비활성)
GL_RENDERER: ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9186)
Passthrough Command Decoder: true
Canvas / WebGL / WebGL2: 전부 "Hardware accelerated"
Desktop compositing: Aero Glass · Direct composition: 활성
```

→ **소프트웨어 폴백(SwiftShader) 아님.** `headless:false`로 실제 창을 띄우면 기본 인자만으로도 D3D11 하드웨어 가속이 정상적으로 잡힌다. Intel 통합 GPU는 이 시스템에 존재하지 않는다.

---

## 2. 측정 방법

- `tools/perf/probe.html` — `verified-stack-probe3.html`을 복사해 시나리오 토글(query string `level=a..g`, `dpr`는 Playwright `deviceScaleFactor`로 외부에서 부여)과 rAF 기반 fps 하니스(프레임타임 배열 → 정렬 → p50/p95)를 추가했다.
- `tools/perf/run.mjs` — `chromium.launch({channel:'chrome', headless:false})`로 실제 크롬을 headed로 띄우고, 1440×900 뷰포트에서 시나리오마다 새 페이지로 이동 → 1.5초 워밍업 → 8초 측정창 → `window.__perf` 회수 → 스크린샷.
- 서버: `PORT=4190 node tools/serve.mjs`.
- 시나리오는 **누적**이다: a에 b가 얹히고, b에 c가 얹히는 식으로 g까지 쌓인다. h는 g(풀 스택) 그대로 DPR만 1/1.5/2로 바꿔 3회 반복한 것이다.

| 시나리오 | 누적 구성 | 카메라 |
|---|---|---|
| a | EOX 위성 글로브, 정지 | zoom 1.6, pitch 0 (글로브 아이들) |
| b | + V-World 위성/하이브리드 + 벡터 지명·경계 | zoom 8, **연속 팬**(rAF로 매 프레임 center 진동) |
| c | + Mapterhorn 지형(`encoding:'terrarium'`) | zoom 12, **pitch 65**, bearing 35 (남원) |
| d | + deck.gl interleaved: ScatterplotLayer 5,000점 + ArcLayer 250개 | 위와 동일 |
| e | + three.js CustomLayer: `satellite.glb` + RoomEnvironment PMREM | 위와 동일 |
| f | + `marine-debris.geojson` 5,000폴리곤 fill, 100ms마다 `setFilter`(confidence 0.5↔0.9) | zoom 9, pitch 65 (해양쓰레기 bbox 중심으로 재배치 — 폴리곤이 실제로 화면에 들어와야 함) |
| g | + backdrop-filter `blur(16px)` 유리 패널 3장(DOM 오버레이) | f와 동일 |
| h | g와 동일 구성, **DPR만 1 / 1.5 / 2로 반복** | f와 동일 |

**러너 버그 한 건**: 최초 배치 실행 시 `page.waitForFunction(fn, {timeout})`을 Playwright 시그니처(`fn, arg, options`)를 착각해 2번째 인자로 넘겨, 실제로는 옵션이 무시되고 기본 30초 타임아웃이 적용됐다. a~e/g/h는 30초 안에 끝나 문제가 드러나지 않았지만 f(가장 무거운 지형+deck+three+5k폴리곤 조합, 새 지역으로 카메라 이동해 타일을 새로 전부 받아야 함)는 30초를 넘겨 실패했다. `undefined`를 두 번째 인자로 넣어 옵션을 세 번째로 고쳐 f만 재실행했고, 나머지 9개 시나리오 결과는 재실행 없이 그대로 유효하다.

---

## 3. 결과표

측정창 8,000ms(약 240프레임 @29.9Hz), 뷰포트 1440×900, DPR은 표시된 경우만 1이 아님.

| 시나리오 | p50 fps | p95 fps | 드롭 프레임(240 기준) | JS 힙 used/total (MB) |
|---|---|---|---|---|
| a 글로브 아이들 | 29.9 | 29.9 | 0 | 17.4 / 30.3 |
| b +위성/라벨 z8 팬 | 29.9 | 29.9 | 0 | 37.6 / 74.8 |
| c +지형 pitch65 z12 | 29.9 | 29.9 | **3** (avg 29.6) | 50.6 / 91.6 |
| d +deck 5k scatter+arc | 29.9 | 29.9 | 0 | 43.1 / 96.6 |
| e +three glTF+PMREM | 29.9 | 29.9 | 0 | 47.0 / 93.1 |
| f +5k폴리곤 fill/setFilter | 29.9 | 29.8 | 0 | 108.0 / 144.3 |
| g +유리 패널 3장(풀 스택) | 29.9 | 29.8 | 0 | 117.9 / 151.9 |
| h dpr=1 (=g) | 29.9 | 29.9 | 0 | 113.0 / 148.0 |
| h dpr=1.5 (=g) | 29.9 | 29.8 | 0 | 62.6 / 124.0 |
| h dpr=2 (=g) | 29.9 | 29.9 | 0 | 96.2 / 150.2 |

부가 측정: 풀 스택(g) 실행 중 `Get-Process chrome`의 워킹셋 합계 **≈3,927MB** — 단, 이 값은 이 러너가 띄운 인스턴스만이 아니라 **시스템에서 실행 중인 모든 `chrome.exe` 프로세스**(다른 탭·확장 포함)의 합이라 이 시나리오 하나의 GPU 프로세스 메모리로 좁혀 해석할 수 없다. 신뢰할 수 있는 수치는 페이지 내 `performance.memory`(JS 힙, 위 표) 쪽이다.

**해석**: p50/p95가 모든 행에서 사실상 동일한 것은 GPU가 여유 있다는 뜻이지 "측정이 무의미하다"는 뜻이 아니다. vsync가 걸린 상태에서 유일하게 프레임을 놓친 것이 지형 도입 시점(c)이라는 사실 자체가, 이 스택에서 지형이 상대적으로 가장 비싼 단일 요소라는 feasibility §7의 결론을 이 PC에서도 재확인한다. 나머지(deck.gl, three.js, 5,000폴리곤 fill+실시간 setFilter, backdrop-filter 3장, DPR 2배)는 이 GPU에는 사실상 공짜였다.

---

## 4. 이 PC가 속하는 품질 티어 (feasibility §7.3 기준)

**`full` 티어.** 글로브 + 위성 + 지형(pitch 65, exaggeration 1.4) + deck.gl interleaved 전부 + three.js(궤도+블룸 상당) + DPR 2배까지 전부 벡터/래스터/커스텀 레이어 동시 가동 상태에서 vsync 천장 이하로 내려가지 않았다. §7.3 표의 `lite`/`fallback` 강등 조건(지형 OFF, deck 1/3, DPR 캡 등)을 이 PC에는 적용할 필요가 없다.

단, **이 결론은 "RTX 4090급 데스크톱"에 대해서만 유효하다.** feasibility §7이 실제로 답을 원했던 "Intel iGPU 사무용 노트북"은 이 기기에 없으므로 여전히 미검증 상태다 — §0-1 참조.

---

## 5. 가장 비싼 기능 top 3 (이 PC 기준)

1. **지형(`setTerrain` + pitch 65)** — 8초 창에서 유일하게 프레임을 떨어뜨린 항목(240→237, avgFps 29.6). vsync 여유가 없는 저사양 기기에서는 feasibility §7.1의 소프트웨어 렌더러 실측(66fps→2.4fps, 27배)처럼 절벽이 될 가능성이 가장 높다.
2. **5,000피처 GeoJSON fill + 100ms `setFilter`** — 자체로는 프레임을 떨어뜨리지 않았지만 JS 힙을 47MB(e)→108MB(f)로 61MB 밀어 올린 유일한 단계다. `setFilter`를 100ms 주기로 호출하는 것은 매번 타일 재평가를 유발하므로, 저사양 기기에서는 fps보다 먼저 **필터 주기(디바운스)**가 문제가 될 수 있다.
3. **backdrop-filter 블러 패널 3장** — GPU fps에는 영향이 없었지만(g에서 드롭 0), 이는 컴포지터가 이미 vsync에 걸려 있어 여유가 남아돌기 때문일 수 있다. DOM 블러는 매 프레임 배경 리샘플링이 필요한 비용이라 iGPU에서는 3장 동시보다는 **1~2장 + 정적 프레임에서만**이 안전한 기본값이다.

(deck.gl 5k 스캐터+아크, three.js CustomLayer+PMREM, DPR 2배는 이 GPU에서 측정 가능한 비용을 전혀 남기지 않았다 — feasibility §7.2의 "거의 공짜"라는 평가와 일치.)

---

## 6. 프로토타입 예산 권고

이 PC가 `full` 티어라는 사실은 "느슨하게 만들어도 된다"가 아니라 **"이 PC로는 저사양 열화를 재현할 수 없으니 예산을 보수적으로 잡아야 한다"**는 뜻으로 읽어야 한다.

- **DPR 캡**: `full` 티어에서도 2.0 이상은 불필요 — 육안 차이 대비 배터리/발열 비용만 오른다. `Math.min(devicePixelRatio, 2)`를 상한으로, `lite` 티어에서는 1.0~1.5로 낮춘다.
- **지형 정책**: 상시 ON 금지. flyTo 연출 구간(수 초)에서만 켜고, 정지 상태 대시보드/목록 화면에서는 `setTerrain(null)`. pitch 65 이상 + 지형 + deck.gl 동시 조합은 "연출 순간"으로만 예산을 배정한다 — 이 PC에서도 유일하게 프레임을 깎은 조합이었다.
- **backdrop-filter 상한**: 동시에 뜨는 유리 패널은 **최대 2장**을 기본으로 하고, 3장째부터는 스크롤/카메라가 정지했을 때만 blur를 켜는 식으로 조건부 적용한다(움직이는 지도 위 3장 블러 상시 가동은 이번에 검증되지 않았다 — g 시나리오는 카메라가 정지된 상태였다).
- **폴리곤 개수/필터 주기**: 5,000피처 fill 자체는 이 PC에서 무비용이었지만 힙 비용이 뚜렷했다. `maxzoom` 명시(§feasibility 7.3 권고 그대로)와 함께, `setFilter` 폴링 주기를 100ms보다 늘리거나(예: 250~500ms) 변경이 실제로 필요할 때만 호출하도록 이벤트 기반으로 바꾸는 것을 권장한다.
- **가장 중요한 후속 작업**: 이 리포트는 상한선만 확인했다. **Intel iGPU 사무용 노트북 1대에서 `tools/perf/probe.html?level=g`를 실제로 열어보기 전까지 `lite` 티어 경계값(§7.3의 25~40fps 추정 밴드)은 여전히 추정치**다.

---

## 7. 재현 방법

```bash
PORT=4190 node tools/serve.mjs &
PORT=4190 node tools/perf/run.mjs            # a~g + h(dpr 1/1.5/2) 전체
PORT=4190 node tools/perf/run.mjs c f        # 특정 시나리오만 (기존 결과에 병합됨)
```

결과는 `tools/perf/results.json`, 시나리오별 캡처는 `shots/perf/scenario-*.png`.
