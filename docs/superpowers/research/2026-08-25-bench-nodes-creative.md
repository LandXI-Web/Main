# 노드 캔버스 · 크리에이티브 AI 툴 심층 벤치마크 — "업무 시스템"에서 탈출하기 위한 문법 추출

작성일: 2026-08-25
축(axis): **혁신적으로 느껴지는 노드 캔버스와 크리에이티브/AI 도구**
전제: 발주처가 Roboflow식 워크플로우 캔버스 시안을 보고 **"너무 업무 시스템, 우와/혁신이 없다 — 2%"** 로 평가했다.
수집: Playwright(headed, Chrome 채널, 1200×780, JPEG q75) 92장 → `shots/bench/nodes/`
대상 레퍼런스: 51개 제품/문서, 이미지 92장

---

## 0. 결론을 먼저 — 왜 우리 캔버스는 2%였나

92장을 펼쳐놓고 나면 결론이 잔인할 만큼 단순하다.
**"살아있다"고 느껴지는 노드 캔버스와 "업무 시스템"으로 읽히는 노드 캔버스를 가르는 것은 애니메이션의 양이 아니라 노드 안에 무엇이 들어있느냐다.**

- 죽은 캔버스의 노드 안에는 **이름과 파라미터 텍스트**가 들어있다. (Zapier Canvas, Whimsical, 우리 1차 시안)
- 살아있는 캔버스의 노드 안에는 **그 노드가 방금 만들어낸 그림**이 들어있다. (Figma Weave, Freepik Spaces, Flora, ComfyUI, Nuke, TouchDesigner, Substance Designer)

Figma Weave(구 Weavy) 히어로(`shots/bench/nodes/weavy-1.jpg`)를 보면 이 차이가 극단적으로 드러난다. 화면에 노드 "카드"라고 부를 만한 상자가 **아예 없다.** 있는 것은 (a) 생성된 이미지 자체, (b) 이미지 위쪽에 8pt 대문자로 붙은 두 단어짜리 캡션 — `3D  RODIN 2.0`, `IMAGE  STABLE DIFFUSION`, `TEXT`, `VIDEO  MINIMAX VIDEO` —, (c) 이미지 좌우 가장자리에 박힌 지름 8px 남짓의 포트 점, (d) 그 점들을 잇는 1px 회색 베지어뿐이다. **노드 크롬을 캡션으로 축소하고, 남은 면적 100%를 결과 이미지에게 준 것**이 이 화면이 "혁신"으로 읽히는 유일한 이유다.

반대로 우리가 벤치마크했던 Roboflow Workflows(`roboflow-wf-1.jpg`, `roboflow-wf-2.jpg`)는 노드가 정직한 **흰 카드 + 아이콘 + 라벨 + 파라미터 요약**이다. 기능적으로 훌륭하고, 실제로 그 안에 결과 이미지를 넣는 장치도 갖고 있지만, **첫 화면의 지배적 인상은 "카드가 늘어선 다이어그램"** 이다. 발주처가 "업무 시스템"이라고 말한 대상이 정확히 이 인상이다. 우리는 그 인상을 그대로 복제했다.

그리고 두 번째 축이 있다. **Rerun.io**(`rerun-4.jpg`, `rerun-5.jpg` — 실제 웹 뷰어를 라이브로 띄워 캡처)는 노드 캔버스가 아예 아닌데도 "이건 진짜 도구다"라는 인상이 압도적이다. 이유는 **시간**이다. 화면 하단 전체를 가로지르는 타임라인이 있고, 스크러버를 끌면 3D 포인트클라우드·6개 카메라 이미지·2D 세그멘테이션·로그 테이블이 **동시에 같은 프레임으로** 움직인다. 우리 파이프라인(영상 → 타일 분할 → 모델 → 탐지 → 후처리 → 지도)은 본질적으로 **시간축을 가진 데이터**인데, 우리는 그것을 시간 없는 정적 다이어그램으로 그렸다.

이 리포트의 처방은 두 줄로 요약된다.
1. **노드를 카드에서 "액자"로 바꿔라.** 노드 = 정사영상 타일/탐지 오버레이/변화탐지 diff의 실제 픽셀. 텍스트는 캡션으로 강등.
2. **캔버스에 시간과 공간을 도입하라.** 하단 타임라인(4시점 남원 정사영상) + 지도 자체가 캔버스 바탕. 다이어그램이 아니라 **관측기(observability tool)** 로 보이게.

---

## 1. 레퍼런스 해부

각 항목: URL / 이미지 / **살아있게 만드는 것** / **그냥 SaaS 껍데기인 것**

### 1.1 노드 캔버스 원형 (DCC · 자동화)

**① ComfyUI (+ 새 프론트엔드, 서브그래프, 템플릿 라이브러리)**
- https://www.comfy.org/ , https://blog.comfy.org/p/comfyui-035-frontend-updates , https://blog.comfy.org/p/comfyui-0366-updates , https://docs.comfy.org/interface/canvas , https://docs.comfy.org/interface/features/template
- `comfyui-1.jpg` `comfyui-2.jpg` `comfyui-3.jpg` `comfyui-4.jpg` `comfyui-5.jpg` `comfyui-6.jpg`
- **살아있는 것**: (a) 노드가 실행 중일 때 **테두리가 초록으로 점등되고 진행 막대가 노드 자체에 붙는다** — 실행 상태가 사이드 패널이 아니라 그래프 위에 있다. (b) Preview/Save Image 노드는 **결과 이미지를 노드 몸통에 그대로 렌더**하며, 노드 리사이즈에 따라 이미지도 커진다. 즉 "노드=액자". (c) 0.3.51에서 들어온 **Subgraph** — 여러 노드를 하나로 접고 다시 펼치는 것 — 은 공간적 줌 시맨틱을 그래프에 도입한 것이다. 0.3.66의 **Subgraph Parameter Panel**은 접힌 서브그래프의 위젯만 바깥으로 끌어올린다(`comfyui-3.jpg`에 실제로 찍혔다: `Qwen Text-to-image (Subgraph)` 노드 하나에 unet_name / clip_name / width / height / batch_size / seed / steps가 위젯 행으로 늘어서고 그 아래 프롬프트 텍스트영역이 통째로 들어있다). (d) 위젯 행 좌우의 **◀ ▶ 화살표** — 값 증감을 위젯 안에서 처리해 팝업이 없다. (e) 0.3.51의 **Mini Map**과 새 Manager UI. (f) 링크는 색으로 **타입**을 말한다(MODEL/CLIP/VAE/IMAGE/LATENT가 각각 다른 색), 링크 중간의 **점(reroute dot)** 이 데이터 흐름의 방향 감각을 준다. (g) 선택 시 노드 위로 떠오르는 **플로팅 툴박스**(삭제·정보·색상·확대·서브그래프 위젯 편집·도움말·바이패스·더보기) — 속성 패널로 시선을 빼앗지 않는다.
- **SaaS 껍데기**: comfy.org 마케팅 사이트 자체는 평범한 다크 랜딩(`comfyui-1.jpg`). 실제 매력은 전부 제품 안에 있고 웹사이트는 그것을 거의 전달하지 못한다. 우리가 배울 점: **랜딩에 제품 캔버스를 실물로 심어야 한다.**

**② n8n**
- https://n8n.io/ , https://n8n.io/workflows/ , https://docs.n8n.io/courses/level-one/chapter-2/
- `n8n-1.jpg`(히어로가 무거운 인터랙티브 캔버스라 캡처 시점에 아직 렌더 전 — 그 자체가 증거다) `n8n-2.jpg` `n8n-3.jpg`
- **살아있는 것**: 실행 시 **엣지를 따라 데이터가 흐르는 애니메이션**과 각 노드에 붙는 **"N items" 배지**. 실행 후 노드를 클릭하면 좌=입력 JSON / 우=출력 JSON의 **양단 비교 뷰**가 열린다. 오류 노드는 빨간 삼각형 + 재시도. 커뮤니티 워크플로우 갤러리(`n8n-2.jpg`)는 **그래프 썸네일 자체가 카드 이미지**다 — 텍스트 목록이 아니라 그래프 미리보기가 카탈로그의 단위.
- **SaaS 껍데기**: 노드 카드가 결국 아이콘+이름 상자다. 색이 브랜드 오렌지에 몰려 있어 그래프가 커지면 단조롭다.

