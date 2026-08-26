# Land-XI 브랜드 자산 추출 보고서 (2026-08-26)

원본 자료(카카오톡 다운로드 zip 3종, 폴더, pptx 2종, PDF 1종)에서 로고/워드마크/심볼/락업으로
보이는 이미지 후보 48개를 `landxi/assets/brand/src/<source>/`에 추출했다. 콘택트 시트는
`shots/brand/candidates.jpg`.

## 결론 — 진짜 워드마크/락업은 이것

1. **`uilist/v_3.0/Land_00메인_00인트로_v0.3_231121.jpg`** (1920×960, JPG, 378KB)
   로그인/인트로 화면. 좌측에 **"LAND-XI" (파랑 그라디언트) + "PLATFORM" (남색)**
   워드마크가 밝은 배경 위에 크게(약 330×110px 유효 해상도) 렌더링되어 있다.
   프로모 영상 프레임(`promo/brand-wordmark-*.png`)과 **글자 형태·자간은 동일 계열**
   (각진 geometric grotesque, ALL-CAPS, ExtraBold)이지만 **색이 다르다** — 프로모는
   흰색/다크 배경, 이 소스는 블루 그라디언트/다크텍스트에 라이트 배경. 즉 **컬러 배리언트**.
   - 크롭 저장: `uilist/_crops/wordmark-landxi-platform-lightbg.png` (672×144)
   - 로그인 카드 상단에 같은 워드마크의 축소 버전(네이비+시안, 다크 헤더 위)도 있음 →
     `uilist/v_4.0/Land_00메인_01LX_v1.0_240130.jpg` 최상단 네비게이션에서 확인,
     크롭: `uilist/_crops/wordmark-landxi-platform-darknav.png` (2016×180, 다크 배경 위
     시안 "LAND-XI" + 흰색 "PLATFORM" — **이게 프로모 프레임과 색상 배치가 제일 가까움**,
     단 해상도가 얇고 낮음).

