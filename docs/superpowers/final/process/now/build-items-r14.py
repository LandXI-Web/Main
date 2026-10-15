"""바퀴 14 now 항목 JSON 만들기. 사용: python build-items-r14.py <shots-r14 폴더>
증거 그림(고치기 전 그림 · 녹화)은 이름에 시각(파일 수정 시각)을 붙여 같은 폴더로 모은다. 숫자는 log.json 에서 옮긴다."""
import glob, json, os, re, shutil, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
NOW = os.path.join(PR, 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
APP, ADMIN, ORG, OVS = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev', 'https://kgz-agri.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
OV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (해외 기관 로그인 폼)'
IMG = APP + '/landxi/proto/review/confirm/now/img/'
EV = {   # 전(고치기 전) 그림 · 증거 — 파일 수정 시각을 이름 끝에 붙인다
    'old-edit-svc': 'impl-35/ximap/shots/before-e1-svc-open-1440-0813.png',
    'old-edit-nat': 'impl-35/ximap/shots/before-e2-nat-open-1440-0813.png',
    'old-xi-first': 'impl-35/ximap/shots/before-a1-first-1440-0813.png',
    'old-fu-d2': 'impl-35/ximap/shots/before-d2-task-1440-0813.png',
    'old-font-staff-dash': 'impl-35/font-scale/staff-dash-1440-before.jpg',
    'old-font-staff-2560': 'impl-35/font-scale/staff-dash-2560-before.jpg',
    'old-font-admin-dash': 'impl-35/font-scale/admin-dash-1440-before.jpg',
    'old-font-gov-dash': 'impl-35/font-scale/gov-dash-1440-before.jpg',
    'old-ov-landing': 'design-r30/overseas/shots/now-org-kgz-1440-0947.png',
    'old-login': 'impl-35/shared-eox-weekly/shots/login-before-1440-0840.png',
    'old-main': 'impl-35/shared-eox-weekly/shots/main-before-1440-0840.png',
    'old-world': 'impl-35/shared-eox-weekly/shots/world-before-1440-0840.png',
    'old-ov-eox': 'impl-35/shared-eox-weekly/shots/overseas-before-1440-0840.png',
    'chips-sample': 'design-r30/overseas/chips-sample.png',
}
for base, rel in EV.items():
    src = os.path.join(PR, rel)
    t = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    shutil.copy2(src, os.path.join(SH, f'{base}-{t:%H%M}' + os.path.splitext(src)[1]))
mp4 = os.path.join(PR, 'impl-37/ximap-onmap/ximap-onmap-20s.mp4')
MP4 = f'ximap-onmap-20s-{datetime.datetime.fromtimestamp(os.path.getmtime(mp4)):%H%M}.mp4'
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
    return f'(그림 찍은 시각 10월 15일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def OLD(*bs):
    ts = sorted(hm(b) for b in bs)
    return f'옛 그림은 10월 15일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + '에 찍은 것입니다.'


DONE = ['완료', '다시']
OK = ['확인']
on, fu = LOG['_on'], LOG['_dash']
assert not any(v.get('fail') for v in on.values()) and not any(v.get('fail') for v in fu.values())
big_first = re.search(r'[\d,]{7,}', LOG['_xi_first']['hud']).group(0)
assert LOG['_xi_first']['big'] == 80, LOG['_xi_first']['big']
ovf, ovr = LOG['_ov_first'], LOG['_ov_revisit']
gx = LOG['_gov_xi_s']
sec = lambda ms: f'{ms / 1000:.1f}초'
ONALL = [f'now-on-{k}-fill' for k in ('d1', 'd2', 'd3', 'd4', 'd5')] + ['now-on-d1-tour', 'now-on-d1-hover', 'now-on-d1-pick']

items = []
items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='지금 화면 네 장', shots=[S('now-on-d2-fill'), S('now-edit-svc'), S('now-sd-img'), S('now-staff-dash')], opts=OK,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "아래 채팅 창에 '남원시 비닐하우스 어디가 많아?' · 지도에서 객체 누르기"], [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터 → 줄 누르기'], [APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드']],
    what='XI맵 지도 위 통계(질문 하나) · XI맵 그 자리 고치기 칸 · 관리자 공유 데이터 상세 판 · 글자가 커진 LX 직원 대시보드입니다. ' + T('now-on-d2-fill', 'now-edit-svc', 'now-sd-img', 'now-staff-dash'))]))

