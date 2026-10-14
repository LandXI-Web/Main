"""바퀴 13 now 항목 JSON 만들기. 사용: python build-items-r13.py <shots-r13 폴더>
증거 그림(고치기 전 그림 · 한글로 연 그림)은 이름에 시각을 붙여 같은 폴더로 모은다. 숫자는 log.json 에서 옮긴다."""
import glob, json, os, re, shutil, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
NOW = os.path.join(PR, 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
APP, ADMIN, ORG = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
IMG = APP + '/landxi/proto/review/confirm/now/img/'
EV = {
    'old-fit-staff-2560': 'impl-32/fit-staff/dash-2560-before.jpg',
    'old-fit-admin-req-2560': 'impl-33/fit-admin-gov/admin-req-2560-before.jpg',
    'old-fit-gov-dash-2560': 'impl-33/fit-admin-gov/gov-dash-2560-before.jpg',
    'hwp-a-overview': 'impl-32/hwp-report/opened/hwp-r1-overview-p2-1346.png',
    'hwp-b-task': 'impl-32/hwp-report/opened/hwp-r2-task-p1-1346.png',
    'hwp-all-A': 'impl-33/hwpx-all/opened/A.png', 'hwp-all-B': 'impl-33/hwpx-all/opened/B.png', 'hwp-all-C': 'impl-33/hwpx-all/opened/C.png',
    'hwp-all-D': 'impl-33/hwpx-all/opened/D.png', 'hwp-all-E': 'impl-33/hwpx-all/opened/E.png', 'hwp-all-F': 'impl-33/hwpx-all/opened/F.png',
}
for base, rel in EV.items():
    src = os.path.join(PR, rel)
    t = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    shutil.copy2(src, os.path.join(SH, f'{base}-{t:%H%M}' + os.path.splitext(src)[1]))
mp4 = os.path.join(PR, 'impl-31/ximap-fusion/ximap-fusion-20s.mp4')
MP4 = f'ximap-fusion-20s-{datetime.datetime.fromtimestamp(os.path.getmtime(mp4)):%H%M}.mp4'
shutil.copy2(mp4, os.path.join(SH, MP4))


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    return os.path.basename(f[-1])


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b))
    return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    ts = sorted(hm(b) for b in bs)
    return f'(그림 찍은 시각 10월 14일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


DONE = ['완료', '다시']
OK = ['확인']
dash = LOG['_dash']
assert not any(v.get('fail') for v in dash.values())
fil = LOG['_xi_filter']['answer'].split('\n')[0]
n_train, n_led = len(LOG['_sd_train']), len(LOG['_sd_admin']) - 4
PN = dict(bar='막대', heat='히트맵 격자', rank='순위 표', line='선', scatter='산점도', hist='면적 구간', donut='도넛', stack='누적 막대', table='표')
HUE = dict(orange='주황', violet='보라', teal='청록')
SC = dict(seq='연속', step='단계', div='발산')
ftab = [['질문', '차트 모양', '지도 색칠']]
for i in range(1, 8):
    d = dash[f'now-fu-{i}']
    m = d['map']
    ftab.append([d['q'], ' · '.join(PN[x] for x in d['panels']), SC[m['scale']] + ' · ' + (HUE.get(m['hue']) or '빨강 · 파랑')])

items = []
items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='지금 화면 네 장', shots=[S('now-xi-chat-bottom'), S('now-fu-2'), S('now-sd-img'), S('after-fit-staff-2560')], opts=OK,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 아래 채팅 창에 질문 하나'], [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터'], [APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드(2560 해상도)']],
    what='XI맵(아래 채팅 창) · XI맵 융합 대시보드(질문 하나) · 관리자 공유 데이터 · 2560 해상도의 LX 직원 대시보드(넓어진 모습)입니다. ' + T('now-xi-chat-bottom', 'now-fu-2', 'now-sd-img', 'after-fit-staff-2560'))]))

