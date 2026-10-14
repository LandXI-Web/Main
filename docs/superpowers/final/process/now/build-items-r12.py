"""바퀴 12 now 항목 JSON 만들기 — 그림 파일 이름 뒤 시각은 shots-r12 폴더에서 찾는다. 사용: python build-items-r12.py shots-r12
숫자는 굽는 순간 읽은 값(log.json — 화면 글)에서 그대로 옮긴다. 카드 문구는 짧게."""
import glob, json, os, re, sys
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
NOW = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process', 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
ORG = 'https://namwon.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
IMG = APP + '/landxi/proto/review/confirm/now/img/'
M = APP + '/landxi/proto/review/mock/'


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].png')))
    assert f, base
    return os.path.basename(f[-1])


def T(*bases):
    ts = [S(b)[-8:-6] + ':' + S(b)[-6:-4] for b in bases]
    a, z = min(ts), max(ts)
    return f'(그림 찍은 시각 10월 14일 {a}' + ('' if a == z else f'–{z}') + ')'


first = LOG['_xi_first']['hud']
total = re.search(r'([\d,]+)개', first).group(1)
pin = LOG['_xi_press']['pin'].split('\n')
pin = [x for x in pin if x.strip()]
city = pin[0]
rows = {pin[i]: pin[i + 1] for i in range(1, len(pin) - 1, 2)}
task_row = LOG['_xi_task']['task']
chat_hud = LOG['_xi_chat']['hud']
chat_n = re.search(r'([\d,]+)동', chat_hud).group(1)
sd_img = LOG['_sd_img_head']
assert '83장' in sd_img
n_train, n_ledger = len(LOG['_sd_train']), len(LOG['_sd_admin']) - 4
DONE = ['완료', '다시']
items = []

items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='이번 페이지의 지금 화면 네 장',
    shots=[S('now-xi-first'), S('now-xi-press'), S('now-sd-train'), S('now-staff-dash')], opts=['확인'],
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 첫 화면 → 시군구 누르기 · LX 직원 대시보드'],
           [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터 → 학습 데이터 탭']],
    what='XI맵 첫 화면(전국 · 업무 기본 없음) · XI맵 시군구 누름(말풍선) · 관리자 공유 데이터 학습 데이터 탭 · LX 직원 대시보드입니다. '
         + T('now-xi-first', 'now-xi-press', 'now-sd-train', 'now-staff-dash'))]))

impl = []
impl.append(dict(id='XI맵-3차구조', t='XI맵 — 처음부터 모든 결과가 함께 · 시군구를 누르면 말풍선 · 오른쪽 아래 줄 없음',
    shots=[S('now-xi-first'), S('now-xi-press'), S('now-xi-task')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, '전국 첫 화면 → 시군구 올리기 · 누르기 → 말풍선 업무 줄 누르기 → 원래대로'],
           [IMG + 'ximap-15s.mp4', '로그인 없이 열림 · 영상 15초(10월 14일 08:32 녹화)', '전국 → 시군구 올림 → 누름 → 업무 줄 → 원래대로']],
    what=f'첫 화면에 업무 이름 없이 모든 결과가 함께 보입니다(AI 분석 결과 {total}개 · 서비스 7가지). 시군구를 누르면 내려가 말풍선이 뜹니다({city} 토지피복 {rows["토지피복"]} · 경작지 {rows["경작지(농지 전수)"]} · 건물 {rows["건물(하천 · 계곡)"]}). 말풍선 업무 줄을 누르면 그 업무만 남고, 원래대로로 모두 돌아옵니다. '
         + T('now-xi-first', 'now-xi-press', 'now-xi-task')))
impl.append(dict(id='XI맵-말로거르기', t="XI ChatGEO '비닐하우스만 보여 줘' — 그 업무 결과만 지도에",
    shots=[S('now-xi-chat')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, "오른쪽 아래 XI ChatGEO → '비닐하우스만 보여 줘' → '원래대로'"]],
    what=f"답은 '비닐하우스만 지도에 남겼습니다 — AI 분석 결과 {chat_n}동.'이고, 지도 왼쪽 위 숫자도 같은 {chat_n}동입니다. " + T('now-xi-chat')))
impl.append(dict(id='공유데이터-탭', t='LX 관리자 공유 데이터 — 영상 · 학습 데이터 · 행정 자료 세 탭',
    shots=[S('now-sd-img'), S('now-sd-train'), S('now-sd-admin')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '왼쪽 메뉴 맨 아래 공유 데이터 → 탭 셋']],
    what=f'영상 탭은 영상 83장(올리기 · 정보 고치기 · 공개/비공개 · 지우기), 학습 데이터 탭은 올린 묶음 {n_train}줄(공개/비공개), 행정 자료 탭은 브이월드 층 4가지와 기관 대장 {n_ledger}줄(읽기만)입니다. 탭을 바꿔도 칸 자리가 같습니다. '
         + T('now-sd-img', 'now-sd-train', 'now-sd-admin')))