**③ Blender Geometry Nodes** — https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/introduction.html , https://www.blender.org/features/modeling/ · `blender-geonodes-1.jpg` `blender-geonodes-2.jpg`
- **살아있는 것**: **소켓 색이 곧 타입 언어**(기하=초록, 벡터=보라, 정수=연두, 실수=회색, 문자열=하늘). 소켓 **모양**도 구분한다(필드=다이아몬드, 단일값=원). 즉 **연결 가능성이 보기만 해도 읽힌다.** 그리고 결정적으로 **뷰포트가 곧 프리뷰** — 노드를 건드리면 옆 3D 뷰가 즉시 바뀐다(그래프와 결과가 같은 창에 공존).
- **SaaS 껍데기**: 없음. 다만 온보딩 부재 — 초심자에게 무자비하다.

**④ Houdini** — https://www.sidefx.com/products/houdini/ , https://www.sidefx.com/docs/houdini/nodes/index.html · `houdini-1.jpg` `houdini-2.jpg`
- **살아있는 것**: **디스플레이/렌더 플래그** — 노드 우측의 작은 점 하나로 "지금 뷰포트가 보고 있는 지점"을 그래프 위에 표시한다. 파이프라인 어디를 들여다보고 있는지가 그래프에 상주한다. **Network Box**로 노드 그룹을 색 있는 영역으로 묶고 라벨링. 노드 상단의 **진행 바 + 캐시 상태**. 우리가 훔칠 것: **"현재 지도가 보고 있는 단계"를 그래프 위 플래그로 표시.**
- **SaaS 껍데기**: 사이트는 전형적인 제품 소개 + 갤러리.

**⑤ Nuke (Foundry)** — https://www.foundry.com/products/nuke-family/nuke · `nuke-1.jpg`
- **살아있는 것**: 노드 트리가 **아래로 흐르는 수직 그래프**이고, 노드에 마우스를 올리면 **썸네일 팝업**. Viewer 노드를 다른 지점에 물리면 그 지점의 중간 결과가 즉시 뷰어에 뜬다. **A/B 비교 와이프**가 뷰어에 내장. 우리 변화탐지(4시점)와 1:1로 맞는 문법이다.
- **SaaS 껍데기**: 마케팅 페이지의 로고 그리드/케이스스터디.

**⑥ TouchDesigner** — https://derivative.ca/ , https://derivative.ca/UserGuide/Network_Editor · `touchdesigner-1.jpg` `touchdesigner-2.jpg`
- **살아있는 것**: **모든 오퍼레이터(노드)가 자기 출력의 실시간 썸네일을 몸통에 렌더**한다. 60fps로. 캔버스를 줌아웃하면 수십 개의 작은 라이브 화면이 동시에 뛰는 광경이 나오는데, 이것이 "혁신"의 시각적 정의에 가장 가깝다. 노드 패밀리별 색(TOP=보라, CHOP=초록, SOP=파랑, DAT=노랑)으로 **거리에서도 그래프의 종류가 읽힌다.** 히어로(`touchdesigner-1.jpg`)의 광섬유 같은 라이트페인팅 이미지는 "이 도구로 만드는 것"을 첫 화면에 던진다.
- **SaaS 껍데기**: 사이트 타이포(넓은 자간 대문자)는 멋있지만 정보 밀도가 낮고, 캐러셀이 제품을 설명하지 못한다.

**⑦ Substance 3D Designer** — https://www.adobe.com/products/substance3d/apps/designer.html · `substance-designer-1.jpg`
- **살아있는 것**: **노드 = 텍스처 썸네일**. 그래프 전체가 재료의 진화 과정을 보여주는 필름스트립처럼 읽힌다. 3D 뷰와 2D 그래프가 나란히 놓여, 파라미터를 만지면 재질이 즉시 바뀐다.
- **SaaS 껍데기**: Adobe 공통 템플릿(가격 카드, 탭, 플랜 비교).

**⑧ Unreal Engine Blueprints / ⑨ Niagara** — https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprints-visual-scripting-in-unreal-engine , https://www.unrealengine.com/en-US/blog/introducing-unreal-engine-5-6 · `unreal-blueprint-1.jpg` (Niagara 문서 페이지는 봇 차단으로 수집 실패)
- **살아있는 것**: 플레이 중 **실행 와이어를 따라 흐르는 주황색 펄스**. 이것이 "물리적 엣지"의 가장 대중적인 원형이다 — 엣지가 장식이 아니라 **실행 포인터의 궤적**. 변수 핀 색으로 타입(bool=빨강, float=초록, object=파랑)을 구분. Niagara는 **모듈 스택(수직 리스트)** 과 **그래프**를 층위로 나눠 "초보=스택, 고급=그래프" 두 난이도를 같은 데이터에 제공한다. 우리 워크플로우도 **스택 모드 / 그래프 모드 토글**을 가질 수 있다.
- **SaaS 껍데기**: 문서 사이트의 무거운 좌측 트리와 배너.

**⑩ Unity Shader Graph / ⑪ VFX Graph** — https://unity.com/features/shader-graph , https://unity.com/features/visual-effect-graph · `unity-shadergraph-1.jpg` `unity-vfxgraph-1.jpg`
- **살아있는 것**: **노드마다 붙는 소형 실시간 프리뷰 구(sphere)** — 셰이더의 중간 단계가 각 노드에서 즉시 보인다. Main Preview 창은 드래그로 회전 가능. VFX Graph는 **Context 블록(수직 스택)** 안에 **Block(작은 행)** 이 쌓이는 2계층 구조로 순수 노드 스프롤을 막는다.
- **SaaS 껍데기**: Unity 사이트의 카드 그리드와 에디션 비교표.

**⑫ Grasshopper (Rhino)** — https://www.grasshopper3d.com/ , https://www.rhino3d.com/features/ · `grasshopper-1.jpg` `rhino-1.jpg`
- **살아있는 것**: **캔버스가 결과를 갖지 않는다 — 결과는 Rhino 뷰포트에 실시간 미리보기로 뜬다.** 슬라이더 컴포넌트를 드래그하면 형상이 애니메이션처럼 변형되는 이 순간이 Grasshopper의 "우와" 지점. 오류/경고 컴포넌트가 **주황/빨강으로 물든다**(상태가 색으로 그래프에 남는다).
- **SaaS 껍데기**: 커뮤니티 사이트(`grasshopper-1.jpg`)는 2010년대 포럼 그대로 — 내용은 풍부하나 디자인 참고 가치는 낮다.

**⑬ Dynamo (BIM)** — https://dynamobim.org/ · `dynamo-1.jpg`
- **살아있는 것**: Revit/Civil3D와 물린 **라이브 지오메트리 프리뷰**, 노드 상태 색(회색=비실행, 파랑=실행됨, 노랑=경고). "노드로 국토·건설 데이터를 다룬다"는 개념의 선례로서 **발주처 설득용 근거**가 된다.
- **SaaS 껍데기**: 오픈소스 커뮤니티 사이트 톤.

### 1.2 AI 크리에이티브 캔버스 — 여기서 훔칠 것이 가장 많다

