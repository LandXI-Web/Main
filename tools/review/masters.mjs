// 자산 대장 + 원판 갤러리 생성기 — 원판(design-canvas/v2) · 예전 구현(shots/overview/inventory.json) · 새 구현(landxi/v3 17종)을
// 기능 → 화면 → 칸(원판 → 예전 구현 → 새 구현) 3단으로 묶고 항목마다 적용 / 검토 / 폐기 를 판정한다.
// 대장은 Land-XI 자기 화면만 싣는다(2026-09-29 사용자) — 다른 회사 사이트 캡처·참고 자료는 넣지 않는다.
// 출력: landxi/proto/review/assets.json (자산 대장) · landxi/proto/review/masters.html (갤러리)
//       landxi/proto/review/screen-map.json (구현 현황판이 같은 화면 키로 묶는 매핑 — tools/review/build-status.py 가 읽음)
// 판정 기준표는 아래 MASTERS · IMPL · V3 세 표. 판정을 바꾸려면 표를 고치고 다시 굽는다.
// 실행: node tools/review/masters.mjs   (저장소 루트 · 매체는 먼저 node tools/review/ledger-media.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const OUT_DIR = 'landxi/proto/review';
const V = 'design-canvas/v2/';

// ── 1. 기능(대분류) → 화면(중분류) ─────────────────────────────────────────────
const TAX = [
  ['인증', ['로그인', '계정 신청', '아이디 찾기', '비밀번호 찾기']],
  ['메인', ['게스트 메인', '서비스 상세(공개)', '홈 초기안', '공개 사이트', '필름 제작 도구']],
  ['대시보드', ['LX 직원 대시보드', '영업 첫 화면', '사용자 대시보드', '뷰어 대시보드']],
  ['데이터 관리', ['데이터 올리기', '목록(보관·완료·공개 중)']],
  ['프로젝트', ['학습', '목록(메인)', '만들기', '만들기 검토', '개요', '삭제 모달', '데이터', '라벨링', '분석', '배포·공개', '지도 작업공간(컨셉)']],
  ['분석 서비스', ['결과 확인', '서비스 목록', '실행 검토', '실행 중', '실행 결과']],
  ['서비스 공개', ['배포·다른 지역에 적용', '승인·검토 데스크', '공개 서비스 목록', '서비스 카드 편집', '공개 요청']],
  ['XI맵', ['기본 지도', '객체 정보', '시점 비교', '검색', '도구(측정·그리기·구역·내려받기)', '지역 구분·속성 표', '보안 서약', '표류 예측']],
  ['실태조사', ['대장 융합(기관 첫 화면)', '실태조사 모드']],
  ['에이전트', ['융합 분석 질문']],
  ['통계/보고서', ['보고서', '통계']],
  ['LX 관리자', ['LX 관리자 대시보드', '인프라·기관·배포', 'LX 관리자 로그인', '생산 관리']],
  ['서비스 관리', ['사용자 관리', '공지 관리', '문의 관리', 'FAQ 관리', '지도 속성 관리']],
  ['기관 포털', ['기관 로그인', '내 서비스', '서비스 상세']],
  ['서비스 지원', ['지원·MY 서랍', '공지', 'FAQ', '문의', '활용사례', '매뉴얼']],
  ['MY', ['마이 페이지', '정보 수정', '비밀번호 변경', '브랜드(CI)', '저장 공간', '탈퇴']],
  ['글로벌', ['해외 서비스', '해외 기관 로그인']],
  ['공통', ['공용 부품 모음', '상태 패턴(로딩·오류)', '디자인 실험']],
];
const SCREEN_KEYS = new Set(TAX.flatMap(([f, ss]) => ss.map((s) => `${f}/${s}`)));
const VERDICTS = ['적용', '검토', '폐기'];

// 표 파서 — '#' 줄 = 묶음 기본값(화면 | 판정 | 대상 | 근거 | 다음 단계), 항목 줄 = id | 이름 [| 판정 | 대상 | 근거 | 다음 단계]
// 대상: 적용 → 들어간 구현 경로(쉼표로 여럿) · 폐기 → 대체한 것 · 검토 → 어느 차수에서 무엇으로
function table(src) {
  const rows = []; let g = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const cells = line.replace(/^#\s*/, '').split('|').map((s) => s.trim());
    if (line.startsWith('#')) { const [screen, verdict, target, reason, later] = cells; g = { screen, verdict, target, reason, later }; continue; }
    const [id, name, verdict, target, reason, later] = cells;
    rows.push({ id, name, screen: g.screen, verdict: verdict || g.verdict, target: target || (verdict && verdict !== g.verdict ? '' : g.target), reason: reason || g.reason, later: later ?? g.later ?? '' });
  }
  return rows;
}

// ── 2. 원판(아트보드) 판정표 ─────────────────────────────────────────────────
const MASTERS = table(`
# 인증/로그인 | 적용 | landxi/proto/login.html | 8/27 구 Land-XI 구도·실제 CI 로 확정 → 구현 | F3 B0: v3 로그인(landxi/v3/login)으로 이관
B5-Login | 로그인 — 좌 디오라마 영상 / 우 폼
B2-Login | 로그인 — 플랫폼 소개(1차) | 폐기 | B5-Login | 8/26 3차 피드백 '플랫폼 소개가 아니다' → B5 구도로 교체 |
# 인증/계정 신청 | 적용 | landxi/proto/signup.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 신청은 로그인 서랍으로 축소
B6-Auth-Signup-1 | 1단계 · 약관
B6-Auth-Signup-1-Init | 1단계 · 처음
B6-Auth-Signup-2 | 2단계 · 정보 입력
B6-Auth-Signup-2-Error | 2단계 · 입력 오류
B6-Auth-Signup-3 | 3단계 · 완료
# 인증/아이디 찾기 | 적용 | landxi/proto/find-id.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 로그인 서랍으로 축소
B6-Auth-FindId | 입력
B6-Auth-FindId-Error | 입력 오류
B6-Auth-FindId-Fail | 찾기 실패
B6-Auth-FindId-Result | 결과 | 적용 | landxi/proto/find-id-result.html
# 인증/비밀번호 찾기 | 적용 | landxi/proto/find-password.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 로그인 서랍으로 축소
B6-Auth-FindPw | 입력
B6-Auth-FindPw-Error | 입력 오류
B6-Auth-FindPw-Fail | 찾기 실패
B6-Auth-FindPw-Result | 결과 | 적용 | landxi/proto/find-password-result.html

# 메인/홈 초기안 | 폐기 | scrub-main | 8/27 메인은 스크럽 필름 구현본이 원판 |
B2-HomeFilm | 홈 — 필름 스테이지(카피 판)
B2-HomeAtlas | 홈 — 필름 뒤 아틀라스 | 폐기 | scrub-main | D28 A3 ② 채택 — 사례·문의는 서비스 지원으로, 메인엔 푸터만 |

# 대시보드/LX 직원 대시보드 | 폐기 | B5-Dashboard-Data | 대시보드 전 단계 안 |
B5-Dashboard-Data | 대시보드 — 전국 한 판 · 학습데이터 토글 | 적용 | landxi/proto/dashboard.html | 8/27 12.8 전국 판 적용판 | F3 §5: 대시보드 폐지 → v3 LX 직원 대시보드 '오늘' 띠로 대체 예정
B5-Dashboard | 관리자 대시보드 — AI 결과 토글 | 폐기 | B5-Dashboard-Data | 9/21 계정 3단 분리·9/24 직원 화면 전환으로 관리 위젯 제거 — 같은 판은 적용판이 대표 |
B4-Dashboard | 전면 개편 4차 — 124px 진술·검정 반전 | 폐기 | B5-Dashboard-Data | 8/27 B5 로 대체 · 검정 반전·큰 진술은 9/27 결정(관리자 검정 톤 폐기·내부 지표 과장 금지)과도 충돌 |
B3-Dashboard | 축소 현황 원장(지도 없음) | 폐기 | B4-Dashboard | 8/26 7차 피드백 '기존과 별반 다를 게 없다' |
B2-Dashboard | A안 지도 위 원장 | 폐기 | B3-Dashboard | 8/26 '대시보드 지도 없음(보여줄 공간 데이터 부족)' 결정으로 축소 |
H-Dashboard-128 | 12.8 초안 — AI 결과 토글(개인 PC) | 폐기 | B5-Dashboard-Data | 현 적용판의 전 단계 초안 |
H-Dashboard-Data-128 | 12.8 초안 — 학습데이터 토글(개인 PC) | 폐기 | B5-Dashboard-Data | 현 적용판의 전 단계 초안 |
# 대시보드/사용자 대시보드 | 검토 | F3 B1 — 역할별 첫 화면('오늘' 띠) 설계 때 흡수 여부 결정 | D17 원본 dashboard2 1:1 — 아직 구현 안 됨 |
B5-Dashboard-User | 사용자(직원) 대시보드
# 대시보드/뷰어 대시보드 | 검토 | F3 B2 — 기관 서비스 첫 화면(v3 gov-fusion)의 결과 탭 참고 | D17 원본 dashboard3 1:1 — 아직 구현 안 됨 |
B5-Dashboard-Viewer | 뷰어 대시보드

# 데이터 관리/목록(보관·완료·공개 중) | 적용 | landxi/proto/dataset.html | 발주 확정안(Roboflow 그리드 × 아카이브/완료/공개 중) → 구현 | F3 B4: v3 LX 직원 대시보드 데이터 올리기 서랍으로 흡수
B5-DataMgmt | 목록 — 이미지 그리드 + 우 패널
B3-DataMgmt | 4탭 파이프라인 원장 | 폐기 | B5-DataMgmt | 8/26 6차 피드백 후 B5 로 확정 |
B2-DataMgmt-List | 2차 안 — 아카이브/완료/공개 중 | 폐기 | B5-DataMgmt | 8/26 6차 '기존과 거의 똑같다' |
# 데이터 관리/데이터 올리기 | 적용 | landxi/proto/dataset.html?tab=upload | 발주 확정안 업로드 탭 → 구현 | F3 B4: 데이터 올리기 서랍
B5-DataMgmt-Upload | 업로드 탭
B2-DataMgmt-Upload | 2차 안 — 업로드 | 폐기 | B5-DataMgmt-Upload | 8/26 6차 '기존과 거의 똑같다' |

# 프로젝트/목록(메인) | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 프로젝트 8단계 완전체 구현 | F3 B4: 8단계 → 라벨·학습·모델 3으로 축소, v3 LX 직원 대시보드 서랍
B5-Projects | 목록 + 우 프로젝트 조회
B7-Projects-Empty | 목록 0건
B7-Projects-NoResult | 검색 0건
H-Projects-Roboflow | 목록 초안 — 만들기 드로어(개인 PC) | 폐기 | B5-Projects | B5 원판의 전 단계 초안 |
B2-Projects | 2차 안 — 목록 + 워크플로우 캔버스 | 폐기 | B5-Projects | 8/25 '워크플로우가 업무 시스템' 거부 → B5 로 교체 |
# 프로젝트/만들기 | 적용 | landxi/proto/ai-project-create.html | D5 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 학습 서랍
B5-Project-Create | 만들기 — 한 화면 폼
# 프로젝트/만들기 검토 | 적용 | landxi/proto/ai-project-create.html | D5 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 학습 서랍
B5-Project-Create-Review | 만들기 검토
# 프로젝트/개요 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Project-Overview | 개요(허브 탭 1)
B7-Project-Overview-Edit | 개요 수정
B7-Project-Overview-Members | 구성원
B7-Project-Invite | 구성원 초대
B7-Project-Invite-Error | 초대 오류
H-Project-Overview-Roboflow | 개요 초안 — 고정 헤더 + 탭 6(개인 PC) | 폐기 | B5-Project-Overview | B5 원판의 전 단계 초안 |
# 프로젝트/삭제 모달 | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Project-Delete | 삭제 확인
# 프로젝트/데이터 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 데이터 올리기
B5-Project-Data | 데이터(파일 · 데이터셋)
B7-Project-File-Add | 파일 추가
B7-Project-File-Progress | 업로드 진행 중
B7-Project-File-Fail | 업로드 실패
B7-Project-Dataset-Create | 데이터셋 만들기
B7-Project-Dataset-Detail | 데이터셋 상세
H-Project-Data-Roboflow | 데이터 탭 초안 — 5열 그리드(개인 PC) | 폐기 | B5-Project-Data | B5 원판의 전 단계 초안 |
# 프로젝트/라벨링 | 적용 | landxi/proto/ai-project-label.html | D5·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 학습
B5-Project-Labeling | 라벨링 + 클래스 편집기
B7-Project-Labeling-Fix | 툴바 겹침 수정판
# 프로젝트/학습 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 학습
B5-Project-Train | 학습 워크플로우
B7-Project-Train-New | 새로 학습하기
B7-Project-Train-Running | 학습 진행 중
B7-Project-Train-Fix | 학습 화면 겹침 수정판
B7-Project-Model-Register | 모델 등록(추정)
B7-Project-Model-Registered | 모델 등록됨(추정)
# 프로젝트/분석 | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Project-Analysis | 분석 탭
# 프로젝트/배포·공개 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드 배포·다른 지역에 적용
B5-Project-Deploy | 배포 · 공개 폼
B7-Project-Deploy-Picker | 공개할 학습결과 선택
# 프로젝트/지도 작업공간(컨셉) | 폐기 | B6-MapWork-Opt3 | D27 권장안(선택 3) 자동 채택(9/20) |
B6-MapWork-Opt3 | 선택 3 · 레이어가 곧 작업(권장) | 검토 | LX 직원 대시보드(landxi/v3/lx-console) — 지도 위 단계 서랍이 같은 생각, 흡수 여부 판정 | D27 권장안 — 따로 만들지 않음 |
B6-MapWork-Opt1 | 선택 1 · 파이프라인 도크
B6-MapWork-Opt2 | 선택 2 · 단계 분할

# 분석 서비스/서비스 목록 | 적용 | landxi/proto/analysis-ai.html | D10·D29 원판 → 9/20 구현 | F3 B4: v3 LX 직원 대시보드 서비스 만들기(카탈로그)
B5-Analysis-List | 서비스 홈 — 카드 15 + 우 정보
B7-Analysis-List | 목록 — 아직 결과 없는 카드 표기
# 분석 서비스/실행 검토 | 적용 | landxi/proto/analysis-ai.html?tab=run | D10 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Analysis-Run-Review | 실행 검토 — 영상 중심
# 분석 서비스/실행 중 | 적용 | landxi/proto/analysis-ai.html?tab=running | D10·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Analysis-Run-Progress | 실행 중 — 영상별 진행
B7-Analysis-Progress-Overlay | 진행 오버레이
# 분석 서비스/실행 결과 | 적용 | landxi/proto/analysis-ai.html?tab=done | D10·D29 원판 → 9/20 구현 | F3 B4 LX 직원 대시보드
B5-Analysis-Result | 실행 결과 — 정사영상 + 청록 결과
B7-Analysis-Result-Edit | 결과 편집
B7-Analysis-Share | 공유 설정

# 서비스 공개/승인·검토 데스크 | 적용 | landxi/proto/admin-publish.html | D24 권장안(선택 3 분할 검토 데스크) 자동 채택 → 9/20 구현 | F3 B3: v3 LX 관리자 대시보드 결재함 · 9/27 밝은 톤 재조정
B6-Publish-Opt3 | 선택 3 · 분할 검토 데스크(권장)
B6-Publish-Opt1 | 선택 1 · 원장 + 드로어 | 폐기 | B6-Publish-Opt3 | D24 권장안(선택 3) 자동 채택 |
B6-Publish-Opt2 | 선택 2 · 상태 열 보드 | 폐기 | B6-Publish-Opt3 | D24 권장안(선택 3) 자동 채택 |
B6-Publish-List | 승인 목록
B6-Publish-List-Empty | 승인 목록 0건
B6-Publish-List-Pending | 승인 대기
B6-Publish-Review-Analysis | 검토 · 분석
B6-Publish-Review-ClassModal | 검토 · 클래스 모달
B6-Publish-Review-Edit | 검토 · 수정
B6-Publish-Review-Labeling | 검토 · 라벨링
B6-Publish-Review-Members | 검토 · 구성원
B6-Publish-Review-Process | 검토 · 처리
B6-Publish-Review-Reject | 검토 · 반려 입력
B6-Publish-Review-Rejected | 검토 · 반려됨
B6-Publish-Review-Train | 검토 · 학습
# 서비스 공개/공개 서비스 목록 | 적용 | landxi/proto/ai-card.html | D24 자동 채택 → 9/20 구현 | F3 B4: v3 LX 직원 대시보드 서비스 만들기
B6-Publish-Cards | 카드 목록
B6-Publish-Cards-Empty | 카드 0건
# 서비스 공개/서비스 카드 편집 | 적용 | landxi/proto/ai-card-edit.html | D24 자동 채택 → 9/20 구현 | F3 B4 LX 직원 대시보드 서비스 만들기
B6-Publish-Card-Edit | 카드 편집
B6-Publish-Card-Edit-Locked | 편집 잠김
# 서비스 공개/공개 요청 | 적용 | landxi/proto/ai-publish-create.html | D24 자동 채택 → 9/20 구현 | F3 §5: 공개 요청 폼 폐지 예정 → 카탈로그 매트릭스
B6-Publish-Request | 공개 요청

# XI맵/기본 지도 | 폐기 | 새 XI맵 landxi/xi (F1·F2) — 9/27 레일 정본화(F2-R) | 구 XI맵(proto/ximap)에 들어갔던 판 — 레일이 새 XI맵으로 옮겨감 |
B5-Map | 기본 — V-World 실타일 + 레이어 카드 + 시점 스트립
B2-XiMap | XI맵 초안 — 분석 지도 | 폐기 | B5-Map | 원본 기능의 1/4 · 임계/스캔은 원본에 없음(NOTES §20) |
B7-Map-Basemap | 배경지도 선택
B7-Map-LayerTab | 레이어 탭 펼침
B7-Map-Empty | 레이어 0 | 검토 | 새 XI맵(landxi/v3/xi-clean) 빈 지역 상태 — '영상 등록 필요' 다음 행동 | 새 XI맵에 같은 상태 설계 없음 |
B7-Map-Loading | 로딩 | 검토 | 새 XI맵(landxi/v3/xi-clean) 로딩 상태 — 캐릭터와 함께 | 새 XI맵에 같은 상태 설계 없음 |
# XI맵/객체 정보 | 검토 | 새 XI맵(landxi/v3/xi-clean) HUD — 객체 정보 콜아웃 문법 재사용 여부 | 구 XI맵에만 들어감 · 새 XI맵 이관 미정 |
B5-Map-Info | 객체 정보 — 브래킷 콜아웃 + 탐지 정보
# XI맵/시점 비교 | 폐기 | 새 XI맵 시점 스와이프(landxi/xi) | 구 XI맵 판 — 새 XI맵이 같은 기능을 가짐 |
B5-Map-Compare | 겹쳐보기 — 두 시점 스와이프
B7-Map-Parallel | 나란히 보기
# XI맵/검색 | 폐기 | 새 XI맵 검색(landxi/xi) | 구 XI맵 판 — 새 XI맵이 같은 기능을 가짐 |
B7-Map-Search | 검색
B7-Map-Search-Empty | 검색 0건 | 검토 | 새 XI맵(landxi/v3/xi-clean) — 0건 안내 한 줄 | 새 XI맵에 0건 상태 설계 없음 |
# XI맵/도구(측정·그리기·구역·내려받기) | 검토 | 새 XI맵(landxi/v3/xi-clean) '도구 7' 재구현 때 옮겨 넣기 | 원본 기능 — 새 XI맵에 아직 없음 |
B7-Map-Measure | 측정
B7-Map-Draw | 그리기
B7-Map-AOI | 관심 구역
B7-Map-Download | 내려받기
# XI맵/지역 구분·속성 표 | 검토 | 기관 할 일·보고서(landxi/v3/gov-report) 시군구 집계 | 구 XI맵에만 들어감 · 새 XI맵 이관 미정 |
B7-Map-Region | 지역 구분(읍면동 5분위)
B7-Map-Table | 속성 표 펼침
# XI맵/보안 서약 | 검토 | 새 XI맵(landxi/v3/xi-clean) — 원본 기능 옮겨 넣기(내려받기 전 서약) | 원본 기능 — 새 XI맵에 없음 |
B7-Map-Pledge | 보안 서약서
B7-Map-Pledge-Busy | 서약 처리 중

# 통계/보고서/통계 | 적용 | landxi/proto/stats-standard.html | D29 선택 1(지도 안 우 서랍) 자동 채택 → 9/20 구현 | F3 B2: v3 서비스 보고서 서랍
B7-Stats-Opt1 | 선택 1 · 지도 안 우 서랍(권장)
B7-Stats-Opt2 | 선택 2 · 전면 보고서형 | 폐기 | B7-Stats-Opt1 | D29 선택 1 자동 채택 |
B7-Stats-Opt3 | 선택 3 · 하단 시트 + 스크러버 | 폐기 | B7-Stats-Opt1 | D29 선택 1 자동 채택 |
B7-Stats-Class | 클래스별
B7-Stats-Find | 찾기
B7-Stats-Empty | 0건
# 통계/보고서/보고서 | 적용 | landxi/proto/report-standard.html | D29 원판 → 9/20 구현 | F3 B2: v3 서비스 보고서 서랍
B7-Report-List | 보고서 목록
B7-Report-List-Empty | 보고서 0건
B7-Report-Pledge | 보고서 서약
B7-Report-Issue | 오류 신고 | 적용 | landxi/proto/report-standard-issue.html
B7-Report-Issue-Error | 신고 입력 오류 | 적용 | landxi/proto/report-standard-issue.html

# 서비스 관리/사용자 관리 | 적용 | landxi/proto/admin-users.html | D25 권장안(선택 2) 자동 채택 → 9/20 구현 | F3 B3: v3 LX 관리자 대시보드 5메뉴 · 9/27 밝은 톤 재조정
B6-Admin-Users-Opt2 | 선택 2 · 목록 + 우 열람(권장)
B6-Admin-Users-Opt1 | 선택 1 · 승인 띠 + 10열 원장 | 폐기 | B6-Admin-Users-Opt2 | D25 권장안(선택 2) 자동 채택 |
B6-Admin-Users-Opt3 | 선택 3 · 승인 데스크 + 카드 보드 | 폐기 | B6-Admin-Users-Opt2 | D25 권장안(선택 2) 자동 채택 |
B6-Admin-Users-Approve | 가입 승인
B6-Admin-Users-Detail | 사용자 상세
B6-Admin-Users-Empty | 0명
B6-Admin-Users-Login | 접속 이력
B6-Admin-Users-Login-Empty | 접속 이력 0건
B6-Admin-Users-Pwd | 비밀번호 초기화
B6-Admin-Users-Pwd-Empty | 초기화 요청 0건
# 서비스 관리/공지 관리 | 적용 | landxi/proto/admin-notice.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 LX 관리자 대시보드 설정 · 9/27 밝은 톤
B6-Admin-Notice | 공지 목록
B6-Admin-Notice-Form | 공지 작성
B6-Admin-Notice-Form-Error | 작성 오류
B6-Admin-Notice-Delete | 삭제 확인
# 서비스 관리/문의 관리 | 적용 | landxi/proto/admin-inquiry.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 LX 관리자 대시보드 설정 · 9/27 밝은 톤
B6-Admin-Inquiry | 문의 목록
B6-Admin-Inquiry-Reply | 답변
# 서비스 관리/FAQ 관리 | 적용 | landxi/proto/admin-faq.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 LX 관리자 대시보드 설정 · 9/27 밝은 톤
B6-Admin-Faq | FAQ 목록
B6-Admin-Faq-Form | FAQ 작성
# 서비스 관리/지도 속성 관리 | 적용 | landxi/proto/admin-map.html | D25 자동 채택 → 9/20 구현 | F3 B1: XI맵으로 흡수
B6-Admin-Map | 지도 속성 — 실시간 미리보기
B6-Admin-Map-Edit | 속성 수정

# 서비스 지원/공지 | 적용 | landxi/proto/notice.html | D23 권장안(선택 2) 자동 채택 → 9/20 구현 | F3 B5: '?' 서랍으로 축소
B6-Support-Notice-Opt2 | 선택 2 · 건수 타일 + 목록/열람(권장)
B6-Support-Notice-Opt1 | 선택 1 · 표 + 제자리 펼침 | 폐기 | B6-Support-Notice-Opt2 | D23 권장안(선택 2) 자동 채택 |
B6-Support-Notice-Opt3 | 선택 3 · 3열 보드 + 서랍 | 폐기 | B6-Support-Notice-Opt2 | D23 권장안(선택 2) 자동 채택 |
B6-Support-Notice-Detail | 공지 상세
B6-Support-Notice-Empty | 공지 0건
# 서비스 지원/FAQ | 적용 | landxi/proto/faq.html | D23 자동 채택 → 9/20 구현 | F3 B5: '?' 서랍
B6-Support-FAQ | FAQ
B6-Support-FAQ-Empty | FAQ 0건
# 서비스 지원/문의 | 적용 | landxi/proto/contact.html | D23 자동 채택 → 9/20 구현 | F3 B5: '?' 서랍
B6-Support-Contact | 문의하기
B6-Support-Contact-Empty | 문의 0건
B6-Support-Contact-Error | 입력 오류
B6-Support-Contact-Cancel | 취소 확인
B6-Support-Contact-View | 문의 열람
B6-Support-Contact-View-Pending | 답변 대기
# 서비스 지원/활용사례 | 적용 | landxi/proto/usecase.html | D23 자동 채택 → 9/20 구현 | F3 B5: '?' 서랍 · 메인 소개 챕터와 겹침 정리
B6-Support-Usecase | 활용사례
B6-Support-Usecase-Empty | 활용사례 0건
B6-Support-Usecase-Modal | 사례 상세 모달
# 서비스 지원/매뉴얼 | 적용 | landxi/proto/manual.html | D23 자동 채택 → 9/20 구현(본문은 원본이 비어 결손 표기) | F3 B5: '?' 서랍
B6-Support-Manual | 매뉴얼

# MY/마이 페이지 | 적용 | landxi/proto/mypage.html | D26 권장안(선택 1) 자동 채택 → 9/20 구현 | F3 B5: MY 서랍
B6-My-Opt1 | 선택 1 · 신원 원장 + 디스크 판(권장)
B6-My-Opt2 | 선택 2 · 현황 밴드 + 세로 스택 | 폐기 | B6-My-Opt1 | D26 권장안(선택 1) 자동 채택 |
B6-My-Opt3 | 선택 3 · 설정 작업공간 | 폐기 | B6-My-Opt1 | D26 권장안(선택 1) 자동 채택 |
B6-My-Flyout | MY 플라이아웃
B6-My-History-Empty | 신청 이력 0건
# MY/정보 수정 | 적용 | landxi/proto/mypage.html | D26 자동 채택 → 9/20 구현 | F3 B5: MY 서랍
B6-My-Edit | 정보 수정
B6-My-Edit-Error | 입력 오류
B6-My-Edit-Saved | 저장됨
# MY/비밀번호 변경 | 적용 | landxi/proto/mypage.html | D26 자동 채택 → 9/20 구현 | F3 B5: MY 서랍
B6-My-PwdConfirm | 현재 비밀번호 확인
B6-My-PwdConfirm-Error | 확인 오류
B6-My-Password | 새 비밀번호
B6-My-Password-Error | 입력 오류
B6-My-Password-Saved | 변경됨
# MY/브랜드(CI) | 적용 | landxi/proto/mypage.html | D26 자동 채택 → 9/20 구현 | F3 B5: MY 서랍
B6-My-Brand | 브랜드 설정
B6-My-Brand-Empty | 미등록
B6-My-Brand-Error | 파일 오류
B6-My-Brand-Applied | 적용됨
B6-My-Brand-Reset | 되돌리기
# MY/저장 공간 | 적용 | landxi/proto/mypage.html | D26 자동 채택 → 9/20 구현 | F3 B5: MY 서랍
B6-My-Storage | 증량 신청
B6-My-Storage-Done | 신청 완료
B6-My-Storage-Error | 신청 오류
# MY/탈퇴 | 적용 | landxi/proto/mypage.html | D26 자동 채택 → 9/20 구현(원본 UI 없음 — 추정 1장) | F3 B5: MY 서랍
B6-My-Withdraw | 계정 탈퇴(추정)

# 공통/상태 패턴(로딩·오류) | 적용 | landxi/proto/ai-project.html | D29 원판 → 9/20 로딩·오류 패턴 구현 | 27화면 재구현: 빈 상태·로딩은 캐릭터와 합침
B7-State-Loading | 로딩 패턴
B7-State-Error | 오류 패턴
`);