impl.append(dict(id='비공개-기관공유', t='비공개로 내린 영상은 기관 목록에서도 빠집니다',
    shots=[S('now-sd-img')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '영상 탭 → 공개 칸 누르기'],
           [ORG + '/landxi/v3/gov-request/', '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)', '요청하기의 영상 목록']],
    what='관리자가 비공개로 내리면 기관 지도 영상 · 요청하기 영상 목록 · 관리자 기관 공유 목록에서 모두 빠지고, 다시 공개하면 돌아옵니다. 아래 표는 10월 14일 07:15~07:16에 영상 하나(남원 2023년 항공)로 시험한 값이고, 시험 뒤 원래대로 공개해 두었습니다. 그림은 영상 탭의 공개 칸입니다. ' + T('now-sd-img'),
    table=[['', '요청하기 영상 목록', '기관 지도 영상 층', '관리자 기관 공유 목록'],
           ['비공개 전', '10개 · 있음', '있음', '11개 · 있음'],
           ['비공개 뒤', '9개 · 없음', '없음', '10개 · 없음'],
           ['다시 공개 뒤', '10개 · 있음', '있음', '—']]))
impl.append(dict(id='바깥주소-502', t="바깥 주소 '502' 고침 — 요청하기 화면이 가끔 끊기던 것",
    shots=[], opts=['확인'],
    where=[[ORG + '/landxi/v3/gov-request/', '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)', '요청하기 화면이 끊기지 않고 열림']],
    what='원인: 터널과 관문 사이에서 연결을 닫는 시간이 서로 달라, 잠깐 쉬었다가 보내는 첫 요청이 가끔 끊겼습니다. 고친 것: 관문이 연결을 터널보다 늦게 닫도록 바꿨습니다.'))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=impl))

fu = [S('mock-fu-first'), S('mock-fu-mean'), S('mock-fu-dash1'), S('mock-fu-pick'), S('mock-fu-dash2')]
items.append(dict(section='B. 시안 · 결정', desc="아직 만들지 않은 시안입니다(그림에 '시안' 표시). 고르신 것만 만듭니다.", items=[
    dict(id='XI맵-융합대시보드', t='XI맵 융합 대시보드 — 말하면 XI ChatGEO 가 뜻을 확인하고, 화면이 대시보드로 바뀝니다 (시안)',
         shots=fu, opts=['이대로 구현', '다시'],
         where=[[M + 'ximap-fusion/index.html', '시안 · ' + STAFF + ' (시안 안 로그인 칸)', '아래 질문 두 개를 눌러 보고, 읍면동 막대를 눌러 보세요'],
                [IMG + 'fusion-10s-0729.mp4', '로그인 없이 열림 · 영상 10초(10월 14일 07:29 녹화 시안)', '질문 → 대시보드 → 막대 누름 → 지도로 → 두 번째 질문']],
         now='AI 분석 결과 · 지적 정보 · 실시간 정보를 합쳐 보여 줍니다. 두 예: 남원시 농지 이용(휴경 · 전용 의심 15,651필지 · 현장 확인 필요 1,037필지), 어제 호우 × 비닐하우스. 막대를 누르면 지도와 표가 그 읍면동으로 갑니다. 그림 속 숫자는 서버 값이고, 강수 · 답 문구는 예시 동작입니다.',
         prop='이대로 구현하면 지금 XI맵 위에 이 대시보드 전환을 만듭니다. ' + T(*[b for b in ('mock-fu-first', 'mock-fu-dash2')])),
    dict(id='XI맵-융합-키', t='실시간 정보 — 기상 · 재난 · 대장 변화는 공공 인증키가 필요합니다',
         shots=[], opts=['키 신청(기상청 API허브 · 공공데이터포털 · 재난안전데이터공유플랫폼)', '키 오기 전 키 없는 공개 기상 자료로 먼저', '나중에'],
         where=[],
         now='키 없이 되는 것은 공개 기상 자료(해외 · 비공식)뿐입니다. 기상청 특보 · 관측, 건축물대장 · 인허가 · 토지 이동, 재난문자, 산불은 키가 필요합니다.',
         prop='키는 신청하셔야 합니다. 받으면 서버 설정에 넣어 붙입니다.')]))

items.append(dict(section='C. 질문', desc='새로 여쭙는 두 가지입니다.', items=[
    dict(id='해외바탕-교체', t='XI맵 해외 바탕 영상을 바꿀까', shots=[S('now-xi-first')], opts=['바꿈', '그대로'],
         where=[[APP + '/landxi/v3/xi-clean/', STAFF, "XI맵 오른쪽 위 '키르기스탄' 버튼"]],
         now='지금 해외 바탕(EOxCloudless)은 비상업 라이선스라, 해외 기관 서비스에 쓰면 유료 계약이 필요합니다.',
         prop='무료이고 상업 이용도 되는 Sentinel-2 원 자료로 만든 모자이크(10m)로 바꿉니다.'),
    dict(id='공개칸-이름', t="공유 데이터 영상 표의 칸 이름 '직원에게' → '공개'로 바꾼 것", shots=[S('now-sd-img')],
         opts=["'공개' 그대로", "'직원에게'로 되돌림"],
         where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '영상 탭 → 칸 이름']],
         now="비공개가 기관에도 적용되어 칸 이름을 '공개'로 바꿨습니다.",
         prop="'공개'가 맞으면 그대로 두고, 아니면 '직원에게'로 되돌립니다.")]))

json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', sum(len(x['items']) for x in items), [len(x['items']) for x in items])