A = []
A.append(dict(id='XI맵-지도위표출', t='XI맵 통계를 지도 위에서 — 질문하면 읍면동이 값 순서로 차오릅니다', shots=[S(x) for x in ONALL], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "아래 채팅 창에 아래 질문 · 왼쪽 아래 '통계' 단추로 지도 위 · 대시보드 바꾸기"],
           [IMG + MP4, f'로그인 없이 열림 · 영상 20초(10월 15일 {MP4[-8:-6]}:{MP4[-6:-4]} 녹화)', '질문 → 차오름 → 꼬리표 → 날아감 → 막대에 올림 → 누름']],
    what=f"화면이 바뀌지 않고 지도가 차오르고, 값 큰 다섯 곳에 숫자 꼬리표가 뜨고, 1~3위로 날아갑니다. 오른쪽 작은 판은 접고 펼 수 있고 막대에 올리면 지도 그 곳이 따라옵니다. 숫자는 서버 값 그대로입니다(남원시 {on['d1']['main']['value']:,}개 · 비닐하우스 {on['d2']['main']['value']:,}동). " + T(*ONALL),
    table=[['질문', '지도 색', '꼬리표']] + [[on[k]['q'], {'density': '㎢당 밀도', 'ratio': '비율', 'count': '개수', 'dev': '평균과의 차이'}[on[k]['map']['meaning']], f"{on[k]['tags']}곳"] for k in ('d1', 'd2', 'd3', 'd4', 'd5')]))
A.append(dict(id='고치기칸', t='그 자리 고치기 칸 — 삭제 · 클래스 바꾸기 · 수정 · 메모 넷', shots=[S('old-edit-svc'), S('now-edit-svc'), S('old-edit-nat'), S('now-edit-nat'), S('now-edit-ask'), S('now-edit-deleted')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/?test=1', STAFF, '확대 → 객체 누르기 → 삭제 → 되돌리기(시험)']],
    what='서비스 결과와 전국 결과가 같은 칸이고 동작은 넷입니다. 삭제는 한 번 더 묻고, 삭제하면 되돌릴 수 있습니다(시험은 되돌려 두었습니다). ' + OLD('old-edit-svc', 'old-edit-nat') + ' ' + T('now-edit-svc', 'now-edit-nat', 'now-edit-ask', 'now-edit-deleted')))
A.append(dict(id='XI맵-채팅창', t='XI맵 채팅 창 — 위 추천 질문 없음 · 왼쪽 이 화면은 없음', shots=[S('old-xi-first'), S('now-xi-first')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, '첫 화면 아래 가운데']],
    what='입력 줄만 남았습니다. ' + OLD('old-xi-first') + ' ' + T('now-xi-first')))
A.append(dict(id='융합대시보드-디자인', t='융합 대시보드 — 채도를 낮춘 색 · 큰 숫자 · 둥근 막대 · 한 줄 해석', shots=[S('old-fu-d2')] + [S(f'now-fu-{k}') for k in ('d1', 'd2', 'd3', 'd5', 'd6')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "왼쪽 아래 '통계'를 '대시보드'로 바꾸고 아래 표의 질문"]],
    what='숫자 · 고르는 규칙은 그대로이고 모양만 바꿨습니다. ' + OLD('old-fu-d2') + ' ' + T(*[f'now-fu-{k}' for k in ('d1', 'd2', 'd3', 'd5', 'd6')]),
    table=[['질문', '맨 앞 숫자']] + [[fu[k]['q'], fu[k]['kpis'][0]] for k in ('d1', 'd2', 'd3', 'd5', 'd6')]))