**⑭ Figma Weave (구 Weavy)** — https://weavy.ai/ (→ weave.figma.com) · `weavy-1.jpg` `weavy-2.jpg`
- **살아있는 것**: 0장에서 설명한 "액자화"에 더해, (a) 배경이 **밝은 흰색 + 아주 옅은 격자**다. "노드 캔버스=검정"이라는 통념을 깨는데, 이게 오히려 **결과 이미지를 화면의 유일한 색 요소로 만든다.** 우리 프로젝트의 "밝은 지도 바탕 + 유리 패널" 방향과 정확히 일치한다. (b) 캡션 조판이 **타입(작고 진한) + 모델명(작고 연한)** 2단이다. 모델 이름을 노출하는 것만으로 "이 시스템은 여러 엔진을 조합한다"는 인상이 생긴다 — 우리는 `DETECT / LX-YOLO v3`, `SEGMENT / SAM-Geo`, `CHANGE / SiamDiff` 로 그대로 이식 가능하다. (c) 헤드라인이 초대형 그로테스크 2줄이고, 그 아래 캔버스가 화면 밖으로 흘러나간다(잘림 = 무한 캔버스의 암시).
- **SaaS 껍데기**: 상단 공지 바, 노란 CTA 블록, 표준 내비게이션.

**⑮ Flora (florafauna.ai)** — https://www.florafauna.ai/ · `flora-1.jpg` `flora-2.jpg`
- **살아있는 것**: 히어로가 **검은 도트 그리드 위에 생성 이미지들이 자유롭게 떠 있는** 구성. 이미지들이 뷰포트 가장자리에서 잘려나가며 "캔버스는 계속된다"를 말한다. 세리프 이탤릭 강조("Your *creative* workspace")로 업무툴 냄새를 지운다 — **서체 하나로 카테고리를 바꾼 사례.**
- **SaaS 껍데기**: 고객 로고 그리드(Pentagram, Riot Games, WPP, Wayfair, Niantic) — 다만 신뢰 장치로는 유효하며, 우리도 "국토정보공사 · 남원시 · 산림청" 식으로 쓸 수 있다.

**⑯ Freepik Spaces / Magnific** — https://www.freepik.com/ai/spaces · `freepik-spaces-1.jpg` `freepik-spaces-2.jpg`
- **살아있는 것**: **멀티플레이어 커서**의 교과서. 히어로 배경 캔버스 위에 `Jeremy`(보라), `Edward`(파랑) 커서가 이름표 pill을 달고 실제로 떠다닌다. 엣지는 **채도 높은 보라·초록 곡선**이고, 엣지 끝점에 **작은 원형 아이콘 배지**(이미지 아이콘, 프레임 아이콘)가 붙어 "무엇이 무엇으로 들어가는지"를 아이콘 한 글자로 말한다. 카피가 정확하다: *"Your infinite canvas for real-time collaborative creation, with AI workflows that expand and speed your work."*
- **SaaS 껍데기**: 쿠키 배너와 언어 전환 토스트가 히어로를 덮어 첫인상을 훼손한다(`freepik-spaces-1.jpg`에 그대로 찍혔다) — 반면교사.

**⑰ Krea.ai** — https://www.krea.ai/ , /features/realtime , /apps/image/realtime · `krea-1.jpg` `krea-2.jpg` `krea-3.jpg`
- **살아있는 것**: **Realtime 캔버스** — 왼쪽에서 마우스로 도형을 그리는 동안 오른쪽 이미지가 **키 입력 지연 수준으로** 재생성된다. "생성 = 버튼 → 대기 → 결과"라는 3단 리듬을 없앤 것이 Krea의 유일하고 결정적인 혁신이다. 우리 대응물: **컨피던스 슬라이더를 끄는 동안 지도 위 탐지 결과가 프레임 단위로 재렌더.**
- **SaaS 껍데기**: 히어로(`krea-1.jpg`)는 검정 배경 + 초대형 산세리프 1문장 + 버튼 2개뿐이다. 절제로 보이지만 실은 **첫 화면에 제품을 안 보여주는 손실**이다.

**⑱ Scenario** — https://www.scenario.com/ · `scenario-1.jpg` · **살아있는 것**: 노드형 워크플로우와 스타일 학습을 결합하고, 화면을 게임 에셋 결과물로 채운다. **껍데기**: 표준 SaaS 섹션의 반복.

**⑲ Kling AI (+ Kling Canvas)** — https://klingai.com/global/ , https://app.klingai.com/global/ · `kling-1.jpg` `kling-2.jpg`
- **살아있는 것**: 로그인 전 앱 화면(`kling-2.jpg`)이 **좌측 아이콘 레일(Explore / Assets / Omni / Generate / Canvas / All Tools) + 결과물 마소닉 그리드**다. 즉 **앱의 첫 화면이 곧 갤러리**이며, 모든 카드가 움직이는 영상 썸네일이고 각 카드에 작성자·좋아요 수가 붙는다. "Kling Canvas"에 `Agent` 배지가 달려 있는 것도 눈에 띈다 — 기능에 상태 배지를 다는 사소한 장치가 "지금 진화 중인 제품"이라는 인상을 만든다.
- **SaaS 껍데기**: 가격 배지(`Plans from $6.99`)가 좌측 레일 하단에 상주 — 소비자 제품 문법이라 공공 플랫폼엔 부적합.

**⑳ Midjourney Web Editor** — https://www.midjourney.com/explore , https://www.midjourney.com/updates/introducing-the-web-editor · `midjourney-1.jpg` `midjourney-2.jpg`
- **살아있는 것**: Explore 그리드는 **간격이 거의 0인 밀집 마소닉**으로, UI 크롬을 이미지가 완전히 밀어낸다. 에디터는 **캔버스 확장(outpaint) 핸들**을 이미지 가장자리에 직접 붙여, 도구 팔레트 대신 **객체 위 직접 조작**을 택했다.
- **SaaS 껍데기**: 거의 없다. 다만 정보 밀도가 낮아 업무 도구엔 그대로 못 쓴다.

**㉑ Adobe Firefly / Firefly Boards** — https://www.adobe.com/products/firefly.html , https://www.adobe.com/products/firefly/features/ai-moodboard.html · `firefly-1.jpg` `firefly-boards-1.jpg`
- **살아있는 것**: Boards는 **무한 캔버스 + 실시간 협업 + 보드 위에서 바로 생성**이다. "무드보드"라는 친숙한 은유로 노드 그래프의 학습 비용을 우회했다. 시사점: **"워크플로우"라는 단어 대신 "국토 조사 보드" 같은 도메인 은유**를 쓰면 업무 시스템 냄새가 줄어든다.
- **SaaS 껍데기**: Adobe 공통 내비게이션과 플랜 표.

**㉒ OpenAI Sora (스토리보드)** — https://openai.com/sora/ , https://openai.com/index/sora-is-here/ · `sora-1.jpg` `sora-2.jpg`
- **살아있는 것**: **스토리보드 = 타임라인 위에 카드(프롬프트)를 놓는 것.** 즉 "노드 그래프"를 **시간축 위의 카드열**로 바꾼 대안 문법이다. 카드 사이 간격이 곧 시간 간격이라는 규칙이 직관적이다. 우리 4시점 정사영상 파이프라인과 구조적으로 동형이다.
- **SaaS 껍데기**: 블로그 레이아웃, 안전성 문단.

**㉓ Runway (Gen-3 Alpha / Act-One)** — https://runwayml.com/ , /research/introducing-gen-3-alpha , /research/introducing-act-one · `runway-1.jpg` `runway-2.jpg` `runway-actone-1.jpg`
- **살아있는 것**: 리서치 포스트가 **"논문 톤 + 전면 영상 그리드"** 로 구성돼 "우리는 도구가 아니라 연구 조직"이라는 인상을 만든다. Act-One 페이지는 **입력(배우 얼굴 영상) ↔ 출력(캐릭터) 나란히 동시 재생 루프**가 설득의 전부다. 우리 변화탐지 2020↔2025 비교에 그대로 적용할 수 있다.
- **SaaS 껍데기**: 하단 요금/API 섹션.