A = []
A.append(dict(id='지운자리-기억', t='지운 자리 기억 — 고친 자리가 다시 분석한 새 결과에 저절로 적용', shots=[S('now-edit-2')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, '결과 객체 → 그 자리 고치기 → 지우기 → 되돌리기']],
    what='고친 자리를 모양 · 분류 · 영상 연도로 기억해, 다시 분석한 새 결과에 지움 · 바꾼 분류를 저절로 적용하고 되돌릴 수 있습니다. 실제 다시 분석(남원 0.16㎢ · 시험)은 아래 표와 같습니다. 그림은 그 자리 고치기 칸의 지움 모습입니다. ' + T('now-edit-2'),
    table=[['고친 자리(시험)', '새 결과 객체', '저절로 적용', '지운 자리에 다시 보임'], ['지움 2 · 분류 바꿈 1', '20개', '3곳', '0']]))
A.append(dict(id='전국결과-고치기', t='전국 결과 객체를 누르면 같은 그 자리 고치기 칸', shots=[S('now-edit-1'), S('now-edit-2'), S('now-edit-3')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/?test=1', STAFF, '임실군 확대 → 객체 누르기 → 지우기(시험) → 되돌리기']],
    what='전국 결과 객체도 서비스 결과와 같은 칸 · 같은 동작이고, 고친 부분은 학습 데이터로 저장됩니다. 지운 것은 이번에 되돌려 두었습니다. ' + T('now-edit-1', 'now-edit-2', 'now-edit-3')))
A.append(dict(id='XI맵-채팅창', t='XI맵 XI ChatGEO — 지도 아래 가운데 채팅 창, 오른쪽 칸 없음', shots=[S('now-xi-chat-bottom')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, '지도 아래 XI ChatGEO 줄 · 위의 추천 질문 셋']],
    what='추천 질문 셋: ' + ' · '.join(LOG['_xi_first']['chips']) + '. 오른쪽 칸은 없습니다. ' + T('now-xi-chat-bottom')))
A.append(dict(id='XI맵-말로거르기', t="아래 채팅 창에서 '비닐하우스만 보여 줘'", shots=[S('now-xi-filter')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "'비닐하우스만 보여 줘' → '원래대로'"]],
    what=f"답: {fil} 지도 왼쪽 위 숫자도 같은 값입니다. " + T('now-xi-filter')))
A.append(dict(id='XI맵-융합대시보드', t='XI맵 융합 대시보드 — 질문 일곱 개, 일곱 가지 모양', shots=[S(f'now-fu-{i}') for i in range(1, 8)] + [S('now-fu-pick')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, '아래 채팅 창에 아래 표의 질문 · 순위 줄 누르기'],
           [IMG + MP4, f'로그인 없이 열림 · 영상 20초(10월 14일 {MP4[-8:-6]}:{MP4[-6:-4]} 녹화)', '채팅 창 → 대시보드 → 순위 줄 → 지도로']],
    what='질문마다 차트 모양과 지도 색이 다릅니다. 숫자는 서버 집계 값입니다. ' + T(*[f'now-fu-{i}' for i in range(1, 8)], 'now-fu-pick'), table=ftab))
A.append(dict(id='공유데이터-탭', t='LX 관리자 공유 데이터 — 영상 · 학습 데이터 · 행정 자료 세 탭', shots=[S('now-sd-img'), S('now-sd-train'), S('now-sd-admin')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '왼쪽 메뉴 공유 데이터 → 탭 셋']],
    what=f'영상 83장 · 학습 데이터 올린 묶음 {n_train}줄 · 행정 자료(브이월드 층 4가지와 기관 대장 {n_led}줄)입니다. ' + T('now-sd-img', 'now-sd-train', 'now-sd-admin')))