A.append(dict(id='공유데이터-상세', t='공유 데이터 — 줄을 누르면 오른쪽에 관리할 내용이 보입니다', shots=[S(x) for x in ('now-sd-img', 'now-sd-img2', 'now-sd-train', 'now-sd-admin', 'now-sd-admin-org', 'now-sd-admin-vw')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터 → 영상 · 학습 데이터 · 행정 자료 탭의 줄']],
    what='영상은 범위 지도와 정보 · 쓰인 곳, 학습 데이터는 라벨 그림 · 클래스별 장수 · 출처, 행정 자료는 지도 · 종류 · 행 수 · 속성 앞 5줄을 보여 줍니다. 정보 고치기 · 삭제는 판 아래에 있습니다. ' + T('now-sd-img', 'now-sd-img2', 'now-sd-train', 'now-sd-admin', 'now-sd-admin-org', 'now-sd-admin-vw')))
A.append(dict(id='EOx-모두교체', t='로그인 · 메인 · 세계 지도 · 해외 첫 화면 바탕을 상업 이용이 되는 영상으로 바꿨습니다', shots=[S('old-login'), S('now-pub-login'), S('old-main'), S('now-pub-main'), S('old-world'), S('now-world'), S('old-ov-eox'), S('now-ov-landing')], opts=DONE,
    where=[[APP + '/landxi/v3/login/', '로그인 없이 열림', '로그인 바탕 · 메인'], [APP + '/landxi/v3/global/', STAFF, '세계 지도'], [OVS + '/', OV, '로그인 → 해외 첫 화면']],
    what='세계 낮은 줌은 NASA Blue Marble, 해외는 Sentinel-2 입니다. 비상업 영상을 부르는 화면은 이제 없습니다. 짝마다 앞이 옛 그림, 뒤가 지금입니다. ' + OLD('old-login', 'old-main', 'old-world', 'old-ov-eox') + ' ' + T('now-pub-login', 'now-pub-main', 'now-world', 'now-ov-landing')))
A.append(dict(id='ChatGEO-매주', t='XI ChatGEO 개선이 매주 저절로 돕니다 — 새 판은 승인 대기까지', shots=[], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', ADM, '배포 → 개선 후보 맨 위 줄(새 판이 생기면 승인 요청)']],
    what='매일 새벽 2시에 깨어나 월요일이면 한 바퀴를 돕니다. 못 알아들은 질문이 10건 넘게 모이면 앞당깁니다. 나아지고 나빠진 질문이 없을 때만 승인 요청으로 올리고, 나아지지 않으면 올리지 않고 거둡니다. 승인은 관리자가 합니다. 첫 정기 바퀴는 10월 19일(월) 02:00입니다.'))
A.append(dict(id='글자크기-표준', t='글자 크기를 일곱 단계로 정리 — 14 미만 없음 · 대시보드는 한 단계 더 크게', shots=[S('old-font-staff-dash'), S('now-staff-dash'), S('old-font-staff-2560'), S('now-staff-dash-2560'), S('old-font-admin-dash'), S('now-admin-dash'), S('old-font-gov-dash'), S('now-gov-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드'], [ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드'], [ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '서비스 대시보드']],
    what='그전에는 글자 크기가 24가지였고 화면 글의 40%가 14px 보다 작았습니다. 이제 14 · 15 · 16 · 20 · 28 · 32 · 80 일곱 단계만 쓰고, 대시보드 메인은 한 단계 더 큽니다. 짝마다 앞이 옛 그림, 뒤가 지금입니다. ' + OLD('old-font-staff-dash', 'old-font-staff-2560', 'old-font-admin-dash', 'old-font-gov-dash') + ' ' + T('now-staff-dash', 'now-staff-dash-2560', 'now-admin-dash', 'now-gov-dash')))
A.append(dict(id='글자크기-나머지', t='XI맵 · 관리자 공유 데이터 · 지도 영상 출처 글까지 같은 단계로 — 전국 큰 숫자 64 → 80', shots=[S('old-xi-first'), S('now-xi-first'), S('now-sd-img')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 첫 화면'], [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터']],
    what=f"이번 그림에서 전국 큰 숫자({big_first}개)를 재니 80입니다. 융합 대시보드 표의 업무 이름이 글자 중간에서 꺾이던 것도 고쳤습니다. " + OLD('old-xi-first') + ' ' + T('now-xi-first', 'now-sd-img'),
    table=[['글', '전', '후'], ['XI맵 전국 큰 숫자', '64', '80'], ['공유 데이터 표 머리 · 입력 라벨', '13', '14–15'], ['공유 데이터 화면 제목', '22', '28'], ['지도 아래 영상 출처', '12', '14']]))
A.append(dict(id='글자크기-검사기', t='작은 글자가 다시 생기지 않게 글자 크기 검사기를 만들었습니다', shots=[S('now-staff-dash'), S('now-on-d2-fill')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '검사가 보는 화면 예']],
    what='화면에 보이는 글마다 크기를 재서 14px 보다 작은 글이나 일곱 단계 밖 크기가 하나라도 있으면 실패로 알립니다. 주요 화면 27개 × 다섯 해상도가 모두 통과했습니다(구현 때 결과). ' + T('now-staff-dash', 'now-on-d2-fill')))
A.append(dict(id='삭제-말통일', t="지우는 동작의 말을 모든 화면에서 '삭제' 하나로 맞췄습니다", shots=[S('now-edit-ask'), S('now-edit-deleted')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/?test=1', STAFF, '객체 → 삭제'], [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터 · 배포 신청']],
    what='XI맵 · 배포 신청서 · 공유 데이터 · 프로젝트 기록 · 요청함 · 촬영 요청 · 조건 칩의 단추와 알림이 모두 삭제 한 말입니다. ' + T('now-edit-ask', 'now-edit-deleted')))