// ── 3. 구현 화면 판정표 (shots/overview/inventory.json 의 id) ───────────────────
// id | 화면 | 판정 | 대상 | 근거 | 다음 단계    — 적용이면 대상은 비워 두면 자기 경로
// 2026-09-29 통합: 로그인 → 역할별 첫 화면이 새 화면(landxi/v3)으로 연결됐다. 예전 화면(v1 · v2)은 메뉴에서 빠지고 파일만 남는다
// → 예전 구현은 '폐기(대신: 그 기능을 넘겨받은 새 화면)'. 새 화면 17종은 아래 V3 표.
const IMPL = table(`
# 인증/로그인 | 적용 | | 현재 로그인 — 역할 라디오·목 인증 | F3 B0: v3 로그인(실인증)으로 교체
proto-login | 로그인(v1)
# 인증/계정 신청 | 적용 | | 현재 화면 — 신청 저장 없음 | F3 B0: 로그인 서랍으로 축소
proto-signup | 계정 신청(v1)
# 인증/아이디 찾기 | 적용 | | 현재 화면 — 조회 로직 없음 | F3 B0: 로그인 서랍으로 축소
proto-find-id | 아이디 찾기(v1)
proto-find-id-result | 아이디 찾기 결과(v1)
# 인증/비밀번호 찾기 | 적용 | | 현재 화면 — 조회 로직 없음 | F3 B0: 로그인 서랍으로 축소
proto-find-password | 비밀번호 찾기(v1)
proto-find-password-result | 비밀번호 찾기 결과(v1)
# 메인/게스트 메인 | 적용 | | 메인 원판 = 구현본(14 leg + 브랜드 마감) | 9/29 새 게스트 메인이 첫 주소 — 필름은 메인 필름으로 계속 봄
scrub-main | 스크럽 필름(구현본)
# 메인/공개 사이트 | 적용 | | 게스트 공개 페이지 | 서비스 카드 모양 교체
site-platform | 활용 서비스
site-usecase | 활용 사례
site-notice | 공지사항
# 메인/필름 제작 도구 | 적용 | | 필름 검토용 내부 도구 |
film-timeline | 필름 타임라인
film-anchors | 앵커 스틸
# 대시보드/LX 직원 대시보드 | 적용 | | 현재 LX 직원 첫 화면 — 전국 한 판 | F3 §5: 대시보드 폐지 → v3 LX 직원 대시보드 '오늘' 띠
proto-dashboard | 대시보드(v1)
# 데이터 관리/목록(보관·완료·공개 중) | 적용 | | 현재 화면 — 고정값 | F3 B4: v3 LX 직원 대시보드 데이터 올리기 서랍
proto-dataset | 데이터 관리(v1)
# 프로젝트/목록(메인) | 적용 | | 현재 화면 — 8단계 탭 · 고정값 | F3 B4: v3 LX 직원 대시보드 서랍(라벨·학습·모델 3)
proto-ai-project | 프로젝트(v1)
# 프로젝트/만들기 | 적용 | | 현재 화면 — 고정값 | F3 B4 LX 직원 대시보드
proto-ai-project-create | 프로젝트 만들기(v1)
# 프로젝트/라벨링 | 적용 | | 현재 화면 — 고정값 | F3 B4 LX 직원 대시보드 학습
proto-ai-project-label | 라벨링(v1)
# 프로젝트/학습 | 폐기 | proto-ai-project | 레일에서 닿지 않음 · 8/25 '워크플로우가 너무 업무 시스템' 거부 |
proto-workflow | 국토 조사 보드(8/25 워크플로우)
# 분석 서비스/서비스 목록 | 적용 | | 현재 화면 — 실행 검토·실행 중·결과 탭 포함 · 고정값 | F3 B4: LX 직원 대시보드 서비스 만들기
proto-analysis-ai | 분석 서비스(v1)
# 서비스 공개/승인·검토 데스크 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 LX 관리자 대시보드 결재함
proto-admin-publish | 카드 발행 관리(v1)
# 서비스 공개/공개 서비스 목록 | 적용 | | 현재 화면 — 고정값 | F3 B4 LX 직원 대시보드 서비스 만들기
proto-ai-card | 카드 목록(v1)
# 서비스 공개/서비스 카드 편집 | 적용 | | 현재 화면 — 고정값 | F3 B4 LX 직원 대시보드 서비스 만들기
proto-ai-card-edit | 카드 편집(v1)
# 서비스 공개/공개 요청 | 적용 | | 현재 화면 — 고정값 | F3 §5: 공개 요청 폼 폐지 예정
proto-ai-publish-create | 발행 요청(v1)
# XI맵/기본 지도 | 적용 | | 새 XI맵 정본 — 서버 연결 | v3 XI맵 정돈판: 글 60% 삭감·개발 정보 제거(9/27)
xi-read-staff | XI맵 · LX 직원(v2)
xi-public | XI맵 · 공개(v2)
xi-sales | XI맵 · 영업(v2)
proto-ximap | 구 XI맵(v1) | 폐기 | xi-read-staff | 9/27 레일 정본화(F2-R) — 지도 서비스 = 새 XI맵 |
# XI맵/표류 예측 | 폐기 | F3 §5 폐지 목록(레일 밖) | 레일에서 닿지 않는 단독 실험 화면 |
proto-map-drift | 괭생이모자반 도착 예측(v1)
# 실태조사/실태조사 모드 | 적용 | | 새 XI맵 실태조사 — 서버 연결 | 9/27 '남원 한정 금지' — 지역 = 변수로, v3 대장 융합과 합침
xi-survey-staff | 실태조사 · LX 직원(v2)
xi-survey-namwon | 실태조사 · 기관(v2)
# 에이전트/융합 분석 질문 | 적용 | | 새 XI맵 에이전트 — vLLM 연결 | 9/27 재정의: 업로드 행정데이터 × AI 융합 → v3 gov-fusion ⌘K
xi-agent | 에이전트(v2)
# 통계/보고서/통계 | 적용 | | 현재 화면 — 고정값 | F3 B2: v3 서비스 보고서 서랍
proto-stats-standard | 통계(v1)
# 통계/보고서/보고서 | 적용 | | 현재 화면 — 고정값 | F3 B2: v3 서비스 보고서 서랍
proto-report-standard | 보고서(v1)
proto-report-standard-issue | 오류 신고(v1)
# LX 관리자/LX 관리자 로그인 | 적용 | | LX 관리자 실인증(:8702) | 9/27 검정 톤(잉크 반전) 폐기 → 밝은 톤 · F3 B0 로그인 하나로
ops-login | LX 관리자 로그인(v2)
# LX 관리자/LX 관리자 대시보드 | 적용 | | LX 관리자 화면 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → v3 LX 관리자 대시보드 밝은 톤
ops-index | 운영 현황(v2)
proto-admin-home | 관리자 운영 현황(v1) | 적용 | | 현재 관리자 첫 화면(v1) — 고정값 | F3 B1: 흡수 · LX 관리자 대시보드로 일원화
# LX 관리자/인프라·기관·배포 | 적용 | | LX 관리자 화면 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → 밝은 톤 · 성능 수치는 LX 관리자 대시보드 한 곳에만
ops-infra | 인프라(v2)
# LX 관리자/인프라·기관·배포 | 적용 | | LX 관리자 화면 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → 밝은 톤 · 링 8 → 3
ops-tenants | 기관·할당(v2)
# LX 관리자/인프라·기관·배포 | 적용 | | LX 관리자 화면 정본(:8702) — 부분 구현 | 9/27 검정 톤 폐기 → 밝은 톤
ops-deploys | 배포 제어(v2)
# LX 관리자/생산 관리 | 적용 | | 현재 화면 — 고정값 | F3 B4: v3 LX 직원 대시보드로 흡수
proto-produce | 생산 관리(v1)
# 서비스 관리/사용자 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 LX 관리자 대시보드 메뉴 · 9/27 밝은 톤
proto-admin-users | 사용자 관리(v1)
# 서비스 관리/공지 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 LX 관리자 대시보드 설정
proto-admin-notice | 공지 관리(v1)
# 서비스 관리/문의 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 LX 관리자 대시보드 설정
proto-admin-inquiry | 문의 관리(v1)
# 서비스 관리/FAQ 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 LX 관리자 대시보드 설정
proto-admin-faq | FAQ 관리(v1)
# 서비스 관리/지도 속성 관리 | 적용 | | 현재 화면 — 고정값 | F3 B1: XI맵으로 흡수
proto-admin-map | 지도 속성 관리(v1)
# 기관 포털/기관 로그인 | 적용 | | 현재 기관 로그인 — 목 인증 | F3 B0: 로그인 하나로 통합
proto-portal-login-namwon | 기관 로그인 · 남원(v1)
proto-portal-login-gwangju-jeonnam | 기관 로그인 · 광주전남(v1)
# 기관 포털/내 서비스 | 적용 | | 현재 기관 첫 화면 — 고정값 | F3 B2: v3 서비스 화면 1 + 서랍 · 카드 덱 5장 폐지 예정
proto-portal | 내 서비스(v1)
# 기관 포털/서비스 상세 | 적용 | | 현재 기관 서비스 화면 — 고정값 | F3 B2: v3 서비스 화면으로 흡수
proto-portal-dp-nw-change | 국토 변화 탐지(v1)
proto-portal-dp-nw-farm-25 | 영농관리(v1)
proto-portal-dp-nw-living-23 | 생활환경 위험요소(v1)
proto-portal-dp-gj-marine-25 | 해양쓰레기 실태조사 25(v1)
proto-portal-dp-gj-marine-27 | 해양쓰레기 실태조사 27(v1)
proto-portal-dp-nw-crowd-27 | 인파관리(빈 자리) | 검토 | F3 B2 흡수 때 정리 — 그 전까지 '첫 결과 전' 캐릭터 | 빈 자리 — 서비스 미완 |
proto-portal-dp-nw-road-26 | 도로 안전관리(빈 자리) | 검토 | F3 B2 흡수 때 정리 — 그 전까지 '첫 결과 전' 캐릭터 | 빈 자리 — 서비스 미완 |
# 서비스 지원/공지 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-notice | 공지사항(v1)
# 서비스 지원/FAQ | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-faq | 자주 묻는 질문(v1)
# 서비스 지원/문의 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-contact | 문의하기(v1)
# 서비스 지원/활용사례 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-usecase | 활용사례(v1)
# 서비스 지원/매뉴얼 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-manual | 매뉴얼(v1)
# MY/마이 페이지 | 적용 | | 현재 화면 — 고정값 | F3 B5: MY 서랍
proto-mypage | 마이 페이지(v1)
# 글로벌/해외 기관 로그인 | 적용 | | 해외 기관 실인증 |
global-login | Global 로그인(v2)
# 글로벌/해외 서비스 | 적용 | | 해외 서비스 정본 — 서버 연결 |
global-index | 키르기스 농업부(v2)
global-index-land | 키르기스 토지청(v2)
# 공통/디자인 실험 | 폐기 | F3 §5 폐지 목록 — 개발 잔재·레일 밖 | 레일에서 닿지 않는 실험 화면 |
proto-dive | 하강 실험(8/25) | 폐기 | scrub-main | 8/25 1차 하강 실험 — 8/26 '플랫폼 소개' 피드백 뒤 스크럽 필름으로 대체 |
proto-charts | 표·차트 후보 6종(D3) | 폐기 | F3 §5 폐지 목록 | D3 비교판 — 선택 뒤 역할 끝 |
proto-fonts | 글꼴·블루 톤 후보 | 폐기 | 법전 서체(Paperlogy + Pretendard) | 9/22 서체 확정으로 역할 끝 |
proto-system | 컴포넌트 시트 | 폐기 | 법전 design/system-v2.md | F3 §5 폐지 — 법전이 대체 |
proto-shell-demo | 공용 셸 데모 | 폐기 | 공용 셸(shell.js) | F3 §5 폐지 — 셸 적용 완료 |
global-fonts-compare | Global 서체 비교 | 폐기 | Inter 글로벌 서체 | 9/26 결정(글로벌 Inter)으로 역할 끝 |
`);

