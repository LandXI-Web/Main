"""바퀴 7 now 항목 JSON 만들기 — 그림 파일 이름 뒤 시각은 shots 폴더에서 찾는다. 사용: python build-items-r7.py shots-r7"""
import glob, json, os, sys
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
NOW = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process', 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
NOLOGIN = '로그인 없음(시안 · 서버 호출 없음)'
IMG = APP + '/landxi/proto/review/confirm/now/img/'
M = APP + '/landxi/proto/review/mock/'


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].png')))
    assert f, base
    return os.path.basename(f[-1])


def T(*bases):
    ts = [(lambda f: f[-8:-6] + ':' + f[-6:-4])(S(b)) for b in bases]
    a, z = min(ts), max(ts)
    return f'(그림 찍은 시각 10월 12일 {a}' + ('' if a == z else f'–{z}') + ')'


def P(f):   # 설계 그림 — 파일이 있어야 함
    assert os.path.exists(os.path.join(SH, f)), f
    return f


def W(f, note='그림을 크게 열어 보세요'):
    return [[IMG + f, '로그인 없이 열림 · 그림', note]]


DONE = ['완료', '다시']
items = []

items.append(dict(section='한눈에', desc='이번에 무엇을 보고 답하시면 되는지입니다. 그림은 이번에 새로 찍은 지금 화면입니다.', items=[dict(
    id='한눈에', t='이번 페이지에 있는 것 — 지금 화면 네 장',
    shots=[S('now-dashboard'), S('now-ximap-glow'), S('after-train-board'), S('now-admin-dashboard')], opts=['확인'],
    where=[[APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드 · XI맵 · 프로젝트의 학습 화면'],
           [ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드(로그인하면 첫 화면)']],
    what='구성: 구현 확인 2(학습 화면 · 불러오는 중) · 결정 시안 3(대시보드 6차 · 진행 현황 칸 수 · 학습 서식) · 코어와 전국 결과 12(맨 앞 구조 한눈에 포함). 구현 확인은 답하신 것을 만든 것이고, 시안은 아직 만들지 않은 모습입니다. 위 그림은 LX 직원 대시보드 · XI맵 전국 · 학습 화면 · LX 관리자 대시보드의 지금 모습입니다. ' + T('now-dashboard', 'now-admin-dashboard'))]))

items.append(dict(section='구현 확인 — 이번 바퀴', desc='답하신 것을 만든 것입니다. 열어 보시고 완료 또는 다시를 골라 주세요. 그림은 지금 바깥 주소 화면입니다.', items=[
    dict(id='학습-작업흐름-v3', t='프로젝트 학습 화면 — AI 모델 작업 흐름(흐름 판 · 반복마다 정확도 · 학습 이력)',
         shots=[S('after-train-board'), S('after-train-full'), S('after-train-drawer')], opts=DONE,
         where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 '비닐하우스 2026'을 열고 위 단계 막대의 '학습'"],
                [APP + '/landxi/v3/lx-project/', STAFF, '학습 설정 블록을 누르면 오른쪽에 서랍이 열림(닫으면 사라짐)']],
         what="시안 '학습 작업 흐름 3차'를 그대로 옮겼습니다. ① 흐름 판: 이 프로젝트의 가장 최근 학습을 블록 여섯(학습 데이터 · 기반 모델 · 학습 설정 → 학습 → 평가 → 배포 신청)으로 그리고, 위 칩에서 블록을 더하고, 출구 ○ 를 누른 뒤 다음 블록을 누르면 선이 이어집니다. 같은 블록을 여러 개 놓을 수 있고 D 는 복제, Del 은 지우기입니다. ② 이번 학습: 반복마다 정확도 그래프 하나와 핵심 수치 여섯 줄(지난 판과의 겹침은 없습니다). ③ 학습 이력 목록: 날짜 · 판 · AI 모델 정확도 · 학습 데이터 n장 · 상태. 숫자는 모두 모델 장부와 학습 기록 값입니다(학습 데이터 35,247장 · 학습 끝 검증 90% · 같은 검증 묶음 87% · 원판 91%보다 낮아 후보로 남음). 시안과 다른 점: 실제 공개 서비스가 쓰는 모델은 원판(89%)이라 '서비스 중'은 원판 줄에 붙었고, 판 이름은 순서대로(세 번째 판) 짓습니다. 한 번의 학습에는 학습 데이터 블록을 하나만 이을 수 있습니다. 학습 장비는 LX 관리자가 배정합니다(고르는 자리 없음). 학습은 이번에 돌리지 않았습니다. " + T('after-train-board', 'after-train-drawer')),
    dict(id='불러오는중', t="오래 걸리면 가운데 '불러오는 중' — 글은 한 마디 · 0.4초 안에 끝나면 안 보임",
         shots=[S('after-loading-train')], opts=DONE,
         where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 → '학습' — 응답이 늦으면 가운데에 점 셋 + '불러오는 중'(그림은 이 시험에서만 응답을 1.5초 늦춰 찍음)"],
                [APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 처음 열기 · 날아간 뒤 결과가 아직일 때'],
                [APP + '/landxi/v3/lx-analyze/', STAFF, '분석하기 자세히 — 영상 목록 · 조건 확인 · 분석 시작']],
         what="이미 있던 가운데 로딩 판(청록 점 셋 + 작은 글 한 줄)을 그대로 썼고 새 모양은 없습니다. 0.4초 안에 끝나는 기다림은 보이지 않고, 글은 언제나 '불러오는 중' 한 마디입니다. XI맵 덧말('지역 경계와 분석 집계 불러오는 중' 등)도 '불러오는 중' 한 마디로 바뀝니다. 무엇을 기다리는지는 화면 속에만 남깁니다. 새로 건 곳: 학습 화면 첫 열기 · XI맵이 날아간 뒤 결과가 아직일 때 · 지도 서비스에서 층을 켜고 날아간 뒤 · 분석하기 영상 목록 · 조건 확인 · 분석 시작. 바탕 지도는 기다리지 않습니다. 결과가 끝내 오지 않아도 15초 뒤에는 표시를 놓고, 6초가 넘으면 원래처럼 '서버 응답이 늦습니다 · 다시 시도'가 나옵니다. XI맵은 이제 빨리 열려 평소에는 이 판이 보이지 않아, 그림은 학습 화면으로 대신합니다. " + T('after-loading-train'))]))

dec = []
dec.append(dict(id='대시보드-v6', t="LX 직원 대시보드 6차 — 위에서 아래로 한 줄기로 — 이대로 구현할까 (시안)",
    shots=[S('now-dashboard'), S('mock-dash6'), S('mock-dash6-full'), S('mock-dash6-grid-hover')], opts=['이대로 구현', '다시'],
    where=[[M + 'staff-dash-6/index.html', NOLOGIN, '시안 — 격자 칸에 올려 보기 · 주소 끝에 ?stages=6 을 붙이면 진행 현황이 여섯 칸']],
    now="5차 시안은 왼쪽 격자 · 가운데 진행 현황 + 저장 용량 · 오른쪽 작업 + 요청함 + 공지 + 메모 세 줄기였습니다. 사용자: '너무 왼쪽 오른쪽으로 배치 했네. 위 아래로 배치하는걸로 좀 해야될 것 같다.' 지금 실제 대시보드는 첫 그림처럼 한 줄 다섯 칸이고 아래 반이 빕니다.",
    prop="줄마다 전체 폭으로 위에서 아래로 놓았습니다. ① 내 분석 결과 9건 3×3 격자(칸은 가로로 넓게 · 결과 그림의 가운데 띠 그대로) → ② 프로젝트 진행 현황을 가로 흐름으로(단계 칸 한 줄 · 연결선 위 마디 점 · 일이 있는 단계로 빛 점) → ③ 내가 돌린 작업 · 요청함(숫자 칸이라 한 줄에 나란히) → ④ 저장 용량(도넛 · 프로젝트별 · 할당 대비 막대를 가로로 낮게) → ⑤ 공지 · 메모(두 줄 나란히) · 전국 AI 현황(지도 + 범례) · 최근 프로젝트(네 칸 한 줄). '오늘 할 일' 없음. 칸 모양 · 글 · 움직임은 5차 그대로이고 배치만 바뀌었습니다. 모든 숫자는 서버 값(오늘 오전에 읽은 값)이고 메모 본문만 시안입니다. " + T('now-dashboard', 'mock-dash6')))
dec.append(dict(id='진행현황-다섯칸', t="대시보드 '진행 현황'에서 '결과 확인' 칸을 빼고 다섯 단계로 할까 (시안)",
    shots=[S('mock-dash6-stages5'), S('mock-dash6-stages6')], opts=['ⓐ 빼고 다섯 칸', 'ⓑ 그대로 둠'],
    where=[[M + 'staff-dash-6/index.html', NOLOGIN, "진행 현황 머리의 '다섯 칸 · 여섯 칸' 단추로 비교"],
           [M + 'staff-dash-6/index.html?stages=6', NOLOGIN, '주소 끝 ?stages=6 으로 열면 여섯 칸부터']],
    now="'결과 확인' 칸이 이제 늘 0입니다. 결과 확인이 더는 진행을 막는 단계가 아니기 때문입니다. 지금 실제 화면은 여섯 칸입니다(첫 칸 '프로젝트 진행 현황').",
    prop="ⓐ 빼고 다섯 칸(데이터 올리기 · 학습데이터 구축 · 학습 · 추론 · 배포 신청) — 늘 0인 칸이 없어 깔끔합니다. ⓑ 그대로 두면 프로젝트 단계 막대와 이름이 같아지지만 0이 계속 보입니다. 정해지면 하나만 남깁니다. " + T('mock-dash6-stages5', 'mock-dash6-stages6')))
dec.append(dict(id='학습-서식', t="학습 서식 — 직원이 값만 바꾸나, 블록까지 바꾸나 (시안)",
    shots=[S('mock-train-template')], opts=['ⓐ 값만 바꿈', 'ⓑ 블록까지 바꿈', '다시'],
    where=[[M + 'train-template/index.html', NOLOGIN, "그림을 크게 열어 보세요 — 위 '처음 열면 이렇게 놓여 있습니다' 가 서식, 아래 ⓐ ⓑ 가 선택지"]],
    now="지난 물음은 'ⓐ 관리자 서식 + 직원 자유 편집 · ⓑ 서식 없이 자유'였고 사용자: '직원이 뭘 자유롭게 편집한다는 거지?'. 지금 실제 학습 화면에는 기본 흐름 서식이 따로 없고, 처음 판은 그 프로젝트의 학습 기록 그대로입니다.",
    prop="선택지: ⓐ 관리자가 흐름을 정해 두고 직원은 값만 · ⓑ 기본 흐름은 놓여 있고 직원이 블록까지(넣고 빼기 · 여러 개). 서식 = 프로젝트 학습 화면을 처음 열면 이미 놓여 있는 기본 흐름(학습 데이터 → 기반 모델 → 학습 설정 → 학습 → 평가 → 배포 신청). 직원이 바꿀 수 있는 것은 블록을 눌러 서랍에서 고르는 값 — 어느 묶음 · 어느 모델 · 반복 횟수 · 이미지 크기 · 한 번에 몇 장 · 신청 사유. 못 바꾸는 것은 학습 장비 배정 · 상한 · 밤 시간대 · 검증 묶음 · 승인(관리자 영역)입니다. 이번 결정은 '흐름 자체(블록 넣고 빼기 · 같은 블록 여러 개)'를 직원이 해도 되는가입니다. ⓐ는 블록 여섯 고정에 값만, ⓑ는 같은 출발점에서 블록도 더 놓고 빼기. 추천 ⓑ — 10-11 에 말씀한 '블록 여러 개 · 학습 데이터 더 붙이기 · 다른 설정'은 ⓑ에서만 됩니다. 학습 장비 · 상한 · 승인은 어느 쪽이든 관리자입니다. " + T('mock-train-template')))
items.append(dict(section='결정 — 시안', desc="아직 만들지 않은 시안입니다(그림에 '시안' 표시). 고르신 것만 만듭니다.", items=dec))

core = json.load(open(os.path.join(NOW, '..', 'design-r24', 'core-and-national', 'items.json'), encoding='utf-8'))
by = {i['id']: i for i in core}
DES = '(설계 그림 10월 12일 · 시안)'
SH_MAP = {
    '코어-지금구조': ['structure-core.png'],
    '코어-결정-새클래스': ['mock-cases.png'],
    '코어-결정-새클래스모델': ['mock-cases.png'],
    '코어-결정-재학습시작': ['mock-retrain-admin.png'],
    '코어-결정-데이터하우스': ['structure-core.png'],
    '코어-결정-학습단위': ['mock-cases.png'],
    '전국-결과-보기': ['now-ximap-glow', 'mock-ximap-national.png', 'real-emd-faces.png', 'real-closeup.jpg', 'real-nat-map.png'],
    '전국-결과-무엇부터': ['mock-national-range', 'mock-ximap-national.png'],
    '전국-결과-언제': ['mock-retrain-admin.png', 'mock-national-range'],
    '전국-결과-순서': ['mock-national-range'],
    '전국-결과-휴경': ['mock-cases.png'],
    '하천-범위': ['mock-national-range'],
}
WHERE = {
    '코어-지금구조': ('structure-core.png', "그림 — 학습 데이터 → AI 모델 → 분석서비스 → XI맵 결과 → 그 자리 고치기, 끊긴 곳 넷"),
    '코어-결정-새클래스': ('mock-cases.png', '그림 — ① 클래스 줄: 연동 · 단동 / 태양광'),
    '코어-결정-새클래스모델': ('mock-cases.png', '그림 — ③ AI 모델 · ④ 분석서비스 · ⑤ XI맵 결과 줄'),
    '코어-결정-재학습시작': ('mock-retrain-admin.png', "그림 — LX 관리자 '배포' 아래 새 메뉴: 언제 학습하나 · 분석서비스별 · 오늘 밤 순서"),
    '코어-결정-데이터하우스': ('structure-core.png', "그림 — 학습 데이터 칸의 '아직 없는 것'"),
    '코어-결정-학습단위': ('mock-cases.png', '그림 — ② 학습 데이터 줄'),
    '전국-결과-보기': ('mock-ximap-national.png', '그림 — 전국 · 진행 막대 · 확대 둘 / 아래 실측 그림 셋'),
    '전국-결과-무엇부터': ('mock-national-range.png', '그림 — 범위별 걸리는 때(추정)'),
    '전국-결과-언제': ('mock-retrain-admin.png', "그림 — '오늘 밤 순서' 줄"),
    '전국-결과-순서': ('mock-national-range.png', "그림 — '어디부터 돌리나'"),
    '전국-결과-휴경': ('mock-cases.png', '그림 — 새 클래스를 더하는 길(휴경지 클래스를 새로 학습하는 경우)'),
    '하천-범위': ('mock-national-range.png', "그림 — '하천 · 계곡은 어디까지'"),
}


def shots_for(id):
    out = []
    for b in SH_MAP[id]:
        out.append(P(b) if b.endswith(('.png', '.jpg')) else S(b))
    return out


def real_name(f):
    return f


def scrub(s):
    for a, b in (('GPU가 놀면', '학습 장비가 놀 때'), ('GPU 한 장', '학습 장비 한 대'), ('GPU가', '학습 장비가'), ('GPU', '학습 장비'),
                 ('원칙 203(확인 기록 남기지 않음)과', "'확인 기록은 남기지 않는다'는 뜻과"), ('(바퀴 6)', '')):
        s = s.replace(a, b)
    return s


SHORT = {
    '코어-결정-새클래스': '결정 1 · 새 클래스는 누가 더하나 — 직원이 더하고 관리자 승인 / 관리자만',
    '코어-결정-새클래스모델': '결정 5 · 새 클래스를 AI 모델에 넣는 법 — 나누어 넣기 / 한 모델에 늘리기',
    '코어-결정-재학습시작': '결정 4 · XI 재학습 · 배포 관리 — 쉬는 시간 자동 기본 / 수동 기본 (시안)',
    '코어-결정-데이터하우스': "결정 2 · 데이터하우스 자리 — 직원 메뉴 '데이터' 자리 / 관리자 화면 안에만",
    '코어-결정-학습단위': "결정 3 · 학습 데이터 1장이 되는 때 — 고치면 저절로 / '다 봤음'을 눌러야",
    '전국-결과-보기': 'XI맵 전국 결과 — 빛나는 밀도 대신 실제 경작지 면 (시안)',
    '전국-결과-무엇부터': '전국 결과 자산 · 무엇부터 — 농지 / 하천 · 계곡 / 둘 다',
    '전국-결과-언제': '전국 결과 자산 · 언제 돌리나 — 쉬는 시간만 / 낮에도 학습 장비가 놀 때',
    '전국-결과-순서': '전국 결과 자산 · 순서 — 농지 많은 도부터 / 기관 있는 곳부터',
    '전국-결과-휴경': "농지 전수 · 휴경은 어떻게 — 해마다 비교 / '휴경지' 클래스를 새로 학습",
    '하천-범위': '하천 · 계곡 의심시설 · 범위 — 국가 · 지방하천 띠 / 소하천 · 계곡까지',
}
cx = []
for id in [i['id'] for i in core]:
    src = by[id]
    f, note = WHERE[id]
    t, now, prop = scrub(src['t']), scrub(src['now']), scrub(src['prop'])
    opts = src['opts']
    if id in SHORT:
        tail = t.split(' — ', 1)[1] if ' — ' in t else t
        prop = '선택지: ' + tail + '. ' + prop
        t = SHORT[id]
    if id == '코어-지금구조':
        t = '구조 한눈에 — 분석서비스 · AI 모델 · 클래스는 지금 이렇게 이어져 있습니다'
        now = ("세 줄 요약. ① 분석서비스 1개(한 판) = AI 모델 1개 + 그 모델 클래스 중 찾는 것 n개 + 규칙 · 대장 형식입니다. "
               "② AI 모델 1개는 클래스(찾는 것의 이름)가 학습 때 고정된 한 판이고 여러 서비스가 나눠 씁니다 — 지금 '항공 25cm 4분류 모델'(건물 · 주차장 · 경작지 · 비닐하우스) 하나를 건축물 · 주차장 · 비닐하우스 · 경작·휴경 분석서비스 넷이 씁니다. "
               "③ 클래스는 지금 따로 된 목록이 없고 모델 · 서비스 판 · 결과 · 학습 데이터 네 곳에 이름으로만 있으며, 고친 기록 60줄은 모두 시험(실제로 고친 것 0)이라 고친 것이 학습 데이터로 이어지는 길이 아직 없습니다. 서버에서 직접 센 값(10-12): 모델 등록 18 · 후보 2.")
    cx.append(dict(id=id, t=t, shots=shots_for(id), opts=opts,
                   where=W(f, note) + ([] if id != '전국-결과-보기' else []),
                   now=now, prop=prop + ' ' + (T('now-ximap-glow') if id == '전국-결과-보기' else T('mock-national-range') if 'national-range' in ''.join(SH_MAP[id]) else DES)))
items.append(dict(section='코어 · 전국 결과 — 시안과 결정', desc="맨 위 '구조 한눈에'를 먼저 보시고, 그 아래 결정 여섯 · 전국 결과 여섯을 답해 주세요. 그림에 '시안'이 있는 것은 아직 만들지 않은 모습이고, '실측' 그림은 부여군 남면을 실제로 돌려 본 결과입니다.", items=cx))
items[-1]['items'][0]['where'].append([IMG + 'structure-core.png', '로그인 없이 열림', '표시는 10-12 서버 값'])
for it in items[-1]['items']:
    if it['id'] == '전국-결과-보기':
        it['where'] = [[APP + '/landxi/v3/xi-clean/', STAFF, '지금 XI맵 전국 화면 — 빛나는 밀도(첫 그림)'],
                       [IMG + 'mock-ximap-national.png', '로그인 없이 열림 · 시안 그림', '그림 — 전국 · 진행 막대 · 확대 둘'],
                       [IMG + 'real-closeup.jpg', '로그인 없이 열림 · 실측 그림', '부여군 남면 2025년 영상 위 실제 결과']]
json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', sum(len(x['items']) for x in items))