A.append(dict(id='해외첫화면-고침', t='해외 기관 첫 화면 — 지역에 닿으면 큰 숫자와 Run this season 이 바로 섭니다', shots=[S('old-ov-landing'), S('now-ov-loading'), S('now-ov-landing'), S('now-ov-season'), S('now-ov-ndvi'), S('now-ov-register'), S('now-ov-chat')], opts=DONE,
    where=[[OVS + '/', OV, '해외 기관 로그인 → 첫 화면(Kyrgyzstan › Ysyk-Ata) · 계절 바꾸기 · NDVI · Register · XI ChatGEO']],
    what='전에는 지역에 닿은 뒤 약 11초 동안 큰 숫자 자리가 비어 있었고 Run 은 꺼져 있었습니다. 지금은 닿자마자 둘이 함께 섭니다. ' + OLD('old-ov-landing') + ' ' + T('now-ov-loading', 'now-ov-landing', 'now-ov-season', 'now-ov-ndvi', 'now-ov-register', 'now-ov-chat'),
    table=[['', '전', '지금(이번에 잰 값)'], ['지역에 닿은 뒤 큰 숫자', '약 11초 비어 있음', '닿자마자(0초)'], ['Run this season', '꺼져 있음', '닿자마자 켜짐'], ['같은 지역 큰 숫자', '볼 때마다 다름(117.9 · 100.2㎢)', f"{ovf['v']}㎢ · 다시 열어도 {ovr['v']}㎢ · XI ChatGEO 답도 같은 값"],
           ['로그인 → 지역에 닿기', '—', sec(ovf['arrive_ms']) + '(지구본 → 나라 → 지역 비행 포함)'], ['다시 열기 → 큰 숫자', '—', sec(ovr['big_ms'])]]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=A))