**㉔ Luma Dream Machine** — https://lumalabs.ai/dream-machine · `luma-1.jpg` · **살아있는 것**: **Board** 개념 — 생성물이 시간순 스트림이 아니라 **공간에 놓인다**(브레인스토밍 은유). **껍데기**: 히어로가 다크 그라디언트 + CTA로 평범하다.

**㉕ Pika** — https://pika.art/ · `pika-1.jpg` · **살아있는 것**: "Pikaffects"를 **카드 하나 = 효과 하나**로 보여주며 호버 즉시 결과 영상이 재생된다(효과의 카탈로그화). **껍데기**: 소셜 앱 톤이라 공공 도메인과 거리가 멀다.

### 1.3 협업 무한 캔버스 · 디자인 도구

**㉖ Figma / FigJam** — https://www.figma.com/design/ , https://www.figma.com/figjam/ , https://www.figma.com/blog/multiplayer-editing-in-figma/ · `figma-1.jpg` `figma-2.jpg` `figma-3.jpg`
- **살아있는 것**: **멀티플레이어 커서**의 원형. 커서는 (a) 화살표 + (b) 이름 라벨 pill + (c) 사용자 고유색으로 구성되고, **위치가 보간되어 부드럽게 이동**한다(블로그가 다루는 핵심 구현 이슈). 다른 사용자가 선택한 객체에는 같은 색 테두리가 생겨 "누가 무엇을 만지는 중인지"가 캔버스에 상주한다. FigJam은 **커서 채팅**과 **이모지 스탬프**로 캔버스에 감정을 넣었다.
- **SaaS 껍데기**: 요금제 비교표, 엔터프라이즈 섹션.

**㉗ tldraw / ㉘ Make Real** — https://www.tldraw.com/ , https://tldraw.dev/ , https://makereal.tldraw.com/ · `tldraw-1.jpg` `tldraw-2.jpg` `makereal-1.jpg`
- **살아있는 것**: `tldraw-1.jpg`가 보여주듯 **빈 캔버스 + 하단 중앙 알약형 툴바 + 좌하단 줌 배지(100%)** 만으로 화면을 시작한다. 크롬이 극단적으로 적고 **모든 패널이 캔버스 위에 떠 있는 라운드 카드**다(스타일 패널의 색 원 12개 + 채움 4종 + 선 4종 + S/M/L/XL 크기 — 옵션을 아이콘 격자로 압축). 손그림 렌더링이 "정밀 업무툴"의 경직을 깬다. **Make Real**은 "그린 것 → 실제 동작하는 UI"를 **같은 캔버스에 나란히** 놓아 마법의 순간을 만든다.
- **SaaS 껍데기**: tldraw.dev는 개발자 문서 톤.

**㉙ Miro AI** — https://miro.com/ai/ · `miro-ai-1.jpg` · **살아있는 것**: AI 결과가 **스티키 노트 다발로 캔버스에 쏟아지는** 연출. **껍데기**: 엔터프라이즈 SaaS의 정석(파란 CTA, 3열 기능 카드, 로고 그리드) — 우리가 피해야 할 톤의 대표.
**㉚ Whimsical** — https://whimsical.com/ · `whimsical-1.jpg` · **껍데기 쪽**: 예쁘지만 정적이다. 노드가 순수 도형이며 안에 데이터가 없다.
**㉛ Obsidian Canvas** — https://obsidian.md/canvas · `obsidian-canvas-1.jpg` · **살아있는 것**: 카드 안에 **실제 노트·PDF·웹페이지가 임베드되어 스크롤된다** — "카드 안에 진짜 콘텐츠"의 저비용 구현 사례.
**㉜ Zapier Canvas** — https://zapier.com/canvas · `zapier-canvas-1.jpg` · **껍데기**: 노드 = 아이콘 + 텍스트, 결과 없음. **우리 1차 시안과 가장 가까운 실패 사례**이며, 이 리포트의 반대극이다.
**㉝ Spline** — https://spline.design/ , https://spline.design/ai · `spline-1.jpg` `spline-2.jpg` · **살아있는 것**: 웹 히어로 자체가 **실시간 3D 씬**이며 마우스에 반응한다. 3D 에디터와 이벤트 그래프가 브라우저에서 돈다는 사실 자체가 "혁신" 신호로 작동한다.
**㉞ Rive** — https://rive.app/ , https://rive.app/state-machine · `rive-1.jpg` `rive-2.jpg` · **살아있는 것**: **State Machine** — 상태 노드 사이 전이를 그래프로 그리고 그 결과가 옆에서 즉시 재생된다. 우리 파이프라인의 "단계 전이/조건 분기"를 표현하는 문법으로 유효하다.
**㉟ Framer** — https://www.framer.com/ · `framer-1.jpg` · **살아있는 것**: 스크롤 반응 히어로, 편집 화면을 그대로 노출. **껍데기**: 템플릿 마켓 섹션.
**㊱ Vercel v0 / Vercel Workflow** — https://v0.app/ , https://vercel.com/docs/workflow · `v0-1.jpg` `vercel-workflow-1.jpg` · **살아있는 것**: v0는 **좌 프롬프트 / 우 라이브 프리뷰**의 스트리밍 — 코드가 타이핑되는 동안 프리뷰가 계속 갱신된다. "스트리밍 결과"의 모범. Workflow 문서는 단계별 실행 상태를 다루지만 시각화는 평범하다.

### 1.4 데이터 · 로봇 관측 도구 — 우리 도메인에 가장 가까운 축