// ── 4. 새 화면(landxi/v3 17종) — 9월 29일 로그인 → 역할별 첫 화면으로 연결된 현재 화면 ─────────
// 판정은 사용자가 대장의 결정 버튼으로 한다(2026-09-29). 여기 적는 판정은 초기 분류 — 새 화면은 모두 '검토'(사용자 판정 대기)로 둔다.
// id | 화면 | 이름 | 경로(index.html 폴더) | 들어가는 방법(guest · login) | 영상 | 역할별 통합 영상 스틸
const V3 = [
  ['v3-main', '메인/게스트 메인', '게스트 메인', 'main', 'guest', 'walk-guest', ['walk-guest-01-main', 'walk-guest-02-services']],
  ['v3-service-detail', '메인/서비스 상세(공개)', '서비스 상세 — 서비스 하나를 한 페이지로', 'service-detail', 'guest', 'walk-guest', ['walk-guest-03-service-detail'], '?card=card-farm'],
  ['v3-login', '인증/로그인', '새 로그인 — 왼쪽 Land-XI 소개 · 오른쪽 로그인', 'login', 'guest', 'walk-guest', ['walk-guest-04-login']],
  ['v3-lx-console', '대시보드/LX 직원 대시보드', 'LX 직원 대시보드 — 오늘 할 일 + 지도 위 단계', 'lx-console', 'login', 'walk-staff', ['walk-staff-01-console']],
  ['v3-sales', '대시보드/영업 첫 화면', '영업 첫 화면 — 시군구별로 바로 열 수 있는 서비스', 'sales', 'login', null, []],
  ['v3-lx-ingest', '데이터 관리/데이터 올리기', '데이터 올리기 — 지역별 영상 · 대장 갖춤', 'lx-ingest', 'login', 'walk-staff', []],
  ['v3-lx-train', '프로젝트/학습', '학습 — 업무별 모델', 'lx-train', 'login', 'walk-staff', []],
  ['v3-lx-review', '분석 서비스/결과 확인', '결과 확인 — 의심 필지 · 표본 · 정밀도', 'lx-review', 'login', 'walk-staff', ['walk-staff-03-review']],
  ['v3-lx-deploy', '서비스 공개/배포·다른 지역에 적용', '배포 · 다른 지역에 적용 · 서비스 관리', 'lx-deploy', 'login', 'walk-staff', ['walk-staff-02-deploy-check']],
  ['v3-xi-clean', 'XI맵/기본 지도', '새 XI맵 — 직원 · 영업 · 기관 공용', 'xi-clean', 'login', 'walk-staff', ['walk-staff-04-ximap-run']],
  ['v3-gov-fusion', '실태조사/대장 융합(기관 첫 화면)', '기관 첫 화면 — 내 대장 × AI', 'gov-fusion', 'login', 'walk-gov', ['walk-gov-01-namwon', 'walk-gov-02-ask', 'walk-gov-03-gwangju']],
  ['v3-gov-report', '통계/보고서/보고서', '기관 할 일 · 현장 배정 · 보고서', 'gov-report', 'login', 'walk-gov', []],
  ['v3-ops-core', 'LX 관리자/LX 관리자 대시보드', 'LX 관리자 대시보드 — 현황 + 결재함', 'ops-core', 'login', 'walk-admin', ['walk-admin-01-ops', 'walk-admin-02-approvals']],
  ['v3-ops-infra', 'LX 관리자/인프라·기관·배포', 'LX 관리자 — 인프라 · 기관 · 배포', 'ops-infra', 'login', 'walk-admin', ['walk-admin-03-infra']],
  ['v3-global', '글로벌/해외 서비스', '해외 기관 첫 화면', 'global', 'login', 'walk-global', ['walk-global-01-ysyk-ata', 'walk-global-02-sprawl']],
  ['v3-help-my', '서비스 지원/지원·MY 서랍', "'?' 지원 · MY 서랍 — 공지 · 자주 묻는 질문 · 문의 · 내 계정", 'help-my', 'login', null, []],
  ['v3-kit', '공통/공용 부품 모음', '공용 부품 모음 — 모든 새 화면이 같이 쓰는 부품', 'kit', 'login', null, []],
].map(([id, screen, name, dir, door, video, walk, q]) => ({ id, screen, name, dir, door, video, walk, q: q || '' }));
// 코어 차수(9월 29일 코어 · 9월 30일 AI 도우미)에서 손본 새 화면 — 카드에 '9월 30일 바뀜' 한 줄
const V3_CHANGED = new Set(['gov-fusion', 'gov-report', 'lx-deploy', 'lx-ingest', 'lx-review', 'ops-core', 'ops-infra', 'service-detail', 'xi-clean', 'global', 'kit', 'login', 'lx-console']);

// ── 4-2. 코어 차수 자산 — 코어 영상 2편 + 코어별 증거 장면(로그인 폼으로 들어가 찍은 실제 화면) ─────────
// 초기 분류는 모두 '검토'(판정은 사용자). 매체: node tools/review/ledger-media.mjs --only=core → assets-thumbs/core-*.webp
// id | 화면 | 이름(사용자 말) | 코어 | 날짜 | 영상 파일(없으면 스틸) | 영상 포스터
const CORE_ITEMS = [
  ['core-walk', '서비스 공개/배포·다른 지역에 적용', '코어 영상 1 — 한 흐름: LX 직원 적용(구례군) → LX 관리자 승인 → 전역 AI 분석 → 대장 올리기 · 질문(목포) → 보고서 초안 → 관리자 사용량', ['C1', 'C3', 'C4', 'C6', 'C7'], '2026-09-29', 'core-walk', 'core-c7-apply'],
  ['c2-walk', '에이전트/융합 분석 질문', '코어 영상 2 — AI 도우미: 말로 XI맵 열기 · 전역 AI 분석 · 읍면동 차트(함양) → 대장 × AI(구례) → 법령 조문 · 영상 설명 · 보고서 초안(남원) → LX 관리자 운영 요약', ['C2', 'C1', 'C4', 'C6'], '2026-09-30', 'c2-walk', 'core-c2-chart'],
  ['core-c1-ingest', '데이터 관리/데이터 올리기', '데이터 올리기 — 남원시 영상 4시점 · 대장 갖춤을 한눈에', ['C1', 'C5'], '2026-09-29'],
  ['core-c1-xi', 'XI맵/기본 지도', 'XI맵 — 강진군 현장 확인 필요 633필지가 지도에 차오름', ['C1', 'C3'], '2026-09-30'],
  ['core-c2-move', '에이전트/융합 분석 질문', "말로 지도 제어 — '구례군 산동면으로 이동해 줘'", ['C2'], '2026-09-30'],
  ['core-c2-chart', '에이전트/융합 분석 질문', '말로 분석 + 바로 차트 — 남원시 읍면동별 의심 필지', ['C2', 'C1'], '2026-09-30'],
  ['core-c2-law', '에이전트/융합 분석 질문', '법령 근거 — 농지 임대 조문 원문 인용(농지법)', ['C2'], '2026-09-30'],
  ['core-c2-vlm', '에이전트/융합 분석 질문', '영상 설명 — 필지 영상 조각 + 설명 + 오탐 가능성', ['C2'], '2026-09-30'],
  ['core-c2-report', '통계/보고서/보고서', '말로 보고서 초안 — 구례군 실태조사 초안 내려받기', ['C2', 'C3'], '2026-09-30'],
  ['core-c2-ops', 'LX 관리자/LX 관리자 대시보드', 'LX 관리자 운영 요약 — 기관별 AI 도우미 사용량(영어로 물음)', ['C2', 'C6'], '2026-09-30'],
  ['core-c2-en', '글로벌/해외 서비스', '해외 기관 — 영어로 묻고 영어로 답(키르기스 농업부)', ['C2', 'C8'], '2026-09-30'],
  ['core-c3-yeosu', '통계/보고서/보고서', '실태조사 — 여수시 의심 필지 10,506건(모든 화면 같은 값)', ['C3'], '2026-09-30'],
  ['core-c4-cols', '실태조사/대장 융합(기관 첫 화면)', '대장 올리기 — 열 자동 인식(구례군)', ['C4'], '2026-09-30'],
  ['core-c4-joined', '실태조사/대장 융합(기관 첫 화면)', '대장 × AI — 구례군 대장은 농지 · AI는 건물 245필지', ['C4', 'C3'], '2026-09-30'],
  ['core-c6-infra', 'LX 관리자/인프라·기관·배포', '인프라 — 장비 · 언어 모델 · 법령 색인을 한 화면에', ['C6', 'C2'], '2026-09-30'],
  ['core-c7-apply', '서비스 공개/배포·다른 지역에 적용', '다른 지역에 적용 — LX 직원이 여수시에 서비스 적용 요청', ['C5', 'C7'], '2026-09-29'],
  ['core-c7-flow', 'LX 관리자/LX 관리자 대시보드', '한 흐름 — 적용 요청부터 기관 결과까지 한 줄로(여수시)', ['C7', 'C6'], '2026-09-29'],
].map(([id, screen, name, cores, date, video, poster]) => ({ id, screen, name, cores, date, video, poster }));

// ── 4-3. 코어 C1–C9 묶음 보기 — docs/CORE.md '상태 추적'(2026-09-30 · AI 도우미 차수 끝)과 같은 내용을 사용자 말로(경로 · 내부 코드 뺌)
// 코어 | 이름 | 지금 | 막힌 것 | 관련 자산 id(코어 증거 + 새 화면)
const CORES = [
  ['C1', 'XI맵 — 전역 AI 추론', "시군구를 고르면 '전역 분석'으로 영상 · 모델을 서버가 골라 읍면동 순으로 결과가 차오릅니다. 등록 영상 층이 등록된 모든 시군구에서 그려지고(여주 · 보령 · 문경 · 함양 · 보은 확인), 말로 전역 분석을 실행합니다(산청 · 함양).", "등록 영상 지역에서 읍면동 · 그린 범위 분석이 '영상 등록 필요'로 막힘 · '전역' 답이 영상이 덮는 곳만 분석한다는 말을 안 함 · XI맵 전국 머리에 규칙 기호가 보임", ['core-walk', 'core-c1-ingest', 'core-c1-xi', 'core-c2-chart', 'v3-xi-clean', 'v3-lx-ingest']],
  ['C2', 'vLLM 기반 GeoAI 서비스(AI 도우미)', "말로 지도 제어(지역 · 확대 · 층 · 3D) · 말로 분석 실행과 바로 차트 · 올린 대장 × AI 질의 · 보고서 초안 · 법령 조문 원문 인용(7개 법령) · 영상 설명과 오탐 가능성 · 영어 답 · LX 관리자 운영 요약이 화면에서 동작합니다. 숫자는 분석 결과에서만 나오고, AI 도우미 사용량은 기관 사용량으로 합산됩니다. 국산 모델은 설정만('연결 전').", "실증에서 고칠 것 16건 — 영어 확대 · 전역 분석 요청이 운영 안내로 닫힘 · 대장 올린 계정에서 법령 질문을 대장 답이 가로챔 · 곁가지 조문을 먼저 인용 · 지도 동작 실패인데 '확대했습니다'라고 답함 · 해외 화면 확대 안 됨 · '공문' 요청에 보고서", ['c2-walk', 'core-c2-move', 'core-c2-chart', 'core-c2-law', 'core-c2-vlm', 'core-c2-report', 'core-c2-ops', 'core-c2-en', 'v3-gov-fusion']],
  ['C3', '필지 실태조사', '어느 시군구든 필지 적재 → AI 결합 → 의심 필지 → 보고서. 의심 필지 · 현장 확인 필요가 첫 화면 · AI 도우미 · 보고서 · XI맵에서 같은 값입니다(강진 12,625 · 633, 여수 10,506). XI맵 전역 분석이 끝나면 실태조사가 자동으로 만들어집니다(산청).', '보고서 문서에 규칙 기호가 보임 · 보고서 화면 머리가 시군구 대신 시도 · 건축물대장 연결 없음', ['core-walk', 'core-c3-yeosu', 'core-c1-xi', 'core-c2-report', 'v3-gov-report']],
  ['C4', '행정데이터 융합', "어느 기관 · 시군구든 대장 올리기 → 필지 결합 → 말로 질문 → 지도 칠하기. '의심 필지 몇 건?'에 의심 필지와 대장과 어긋난 필지를 나눠 답합니다(구례 11,081 · 245, 목포 819 · 113). 동 단위 순위 · 차트.", "같은 브라우저에서 다시 열면 '올린 대장 필지' 값이 바뀜 · 새로 고침 뒤 올린 대장 결과가 사라지고 다른 사람이 올린 대장이 열림", ['core-walk', 'core-c4-cols', 'core-c4-joined', 'v3-gov-fusion']],
  ['C5', 'LX 생산(서비스 만들기)', '데이터 올리기 · 학습 · 결과 확인 · 배포 화면이 있습니다.', '화면에서 실제 학습 실행 · 모델 등록까지 한 번에 되는지 아직 확인 안 함(이번 차수에서 손대지 않음)', ['core-c7-apply', 'core-c1-ingest', 'v3-lx-ingest', 'v3-lx-train', 'v3-lx-review', 'v3-lx-deploy']],
  ['C6', 'LX 관리자 — 인프라 · 기관 · 배포', '장비 실측 · 기관 사용량 실집계 · 배포 되돌리기가 동작합니다. AI 도우미 사용량이 기관별로 합산돼 기관 화면과 관리자 답에 같은 값으로 나오고, 인프라 화면에 언어 모델 상태 · 국산 모델 연결 전 · 법령 색인 칸이 있습니다.', "새 서버 등록 실흐름 · 영어로 고부하 장비를 물으면 부하 0%인데 '2대 사용 중'이라고 답함", ['core-c6-infra', 'core-c2-ops', 'core-c7-flow', 'v3-ops-core', 'v3-ops-infra']],
  ['C7', '관리-생산-서비스 한 흐름', "LX 직원 적용 → LX 관리자 승인 → 전역 AI 분석 → 실태조사 → 기관 결과 → 관리자 사용량이 같은 작업으로 이어집니다(코어 영상 1). 시도 이름은 시도마다 한 가지('광주전남특별시').", '이번 차수에 새로 넓힌 것 없음', ['core-walk', 'core-c7-apply', 'core-c7-flow', 'v3-lx-console', 'v3-lx-deploy']],
  ['C8', '글로벌', '키르기스 식생 · 시가지 변화 · 메이크틸라 전후. 해외 기관이 영어로 묻고 영어로 답을 받습니다(평균 식생 지수 · 저활력 농지 면적). 영상 설명도 영어.', '해외 화면에서 말로 확대가 안 됨 · 필지 · 대장(실태조사 · 융합)의 해외 적용', ['core-c2-en', 'v3-global']],
  ['C9', '원스톱 운영 · 서비스 공정', '공정 5단계(평가 → 기획 → 개발 → 실증 → 서비스)를 정했고, AI 도우미 7개 작업이 실증 3차(구례 · 산청 · 목포 · 강진)를 거쳐 이번 배포까지 증거를 남겼습니다. 여러 탭이 열려도 실시간 연결을 하나로 나눠 씁니다.', "옛 화면이 열린 탭이 남으면 로그인 기관 목록이 멈춤(새로 고치면 풀림) · 늦게 '기관'을 누르면 늦음 안내가 안 뜸", []],
].map(([no, name, now, blocked, ids]) => ({ no, name, now, blocked, ids }));

