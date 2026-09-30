"""확인 요청 페이지 생성기 — docs/CONFIRM.md 의 '확인 대기' 항목을 사용자가 보고 고를 수 있는 한 장으로.

각 항목: 지금(무엇이 문제) · 제안(바뀐 뒤) · 보는 곳(캡처 + 직접 열어 볼 주소·계정·누를 곳) · 고를 것.
고른 결과는 브라우저에 저장되고, 맨 아래 '결정 복사'로 대화에 붙여 넣는다.
사용: python tools/review/build-confirm.py  → landxi/proto/review/confirm/index.html (+ img/)
"""
import html
import json
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm')
SHOTS = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process', 'uiux-ref', 'shots')
EXTRA = os.environ.get('LX_CONFIRM_EXTRA', '')  # 오케스트레이터가 새로 찍은 캡처 폴더(선택)
APP = 'https://app.land-xi.dev'
ADMIN = 'https://admin.land-xi.dev'
GOV = 'https://gov.land-xi.dev'
GH = 'https://github.com/LandXI-Web/Main/blob/plan1-foundation/'

# 계정 안내(비밀번호는 공개 페이지에 적지 않는다 — 대화로만 전달)
STAFF = '아이디 lx-staff · 임시 비밀번호 (LX 직원 탭)'
ADM = '아이디 lxadmin · 임시 비밀번호 (LX 관리자 탭)'
GOVA = '아이디 lxadmin · 임시 비밀번호 (기관 탭 → 남원시)'
GOVB = '아이디 lxadmin · 임시 비밀번호 (기관 탭 → 광주전남특별시)'
GUEST = '로그인 없이'

YES3 = ['확인', '보류', '반려']