B = []
B.append(dict(id='재검수-바퀴14', t='모든 화면 기능 90개를 다시 눌러 봤습니다 — 안 되던 것은 고쳤습니다', shots=[S('now-ov-chat'), S('now-xi-filter'), S('now-admin-req'), S('now-gov-dash'), S('now-sd-train')], opts=OK,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "XI맵 → '비닐하우스만 보여 줘' · '원래대로'"], [ADMIN + '/landxi/v3/ops-core/#/approvals', ADM, '요청 관리 · 공유 데이터'], [ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '남원 기관'], [OVS + '/', OV, '해외 기관']],
    what=f"모두 됩니다. 고친 것: 해외 XI ChatGEO 가 '작황이 얼마나 떨어졌나'에 큰 숫자와 같은 값으로 답합니다(지금 큰 숫자 {ovf['v']}㎢ · 답 {re.search(r'[0-9.]+ km', LOG['_ov_chat']).group(0)}²). 지우는 동작의 옛 말도 모두 '삭제'로, 융합 대시보드 표 머리는 낱말 사이에서만 꺾이게, 대시보드 → 데이터 올리기의 화면 오류는 없앴습니다. " + T('now-ov-chat', 'now-xi-filter', 'now-admin-req', 'now-gov-dash', 'now-sd-train'),
    table=[['화면', '확인한 기능'], ['LX 직원', '17'], ['XI맵', '14'], ['LX 관리자', '20'], ['남원 기관', '14'], ['메인', '5'], ['해외 기관', '20'], ['합계', '90']]))
B.append(dict(id='속도-바퀴14', t='느린 화면을 재서 줄였습니다 — 관리자 탭 · 기관 보고서 · 로그인', shots=[S('now-admin-dash'), S('now-sd-img')], opts=OK,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '관리자 인프라 · 기관 · 배포 · 공유 데이터 탭'], [ORG + '/landxi/v3/gov-report/?tab=report', GOV, '보고서']],
    what="화면마다 처음 열 때와 다시 열 때를 재서 느린 곳을 고쳤습니다. 화면 모양 · 문구는 그대로입니다. 남은 것은 기관 지도 · 해외 첫 화면 · XI맵 첫 화면입니다. " + T('now-admin-dash', 'now-sd-img'),
    table=[['화면(처음 · 다시)', '전', '후'], ['관리자 탭 15곳 불러오는 중', '2.3~4.7 · 2.3~5.7초', '0~2.6 · 0~3.1초'], ['기관 보고서', '7.5 · 2.2초', '3.0 · 1.6초'], ['로그인', '3.7 · 2.5초', '3.1 · 2.3초'], ['학습데이터 구축', '5.3 · 2.8초', '3.8 · 2.7초']]))
B.append(dict(id='기관XI맵-속도', t="기관에서 XI맵을 열 때 '불러오는 중'이 한 번만 뜨고, 다시 열면 3초 안팎으로 빨라졌습니다", shots=[S('now-gov-ximap')], opts=OK,
    where=[[ORG + '/landxi/v3/xi-clean/?service=card-farm', GOV, '내 서비스 → 서비스 대시보드 → 결과 지도'], [APP + '/landxi/v3/xi-clean/', STAFF, 'LX 직원 XI맵에도 같은 고침']],
    what=f"관할로 날아간 뒤 결과를 다시 받던 것을 없애고 처음부터 그 자리에서 열며, 요청을 함께 보내고 10분 보관합니다. 이번 굽기에서 다시 재니 처음 {gx[0]}초 · 다시 {gx[1]}초였습니다(작업 때와 재는 법이 조금 달라 참고 값). " + T('now-gov-ximap'),
    table=[['남원 기관 XI맵', '전', '후(작업 때)', '이번에 다시 잼'], ['처음 열기', '7.4초', '6.7초', f'{gx[0]}초'], ['다시 열기', '6.3초', '3.0초', f'{gx[1]}초'], ["'불러오는 중'이 뜬 횟수", '두 번', '한 번', '—']]))
items.append(dict(section='B. 재검수 결과', desc='전수 재검수와 속도 개선 결과입니다. 확인을 눌러 주세요.', items=B))