// ── 5. 사용자 말 — 화면 행 한 문장(지금 → 다음) · 항목 이름 · 매체 ─────────────────
// 대장은 사용자에게 보이는 문서다(2026-09-27 13차 피드백). 화면 하나 = 한 행, 행마다 '지금'·'다음' 한 문장씩을 사용자 말로 적고,
// 항목 이름에서 내부 코드를 걷어내며, 판정표의 원래 글(reason·target·later)은 '개발 기록' 접기와 호버에만 보인다.
// 2026-09-29: 대장은 Land-XI 자기 화면만(다른 회사 사이트 참고 자료는 싣지 않는다) · 화면 용어표(반입 → 데이터 올리기 등)만 쓴다.
// 행 글: 기능/화면 | 지금(한 문장) | 다음 할 일(한 문장)
const ROWS = Object.fromEntries(`
인증/로그인 | 새 로그인이 첫 문입니다(9월 29일 연결). 왼쪽에 Land-XI 소개, 오른쪽에 로그인 — 8월 26일 '로그인 = 플랫폼 소개' 결정. LX 직원 · LX 관리자 · 기관(국내 · 해외)이 이 한 곳에서 들어가 역할별 첫 화면으로 갑니다. 예전 로그인은 메뉴에서 뺐고 파일만 보관합니다. | 없음.
인증/계정 신청 | 신청은 새 로그인 안의 서랍으로 옮겼습니다. 예전 3단계 신청 화면은 메뉴에서 뺐고 파일만 보관합니다. | 없음.
인증/아이디 찾기 | 새 로그인 안의 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
인증/비밀번호 찾기 | 새 로그인 안의 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
메인/게스트 메인 | 새 게스트 메인이 첫 주소입니다(9월 29일 연결). 한 화면에 한 메시지로, 국토를 한 번에 읽는 장면부터 서비스 · 지자체 제공 · 해외까지 이어집니다. 예전 스크롤 필름은 '메인 필름'으로 그대로 볼 수 있습니다. | 없음.
메인/서비스 상세(공개) | 서비스 하나를 한 페이지로 소개합니다(게스트 메인 · 영업 화면에서 들어감). 내 지역에서 무엇을 찾아 주는지 실제 영상과 결과로 보여 줍니다. | 없음.
메인/홈 초기안 | 8월의 첫 홈 안 두 장은 폐기됐습니다. | 없음 — 기록만 남깁니다.
메인/공개 사이트 | 로그인 전 공개 페이지 3장은 새 게스트 메인 · 서비스 상세 · 지원 서랍으로 옮겼고, 파일만 보관합니다. | 없음.
메인/필름 제작 도구 | 스크롤 필름(메인 필름)을 다듬는 내부 도구 2장(타임라인 · 앵커 스틸)입니다. 사용자 화면이 아닙니다. | 없음.
대시보드/LX 직원 대시보드 | LX 직원이 로그인하면 LX 직원 대시보드가 뜹니다(9월 29일 연결). 오늘 할 일 네 칸과 지도 위 단계(데이터 올리기 → 학습 → 서비스 만들기 → 결과 확인 → 배포 → 서비스 관리)를 한 화면에서 봅니다. 예전 전국 대시보드는 파일만 보관합니다. | 없음.
대시보드/영업 첫 화면 | 영업 계정으로 로그인하면 뜨는 화면입니다. 어느 시군구에 어떤 서비스를 바로 열 수 있는지 지도와 서비스 목록으로 봅니다. | 없음.
대시보드/사용자 대시보드 | 원판 1장만 있고 따로 만들지 않았습니다. 역할별 첫 화면이 이 역할을 맡습니다. | 없음.
대시보드/뷰어 대시보드 | 원판 1장만 있고 따로 만들지 않았습니다. 기관 첫 화면(내 대장 × AI)이 이 역할을 맡습니다. | 없음.
데이터 관리/목록(보관·완료·공개 중) | 예전 데이터 관리 화면(이미지 그리드 + 오른쪽 패널)은 새 '데이터 올리기' 화면으로 옮겼고 파일만 보관합니다. | 없음.
데이터 관리/데이터 올리기 | 지역을 고르면 영상 · 대장이 갖춰졌는지 한눈에 보고, 모자란 것을 바로 올립니다(LX 직원 대시보드에서 들어감). 9월 29일부터 어느 시군구든 등록 영상 · 대장 갖춤이 같은 틀로 나옵니다(남원 · 여수 · 청양 · 가평 확인). | 없음.
프로젝트/목록(메인) | 예전 프로젝트 화면(8단계 탭)은 새 '학습' 화면(업무별 모델)으로 옮겼고 파일만 보관합니다. | 없음.
프로젝트/만들기 | 새 '학습' 화면으로 옮겼습니다. 원판과 예전 화면은 기록으로 남깁니다. | 없음.
프로젝트/만들기 검토 | 새 '학습' 화면으로 옮겼습니다. | 없음.
프로젝트/개요 | 개요 · 구성원 화면은 원판대로 예전 화면에 들어갔고, 새 화면에서는 학습 화면이 대신합니다. | 없음.
프로젝트/삭제 모달 | 예전 화면에만 있습니다. | 없음.
프로젝트/데이터 | 파일 · 데이터셋 화면은 새 '데이터 올리기' 화면이 대신합니다. | 없음.
프로젝트/라벨링 | 라벨 도구는 새 '학습' 화면 안으로 옮겼습니다. | 없음.
프로젝트/학습 | 업무별 모델을 카드로 보고, 쓸 만한지(정밀도) · 다시 학습할지를 정합니다(LX 직원 대시보드에서 들어감). 예전 학습 화면과 8월의 워크플로우 보드는 파일만 보관합니다. | 없음.
프로젝트/분석 | 예전 화면의 분석 탭입니다. 새 화면에서는 '결과 확인'이 대신합니다. | 없음.
프로젝트/배포·공개 | 예전 화면의 배포 · 공개 폼입니다. 새 화면에서는 '배포 · 다른 지역에 적용'이 대신합니다. | 없음.
프로젝트/지도 작업공간(컨셉) | 원판 3안 중 '레이어가 곧 작업' 안이 뽑혔고, LX 직원 대시보드(지도 위 단계)가 같은 생각으로 만들어졌습니다. | 없음.
분석 서비스/서비스 목록 | 예전 분석 서비스 화면(카드 15장)은 새 '결과 확인' · 영업 화면으로 옮겼고 파일만 보관합니다. | 없음.
분석 서비스/실행 검토 | 예전 화면에만 있습니다. 새 화면에서는 '결과 확인'이 대신합니다. | 없음.
분석 서비스/실행 중 | 예전 화면에만 있습니다. 새 화면에서는 LX 직원 대시보드의 진행 표시가 대신합니다. | 없음.
분석 서비스/실행 결과 | 예전 화면에만 있습니다. 새 화면에서는 '결과 확인'이 대신합니다. | 없음.
분석 서비스/결과 확인 | AI 분석 결과 가운데 의심 필지를 모아 표본으로 확인하고, 정밀도를 보고 결과를 확정합니다(LX 직원 대시보드에서 들어감). | 없음.
서비스 공개/승인·검토 데스크 | 예전 분할 검토 데스크(원판 14장)는 새 '배포' 화면과 LX 관리자 대시보드 결재함으로 옮겼고 파일만 보관합니다. | 없음.
서비스 공개/공개 서비스 목록 | 예전 카드 목록은 새 '배포' 화면으로 옮겼습니다. | 없음.
서비스 공개/서비스 카드 편집 | 예전 카드 편집 화면은 새 '배포' 화면으로 옮겼습니다. | 없음.
서비스 공개/공개 요청 | 예전 요청 폼은 없애고 새 '배포' 화면에서 바로 처리합니다. | 없음.
서비스 공개/배포·다른 지역에 적용 | 어느 기관에 어떤 서비스가 깔렸는지, 잘 돌고 있는지 보고, 같은 서비스를 다른 지역에 적용합니다(LX 직원 대시보드에서 들어감). 9월 29일: 다른 지역에 적용하면 LX 관리자 승인 뒤 그 지역 전역 AI 분석이 자동으로 시작됩니다(코어 영상 1). | 없음.
XI맵/기본 지도 | 새 XI맵이 직원 · 영업 · 기관 공용 지도입니다(9월 29일 연결). 지역을 고르면 현장 확인이 필요한 필지가 지도에 차오릅니다. 예전 XI맵(두 세대)은 파일만 보관합니다. 9월 30일: 등록 영상 층이 등록된 모든 시군구에서 그려지고, 말로 전역 AI 분석을 실행하면 확인 카드 → 대기열 → 결과가 차오릅니다(산청 · 함양). | 없음.
XI맵/객체 정보 | 예전 XI맵의 객체 정보 콜아웃 원판입니다. 새 XI맵은 필지 카드로 같은 정보를 보여 줍니다. | 없음.
XI맵/시점 비교 | 예전 원판은 폐기했습니다. | 없음.
XI맵/검색 | 새 XI맵의 지역 검색이 대신합니다. 0건 안내만 따로 남아 있습니다. | 없음.
XI맵/도구(측정·그리기·구역·내려받기) | 측정 · 그리기 · 관심 구역 · 내려받기는 원본 기능인데 새 XI맵에는 아직 없습니다. | 새 XI맵에 넣을지 정합니다.
XI맵/지역 구분·속성 표 | 예전 XI맵에만 있습니다. 시군구 집계는 기관 할 일 · 보고서 화면이 대신합니다. | 없음.
XI맵/보안 서약 | 내려받기 전 서약은 원본 기능인데 새 XI맵에 없습니다. | 새 XI맵에 넣을지 정합니다.
XI맵/표류 예측 | 괭생이모자반 도착 예측 단독 화면 — 메뉴에서 닿지 않아 폐기했습니다. | 없음.
실태조사/실태조사 모드 | 예전 XI맵의 실태조사 모드는 새 XI맵 · 기관 첫 화면으로 옮겼고 파일만 보관합니다. | 없음.
실태조사/대장 융합(기관 첫 화면) | 지자체 공무원이 로그인하면 뜨는 첫 화면입니다(9월 29일 연결). 올린 대장과 AI 결과를 겹쳐 대장과 다른 필지를 찾고, 물어보기(Ctrl K)로 묻습니다. 지역은 기관 계정에 따라 바뀝니다(남원 · 광주전남은 예시). 9월 30일: 대장을 올린 뒤 '의심 필지 몇 건?'에 의심 필지와 대장과 어긋난 필지를 나눠 답합니다(구례 · 목포). | 없음.
에이전트/융합 분석 질문 | 물어보기(Ctrl K)는 새 화면들의 공통 입력줄로 옮겼습니다 — 올린 행정 자료와 AI 결과를 두고 말로 묻고 지도를 움직입니다. 예전 XI맵의 물어보기는 파일만 보관합니다. 9월 30일: AI 도우미가 말로 지도 제어 · 분석 실행과 바로 차트 · 대장 질의 · 보고서 초안 · 법령 조문 인용 · 영상 설명 · 영어 답까지 합니다(코어 영상 2). | 없음.
통계/보고서/통계 | 예전 통계 화면은 새 XI맵 · 기관 보고서로 옮겼고 파일만 보관합니다. | 없음.
통계/보고서/보고서 | 기관이 오늘 누가 어디를 확인할지 배정하고, 판정을 모아 보고서로 냅니다(기관 첫 화면에서 들어감). 예전 보고서 화면은 파일만 보관합니다. 9월 30일: 의심 필지 · 현장 확인 필요가 첫 화면 · AI 도우미 · 보고서 · XI맵에서 같은 값이고, 말로 보고서 초안을 내려받습니다. | 없음.
LX 관리자/LX 관리자 로그인 | LX 관리자도 새 로그인 한 곳(LX 관리자 탭)으로 들어갑니다. 예전 LX 관리자 전용 로그인은 파일만 보관합니다. | 없음.
LX 관리자/LX 관리자 대시보드 | LX 관리자가 로그인하면 뜨는 첫 화면입니다(9월 29일 연결). 승인 · 조치할 것(결재함)과 지역별 배포 현황을 밝은 톤 한 화면에서 봅니다. 예전 검정 톤 화면과 관리자 운영 현황은 파일만 보관합니다. 9월 29–30일: 적용 요청 → 승인 → 전역 AI 분석 → 기관 결과가 한 줄로 이어지고(코어 영상 1), 말로 운영 요약 · 기관별 AI 도우미 사용량을 묻습니다. | 없음.
LX 관리자/인프라·기관·배포 | 장비 · 기관별 할당 · 배포본이 한도 안에 있는지 한 화면에서 봅니다(LX 관리자 대시보드에서 들어감). 예전 세 화면은 파일만 보관합니다. 9월 30일: 언어 모델 상태 · 국산 모델(연결 전) · 법령 색인 칸이 더해졌습니다. | 없음.
LX 관리자/생산 관리 | 예전 생산 관리 화면은 새 '배포' 화면으로 옮겼고 파일만 보관합니다. | 없음.
서비스 관리/사용자 관리 | 가입 승인은 LX 관리자 대시보드 결재함으로 옮겼고, 예전 화면은 파일만 보관합니다. | 없음.
서비스 관리/공지 관리 | 공지는 '?' 지원 서랍으로 옮겼고, 예전 관리 화면은 파일만 보관합니다. | 없음.
서비스 관리/문의 관리 | 문의는 '?' 지원 서랍으로 옮겼고, 예전 관리 화면은 파일만 보관합니다. | 없음.
서비스 관리/FAQ 관리 | 자주 묻는 질문은 '?' 지원 서랍으로 옮겼고, 예전 관리 화면은 파일만 보관합니다. | 없음.
서비스 관리/지도 속성 관리 | LX 직원 대시보드 지도로 옮겼고, 예전 화면은 파일만 보관합니다. | 없음.
기관 포털/기관 로그인 | 기관도 새 로그인 한 곳(기관 탭)으로 들어갑니다. 예전 기관별 로그인 두 장은 파일만 보관합니다. | 없음.
기관 포털/내 서비스 | 기관 첫 화면은 이제 '내 대장 × AI'입니다. 예전 서비스 카드 덱은 파일만 보관합니다. | 없음.
기관 포털/서비스 상세 | 예전 기관 서비스 화면 7장은 기관 첫 화면 · 할 일 · 보고서로 옮겼고 파일만 보관합니다. | 없음.
서비스 지원/공지 | '?' 지원 서랍으로 옮겼습니다. 예전 공지 화면은 파일만 보관합니다. | 없음.
서비스 지원/FAQ | '?' 지원 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
서비스 지원/문의 | '?' 지원 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
서비스 지원/활용사례 | 사례는 영업 화면의 서비스 목록으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
서비스 지원/매뉴얼 | '?' 지원 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
서비스 지원/지원·MY 서랍 | 모든 첫 화면의 '?' 버튼이 여는 서랍 하나에 공지 · 자주 묻는 질문 · 문의 · 내 계정을 모았습니다. | 없음.
MY/마이 페이지 | MY 서랍으로 옮겼습니다. 예전 화면은 파일만 보관합니다. | 없음.
MY/정보 수정 | 원판대로 예전 화면에 들어갔고, 새 화면에서는 MY 서랍이 대신합니다. | 없음.
MY/비밀번호 변경 | 원판대로 예전 화면에 들어갔고, 새 화면에서는 MY 서랍이 대신합니다. | 없음.
MY/브랜드(CI) | 원판대로 예전 화면에 들어갔고, 새 화면에서는 MY 서랍이 대신합니다. | 없음.
MY/저장 공간 | 원판대로 예전 화면에 들어갔고, 새 화면에서는 MY 서랍이 대신합니다. | 없음.
MY/탈퇴 | 원본에 화면이 없어 추정으로 1장 만들었습니다. 새 화면에서는 MY 서랍이 대신합니다. | 없음.
글로벌/해외 기관 로그인 | 해외 기관도 새 로그인 한 곳(기관 탭)으로 들어갑니다. 예전 해외 전용 로그인은 파일만 보관합니다. | 없음.
글로벌/해외 서비스 | 해외 기관이 로그인하면 뜨는 첫 화면입니다(9월 29일 연결). 이번 계절 우리 지역이 어디서 바뀌었는지 지구본 → 나라 → 지역 순으로 봅니다(키르기스 두 기관은 예시). 9월 30일: 해외 기관이 영어로 묻고 영어로 답을 받습니다. | 없음.
공통/상태 패턴(로딩·오류) | 로딩 · 오류 패턴 원판이 예전 프로젝트 화면에 들어갔습니다. 새 화면에서는 공용 부품(빈 상태 · 불러오는 중)이 대신합니다. | 없음.
공통/공용 부품 모음 | 모든 새 화면이 같이 쓰는 부품(화면 틀 · 지도 · 카드 · 서랍 · 물어보기 등)을 한 페이지에 모았습니다. 사용자 화면이 아니라 만드는 사람용입니다. | 없음.
공통/디자인 실험 | 만들며 쓴 실험 화면 6장 — 역할이 끝나 전부 폐기했습니다. | 없음.
`.trim().split('\n').map((l) => l.split('|').map((s) => s.trim())).map(([k, now, next]) => [k, { now, next: next === '없음.' || /^없음 — /.test(next) ? '' : next }]));