2. **LX 한국국토정보공사 코퍼레이트 심볼/락업**
   - `uilist/_crops/lx-corp-lockup-nia-darkfooter.png` (1056×140) — 다크 네이비 푸터에
     민트/틸(#1FBFA8 근사) "LX" 심볼 + 흰색 "한국국토정보공사" 텍스트, 옆에 회색
     "NIA 한국지능정보사회진흥원" 파트너 락업. `uilist/v_4.0` 홈 목업 최하단에서 크롭.
   - `pptx-feedback-8ch/image97.png` (237×884, 앱 스크린샷 일부) — 실제 LX 공식 앱
     헤더: 민트 "LX" 심볼(둥근 L+X 결합) + 남색 "한국국토정보공사" 텍스트, 흰 배경.
     공식 CI 컬러(민트/틸 + 네이비) 확인용 레퍼런스. 해상도는 낮음(전체 237px 폭).
   - `uilist/_crops/lx-symbol-createdby.png` (747×144) — "Created by [LX 심볼]" 각주,
     심볼만 단독으로 깨끗하게 보임(민트 컬러, 텍스트 없음). 심볼 형태 확인에 가장 유용.

3. **태그라인 "공간을 읽고 미래를 설계합니다."** — 원본 자료 어디에도 없음.
   `promo/brand-tagline*.png`(비디오 프레임)에만 존재하는 것으로 보임. 원본 미확인.

4. PDF `LX_LandXI_Visual_Concepts 3종.pdf` (2026-08-24 K-GEO FESTA 컨셉 덱, 21p)는
   **로고 애셋이 아니라 무드보드**였다. "LX 한국국토정보공사"·"LAND-XI"는 페이지 내
   벡터 텍스트로 조판된 것이지 심볼 이미지가 아님 (`get_images()`로 추출 불가, 렌더링 후
   크롭: `pdf-visual-concepts/page06-wordmark-landxi-concept-darktext.png`, 어두운
   sans-serif, 프로모와 글꼴 계열은 비슷하나 컬러가 검정이라 다름). 우측 하단 코너 로고는
   **deps Studio라는 디자인 대행사 로고**였음 — LX 소유 자산 아님, 참고용으로만 보관
   (`page00-xref20-deps-studio-agency-logo-NOT-LX.png`).
   덱 page10 (`page10-xref83.jpeg`)에 **"GOTHAM"** 텍스트가 프레젠테이션 내부에 등장 —
   사용 서체가 Gotham(또는 그 계열)일 가능성을 시사하는 유일한 단서.

## 소스별 요약

- **`uilist/`** (Land-XI_UIlist_240329.zip, 174장 중 6장이 "LX/기관/인트로" 키워드로 매치):
  전부 전체화면 UI 목업 JPG (1920×960~4117), 로고 자체는 그 안의 요소일 뿐 별도 벡터 파일
  없음. v_2.0/v_3.0/v_4.0에 동일 계열 자산 3세대 존재, v_4.0(240130)이 최신.
  `Land_01메인_02기관` / `Land_00메인_02기관`은 **"남원시-XI" 공동 브랜딩 변형**(핑크/화이트
  테마, 남원시+LX 락업)으로 코어 브랜드는 아님.
- **`design-v1.2-zip`/`design-v1.2-folder`**: zip과 압축해제 폴더 내용이 uilist v_3.0의
  `00_메인` 폴더와 완전히 동일(중복) — 새 후보 없음, 빈 디렉터리라 삭제함.
- **`pptx-intro2`** (Land-XI 플랫폼 소개2.pptx, 33개 미디어): 남원 스마트빌리지 콘텐츠용
  차트/아이콘/맵 이미지들. SVG 6개는 모두 UI 화살표/다운로드/외부링크 **아이콘**이었고
  로고 아님(`imageN-svgrender.png`로 2000px 렌더 보관). 로고/워드마크 없음.
- **`pptx-feedback-8ch`** (240522 피드백 pptx, 121개 미디어): 대부분 전체화면 스크린샷.
  `image97.png`가 유일하게 실제 LX 앱 헤더(코퍼레이트 락업)를 담고 있어 값짐. 나머지
  KEEP 후보(플로우차트, 파일탐색기 등)는 로고 아님.
- **`pdf-visual-concepts`**: 위 4번 참고.

## 부족한 것 (Missing)

- **화이트 벡터/고해상도 워드마크 없음** — 프로모 영상 프레임(`promo/brand-wordmark-*.png`,
  비디오에서 추출한 래스터)이 지금까지 확보한 자료 중 프로모와 색상이 가장 가까운 유일한
  소스이고, 원본 자료들에서는 흰색 단독 버전을 찾지 못했다. 전부 (a) 블루/시안 그라디언트
  라이트 배경판, (b) 네이비 다크텍스트판 중 하나이며 진짜 "흰색 ExtraBold" 단독 로크업은
  미확인.
- **SVG/AI/EPS 벡터 원본 없음** — 모든 후보가 래스터(JPG/PNG)이며 최고 해상도도
  풀스크린 목업 내부에 박힌 상태(유효 워드마크 폭 300~2000px 남짓). 순수 로고 단독
  벡터 파일은 어느 소스에도 없었다.
- **태그라인 "공간을 읽고 미래를 설계합니다." 락업 원본 없음** (위 3번).
- LX 코퍼레이트 심볼의 정확한 색상값(HEX)은 미확정 — 스크린샷 기반 근사치(민트/틸
  `#1FBFA8` 근사, 네이비 `#1B2A4A` 근사)만 확보, 공식 CI 매뉴얼 PDF는 자료에 없음.
- 사용 서체명 추정만 가능("GOTHAM" 텍스트 1회 언급), 실제 폰트 파일이나 공식 확인 없음.

## 파일 목록

전체 48개 후보는 `landxi/assets/brand/src/{uilist,uilist/_crops,pptx-intro2,pptx-feedback-8ch,pdf-visual-concepts}/`
아래 원본 파일명(또는 `pageNN-xrefNN`/크롭명)으로 보관. 콘택트 시트: `shots/brand/candidates.jpg`.

## 벡터화 작업 (2026-08-26 후속)

원본 벡터가 없다는 위 결론에 따라 프로모 영상 프레임 3장(`promo/brand-wordmark-4x.png`,
`brand-lx-lockup-4x.png`, `brand-tagline-2x.png`)에서 SVG를 뽑았다. 도구는
`tools/brand/`(`yolo` conda 환경: opencv, numpy, Pillow, Node/Playwright 병용),
산출물은 `landxi/assets/brand/vector/`, 비교 시트는 `shots/brand/vector-vs-promo.jpg`.

**트레이싱 방식**: 처음엔 `potracer`(순수 파이썬 potrace 포트, `pip install potracer`)를
썼으나 사각형 하나짜리 최소 재현 테스트에서도 좌표를 잘못 뽑아(코너가 아니라 변의 중점을
잇는 다이아몬드 모양 출력 — bool 반전/전치 조합을 다 시도해도 동일) 폐기. 대신
`cv2.findContours`(RETR_CCOMP, 홀/카운터 보존) → `cv2.approxPolyDP`(서브픽셀 tolerance)로
단순화 → 정점별 turn-angle을 재서 급격한 코너(>48~60°)는 직선(L)으로, 완만한 연속 구간은
Catmull-Rom→cubic Bezier(C)로 매끄럽게 잇는 자체 구현(`tools/brand/vectorize.py`의
`mask_to_path_d_cv`)으로 교체했다. 직선 stem은 각지게, 라운드 카운터/모서리는 부드럽게
나온다 (`shots/brand/vector-vs-promo.jpg`에서 LX 락업 오버레이가 프로모와 픽셀 단위로
거의 겹치는 것으로 확인).

- **`lx-lockup.svg`** — `promo/brand-lx-lockup-4x.png`(밝은 배경)를 2배 업스케일 후
  배경색과의 거리 임계값 + Hue 분리로 민트 LX 심볼(`#1FBF8F`)과 네이비 국문 텍스트
  (`#0F2A4A`)를 별도 path로 분리, 각각 트레이싱. 그림자 스펙클은 연결요소 면적 필터로
  제거. `tools/brand/build_lockup.py`.
- **`tagline.svg`** — `promo/brand-tagline-2x.png`를 동일 파이프라인으로 단색(민트
  `#2FC49B`) 트레이싱. 프레임 우상단에 섞여든 UI 아이콘 조각(면적 <400px)은 최소 면적
  필터로 제거. `tools/brand/build_tagline.py`.
- **`landxi-wordmark.svg` / `landxi-wordmark-dark.svg` — 폴백 재조판 (트레이싱 아님, 명시)**:
  `brand-wordmark-4x.png`를 직접 트레이싱하는 건 포기했다. 이유 둘: (1) 좌측 "LAND-XI"의
  L이 프레임 밖으로 잘려 있고, (2) 배경의 흰색 비행기 그래픽이 "PLATFORM"의 A/T와 겹쳐
  마스크에 섞여 들어옴(`brightness>190 & saturation<60` 임계값으로는 비행기와 글자를
  구분 불가 — 둘 다 흰색). 대신 지시대로 **Google Fonts "Archivo Black"(weight 900)을
  Playwright로 렌더링**해 재조판했다. 프로모 자체 픽셀에서 실측한 목표 비율(가려진
  L을 보간해 추정: width\:cap ≈ 9.7:1, XI-PLATFORM 사이 word-space ≈ 0.54×cap)에
  맞추기 위해 — Archivo Black 기본 트래킹은 13.0:1로 목표보다 훨씬 넓고, Montserrat
  ExtraBold는 14.5:1로 더 넓어서 음수 letter-spacing만으로는 획이 서로 겹칠 정도로
  압축해야 함 — 균일 `scaleX(0.745)` 압축 + 실측 word-gap 스페이서로 렌더링 후 재측정을
  3회 반복 수렴시켰다(결과: width\:cap 9.70:1, word-space\:cap 0.545). 이 렌더를
  `mask_to_path_d_cv`로 트레이싱해 최종 SVG를 만들었다(`tools/brand/build_wordmark.py` +
  `tools/brand/render-wordmark.mjs`). fill은 `#FFFFFF`(라이트-온-다크용)와
  `-dark.svg`의 `#010102`(다크-온-라이트용) 두 벌.
- 세 SVG 모두 `landxi/assets/brand/vector/*.png`로 3000px 폭 PNG(투명 배경) 동반 export.
- `shots/brand/vector-vs-promo.jpg`: 자산별 [프로모 크롭 | 벡터 래스터 | 50% 오버레이]
  3열 × 3행. LX 락업/태그라인은 오버레이가 거의 픽셀 정합; 워드마크는 재조판이라 형태
  비교용(정합 아님).

**한계**: 워드마크는 실제 로고 폰트가 아니라 근사 재조판이다. "GOTHAM" 단서(위 4번)를
확인할 방법이 없어 Archivo Black으로 대체했고, 공식 폰트 파일을 구하면 재작업 필요.
