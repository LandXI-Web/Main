# 프로젝트 화면 원판 브리프 — B5-Projects (2026-08-26, 발주자 "프로젝트 화면 개편, 로보플로우 스타일")

## 한 줄
프로젝트 화면군(원본 `landxi7/ai-project*.html` 12화면 + 상태 16)을 **Roboflow Universe 골격**으로 재조판한 B5 원판 아트보드 3장을 만든다. 기능은 원본 1:1(추가·삭제 0), 표면은 `design/system.md`. 골격은 조사 1위 **후보 1(T1 고정 헤더 + 탭 + 작업공간 풀블리드)**.

## 법전 (이것만 읽는다 — 추가 조사 금지)
1. `design/system.md` — THE SYSTEM(서체 3 · 색 5+액센트 1곳 · 좌표 72/64/56 · 모션 · 콘티 원칙 · 3-비평가).
2. `docs/superpowers/research/2026-08-26-bench-pj2.md` — §1 원본 인벤토리(12화면 표 1-1 = 파리티 대상), §1-2 고칠 문제, §2.1 Roboflow Universe 실측, §4 후보 1, §5 목표값(레일 | 1384, 프로젝트명 48px, 첫 화면 실사 ≥ 30%, 카드 0, radius 0, shadow 0, 액센트 1색, 탭 6 + 배지).
3. `docs/superpowers/research/2026-08-25-benchmark-roboflow.md` — §0 결론 3(결과 이미지 = 1급 시민 · 파라미터가 즉시 그림을 바꿈 · 중간 단계 열람), §1.1 Workflows(캐시 배지·포트 `+`), §1.2 Annotate(우측 툴바·클래스 셀렉터·confidence 슬라이더), §1.3 Train(혼동행렬·클래스별 막대).
4. `design-canvas/v2/NOTES.md` §5(B2-Projects 파리티 목록), §12.4(밴드·폰트 실측 어휘), §13(B5-DataMgmt — Roboflow Images 그리드를 우리 값으로 옮긴 선례: 5열 240×147 gap 12, 캡션 11px Inter, 선반, 브래킷, 결손 액자). **같은 어휘를 쓴다.**
5. 참고 아트보드: `design-canvas/v2/B5-DataMgmt.dc.html`(타일 그리드 마크업 재사용), `B5-Dashboard.dc.html`(레일 72·마스트헤드 64·KPI 띠·헤어라인 원장 마크업 재사용). 캡처: `shots/bench/pj2/_sheet-pj.jpg`(Roboflow Universe 3장 = 우하단 행), `shots/original/_sheet-project-original.jpg`(원본 28장).

## 산출물 (아트보드 3장, 각 1440×900, `design-canvas/v2/`)
### A. `B5-Projects.dc.html` — ① 프로젝트 목록 (+ ② 만들기 드로어)
- Roboflow Universe **프로젝트 카드 = 실사 썸네일이 카드다**: 3열(폭 (1256−2·24)/3 ≈ 402) × 2행, 썸네일 402×226(1.78:1) 실크롭(`landxi/assets/proto/crops/**` → `tools/design/tiles-b5.mjs` 방식으로 ≤ 40 KB jpg, `img/pj-*.jpg`) 위에 **결과 지오메트리(청록)** — 결과가 있는 프로젝트만. 캡션 2줄: `프로젝트명 16 SUIT` / `탐지유형 · 학습데이터 유형 · 등록일 · 라벨링 n · 학습 n · 구성원 n` 12 Inter.
- 데이터: `models.js` 실측 10종 → 프로젝트 8건(B2 §5 선례). 담당자명·카운트는 지어내지 않음 — 원본 카드의 `라벨링 n·학습 n·구성원 n`은 `results.js`/`models.js`에서 셀 수 있는 것만 숫자, 없으면 `—`. `inferred:true`는 점선 표식.
- 마스트헤드 64(공지 없음 — 제목 `프로젝트` 32 + 부제 + 우측 `총 8건 중 1–8행`), CHIP-RAIL 1줄: 검색(프로젝트명) · 초기화 · 검색 · 페이지 크기(10/20/50) · 페이지네이션(처음/이전/1/다음/마지막) · **`프로젝트 만들기`**(검정 CTA, 화면 유일의 채움 버튼).
- ② 만들기 = 우측 드로어 480(B5-DataMgmt §13 [12] 발행 드로어와 같은 문법): 프로젝트명(13/100 카운터) · 탐지유형 2택(Object Detection / Segmentation — **실사 크롭 2장이 라디오**) · 학습 데이터 유형 select · 권장 해상도 select · 클래스 입력(칩) · 목록/취소/만들기. 드로어는 열린 상태로 그린다(원본 상태 ② 노출).
- 액센트 `#006DF7` 1곳: 선택(호버)된 카드의 코너 브래킷 + 캡션 `열기 ›`.