// 항목 이름 — 내부 코드가 섞인 이름은 여기서 사용자 말로 바꾼다(없으면 say() 가 기계적으로 걷어낸다)
const LABEL = {
  'B5-Login': '로그인 원판 — 왼쪽 디오라마 영상 / 오른쪽 폼', 'B2-Login': '로그인 1차 안 — 플랫폼 소개',
  'proto-login': '예전 로그인', 'scrub-main': '메인 필름(스크롤 필름)', 'proto-ximap': '예전 XI맵(첫 세대)', 'proto-workflow': '국토 조사 보드(8월 25일 워크플로우)',
  'proto-admin-home': '예전 관리자 운영 현황', 'ops-login': '예전 LX 관리자 로그인', 'ops-index': '예전 LX 관리자 운영 현황(검정 톤)', 'ops-infra': '예전 인프라(검정 톤)',
  'ops-tenants': '예전 기관 · 할당(검정 톤)', 'ops-deploys': '예전 배포(검정 톤)', 'proto-admin-publish': '예전 서비스 공개 관리', 'proto-ai-card': '예전 공개 서비스 목록',
  'proto-ai-card-edit': '예전 서비스 카드 편집', 'proto-ai-publish-create': '예전 공개 요청', 'proto-dashboard': '예전 대시보드(전국 한 판)',
  'xi-read-staff': '예전 XI맵 — LX 직원', 'xi-public': '예전 XI맵 — 공개(로그인 전)', 'xi-sales': '예전 XI맵 — 영업', 'xi-survey-staff': '예전 실태조사 — LX 직원', 'xi-survey-namwon': '예전 실태조사 — 기관(남원 예시)',
  'xi-agent': '예전 물어보기 — 지도에 묻기', 'global-login': '예전 해외 기관 로그인', 'global-index': '예전 해외 서비스 — 키르기스 농업부', 'global-index-land': '예전 해외 서비스 — 키르기스 토지청',
  'global-fonts-compare': '해외판 서체 비교', 'proto-dive': '하강 실험(8월 25일)', 'proto-charts': '표 · 차트 후보 6종', 'proto-fonts': '글꼴 · 블루 톤 후보', 'proto-system': '컴포넌트 시트', 'proto-shell-demo': '공용 셸 데모',
  'B6-MapWork-Opt3': '안 3 · 레이어가 곧 작업(뽑힘)', 'B6-MapWork-Opt1': '안 1 · 파이프라인 도크', 'B6-MapWork-Opt2': '안 2 · 단계 분할',
  'B5-Dashboard-Data': '대시보드 원판 — 전국 한 판 · 학습데이터 켜고 끄기', 'B5-Dashboard': '관리자 대시보드 — AI 결과 켜고 끄기',
  'B4-Dashboard': '4차 개편안 — 큰 숫자 문장 · 검정 바탕', 'B3-Dashboard': '축소안 — 지도 없는 현황 원장', 'B2-Dashboard': '1차 안 — 지도 위 원장',
  'H-Dashboard-128': '대시보드 초안 — AI 결과 켜고 끄기', 'H-Dashboard-Data-128': '대시보드 초안 — 학습데이터 켜고 끄기',
  'H-Projects-Roboflow': '프로젝트 목록 초안 — 만들기 서랍', 'H-Project-Overview-Roboflow': '개요 초안 — 고정 머리 + 탭 6', 'H-Project-Data-Roboflow': '데이터 탭 초안 — 5열 격자',
  'B6-Publish-Cards': '공개 서비스 목록', 'B6-Publish-Cards-Empty': '공개 서비스 0건',
  'proto-portal-dp-nw-crowd-27': '예전 인파관리(빈 자리)', 'proto-portal-dp-nw-road-26': '예전 도로 안전관리(빈 자리)',
};
for (const v of V3) LABEL[v.id] = v.name;
const say = (s) => String(s || '')
  .replace(/\((v1|v2|v3 시안)\)/g, '').replace(/^D\d+ [①-⑩ⓐ-ⓩ] /, '').replace(/^(F\d|C\d|S\d) /, '').replace(/\(D\d+\)/g, '').replace(/\((집|개인) PC\)/g, '')
  .replace(/\(구현본\)/g, '').replace(/\bleg /g, '장면 ').replace(/선택 (\d)/g, '안 $1').replace(/\(권장\)/g, '(뽑힘)')
  .replace(/\b(\d{1,2})\/(\d{1,2})\b/g, '$1월 $2일').replace(/\s+/g, ' ').replace(/\s*—\s*$/, '').trim();
// 예전 구현(v1 · v2)의 이름 앞에는 '예전'을 붙인다(LABEL 에 없을 때)
const label = (a) => LABEL[a.id] || ((a.variant === '구현 v1' || a.variant === '구현 v2') && !/^예전/.test(say(a.name)) ? '예전 ' + say(a.name) : say(a.name));
// 폐기 항목의 '대신:' — 다른 자산이 아니라 결정·규칙이 대체한 경우의 사용자 말
const SAY_TARGET = {
  '새 XI맵 landxi/xi (F1·F2) — 9/27 레일 정본화(F2-R)': '새 XI맵', '새 XI맵 시점 스와이프(landxi/xi)': 'XI맵의 시점 비교', '새 XI맵 검색(landxi/xi)': 'XI맵의 검색',
  'F3 §5 폐지 목록(레일 밖)': '폐지 목록(메뉴에서 닿지 않는 화면)', 'F3 §5 폐지 목록': '폐지 목록(역할이 끝난 화면)', 'F3 §5 폐지 목록 — 개발 잔재·레일 밖': '폐지 목록(역할이 끝난 화면)',
  '법전 서체(Paperlogy + Pretendard)': '확정 서체(Paperlogy + Pretendard)', 'Inter 글로벌 서체': '해외판 서체 Inter 확정',
  '법전 design/system-v2.md': '디자인 규칙서', '공용 셸(shell.js)': '공용 틀(셸) 적용 완료',
};
const sayTarget = (t) => SAY_TARGET[t] || say(String(t).replace(/\(F\d[^)]*\)/g, '').replace(/F\d §\d/g, '').replace(/§\d/g, ''));
const SUCC_SCREEN = {
  '인증/로그인': 'v3-login', '인증/계정 신청': 'v3-login', '인증/아이디 찾기': 'v3-login', '인증/비밀번호 찾기': 'v3-login',
  '메인/게스트 메인': 'v3-main', '메인/공개 사이트': 'v3-main', '대시보드/LX 직원 대시보드': 'v3-lx-console', '데이터 관리/목록(보관·완료·공개 중)': 'v3-lx-ingest',
  '프로젝트/목록(메인)': 'v3-lx-train', '프로젝트/만들기': 'v3-lx-train', '프로젝트/라벨링': 'v3-lx-train', '분석 서비스/서비스 목록': 'v3-lx-review',
  '서비스 공개/승인·검토 데스크': 'v3-lx-deploy', '서비스 공개/공개 서비스 목록': 'v3-lx-deploy', '서비스 공개/서비스 카드 편집': 'v3-lx-deploy', '서비스 공개/공개 요청': 'v3-lx-deploy',
  'XI맵/기본 지도': 'v3-xi-clean', '실태조사/실태조사 모드': 'v3-xi-clean', '에이전트/융합 분석 질문': 'v3-gov-fusion', '통계/보고서/통계': 'v3-xi-clean', '통계/보고서/보고서': 'v3-gov-report',
  'LX 관리자/LX 관리자 로그인': 'v3-login', 'LX 관리자/LX 관리자 대시보드': 'v3-ops-core', 'LX 관리자/인프라·기관·배포': 'v3-ops-infra', 'LX 관리자/생산 관리': 'v3-lx-deploy',
  '서비스 관리/사용자 관리': 'v3-ops-core', '서비스 관리/공지 관리': 'v3-help-my', '서비스 관리/문의 관리': 'v3-help-my', '서비스 관리/FAQ 관리': 'v3-help-my', '서비스 관리/지도 속성 관리': 'v3-lx-console',
  '기관 포털/기관 로그인': 'v3-login', '기관 포털/내 서비스': 'v3-gov-fusion', '기관 포털/서비스 상세': 'v3-gov-fusion',
  '서비스 지원/공지': 'v3-help-my', '서비스 지원/FAQ': 'v3-help-my', '서비스 지원/문의': 'v3-help-my', '서비스 지원/활용사례': 'v3-sales', '서비스 지원/매뉴얼': 'v3-help-my', 'MY/마이 페이지': 'v3-help-my',
  '글로벌/해외 기관 로그인': 'v3-login', '글로벌/해외 서비스': 'v3-global',
};
const SUCC_ID = { 'site-platform': 'v3-service-detail', 'site-notice': 'v3-help-my', 'xi-public': 'v3-main', 'xi-survey-namwon': 'v3-gov-fusion', 'proto-admin-home': 'v3-ops-core' };
// 화면 용어표(E:/Land-XI 플랫폼/CLAUDE.md §2) — 인벤토리 제목·개발 기록 글에 남은 옛 말을 대장에 싣기 전에 바꾼다
const TERM = [['관제실', 'LX 관리자 화면'], ['관제 핵심판', 'LX 관리자 대시보드'], ['관제', 'LX 관리자 화면'], ['LX/OPS', 'LX 관리자'], ['생산 콘솔', 'LX 직원 대시보드'], ['정문', '로그인'],
  ['시연고정값', '고정값'], ["'시연'", '옛 표기'], ['시연', '예시'], ['준비 중', '첫 결과 전'], ['반입', '데이터 올리기'], ['조립', '서비스 만들기'], ['검수', '결과 확인'], ['착지', '첫 화면']];
const term = (x) => TERM.reduce((t, [a, b]) => t.split(a).join(b), String(x ?? ''));
const kdate = (d) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : '');

// 칸(슬롯) — 원판 → 예전 구현(v1 · v2) → 새 구현(v3)
const SLOT_ORDER = ['원판', '예전 구현', '새 구현'];
const slotOf = (a) => a.kind === '원판' ? '원판' : a.variant === '구현 v3' ? '새 구현' : '예전 구현';

// 매체 — Pages 에서 실제로 열리는 파일만(shots/ 는 발행에서 빠져 있다 → tools/review/ledger-media.mjs 가 assets-thumbs/ 로 옮긴다)
const TH = `${OUT_DIR}/assets-thumbs`;
const V3_STILLS = { 'v3-login': ['v3-login', 'v3-login-2', 'v3-login-3', 'v3-login-scenes', 'v3-login-390'], 'v3-lx-console': ['v3-lx-console', 'v3-lx-console-2', 'v3-lx-console-3'],
  'v3-xi-clean': ['v3-xi-clean', 'v3-xi-clean-2', 'v3-xi-clean-3'], 'v3-ops-core': ['v3-ops-core', 'v3-ops-core-2', 'v3-ops-core-3'], 'v3-gov-fusion': ['v3-gov-fusion', 'v3-gov-fusion-2', 'v3-gov-fusion-3', 'v3-gov-fusion-4'] };
const V3_OLD_VIDEO = { 'v3-login': 'v3-login', 'v3-lx-console': 'v3-lx-console', 'v3-xi-clean': 'v3-xi-clean', 'v3-ops-core': 'v3-ops-core', 'v3-gov-fusion': 'v3-gov-fusion' };
const VIDEO = { 'xi-read-staff': 'xi-map', 'xi-public': 'xi-map', 'xi-sales': 'xi-map', 'xi-survey-staff': 'xi-survey', 'xi-survey-namwon': 'xi-survey', 'xi-agent': 'xi-agent',
  'ops-login': 'ops', 'ops-index': 'ops', 'ops-infra': 'ops', 'ops-tenants': 'ops', 'ops-deploys': 'ops', 'global-login': 'global', 'global-index': 'global', 'global-index-land': 'global' };
const thumbFile = (n, ext = 'jpg') => { const p = `${TH}/${n}.${ext}`; return fs.existsSync(p) ? p : null; };

// ── 6. 조립 ─────────────────────────────────────────────────────────────────
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 << 20 });
const addDates = {}; // repo path → 처음 들어온 날
{ let d = null; for (const line of sh('git log --diff-filter=A --reverse --format=@%ad --date=short --name-only -- design-canvas/v2 landxi').split('\n')) { if (line.startsWith('@')) d = line.slice(1); else if (line.trim() && !addDates[line.trim()]) addDates[line.trim()] = d; } }
const canvas = JSON.parse(fs.readFileSync(V + 'canvas.json', 'utf8'));
const inv = JSON.parse(fs.readFileSync('shots/overview/inventory.json', 'utf8'));
const byInv = Object.fromEntries(inv.screens.map((s) => [s.id, s]));
const dieIf = (c, m) => { if (c) { console.error('✗ ' + m); process.exit(1); } };
// 열기 문구(사용자 말) — GitHub Pages 에서 실제로 열어 본 결과(tools/review/open-check.mjs · 2026-09-29)로 나눈다
const SERVER_NOTE = '서버가 켜진 곳에서만 동작 — 여기서는 캡처 · 영상으로 봅니다';
const LOGIN_NOTE = '로그인 뒤에 열리는 화면(예전 로그인은 아무 값으로 들어갑니다) — 캡처로 먼저 봅니다';