**㊲ Rerun.io (핵심 레퍼런스)** — https://rerun.io/ , https://rerun.io/viewer , https://rerun.io/examples , https://rerun.io/blog/column-chunks · `rerun-1.jpg` `rerun-2.jpg` `rerun-3.jpg` **`rerun-4.jpg`** **`rerun-5.jpg`** `rerun-6.jpg`
- 실제 웹 뷰어에 예제 `.rrd`를 로드해 라이브로 캡처했다.
- `rerun-4.jpg`(detect_and_track_objects): 좌측 **Sources / Blueprint 트리**, 중앙 상단 **로그 테이블**(frame #160, entity path `/logs/detect_and_track_objects`, DEBUG/INFO 레벨 컬러 배지), 중앙 우 **설명 마크다운 패널**, 하단 좌 **segmentation 뷰**(라벨 칩이 박힌 반투명 마스크: sky-other-merged / pavement-merged / road / wall-brick), 하단 우 **video 뷰**(같은 프레임의 person/car/horse 박스), 우측 **Selection 패널**(Recording ID, Source Python 3.11.10 SDK, Duration 2m 15.31s, Size 9.0 MiB, Entities 30, Rows 2,471), 그리고 최하단 **`frame` 타임라인 + 1.00x 배속 + 30 FPS + 현재 프레임 #182 + Streams 트리**.
- `rerun-5.jpg`(nuScenes): **3D 포인트클라우드(높이 컬러맵) + OpenStreetMap 기반 MapView(자차 위치 빨간 점) + 6개 카메라 뷰 가로 스트립(CAM_FRONT_LEFT ~ CAM_BACK_LEFT, 세그멘테이션 오버레이) + 파형 타임라인**. 이것이 우리가 만들어야 할 화면의 뼈대에 가장 가깝다 — **지도 + 3D + 이미지 + 시간이 한 화면에 공존한다.**
- **살아있게 만드는 것**: (a) **타임라인이 화면 폭 전체를 차지한다** — 시간이 부속이 아니라 1급 축. (b) 타임라인 위에 **이벤트 밀도가 파형/틱으로 그려진다** — 빈 축이 아니라 데이터가 있는 축이다. (c) **Blueprint** 개념: 뷰 레이아웃 자체가 편집 가능한 트리(Viewport → Horizontal container → Vertical container → Grid container)여서 사용자가 화면 구성을 소유한다. (d) 모든 패널 헤더에 **`?` / 눈 / 확장 아이콘 3종**이 일관되게 붙어 어느 패널이든 같은 방식으로 다룰 수 있다. (e) **엔티티 경로**(`/world/ego_vehicle/`, `/logs/...`)라는 파일시스템 은유로 이질적 데이터(3D·이미지·스칼라·텍스트)를 한 이름공간에 통합한다. (f) 타임라인 축을 `frame`↔`timestamp`로 **바꿔 끼울 수 있다.**
- **SaaS 껍데기**: 랜딩(`rerun-1.jpg`)은 평범하다. 힘은 전적으로 뷰어에 있다.

**㊳ Foxglove Studio** — https://foxglove.dev/ , /product , /features/visualization · `foxglove-1.jpg` `foxglove-2.jpg` `foxglove-3.jpg`
- **살아있는 것**: **패널 레이아웃이 사용자 소유물**(드래그 분할·저장·공유), 하단 **재생 컨트롤 + 스크럽 바**, 3D/이미지/플롯/로그 패널이 같은 시각에 동기화된다. 다크 UI에 데이터 색만 채도를 준다.
- **SaaS 껍데기**: 최근 사이트는 엔터프라이즈 세일즈 톤이 강해져 제품의 밀도를 잘 전달하지 못한다.

**㊴ Voxel51 FiftyOne** — https://voxel51.com/fiftyone , https://docs.voxel51.com/user_guide/app.html · `fiftyone-1.jpg` `fiftyone-2.jpg`
- **살아있는 것**: **샘플 그리드가 앱의 본체**이고, 좌측 필터를 만지면 그리드가 즉시 재구성된다. 임베딩 플롯에서 lasso 선택 → 그리드가 그 부분집합으로 좁혀지는 **"플롯과 그리드의 양방향 결속"** 이 킬러 장치. 우리 대응물: **지도에서 영역 lasso → 탐지 갤러리가 그 영역으로 즉시 좁혀짐.**
- **SaaS 껍데기**: 마케팅 페이지의 기능 나열.

**㊵ Encord Active** — https://encord.com/ · `encord-1.jpg` · **살아있는 것**: 데이터 품질 지표를 **이미지 썸네일 위에 직접** 얹는다(지표가 표가 아니라 그림). **껍데기**: 엔터프라이즈 랜딩.
**㊶ Roboflow Workflows (대조군)** — https://roboflow.com/workflows , /workflows/build · `roboflow-wf-1.jpg` `roboflow-wf-2.jpg` · 0장 참조. 기능은 최고, **시각적 야심은 최저**. 발주처가 거부한 것은 Roboflow의 기능이 아니라 Roboflow의 *외피*다.

### 1.5 도시 · 지오 분석

**㊷ Autodesk Forma** — https://www.autodesk.com/products/forma/overview , /features , /features/analysis · `forma-1.jpg` `forma-2.jpg` `forma-3.jpg`
- **살아있는 것**: `forma-1.jpg`에 잡힌 장면이 결정적이다 — **3D 매싱 위에 일조·풍환경 분석 결과가 초록→노랑→주황 히트맵으로 덮여 실시간으로 재계산**된다. 즉 **"분석 결과 = 3D 지형 위의 색"** 이지 표가 아니다. 좌측의 **세로 점(dot) 인디케이터 레일**로 챕터 진행을 표시하고, 히어로 영상에 **일시정지 버튼을 명시적으로 노출**한다(접근성이자 "이건 진짜 움직이는 화면"이라는 신호). 국토·도시 도메인에서 "AI 분석"을 시각화한 가장 좋은 상용 사례이며, 발주처 설득용 직접 비교 대상이다.
- **SaaS 껍데기**: 가격 배지와 무료체험 CTA가 히어로를 침범한다.

### 1.6 밀도 · 모션 · 소프트웨어 장인성

**㊸ Linear** — https://linear.app/ , https://linear.app/method · `linear-1.jpg` `linear-2.jpg` · **살아있는 것**: 로컬 우선 아키텍처에서 오는 **즉각 반응**, 키보드 우선, 초저채도 다크 + 단 하나의 보라 액센트, 미세한 스프링 전환. "빠름 자체가 미학"이라는 증명이며 `/method` 페이지는 제품 철학을 문서로 판매한다. **껍데기**: 거의 없다.
**㊹ Raycast** — https://www.raycast.com/ · `raycast-1.jpg` · **살아있는 것**: 커맨드 팔레트가 제품의 전부 — **검색 한 줄이 곧 UI**이고, 리스트 우측에 항목 프리뷰가 붙는다. 우리 캔버스에도 `Cmd+K` 문법이 필요하다.
**㊺ Arc** — https://arc.net/ · `arc-1.jpg` · **살아있는 것**: 대담한 색·손글씨·비대칭 레이아웃으로 "브라우저"라는 지루한 카테고리를 재정의했다. 공공 플랫폼에 필요한 건 이 정도의 **톤 이탈 용기**다.
**㊻ Cursor / ㊼ Windsurf** — https://cursor.com/ , https://windsurf.com/ · `cursor-1.jpg` `windsurf-1.jpg` · **살아있는 것**: 코드가 **스트리밍으로 삽입되고 diff가 초록/빨강 인라인 하이라이트**로 나타나는 장면을 히어로에 그대로 노출한다. "AI가 지금 작업 중"의 표준 연출.
**㊽ Descript** — https://www.descript.com/ · `descript-1.jpg` · **살아있는 것**: **텍스트를 지우면 영상이 잘린다** — 매체 변환 은유. 타임라인과 문서가 같은 객체라는 발상이 우리 "탐지 목록 ↔ 지도 ↔ 시점"의 결속에 직접 응용된다.

### 1.7 한국 레퍼런스

**㊾ 토스(Toss)** — https://toss.im/ , https://toss.im/tossfeed/article/tossface-2 , https://toss.tech/article/tossface · `toss-design-2.jpg` `toss-design-1.jpg` `toss-motion-1.jpg`
- **살아있는 것**: 자체 서체(Toss Product Sans)와 자체 이모지(Tossface)까지 만든 **"전용 활자 = 브랜드"** 전략. 모션은 화려함이 아니라 **한 화면에 한 개의 초점 이동**, 스프링 커브, 즉각적 터치 피드백이다. 공공 성격의 대규모 서비스에서 신뢰와 세련을 동시에 얻은 사실상 유일한 한국 사례. Land-XI도 **LX 전용 숫자 활자·지도 라벨 활자**를 정하면 그것만으로 "격"이 생긴다.
- **SaaS 껍데기**: 없음.
**㊿ 네이버 클로바 스튜디오** — https://clovastudio.ncloud.com/ · `clova-studio-1.jpg` · **살아있는 것**: 플레이그라운드의 **토큰 스트리밍**. **껍데기**: 네이버 클라우드 콘솔 톤(좌측 트리 + 표 + 회색) — 전형적 "업무 시스템"이며 우리가 피해야 할 정확한 대상.
**(51) 카카오 Karlo** — https://developers.kakao.com/product/karlo · `karlo-1.jpg` · 개발자 문서 톤이고 시각적 참고 가치는 낮다. **한국에는 생성AI 캔버스 UI의 시각적 레퍼런스가 사실상 부재하다 — 우리가 선점할 여지가 크다.**

---

## 2. 문법 추출 — 15개 장치와 구현 노트

우리 실제 파이프라인 = **영상 → 타일 분할 → 모델 → 탐지 → 후처리 → 지도**. 구현 전제는 vanilla JS + Canvas2D/WebGL + MapLibre.

### D1. 노드는 카드가 아니라 액자다 (Frame-not-Card)
- 근거: Figma Weave, TouchDesigner, Substance Designer, ComfyUI Preview 노드, Nuke 썸네일.
- 규칙: 노드 본체의 **최소 70% 면적은 픽셀**이어야 한다(정사영상 타일, 탐지 오버레이, 변화 diff 히트맵). 텍스트는 노드 **바깥 위쪽**의 2단 캡션(`TILE / 512px z18`, `DETECT / LX-YOLO v3`)으로 강등한다. 테두리는 1px, 그림자 대신 아주 옅은 링.
- 구현: 노드 이미지는 실제 `landxi/assets/tiles/namwon_city_2510/` 타일을 오프스크린 `<canvas>`에 디코딩해 그린다. 뷰포트 밖 노드는 `IntersectionObserver`로 디코딩을 중단하고 마지막 프레임만 남긴다.

### D2. 라이브 썸네일 예산 (Live Thumbnail Budget)
- 근거: TouchDesigner(전 노드 60fps)와 ComfyUI(선택/실행 노드만)의 대비.
- 규칙: **동시에 움직이는 썸네일은 최대 3개.** 화면 중앙에 가장 가까운 노드 + 실행 중 노드 + 호버 노드. 나머지는 정지 프레임. 전부 움직이면 시선의 초점이 사라지고 GPU도 죽는다(TouchDesigner가 예술 도구라 허용되는 것이지, 업무 판단 도구에서는 소음이다).
- 구현: 노드별 `playing` 플래그 + 단일 `requestAnimationFrame` 루프. 정지 노드는 `drawImage` 1회 후 dirty 해제.

### D3. 타입 색 언어 (Typed Sockets)
- 근거: Blender(소켓 색 + 모양), ComfyUI(링크 색), Unreal(핀 색).
- 규칙: 우리 데이터 타입 6종에 고정 색을 준다 — `RASTER`(청록), `TILE`(연청), `TENSOR`(보라), `DETECTION`(주황), `VECTOR`(초록), `MAP`(금색). 소켓 **모양**도 구분한다: 스트림=삼각형, 단일=원, 배열=이중원. 색약 대비를 위해 색만으로 구분하지 않는다.
- 구현: 소켓은 경량 SVG(또는 캔버스 path). 링크 색은 출발 소켓 타입을 상속하고, 비호환 연결 시도 시 링크가 빨갛게 되며 스냅을 거부한다.

### D4. 실행 펄스 엣지 (Pulse Along Edge)
- 근거: Unreal Blueprint 실행 와이어, n8n 데이터 흐름 애니메이션.
- 규칙: 실행 중인 엣지에만 **1개의 밝은 점**이 베지어를 따라 이동한다. 속도는 실제 처리량(타일/초)에 비례시킨다 — **장식이 아니라 계기판.** 완료 후 엣지는 0.6초에 걸쳐 정지색으로 되돌아간다.
- 구현: Canvas2D 베지어 + Casteljau 보간 직접 계산(SVG `getPointAtLength` 의존 제거). 점은 `globalCompositeOperation='lighter'`의 6px 라디얼 그라디언트.

### D5. 물리적 엣지 (Sag & Snap)
- 근거: TouchDesigner/Houdini의 자연스러운 곡률, Freepik Spaces의 큰 곡률 컬러 곡선, Rive 전이선.
- 규칙: 엣지는 직선이 아니라 **거리에 비례해 처지는 케이블**이다. 노드를 드래그하면 엣지가 **0.15초 스프링으로 따라오며 미세하게 출렁인다.** 연결 시도 중 소켓 반경 24px에서 **자석 스냅**되고 아주 짧은 클릭음(옵션)이 난다.
- 구현: 제어점 y에 `sag = clamp(dist*0.18, 12, 90)`, 드래그 중에는 제어점에 감쇠 스프링(`v += (target-p)*0.35; v *= 0.72`).

### D6. 노드 위의 실행 배지 (State on the Graph, not in a Sidebar)
- 근거: ComfyUI 초록 테두리 + 진행바, Houdini 캐시/디스플레이 플래그, Roboflow의 Cached 배지, n8n의 items 배지.
- 규칙: 상태는 **반드시 그래프 위에** 둔다 — 대기(무채색 점선 테두리) / 실행(테두리 러닝 라이트 + 상단 2px 진행바) / 완료(우상단 처리 건수 배지 `1,284 det`) / 오류(빨간 좌측 리본 + 재시도 아이콘) / 캐시(작은 눈송이). 사이드바는 상세용이지 상태용이 아니다.
- 구현: 러닝 라이트는 `setLineDash` + `lineDashOffset` 애니메이션. 진행바는 실제 타일 처리 카운터에 연결해 가짜 진행을 만들지 않는다.

### D7. 뷰어 플래그 (What the Map Is Showing)
- 근거: Houdini 디스플레이 플래그, Nuke Viewer 노드 재배치.
- 규칙: 그래프의 **정확히 한 노드**에 "지도가 지금 이 단계를 보고 있다"는 플래그(작은 채워진 사각형)를 둔다. 다른 노드를 클릭하면 플래그가 옮겨가고 **지도 레이어가 그 단계의 산출물로 교체**된다. 이 한 장치가 그래프와 지도를 하나의 도구로 묶는다.
- 구현: `state.viewerNode` 하나. 변경 시 MapLibre `setLayoutProperty(visibility)` + 200ms 크로스페이드.

### D8. 서브그래프와 공간적 줌 시맨틱 (Semantic Zoom)
- 근거: ComfyUI Subgraph/Parameter Panel, Niagara 모듈 스택, Houdini Network Box.
- 규칙: 줌 레벨이 **정보의 종류**를 바꾼다. z<0.5 = 노드가 색 블록 + 한 단어 라벨(파이프라인 개요). 0.5~1.2 = 액자 + 캡션. z>1.2 = 파라미터 위젯 행이 노드 안에서 펼쳐진다. **줌이 곧 상세도 다이얼.** 단순 확대는 실패다.
- 구현: 렌더 함수에서 zoom 밴드별 분기. 밴드 전환 시 텍스트는 120ms 페이드로 교체해 팝핑을 막는다.

### D9. 시간 축 상주 (The Timeline Is Not Optional)
- 근거: Rerun(폭 전체 타임라인 + Streams 밀도), Foxglove 재생 컨트롤, Descript, Sora 스토리보드.
- 규칙: 화면 최하단에 **항상** 타임라인을 둔다. 우리 축은 **촬영 시점(남원 4시점)** 과 **처리 진행(타일 인덱스)** 두 모드를 토글한다. 축 위에 **이벤트 밀도 스파크**(시점별 탐지 건수)를 그린다 — 빈 축은 죽은 축이다.
- 구현: 별도 `<canvas>` 1개, 폭 = 뷰포트. 스크럽 시 단일 `state.t`를 브로드캐스트해 지도 레이어와 노드 썸네일이 동시에 갱신된다.

### D10. 3면 결속 — 지도 · 이미지 · 시간 (The Rerun Trinity)
- 근거: `rerun-5.jpg`(3D + MapView + 6카메라 + 타임라인), FiftyOne 플롯↔그리드 결속, Nuke A/B 와이프.
- 규칙: 어느 한 곳의 선택이 **나머지 둘을 즉시 좁힌다.** 지도에서 lasso → 이미지 스트립이 그 영역 타일로 필터되고 타임라인이 해당 구간을 하이라이트. 이미지 스트립에서 타일 클릭 → 지도가 flyTo하고 그래프에서 그 타일이 통과한 경로가 점등.
- 구현: 단일 `selection = {bbox, tileIds, tRange}` 상태와 `emit('selection')` 브로드캐스트. 세 뷰는 구독자일 뿐 서로를 직접 알지 못한다.

### D11. 멀티플레이어 커서 (Presence)
- 근거: Figma 멀티플레이어 블로그(커서 보간), Freepik Spaces의 `Jeremy`/`Edward` 이름표 커서.
- 규칙: 커서 = 화살표 + 이름 pill + 사용자 색. **선형/스플라인 보간으로 60~100ms 지연을 흡수**해 부드럽게 움직인다. 다른 사용자가 선택한 노드에는 같은 색 1.5px 테두리. 데모에서는 "국토정보공사 김주무관 / 남원시 이사무관"처럼 **시나리오상 실제 협업 주체**를 쓴다(가짜 영문 이름은 신뢰를 깎는다).
- 구현: WebSocket 없이도 데모 가능 — 스크립트된 커서 경로를 catmull-rom으로 재생. 실제 동시 편집은 후속 단계.

### D12. 미니맵은 그래프가 아니라 영토다 (Minimap as Territory)
- 근거: ComfyUI 0.3.51 Mini Map, Foxglove/Rerun 패널 구성.
- 규칙: 우하단 미니맵은 **그래프의 축소판이 아니라 국토의 축소판**이어야 한다. 남원시 경계 실루엣 위에 처리 완료 타일이 채워지는 **진행 지도**. 필요 시 그래프 미니맵과 토글한다.
- 구현: 시군구 경계 GeoJSON을 한 번 래스터화해 캐시하고, 타일 완료 시 해당 셀만 다시 칠한다(전체 재렌더 금지).

### D13. 캔버스 위의 커맨드 팔레트 (Cmd+K)
- 근거: Raycast, Linear, Arc, ComfyUI의 더블클릭 노드 검색.
- 규칙: 노드 추가는 우클릭 메뉴 탐색이 아니라 **`Cmd+K` → "탐지" 타이핑 → Enter**. 검색 결과 리스트 우측에 **각 노드의 미리보기 썸네일**이 뜬다(Raycast식 리스트+프리뷰).
- 구현: 순수 DOM 오버레이. 퍼지 매칭은 subsequence 스코어링으로 충분하다.

### D14. 결과 갤러리가 카탈로그의 단위다 (Grid Is the Product)
- 근거: Midjourney Explore, Kling 앱 첫 화면(`kling-2.jpg`), FiftyOne 샘플 그리드, n8n 워크플로우 갤러리.
- 규칙: "저장된 워크플로우" 목록을 **표로 만들지 마라.** 각 항목은 **그 워크플로우가 생산한 결과 이미지 + 그래프 미니 썸네일**의 카드다. 간격은 8px 이하로 밀집시켜 UI 크롬을 이미지가 밀어내게 한다.
- 구현: CSS grid masonry. 썸네일은 실행 완료 시 캔버스 `toBlob`으로 자동 캡처한다.

### D15. 조판과 정적 — 업무 시스템 냄새를 지우는 마지막 5% (Typography & Silence)
- 근거: Figma Weave(초대형 그로테스크 + 8pt 캡션), Krea(무채색 + 1문장), Flora(세리프 이탤릭), Linear(초저채도 + 단일 액센트), 토스(전용 활자).
- 규칙: (a) **대비를 극단으로** — 화면에 초대형 텍스트 1개와 8~10pt 캡션들만. 중간 크기 14~16px 본문 덩어리가 많을수록 업무 시스템으로 읽힌다. (b) **색은 결과에만** — UI는 무채색, 채도는 탐지 박스·히트맵·타입 소켓에만. (c) **여백을 남겨라** — 패널로 화면을 다 채우지 말고 지도가 숨 쉬게 한다. (d) 숫자는 **tabular-nums** 고정폭. (e) 도메인 은유를 바꾼다: "워크플로우 편집기" → **"국토 조사 보드"**, "노드" → **"관측/처리 단계"**.

---

## 3. 대안 구성 3안 — 업무 시스템으로 읽히지 않는 워크플로우 화면

### 3안 A. "지도가 곧 캔버스" (The Map IS the Canvas) — 추천
노드가 흰 격자 위가 아니라 **남원 정사영상 위에 떠 있다.** 각 노드는 자기가 담당하는 **실제 지리 위치 위에** 앵커되고, 엣지는 지도 위를 흐르는 광선이 된다. 줌아웃하면 노드가 접히고 국토 전체의 처리 진행 지도가 된다.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LAND-XI   남원시 변화탐지 · 2020→2025              ●김주무관 ●이사무관   ⌘K   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ░░░░░░ 남원 정사영상(2025) — 밝은 지도 바탕이 곧 캔버스 ░░░░░░               │
│                                                                              │
│      SOURCE / 항공영상 2025          TILE / 512px z18                         │
│      ┌────────────────┐             ┌────────┬────────┐                      │
│      │ [실제 영상 프레임]│●───────╮    │▓▓│▓▓│░░│ 타일격자│                      │
│      │  ▶ 재생 중 12s   │        ╰───▶│▓▓│▓▓│░░│ 8,421개│●──╮                  │
│      └────────────────┘             └────────┴────────┘    │                 │
│         ▲ 이 노드는 실제 촬영 항로 위에 앵커됨                 │                 │
│                                                             ▼                │
│                    DETECT / LX-YOLO v3      ■ ◀ 지도가 보는 단계               │
│                    ┌───────────────────────┐                                 │
│                    │ [탐지 박스가 그려진 타일] │  1,284 det  ▁▃▅▇▅▃            │
│                    │ ▓▓▓▓▓▓▓░░░ 진행 72%    │●──────╮                         │
│                    └───────────────────────┘        │                        │
│                                                      ▼                       │
│      ※ 탐지 결과가 노드 밖으로 "쏟아져" 지도에 직접 렌더된다                     │
│         ● 신축 건물   ● 도로 변화   ● 훼손 산림                                │
│                                                          ┌──────────┐        │
│                                                          │미니맵=영토 │        │
│                                                          │남원 실루엣 │        │
│                                                          │▓▓▓░░ 62%  │        │
│                                                          └──────────┘        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ◀▮▶ 1.0x │ 2010 ───── 2015 ───── 2020 ──●── 2025 │ ▁▂▅█▃▁ 탐지밀도 │ 8,421타일│
└──────────────────────────────────────────────────────────────────────────────┘
```
- 왜 업무 시스템이 아닌가: 배경이 흰 캔버스가 아니라 **국토 그 자체**다. 노드는 다이어그램이 아니라 **영토 위의 관측소**로 읽힌다. 결과가 노드에 갇히지 않고 지도로 흘러나온다. D1·D6·D7·D9·D12를 한 화면에서 동시에 만족한다.

### 3안 B. "Rerun식 3면 + 스크러빙 타임라인" (Observatory)
```
┌───────────┬──────────────────────────────────┬────────────────────────────┐
│ PIPELINE  │  MAP  (MapLibre · 남원 2025)      │  SELECTION                 │
│ ▸ /source │                                  │  타일 z18/223412/101887    │
│   ▸ 영상  │      ●●  ● 신축   ● 도로변화      │  탐지 37건 · conf 0.82     │
│ ▸ /tile   │        ●●●                       │  모델 LX-YOLO v3           │
│   ▸ 격자  │   ┌ lasso 선택 영역 ┐             │  처리 1.2s · GPU 41%       │
│ ▸ /model  │   │   ▓▓▓▓         │             │  ───────────────           │
│   ▸ 추론  │   └────────────────┘             │  클래스 분포                │
│ ▸ /post   │                                  │  건물 21 · 도로 9 · 산림 7  │
│   ▸ 후처리├──────────────────────────────────┤  히스토그램 ▁▃▅▇▅▃▁        │
│ ▸ /report │ TILES  [▣][▣][▣][▣][▣][▣][▣][▣] │                            │
│           │   탐지 오버레이 스트립 (선택 영역만)  │                            │
├───────────┴──────────────────────────────────┴────────────────────────────┤
│ ▶ ▮▮   timestamp 2025-10-14 11:23:07     1.00x     30 FPS                  │
│ 2010┊──────2015┊──────2020┊─────────●2025   ▁▂▃▅█▇▅▃▂▁▁▂▃  탐지 이벤트 밀도 │
│ Streams ▸ /tile/decode ▁▁▃▃▁   ▸ /model/infer ▅█▅█▅   ▸ /post/nms ▂▂▃▂     │
└────────────────────────────────────────────────────────────────────────────┘
```
- 왜 강한가: **"이건 분석 화면이 아니라 관측 장비다"** 라는 인상. Rerun/Foxglove가 로보틱스 업계에서 얻은 신뢰의 문법을 국토 도메인으로 옮긴다. "우리 파이프라인은 초 단위로 관측 가능하다"는 기술적 우위를 발주처에게 증명한다.
- 약점: 정보 밀도가 높아 "우와"보다 "전문적"에 가깝다. A안의 심층 모드로 두는 것이 적절하다.

### 3안 C. "파이프라인 = 비행 항로" (Pipeline as Flight Path)
파이프라인 6단계를 **드론/항공기가 남원 상공을 지나가는 하나의 비행 경로**로 표현한다. 카메라가 경로를 따라 날고, 각 단계는 항로 위의 웨이포인트다. 스크롤/스크럽이 곧 비행이다.
```
   [카메라: 고도 3,200m 남원 상공, 정사영상 위를 서에서 동으로 활공]

        ①촬영                ②타일               ③추론
      ✈ ──────────╮       ╭────────╮        ╭────────╮
                  ╰───────╯        ╰────────╯        ╰────────▶ ④탐지 ⑤후처리 ⑥지도
     ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
     [지면: 실제 남원 DEM + 정사영상. 웨이포인트 아래로 지형이 흐른다]

  웨이포인트에 도달할 때마다
   ─ 화면 가장자리에서 유리 패널이 미끄러져 들어와 그 단계의 실제 산출물을 보여주고
   ─ 지면 위에 그 단계의 결과가 물감처럼 번진다 (타일 격자 → 히트맵 → 탐지 핀)
   ─ 하단 얇은 진행 바:  ●━━━━○────○────○────○────○   1/6 촬영

  마지막 웨이포인트에서 카메라가 수직 상승 → 남원 전역 → 전라북도 → 전국
  → "전국 3,745개 읍면동, 오늘 처리 완료" 로 착지
```
- 왜 강한가: **시네마틱**하다. 발주처가 원한 "우와"는 정보량이 아니라 **스케일 감각**에서 온다 — 한 타일에서 시작해 전국으로 줌아웃하는 단 하나의 카메라 무브가 그것을 만든다.
- 약점: 조작 불가능한 연출은 결국 "예쁜 영상"으로 끝난다. **반드시 어느 시점에서든 멈춰 조작 가능**해야 하고(스크럽 중 클릭 → A안 캔버스로 착지), 그렇지 않으면 1차 시안의 "목업" 지적을 그대로 반복하게 된다.

### 권고: **A를 메인, C를 진입 연출, B를 심층 모드**
- 첫 진입(또는 발표 시작) 3~5초는 C의 활공 → 감속하며 A의 캔버스로 착지한다(카메라가 멈추면 노드가 지면에서 솟아오른다).
- A에서 특정 단계를 "심층 검토"하면 B의 3면 관측 모드로 전환한다.
- 이 세 화면이 **같은 `state.t`와 `state.selection`을 공유**하면 서로 다른 세 화면이 아니라 **한 도구의 세 배율**이 된다 — 이것이 D8(공간적 줌 시맨틱)의 전면 적용이다.

---

## 4. 체크리스트 — "업무 시스템이 아닌가"를 판정하는 12문항

1. 노드 안에 실제 픽셀이 있는가? (없으면 즉시 탈락)
2. 화면에 지금 움직이는 것이 1개 이상 3개 이하인가?
3. 실행 상태가 사이드바가 아니라 그래프 위에 있는가?
4. 엣지가 데이터 타입을 색으로 말하는가?
5. 엣지가 실행 중에 흐르는가? 그 속도가 실제 처리량인가?
6. 타임라인이 화면 폭 전체를 차지하는가? 그 위에 데이터 밀도가 그려져 있는가?
7. 지도·이미지·시간 중 한 곳의 선택이 나머지 둘을 즉시 좁히는가?
8. 줌 레벨이 정보의 종류를 바꾸는가? (단순 확대는 실패)
9. 다른 사람의 존재(커서)가 보이는가?
10. `Cmd+K` 한 번으로 무엇이든 할 수 있는가?
11. 화면에 14~16px 본문 덩어리가 3개 이상 있는가? (있으면 감점)
12. UI가 무채색이고 채도는 결과에만 쓰였는가?

## 5. 안티패턴 — 92장에서 확인한 "하지 말 것"

- **Zapier Canvas형 노드**(아이콘 + 텍스트 + 결과 없음) — 우리 1차 시안의 정확한 쌍둥이.
- **Miro/Whimsical형 엔터프라이즈 랜딩 톤** — 파란 CTA, 3열 기능 카드, 로고 그리드.
- **Krea 히어로형 "제품을 안 보여주는 첫 화면"** — 텍스트만 있는 히어로는 절제가 아니라 손실이다.
- **Freepik형 히어로 침범** — 쿠키 배너·언어 토스트·가격 배지가 첫인상을 덮는 것(`freepik-spaces-1.jpg`가 실증).
- **네이버 클라우드 콘솔 톤** — 좌측 트리 + 표 + 회색. 한국 공공/기업 SaaS의 기본값이자, 발주처가 "2%"라고 말한 바로 그것.
- **전 노드 60fps 썸네일** — TouchDesigner는 예술 도구라 허용되지만, 판단을 위한 도구에서는 시선의 초점을 파괴한다(D2 예산 준수).

---

## 부록: 수집 이미지 목록 (92장, `shots/bench/nodes/`)

`arc-1` `blender-geonodes-1~2` `clova-studio-1` `comfyui-1~6` `cursor-1` `descript-1` `dynamo-1` `encord-1` `fiftyone-1~2` `figma-1~3` `firefly-1` `firefly-boards-1` `flora-1~2` `forma-1~3` `foxglove-1~3` `framer-1` `freepik-spaces-1~2` `grasshopper-1` `houdini-1~2` `karlo-1` `kling-1~2` `krea-1~3` `linear-1~2` `luma-1` `makereal-1` `midjourney-1~2` `miro-ai-1` `n8n-1~3` `nuke-1` `obsidian-canvas-1` `pika-1` `raycast-1` `rerun-1~6` `rhino-1` `rive-1~2` `roboflow-wf-1~2` `runway-1~2` `runway-actone-1` `scenario-1` `sora-1~2` `spline-1~2` `substance-designer-1` `tldraw-1~2` `toss-design-1~2` `toss-motion-1` `touchdesigner-1~2` `unity-shadergraph-1` `unity-vfxgraph-1` `unreal-blueprint-1` `v0-1` `vercel-workflow-1` `weavy-1~2` `whimsical-1` `windsurf-1` `zapier-canvas-1`

수집 방법: Playwright(Chrome 채널, headed, 1200×780 뷰포트, JPEG q75), 쿠키 배너 자동 수락, 지연 렌더 대기 3.5~35초, Rerun은 실제 `.rrd` 예제를 뷰어에 로드해 라이브 캡처. 파일은 모두 `shots/`(gitignore) 하위에 있어 저장소에는 포함되지 않는다.

수집 실패 1건: Niagara 공식 문서 페이지(Epic 봇 차단) — 해당 서술은 공개 문서 기준이며 `unreal-blueprint-1.jpg`로 대체 보완했다.