A.append(dict(id='해외바탕-교체', t='XI맵 해외 바탕을 무료 · 상업 이용 가능한 Sentinel-2 영상으로 교체', shots=[S('after-kg-country'), S('after-bishkek')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/?nation=kg', STAFF, "오른쪽 위 '키르기스스탄' → 비슈케크까지 확대 · 오른쪽 아래 영상 출처"]],
    what=f"키르기스스탄 · 미얀마 바탕이 바뀌었고 출처 표기는 '{LOG['_credit']}'입니다. " + T('after-kg-country', 'after-bishkek')))
A.append(dict(id='보고서-한글', t="융합 대시보드 '보고서로' — 한글 문서(.hwpx)로 내려받기", shots=[S('now-fu-2'), S('hwp-a-overview'), S('hwp-b-task')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "'남원시 비닐하우스 어디가 많아?' → 오른쪽 위 '보고서로'"]],
    what=f"첫 그림은 이번에 찍은 대시보드({hm('now-fu-2')})이고, 나머지 둘은 받은 문서를 한글 2020 으로 연 그림입니다(10월 14일 {hm('hwp-a-overview')}에 연 그림). 숫자는 화면과 같습니다."))
A.append(dict(id='보고서-한글-전체', t='모든 문서를 한글 문서(.hwpx)로 — 기관 보고서 · 실태조사 보고서 초안 · XI ChatGEO 보고서 · 기관 화면 · XI맵', shots=[S(f'hwp-all-{x}') for x in 'ABCDEF'], opts=DONE,
    where=[[ORG + '/landxi/v3/gov-report/?tab=report', GOV, "보고서 탭 → '한글 문서 내려받기'"], [APP + '/landxi/v3/xi-clean/', STAFF, "XI ChatGEO 보고서 초안 · 도구 '보고서' · '보고서로'"]],
    what=f"받은 문서 여섯 개를 한글 2020 으로 연 그림입니다(10월 14일 {hm('hwp-all-A')}–{hm('hwp-all-F')}에 연 그림). .docx 는 더 내지 않습니다."))