C = []
C.append(dict(id='해외-학습데이터', t='해외 학습 데이터 — Sentinel-2 위성으로 경작지 · 휴경 · 시가지 확장부터 쌓을까', shots=[S('now-ov-landing'), S('chips-sample')], opts=['이대로 시작', '다시'],
    where=[[OVS + '/', OV, '해외 기관 첫 화면(지금)']],
    now='지금 해외는 우리 모델 없이 공개 판정을 군 41곳 · 구획 696곳 비율로 보여 줍니다. 고치기 · 대시보드 · 나라 전체 분석이 없습니다. 소쿨룩 평야 553㎢로 재 보니 작은 모델이 공개 정답과 경작지 맞춤 정도 0.95로 맞았고, 조각 300장부터는 더 늘어도 거의 같았습니다. 두 시기를 함께 쓰면 한 시기보다 낫습니다. 아래 둘째 그림은 영상 · 정답 · 예측 조각 예시입니다(측정 때 만든 그림 · 찍은 시각 10월 15일 ' + hm('chips-sample').replace(':', ':') + ').',
    prop='1단계(약 1주): 농경 주 7곳 · 약 3,000조각 · 현장 확인 표본 200점 → 경작지 · 시가지 · 물 모델 → 나라 전체 분석 → XI맵 해외 결과를 우리 모델로. 2단계: 휴경 · 두 해 변화 · 고치기. 3단계: 작물 종류(밀 · 보리 · 옥수수 · 감자)는 현장 라벨을 주셔야 합니다.',
    table=[['모델', '입력', '학습 조각', '경작지 맞춤 정도'], ['지수 규칙', '두 시기', '—', '0.63'], ['화소 부스팅', '한 시기', '922', '0.84'], ['화소 부스팅', '두 시기', '922', '0.89'], ['작은 모델', '두 시기', '100', '0.93'], ['작은 모델', '두 시기', '300', '0.95'], ['작은 모델', '두 시기', '922', '0.95']]))
C.append(dict(id='해외-퍼포먼스', t='해외도 국내 XI맵처럼 — A안 살아 있는 나라 지도 · B안 융합 대시보드', shots=[S('now-ov-landing'), S('mock-ov-a-fill'), S('mock-ov-a-full'), S('mock-ov-a-change'), S('mock-ov-a-ask'), S('mock-ov-a-dash'), S('mock-ov-b-board')], opts=['A안', 'B안', '다시'],
    where=[[APP + '/landxi/proto/review/mock/overseas-perf/', '로그인 없이 열림 · 시안', "위 단추로 A안 · B안 · A안은 지도 오른쪽 그림의 2021 · 2025 · 바뀐 곳, 아래 '묻기' → '대시보드로'"]],
    now='첫 그림이 지금 해외 첫 화면입니다. 시안 숫자는 실제 값(군 41곳 · 소쿨룩 실측 · 으슥아타 달별 초록 정도)이고, 차오름 순서 · 고치기 저장 · ChatGEO 답 문구는 예시 동작입니다. ' + T('now-ov-landing', 'mock-ov-a-fill', 'mock-ov-b-board'),
    prop='A안은 군이 하나씩 차오르고 말로 묻고 그림을 눌러 고치고 두 해를 넘나드는 지도, B안은 숫자 · 지도 · 달력 · 두 해 비교 · 고치기 · 대화를 한 판에 둔 대시보드입니다. 권하는 것: XI맵은 A안, 대시보드로 여는 판은 B안 모양(국내와 같은 길).'))
C.append(dict(id='XI맵-결과표시', t='XI맵 왼쪽 위 분석 결과 표시 — 지금 · ⓐ 작은 판 · ⓑ 채팅 창 위 띠', shots=[S('now-xi-first'), S('mock-xi-va-national'), S('mock-xi-va-task'), S('mock-xi-va-region'), S('mock-xi-vb-national'), S('mock-xi-vb-task'), S('mock-xi-vb-region')], opts=['ⓐ', 'ⓑ', '지금대로', '다시'],
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "왼쪽 아래 '시안 · 지금 · ⓐ · ⓑ' 단추 · 업무를 누르면 그 업무만"]],
    now="지금은 왼쪽 위에 큰 숫자와 업무 줄이 있습니다(첫 그림). 아래 여섯 장은 같은 실제 화면에 시안 단추를 눌러 찍은 것입니다. " + T('now-xi-first', 'mock-xi-va-national', 'mock-xi-vb-region'),
    prop="ⓐ 작은 판(숫자 하나 + 업무 색 점 줄) · ⓑ 채팅 창 위 얇은 띠(업무별 수). 숫자는 지금 모양과 같은 장부입니다."))
