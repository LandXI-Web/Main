// 자산 대장 + 원판 갤러리 생성기 — 원판(design-canvas/v2) · 구현(shots/overview/inventory.json) · 스펙시먼(카카오·토스 벤치)을
// 기능 → 화면 → 버전·변형 3단으로 묶고 항목마다 적용 / 검토 / 폐기 를 판정한다.
// 출력: landxi/proto/review/assets.json (자산 대장) · landxi/proto/review/masters.html (갤러리)
//       landxi/proto/review/screen-map.json (구현 현황판이 같은 화면 키로 묶는 매핑 — tools/review/build-status.py 가 읽음)
// 판정 기준표는 아래 MASTERS · IMPL · SPECS 세 표. 판정을 바꾸려면 표를 고치고 다시 굽는다.
// 실행: node tools/review/masters.mjs   (저장소 루트)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const OUT_DIR = 'landxi/proto/review';
const V = 'design-canvas/v2/';

// ── 1. 기능(대분류) → 화면(중분류) ─────────────────────────────────────────────
const TAX = [
  ['인증', ['로그인', '계정 신청', '아이디 찾기', '비밀번호 찾기']],
  ['메인', ['스크럽 필름', '소개 챕터(토스)', '서비스 소개 판', '성과·결과 띠', '홈 초기안', '공개 사이트', '필름 제작 도구']],
  ['대시보드', ['직원 첫 화면', '사용자 대시보드', '뷰어 대시보드']],
  ['데이터 관리', ['목록(아카이브·완료·발행중)', '업로드', '파이프라인 단계']],
  ['프로젝트', ['목록(메인)', '만들기', '만들기 검토', '개요', '삭제 모달', '데이터', '라벨링', '학습', '분석', '배포·발행', '지도 작업공간(컨셉)']],
  ['분석 서비스', ['카드 목록', '카드 상세', '실행 검토', '실행 중', '실행 결과']],
  ['카드 발행', ['승인·검토 데스크', '카드 목록', '카드 편집', '발행 요청']],
  ['XI맵', ['기본 지도', '객체 정보', '시점 비교', '검색', '도구(측정·그리기·구역·내려받기)', '지역 구분·속성 표', '보안 서약', '표류 예측']],
  ['실태조사', ['실태조사 모드', '대장 융합(기관 첫 화면)']],
  ['에이전트', ['융합 분석 질문']],
  ['통계/보고서', ['통계', '보고서']],
  ['관제', ['관제 로그인', '운영 현황', '인프라', '기관·할당', '배포', '생산 관리']],
  ['서비스 관리', ['사용자 관리', '공지 관리', '문의 관리', 'FAQ 관리', '지도 속성 관리']],
  ['기관 포털', ['기관 로그인', '내 서비스', '서비스 상세']],
  ['서비스 지원', ['공지', 'FAQ', '문의', '활용사례', '매뉴얼']],
  ['MY', ['마이 페이지', '정보 수정', '비밀번호 변경', '브랜드(CI)', '저장 공간', '탈퇴']],
  ['글로벌', ['로그인', '해외 서비스']],
  ['공통', ['서체·색·형태', '토스 톤', '빈 상태·캐릭터', '출처 띠·푸터', '기능 소개 틀', '상태 패턴(로딩·오류)', '디자인 실험']],
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
# 인증/로그인 | 적용 | landxi/proto/login.html | 8/27 구 Land-XI 구도·실제 CI 로 확정 → 구현 | F3 B0: v3 정문 로그인(landxi/v3/login)으로 이관
B5-Login | 로그인 — 좌 디오라마 영상 / 우 폼
B2-Login | 로그인 — 플랫폼 소개(1차) | 폐기 | B5-Login | 8/26 3차 피드백 '플랫폼 소개가 아니다' → B5 구도로 교체 |
# 인증/계정 신청 | 적용 | landxi/proto/signup.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 신청은 정문 서랍으로 축소
B6-Auth-Signup-1 | 1단계 · 약관
B6-Auth-Signup-1-Init | 1단계 · 처음
B6-Auth-Signup-2 | 2단계 · 정보 입력
B6-Auth-Signup-2-Error | 2단계 · 입력 오류
B6-Auth-Signup-3 | 3단계 · 완료
# 인증/아이디 찾기 | 적용 | landxi/proto/find-id.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 정문 서랍으로 축소
B6-Auth-FindId | 입력
B6-Auth-FindId-Error | 입력 오류
B6-Auth-FindId-Fail | 찾기 실패
B6-Auth-FindId-Result | 결과 | 적용 | landxi/proto/find-id-result.html
# 인증/비밀번호 찾기 | 적용 | landxi/proto/find-password.html | D26 권장안 자동 채택(9/20) → 인증 가족 구현 | F3 B0: 정문 서랍으로 축소
B6-Auth-FindPw | 입력
B6-Auth-FindPw-Error | 입력 오류
B6-Auth-FindPw-Fail | 찾기 실패
B6-Auth-FindPw-Result | 결과 | 적용 | landxi/proto/find-password-result.html

# 메인/홈 초기안 | 폐기 | scrub-main | 8/27 메인은 스크럽 필름 구현본이 원판 |
B2-HomeFilm | 홈 — 필름 스테이지(카피 판)
B2-HomeAtlas | 홈 — 필름 뒤 아틀라스 | 폐기 | scrub-main | D28 A3 ② 채택 — 사례·문의는 서비스 지원으로, 메인엔 푸터만 |

# 대시보드/직원 첫 화면 | 폐기 | B5-Dashboard-Data | 대시보드 전 단계 안 |
B5-Dashboard-Data | 대시보드 — 전국 한 판 · 학습데이터 토글 | 적용 | landxi/proto/dashboard.html | 8/27 12.8 전국 판 적용판 | F3 §5: 대시보드 폐지 → v3 생산 콘솔 '오늘' 띠로 대체 예정
B5-Dashboard | 관리자 대시보드 — AI 결과 토글 | 폐기 | B5-Dashboard-Data | 9/21 계정 3단 분리·9/24 직원 화면 전환으로 관리 위젯 제거 — 같은 판은 적용판이 대표 |
B4-Dashboard | 전면 개편 4차 — 124px 진술·검정 반전 | 폐기 | B5-Dashboard-Data | 8/27 B5 로 대체 · 검정 반전·큰 진술은 9/27 결정(관리자 검정 톤 폐기·내부 지표 과장 금지)과도 충돌 |
B3-Dashboard | 축소 현황 원장(지도 없음) | 폐기 | B4-Dashboard | 8/26 7차 피드백 '기존과 별반 다를 게 없다' |
B2-Dashboard | A안 지도 위 원장 | 폐기 | B3-Dashboard | 8/26 '대시보드 지도 없음(보여줄 공간 데이터 부족)' 결정으로 축소 |
H-Dashboard-128 | 12.8 초안 — AI 결과 토글(집 PC) | 폐기 | B5-Dashboard-Data | 현 적용판의 전 단계 초안 |
H-Dashboard-Data-128 | 12.8 초안 — 학습데이터 토글(집 PC) | 폐기 | B5-Dashboard-Data | 현 적용판의 전 단계 초안 |
# 대시보드/사용자 대시보드 | 검토 | F3 B1 — 역할별 첫 화면('오늘' 띠) 설계 때 흡수 여부 결정 | D17 원본 dashboard2 1:1 — 아직 구현 안 됨 |
B5-Dashboard-User | 사용자(직원) 대시보드
# 대시보드/뷰어 대시보드 | 검토 | F3 B2 — 기관 서비스 첫 화면(v3 gov-fusion)의 결과 탭 참고 | D17 원본 dashboard3 1:1 — 아직 구현 안 됨 |
B5-Dashboard-Viewer | 뷰어 대시보드

# 데이터 관리/목록(아카이브·완료·발행중) | 적용 | landxi/proto/dataset.html | 발주 확정안(Roboflow 그리드 × 아카이브/완료/발행중) → 구현 | F3 B4: v3 생산 콘솔 ① 반입 서랍으로 흡수
B5-DataMgmt | 목록 — 이미지 그리드 + 우 패널
B3-DataMgmt | 4탭 파이프라인 원장 | 폐기 | B5-DataMgmt | 8/26 6차 피드백 후 B5 로 확정 |
B2-DataMgmt-List | 2차 안 — 아카이브/완료/발행중 | 폐기 | B5-DataMgmt | 8/26 6차 '기존과 거의 똑같다' |
# 데이터 관리/업로드 | 적용 | landxi/proto/dataset.html?tab=upload | 발주 확정안 업로드 탭 → 구현 | F3 B4: ① 반입 서랍
B5-DataMgmt-Upload | 업로드 탭
B2-DataMgmt-Upload | 2차 안 — 업로드 | 폐기 | B5-DataMgmt-Upload | 8/26 6차 '기존과 거의 똑같다' |

# 프로젝트/목록(메인) | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 프로젝트 8단계 완전체 구현 | F3 B4: 8단계 → 라벨·학습·모델 3으로 축소, v3 생산 콘솔 서랍
B5-Projects | 목록 + 우 프로젝트 조회
B7-Projects-Empty | 목록 0건
B7-Projects-NoResult | 검색 0건
H-Projects-Roboflow | 목록 초안 — 만들기 드로어(집 PC) | 폐기 | B5-Projects | B5 원판의 전 단계 초안 |
B2-Projects | 2차 안 — 목록 + 워크플로우 캔버스 | 폐기 | B5-Projects | 8/25 '워크플로우가 업무 시스템' 거부 → B5 로 교체 |
# 프로젝트/만들기 | 적용 | landxi/proto/ai-project-create.html | D5 원판 → 9/20 구현 | F3 B4 생산 콘솔 ② 학습 서랍
B5-Project-Create | 만들기 — 한 화면 폼
# 프로젝트/만들기 검토 | 적용 | landxi/proto/ai-project-create.html | D5 원판 → 9/20 구현 | F3 B4 생산 콘솔 ② 학습 서랍
B5-Project-Create-Review | 만들기 검토
# 프로젝트/개요 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Project-Overview | 개요(허브 탭 1)
B7-Project-Overview-Edit | 개요 수정
B7-Project-Overview-Members | 구성원
B7-Project-Invite | 구성원 초대
B7-Project-Invite-Error | 초대 오류
H-Project-Overview-Roboflow | 개요 초안 — 고정 헤더 + 탭 6(집 PC) | 폐기 | B5-Project-Overview | B5 원판의 전 단계 초안 |
# 프로젝트/삭제 모달 | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Project-Delete | 삭제 확인
# 프로젝트/데이터 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔 ① 반입
B5-Project-Data | 데이터(파일 · 데이터셋)
B7-Project-File-Add | 파일 추가
B7-Project-File-Progress | 업로드 진행 중
B7-Project-File-Fail | 업로드 실패
B7-Project-Dataset-Create | 데이터셋 만들기
B7-Project-Dataset-Detail | 데이터셋 상세
H-Project-Data-Roboflow | 데이터 탭 초안 — 5열 그리드(집 PC) | 폐기 | B5-Project-Data | B5 원판의 전 단계 초안 |
# 프로젝트/라벨링 | 적용 | landxi/proto/ai-project-label.html | D5·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔 ② 학습
B5-Project-Labeling | 라벨링 + 클래스 편집기
B7-Project-Labeling-Fix | 툴바 겹침 수정판
# 프로젝트/학습 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔 ② 학습
B5-Project-Train | 학습 워크플로우
B7-Project-Train-New | 새로 학습하기
B7-Project-Train-Running | 학습 진행 중
B7-Project-Train-Fix | 학습 화면 겹침 수정판
B7-Project-Model-Register | 모델 등록(추정)
B7-Project-Model-Registered | 모델 등록됨(추정)
# 프로젝트/분석 | 적용 | landxi/proto/ai-project.html | D5 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Project-Analysis | 분석 탭
# 프로젝트/배포·발행 | 적용 | landxi/proto/ai-project.html | D5·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔 ⑤ 배포·이식
B5-Project-Deploy | 배포 · 발행 폼
B7-Project-Deploy-Picker | 발행 학습결과 선택
# 프로젝트/지도 작업공간(컨셉) | 폐기 | B6-MapWork-Opt3 | D27 권장안(선택 3) 자동 채택(9/20) |
B6-MapWork-Opt3 | 선택 3 · 레이어가 곧 작업(권장) | 검토 | v3 생산 콘솔(landxi/v3/lx-console) — XI맵 위 6단 서랍과 같은 개념, 시안 승인 때 흡수 | D27 권장안 — 아직 구현 안 됨(자리 화면만) |
B6-MapWork-Opt1 | 선택 1 · 파이프라인 도크
B6-MapWork-Opt2 | 선택 2 · 단계 분할

# 분석 서비스/카드 목록 | 적용 | landxi/proto/analysis-ai.html | D10·D29 원판 → 9/20 구현 | F3 B4: v3 생산 콘솔 ③ 조립(카탈로그)
B5-Analysis-List | 서비스 홈 — 카드 15 + 우 정보
B7-Analysis-List | 목록 — 준비 중 카드 표기
# 분석 서비스/실행 검토 | 적용 | landxi/proto/analysis-ai.html?tab=run | D10 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Analysis-Run-Review | 실행 검토 — 영상 중심
# 분석 서비스/실행 중 | 적용 | landxi/proto/analysis-ai.html?tab=running | D10·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Analysis-Run-Progress | 실행 중 — 영상별 진행
B7-Analysis-Progress-Overlay | 진행 오버레이
# 분석 서비스/실행 결과 | 적용 | landxi/proto/analysis-ai.html?tab=done | D10·D29 원판 → 9/20 구현 | F3 B4 생산 콘솔
B5-Analysis-Result | 실행 결과 — 정사영상 + 청록 결과
B7-Analysis-Result-Edit | 결과 편집
B7-Analysis-Share | 공유 설정

# 카드 발행/승인·검토 데스크 | 적용 | landxi/proto/admin-publish.html | D24 권장안(선택 3 분할 검토 데스크) 자동 채택 → 9/20 구현 | F3 B3: v3 관제 결재함 · 9/27 토스 톤 재조정
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
# 카드 발행/카드 목록 | 적용 | landxi/proto/ai-card.html | D24 자동 채택 → 9/20 구현 | F3 B4: v3 생산 콘솔 ③ 조립 · 카드 = 스펙시먼 B 문법(D21ⓒ)
B6-Publish-Cards | 카드 목록
B6-Publish-Cards-Empty | 카드 0건
# 카드 발행/카드 편집 | 적용 | landxi/proto/ai-card-edit.html | D24 자동 채택 → 9/20 구현 | F3 B4 생산 콘솔 ③ 조립
B6-Publish-Card-Edit | 카드 편집
B6-Publish-Card-Edit-Locked | 편집 잠김
# 카드 발행/발행 요청 | 적용 | landxi/proto/ai-publish-create.html | D24 자동 채택 → 9/20 구현 | F3 §5: 발행 요청 폼 폐지 예정 → 카탈로그 매트릭스
B6-Publish-Request | 발행 요청

# XI맵/기본 지도 | 폐기 | 새 XI맵 landxi/xi (F1·F2) — 9/27 레일 정본화(F2-R) | 구 XI맵(proto/ximap)에 들어갔던 판 — 레일이 새 XI맵으로 옮겨감 |
B5-Map | 기본 — V-World 실타일 + 레이어 카드 + 시점 스트립
B2-XiMap | XI맵 초안 — 분석 지도 | 폐기 | B5-Map | 원본 기능의 1/4 · 임계/스캔은 원본에 없음(NOTES §20) |
B7-Map-Basemap | 배경지도 선택
B7-Map-LayerTab | 레이어 탭 펼침
B7-Map-Empty | 레이어 0 | 검토 | v3 XI맵 정돈판(xi-clean) 빈 지역 상태 — '영상 반입 필요' 다음 행동 | 새 XI맵에 같은 상태 설계 없음 |
B7-Map-Loading | 로딩 | 검토 | v3 XI맵 정돈판 로딩 상태 — 캐릭터(D20②)와 함께 | 새 XI맵에 같은 상태 설계 없음 |
# XI맵/객체 정보 | 검토 | v3 XI맵 정돈판(xi-clean) HUD — 객체 정보 콜아웃 문법 재사용 여부 | 구 XI맵에만 들어감 · 새 XI맵 이관 미정 |
B5-Map-Info | 객체 정보 — 브래킷 콜아웃 + 탐지 정보
# XI맵/시점 비교 | 폐기 | 새 XI맵 시점 스와이프(landxi/xi) | 구 XI맵 판 — 새 XI맵이 같은 기능을 가짐 |
B5-Map-Compare | 겹쳐보기 — 두 시점 스와이프
B7-Map-Parallel | 나란히 보기
# XI맵/검색 | 폐기 | 새 XI맵 검색(landxi/xi) | 구 XI맵 판 — 새 XI맵이 같은 기능을 가짐 |
B7-Map-Search | 검색
B7-Map-Search-Empty | 검색 0건 | 검토 | v3 XI맵 정돈판 — 0건 안내 한 줄 | 새 XI맵에 0건 상태 설계 없음 |
# XI맵/도구(측정·그리기·구역·내려받기) | 검토 | v3 XI맵 정돈판 '도구 7' 재구현 때 이식 | 원본 기능 — 새 XI맵에 아직 없음 |
B7-Map-Measure | 측정
B7-Map-Draw | 그리기
B7-Map-AOI | 관심 구역
B7-Map-Download | 내려받기
# XI맵/지역 구분·속성 표 | 검토 | F3 B2 — v3 서비스 화면 시군구 집계·보고서 서랍 | 구 XI맵에만 들어감 · 새 XI맵 이관 미정 |
B7-Map-Region | 지역 구분(읍면동 5분위)
B7-Map-Table | 속성 표 펼침
# XI맵/보안 서약 | 검토 | v3 XI맵 정돈판 — 원본 기능 이식(내려받기 전 서약) | 원본 기능 — 새 XI맵에 없음 |
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

# 서비스 관리/사용자 관리 | 적용 | landxi/proto/admin-users.html | D25 권장안(선택 2) 자동 채택 → 9/20 구현 | F3 B3: v3 관제 5메뉴 · 9/27 토스 톤 재조정
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
# 서비스 관리/공지 관리 | 적용 | landxi/proto/admin-notice.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 관제 설정 하위 · 9/27 토스 톤
B6-Admin-Notice | 공지 목록
B6-Admin-Notice-Form | 공지 작성
B6-Admin-Notice-Form-Error | 작성 오류
B6-Admin-Notice-Delete | 삭제 확인
# 서비스 관리/문의 관리 | 적용 | landxi/proto/admin-inquiry.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 관제 설정 하위 · 9/27 토스 톤
B6-Admin-Inquiry | 문의 목록
B6-Admin-Inquiry-Reply | 답변
# 서비스 관리/FAQ 관리 | 적용 | landxi/proto/admin-faq.html | D25 자동 채택 → 9/20 구현 | F3 B3: v3 관제 설정 하위 · 9/27 토스 톤
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

# 공통/상태 패턴(로딩·오류) | 적용 | landxi/proto/ai-project.html | D29 원판 → 9/20 로딩·오류 패턴 구현 | 27화면 재구현: 빈 상태·로딩은 캐릭터(D20②)와 합침
B7-State-Loading | 로딩 패턴
B7-State-Error | 오류 패턴
`);

// ── 3. 구현 화면 판정표 (shots/overview/inventory.json 의 id) ───────────────────
// id | 화면 | 판정 | 대상 | 근거 | 다음 단계    — 적용이면 대상은 비워 두면 자기 경로
const IMPL = table(`
# 인증/로그인 | 적용 | | 현재 정문 — 역할 라디오·목 인증 | F3 B0: v3 정문 로그인(실인증)으로 교체
proto-login | 로그인(v1)
v3-login | 정문 로그인(v3 시안) | 검토 | 시안 승인 → 정문 교체(F3 B0) · 소개 판 3장면(토스 5-3)·로그인 3축(D21ⓑ) 반영 | F3 §7 ⑤ 제작 중 시안 |
# 인증/계정 신청 | 적용 | | 현재 화면 — 신청 저장 없음 | F3 B0: 정문 서랍으로 축소
proto-signup | 계정 신청(v1)
# 인증/아이디 찾기 | 적용 | | 현재 화면 — 조회 로직 없음 | F3 B0: 정문 서랍으로 축소
proto-find-id | 아이디 찾기(v1)
proto-find-id-result | 아이디 찾기 결과(v1)
# 인증/비밀번호 찾기 | 적용 | | 현재 화면 — 조회 로직 없음 | F3 B0: 정문 서랍으로 축소
proto-find-password | 비밀번호 찾기(v1)
proto-find-password-result | 비밀번호 찾기 결과(v1)
# 메인/스크럽 필름 | 적용 | | 메인 원판 = 구현본(14 leg + 브랜드 마감) | 메인 재구성: 토스 7챕터로 쪼개기(leg 1–2 · 11–12만 메인, leg 4–10 은 서비스 상세로)
scrub-main | 스크럽 필름(구현본)
# 메인/공개 사이트 | 적용 | | 게스트 공개 페이지 | 서비스 카드는 스펙시먼 B 문법(D21ⓒ)으로 교체
site-platform | 활용 서비스
site-usecase | 활용 사례
site-notice | 공지사항
# 메인/필름 제작 도구 | 적용 | | 필름 검토용 내부 도구 |
film-timeline | 필름 타임라인
film-anchors | 앵커 스틸
# 대시보드/직원 첫 화면 | 적용 | | 현재 LX 직원 착지 — 전국 한 판 | F3 §5: 대시보드 폐지 → v3 생산 콘솔 '오늘' 띠
proto-dashboard | 대시보드(v1)
v3-lx-console | 생산 콘솔 '오늘' 띠(v3 시안) | 검토 | 시안 승인 → 직원 첫 화면 교체(F3 B1·B4) · 카드 문법(D21ⓒ)·스텝퍼(스펙시먼 H) 반영 | F3 §7 ① 제작 중 시안 |
# 데이터 관리/목록(아카이브·완료·발행중) | 적용 | | 현재 화면 — 고정값 | F3 B4: v3 생산 콘솔 ① 반입 서랍
proto-dataset | 데이터 관리(v1)
# 프로젝트/목록(메인) | 적용 | | 현재 화면 — 8단계 탭 · 고정값 | F3 B4: v3 생산 콘솔 서랍(라벨·학습·모델 3)
proto-ai-project | 프로젝트(v1)
# 프로젝트/만들기 | 적용 | | 현재 화면 — 고정값 | F3 B4 생산 콘솔
proto-ai-project-create | 프로젝트 만들기(v1)
# 프로젝트/라벨링 | 적용 | | 현재 화면 — 고정값 | F3 B4 생산 콘솔 ② 학습
proto-ai-project-label | 라벨링(v1)
# 프로젝트/학습 | 폐기 | proto-ai-project | 레일에서 닿지 않음 · 8/25 '워크플로우가 너무 업무 시스템' 거부 |
proto-workflow | 국토 조사 보드(8/25 워크플로우)
# 분석 서비스/카드 목록 | 적용 | | 현재 화면 — 실행 검토·실행 중·결과 탭 포함 · 고정값 | F3 B4: 생산 콘솔 ③ 조립 · 카드 = 스펙시먼 B 문법
proto-analysis-ai | 분석 서비스(v1)
# 카드 발행/승인·검토 데스크 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 관제 결재함
proto-admin-publish | 카드 발행 관리(v1)
# 카드 발행/카드 목록 | 적용 | | 현재 화면 — 고정값 | F3 B4 생산 콘솔 ③ 조립
proto-ai-card | 카드 목록(v1)
# 카드 발행/카드 편집 | 적용 | | 현재 화면 — 고정값 | F3 B4 생산 콘솔 ③ 조립
proto-ai-card-edit | 카드 편집(v1)
# 카드 발행/발행 요청 | 적용 | | 현재 화면 — 고정값 | F3 §5: 발행 요청 폼 폐지 예정
proto-ai-publish-create | 발행 요청(v1)
# XI맵/기본 지도 | 적용 | | 새 XI맵 정본 — 서버 연결 | v3 XI맵 정돈판: 글 60% 삭감·개발 정보 제거(9/27)
xi-read-staff | XI맵 · LX 직원(v2)
xi-public | XI맵 · 공개(v2)
xi-sales | XI맵 · 영업(v2)
proto-ximap | 구 XI맵(v1) | 폐기 | xi-read-staff | 9/27 레일 정본화(F2-R) — 지도 서비스 = 새 XI맵 |
v3-xi-clean | XI맵 정돈판(v3 시안) | 검토 | 시안 승인 → 새 XI맵 교체 · 도구 7·보안 서약 이식 | F3 §7 ③ 제작 중 시안 |
# XI맵/표류 예측 | 폐기 | F3 §5 폐지 목록(레일 밖) | 레일에서 닿지 않는 단독 실험 화면 |
proto-map-drift | 괭생이모자반 도착 예측(v1)
# 실태조사/실태조사 모드 | 적용 | | 새 XI맵 실태조사 — 서버 연결 | 9/27 '남원 한정 금지' — 지역 = 변수로, v3 대장 융합과 합침
xi-survey-staff | 실태조사 · LX 직원(v2)
xi-survey-namwon | 실태조사 · 기관(v2)
# 실태조사/대장 융합(기관 첫 화면) | 검토 | 시안 승인 → 기관 첫 화면(F3 B2) | F3 §7 ② 제작 중 시안 — 업로드 대장 × AI 융합 |
v3-gov-fusion | 대장 융합(v3 시안)
# 에이전트/융합 분석 질문 | 적용 | | 새 XI맵 에이전트 — vLLM 연결 | 9/27 재정의: 업로드 행정데이터 × AI 융합 → v3 gov-fusion ⌘K
xi-agent | 에이전트(v2)
# 통계/보고서/통계 | 적용 | | 현재 화면 — 고정값 | F3 B2: v3 서비스 보고서 서랍
proto-stats-standard | 통계(v1)
# 통계/보고서/보고서 | 적용 | | 현재 화면 — 고정값 | F3 B2: v3 서비스 보고서 서랍
proto-report-standard | 보고서(v1)
proto-report-standard-issue | 오류 신고(v1)
# 관제/관제 로그인 | 적용 | | 관제 실인증(:8702) | 9/27 검정 톤(잉크 반전) 폐기 → 토스 톤 · F3 B0 정문 하나로
ops-login | 관제 로그인(v2)
# 관제/운영 현황 | 적용 | | 관제 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → v3 관제 핵심판 토스 톤
ops-index | 운영 현황(v2)
proto-admin-home | 관리자 운영 현황(v1) | 적용 | | 현재 관리자 착지(v1) — 고정값 | F3 B1: 흡수 · 관제로 일원화
v3-ops-core | 관제 핵심판(v3 시안) | 검토 | 시안 승인 → 관제 교체(F3 B3) · 토스 톤(9/27) | F3 §7 ④ 제작 중 시안 |
# 관제/인프라 | 적용 | | 관제 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → 토스 톤 · 성능 수치는 관제 한 곳에만
ops-infra | 인프라 관제(v2)
# 관제/기관·할당 | 적용 | | 관제 정본(:8702) — 서버 연결 | 9/27 검정 톤 폐기 → 토스 톤 · 링 8 → 3
ops-tenants | 기관·할당(v2)
# 관제/배포 | 적용 | | 관제 정본(:8702) — 부분 구현 | 9/27 검정 톤 폐기 → 토스 톤
ops-deploys | 배포 제어(v2)
# 관제/생산 관리 | 적용 | | 현재 화면 — 고정값 | F3 B4: v3 생산 콘솔로 흡수
proto-produce | 생산 관리(v1)
# 서비스 관리/사용자 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 관제 5메뉴 · 9/27 토스 톤
proto-admin-users | 사용자 관리(v1)
# 서비스 관리/공지 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 관제 설정 하위
proto-admin-notice | 공지 관리(v1)
# 서비스 관리/문의 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 관제 설정 하위
proto-admin-inquiry | 문의 관리(v1)
# 서비스 관리/FAQ 관리 | 적용 | | 현재 화면 — 고정값 | F3 B3: v3 관제 설정 하위
proto-admin-faq | FAQ 관리(v1)
# 서비스 관리/지도 속성 관리 | 적용 | | 현재 화면 — 고정값 | F3 B1: XI맵으로 흡수
proto-admin-map | 지도 속성 관리(v1)
# 기관 포털/기관 로그인 | 적용 | | 현재 기관 정문 — 목 인증 | F3 B0: 정문 하나로 통합
proto-portal-login-namwon | 기관 로그인 · 남원(v1)
proto-portal-login-gwangju-jeonnam | 기관 로그인 · 광주전남(v1)
# 기관 포털/내 서비스 | 적용 | | 현재 기관 착지 — 고정값 | F3 B2: v3 서비스 화면 1 + 서랍 · 카드 덱 5장 폐지 예정
proto-portal | 내 서비스(v1)
# 기관 포털/서비스 상세 | 적용 | | 현재 기관 서비스 화면 — 고정값 | F3 B2: v3 서비스 화면으로 흡수
proto-portal-dp-nw-change | 국토 변화 탐지(v1)
proto-portal-dp-nw-farm-25 | 영농관리(v1)
proto-portal-dp-nw-living-23 | 생활환경 위험요소(v1)
proto-portal-dp-gj-marine-25 | 해양쓰레기 실태조사 25(v1)
proto-portal-dp-gj-marine-27 | 해양쓰레기 실태조사 27(v1)
proto-portal-dp-nw-crowd-27 | 인파관리(빈 자리) | 검토 | F3 B2 흡수 때 정리 — 그 전까지 '준비 중' 캐릭터(D20②) | 빈 자리 — 서비스 미완 |
proto-portal-dp-nw-road-26 | 도로 안전관리(빈 자리) | 검토 | F3 B2 흡수 때 정리 — 그 전까지 '준비 중' 캐릭터(D20②) | 빈 자리 — 서비스 미완 |
# 서비스 지원/공지 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-notice | 공지사항(v1)
# 서비스 지원/FAQ | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍 · 아코디언(스펙시먼 I)
proto-faq | 자주 묻는 질문(v1)
# 서비스 지원/문의 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-contact | 문의하기(v1)
# 서비스 지원/활용사례 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-usecase | 활용사례(v1)
# 서비스 지원/매뉴얼 | 적용 | | 현재 화면 — 고정값 | F3 B5: '?' 서랍
proto-manual | 매뉴얼(v1)
# MY/마이 페이지 | 적용 | | 현재 화면 — 고정값 | F3 B5: MY 서랍
proto-mypage | 마이 페이지(v1)
# 글로벌/로그인 | 적용 | | 해외 기관 실인증 |
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

// ── 4. 스펙시먼 · 제안 판정표 (카카오 벤치 §6 · 토스 벤치 §5) ───────────────────
const KAKAO = 'landxi/proto/review/bench-kakao.html';
const TOSS = 'docs/superpowers/research/2026-09-27-bench-toss.md';
const SPECS = [
  // 카카오 §6 스펙시먼 A–J (2026-09-03)
  ['K-A', '대시보드/직원 첫 화면', '대시보드 상단 — 서체·색·형태 토글 기준판', '스펙시먼 카카오 A', '폐기', '대상 화면(LX 관리자 대시보드)이 9/21 계정 분리·9/24 직원 화면 전환으로 사라짐', '토글 판정은 D19③ 로 결론 — 판 자체는 역할 끝', '', 'kakao-A', '#spec'],
  ['K-B', '분석 서비스/카드 목록', '서비스 카드 — 크롭 + 기준일 + 상태 + 제목 2줄 + 결과 수', '스펙시먼 카카오 B', '검토', '적용 예정(D21ⓒ): 분석 카드 목록·프로젝트 목록·데이터 목록·공개 사이트 서비스 카드 — 27화면 재구현 + v3 생산 콘솔 카탈로그', '9/27 D21ⓒ 적용 결정 — 아직 어느 화면에도 없음', '', 'kakao-B', '#spec2'],
  ['K-C', '인증/로그인', '로그인 소개 — 3축(영문 대제목 + 한글 한 줄 + 크롭)', '스펙시먼 카카오 C', '검토', '적용 예정(D21ⓑ): v3 정문 로그인(landxi/v3/login) 소개 판 — 토스 5-3 장면 순환과 합침', '9/27 D21ⓑ 적용 결정 — 아직 어느 화면에도 없음', '', 'kakao-C', '#specC'],
  ['K-D', '메인/서비스 소개 판', '서비스 소개 판 — 실영상 판', '스펙시먼 카카오 D', '검토', '메인 재구성: 토스 챕터(5-2)의 비주얼 판 · 서비스 상세 히어로', '9/27 지시 — D·F·H 는 토스식 소개 문법과 합쳐 메인·서비스 상세·생산 콘솔로', '', 'kakao-D', '#specD'],
  ['K-E', '메인/성과·결과 띠', '성과 숫자 띠 + 결과 카드', '스펙시먼 카카오 E', '검토', '적용 예정(D21ⓓ): 메인 재구성 챕터 2·분석 실행 결과 — 숫자는 업무 결과만(현장 확인 필요 n필지 등)', '9/27 D21ⓓ 적용 결정 · 같은 날 내부 지표 과장 금지 조건', '', 'kakao-E', '#specE'],
  ['K-F', '분석 서비스/카드 상세', '분석 서비스 소개 아이템(EVIDENCE-PAIR)', '스펙시먼 카카오 F', '검토', '서비스 카탈로그 상세 — 토스 5-4 기능 소개 틀과 합침(27화면 재구현)', '9/27 지시 — 토스식 소개 문법과 합침', '', 'kakao-F', '#specF'],
  ['K-G', '공통/빈 상태·캐릭터', '빈 상태 · 진행 중 · 결손 — 필름 캐릭터 3종', '스펙시먼 카카오 G', '검토', '적용 예정(D20②): 27화면 재구현의 빈 상태·로딩·준비 중·404 · 기관 포털 빈 서비스(인파·도로)', '9/27 D20② 적용 결정 — 크레딧 0, 신규 제작 0', '', 'kakao-G', '#specG'],
  ['K-H', '데이터 관리/파이프라인 단계', '파이프라인 스텝퍼(데이터 관리 4단계)', '스펙시먼 카카오 H', '검토', 'v3 생산 콘솔 6단 레일(반입 → 학습 → 조립 → 검수 → 배포 → 운영)', '9/27 지시 — 생산 콘솔로', '', 'kakao-H', '#specH'],
  ['K-I', '서비스 지원/FAQ', '서비스 지원 아코디언 3줄', '스펙시먼 카카오 I', '검토', 'F3 B5 — 지원 \'?\' 서랍의 FAQ 문법', '결정 없음 — 지원 서랍 재구현 때 판단', '', 'kakao-I', '#specI'],
  ['K-J', '공통/출처 띠·푸터', '데이터 출처 로고 띠 + 푸터', '스펙시먼 카카오 J', '검토', '적용 예정(D21ⓔ): 메인 마감·로그인 하단 출처 로고 띠(푸터 워터마크 ⓕ 는 제외)', '9/27 D21ⓔ 적용 결정', '', 'kakao-J', '#specJ'],
  ['K-D19-3', '공통/서체·색·형태', 'D19 ③ 서체 유지 · 제목 자간 −0.03em', '결정 카카오 D19', '검토', '적용 예정: v3 공통 토큰(제목 letter-spacing −0.03em) → 27화면 재구현', '9/27 D19③ 적용 결정 — 토큰 미반영', '', '', '#spec'],
  ['K-F1', '공통/서체·색·형태', 'F1 본문만 Kakao Big Sans', '토글 카카오 F1', '폐기', 'D19 ③(서체 유지) — 9/27 결정', '9/27 D19③ 채택으로 탈락', '', 'kakao-F1', '#spec'],
  ['K-F2', '공통/서체·색·형태', 'F2 전부 Kakao Big Sans', '토글 카카오 F2', '폐기', 'D19 ③(서체 유지) — 9/27 결정', '9/27 D19③ 채택으로 탈락', '', 'kakao-F2', '#spec'],
  ['K-F3', '공통/서체·색·형태', 'F3 내로우 제목(Black Han Sans)', '토글 카카오 F3', '폐기', 'D19 ③(서체 유지) — 9/27 결정', '9/27 D19③ 채택으로 탈락', '', 'kakao-F3', '#spec'],
  ['K-C1', '공통/서체·색·형태', 'C1 카카오식 딥블루 #19199B', '토글 카카오 C1', '폐기', 'T3 액센트 #006DF7 유지', 'CI 블루와 어긋남 — 벤치 §7 \'가져오지 말 것\'', '', 'kakao-C1', '#spec'],
  ['K-S1', '공통/서체·색·형태', 'S1 라운드 12 · 필 · 채운 파란 버튼', '토글 카카오 S1', '폐기', '라운드 0 · 잉크 버튼 유지(법전)', '법전 §2 충돌 · 토스 벤치도 라운드 0 유지(5-6)', '', 'kakao-S1', '#spec'],
  ['K-D21a', '공통/서체·색·형태', 'D21 ⓐ 섹션 영문 도장 4종', '결정 카카오 D21', '폐기', 'D21 ⓑⓒⓓⓔ 만 채택(9/27)', '9/27 선택에서 제외 · 글 다이어트(글자 최소)', '', '', '#spec'],
  ['K-D21f', '공통/출처 띠·푸터', 'D21 ⓕ 푸터 LX 워터마크', '결정 카카오 D21', '폐기', '푸터 1줄(F3 §5)', '9/27 선택에서 제외 · 서비스 푸터는 1줄로', '', '', '#specJ'],
  ['K-D20-3', '공통/빈 상태·캐릭터', 'D20 ③ 신규 3D 마스코트 제작', '결정 카카오 D20', '폐기', 'D20 ② 필름 캐릭터 3종 승격', '별도 예산·LX 승인 필요 · 벤치 §7 \'가져오지 말 것\'', '', '', '#specG'],
  // 토스 §5 적용안 (2026-09-27)
  ['T-5-1', '공통/토스 톤', '원칙 번역 — 스크럽 = 실시간 지도 카메라, 실제 UI 그대로, 업무 결과 숫자만', '제안 토스 5-1', '검토', 'v3 시안 5화면 공통 원칙 → 27화면 재구현', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-TONE', '공통/토스 톤', '관리자·직원·영업 밝은 토스 톤(#F2F4F6 · 잉크 #1C1F25 · 보조 #727780)', '결정 토스 톤', '검토', '적용 예정: v3 관제 핵심판·생산 콘솔·로그인 → 27화면 재구현', '9/27 사용자 지시 — 9/24 Q3 잉크 반전을 뒤집음', '', '', ''],
  ['T-CH0', '메인/소개 챕터(토스)', '챕터 0 히어로 — 국토를 / 한 번에 읽는다', '제안 토스 5-2', '검토', '메인 재구성(7챕터)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH1', '메인/소개 챕터(토스)', '챕터 1 XI맵 전역 추론 — 전국이 / 한 화면에 차오른다', '제안 토스 5-2', '검토', '메인 재구성(7챕터)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH2', '메인/소개 챕터(토스)', '챕터 2 실태조사 대조 — 대장과 다른 땅을 / 찾아낸다', '제안 토스 5-2', '검토', '메인 재구성(7챕터) · 성과 띠(스펙시먼 E)와 합침', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH3', '메인/소개 챕터(토스)', '챕터 3 융합 분석 에이전트 — 올린 행정 자료에 / 묻는다', '제안 토스 5-2', '검토', '메인 재구성(7챕터)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH4', '메인/소개 챕터(토스)', '챕터 4 서비스 카드 생산 — 한 번 만든 분석이 / 서비스가 된다', '제안 토스 5-2', '검토', '메인 재구성(7챕터) · 카드 문법(스펙시먼 B)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH5', '메인/소개 챕터(토스)', '챕터 5 지자체 제공 — 어느 시군구든 / 그대로 배포한다', '제안 토스 5-2', '검토', '메인 재구성(7챕터)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH6', '메인/소개 챕터(토스)', '챕터 6 글로벌 — 국경 밖에서도 / 같은 지도', '제안 토스 5-2', '검토', '메인 재구성(7챕터)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-CH7', '메인/소개 챕터(토스)', '챕터 7 마감 — Hyper Performance · Hyper Solution · Hyper GeoAI', '제안 토스 5-2', '검토', '메인 재구성(7챕터) · 출처 띠(스펙시먼 J)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-5-3', '인증/로그인', '로그인 소개 판 3장면 자동 순환', '제안 토스 5-3', '검토', 'v3 정문 로그인(landxi/v3/login) — 로그인 3축(스펙시먼 C)과 합침', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-5-4', '공통/기능 소개 틀', '기능별 소개 섹션 틀 — 히어로 → 교차 블록 → 관련 카드 → 마감', '제안 토스 5-4', '검토', '서비스 카탈로그 상세·각 화면 첫 진입 — 27화면 재구현(스펙시먼 D·F 합침)', '9/27 토스 벤치 적용안 — 판정 전', '', '', ''],
  ['T-5-5', '메인/스크럽 필름', '필름 쪼개기 — leg 1–2 여는 카메라 · leg 11–12 마감 · leg 4–10 은 서비스 상세로', '제안 토스 5-5', '검토', '메인 재구성 — 지역 이름·\'시연\' 라벨이 앞에 나오는 leg 는 메인에서 뺌', '9/27 토스 벤치 적용안 · 남원 한정·\'시연\' 프레이밍 금지와 맞춤', '', '', ''],
  ['T-5-6', '공통/토스 톤', '가져오지 않을 것 — 오버슈트 이징·둥근 카드·실사 인물·56화면·채움 버튼·지도 위 관성 스크롤', '제안 토스 5-6', '폐기', '법전(라운드 0 · 액센트 절제) 유지', '법전·지도 제스처와 충돌 — 토스 벤치 스스로 제외', '', '', ''],
].map(([id, screen, name, variant, verdict, target, reason, later, img, anchor]) => ({ id, screen, name, variant, verdict, target, reason, later, img, anchor }));

// ── 5. 조립 ─────────────────────────────────────────────────────────────────
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 << 20 });
const addDates = {}; // repo path → 처음 들어온 날
{ let d = null; for (const line of sh('git log --diff-filter=A --reverse --format=@%ad --date=short --name-only -- design-canvas/v2 landxi').split('\n')) { if (line.startsWith('@')) d = line.slice(1); else if (line.trim() && !addDates[line.trim()]) addDates[line.trim()] = d; } }
const canvas = JSON.parse(fs.readFileSync(V + 'canvas.json', 'utf8'));
const inv = JSON.parse(fs.readFileSync('shots/overview/inventory.json', 'utf8'));
const byInv = Object.fromEntries(inv.screens.map((s) => [s.id, s]));
const dieIf = (c, m) => { if (c) { console.error('✗ ' + m); process.exit(1); } };

const stage = (id) => (/^H-/.test(id) ? '원판 H(집 PC 초안)' : `원판 ${id.split('-')[0]}`);
const assets = [];
for (const m of MASTERS) {
  const file = `${V}${m.id}.dc.html`, render = `${V}renders/${m.id}.png`;
  dieIf(!fs.existsSync(render), `렌더 없음: ${m.id}`);
  assets.push({ id: m.id, kind: '원판', name: m.name, screen: m.screen, variant: stage(m.id), verdict: m.verdict, target: m.target, reason: m.reason, later: m.later,
    made: addDates[file] || addDates[render] || '', files: { 원판: fs.existsSync(file) ? file : null, 렌더: render }, title: canvas.artboards.find((a) => a.file === m.id + '.dc.html')?.title || '' });
}
for (const m of IMPL) {
  const s = byInv[m.id]; dieIf(!s, `인벤토리에 없음: ${m.id}`);
  const p = String(s['경로']).replace(/^:8702\//, '').split('?')[0];
  const gen = s['세대'] === 'v3 시안' ? '시안 v3' : s['세대'] === '구 proto v1' ? '구현 v1' : '구현 v2';
  const thumb = s['썸네일'] ? `${OUT_DIR}/status/${s['썸네일']}` : null;
  assets.push({ id: m.id, kind: gen === '시안 v3' ? '시안' : '구현', name: m.name, screen: m.screen, variant: gen, verdict: m.verdict, target: m.verdict === '적용' ? (m.target || String(s['경로']).replace(/^:8702\//, '')) : m.target,
    reason: m.reason, later: m.later, made: addDates[p] || '', files: { 구현: s['경로'], 썸네일: thumb && fs.existsSync(thumb) ? thumb : null }, title: s['제목'] || '', impl_state: s['상태'] });
}
for (const m of SPECS) {
  const img = m.img ? `${OUT_DIR}/assets-thumbs/${m.img}.jpg` : null;
  const isK = m.id.startsWith('K-');
  assets.push({ id: m.id, kind: '스펙시먼', name: m.name, screen: m.screen, variant: m.variant, verdict: m.verdict, target: m.target, reason: m.reason, later: m.later,
    made: isK ? '2026-09-03' : '2026-09-27', files: { 원천: isK ? KAKAO + (m.anchor || '') : TOSS, 캡처: img && fs.existsSync(img) ? img : null } });
}
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

// 검사 — 화면 키 · 판정 · 중복 · 원판 누락
const ids = new Set();
for (const a of assets) {
  dieIf(!SCREEN_KEYS.has(a.screen), `화면 키 없음: ${a.id} → ${a.screen}`);
  dieIf(!VERDICTS.includes(a.verdict), `판정 오류: ${a.id} ${a.verdict}`);
  dieIf(ids.has(a.id), `중복: ${a.id}`); ids.add(a.id);
  dieIf(!a.target, `대상 비어 있음: ${a.id}`);
}
const orphan = fs.readdirSync(V + 'renders').map((f) => f.replace('.png', '')).filter((id) => !ids.has(id));
dieIf(orphan.length, `대장에 없는 원판: ${orphan.join(', ')}`);
const orphanInv = inv.screens.filter((s) => !ids.has(s.id)).map((s) => s.id);
dieIf(orphanInv.length, `대장에 없는 구현: ${orphanInv.join(', ')}`);

// 대상이 다른 자산 id 면 연결
for (const a of assets) if (a.verdict === '폐기' && ids.has(a.target)) a.replaced_by_id = a.target;
const FN_ORDER = TAX.map(([f]) => f);
const out = assets.map((a) => {
  const [fn, sc] = a.screen.split('/').length > 2 ? [a.screen.split('/').slice(0, 2).join('/'), a.screen.split('/').slice(2).join('/')] : a.screen.split('/');
  const o = { id: a.id, kind: a.kind, function: fn, screen: sc, variant: a.variant, name: a.name, made: a.made, files: a.files, verdict: a.verdict, reason: a.reason };
  if (a.verdict === '적용') o.applied_to = a.target.split(',').map((s) => s.trim());
  if (a.verdict === '폐기') o.replaced_by = a.replaced_by_id ? `${a.target} (${assets.find((x) => x.id === a.target).name})` : a.target;
  if (a.verdict === '검토') o.next = a.target;
  if (a.later) o.later = a.later;
  if (a.title) o.title = a.title;
  if (a.impl_state) o.impl_state = a.impl_state;
  if (a.user_decision) { o.user_decision = a.user_decision; o.table_verdict = a.table_verdict; o.reason_before = a.reason_before; }
  return o;
});
// 기능·화면 키가 '통계/보고서' 처럼 슬래시를 품으므로 다시 정확히 나눈다
for (const o of out) { const a = assets.find((x) => x.id === o.id); const f = FN_ORDER.find((fn) => a.screen.startsWith(fn + '/')); o.function = f; o.screen = a.screen.slice(f.length + 1); }
const count = (k) => Object.fromEntries(VERDICTS.map((v) => [v, out.filter((a) => a.verdict === v && (!k || a.kind === k)).length]));
const ledger = {
  title: 'Land-XI 자산 대장 — 원판 · 구현 · 스펙시먼',
  generated_at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' KST',
  생성기: 'node tools/review/masters.mjs',
  판정_기준: { 적용: '지금 사용자가 레일로 닿는 화면에 들어가 있음(적용 위치 = applied_to)', 검토: '아직 화면에 없음 — 다음 차수에서 쓸 곳(next)', 폐기: '다른 안·결정이 대체함(replaced_by)' },
  계층: '기능(function) → 화면(screen) → 버전·변형(variant)',
  사용자_결정: '갤러리(masters.html) 카드의 적용·검토·폐기 → [결정 발행] 글 → node tools/review/apply-decisions.mjs <글 파일> 로 반영. user_decision 이 있으면 판정표보다 우선(table_verdict = 표의 원래 판정, reason_before = 원래 근거)',
  집계: { 전체: out.length, ...count(), 원판: count('원판'), 구현: count('구현'), 시안: count('시안'), 스펙시먼: count('스펙시먼') },
  기능: TAX.map(([f, ss]) => ({ function: f, screens: ss.filter((s) => out.some((a) => a.function === f && a.screen === s)) })).filter((x) => x.screens.length),
  assets: out,
};
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');

// 구현 현황판용 화면 매핑 — inventory id → 기능/화면 (+ 대장 판정)
const smap = { 설명: '구현 현황판(status/)이 자산 대장과 같은 화면 키로 묶기 위한 매핑 — node tools/review/masters.mjs 가 생성', 기능_순서: ledger.기능, screens: {} };
for (const o of out.filter((a) => a.kind === '구현' || a.kind === '시안')) smap.screens[o.id] = { function: o.function, screen: o.screen, variant: o.variant, verdict: o.verdict };
fs.writeFileSync(`${OUT_DIR}/screen-map.json`, JSON.stringify(smap, null, 1) + '\n');

// ── 6. 갤러리 HTML ──────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (repoPath) => { const [p, q] = String(repoPath).split(/(?=[?#])/); return path.posix.relative(OUT_DIR, p) + (q || ''); };
const isRepoPath = (s) => /^(landxi|design-canvas|docs)\//.test(s);
const KIND_ORDER = { 원판: 0, 구현: 1, 시안: 2, 스펙시먼: 3 };
const VCLS = { 적용: 'ok', 검토: 'rv', 폐기: 'dp' };
const img = (a) => a.files.렌더 || a.files.썸네일 || a.files.캡처 || null;
const openHref = (a) => a.files.원천 ? rel(a.files.원천) : a.files.구현 ? rel(a.files.구현.replace(/^:8702\//, '')) : null;

function targetLine(a) {
  if (a.verdict === '적용') return `<span class="k">적용</span> ${a.applied_to.map((p) => isRepoPath(p) ? `<a href="${esc(rel(p))}">${esc(p.replace(/^landxi\//, ''))}</a>` : esc(p)).join(' · ')}`;
  if (a.verdict === '폐기') return `<span class="k">대체</span> ${ids.has(a.replaced_by.split(' ')[0]) ? `<a href="#${esc(a.replaced_by.split(' ')[0])}" class="jump">${esc(a.replaced_by)}</a>` : esc(a.replaced_by)}`;
  return `<span class="k">다음</span> ${esc(a.next)}`;
}
function card(a) {
  const src = img(a);
  const thumb = src ? `<button type="button" class="th lb" data-src="${esc(rel(src))}" aria-label="${esc(a.name)} 크게 보기"><img loading="lazy" src="${esc(rel(src))}" alt=""></button>`
    : `<div class="th tx"><span>${esc(a.name)}</span></div>`;
  const open = openHref(a);
  return `<article class="card v-${VCLS[a.verdict]}" id="${esc(a.id)}" data-v="${a.verdict}" data-base="${a.verdict}" data-k="${a.kind}" data-later="${esc(a.later || '')}">${thumb}
<div class="bd"><div class="hd"><span class="bdg ${VCLS[a.verdict]}">${a.verdict}</span><span class="var">${esc(a.variant)}</span><span class="chgm">바뀜 · 미발행</span></div>
<h4>${esc(a.name)}</h4><p class="why">${esc(a.reason)}</p><p class="tg">${targetLine(a)}</p>
<p class="meta"><span>${esc(a.id)}</span>${a.made ? `<span>${esc(a.made.slice(5).replace('-', '.'))}</span>` : ''}${a.user_decision ? `<span class="ud" title="판정표 원래 판정: ${esc(a.table_verdict)}">사용자 결정 ${esc(a.user_decision.date.slice(5).replace('-', '.'))}</span>` : ''}${open ? `<a href="${esc(open)}">열기</a>` : ''}</p>
<div class="ctl" role="group" aria-label="${esc(a.id)} 판정 바꾸기">${VERDICTS.map((v) => `<button type="button" class="${VCLS[v]}" data-set="${v}" aria-pressed="${v === a.verdict}">${v}</button>`).join('')}</div></div></article>`;
}
const stepCls = (a) => `st ${VCLS[a.verdict]}`;
let body = '';
for (const { function: fn, screens } of ledger.기능) {
  const inFn = out.filter((a) => a.function === fn);
  const c = count(); for (const v of VERDICTS) c[v] = inFn.filter((a) => a.verdict === v).length;
  body += `<section class="fn" data-fn="${esc(fn)}"><h2 id="fn-${esc(fn)}">${esc(fn)}<small>${VERDICTS.map((v) => `<i class="${VCLS[v]}" data-c="${v}">${v} ${c[v]}</i>`).join('')}</small></h2>`;
  for (const sc of screens) {
    const items = inFn.filter((a) => a.screen === sc).sort((p, q) => KIND_ORDER[p.kind] - KIND_ORDER[q.kind] || String(p.made).localeCompare(String(q.made)));
    const live = items.filter((a) => a.verdict !== '폐기'), dead = items.filter((a) => a.verdict === '폐기');
    // 한 줄 진행: 원판 → 구현 v1 → 구현 v2 → 시안 v3 → 스펙시먼, 단계마다 판정 색
    const stages = []; for (const k of ['원판', '구현 v1', '구현 v2', '시안 v3', '스펙시먼']) {
      const g = items.filter((a) => (k === '원판' ? a.kind === '원판' : k === '스펙시먼' ? a.kind === '스펙시먼' : a.variant === k)); if (!g.length) continue;
      const best = g.find((a) => a.verdict === '적용') || g.find((a) => a.verdict === '검토') || g[0];
      stages.push(`<span class="${stepCls(best)}" title="${esc(k)} — ${g.map((a) => a.verdict).join(', ')}">${k}<b>${g.length}</b></span>`);
    }
    body += `<div class="sc" data-sc="${esc(sc)}"><div class="sch"><h3>${esc(sc)}</h3><div class="flow">${stages.join('<span class="ar">→</span>')}</div></div>`;
    if (live.length) body += `<div class="grid">${live.map(card).join('')}</div>`;
    if (dead.length) body += `<details class="dead"><summary>폐기 <span class="dn">${dead.length}</span></summary><div class="grid">${dead.map(card).join('')}</div></details>`;
    body += `</div>`;
  }
  body += `</section>`;
}
const S = ledger.집계;
const jump = ledger.기능.map(({ function: f }) => `<a href="#fn-${esc(f)}">${esc(f)}</a>`).join('');
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Land-XI 자산 대장</title>
<link rel="stylesheet" href="../fonts-system.css">
<style>
:root{--ink:#010102;--ink2:#4A4A4A;--mute:#8A8A8A;--line:#DDDDDD;--tint:#E8F1FF;--accent:#006DF7;--ok:#0FA9A0;--rv:#006DF7;--dp:#8A8A8A}
*{box-sizing:border-box}html{scroll-padding-top:120px}
body{margin:0;background:#fff;color:var(--ink);font:15px/1.55 Pretendard,system-ui,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.w{max-width:1400px;margin:0 auto;padding:28px 32px 80px}
.eb{font:600 12px/1 Inter,Pretendard,sans-serif;letter-spacing:.08em;color:var(--mute)}
h1{font:700 32px/1.2 Paperlogy,Pretendard,sans-serif;letter-spacing:-.03em;margin:8px 0 6px}
.links{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:14px;margin:0 0 18px}
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
.sc{padding:18px 0;border-top:1px solid var(--line)}
.sch{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin-bottom:12px}
h3{font:700 17px/1.3 Pretendard,sans-serif;margin:0}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:12px}
.st{border:1px solid;padding:3px 7px;white-space:nowrap;font-weight:600}.st b{font:600 11px Inter,sans-serif;margin-left:5px;opacity:.7}
.st.ok{color:var(--ok)}.st.rv{color:var(--rv)}.st.dp{color:var(--dp);border-style:dashed}
.ar{color:var(--mute)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px}
.card{border:1px solid var(--line);display:flex;flex-direction:column;min-width:0;background:#fff}
.card.v-ok{border-top:3px solid var(--ok)}.card.v-rv{border-top:3px solid var(--rv)}.card.v-dp{border-top:3px solid var(--dp)}
.card:target{outline:2px solid var(--accent);outline-offset:2px}
.th{display:block;width:100%;aspect-ratio:16/10;padding:0;border:0;border-bottom:1px solid var(--line);background:#F4F5F7;cursor:zoom-in;overflow:hidden}
.th img{width:100%;height:100%;object-fit:cover;object-position:top left;display:block}
.th.tx{cursor:default;display:flex;align-items:flex-end;padding:14px;background:var(--tint)}
.th.tx span{font:700 16px/1.35 Paperlogy,Pretendard,sans-serif;letter-spacing:-.02em;color:var(--ink)}
.v-dp .th.tx{background:#F4F5F7}.v-dp .th.tx span{color:var(--mute)}
.bd{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;min-width:0}
.hd{display:flex;align-items:center;gap:8px;min-width:0}
.bdg{font:700 11px/1 Pretendard,sans-serif;padding:4px 6px;border:1px solid;white-space:nowrap;flex:none}
.bdg.ok{color:var(--ok)}.bdg.rv{color:var(--rv)}.bdg.dp{color:var(--dp)}
.var{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h4{font-size:15px;line-height:1.4;margin:2px 0 0;overflow-wrap:anywhere}
.why{margin:0;font-size:13px;color:var(--ink2);overflow-wrap:anywhere}
.tg{margin:0;font-size:13px;overflow-wrap:anywhere}.tg .k{font-weight:700;color:var(--ink);margin-right:4px}
.meta{margin:2px 0 0;display:flex;flex-wrap:wrap;gap:4px 10px;font:12px Inter,Pretendard,sans-serif;color:var(--mute)}
details.dead{margin-top:14px}
details.dead summary{cursor:pointer;font-size:13px;color:var(--mute);width:max-content;padding:4px 0}
details.dead .card{opacity:.55}details.dead .card:hover,details.dead .card:target{opacity:1}
body.f-v .card:not(.show),body.f-v .sc:not(.show),body.f-v section.fn:not(.show){display:none}
body.f-v details.dead{margin-top:0}
.empty{color:var(--mute);padding:30px 0}
#lb{position:fixed;inset:0;background:rgba(1,1,2,.92);z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 16px 16px;gap:10px}
#lb[hidden]{display:none}#lb img{max-width:100%;max-height:calc(100% - 60px);background:#fff}
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
@media (max-width:640px){#bar{position:static}#dec{padding:12px}.w{padding:20px 16px 64px}h1{font-size:26px}#lb-p,#lb-n{display:none}}
</style></head>
<body><div class="w">
<div class="eb">LAND-XI · 자산 대장 · ${esc(ledger.generated_at)}</div>
<h1>원판 · 구현 · 스펙시먼 ${S.전체}건</h1>
<div class="links"><a href="index.html">검토 허브</a><a href="status/index.html">구현 현황판</a><a href="assets.json">assets.json</a><a href="bench-kakao.html">카카오 벤치</a></div>
<section id="dec" aria-labelledby="dec-h"><div class="dec-t"><b id="dec-h">내 결정<span id="dec-n">0</span></b><p>카드의 <b>적용 · 검토 · 폐기</b>로 판정을 바꾸면 여기 모입니다. <b>결정 발행</b>으로 복사해 Claude 에게 붙여 넣으면 대장에 반영합니다.</p></div>
<ol id="dec-list"></ol><p id="dec-empty">변경 없음</p>
<div class="dec-act"><button type="button" id="dec-pub" class="pri" disabled>결정 발행</button><button type="button" id="dec-reset" disabled>되돌리기</button><span id="dec-msg" role="status" aria-live="polite"></span></div>
<textarea id="dec-out" readonly hidden aria-label="발행 글"></textarea></section>
<div id="bar"><a href="#dec" class="dj" id="dec-jump" hidden>내 결정<b>0</b></a><div class="tot" role="group" aria-label="판정">
<button type="button" class="fb" data-v="" aria-pressed="true">전체<b>${S.전체}</b></button>
${VERDICTS.map((v) => `<button type="button" class="fb ${VCLS[v]}" data-v="${v}" aria-pressed="false">${v}<b>${S[v]}</b></button>`).join('')}</div>
<div class="tot" role="group" aria-label="종류">${['원판', '구현', '시안', '스펙시먼'].map((k) => `<button type="button" class="fb" data-k="${k}" aria-pressed="false">${k}<b>${out.filter((a) => a.kind === k).length}</b></button>`).join('')}</div>
<nav class="jumps" aria-label="기능">${jump}</nav></div>
${body}<p class="empty" id="empty" hidden>조건에 맞는 자산이 없습니다.</p></div>
<div id="lb" hidden><button id="lb-x" type="button">닫기 ×</button><button id="lb-p" type="button" aria-label="이전">‹</button><button id="lb-n" type="button" aria-label="다음">›</button><img id="lb-i" alt=""><div id="lb-t"></div></div>
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
// ── 내 결정: 카드 적용·검토·폐기 → 브라우저 저장 → [결정 발행] 글 복사 (apply-decisions.mjs 가 읽는 형식)
var KEY='lx_assets_decisions_v1',VS=['적용','검토','폐기'],VC={'적용':'ok','검토':'rv','폐기':'dp'};
var D={};try{D=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){D={};}
function save(){try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){}}
var cards=Array.prototype.slice.call(document.querySelectorAll('.card')),byId={};cards.forEach(function(c){byId[c.id]=c;});
Object.keys(D).forEach(function(id){var c=byId[id],d=D[id];if(!c||!d||VS.indexOf(d.v)<0||d.v===c.dataset.base)delete D[id];});save();
function grid(sc,dead){if(!dead){var g=sc.querySelector(':scope>.grid');if(!g){g=document.createElement('div');g.className='grid';sc.querySelector('.sch').after(g);}return g;}
var d=sc.querySelector('details.dead');if(!d){d=document.createElement('details');d.className='dead';d.innerHTML='<summary>폐기 <span class="dn">0</span></summary><div class="grid"></div>';sc.appendChild(d);}return d.querySelector('.grid');}
function setCard(c,v,user){c.dataset.v=v;c.classList.remove('v-ok','v-rv','v-dp');c.classList.add('v-'+VC[v]);var b=c.querySelector('.bdg');b.className='bdg '+VC[v];b.textContent=v;
c.classList.toggle('chg',v!==c.dataset.base);c.querySelectorAll('.ctl button').forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.set===v));});
var sc=c.closest('.sc'),inDead=!!c.closest('details.dead');if((v==='폐기')!==inDead){grid(sc,v==='폐기').appendChild(c);if(user){var d=c.closest('details');if(d)d.open=true;c.scrollIntoView({block:'nearest'});}}}
function recount(){var T={'적용':0,'검토':0,'폐기':0};cards.forEach(function(c){T[c.dataset.v]++;});
document.querySelectorAll('#bar .fb[data-v]').forEach(function(b){if(b.dataset.v)b.querySelector('b').textContent=T[b.dataset.v];});
document.querySelectorAll('section.fn').forEach(function(s){var n={'적용':0,'검토':0,'폐기':0};s.querySelectorAll('.card').forEach(function(c){n[c.dataset.v]++;});s.querySelectorAll('h2 i[data-c]').forEach(function(i){i.textContent=i.dataset.c+' '+n[i.dataset.c];});});
document.querySelectorAll('details.dead').forEach(function(d){var k=d.querySelectorAll('.card').length;d.querySelector('.dn').textContent=k;d.hidden=!k;});}
function changed(){return cards.filter(function(c){return D[c.id];});}
function renderList(){var L=changed(),ol=document.getElementById('dec-list');ol.innerHTML='';
L.forEach(function(c){var d=D[c.id],li=document.createElement('li');li.dataset.id=c.id;
var r=document.createElement('div');r.className='dl';var a=document.createElement('a');a.className='id jump';a.href='#'+c.id;a.textContent=c.id;
var nm=document.createElement('span');nm.className='nm';nm.textContent=c.querySelector('h4').textContent;
var ch=document.createElement('span');ch.className='ch';var s=document.createElement('s');s.textContent=c.dataset.base;var nv=document.createElement('span');nv.className=VC[d.v];nv.textContent=d.v;ch.appendChild(s);ch.appendChild(document.createTextNode(' → '));ch.appendChild(nv);
var x=document.createElement('button');x.type='button';x.className='x';x.textContent='취소';x.setAttribute('aria-label',c.id+' 결정 취소');
r.appendChild(a);r.appendChild(nm);r.appendChild(ch);r.appendChild(x);
var m=document.createElement('input');m.type='text';m.maxLength=140;m.placeholder='메모(선택) — 왜 바꾸는지 한 줄';m.value=d.m||'';m.setAttribute('aria-label',c.id+' 메모');
li.appendChild(r);li.appendChild(m);ol.appendChild(li);});
var n=L.length;document.getElementById('dec-n').textContent=n;document.getElementById('dec-empty').hidden=!!n;
document.getElementById('dec-pub').disabled=!n;document.getElementById('dec-reset').disabled=!n;
var j=document.getElementById('dec-jump');j.hidden=!n;j.querySelector('b').textContent=n;}
function decide(c,v,user){if(v===c.dataset.base)delete D[c.id];else D[c.id]={v:v,m:(D[c.id]&&D[c.id].m)||''};save();setCard(c,v,user);recount();renderList();msg('');if(F.v||F.k)apply();}
document.addEventListener('click',function(e){var b=e.target.closest('.ctl button');if(!b)return;var c=b.closest('.card');if(c.dataset.v!==b.dataset.set)decide(c,b.dataset.set,true);});
var ol=document.getElementById('dec-list');
ol.addEventListener('input',function(e){var li=e.target.closest('li');if(!li||!D[li.dataset.id])return;D[li.dataset.id].m=e.target.value;save();});
ol.addEventListener('click',function(e){var x=e.target.closest('button.x');if(!x)return;var c=byId[x.closest('li').dataset.id];decide(c,c.dataset.base,false);});
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
var lb=document.getElementById('lb'),im=document.getElementById('lb-i'),tt=document.getElementById('lb-t'),cur=-1;
function vis(){return Array.prototype.filter.call(document.querySelectorAll('button.lb'),function(b){return b.offsetParent!==null;});}
function show(i){var L=vis();if(!L.length)return;cur=(i+L.length)%L.length;var b=L[cur],c=b.closest('.card');im.src=b.dataset.src;
tt.innerHTML='';var h=document.createElement('span');h.textContent=(cur+1)+' / '+L.length+' · '+c.querySelector('h4').textContent+' ['+c.querySelector('.bdg').textContent+']';tt.appendChild(h);
var s=document.createElement('small');s.textContent=c.querySelector('.tg').textContent+(c.dataset.later?'  ·  이후: '+c.dataset.later:'');tt.appendChild(s);lb.hidden=false;document.body.style.overflow='hidden';}
function close(){lb.hidden=true;im.removeAttribute('src');document.body.style.overflow='';}
document.addEventListener('click',function(e){var b=e.target.closest('button.lb');if(!b)return;show(vis().indexOf(b));});
document.getElementById('lb-x').onclick=close;document.getElementById('lb-p').onclick=function(){show(cur-1)};document.getElementById('lb-n').onclick=function(){show(cur+1)};
lb.addEventListener('click',function(e){if(e.target===lb)close();});
document.addEventListener('keydown',function(e){if(lb.hidden)return;if(e.key==='Escape')close();else if(e.key==='ArrowLeft')show(cur-1);else if(e.key==='ArrowRight')show(cur+1);});
})();</script></body></html>`;
fs.writeFileSync(`${OUT_DIR}/masters.html`, html);
console.log(`자산 ${S.전체}: 적용 ${S.적용} · 검토 ${S.검토} · 폐기 ${S.폐기} | 원판 ${JSON.stringify(S.원판)} 구현 ${JSON.stringify(S.구현)} 시안 ${JSON.stringify(S.시안)} 스펙시먼 ${JSON.stringify(S.스펙시먼)}`);