A.append(dict(id='화면최적화-직원', t='LX 직원 화면 — 2560 해상도에서 화면을 채움', shots=[S('old-fit-staff-2560'), S('after-fit-staff-2560')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 · 프로젝트 · 분석하기 · XI맵 대시보드']],
    what=f"위는 고치기 전, 아래는 지금입니다. 최근 프로젝트 카드 열이 늘고 내용 폭이 화면을 채웁니다. 고치기 전 그림은 다시 찍을 수 없어 10월 14일 {hm('old-fit-staff-2560')}에 찍은 그림이고, 지금 그림은 {hm('after-fit-staff-2560')}에 찍었습니다."))
A.append(dict(id='화면최적화-관리자', t='LX 관리자 화면 — 2560 해상도에서 양옆 빈 띠 없이 채움', shots=[S('old-fit-admin-req-2560'), S('after-fit-admin-req-2560')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-core/#/approvals', ADM, '요청 관리 · 기관 · 배포 · 공유 데이터 · 계정']],
    what=f"요청 관리 화면입니다. 고치기 전 그림은 10월 14일 {hm('old-fit-admin-req-2560')}, 지금 그림은 {hm('after-fit-admin-req-2560')}에 찍었습니다."))
A.append(dict(id='화면최적화-기관', t='기관 화면 — 2560 해상도에서 화면을 채우고 지도가 커짐', shots=[S('old-fit-gov-dash-2560'), S('after-fit-gov-dash-2560')], opts=DONE,
    where=[[ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '서비스 대시보드 · 요청하기 · 보고서 · 필지 목록']],
    what=f"서비스 대시보드입니다. 고치기 전 그림은 10월 14일 {hm('old-fit-gov-dash-2560')}, 지금 그림은 {hm('after-fit-gov-dash-2560')}에 찍었습니다."))
A.append(dict(id='ChatGEO-개선바퀴', t='XI ChatGEO 개선 바퀴 — 모은다 · 나눈다 · 고친다 · 잰다 · 내보낸다', shots=[S('now-admin-improve')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', ADM, '배포 → 개선 후보 맨 위 줄']],
    what='못 알아들은 질문을 모아 원인을 나누고, 고친 것을 새 판으로 묶어 시험 질문으로 전과 후를 잽니다. 나빠진 질문이 없을 때만 승인 요청이 올라가고, 승인하면 처음 물은 사람에게 알립니다. ' + T('now-admin-improve')))
A.append(dict(id='ChatGEO-첫바퀴', t='첫 바퀴 — 평가 질문 55개 중 답한 질문 50 → 53, 나빠진 질문 0', shots=[S('now-admin-improve')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', ADM, '새 판 2 줄']],
    what='개선 후보 38건을 나누어 규칙 3 · 새 도구 2를 고쳤습니다. 승인 전에는 시험 질문에서만 새 답이 나옵니다. ' + T('now-admin-improve'),
    table=[['', '전', '후'], ['답한 질문(답함 + 안내함)', '50', '53'], ['답함', '42', '47'], ['안내함', '8', '6'], ['못 함', '5', '2'], ['나빠진 질문', '', '0'],
           ['허가 없이 지은 건물 이행강제금', '안내함', '답함'], ['Land-XI 플랫폼 창시자는 누구', '못 함', '답함'], ['분석 결과를 GeoJSON 으로 내려받고 싶어', '안내함', '답함'], ['비닐하우스만 보기', '안내함', '답함'], ['남원시 해안 쓰레기 몇 곳', '못 함', '안내함']]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=A))

B = []
B.append(dict(id='재검수-직원', t='LX 직원 화면 — 기능 41개 확인 · 느린 곳 줄임', shots=[S('now-staff-dash'), S('now-staff-analyze')], opts=OK,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 · 프로젝트 · 분석하기 · 지도 서비스 · XI맵 · 요청함 · 지원']],
    what='기능 41개를 눌러 봤습니다: 됨 37 · 고침 1(XI맵 고치기 칸이 Esc 로 안 닫히던 것) · 이상함 3(아래 읍면동 찾기 · 데이터 이상에서 모두 고침). ' + T('now-staff-dash', 'now-staff-analyze'),
    table=[['느린 곳', '전', '후'], ['분석하기 지역 고르기 → 영상 · 조건', '3.8초', '1.8초'], ['학습데이터 구축(처음)', '5.2초', '3.5초'], ['데이터 올리기(처음 · 다시)', '4.5 · 3.7초', '3.3 · 2.4초'],
           ['지도 서비스 불러오는 중(처음 · 다시)', '3.1 · 2.3초', '2.0 · 1.5초'], ['대시보드(처음 · 다시)', '2.4 · 2.1초', '1.6 · 1.6초']]))
B.append(dict(id='재검수-관리자기관', t='LX 관리자 · 기관 화면 — 기능 38개 확인 · 느린 곳 · 규칙 이름 통일', shots=[S('now-admin-infra'), S('now-admin-usage'), S('now-gov-dash')], opts=OK,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/infra', ADM, '인프라 · 배포 사용 현황'], [ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '내 서비스 · 서비스 대시보드']],
    what="관리자 19 · 기관 19, 모두 동작합니다. 옛 규칙 이름은 어디서나 '농지 위 건물' 한 이름이고, 옛 이름으로 물어도 같은 규칙으로 알아듣습니다. " + T('now-admin-infra', 'now-admin-usage', 'now-gov-dash'),
    table=[['관리자 화면', '전', '후'], ['기관 공유', '30초 넘음', '0.4초'], ['사용 현황', '30초 넘음', '0.5초'], ['인프라', '22초', '4초'], ['대시보드(다시)', '18초', '1.8초']]))
B.append(dict(id='502-없앰', t="바깥 주소 '502' 원인 고침 · 서버가 잠깐 끊겨도 로그아웃 안 함", shots=[], opts=OK,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '세 입구 화면이 끊기지 않고 열림']],
    what='원인: 서버가 큰 응답을 만드느라 몇 초씩 멈추고, 그 사이 화면이 502 를 받았습니다. 고친 뒤 서버가 끊기면 로그인 화면으로 가지 않고 불러오는 중으로 기다렸다가 돌아오면 보던 화면을 엽니다.',
    table=[['같은 부하(30초 · 동시 12)', '전', '후'], ['초당 처리', '13건', '24건'], ['3초 넘게 걸린 요청', '13', '0'], ['가장 느린 요청', '20초', '3초 미만'], ['502', '0', '0']]))
B.append(dict(id='재검수-남은고장', t='읍면동 찾기 · 첫 화면 속도 · 데이터 이상 고침', shots=[], opts=OK,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "XI ChatGEO '운봉읍 농지 위 건물 필지 몇 곳이야?'"], [APP + '/landxi/v3/lx-analyze/', STAFF, "지역 찾기 '강원 원주'"]],
    what="'운봉읍' 같은 읍면동 이름이 어느 화면에서 물어도 431필지로 답합니다(같은 이름이 여럿이면 되묻기 · 기관은 관할 안만). '강원 원주'처럼 시도를 붙여도 찾고, 보고서의 '광치동-5'는 '광치동'으로, 직원 저장 용량은 승인된 100GB로 맞췄습니다.",
    table=[['첫 화면', '전', '후'], ['LX 직원 대시보드', '2.0초', '1.7초'], ['LX 관리자 대시보드', '1.8초', '1.8초'], ['기관(남원) 내 서비스', '2.8초', '1.5초']]))