# 섹션 → 항목. id 는 확인 대장(docs/CONFIRM.md) 번호와 같다.
SECTIONS = [
  ('먼저 결정해 주실 것', '이 네 가지가 정해져야 나머지 작업 방식이 정해집니다.', [
    dict(id='UX-6', t='메인 셋째 장면의 검정 바탕', now='메인 화면을 내리다 보면 셋째 장면(기관 행정자료와 AI 결과를 함께 분석)만 바탕이 검정입니다. 디자인 법전은 소개 화면에서 한 구간만 반전을 허용합니다.',
         prop='ⓐ 지금처럼 한 구간만 검정 유지(말로 묻는 장면을 강조) · ⓑ 다른 장면처럼 흰 카드로 통일', shots=['M-ch3-inverted.jpg'],
         where=[(APP + '/landxi/v3/main/', GUEST, '아래로 내려 셋째 장면')], opts=['ⓐ 유지', 'ⓑ 흰 카드로']),
    dict(id='X1', t='문구는 언제 정하나', now='참고 영상은 "글은 마지막에 다듬어라"고 합니다. 우리는 지금까지 "문구를 먼저 정하고 화면을 만든다"로 해 왔습니다.',
         prop='우리 방식(문구 먼저)을 유지하고, 화면이 끝난 뒤 다른 모델이 글만 다시 검수하는 단계를 더합니다.', shots=[],
         where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§3 대조 표')], opts=['제안대로', '영상대로(글은 마지막)', '보류']),
    dict(id='X2', t='디자인 규칙 자동 검사의 범위', now='영상은 남의 사이트에서 색·여백 규칙을 뽑아 쓰는 방법을 소개합니다. 우리 규칙상 남의 사이트를 자산으로 쓰지 않습니다.',
         prop='자동 검사는 우리 화면이 우리 디자인 규칙을 벗어났는지 재는 데만 씁니다(남의 사이트에서 뽑지 않음).', shots=[],
         where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4 채택 원칙')], opts=['제안대로', '보류']),
    dict(id='FR-7', t='데이터 올리기 — 지역은 직원이 정한다', now='데이터 올리기를 열면 화면이 스스로 지역을 고릅니다(잠깐 뒤 자동 선택 · 최근 지역 · 배포가 많은 지역). 그래서 구례군이 되었다가 남원시가 되는 일이 생깁니다. 옛 화면과 명세는 모두 "직원이 지역을 정한다"였습니다.',
         prop='처음엔 전국 지도와 빈 검색창, "지역을 고르세요" 한 줄만. 지역은 ① 앞 화면에서 넘겨받거나 ② 검색 ③ 지도 클릭으로만 정해집니다. 정해진 이유를 지역 이름 옆에 작게 표시합니다.',
         shots=['S1-03-ingest.jpg', 'A-ingest-5000.jpg'], where=[(APP + '/landxi/v3/lx-ingest/', STAFF, '왼쪽 ① 데이터 올리기')], opts=YES3),
  ]),
  ('작동하지 않는 것 — 고칠지 확인', '직접 눌러 봤을 때 멈추거나 반응이 없던 곳입니다. 모두 고치는 것을 권합니다.', [
    dict(id='FR-1', t='영상 등록이 실제 파일을 받게', now='영상 등록 창에 "파일 또는 경로" 글자 칸만 있습니다. 실제 영상 파일은 명령줄로 복사해야 합니다.',
         prop='파일을 끌어 놓는 칸(여러 파일 · 진행 막대 · 멈춤·재개·취소). 다 올라가면 그 지역 "영상 있음"으로 바뀌고 새로 고침 뒤에도 유지.',
         shots=['S1-04-imagery-sheet.jpg'], where=[(APP + '/landxi/v3/lx-ingest/?region=45190', STAFF, '서랍의 "영상 등록" 버튼')], opts=YES3),
    dict(id='FR-2', t='기관 대장 결합 결과가 실제로 나오게', now='대장을 올리면 10초쯤 뒤 "결합을 마쳤습니다"가 뜨지만 큰 숫자는 "—", 결과는 "아직 결과가 없습니다"입니다.',
         prop='결과가 실제로 도착했을 때만 "마쳤습니다". 결합 중엔 진행 막대, 실패면 원인 한 줄(예: 열 뜻이 안 맞음).',
         shots=['S3-05-result.jpg'], where=[(GOV + '/', GOVA, '대장 올리기 → 표본 파일')], opts=YES3),
    dict(id='FR-3', t='관리자 결재함이 열리게', now='LX 관리자 대시보드에서 "결재함 열기"를 누르면 "불러오는 중"에서 멈춥니다. 관리자 하루 업무의 첫 단계가 막혀 있습니다.',
         prop='바로 목록(배포 승인 · 규칙 기준 변경 · 한도 변경 · 다른 지역 적용 · 모델 등록). 항목을 열면 누가·무엇을·왜 + 승인/반려/사유.',
         shots=['S2-02-approvals.jpg'], where=[(ADMIN + '/', ADM, '오른쪽 카드 "결재함 열기"')], opts=YES3),
    dict(id='FR-4', t='계정·기관을 관리자 화면에서 만들기', now='새 기관이나 담당자 계정을 만드는 곳이 화면에 없습니다(지금은 제가 데이터베이스에서 직접 만듭니다).',
         prop='관리자 "기관" 안에: 기관 만들기(이름 · 관할 시군구 · 국내/해외 · 언어) · 계정 만들기·승인·비밀번호 재설정·잠금 · 로그인 이력.',
         shots=['S2-07-tenants.jpg'], where=[(ADMIN + '/landxi/v3/ops-infra/', ADM, '왼쪽 "기관"')], opts=YES3),
    dict(id='FR-5', t='LX 직원 "첫 항목 열기"가 열리게', now='LX 직원 첫 화면 "오늘" 카드의 "첫 항목 열기 →"를 눌러도 아무 일도 없습니다.',
         prop='누르면 결과 확인 대기 1순위 필지의 결과 확인 화면으로 이동, 그 필지를 강조.',
         shots=['staff-console-1440.jpg'], where=[(APP + '/landxi/v3/lx-console/', STAFF, '"오늘" 카드 오른쪽 위')], opts=YES3),
    dict(id='FR-6', t='새 서버(A100) 등록', now='GPU 서버를 더 붙이는 화면이 없습니다(A100×4 서버 2대 확장 계획).',
         prop='인프라에 "장비 추가"(주소 · GPU 수 · 전력 예산) → 작업 대기열이 새 장비도 나눠 씀.',
         shots=['admin-infra-1440.jpg'], where=[(ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라 화면')], opts=YES3),
  ]),
  ('부족한 것 — 넣을지 확인', '있어야 업무가 끝까지 이어지는데 빠져 있는 것입니다.', [
    dict(id='FR-8', t='서비스 만들기 버튼과 흐름', now='"갖춰진 업무" 표는 보이지만 거기서 서비스를 만들 수 없습니다.',
         prop='표의 행마다 "서비스 만들기" → 모델 + 규칙 + 대장 형식 + 영상 조건을 묶어 이름·대상(국내/해외)을 정하고 결재 요청.',
         shots=['S1-13-make-service.jpg'], where=[(APP + '/landxi/v3/lx-console/', STAFF, '왼쪽 ③ 서비스 만들기')], opts=YES3),
    dict(id='FR-9', t='오탐 신고 처리 화면', now='기관이 보낸 오탐 신고가 숫자(예: 96건)로만 있고, 한 건씩 보고 처리할 곳이 없습니다. 기관은 답을 못 받습니다.',
         prop='"신고 n건"을 누르면 건별 목록(필지 · 사진 · 기관 의견) → 맞음 / 오탐 / 재학습 표본에 넣기 → 결과가 기관 화면에 돌아감.',
         shots=['S1-16-service-mgmt.jpg'], where=[(APP + '/landxi/v3/lx-deploy/', STAFF, '왼쪽 ⑥ 서비스 관리')], opts=YES3),
    dict(id='FR-10', t='재학습 판단 기준 넓히기', now='"30일 신고 5건 이상"만 보고 재학습을 권합니다. 신고가 없는 지역의 오래된 모델은 못 잡습니다.',
         prop='신뢰도 · 표본 정밀도 · 마지막 학습 뒤 지난 날 · 신고, 네 가지를 함께 보고 "다음 할 일"을 정함.',
         shots=['S1-16-service-mgmt.jpg'], where=[(APP + '/landxi/v3/lx-deploy/', STAFF, '⑥ 서비스 관리 표')], opts=YES3),
    dict(id='FR-11', t='관할 밖 지역은 검색에서 바로 안내', now='남원시 계정인데 검색 제안에 여수시가 뜹니다.',
         prop='기관 계정의 검색 제안은 관할 시군구만. 관할 밖을 입력하면 "관할 밖입니다 — (기관)은 (시군구 n곳)" 한 줄.',
         shots=['S3-16-ximap-outside.jpg'], where=[(GOV + '/landxi/v3/xi-clean/', GOVA, '위 검색창에 "여수"')], opts=YES3),
    dict(id='FR-12', t='기관 첫 화면 = 내가 올린 대장부터', now='남원 첫 화면에 다른 사람이 올린 대장이 먼저 열립니다.',
         prop='로그인한 사람이 올린 최근 대장을 먼저. 다른 담당자 대장은 "기관 최근 대장" 목록에서 누가·언제와 함께 고름.',
         shots=['S3-01-gov-home.jpg'], where=[(GOV + '/', GOVA, '첫 화면')], opts=YES3),
    dict(id='FR-13', t='광역 기관은 시군구를 직접 고름', now='광주전남특별시로 들어가 보고서를 열면 화면이 저절로 강진군을 고릅니다.',
         prop='관할이 여러 시군구면 들어갈 때 시군구를 한 번 고름(최근 고른 곳 기억). 화면이 대신 고르지 않음.',
         shots=['S3-21-report-gj.jpg'], where=[(GOV + '/landxi/v3/gov-report/', GOVB, '보고서 화면 머리')], opts=YES3),
    dict(id='FR-14', t='현장 확인 배정 버튼', now='의심 필지를 누구에게 언제까지 현장 확인시킬지 정하는 단계가 화면에 안 보입니다.',
         prop='할 일 탭에 "현장 확인 배정"(담당자 · 기한 · 여러 필지 묶음). 배정 뒤에만 "담당 바꾸기".',
         shots=['S3-10-report-todo.jpg'], where=[(GOV + '/landxi/v3/gov-report/', GOVA, '할 일 탭')], opts=YES3),
    dict(id='FR-15', t='공문 초안', now='AI 도우미에 "공문"을 요청해도 보고서가 나옵니다. 공문 서식이 없습니다.',
         prop='보고서 탭에 "공문 초안"(시정명령 · 안내문 서식, 조치 기록의 근거 조문 인용) → 한글 문서 파일.',
         shots=['S3-13-report-tab.jpg'], where=[(GOV + '/landxi/v3/gov-report/', GOVA, '보고서 탭')], opts=YES3),
    dict(id='FR-16', t='관리자 표의 행을 눌러 상세 보기', now='관리자 기관·배포 표의 행이 눌리지 않고, 되돌리기 버튼이 보이지 않습니다.',
         prop='행을 누르면 옆 서랍: 사용량 추이 · 배포 이력 · 누가 무엇을 바꿨는지 · 되돌리기.',
         shots=['S2-10-deploys.jpg'], where=[(ADMIN + '/landxi/v3/ops-infra/', ADM, '왼쪽 "배포" 표의 한 행')], opts=YES3),
    dict(id='FR-17', t='경보를 누르면 그 항목으로', now='경보(예: 한도 임박)를 누르면 화면은 바뀌지만 어디를 봐야 할지 모릅니다.',
         prop='그 기관의 행을 강조하고 한도 조정 창을 미리 엶.', shots=['admin-dash-1440.jpg'],
         where=[(ADMIN + '/', ADM, '오른쪽 카드의 빨간 경보 줄')], opts=YES3),
    dict(id='FR-18', t='문의하기 · 내 계정', now='도움말에는 전화·메일 두 줄뿐이고, 내 계정에서는 로그아웃만 됩니다.',
         prop='문의 = 글 쓰기(제목 · 내용 · 첨부) + 내 문의 목록. 내 계정 = 이름 · 소속 · 비밀번호 바꾸기.',
         shots=['staff-help-1440.jpg'], where=[(APP + '/landxi/v3/help-my/', STAFF, '위 "?" 버튼')], opts=YES3),
  ]),
  ('있으면 좋을 것 · 도움될 것 — 넣을지 확인', '없어도 업무는 되지만, 있으면 쓰기 쉬워지는 것입니다.', [
    dict(id='FR-19', t='LX 직원 첫 화면에 "만들 수 있는 업무 · 운영 중인 곳"', now='첫 화면이 "오늘 할 일" 숫자만 보여 줍니다.',
         prop='"오늘" 옆에 작은 카드 2개: 지금 만들 수 있는 업무 수 · 운영/시범/적용 요청 지역 수(누르면 해당 단계로).',
         shots=['staff-console-1440.jpg'], where=[(APP + '/landxi/v3/lx-console/', STAFF, '첫 화면')], opts=YES3),
    dict(id='FR-20', t='데이터 올리기가 끝나면 다음 할 일 제시', now='결합이 끝나도 다음에 뭘 할지 안내가 없습니다.',
         prop='끝나면 "학습 표본 올리기" 또는 "전역 분석 요청" 버튼 하나를 바로 제시.', shots=['S1-05-ledger-sheet.jpg'],
         where=[(APP + '/landxi/v3/lx-ingest/', STAFF, '지역 고른 뒤 결합 실행')], opts=YES3),
    dict(id='FR-21', t='기관 화면 — 서비스마다 다른 작업 공간', now='옛 기관 화면에는 서비스 7종이 각자 다른 화면이었는데, 지금은 "필지 실태조사" 한 종처럼 보입니다.',
         prop='서비스를 바꾸면(영농 · 해양쓰레기 등) 그 서비스에 맞는 도구(영상 재생 · 밀도 지도 · 시간 비교)로 열림.',
         shots=['gov-fusion-1440.jpg'], where=[(GOV + '/', GOVA, '왼쪽 서비스 카드')], opts=YES3),
    dict(id='FR-22', t='XI맵 기본 도구 되살리기', now='옛 XI맵에 있던 거리·면적 재기, 관심 구역 그리기, 결과 내려받기가 빠졌습니다.',
         prop='XI맵에 "측정 · 관심 구역 · 내려받기(엑셀용 표 · 지도 파일)".', shots=['staff-ximap-1440.jpg'],
         where=[(APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 화면')], opts=YES3),
    dict(id='FR-23', t='배포 한눈표(서비스 × 시군구)', now='어느 지역에 어떤 서비스가 없는지 한눈에 볼 곳이 없습니다.',
         prop='서비스 × 시군구 표. 빈 칸을 누르면 그 지역 적용 요청.', shots=['staff-deploy-1440.jpg'],
         where=[(APP + '/landxi/v3/lx-deploy/', STAFF, '⑤ 배포')], opts=YES3),
    dict(id='FR-24', t='해외 기관도 대장 올리기 · 의심 필지', now='해외(키르기스스탄) 화면은 위성 분석 결과만 있고, 국내처럼 대장 올리기·의심 필지가 없습니다.',
         prop='해외 기관도 현지 행정단위로 대장 올리기 → 의심 필지.', shots=['global-1440.jpg'],
         where=[(GOV + '/', '아이디 lxadmin · 임시 비밀번호 (기관 탭 → 키르기스스탄 농업)', '첫 화면')], opts=YES3),
    dict(id='FR-25', t='지역 이름 옆에 "왜 이 지역인지"', now='화면에 지역이 떠 있어도 왜 그 지역인지 알 수 없습니다.',
         prop='지역 이름 옆 작은 글(예: "앞 화면에서 이어짐 · 바꾸려면 검색").', shots=['S1-03-ingest.jpg'],
         where=[(APP + '/landxi/v3/lx-ingest/', STAFF, '서랍 제목')], opts=YES3),
    dict(id='FR-26', t='처음 쓰는 공무원 안내', now='처음 들어온 담당자에게 무엇부터 하라는 안내가 없습니다.',
         prop='첫 방문 한 번만 3단 안내(대장 올리기 → 의심 필지 → 보고서), 도움말과 연결.', shots=['S3-01-gov-home.jpg'],
         where=[(GOV + '/', GOVA, '첫 화면')], opts=YES3),
    dict(id='FR-27', t='서비스 새 버전 알림', now='서비스(모델)가 새 버전으로 바뀌어도 기관 화면에 알림이 없습니다.',
         prop='기관 화면에 "새 버전 — 달라진 점" 한 줄.', shots=['S3-01-gov-home.jpg'], where=[(GOV + '/', GOVA, '첫 화면')], opts=YES3),
    dict(id='FR-28', t='관리자 데이터 보관함', now='기관이 올린 영상·대장 원본을 관리자가 모아 볼 곳이 없습니다.',
         prop='영상·대장 원본 목록 + 기관별 보기/편집 권한.', shots=['S2-07-tenants.jpg'], where=[(ADMIN + '/landxi/v3/ops-infra/', ADM, '왼쪽 메뉴')], opts=YES3),
    dict(id='FR-29', t='보고서 발급 내역 · 분류별 통계', now='옛 보고서 화면에 있던 발급 내역과 통계가 빠졌습니다.',
         prop='보고서 탭에 발급 내역 목록 · 분류별 통계.', shots=['S3-13-report-tab.jpg'], where=[(GOV + '/landxi/v3/gov-report/', GOVA, '보고서 탭')], opts=YES3),
  ]),
  ('화면 다듬기 — 확인', '기능은 그대로, 보기 좋고 덜 복잡하게 고치는 것입니다.', [
    dict(id='UX-2', t='로그인 오른쪽 문구', now='오른쪽 그림 카드에 영문 대제목 "HYPER PERFORMANCE"가 크게, 한글 "전국을 바로 읽습니다"가 작게 있습니다.',
         prop='영문은 작은 이름표(Hyper Performance)로 줄이고, 한글 한 줄 "전국 영상을 AI로 바로 분석합니다"를 크게. 세 장면 순환은 유지.',
         shots=['login-1440.jpg'], where=[(APP + '/landxi/v3/login/', GUEST, '오른쪽 그림 카드 아래')], opts=YES3),
    dict(id='UX-3', t='로그인 — 모바일에서 입력 칸을 위로', now='휴대폰에서는 그림 카드가 위에 크게 나와 아이디 칸이 첫 화면 아래로 밀립니다.',
         prop='휴대폰에서는 로그인 칸을 위, 그림 카드를 아래(또는 작게).', shots=['login-390.jpg'],
         where=[(APP + '/landxi/v3/login/', '휴대폰으로', '첫 화면')], opts=YES3),
    dict(id='UX-4', t='메인 첫 화면이 비어 보임', now='첫 화면이 제목 두 줄 + 지구본뿐이라 비어 보입니다.',
         prop='지구본 카드 안에 실제 업무 결과 숫자 하나(예: 전국 하천구역 건물 점유 651,478건) + 설명 한 줄 + 아래로 내리라는 단서.',
         shots=['main-1440.jpg'], where=[(APP + '/landxi/v3/main/', GUEST, '첫 화면')], opts=YES3),
    dict(id='UX-5', t='메인 — 휴대폰 카드 높이', now='휴대폰에서 카드가 정사각형이라 빈 공간이 큽니다.', prop='휴대폰 카드 높이를 화면의 절반 이하로, 바로 아래 다음 장면.',
         shots=['main-390.jpg'], where=[(APP + '/landxi/v3/main/', '휴대폰으로', '첫 화면')], opts=YES3),
    dict(id='UX-7', t='휴대폰 상단바 단순하게', now='휴대폰에서 위쪽 줄에 검색 · 물어보기 · XI맵 · ? · 나가기가 모두 들어가 복잡하고, "Ctrl K" 표시가 깨집니다.',
         prop='휴대폰 상단 = 로고 + 역할 + 메뉴 버튼 하나. 나머지는 메뉴 안으로. 키보드 단축키 표시는 휴대폰에서 숨김.',
         shots=['staff-console-390.jpg', 'gov-fusion-390.jpg'], where=[(APP + '/landxi/v3/lx-console/', '휴대폰으로 · ' + STAFF, '맨 위 줄')], opts=YES3),
    dict(id='UX-8', t='기관 첫 화면 — 지도 위 카드 줄이기', now='지도 위에 서비스 카드 5장 + 숫자 카드 + 창이 겹쳐 지도가 잘 안 보입니다.',
         prop='지도 위 카드는 3장 이하: 서비스 카드 5장은 위쪽 한 줄 버튼으로, 큰 숫자 카드 1, 작업 창 1.', shots=['gov-fusion-1440.jpg'],
         where=[(GOV + '/', GOVA, '첫 화면')], opts=YES3),
    dict(id='UX-9', t='관리자 지도 — 겹친 이름표 정리', now='관리자 지도에 "광주전남특별시"가 두 번 겹쳐 뜨고, 읍면(황등면) 표시가 섞여 있습니다.',
         prop='같은 기관은 표시 하나, 읍면 표시 없앰, 겹치면 숫자로 묶음.', shots=['admin-dash-1440.jpg'], where=[(ADMIN + '/', ADM, '지도')], opts=YES3),
    dict(id='UX-10', t='해외 첫 화면에 결과 채우기', now='해외 첫 화면이 흐린 지도만 보여 결과가 없어 보입니다.',
         prop='첫 화면에 이번 시즌 결과 숫자 하나(영어) + 결과 층 + 흐린 지도 안 보이게.', shots=['global-1440.jpg'],
         where=[(GOV + '/', '아이디 lxadmin · 임시 비밀번호 (기관 탭 → 키르기스스탄 농업)', '첫 화면')], opts=YES3),
    dict(id='UX-11', t='영업 첫 화면', now='영업 화면 머리가 커서 서비스 카드가 첫 화면 아래로 밀립니다.', prop='머리를 줄여 서비스 카드 첫 줄이 첫 화면에 보이게.',
         shots=['sales-1440.jpg'], where=[(APP + '/landxi/v3/sales/', '아이디 lx-sales · 임시 비밀번호 (LX 직원 탭)', '첫 화면')], opts=YES3),
    dict(id='UX-12', t='도움말 채우기 · 공지 제목 줄바꿈', now='도움말 화면이 좁은 한 줄로 비어 보이고, 공지 제목 줄바꿈이 어색합니다.',
         prop='넓게 두 칸(공지 · 자주 묻는 질문), 제목은 의미 단위 줄바꿈.', shots=['staff-help-1440.jpg'],
         where=[(APP + '/landxi/v3/help-my/', STAFF, '도움말')], opts=YES3),
    dict(id='UX-13', t='학습 상태 표시 세 가지로 통일', now='학습 화면에 "학습 기록 없음" 등 표시가 여러 가지 섞여 있습니다.', prop='"첫 학습 전 · 쓸 수 있음 · 재학습 필요" 세 가지만.',
         shots=['staff-train-1440.jpg'], where=[(APP + '/landxi/v3/lx-train/', STAFF, '② 학습')], opts=YES3),
    dict(id='UX-14', t='인프라 화면 — 큰 숫자 하나 · 쉬운 이름', now='큰 숫자가 여러 개이고, "두뇌 · 라우터" 같은 지어낸 말이 보입니다.', prop='큰 숫자는 "동시 고부하 GPU" 하나, 나머지는 표. 이름은 "언어 모델 1 · 2 · 예비".',
         shots=['admin-infra-1440.jpg'], where=[(ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라')], opts=YES3),
    dict(id='UX-19', t='결과 확인 — 표본이 적으면 정밀도 숫자 숨김', now='표본을 2건만 확인했는데 정밀도 "1.00"이 떠서 과장돼 보입니다.', prop='확인한 표본이 20건 미만이면 "—"와 "표본 20건 확인 후" 표시.',
         shots=['S1-11-sample20.jpg'], where=[(APP + '/landxi/v3/lx-review/', STAFF, '④ 결과 확인')], opts=YES3),
    dict(id='UX-20', t='기관 보고서 머리에 기관명 + 시군구', now='광주전남특별시 보고서 머리에 시군구가 안 보입니다.', prop='머리 = 기관명 · 시군구(예: 광주전남특별시 · 강진군).',
         shots=['gov-report-1440.jpg'], where=[(GOV + '/landxi/v3/gov-report/', GOVB, '보고서 머리')], opts=YES3),
  ]),
  ('작업 방식 — 확인', '화면이 아니라 우리가 만드는 순서입니다(참고 영상에서 배운 것).', [
    dict(id='A1·A2', t='화면 종류별 기준 카드', now='모든 화면을 같은 기준으로 만들고 있습니다.', prop='소개형 · 지도 도구형 · 업무 표형, 세 종류별로 "같은 상황 사례"를 글로 정리한 기준 카드 3장(캡처 없이).',
         shots=[], where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4')], opts=YES3),
    dict(id='A3', t='지시할 때 형용사 금지', now='"세련되게 · 여백 더" 같은 말로 지시하면 결과가 흔들립니다.', prop='지시는 법전 조항 · 문구 원문 · 숫자 완료 기준으로만.',
         shots=[], where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4')], opts=YES3),
    dict(id='A4·A5', t='글 검수 단계 + AI 티 표현 검사', now='화면 문구를 따로 검수하는 단계가 없습니다.', prop='만든 뒤 다른 모델이 화면 글만 검수. "끝낸다 · 유일한 · 대체한다 · 혁신적인" 같은 표현은 자동 검사로 걸러냄.',
         shots=[], where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4')], opts=YES3),
    dict(id='A6', t='디자인 규칙 이탈 자동 검사', now='둥근 모서리 · 색 · 그림자 · 글꼴이 규칙에서 벗어났는지 눈으로만 봅니다.', prop='우리 화면을 자동으로 재서 규칙을 벗어난 곳을 목록으로.',
         shots=[], where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4')], opts=YES3),
    dict(id='A7', t='만드는 순서 고정', now='순서가 차수마다 다릅니다.', prop='기준 → 디자인 규칙 → 글 검수 → 캡처 확인, 이 순서를 공정에 고정.',
         shots=[], where=[(GH + 'design/references/2026-09-30-youtube-feqjgsQFJ5k.md', '읽기', '§4')], opts=YES3),
  ]),
]

# 이미 만든 것 — 구현 확인
DONE = [
    dict(id='2', t='바깥 주소', what='이 PC 밖(휴대폰 포함)에서 로그인·사용', shots=['done-login-pc.png'],
         where=[(APP + '/', GUEST, '로그인 화면이 뜨면 정상')], opts=['완료', '다시']),
    dict(id='3·7', t='임시 계정 lxadmin · 임시 비밀번호', what='세 주소 모두 같은 아이디·비밀번호', shots=[],
         where=[(ADMIN + '/', ADM, '관리자 대시보드'), (GOV + '/', GOVA, '기관 첫 화면')], opts=['완료', '다시']),
    dict(id='4', t='로그인 문구 · 줄바꿈', what='"AI 기반 국토정보 / 통합조사" + 설명 3줄(의미 단위 줄바꿈)', shots=['done-login-pc.png', 'done-login-m.png'],
         where=[(APP + '/landxi/v3/login/', GUEST, '왼쪽 제목·설명')], opts=['완료', '다시']),
    dict(id='6', t='입구 셋 주소', what='app = LX 직원·영업 · admin = LX 관리자 · gov = 기관 (탭 없는 입구 화면은 코어 3차 뒤)', shots=[],
         where=[(ADMIN + '/', GUEST, '관리자 쪽 로그인으로 열림'), (GOV + '/', GUEST, '기관 쪽 로그인으로 열림')], opts=['완료', '다시']),
    dict(id='8', t='메인 구호 교체', what='7개 장면 제목을 공공 서비스 말투로(모두 두 줄)', shots=['done-main-grid.png'],
         where=[(APP + '/landxi/v3/main/', GUEST, '아래로 내리며 제목 확인')], opts=['완료', '다시']),
]


LEAD = '페블의 레퍼런스 가이드와 전 기능 재검수에서 나온 제안, 그리고 이미 만든 것의 구현 확인입니다. 확인하신 것만 만듭니다.'
# 2차 이후: LX_CONFIRM_ITEMS=<json> LX_CONFIRM_ROUND=2 → confirm/2/ (JSON 형식은 design-r2/confirm-items.json)
ROUND = os.environ.get('LX_CONFIRM_ROUND', '1')
if os.environ.get('LX_CONFIRM_ITEMS'):
    _d = json.load(open(os.environ['LX_CONFIRM_ITEMS'], encoding='utf-8'))
    SECTIONS = [(x['section'], x['desc'], [dict(i, where=[tuple(w) for w in i['where']]) for i in x['items']]) for x in _d]
    DONE = []
    OUT = os.path.join(OUT, ROUND)
    LEAD = os.environ.get('LX_CONFIRM_LEAD', LEAD)


def esc(s):
    return html.escape(str(s), quote=True)


def build():
    os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
    used = set()
    for _, _, items in SECTIONS:
        for it in items:
            used.update(it['shots'])
    for it in DONE:
        used.update(it['shots'])
    for f in used:
        for d in (SHOTS, EXTRA):
            if d and os.path.exists(os.path.join(d, f)):
                shutil.copy2(os.path.join(d, f), os.path.join(OUT, 'img', f))
                break

    def card(it, done=False):
        shots = ''.join(f'<a href="img/{esc(s)}" target="_blank"><img src="img/{esc(s)}" alt="" loading="lazy"></a>' for s in it['shots'] if os.path.exists(os.path.join(OUT, 'img', s)))
        where = ''.join(f'<li><a href="{esc(u)}" target="_blank" rel="noopener">{esc("설계 문서 열기" if "github.com" in u else u.replace("https://", ""))}</a><span>{esc(acc)}</span><em>{esc(tap)}</em></li>' for u, acc, tap in it['where'])
        opts = ''.join(f'<button type="button" data-v="{esc(o)}">{esc(o)}</button>' for o in it['opts'])
        body = (f'<p class="k">지금</p><p>{esc(it["now"])}</p><p class="k">제안</p><p>{esc(it["prop"])}</p>' if not done else f'<p class="k">만든 것</p><p>{esc(it["what"])}</p>')
        return (f'<article class="c" data-id="{esc(it["id"])}" data-t="{esc(it["t"])}"><header><span class="n">{esc(it["id"])}</span><h3>{esc(it["t"])}</h3></header>'
                f'<div class="g"><div class="tx">{body}<p class="k">보는 곳</p><ul class="wh">{where}</ul></div>'
                f'<div class="im">{shots or "<p class=na>화면 없음 — 작업 방식 항목</p>"}</div></div>'
                f'<footer><div class="op">{opts}</div><input type="text" placeholder="고칠 점이 있으면 한 줄" aria-label="메모"></footer></article>')

    secs = ''.join(f'<section><h2>{esc(h)}</h2><p class="sub">{esc(d)}</p>{"".join(card(i) for i in items)}</section>' for h, d, items in SECTIONS)
    done = '' if not DONE else '<section><h2>이미 만든 것 — 구현 확인</h2><p class="sub">열어 보시고 완료 또는 다시를 골라 주세요.</p>' + ''.join(card(i, True) for i in DONE) + '</section>'
    n = sum(len(i) for _, _, i in SECTIONS) + len(DONE)
    page = TPL.replace('__BODY__', secs + done).replace('__N__', str(n)).replace('__LEAD__', LEAD).replace('__R__', ROUND).replace('__FONTS__', '../../fonts-system.css' if ROUND == '1' else '../../../fonts-system.css').replace('__TITLE__', '확인 요청' if ROUND == '1' else f'확인 요청 {ROUND}차')
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
    print('confirm page:', n, 'items,', len(os.listdir(os.path.join(OUT, 'img'))), 'images')


TPL = '''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Land-XI __TITLE__</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="__FONTS__">
<style>
:root{--ink:#191F28;--ink2:#4E5968;--mute:#8B95A1;--line:#E5E8EB;--bg:#F2F4F6;--accent:#3182F6;--tint:#E8F3FF;--ok:#0FA9A0;--warn:#F59E0B;--no:#F04452}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Pretendard,system-ui,sans-serif;word-break:keep-all;overflow-wrap:break-word}
a{color:var(--accent);text-decoration:none}
.w{max-width:1120px;margin:0 auto;padding:32px 16px 140px}
h1{font:800 34px/1.2 Paperlogy,Pretendard,sans-serif;letter-spacing:-.02em;margin:0 0 8px}
.lead{margin:0 0 6px;color:var(--ink2)}
.how{text-wrap:pretty;margin:16px 0 0;padding:16px 20px;background:#fff;border-radius:16px;color:var(--ink2);font-size:15px}
.how b{color:var(--ink)}
section{margin-top:40px}
h2{font:700 24px/1.3 Paperlogy,Pretendard,sans-serif;margin:0 0 4px;text-wrap:balance}
.sub{margin:0 0 16px;color:var(--mute);font-size:15px;text-wrap:pretty}
.c{background:#fff;border-radius:20px;padding:20px 24px;margin:0 0 14px;border:2px solid transparent}
.c[data-s="확인"],.c[data-s="완료"],.c[data-s^="ⓐ"],.c[data-s^="ⓑ"],.c[data-s^="ⓒ"],.c[data-s="제안대로"],.c[data-s^="영상대로"]{border-color:var(--ok)}
.c[data-s="보류"]{border-color:var(--warn)}.c[data-s="반려"],.c[data-s="다시"]{border-color:var(--no)}
.c header{display:flex;gap:10px;align-items:baseline;margin-bottom:10px}
.n{font:600 13px/1 Inter,Pretendard,sans-serif;color:var(--accent);background:var(--tint);padding:5px 8px;border-radius:8px;flex:none}
h3{margin:0;font:700 19px/1.4 Pretendard,sans-serif;text-wrap:balance}
.g{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.tx p{margin:0 0 8px;color:var(--ink2);text-wrap:pretty}.tx p.k{margin:12px 0 2px;font-size:13px;font-weight:600;color:var(--mute)}.tx p.k:first-child{margin-top:0}
.wh{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.wh li{display:flex;flex-direction:column;background:var(--bg);border-radius:10px;padding:8px 12px;font-size:14px}
.wh li a{overflow-wrap:anywhere}.wh li span,.wh li em{text-wrap:pretty}.wh li span{color:var(--ink2)}.wh li em{font-style:normal;color:var(--mute);font-size:13px}
.im{display:grid;gap:8px;align-content:start}
.im img{width:100%;border-radius:12px;border:1px solid var(--line);display:block}
.na{color:var(--mute);font-size:14px;margin:0;padding:24px;background:var(--bg);border-radius:12px;text-align:center}
footer{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.op{display:flex;gap:6px;flex-wrap:wrap}
.op button{font:600 15px/1 Pretendard,sans-serif;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}
.op button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
footer input{flex:1;min-width:200px;font:15px Pretendard,sans-serif;padding:10px 12px;border:1px solid var(--line);border-radius:10px}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
.bar b{font-weight:600}
.bar button{font:700 16px/1 Pretendard,sans-serif;padding:14px 22px;border-radius:12px;border:0;background:var(--accent);color:#fff;cursor:pointer}
.bar small{color:var(--mute)}
@media (max-width:760px){.g{grid-template-columns:1fr}.c{padding:16px}h1{font-size:28px}}
</style>
</head>
<body>
<main class="w">
<h1>__TITLE__</h1>
<p class="lead">__LEAD__</p>
<div class="how"><b>보는 법</b> — 항목마다 <b>지금</b>(무엇이 문제인지) · <b>제안</b>(바뀐 뒤) · <b>보는 곳</b>(캡처, 그리고 직접 열어 볼 주소·계정·누를 곳)이 있습니다. 캡처를 누르면 크게 열립니다.<br>
<b>고르는 법</b> — 버튼을 누르고, 고칠 점이 있으면 한 줄 적어 주세요. 고른 것은 이 브라우저에 저장됩니다. 다 고르시면 아래 <b>결정 복사</b>를 눌러 대화창에 붙여 넣어 주세요. 안 고른 항목은 그대로 두셔도 됩니다.</div>
__BODY__
</main>
<div class="bar"><b id="cnt">0 / __N__ 고름</b><button type="button" id="copy">결정 복사</button><small id="msg"></small></div>
<script>
const KEY='lx-confirm-0930-r__R__';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch{}};
const cards=[...document.querySelectorAll('.c')];
const count=()=>{document.getElementById('cnt').textContent=Object.values(S).filter(v=>v&&v.v).length+' / '+cards.length+' 고름'};
for(const c of cards){const id=c.dataset.id,st=S[id]||{};const inp=c.querySelector('input');
  const paint=()=>{c.dataset.s=(S[id]||{}).v||'';for(const b of c.querySelectorAll('.op button'))b.classList.toggle('on',b.dataset.v===(S[id]||{}).v)};
  if(st.m)inp.value=st.m;paint();
  c.querySelectorAll('.op button').forEach(b=>b.onclick=()=>{S[id]={...(S[id]||{}),v:(S[id]||{}).v===b.dataset.v?'':b.dataset.v};save();paint();count()});
  inp.oninput=()=>{S[id]={...(S[id]||{}),m:inp.value};save()};}
count();
document.getElementById('copy').onclick=async()=>{
  const lines=cards.filter(c=>(S[c.dataset.id]||{}).v||(S[c.dataset.id]||{}).m).map(c=>{const s=S[c.dataset.id];return '- '+c.dataset.id+' '+c.dataset.t+': '+(s.v||'(선택 없음)')+(s.m?' — '+s.m:'')});
  const t='[__TITLE__ 결정 · '+new Date().toLocaleString('ko-KR')+']\\n'+(lines.join('\\n')||'(고른 항목 없음)');
  try{await navigator.clipboard.writeText(t);document.getElementById('msg').textContent='복사했습니다 — 대화창에 붙여 넣어 주세요'}catch{prompt('아래 글을 복사해 주세요',t)}};
</script>
</body>
</html>
'''

if __name__ == '__main__':
    build()