items.append(dict(section='C. 시안 · 결정', desc='시안과 방향을 골라 주세요.', items=C))

D = []
D.append(dict(id='메뉴칸-넓히기', t='왼쪽 메뉴 칸을 조금 넓힐까', shots=[S('now-staff-dash'), S('now-sd-img')], opts=['넓힘', '그대로'],
    where=[[APP + '/landxi/v3/lx-console/', STAFF, "왼쪽 메뉴 '지도 서비스'"], [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, "왼쪽 메뉴 '공유 데이터'"]],
    now="글자가 커져 '지도 서비스' · '공유 데이터'가 두 줄로 꺾입니다. " + T('now-staff-dash', 'now-sd-img'), prop='메뉴 칸을 72 → 80 으로 넓히면 한 줄로 들어갑니다.'))
D.append(dict(id='밀도-색기준', t='XI맵 지도 위 통계 — ㎢당 밀도 색 기준을 조정할까', shots=[S('now-on-d2-fill')], opts=['조정', '그대로'],
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "'남원시 비닐하우스 어디가 많아?'"]],
    now='시내 동 하나가 최댓값이라 나머지 읍면이 옅게 보입니다. ' + T('now-on-d2-fill'), prop='단계 색 기준을 낮춰 읍면 사이 차이가 보이게 합니다.'))
D.append(dict(id='해외-바로지역', t='해외 첫 화면 — 두 번째 방문부터 바로 지역으로 열까', shots=[S('now-ov-loading'), S('now-ov-landing')], opts=['바로 지역', '그대로'],
    where=[[OVS + '/', OV, '해외 기관 로그인 → 첫 화면']],
    now=f"열 때마다 지구본 → 나라 → 지역으로 날아가며 약 {round(ovr['big_ms'] / 1000)}초가 걸립니다(이번에 잰 값 {sec(ovr['big_ms'])}). " + T('now-ov-loading', 'now-ov-landing'), prop='두 번째 방문부터는 바로 지역에서 엽니다.'))
D.append(dict(id='해외-대장칠', t='해외 화면 — 구역 대장 어긋남 빨간 칠을 대장 탭에서만 보일까', shots=[S('now-ov-register'), S('now-ov-season-red')], opts=['대장 탭에서만', '그대로'],
    where=[[OVS + '/', OV, 'Register 탭에서 대장 올리기 → Season 탭으로 돌아오기']],
    now='계절 탭에서도 빨간 칠이 켜져 있어 작황 하락 칠을 가립니다(둘째 그림). ' + T('now-ov-register', 'now-ov-season-red'), prop='대장 탭에서만 보이고, 다른 탭에서는 작황 하락 칠이 보입니다.'))
D.append(dict(id='기관XI맵-가벼운타일', t='기관 XI맵 처음 열기 — 먼 축척용 가벼운 결과 조각을 만들까', shots=[S('now-gov-ximap')], opts=['만듦', '안 만듦'],
    where=[[ORG + '/landxi/v3/xi-clean/?service=card-farm', GOV, '내 서비스 → 서비스 대시보드 → 결과 지도']],
    now=f"처음 열 때 4~7초, 다시 열 때 3초입니다(이번에 잰 값 {gx[0]} · {gx[1]}초). " + T('now-gov-ximap'), prop='결과 파일에 먼 축척용 가벼운 조각을 더하면 처음도 3초 안입니다.'))
items.append(dict(section='D. 새 질문', desc='새로 여쭙는 다섯 가지입니다.', items=D))
json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(SH, 'mp4name.txt'), 'w').write(MP4)
print('항목', [len(x['items']) for x in items], MP4)