### B. `B5-Project-Overview.dc.html` — ③ 개요 (+ 수정·초대 모달은 상태 표기만)
- **고정 헤더 200**(y 64–264): 프로젝트명 **48 SUIT** 2줄 이내 + 우측 **실사 히어로 420×240**(Roboflow 위치 그대로; 남원 드론 정사영상 + 청록 결과 박스) + kv 4 한 줄(탐지유형 · 학습데이터 유형 · GSD · 최근 학습, Inter 14) + CTA 1(검정 채움, 상태에 따라 `라벨링 이어하기`) + 텍스트 버튼 `수정 · 구성원 초대 · 목록 · 삭제`(삭제는 잉크, 빨강 없음 — 상태색 규칙).
- **탭 6 + 개수 배지**(높이 44, 활성 = 잉크 밑줄 2px, 보라 없음): `개요 · 데이터 12 · 라벨링 3 · 학습 5 · 분석 · 배포 1`. 원본 8항목 → Data/Models/Deploy 그룹 = 탭(후보 1 매핑표 그대로).
- 개요 본문 = Roboflow 개요 2열: **좌 스탯 패널 288**(kv 6 = 프로젝트명·탐지유형·학습데이터유형·권장해상도·등록일시·최근학습, Inter tabular 우측정렬; 아래 `mAP@50 · Precision · Recall` **세로 미니 막대 4×24** — 값은 `models.js`에 있는 것만, 없으면 `학습 결과 없음` 결손 한 줄; `CLASSES (n)` 칩 클라우드 = 원본 클래스 5) / **우 928**: 구성원 3(초성 타일 → **이름 + 역할 칩 + 라벨 수 + 날짜** 헤어라인 행) + 원본 "작업공간 진입 3버튼"은 **탭 중복이므로 헤더 CTA 1 + 탭으로 흡수**(§1-2 문제 3, 파리티 문서에 `이동`으로 기록) + **최근 학습 1건의 결과 미리보기**(Roboflow `TRY THIS MODEL` 자리 828×200 → 우리는 `최근 학습 XI-VFM v2.1 · 혼동행렬 5×5 미니 + 클래스별 F1 막대` — 원본 ⑦ 학습 결과 드로어의 데이터를 요약).
- 액센트 1곳: 활성 탭? 아니다 — 탭은 잉크. 액센트는 **스탯 막대 중 mAP 1개**.

### C. `B5-Project-Data.dc.html` — ④ 파일 + ⑥ 데이터셋 (데이터 탭, 세그먼트 2)
- 같은 헤더(접힘 상태 96: 프로젝트명 24 + 탭만) + 탭 활성 `데이터 12`.
- 세그먼트 2 `파일 12 | 데이터셋 2` + 필터칩(유형 select · 검색필드 select · 검색어 · 초기화/검색) + `선택 제외` · `파일 추가`(→ 모달 "아카이브 목록 8건"은 상태 표기) + 그리드/리스트 토글.
- **5열 썸네일 240×147 gap 12**(§13.1 값 그대로) 실크롭 + **주석 박스(청록) 그려진 상태** = "결과 이미지 1급". 캡션 `이름 · GSD · 라벨 n · 날짜` 11 Inter. 선택 타일 = 브래킷. 데이터셋 2건은 그리드 아래 헤어라인 행 2(데이터셋명 · 버전 · 라벨링 데이터 n · 만든 날짜) + `데이터셋 만들기` 텍스트 버튼.
- 액센트 1곳: 선택 타일 브래킷.

## 규칙
- 서체 SUIT 500 / Pretendard 400 / Inter tabular. 최소 12px(레일 글리프 제외). radius 0 · shadow 0 · gradient 0 · backdrop 0. `#006DF7` 아트보드당 정확히 1곳(grep으로 증명). 청록 `#0FA9A0`은 결과 지오메트리에만. 앰버 0.
- 콘티 원칙: 담당자명·활동 기록·대기 일수 0. 수치는 `models.js / results.js / imagery.js / services.js`만. 시연 값은 `시연` 태그, 우리가 이은 값은 `추정`.
- 레일 72 = B5-Dashboard 마크업 복사(활성 항목 `프로젝트`). 마스트헤드 64. 마진 56(x 128–1384).
- 이미지: 각 ≤ 70 KB, `img/` 에 저장, 마크업은 `<img src="파일명.jpg">`(경로 없이). 기존 `img/tile-*.jpg`·`plate-*.jpg` 재사용 가능.
- 한 아트보드 = 한 상태(호버·드로어 열림 등)만 그린다.

## 공정
1. 세 파일 작성 → `node design-canvas/v2/render.mjs B5-Projects B5-Project-Overview B5-Project-Data` (PLAYWRIGHT_BROWSERS_PATH=`E:/Land-XI 플랫폼/_env/ms-playwright`) → 렌더 보고 Craft 재비평(넘침·겹침·잘림 0) — 최소 2회.
2. `design-canvas/v2/canvas.json`에 3장 추가: y 4080 행, x 0 / 1560 / 3120, title은 `B5 · 프로젝트 — …` 형식.
3. `NOTES.md` §14 `B5-Projects` 추가: 발주 원문 · 장치 지도(어디서 가져와 어디에 앉혔나, §13.2 표 형식) · 조판 실측 · 파리티 체크리스트(12화면+16상태 각각 어디에 있는지, 없으면 `상태 표기`/`이동` 사유) · 색 실측(grep 수) · Craft 재비평 기록 · 유보.
4. `node design-canvas/v2/embed.mjs` 실행(캔버스 페이지 재임베드). **발행(Artifact publish)은 하지 않는다** — 컨트롤러가 한다.
5. 커밋(브랜치 plan1-foundation, 메시지 `feat(design-canvas): B5-Projects …`, 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`), `git reset`/`--amend` 금지, 푸시 금지.

## 보고 형식
파일 3 + 렌더 3 경로 · 액센트 grep 수(3장) · 파리티 표(12+16 → 위치) · 원판과 조사 문서의 차이(있으면 이유) · 유보 · 커밋 해시. 서술 금지.