const stage = (id) => (/^H-/.test(id) ? '원판 H(개인 PC 초안)' : `원판 ${id.split('-')[0]}`);
const assets = [];
for (const m of MASTERS) {
  const file = `${V}${m.id}.dc.html`, render = `${V}renders/${m.id}.png`;
  dieIf(!fs.existsSync(render), `렌더 없음: ${m.id}`);
  assets.push({ id: m.id, kind: '원판', name: m.name, screen: m.screen, variant: stage(m.id), verdict: m.verdict, target: m.target, reason: m.reason, later: m.later,
    made: addDates[file] || addDates[render] || '', files: { 원판: fs.existsSync(file) ? file : null, 렌더: render }, title: canvas.artboards.find((a) => a.file === m.id + '.dc.html')?.title || '',
    media: [{ kind: 'image', src: render, label: '원판' }], open: null });
}
for (const m of IMPL) {
  const s = byInv[m.id]; dieIf(!s, `인벤토리에 없음: ${m.id}`);
  const p = String(s['경로']).replace(/^:8702\//, '').split('?')[0];
  const gen = s['세대'] === '구 proto v1' ? '구현 v1' : '구현 v2';
  const thumb = s['썸네일'] ? `${OUT_DIR}/status/${s['썸네일']}` : null;
  const media = [];
  if (thumb && fs.existsSync(thumb)) media.push({ kind: 'image', src: thumb, label: '캡처' });
  const vf = VIDEO[m.id] && thumbFile(VIDEO[m.id], 'mp4'); if (vf) media.push({ kind: 'video', src: vf, label: '영상', poster: media[0]?.src || null });
  // 열기 — Pages 에서 실제로 되는 것만 1순위. 서버(:8700·:8702)가 필요하면 캡처·영상, 로그인 가드가 있으면 캡처 + '실제 화면(로그인 뒤)'
  const needsServer = /^API/.test(String(s['실데이터'] || '')) || /^:8702\//.test(String(s['경로']));
  const guarded = !/^게스트/.test(String(s['로그인_경로'] || ''));
  const href = String(s['경로']).replace(/^:8702\//, '');
  const open = needsServer ? { kind: 'capture', href: null, live: null, note: SERVER_NOTE }
    : guarded ? { kind: 'capture', href, live: '실제 화면(로그인 뒤에 열립니다)', note: LOGIN_NOTE }
      : { kind: 'live', href, live: '실제 화면 열기', note: '' };
  const succ = SUCC_ID[m.id] || SUCC_SCREEN[m.screen] || null;
  assets.push({ id: m.id, kind: '구현', name: m.name, screen: m.screen, variant: gen, verdict: m.verdict, target: m.verdict === '적용' ? (m.target || href) : m.target,
    reason: m.reason, later: m.later, made: addDates[p] || '', files: { 구현: s['경로'], 썸네일: thumb && fs.existsSync(thumb) ? thumb : null }, title: s['제목'] || '', impl_state: s['상태'], media, open,
    access: needsServer ? 'server' : guarded ? 'login' : 'guest', ...(succ ? { moved_to: succ } : {}) });
}
// 새 화면 17종 — 첫 화면 캡처(로그인 폼으로 들어가 찍음) · 역할별 통합 영상과 그 스틸 · 9월 27일 캡처·영상
for (const v of V3) {
  const p = `landxi/v3/${v.dir}/index.html`;
  dieIf(!fs.existsSync(p), `새 화면 파일 없음: ${p}`);
  const media = [];
  const t = thumbFile(`v3-${v.dir}`, 'webp'), L = thumbFile(`v3-${v.dir}-L`, 'webp');
  const capDate = L ? new Date(fs.statSync(L).mtimeMs + 9 * 3600e3).toISOString().slice(0, 10) : '';
  if (L) media.push({ kind: 'image', src: L, thumb: t || L, label: `첫 화면 · ${kdate(capDate)}` });
  for (const n of v.walk) { const f = thumbFile(n, 'webp'); if (f) media.push({ kind: 'image', src: f, label: '로그인부터 이어 본 장면' }); }
  for (const n of V3_STILLS[v.id] || []) { const f = thumbFile(n); if (f) media.push({ kind: 'image', src: f, label: '9월 27일 캡처' }); }
  const wv = v.video && thumbFile(v.video, 'mp4'); if (wv) media.push({ kind: 'video', src: wv, label: '로그인부터 이어 본 영상', poster: media[0]?.src || null });
  const ov = V3_OLD_VIDEO[v.id] && thumbFile(V3_OLD_VIDEO[v.id], 'mp4'); if (ov) media.push({ kind: 'video', src: ov, label: '9월 27일 영상', poster: media[0]?.src || null });
  const href = `landxi/v3/${v.dir}/index.html${v.q}`;
  // Pages: 게스트 화면(메인 · 서비스 상세 · 로그인)은 열린다 — 로그인 · 데이터는 서버가 켜진 곳에서만.
  //        로그인 뒤 화면은 서버 로그인이 있어야 들어가므로 로그인 화면으로 보낸다
  const open = v.door === 'guest'
    ? { kind: 'live', href, live: v.dir === 'login' ? '실제 화면 열기(로그인은 서버가 켜진 곳에서만 동작)' : '실제 화면 열기(일부 자료는 서버가 켜진 곳에서만)', note: '' }
    : { kind: 'capture', href: 'landxi/v3/login/index.html', live: '로그인에서 들어가기(서버가 켜진 곳에서만 동작)', note: SERVER_NOTE };
  const iv = byInv[v.id];
  assets.push({ id: v.id, kind: '구현', name: v.name, screen: v.screen, variant: '구현 v3', verdict: '검토',
    target: '사용자 판정 대기 — 9/29 로그인 → 역할별 첫 화면으로 연결됨', reason: iv ? '9/27 시안 → 9/29 통합(로그인 → 역할별 첫 화면)' : '9/29 통합(로그인 → 역할별 첫 화면)', later: '',
    made: addDates[p] || '', files: { 구현: p }, title: '', impl_state: '연결됨', media, open, access: v.door === 'guest' ? 'guest' : 'server',
    ...(V3_CHANGED.has(v.dir) ? { upd: '9월 29–30일 코어 차수에서 바뀜' } : {}), cores: CORES.filter((c) => c.ids.includes(v.id)).map((c) => c.no) });
}
// 코어 차수 자산 — 영상 2편 + 코어별 증거 장면. 살아 있는 화면은 서버가 켜진 곳에서만 돌므로 캡처 · 영상으로 연다
for (const c of CORE_ITEMS) {
  const media = [];
  if (c.video) {
    const vf = thumbFile(c.video, 'mp4'); dieIf(!vf, `코어 영상 없음: ${c.video}.mp4`);
    const pt = thumbFile(c.poster, 'webp');
    media.push({ kind: 'video', src: vf, label: '코어 영상(로그인부터 실제 화면)', poster: pt, thumb: pt });
  } else {
    const t = thumbFile(c.id, 'webp'), L = thumbFile(`${c.id}-L`, 'webp');
    dieIf(!t || !L, `코어 장면 없음: ${c.id} — node tools/review/ledger-media.mjs --only=core`);
    media.push({ kind: 'image', src: L, thumb: t, label: `코어 증거 · ${kdate(c.date)}` });
  }
  assets.push({ id: c.id, kind: '구현', name: c.name, screen: c.screen, variant: '구현 v3', verdict: '검토',
    target: '사용자 판정 대기 — 코어 차수(9/29 코어 · 9/30 AI 도우미) 증거', reason: `코어 차수 증거(${c.cores.join('·')}) — 로그인 폼으로 들어가 찍은 실제 화면`, later: '',
    made: c.date, files: { 구현: c.video ? `${TH}/${c.video}.mp4` : `${TH}/${c.id}-L.webp` }, title: '', impl_state: '코어 증거', media,
    open: { kind: 'capture', href: null, live: null, note: '' }, access: 'server', evidence: true, cores: c.cores });
}
for (const c of CORES) for (const id of c.ids) dieIf(!assets.some((a) => a.id === id), `코어 묶음에 없는 자산: ${c.no} ${id}`);
// 사용자 결정 덮어쓰기 — 갤러리 [결정 발행] → tools/review/apply-decisions.mjs 가 assets.json 의 user_decision 에 적어 둔 것을
// 다시 구울 때도 지킨다(판정표보다 우선). 표를 고쳐 같은 판정이 되면 assets.json 에서 user_decision 을 지워도 된다.
const LEDGER = `${OUT_DIR}/assets.json`;
const prevUD = {};
try { for (const a of JSON.parse(fs.readFileSync(LEDGER, 'utf8')).assets || []) if (a.user_decision) prevUD[a.id] = a.user_decision; } catch { /* 첫 생성 */ }
for (const a of assets) {
  const u = prevUD[a.id]; if (!u) continue;
  dieIf(!VERDICTS.includes(u.verdict), `user_decision 판정 오류: ${a.id} ${u.verdict}`);
  a.user_decision = u; a.table_verdict = a.verdict; a.reason_before = a.reason;
  a.reason = `사용자 결정 ${u.date}` + (u.memo ? ` — ${u.memo}` : '');
  if (u.verdict !== a.verdict) {
    const self = a.files?.구현 ? String(a.files.구현).replace(/^:8702\//, '') : null;
    a.target = u.verdict === '적용' && self ? self : `사용자 결정 ${u.date}(${a.verdict} → ${u.verdict})`;
    a.verdict = u.verdict;
  }
}
const lostUD = Object.keys(prevUD).filter((id) => !assets.some((a) => a.id === id));
if (lostUD.length) console.warn(`! 대장에서 사라진 자산의 사용자 결정(버림): ${lostUD.join(', ')}`);

// 검사 — 화면 키 · 판정 · 중복 · 원판 누락 · 매체(모든 항목에 Pages 에서 열리는 그림이 있어야 한다) · 행 글
const ids = new Set();
for (const a of assets) {
  dieIf(!SCREEN_KEYS.has(a.screen), `화면 키 없음: ${a.id} → ${a.screen}`);
  dieIf(!VERDICTS.includes(a.verdict), `판정 오류: ${a.id} ${a.verdict}`);
  dieIf(ids.has(a.id), `중복: ${a.id}`); ids.add(a.id);
  dieIf(!a.target, `대상 비어 있음: ${a.id}`);
  dieIf(!a.media.length, `그림 없음(Pages 에서 빈 칸이 된다): ${a.id} — node tools/review/ledger-media.mjs 로 만든다`);
  for (const m of a.media) dieIf(!fs.existsSync(m.src), `매체 파일 없음: ${a.id} ${m.src}`);
}
for (const k of SCREEN_KEYS) if (assets.some((a) => a.screen === k) && !ROWS[k]) console.warn(`! 행 글 없음(기계 문장으로 대체): ${k}`);
const orphan = fs.readdirSync(V + 'renders').map((f) => f.replace('.png', '')).filter((id) => !ids.has(id));
dieIf(orphan.length, `대장에 없는 원판: ${orphan.join(', ')}`);
const orphanInv = inv.screens.filter((s) => !ids.has(s.id)).map((s) => s.id);
dieIf(orphanInv.length, `대장에 없는 구현: ${orphanInv.join(', ')}`);

// 대상이 다른 자산 id 면 연결
for (const a of assets) if (a.verdict === '폐기' && ids.has(a.target)) a.replaced_by_id = a.target;
const FN_ORDER = TAX.map(([f]) => f);
const byIdA = Object.fromEntries(assets.map((a) => [a.id, a]));
const out = assets.map((a) => {
  const f = FN_ORDER.find((fn) => a.screen.startsWith(fn + '/'));
  const o = { id: a.id, kind: a.kind, slot: slotOf(a), function: f, screen: a.screen.slice(f.length + 1), variant: a.variant, name: term(a.name), label: term(label(a)), made: a.made, files: a.files, verdict: a.verdict, reason: term(a.reason) };
  if (a.verdict === '적용') o.applied_to = term(a.target).split(',').map((s) => s.trim());
  if (a.verdict === '폐기') { o.replaced_by = a.replaced_by_id ? `${a.target} (${byIdA[a.target].name})` : a.target; if (a.replaced_by_id) o.replaced_by_id = a.replaced_by_id; }
  if (a.verdict === '검토') o.next = term(a.target);
  if (a.later) o.later = term(a.later);
  if (a.title) o.title = term(a.title);
  if (a.impl_state) o.impl_state = term(a.impl_state);
  if (a.access) o.access = a.access;
  if (a.moved_to) o.moved_to = a.moved_to;
  if (a.cores?.length) o.cores = a.cores;
  if (a.evidence) o.evidence = true;
  if (a.upd) o.upd = a.upd;
  o.media = a.media; o.open = a.open;
  if (a.user_decision) { o.user_decision = a.user_decision; o.table_verdict = a.table_verdict; o.reason_before = a.reason_before; }
  return o;
});
const cnt = (list) => Object.fromEntries(VERDICTS.map((v) => [v, list.filter((a) => a.verdict === v).length]));
const anchor = (fn, sc) => 'sc-' + `${fn}-${sc}`.replace(/[\s/·()]+/g, '-').replace(/-+$/, '');
// 줄 상태 — 판정이 아니라 사실(새 화면이 있는지 · 예전 화면이 어디로 옮겼는지)
const rowState = (items) => {
  const hasNew = items.some((a) => a.slot === '새 구현' && !a.evidence), old = items.filter((a) => a.slot === '예전 구현');
  if (hasNew) return old.length ? '새 화면 연결됨 · 예전 화면 보관' : '새 화면 연결됨';
  if (old.some((a) => a.moved_to)) return '새 화면으로 옮김 · 예전 화면 보관';
  const live = items.filter((a) => a.verdict !== '폐기');
  if (!live.length) return '지난 안만 있음';
  if (live.some((a) => a.kind === '구현')) return '예전 화면';
  if (live.some((a) => a.kind === '원판')) return '원판만(구현 목록에 없음)';
  return '아직 화면 없음';
};
const rows = [];
for (const [fn, screens] of TAX) for (const sc of screens) {
  const items = out.filter((a) => a.function === fn && a.screen === sc); if (!items.length) continue;
  const r = ROWS[`${fn}/${sc}`] || { now: `원판 ${items.filter((a) => a.kind === '원판').length}장 · 구현 ${items.filter((a) => a.kind !== '원판').length}장.`, next: '' };
  rows.push({ function: fn, screen: sc, key: `${fn}/${sc}`, anchor: anchor(fn, sc), state: rowState(items), now: r.now, next: r.next, ids: items.map((a) => a.id), ...cnt(items) });
}
const ledger = {
  title: 'Land-XI 자산 대장 — 화면마다 한 줄',
  generated_at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' KST',
  생성기: 'node tools/review/masters.mjs (매체: node tools/review/ledger-media.mjs)',
  판정_기준: { 초기_분류: '판정은 사용자가 대장의 결정 버튼으로 정한다(2026-09-29). 여기 판정은 생성기가 붙인 초기 분류이고, user_decision 이 있으면 그것이 우선', 적용: '화면에 반영됨(applied_to)', 검토: '결정 대기(next) — 새 화면 17종 · 코어 차수 자산(영상 2 · 증거 장면 15)은 모두 초기 분류 검토', 폐기: '다른 안·결정이 대체함(replaced_by)' },
  계층: '기능(function) → 화면(screen) → 칸(slot: 원판 → 예전 구현(v1 · v2) → 새 구현(v3))',
  코어: CORES.map((c) => ({ core: c.no, name: c.name, now: c.now, blocked: c.blocked, assets: c.ids })),
  코어_기준: 'docs/CORE.md 상태 추적(2026-09-30 · AI 도우미 차수 끝) — 대장 상단 코어 묶음 보기와 같은 내용',
  범위: 'Land-XI 자기 화면만(원판 · 예전 구현 · 새 구현). 다른 회사 사이트 참고 자료는 싣지 않는다(2026-09-29 사용자)',
  옮김: 'moved_to = 예전 화면의 기능을 넘겨받은 새 화면 id(판정과 무관한 연결 정보)',
  사용자_결정: '대장(masters.html)에서 항목 또는 화면 행의 적용·검토·폐기 → [결정 발행] 글 → node tools/review/apply-decisions.mjs <글 파일> 로 반영. user_decision 이 있으면 판정표보다 우선(table_verdict = 표의 원래 판정, reason_before = 원래 근거)',
  매체: '모든 항목은 Pages 에서 실제로 열리는 그림(media)을 가진다. 서버가 필요한 화면은 캡처·영상(assets-thumbs/)으로 연다(open.kind = capture). 원문·경로 등 내부 정보는 reason·later·files 에 남긴다',
  집계: { 전체: out.length, ...cnt(out), 원판: cnt(out.filter((a) => a.kind === '원판')), 예전_구현: cnt(out.filter((a) => a.slot === '예전 구현')), 새_구현: cnt(out.filter((a) => a.slot === '새 구현')) },
  기능: TAX.map(([f, ss]) => ({ function: f, screens: ss.filter((s) => out.some((a) => a.function === f && a.screen === s)) })).filter((x) => x.screens.length),
  화면: rows,
  assets: out,
};
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');

// 구현 현황판용 화면 매핑 — inventory id → 기능/화면 (+ 대장 판정 · 사용자 이름 · 매체 · 열기) · 행 글
const smap = { 설명: '구현 현황판(status/)이 자산 대장과 같은 화면 키로 묶기 위한 매핑 — node tools/review/masters.mjs 가 생성', 기능_순서: ledger.기능, 화면: rows.map(({ ids, ...r }) => r), screens: {} };
const AXIS = { main: '게스트', 'service-detail': '게스트', login: '게스트', 'lx-console': 'LX직원', 'lx-ingest': 'LX직원', 'lx-train': 'LX직원', 'lx-review': 'LX직원', 'lx-deploy': 'LX직원',
  'xi-clean': 'LX직원', kit: '내부', 'help-my': '-', 'ops-core': '관리자', 'ops-infra': '관리자', 'gov-fusion': '기관', 'gov-report': '기관', global: '해외', sales: '영업' };
for (const o of out.filter((a) => a.kind === '구현' && !a.evidence)) { // 코어 증거(장면 · 영상)는 화면이 아니라 현황판에 올리지 않는다
  smap.screens[o.id] = { function: o.function, screen: o.screen, anchor: anchor(o.function, o.screen), variant: o.variant, slot: o.slot, verdict: o.verdict, label: o.label, access: o.access, media: o.media, open: o.open, ...(o.moved_to ? { moved_to: o.moved_to } : {}) };
  // 새 화면은 인벤토리(전수 촬영)에 없는 것이 많다 — 현황판이 같은 줄에 올릴 수 있게 기본 정보를 함께 준다
  if (o.slot === '새 구현') { const d = o.files.구현.split('/')[2]; Object.assign(smap.screens[o.id], { 경로: o.files.구현, 세대: 'v3 새 화면', 상태: '연결됨', 사용자_축: AXIS[d] || '-', 실데이터: o.access === 'server' ? 'API(서버가 켜진 곳에서만)' : '게스트 화면(일부 자료는 서버)' }); }
}
fs.writeFileSync(`${OUT_DIR}/screen-map.json`, JSON.stringify(smap, null, 1) + '\n');

// ── 7. 대장 HTML — 화면 하나 = 한 행 ───────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (repoPath) => { const [p, q] = String(repoPath).split(/(?=[?#])/); return path.posix.relative(OUT_DIR, p) + (q || ''); };
const href = (h) => (/^https?:/.test(h) ? h : rel(h));
const VCLS = { 적용: 'ok', 검토: 'rv', 폐기: 'dp' };
const SLOT_CLS = { 원판: 'master', '예전 구현': 'v1', '새 구현': 'v3' };
const devText = (a) => [`${a.id} · ${a.variant}${a.title ? ` · ${a.title}` : ''}`, `근거: ${a.reason}`, a.applied_to ? `적용 위치: ${a.applied_to.join(', ')}` : a.next ? `다음: ${a.next}` : a.replaced_by ? `대체: ${a.replaced_by}` : '', a.later ? `이후: ${a.later}` : '', a.files?.구현 ? `경로: ${a.files.구현}` : a.files?.원판 ? `원판: ${a.files.원판}` : a.files?.원천 ? `원천: ${a.files.원천}` : ''].filter(Boolean);
const aside = (a) => { // 폐기면 무엇이 대신하는지 한 마디, 사용자 결정이면 그 표시
  if (a.verdict === '폐기') return a.replaced_by_id ? `대신: ${esc(byIdA[a.replaced_by_id] ? label(byIdA[a.replaced_by_id]) : a.replaced_by)}` : `대신: ${esc(sayTarget(a.replaced_by))}`;
  if (a.moved_to && byIdA[a.moved_to]) return `새 화면: <a class="jump" href="#${esc(a.moved_to)}">${esc(label(byIdA[a.moved_to]))}</a>`;
  return '';
};
function tile(a) {
  const m0 = a.media[0];
  const vid = a.media.find((m) => m.kind === 'video');
  const poster = m0.kind === 'video' ? (m0.poster ? rel(m0.poster) : '') : rel(m0.thumb || m0.src);
  const media = a.media.map((m) => ({ k: m.kind, s: rel(m.src), l: m.label, p: m.poster ? rel(m.poster) : null }));
  const o = a.open;
  const links = [];
  if (o && o.kind === 'live' && o.href) links.push(`<a href="${esc(href(o.href))}" target="_blank" rel="noopener">${esc(o.live)}</a>`);
  if (o && o.kind === 'doc' && o.href) links.push(`<a href="${esc(href(o.href))}" target="_blank" rel="noopener">${esc(o.live)}</a>`);
  if (o && o.kind === 'capture' && o.href) links.push(`<a href="${esc(href(o.href))}" target="_blank" rel="noopener" class="dim">${esc(o.live)}</a>`);
  const ud = a.user_decision ? `<span class="ud" title="판정표 원래 판정: ${esc(a.table_verdict)}">사용자 결정 ${esc(kdate(a.user_decision.date))}</span>` : '';
  return `<article class="card v-${VCLS[a.verdict]} s-${SLOT_CLS[a.slot]}" id="${esc(a.id)}" data-v="${a.verdict}" data-base="${a.verdict}" data-k="${esc(a.slot)}" data-media='${esc(JSON.stringify(media))}' title="${esc(devText(a).join('\n'))}">
<button type="button" class="th lb" aria-label="${esc(label(a))} 크게 보기"><img loading="lazy" src="${esc(poster)}" alt="">${vid ? '<span class="play" aria-hidden="true">▶ 영상</span>' : ''}${a.media.length > 1 ? `<span class="cnt" aria-hidden="true">${a.media.length}</span>` : ''}</button>
<div class="bd"><div class="hd"><span class="slot">${esc(a.slot)}</span><span class="bdg ${VCLS[a.verdict]}"${a.user_decision ? '' : ' title="초기 분류 — 아래 버튼으로 결정합니다"'}>${a.verdict}</span><span class="chgm">바뀜 · 미발행</span></div>
<h4>${esc(label(a))}</h4>${aside(a) ? `<p class="why">${aside(a)}</p>` : ''}${a.upd ? `<p class="why">${esc(a.upd)}</p>` : ''}${a.cores?.length ? `<p class="cores">${a.cores.map((n) => `<a class="jump" href="#core-${n}">${esc(CORE_NAME[n])}</a>`).join('')}</p>` : ''}${o && o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
<p class="meta">${a.made ? `<span>${esc(kdate(a.made))}</span>` : ''}${ud}${links.join('')}</p>
<div class="ctl" role="group" aria-label="${esc(label(a))} 판정 바꾸기">${VERDICTS.map((v) => `<button type="button" class="${VCLS[v]}" data-set="${v}" aria-pressed="${v === a.verdict}">${v}</button>`).join('')}</div></div></article>`;
}
const CORE_NAME = Object.fromEntries(CORES.map((c) => [c.no, c.name.replace(/\(.*\)$/, '').replace(/ — .*/, '')]));
const SLOT_ORDER_IDX = Object.fromEntries(SLOT_ORDER.map((s, i) => [s, i]));
let body = '';
for (const { function: fn, screens } of ledger.기능) {
  const inFn = out.filter((a) => a.function === fn);
  const c = cnt(inFn);
  const fnTitle = fn;
  body += `<section class="fn" data-fn="${esc(fn)}"><h2 id="fn-${esc(fn)}">${esc(fnTitle)}<small>${VERDICTS.map((v) => `<i class="${VCLS[v]}" data-c="${v}">${v} ${c[v]}</i>`).join('')}</small></h2>`;
  for (const sc of screens) {
    const row = rows.find((r) => r.function === fn && r.screen === sc);
    const items = inFn.filter((a) => a.screen === sc).sort((p, q) => SLOT_ORDER_IDX[p.slot] - SLOT_ORDER_IDX[q.slot] || String(p.made).localeCompare(String(q.made)));
    const live = items.filter((a) => a.verdict !== '폐기'), dead = items.filter((a) => a.verdict === '폐기');
    const slots = SLOT_ORDER.map((s) => [s, items.filter((a) => a.slot === s).length]).filter(([, n]) => n);
    const st = row.state;
    // 현황판 링크는 현황판에 실제로 그 행이 있을 때만(현황판은 구현 화면만 다룬다 — 원판만 있는 행으로 보내면 빈 곳에 떨어진다)
    const onStatus = items.some((a) => a.kind === '구현');
    body += `<div class="sc" id="${esc(row.anchor)}" data-sc="${esc(sc)}"><div class="sch"><h3>${esc(sc)}</h3><span class="state ${st.startsWith('새 화면 연결됨') ? 'on' : st === '지난 안만 있음' ? 'off' : ''}">${esc(st)}</span><span class="slots">${slots.map(([s, n]) => `<i>${esc(s)}<b>${n}</b></i>`).join('')}</span>${onStatus ? `<a class="stl" href="status/index.html#st-${esc(row.anchor)}">구현 현황판 ›</a>` : ''}</div>
<p class="now"><b>지금</b> ${esc(row.now)}</p>${row.next ? `<p class="next"><b>다음 할 일</b> ${esc(row.next)}</p>` : ''}
<div class="rowctl" role="group" aria-label="${esc(sc)} 화면 전체 판정"><span>이 화면 전체를</span>${VERDICTS.map((v) => `<button type="button" class="${VCLS[v]}" data-row-set="${v}">${v}</button>`).join('')}</div>`;
    if (live.length) body += `<div class="strip">${live.map(tile).join('')}</div>`;
    if (dead.length) body += `<details class="dead"><summary>지난 안 <span class="dn">${dead.length}</span> — 다른 안이 대신함</summary><div class="strip">${dead.map(tile).join('')}</div></details>`;
    body += `<details class="dev"><summary>개발 기록(내부 코드 · 경로)</summary><ul>${items.map((a) => `<li id="dev-${esc(a.id)}"><b>${esc(a.id)}</b> ${devText(a).slice(1).map(esc).join(' · ')}</li>`).join('')}</ul></details></div>`;
  }
  body += `</section>`;
}
const S = ledger.집계;
// 코어 묶음 보기 — 코어마다 지금 · 막힌 것 한 줄씩 + 관련 자산(누르면 아래 카드로)
const mini = (id) => { const a = byIdA[id], o = out.find((x) => x.id === id), m = a.media[0];
  const src = m.kind === 'video' ? (m.thumb || m.poster) : (m.thumb || m.src);
  return `<a class="mini jump" href="#${esc(id)}"><img loading="lazy" src="${esc(rel(src))}" alt="">${m.kind === 'video' ? '<span class="play" aria-hidden="true">▶ 영상</span>' : ''}<span>${esc(label(a))}</span><small>${esc(o.function)} · ${esc(o.screen)}</small></a>`; };
const coreHtml = `<section id="cores" aria-labelledby="cores-h"><h2 id="cores-h">핵심 코어별로 보기<small><i>코어 9개 · 9월 30일 기준</i></small></h2>
<p class="lead">플랫폼의 백본 9가지마다 지금 되는 것 · 막힌 것을 한 줄씩 적고, 그 코어를 보여 주는 영상 · 장면 · 화면을 모았습니다. 그림을 누르면 아래 대장의 그 카드로 갑니다.</p>
<nav class="cjump" aria-label="코어">${CORES.map((c) => `<a href="#core-${c.no}">${c.no} ${esc(CORE_NAME[c.no])}</a>`).join('')}</nav>
${CORES.map((c) => `<div class="core" id="core-${c.no}"><h3><span class="cno">${c.no}</span>${esc(c.name)}</h3>
<p class="now"><b>지금</b> ${esc(c.now)}</p><p class="next"><b>막힌 것</b> ${esc(c.blocked)}</p>
${c.ids.length ? `<div class="strip">${c.ids.map(mini).join('')}</div>` : '<p class="note">화면 자산 없음 — 공정 문서와 차수별 증거로만 남깁니다.</p>'}</div>`).join('')}</section>`;
const jump = ledger.기능.map(({ function: f }) => `<a href="#fn-${esc(f)}">${esc(f)}</a>`).join('');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Land-XI 자산 대장</title><link rel="icon" href="data:,">
<link rel="stylesheet" href="../fonts-system.css">
<style>
:root{--ink:#010102;--ink2:#4A4A4A;--mute:#8A8A8A;--line:#DDDDDD;--tint:#E8F1FF;--accent:#006DF7;--ok:#0FA9A0;--rv:#006DF7;--dp:#8A8A8A;--paper:#F5F6F8}
*{box-sizing:border-box}html{scroll-padding-top:120px}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 Pretendard,system-ui,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.w{max-width:1400px;margin:0 auto;padding:28px 32px 80px}
.eb{font:600 12px/1 Inter,Pretendard,sans-serif;letter-spacing:.08em;color:var(--mute)}
h1{font:700 32px/1.2 Paperlogy,Pretendard,sans-serif;letter-spacing:-.03em;margin:8px 0 6px}
.lead{margin:0 0 10px;color:var(--ink2);max-width:72ch}
.links{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;margin:0 0 18px}.links a.dim{color:var(--mute)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink2);margin:0 0 18px}.legend b{font-weight:700}.legend .ok{color:var(--ok)}.legend .rv{color:var(--rv)}.legend .dp{color:var(--dp)}
#bar{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);padding:10px 0;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.tot{display:flex;gap:4px;flex-wrap:wrap}
.fb{font:500 13px Pretendard,sans-serif;padding:6px 12px;background:#fff;border:1px solid var(--line);color:var(--ink);cursor:pointer;white-space:nowrap}
.fb b{font:600 13px Inter,sans-serif;margin-left:6px}
.fb[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}
.fb.ok b{color:var(--ok)}.fb.rv b{color:var(--rv)}.fb.dp b{color:var(--dp)}.fb[aria-pressed=true] b{color:#fff}
.jumps{display:flex;gap:4px 12px;flex-wrap:wrap;font-size:13px;width:100%}
.jumps a{color:var(--ink2)}
section.fn{padding:28px 0 8px;border-top:2px solid var(--ink);margin-top:28px}
h2{font:700 24px/1.2 Paperlogy,Pretendard,sans-serif;letter-spacing:-.03em;margin:0 0 6px;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}
h2 small{display:flex;gap:10px;font:600 12px Inter,Pretendard,sans-serif}
h2 small i{font-style:normal}i.ok{color:var(--ok)}i.rv{color:var(--rv)}i.dp{color:var(--dp)}
.sc{padding:20px 0 16px;border-top:1px solid var(--line)}
.sc:target{background:linear-gradient(90deg,var(--tint),#fff 40%);margin:0 -12px;padding-left:12px;padding-right:12px}
.sch{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-bottom:8px}
h3{font:700 19px/1.3 Paperlogy,Pretendard,sans-serif;letter-spacing:-.02em;margin:0}
.state{font:600 12px/1 Pretendard,sans-serif;padding:5px 8px;border:1px solid var(--line);color:var(--ink2);white-space:nowrap}.state.on{border-color:var(--ok);color:var(--ok)}.state.off{border-style:dashed;color:var(--mute)}
.slots{display:flex;gap:8px;font-size:12px;color:var(--mute)}.slots i{font-style:normal;white-space:nowrap}.slots b{font:600 11px Inter,sans-serif;margin-left:3px}
.stl{font-size:12px;margin-left:auto;white-space:nowrap}
.now,.next{margin:0 0 4px;font-size:14px;color:var(--ink2);max-width:100ch;overflow-wrap:anywhere}.now b,.next b{color:var(--ink);font-weight:700;margin-right:6px}.next b{color:var(--accent)}
.rowctl{display:flex;align-items:center;gap:4px;margin:8px 0 10px;font-size:12px;color:var(--mute)}.rowctl span{margin-right:4px}
.rowctl button{font:600 12px/1 Pretendard,sans-serif;padding:6px 10px;background:#fff;border:1px solid var(--line);color:var(--ink2);cursor:pointer}.rowctl button:hover{border-color:var(--ink);color:var(--ink)}
.strip{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 10px;-webkit-overflow-scrolling:touch}
.strip::-webkit-scrollbar{height:8px}.strip::-webkit-scrollbar-thumb{background:var(--line)}
.card{flex:0 0 272px;scroll-snap-align:start;border:1px solid var(--line);display:flex;flex-direction:column;min-width:0;background:#fff}
.card.v-ok{border-top:3px solid var(--ok)}.card.v-rv{border-top:3px solid var(--rv)}.card.v-dp{border-top:3px solid var(--dp)}
.card:target{outline:2px solid var(--accent);outline-offset:2px}
.th{position:relative;display:block;width:100%;aspect-ratio:16/10;padding:0;border:0;border-bottom:1px solid var(--line);background:var(--paper);cursor:zoom-in;overflow:hidden}
.th img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
.play,.cnt{position:absolute;bottom:6px;font:600 11px/1 Inter,Pretendard,sans-serif;padding:5px 7px;background:rgba(1,1,2,.78);color:#fff}.play{left:6px}.cnt{right:6px}
.bd{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.hd{display:flex;align-items:center;gap:8px;min-width:0}
.slot{font:600 11px/1 Pretendard,sans-serif;padding:4px 6px;background:var(--paper);color:var(--ink2);white-space:nowrap}
.s-v3 .slot{background:var(--tint);color:var(--accent)}.s-ref .slot{background:#FFF4E5;color:#B7791F}
.bdg{font:700 11px/1 Pretendard,sans-serif;padding:4px 6px;border:1px solid;white-space:nowrap;flex:none}
.bdg.ok{color:var(--ok)}.bdg.rv{color:var(--rv)}.bdg.dp{color:var(--dp)}
h4{font-size:14px;line-height:1.4;margin:2px 0 0;overflow-wrap:anywhere;font-weight:600}
.why{margin:0;font-size:12.5px;color:var(--ink2);overflow-wrap:anywhere}
.note{margin:0;font-size:12px;color:var(--mute);overflow-wrap:anywhere}
.meta{margin:auto 0 0;padding-top:4px;display:flex;flex-wrap:wrap;gap:4px 10px;font:12px Inter,Pretendard,sans-serif;color:var(--mute)}.meta a.dim{color:var(--mute);text-decoration:underline dotted}
details.dead{margin-top:6px}details.dead summary,details.dev summary{cursor:pointer;font-size:13px;color:var(--mute);width:max-content;padding:4px 0}
details.dead .card{opacity:.6}details.dead .card:hover,details.dead .card:target{opacity:1}
details.dev{margin-top:4px}details.dev summary{font-size:12px}details.dev ul{margin:4px 0 0;padding:0 0 0 18px;font:12px/1.6 Inter,Pretendard,sans-serif;color:var(--ink2);overflow-wrap:anywhere}details.dev b{font-weight:600}
body.f-v .card:not(.show),body.f-v .sc:not(.show),body.f-v section.fn:not(.show){display:none}
.empty{color:var(--mute);padding:30px 0}
#lb{position:fixed;inset:0;background:rgba(1,1,2,.92);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 16px 16px;gap:10px}
#lb[hidden]{display:none}#lb img,#lb video{max-width:100%;max-height:calc(100% - 76px);background:#000}#lb img[hidden],#lb video[hidden]{display:none}
#lb-t{color:#fff;font:600 14px/1.4 Pretendard,sans-serif;max-width:1100px;text-align:center}#lb-t small{display:block;color:#B8B8B8;font-weight:400}
#lb-x{position:fixed;top:12px;right:12px;font:600 14px Pretendard,sans-serif;background:#fff;color:var(--ink);border:0;padding:10px 14px;cursor:pointer}
#lb-p,#lb-n{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:88px;background:rgba(255,255,255,.12);color:#fff;border:0;font:300 40px/1 Pretendard,sans-serif;cursor:pointer}#lb-p{left:6px}#lb-n{right:6px}
.ctl{display:flex;gap:4px;margin-top:8px}
.ctl button{flex:1 1 0;min-width:0;font:600 13px/1 Pretendard,sans-serif;padding:9px 4px;background:#fff;border:1px solid var(--line);color:var(--ink2);cursor:pointer}
.ctl button:hover{border-color:var(--ink)}
.ctl button[aria-pressed=true]{color:#fff;cursor:default}
.ctl button.ok[aria-pressed=true]{background:var(--ok);border-color:var(--ok)}.ctl button.rv[aria-pressed=true]{background:var(--rv);border-color:var(--rv)}.ctl button.dp[aria-pressed=true]{background:#6B6B6B;border-color:#6B6B6B}
.chgm{display:none;margin-left:auto;font:700 11px/1 Pretendard,sans-serif;color:#B7791F;white-space:nowrap}
.card.chg{outline:2px solid #B7791F;outline-offset:-1px}.card.chg .chgm{display:inline}
details.dead .card.chg{opacity:1}
.meta .ud{color:#B7791F}
#dec{border:1px solid var(--ink);padding:14px 16px;margin:0 0 18px;background:#fff}
.dec-t{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.dec-t b{font:700 18px/1.2 Paperlogy,Pretendard,sans-serif;letter-spacing:-.02em}.dec-t b span{font-family:Inter,Pretendard,sans-serif;color:#B7791F;margin-left:6px}
.dec-t p{margin:0;font-size:13px;color:var(--ink2)}
#dec-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
#dec-list li{border-top:1px solid var(--line);padding-top:8px;display:flex;flex-direction:column;gap:6px;min-width:0}
.dl{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;font-size:13px;min-width:0}
.dl .id{font:600 12px Inter,Pretendard,sans-serif;overflow-wrap:anywhere}.dl .nm{color:var(--ink2);overflow-wrap:anywhere;min-width:0}
.dl .ch{font-weight:700;white-space:nowrap}.dl .ch s{color:var(--mute);font-weight:500}.dl .ch .ok{color:var(--ok)}.dl .ch .rv{color:var(--rv)}.dl .ch .dp{color:#6B6B6B}
.dl .x{margin-left:auto;font:500 12px Pretendard,sans-serif;background:none;border:0;color:var(--mute);cursor:pointer;padding:2px 0;text-decoration:underline}
#dec-list input{width:100%;min-width:0;font:13px Pretendard,sans-serif;padding:7px 9px;border:1px solid var(--line);color:var(--ink)}
#dec-list input:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
#dec-empty{margin:8px 0 0;font-size:13px;color:var(--mute)}
.dec-act{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:12px}
.dec-act button{font:600 14px/1 Pretendard,sans-serif;padding:10px 16px;border:1px solid var(--ink);background:#fff;color:var(--ink);cursor:pointer}
.dec-act button.pri{background:var(--ink);color:#fff}
.dec-act button:disabled{opacity:.35;cursor:default}
#dec-msg{font-size:13px;color:var(--ok);font-weight:600;min-width:0;overflow-wrap:anywhere}#dec-msg.warn{color:#B7791F}
#dec-out{display:block;width:100%;margin-top:10px;font:12px/1.5 Inter,Pretendard,monospace;border:1px solid var(--line);padding:8px;min-height:84px;resize:vertical}
#dec-out[hidden]{display:none}
.dj{font:600 13px Pretendard,sans-serif;padding:6px 12px;border:1px solid #B7791F;color:#B7791F;white-space:nowrap}.dj b{font:600 13px Inter,sans-serif;margin-left:6px}.dj[hidden]{display:none}
.cores{margin:0;display:flex;flex-wrap:wrap;gap:4px}.cores a{font:600 11px/1 Pretendard,sans-serif;padding:4px 6px;background:#EEF7F6;color:#0B7F78}
#cores{border:1px solid var(--line);padding:18px 18px 8px;margin:0 0 18px;background:#FBFCFD}#cores h2{margin-bottom:4px}#cores>.lead{font-size:14px}
.cjump{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;margin:4px 0 6px}
.core{padding:14px 0 6px;border-top:1px solid var(--line)}.core h3{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}
.cno{font:700 12px/1 Inter,sans-serif;padding:4px 6px;background:var(--ink);color:#fff}
.mini{flex:0 0 200px;border:1px solid var(--line);background:#fff;color:var(--ink);display:flex;flex-direction:column;position:relative;min-width:0;scroll-snap-align:start}
.mini:hover{border-color:var(--ink);text-decoration:none}.mini img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top left;display:block;background:var(--paper);border-bottom:1px solid var(--line)}
.mini span:not(.play){font-size:12.5px;line-height:1.4;padding:6px 8px 0;overflow-wrap:anywhere}.mini small{font-size:11px;color:var(--mute);padding:2px 8px 8px}.mini .play{top:6px;bottom:auto}
@media (max-width:640px){#cores{padding:14px 12px 6px}.mini{flex-basis:168px}}
@media (max-width:640px){#bar{position:static}#dec{padding:12px}.w{padding:20px 16px 64px}h1{font-size:26px}#lb-p,#lb-n{display:none}.card{flex-basis:236px}.stl{margin-left:0}.sc:target{margin:0;padding-left:0;padding-right:0;background:none}}
</style></head>
<body><div class="w">
<div class="eb">LAND-XI · 자산 대장 · ${esc(ledger.generated_at)}</div>
<h1>화면마다 한 줄 — 지금 · 다음 · 그림</h1>
<p class="lead">Land-XI 화면만 모았습니다. 화면 하나가 한 줄이고, 줄마다 <b>지금</b> 어떤 상태인지 한 문장으로 적은 뒤 원판 → 예전 구현 → 새 구현 순서로 그림을 놓았습니다. 9월 29일부터 로그인에서 역할별 첫 화면까지 <b>새 화면</b>으로 이어집니다. 9월 30일에 코어 차수의 <b>코어 영상 2편 · 코어별 장면 15장</b>을 각 화면 줄에 더했고, 맨 위 <b>핵심 코어별로 보기</b>에서 코어 기준으로도 봅니다. 그림·영상은 이 사이트에서 바로 열리고, 서버가 켜진 곳에서만 도는 화면은 캡처·영상으로 봅니다. 내부 코드·경로는 '개발 기록'에 접어 두었습니다.</p>
<p class="legend">판정은 <b>초기 분류</b>입니다 — 카드의 버튼으로 정해 주시면 반영합니다. <b class="ok">적용</b> 화면에 들어가 있음 · <b class="rv">검토</b> 결정 대기 · <b class="dp">폐기</b> 다른 안이 대신함 &nbsp;|&nbsp; 화면 ${rows.length}줄 · 항목 ${S.전체}개</p>
<div class="links"><a href="index.html">검토 허브</a><a href="status/index.html">구현 현황판</a><a href="assets.json" class="dim" title="assets.json — 이 대장의 원본 자료(개발용)">원본 자료(개발)</a></div>
${coreHtml}
<section id="dec" aria-labelledby="dec-h"><div class="dec-t"><b id="dec-h">내 결정<span id="dec-n">0</span></b><p>항목의 <b>적용 · 검토 · 폐기</b>를 누르거나, 줄 머리의 <b>이 화면 전체를</b> 버튼으로 한 번에 바꾸면 여기 모입니다. <b>결정 발행</b>으로 복사해 Claude 에게 붙여 넣으면 대장에 반영합니다.</p></div>
<ol id="dec-list"></ol><p id="dec-empty">변경 없음</p>
<div class="dec-act"><button type="button" id="dec-pub" class="pri" disabled>결정 발행</button><button type="button" id="dec-reset" disabled>되돌리기</button><span id="dec-msg" role="status" aria-live="polite"></span></div>
<textarea id="dec-out" readonly hidden aria-label="발행 글"></textarea></section>
<div id="bar"><a href="#dec" class="dj" id="dec-jump" hidden>내 결정<b>0</b></a><div class="tot" role="group" aria-label="판정">
<button type="button" class="fb" data-v="" aria-pressed="true">전체<b>${S.전체}</b></button>
${VERDICTS.map((v) => `<button type="button" class="fb ${VCLS[v]}" data-v="${v}" aria-pressed="false">${v}<b>${S[v]}</b></button>`).join('')}</div>
<div class="tot" role="group" aria-label="칸">${SLOT_ORDER.map((k) => `<button type="button" class="fb" data-k="${k}" aria-pressed="false">${k}<b>${out.filter((a) => a.slot === k).length}</b></button>`).join('')}</div>
<nav class="jumps" aria-label="기능">${jump}</nav></div>
${body}<p class="empty" id="empty" hidden>조건에 맞는 자산이 없습니다.</p></div>
<div id="lb" hidden><button id="lb-x" type="button">닫기 ×</button><button id="lb-p" type="button" aria-label="이전">‹</button><button id="lb-n" type="button" aria-label="다음">›</button><img id="lb-i" alt="" hidden><video id="lb-v" controls playsinline hidden></video><div id="lb-t"></div></div>
<script>(function(){
var F={v:'',k:''},B=document.body;
function apply(){var any=F.v||F.k;B.classList.toggle('f-v',!!any);var n=0;
document.querySelectorAll('.card').forEach(function(c){var ok=(!F.v||c.dataset.v===F.v)&&(!F.k||c.dataset.k===F.k);c.classList.toggle('show',ok);if(ok)n++;});
document.querySelectorAll('.sc').forEach(function(s){s.classList.toggle('show',!!s.querySelector('.card.show'));var d=s.querySelector('details.dead');if(d&&any)d.open=!!d.querySelector('.card.show');});
document.querySelectorAll('section.fn').forEach(function(s){s.classList.toggle('show',!!s.querySelector('.card.show'));});
document.getElementById('empty').hidden=!(any&&!n);
document.querySelectorAll('.fb').forEach(function(b){var on=b.hasAttribute('data-v')?(b.dataset.v===F.v):(b.dataset.k===F.k);b.setAttribute('aria-pressed',String(on));});}
document.getElementById('bar').addEventListener('click',function(e){var b=e.target.closest('.fb');if(!b)return;if(b.hasAttribute('data-v'))F.v=b.dataset.v;else F.k=(F.k===b.dataset.k?'':b.dataset.k);apply();});
try{var q=new URLSearchParams(location.search);if(q.get('v'))F.v=q.get('v');if(q.get('k'))F.k=q.get('k');if(F.v||F.k)apply();}catch(e){}
if(location.hash){var t=document.getElementById(location.hash.slice(1));if(t){var d=t.closest('details');if(d)d.open=true;}}
document.addEventListener('click',function(e){var a=e.target.closest('a.jump');if(!a)return;var t=document.getElementById(a.getAttribute('href').slice(1));if(t){var d=t.closest('details');if(d)d.open=true;if(F.v||F.k){F.v='';F.k='';apply();}}});
// ── 내 결정: 항목·화면 행의 적용·검토·폐기 → 브라우저 저장 → [결정 발행] 글 복사 (apply-decisions.mjs 가 읽는 형식 — 항목마다 한 줄)
var KEY='lx_assets_decisions_v1',VS=['적용','검토','폐기'],VC={'적용':'ok','검토':'rv','폐기':'dp'};
var D={};try{D=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){D={};}
function save(){try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){}}
var cards=Array.prototype.slice.call(document.querySelectorAll('.card')),byId={};cards.forEach(function(c){byId[c.id]=c;});
Object.keys(D).forEach(function(id){var c=byId[id],d=D[id];if(!c||!d||VS.indexOf(d.v)<0||d.v===c.dataset.base)delete D[id];});save();
function strip(sc,dead){if(!dead){var g=sc.querySelector(':scope>.strip');if(!g){g=document.createElement('div');g.className='strip';sc.querySelector('.rowctl').after(g);}return g;}
var d=sc.querySelector('details.dead');if(!d){d=document.createElement('details');d.className='dead';d.innerHTML='<summary>지난 안 <span class="dn">0</span> — 다른 안이 대신함</summary><div class="strip"></div>';var dv=sc.querySelector('details.dev');sc.insertBefore(d,dv);}return d.querySelector('.strip');}
function setCard(c,v,user){c.dataset.v=v;c.classList.remove('v-ok','v-rv','v-dp');c.classList.add('v-'+VC[v]);var b=c.querySelector('.bdg');b.className='bdg '+VC[v];b.textContent=v;
c.classList.toggle('chg',v!==c.dataset.base);c.querySelectorAll('.ctl button').forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.set===v));});
var sc=c.closest('.sc'),inDead=!!c.closest('details.dead');if((v==='폐기')!==inDead){strip(sc,v==='폐기').appendChild(c);if(user){var d=c.closest('details');if(d)d.open=true;c.scrollIntoView({block:'nearest',inline:'nearest'});}}}
function recount(){var T={'적용':0,'검토':0,'폐기':0};cards.forEach(function(c){T[c.dataset.v]++;});
document.querySelectorAll('#bar .fb[data-v]').forEach(function(b){if(b.dataset.v)b.querySelector('b').textContent=T[b.dataset.v];});
document.querySelectorAll('section.fn').forEach(function(s){var n={'적용':0,'검토':0,'폐기':0};s.querySelectorAll('.card').forEach(function(c){n[c.dataset.v]++;});s.querySelectorAll('h2 i[data-c]').forEach(function(i){i.textContent=i.dataset.c+' '+n[i.dataset.c];});});
document.querySelectorAll('details.dead').forEach(function(d){var k=d.querySelectorAll('.card').length;d.querySelector('.dn').textContent=k;d.hidden=!k;});}
function changed(){return cards.filter(function(c){return D[c.id];});}
function renderList(){var L=changed(),ol=document.getElementById('dec-list');ol.innerHTML='';
L.forEach(function(c){var d=D[c.id],li=document.createElement('li');li.dataset.id=c.id;
var r=document.createElement('div');r.className='dl';var a=document.createElement('a');a.className='id jump';a.href='#'+c.id;a.textContent=c.closest('.sc').querySelector('h3').textContent;
var nm=document.createElement('span');nm.className='nm';nm.textContent=c.querySelector('h4').textContent;
var ch=document.createElement('span');ch.className='ch';var s=document.createElement('s');s.textContent=c.dataset.base;var nv=document.createElement('span');nv.className=VC[d.v];nv.textContent=d.v;ch.appendChild(s);ch.appendChild(document.createTextNode(' → '));ch.appendChild(nv);
var x=document.createElement('button');x.type='button';x.className='x';x.textContent='취소';x.setAttribute('aria-label',c.id+' 결정 취소');
r.appendChild(a);r.appendChild(nm);r.appendChild(ch);r.appendChild(x);
var m=document.createElement('input');m.type='text';m.maxLength=140;m.placeholder='메모(선택) — 왜 바꾸는지 한 줄';m.value=d.m||'';m.setAttribute('aria-label',c.id+' 메모');
li.appendChild(r);li.appendChild(m);ol.appendChild(li);});
var n=L.length;document.getElementById('dec-n').textContent=n;document.getElementById('dec-empty').hidden=!!n;
document.getElementById('dec-pub').disabled=!n;document.getElementById('dec-reset').disabled=!n;
var j=document.getElementById('dec-jump');j.hidden=!n;j.querySelector('b').textContent=n;}
function decide(c,v,user){if(v===c.dataset.base)delete D[c.id];else D[c.id]={v:v,m:(D[c.id]&&D[c.id].m)||''};save();setCard(c,v,user);}
function after(){recount();renderList();msg('');if(F.v||F.k)apply();}
document.addEventListener('click',function(e){var b=e.target.closest('.ctl button');if(b){var c=b.closest('.card');if(c.dataset.v!==b.dataset.set){decide(c,b.dataset.set,true);after();}return;}
var rb=e.target.closest('.rowctl button');if(rb){var v=rb.dataset.rowSet,sc=rb.closest('.sc'),n=0;sc.querySelectorAll('.card').forEach(function(c){if(c.dataset.v!==v){decide(c,v,false);n++;}});after();msg(n?sc.querySelector('h3').textContent+' 화면 '+n+'개를 '+v+'(으)로 표시했습니다 — 발행 전까지 브라우저에만 저장':'이미 전부 '+v+'입니다');}});
var ol=document.getElementById('dec-list');
ol.addEventListener('input',function(e){var li=e.target.closest('li');if(!li||!D[li.dataset.id])return;D[li.dataset.id].m=e.target.value;save();});
ol.addEventListener('click',function(e){var x=e.target.closest('button.x');if(!x)return;var c=byId[x.closest('li').dataset.id];decide(c,c.dataset.base,false);after();});
function msg(t,warn){var m=document.getElementById('dec-msg');m.textContent=t;m.classList.toggle('warn',!!warn);if(!t)document.getElementById('dec-out').hidden=true;}
function p2(n){return (n<10?'0':'')+n;}
function text(){var d=new Date(),L=changed(),o=['[자산 결정] '+d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())+' '+p2(d.getHours())+':'+p2(d.getMinutes())];
L.forEach(function(c){var m=(D[c.id].m||'').replace(/\\s+/g,' ').trim();o.push('- '+c.id+' '+c.querySelector('h4').textContent+': '+c.dataset.base+' → '+D[c.id].v+(m?' ('+m+')':''));});
o.push('('+L.length+'건 · 반영: node tools/review/apply-decisions.mjs <이 글 파일>)');return o.join('\\n');}
document.getElementById('dec-pub').addEventListener('click',function(){var t=text(),ta=document.getElementById('dec-out');ta.value=t;ta.hidden=false;
function fb(){ta.focus();ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}
if(ok)msg('복사됨 — Claude 에게 붙여 넣으면 대장에 반영합니다');else msg('자동 복사가 막혀 아래 글을 선택해 두었습니다 — Ctrl+C 로 복사해 Claude 에게 붙여 넣으세요',true);}
try{if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(function(){msg('복사됨 — Claude 에게 붙여 넣으면 대장에 반영합니다');document.getElementById('dec-out').hidden=false;},fb);else fb();}catch(e){fb();}});
document.getElementById('dec-reset').addEventListener('click',function(){D={};save();cards.forEach(function(c){if(c.dataset.v!==c.dataset.base)setCard(c,c.dataset.base,false);});recount();renderList();msg('되돌렸습니다 — 대장 판정 그대로');if(F.v||F.k)apply();});
cards.forEach(function(c){if(D[c.id])setCard(c,D[c.id].v,false);});recount();renderList();if(F.v||F.k)apply();
// ── 크게 보기: 카드의 그림·영상 전부(스트립 안 보이는 카드는 건너뜀)
var lb=document.getElementById('lb'),im=document.getElementById('lb-i'),vd=document.getElementById('lb-v'),tt=document.getElementById('lb-t'),L=[],cur=-1;
function build(){L=[];Array.prototype.forEach.call(document.querySelectorAll('.card'),function(c){if(c.offsetParent===null)return;var ms=[];try{ms=JSON.parse(c.dataset.media||'[]');}catch(e){}ms.forEach(function(m,i){L.push({c:c,m:m,i:i,n:ms.length});});});}
function show(i){if(!L.length)return;cur=(i+L.length)%L.length;var x=L[cur],c=x.c;vd.pause();
if(x.m.k==='video'){im.hidden=true;im.removeAttribute('src');vd.hidden=false;vd.src=x.m.s;if(x.m.p)vd.poster=x.m.p;vd.play().catch(function(){});}else{vd.hidden=true;vd.removeAttribute('src');im.hidden=false;im.src=x.m.s;}
tt.innerHTML='';var h=document.createElement('span');h.textContent=c.closest('.sc').querySelector('h3').textContent+' · '+c.querySelector('h4').textContent+' ['+c.querySelector('.bdg').textContent+']'+(x.n>1?'  ·  '+x.m.l+' '+(x.i+1)+'/'+x.n:'');tt.appendChild(h);
var s=document.createElement('small');s.textContent=(cur+1)+' / '+L.length;tt.appendChild(s);lb.hidden=false;document.body.style.overflow='hidden';}
function close(){lb.hidden=true;im.removeAttribute('src');vd.pause();vd.removeAttribute('src');document.body.style.overflow='';}
document.addEventListener('click',function(e){var b=e.target.closest('button.lb');if(!b)return;build();var c=b.closest('.card'),k=-1;for(var i=0;i<L.length;i++)if(L[i].c===c){k=i;break;}if(k>=0)show(k);});
document.getElementById('lb-x').onclick=close;document.getElementById('lb-p').onclick=function(){show(cur-1)};document.getElementById('lb-n').onclick=function(){show(cur+1)};
lb.addEventListener('click',function(e){if(e.target===lb)close();});
document.addEventListener('keydown',function(e){if(lb.hidden)return;if(e.key==='Escape')close();else if(e.key==='ArrowLeft')show(cur-1);else if(e.key==='ArrowRight')show(cur+1);});
})();</script></body></html>`;
fs.writeFileSync(`${OUT_DIR}/masters.html`, html);
console.log(`화면 ${rows.length}줄 · 자산 ${S.전체}: 적용 ${S.적용} · 검토 ${S.검토} · 폐기 ${S.폐기} | 원판 ${JSON.stringify(S.원판)} · 예전 구현 ${JSON.stringify(S.예전_구현)} · 새 구현 ${JSON.stringify(S.새_구현)}`);