items.append(dict(section='B. 재검수 결과', desc='전수 재검수와 속도 개선 결과입니다. 확인을 눌러 주세요.', items=B))

C = []
C.append(dict(id='시험DB-분리', t='서버 시험을 운영 DB 와 나눌까요?', shots=[], opts=['나눔', '그대로'], where=[],
    now='배포 흐름 시험이 운영 중인 남원 경작 서비스를 2.1 → 2.0 → 2.1 로 되돌렸다 되살리며 승인 · 처리 기록을 남깁니다(10월 11일 이후 82줄). 운영 기록은 지우거나 고치지 않았습니다.',
    prop='시험용 DB(운영 DB 7.9GB 복사)와 시험 전용 서버를 따로 둡니다.'))
C.append(dict(id='EOx-남은곳', t='로그인 · 메인 · 세계 지도에 남은 비상업 영상도 바꿀까', shots=[S('now-pub-login'), S('now-pub-main')], opts=['바꿈', '그대로'],
    where=[[APP + '/landxi/v3/login/', '로그인 없이 열림', '로그인 바탕 · 메인 첫 장면']],
    now='XI맵 해외 바탕은 바꿨지만 로그인 바탕 · 메인 첫 장면 · 세계 낮은 줌 · 해외 첫 화면은 아직 비상업 라이선스 영상입니다. ' + T('now-pub-login', 'now-pub-main'),
    prop='세계 낮은 줌용 공공 영상으로 함께 바꿉니다.'))
C.append(dict(id='ChatGEO-새판2', t='XI ChatGEO 새 판 2 를 내보낼까', shots=[S('now-admin-improve')], opts=['승인', '거절'],
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', ADM, '배포 → 개선 후보 맨 위 줄']],
    now='평가 질문 55개 중 답함 50 → 53, 나빠진 질문 0. 관리자 배포 → 개선 후보 맨 위에서 승인 대기 중입니다. ' + T('now-admin-improve'),
    prop='승인하면 모든 질문에 적용되고 처음 물은 사람에게 알립니다. 거절 · 되돌리기도 됩니다.'))
C.append(dict(id='ChatGEO-매주', t='XI ChatGEO 개선을 매주 월요일 새벽에 저절로 돌릴까', shots=[], opts=['돌림', '안 돌림'], where=[],
    now='지금은 개선 바퀴를 사람이 시킬 때만 돕니다. 정기 예약은 아직 걸지 않았습니다.',
    prop='매주 월요일 새벽 2시(사용자가 없는 시간)에 한 바퀴를 돌립니다.'))
C.append(dict(id='기록-금칙어', t="지난 배포 기록 글의 '검증 묶음'을 지금 말로 바꿀까", shots=[], opts=['바꿈', '그대로(검사에서 예외)'], where=[],
    now='10월 7일 배포 기록 사유 글에 쓰지 않기로 한 말이 남아 배포 탭에 보입니다(지난 기록이라 그대로 둘 수도 있습니다).',
    prop='바꾸거나, 그대로 두고 검사에서만 예외로 둡니다.'))
items.append(dict(section='C. 질문', desc='새로 여쭙는 다섯 가지입니다.', items=C))
json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(SH, 'mp4name.txt'), 'w').write(MP4)
print('항목', [len(x['items']) for x in items], MP4)
