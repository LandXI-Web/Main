"""바퀴 19 now 항목 JSON 만들기 + 페이지 굽기.
사용: python build-items-r19.py <shots-r19 폴더> [--real]
  기본 = 시험 굽기: 스크래치 폴더(LX_R19_DRAFT 또는 기본 now-r19-draft)에만 만든다. now 는 건드리지 않는다.
  --real = 진짜 굽기: landxi/proto/review/confirm/now 에 굽는다(지난 now 보관은 따로 먼저 — 이 스크립트는 하지 않는다).
그림: 전부 shoot-r19.mjs 로 새로 찍은 것(이름 끝 네 자리 = 찍은 시각). 시안 그림 2종만 파일 시안(mock-)과 지난 시안 그림(mock-chat-d2)이고 그렇게 표시한다."""
import glob, json, os, re, shutil, subprocess, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
NOW = os.path.join(PR, 'now')
SH = os.path.abspath(sys.argv[1])
REAL = '--real' in sys.argv
DRAFT = os.environ.get('LX_R19_DRAFT', r'C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad\now-r19-draft')
APP, ADMIN, ORG, OVS = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev', 'https://kgz-agri.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
OV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (해외 기관 로그인 폼)'
XI = APP + '/landxi/v3/xi-clean/'
EV = os.path.join(SH, 'ev'); os.makedirs(EV, exist_ok=True)   # 시안 그림 모음(이름 앞 mock-)
D45 = os.path.join(PR, 'impl-45')


def has(base):
    return bool(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    return os.path.basename(f[-1])


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b)); return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    ts = sorted(hm(b) for b in bs)
    d = datetime.date.today()
    return f'(그림 찍은 시각 {d.month}월 {d.day}일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def mock(src, name):
    shutil.copy2(src, os.path.join(EV, name)); return name


def nb(s):
    """숫자와 단위 · 화살표 앞뒤 공백은 줄바꿈 때 갈라지지 않게(줄바꿈 규칙 3-9)."""
    s = re.sub(r' (?=→)|(?<=→) ', ' ', s)
    s = re.sub(r'(?<=[가-힣A-Za-z]) (?=\d)', ' ', s)
    s = re.sub(r'(?<=\d) (?=(?:km|㎢|곳|필지|건|초|W|kg|GB|개|명)|%)', ' ', s)
    return s


DONE = ['완료', '다시']
A = []


def add(id, t, live, where, what, extra=()):
    A.append(dict(id=id, t=t, shots=[S(b) for b in live] + list(extra), opts=DONE, where=where,
                  what=what + ' ' + T(*live) + ' 그림은 모두 지금 바깥 주소에서 로그인 폼으로 새로 찍은 것입니다.'))


# ───────── 구현 확인 ─────────
add('해외-경작지중심', '해외 화면 — 빨강 없이 경작지만', ['now-ov-country', 'now-ov-gun', 'now-ov-close'],
    [[OVS + '/landxi/v3/global/', OV, '처음 화면(군) → 위 한 줄에서 나라 보기 → 휠로 가까이']],
    "빨간 칸(작황 하락)과 그 설명을 모두 뺐고 경작지만 청록 한 색으로 칠했습니다. 큰 숫자는 경작지 넓이입니다: 이식아타 647.6 km² · 나라 전체 12,536 km². 그림은 차례로 나라 · 군 · 가까이 확대이고 어느 크기에서도 경작지 면이 위성 사진 위에서 읽힙니다. "
    "정확도 점검: 300곳을 위성 사진으로 하나씩 보고 견줬습니다. 지난 모델 0.74 → 다시 학습 0.82 → 기준 보정 뒤 약 0.88. 나라 전체 다시 돌리기가 진행 중입니다(1.5~2일). 끝나면 숫자와 지도가 새 값으로 바뀝니다.")
add('XI맵-출처뺌', 'XI맵 오른쪽 아래 나사 표기를 뺐습니다', ['now-xi-map'], [[XI, STAFF, '지도 오른쪽 아래']],
    "XI맵(LX 직원 · 기관 같은 화면) 지도 오른쪽 아래의 NASA 출처 글을 없앴습니다. 브이월드 표기는 이 지도에 원래 없었습니다. 그림 오른쪽 아래가 비어 있는지 봐 주세요.")
add('XI맵-마지막분석날짜', '시군구 칩에 마지막 분석 날짜', ['now-xi-list-region'], [[XI, STAFF, '왼쪽 위 한 줄 누르기 → 시도 → 시군구']],
    "시군구 칩 오른쪽 아래에 그 시군구 서비스 중 가장 늦은 분석 날짜(예: 10.07)를 작게 붙였습니다. 분석 기록이 있는 곳에만 보이고 없으면 비어 있습니다.")
add('XI맵-서비스로보기', "'서비스로 보기' 전환 · 다시 열어도 유지", ['now-xi-list-svc', 'now-xi-list-svc-kept'], [[XI, STAFF, '왼쪽 위 목록 → 서비스로 보기']],
    "'서비스로 보기'를 누르면 같은 목록이 서비스(경작·휴경 · 비닐하우스 · 곤포사일리지 등) 기준으로 묶여, 어느 시군구에 있는지 보입니다. 고른 방식은 계정마다 저장되어 다시 열어도 그대로입니다. 첫째 그림은 전환한 모습, 둘째 그림은 페이지를 새로 고친 뒤 다시 연 모습입니다.")
add('XI-ChatGEO-1안', 'XI ChatGEO 1안 — 입력 한 줄 + 답 띠', ['now-chat-answer-pc', 'now-chat-drawer-pc', 'now-chat-answer-m'], [[XI, STAFF, '아래 질문 칸에 "남원시 경작지 현황 보여 줘"']],
    "지도 위에는 입력 한 줄과 답 띠(글 두 줄 · 단추 · '대화 n')만 있고, 긴 대화는 '대화 n'을 누르면 오른쪽 서랍에 열립니다. 지도를 덮는 비율: PC 17% → 13%, 휴대폰 38% → 25%. 옛 화면과 견주는 그림은 바꾸기 전 그림이 이 PC 에 없어 숫자로만 적습니다. 첫째 · 둘째는 PC(답 띠 · 서랍), 셋째는 휴대폰 폭입니다. 기관 계정에도 같은 모양입니다.")
add('공휴일빨강', '달력에 공휴일도 빨강', ['now-cal'], [[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 달력(월 보기)']],
    "토 · 일처럼 공휴일도 빨강으로 보입니다. 그림의 10.3 · 10.5(대체공휴일) · 10.9(한글날). 이름은 날짜 칸에 마우스를 올리면 나옵니다. 지금은 2026 · 2027 공휴일 표를 넣어 쓰고, 공공데이터 키를 넣으면 공공데이터에서 받아 옵니다. 그림은 달력 보기를 월로 바꿔 찍은 뒤 원래(자동)대로 되돌렸습니다.")
add('영농-사료작물견주기', '사료작물 신청 대장 × 세 시점 견주기', ['now-gov-feed-top'], [[ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '행정정보 목록 → 사료작물_재배신청_예시']],
    "사료작물 재배 신청 대장을 올리면 세 시점(생육기 · 생산기 · 곤포사일리지)마다 서비스를 골라 필지별로 AI 결과와 견줍니다. 맞음 16 · 다름 6(예시 대장 22필지 · 신청 작물과 면적은 예시 값). 다른 필지는 어느 시점 결과가 없는지 표와 지도에 보이고 엑셀로도 받습니다. 남원에는 생산기 · 곤포사일리지 결과가 아직 없어 그 두 시점은 '고르지 않음'입니다.")
add('영농-곤포생산량', '곤포사일리지 1개당 무게 칸', ['now-gov-bale'], [[ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '견주기 결과 맨 아래 곤포사일리지 1개당 무게']],
    "기관 관리자가 1개당 무게(kg)를 넣으면 곤포 개수가 나오는 곳마다 생산량(kg) = 개수 × 무게가 함께 보입니다. 넣기 전에는 개수만 보입니다. 지금 남원에는 곤포사일리지 결과가 있는 서비스가 아직 없어 생산량 숫자는 화면에 없습니다. 곤포사일리지 결과가 생기면 같은 셈으로 나옵니다.")
add('영농-내려받기약속', '내려받기 약속 — 개인정보가 든 파일만', ['now-gov-pledge'], [[ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '사료작물 견주기 → 엑셀로 내려받기']],
    "올린 대장의 필지별 내용이 든 파일(대장과 AI 결과 엑셀 · 사료작물 견주기 엑셀 · 다른 필지가 든 보고서)만 처음 한 번 사용 목적과 활용 기간을 적어 약속하고, 기간 안에는 받을 때마다 확인합니다. 지도 파일 · 필지 엑셀 · 요약 · 통계 엑셀은 바로 받습니다. 그림은 약속 창을 열어 본 뒤 닫기를 눌렀고 파일은 받지 않았습니다.")
add('영농-행정정보목록', '행정정보 주제별 목록', ['now-gov-ledger-list'], [[ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '오른쪽 위 행정정보 목록']],
    "주제(대장 종류)마다 최근 것부터 이름 · 기준일 · 건수 · 등록자가 보이고, 누르면 그 대장으로 맞춥니다. 주제마다 다섯 줄만 보이고 나머지는 'n건 더 보기'입니다.")
add('영농-직위칸', '사용자 관리에 직위 칸', ['now-gov-accounts'], [[ORG + '/landxi/v3/gov-accounts/', GOV, '계정 → 계정 탭']],
    "계정 목록에 이름 · 아이디 · 소속 옆 직위 칸이 생겼습니다. 계정을 열면 기관 관리자가 직위를 적고 저장하며 자기 기관 계정만 바꿀 수 있습니다. 행정정보 목록의 등록자에도 직위가 붙습니다.")
add('휴대폰-질문칸', '휴대폰에서 목록이 열려도 질문 칸이 눌립니다', ['now-m-list-input'], [[XI, STAFF, '휴대폰 폭 · 위 한 줄 눌러 목록 열고 질문 칸 누르기']],
    "재검수에서 나온 진짜 고장입니다. 휴대폰 폭에서 목록 서랍이 열리면 질문 칸을 덮어 입력이 막히던 것을, 질문 칸을 서랍 위로 올려 고쳤습니다. 그림은 목록이 열린 채 질문을 적은 모습입니다(PC 폭은 해당 없음).")

# ───────── 질문 · 시안 ─────────
Q = []
ma = [mock(os.path.join(SH, S('sian-report-a-pc')), 'mock-report-a-pc.png'), mock(os.path.join(SH, S('sian-report-a-m')), 'mock-report-a-m.png')]
mb = [mock(os.path.join(SH, S('sian-report-b-pc')), 'mock-report-b-pc.png'), mock(os.path.join(SH, S('sian-report-b-m')), 'mock-report-b-m.png')]
Q.append(dict(id='영농-보고서', t='보고서를 유연하게 — 시안 A 와 시안 B 중 어느 쪽', shots=[ma[0], mb[0], ma[1], mb[1]], opts=['시안 A 고르면 바로 만들어지는 보고서', '시안 B 블록 보고서', '다시'],
              where=[[ORG + '/landxi/v3/gov-report/?service=card-farm', GOV, '지금 보고서 화면(아직 옛 모양)']],
              now="지금 보고서는 서비스 하나 · 읍면동 하나를 골라 한 판으로 만듭니다. 기존에 다 입력하고 넣어야 해서 불편하다고 하셨습니다. 그림 넷은 모두 시안이고 아직 구현하지 않았습니다(숫자는 예시). 첫째 · 셋째 = 시안 A PC · 휴대폰, 둘째 · 넷째 = 시안 B PC · 휴대폰.",
              prop="시안 A = 서비스 · 시점을 원하는 만큼 체크하면 보고서가 바로 채워집니다(적어 넣을 칸 없음 · 대장은 넣고 싶을 때만 · 아래에 발급 목록). 시안 B = 개요 · 지도 · 종류별 · 읍면동별 · 시점 비교 · 대장과 다른 필지 · 메모 같은 블록을 더하고 빼고 옮기며, '내 보고서 틀'로 저장해 다시 씁니다. A 가 가장 적게 입력하고 B 는 가장 자유롭습니다."))
Q.append(dict(id='CSV-이름', t='통계 내려받기 단추 이름', shots=[S('now-gov-stats')], opts=['이대로', '진짜 엑셀(.xlsx)로 바꾸기'],
              where=[[ORG + '/landxi/v3/gov-select/?service=card-farm&tab=stats', GOV, '통계 · 보고서 탭 아래 종류별 · 읍면동별']],
              now="통계(종류별 · 읍면동별)와 이력의 단추 이름은 '엑셀로 내려받기'였지만 실제 파일은 CSV 였습니다. 엑셀에서 바로 열리기는 하지만 이름이 사실과 달라 'CSV 파일로 내려받기'로 바꿨습니다(마우스를 올리면 '엑셀에서 바로 열립니다'). 행정정보 대장 내려받기는 이미 진짜 엑셀(.xlsx)입니다. " + T('now-gov-stats'),
              prop="이대로 = 지금 바로 쓸 수 있고 사실과 맞음. 진짜 엑셀로 바꾸기 = 열 너비 · 숫자 서식이 처음부터 보기 좋지만 파일 만드는 일이 늘어납니다."))
Q.append(dict(id='제안-ChatGEO-합침', t='1안 + 대화는 아래 시트로 합칠까요', shots=[S('now-chat-answer-pc'), S('now-chat-drawer-pc'), mock(os.path.join(D45, 'ximap-chat-research', 'shots', 'd2-1440-full.png'), 'mock-chat-d2-sheet.png')],
              opts=['넣음', '안 넣음', '나중에'], where=[[XI, STAFF, '아래 질문 칸 → 질문 → 대화 n']],
              now="지금 1안은 '대화 n'을 누르면 오른쪽 서랍에 대화 전체가 열립니다. 앞 두 그림이 지금 모습이고, 셋째 그림은 예전에 미리 본 시안 그림(지난 그림 · 아래 시트 '전체')입니다. " + T('now-chat-answer-pc', 'now-chat-drawer-pc'),
              prop="서랍 대신 아래에서 올라오는 시트로 하면 지도 폭이 그대로이고 긴 답 · 표가 넓게 읽힙니다. 대신 시트가 올라온 동안 지도 아래쪽을 가립니다. 긴 대화를 자주 읽는 직원에게 필요합니다."))
Q.append(dict(id='제안-답지도연결', t='답 띠 숫자를 지도에 연결할까요', shots=[S('now-chat-answer-pc')], opts=['넣음', '안 넣음', '나중에'], where=[[XI, STAFF, '질문 → 답 띠']],
              now="답 띠의 '운봉읍 9,879곳' 같은 숫자는 글일 뿐이라 지도 어디인지 따로 찾아야 합니다. " + T('now-chat-answer-pc'),
              prop="숫자에 마우스를 올리면 지도에서 그 읍면동이 떠오릅니다. 답을 읽는 직원이 숫자와 위치를 바로 잇습니다."))
Q.append(dict(id='제안-서랍열면답띠숨김', t='서랍을 열면 답 띠를 숨길까요', shots=[S('now-chat-drawer-pc'), S('now-chat-answer-m')], opts=['넣음', '안 넣음', '나중에'], where=[[XI, STAFF, '질문 → 대화 n']],
              now="서랍을 열면 같은 답이 서랍 안과 답 띠에 두 번 보입니다. 휴대폰에서는 답 띠가 아직 큰 편입니다(지도의 25%). " + T('now-chat-drawer-pc', 'now-chat-answer-m'),
              prop="서랍이 열려 있는 동안만 답 띠를 숨기면 같은 글이 겹치지 않고 지도가 더 보입니다."))
Q.append(dict(id='제안-곤포서비스남원공유', t='곤포 서비스를 남원에 공유할까요', shots=[S('now-xi-list-svc'), S('now-gov-bale')], opts=['넣음', '안 넣음', '나중에'], where=[[XI, STAFF, '서비스로 보기 → 곤포사일리지'], [ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '견주기 아래 1개당 무게']],
              now="곤포사일리지 결과는 보령시 한 곳에만 있어 남원 견주기에서는 곤포 시점이 '고르지 않음'이고 생산량도 숫자가 없습니다. " + T('now-xi-list-svc', 'now-gov-bale'),
              prop="곤포사일리지 서비스를 남원에 승인해 공유하면 세 시점 견주기와 생산량(개수 × 1개당 무게)이 남원 화면에서 완성됩니다. 남원 담당자가 사료작물 재배 신청을 끝까지 확인하는 데 필요합니다."))
Q.append(dict(id='제안-견주기읍면동묶음', t='견주기 결과를 읍면동별로 묶을까요', shots=[S('now-gov-feed-top')], opts=['넣음', '안 넣음', '나중에'], where=[[ORG + '/landxi/v3/gov-fusion/?service=card-farm', GOV, '사료작물 견주기 결과']],
              now="견주기는 필지마다 맞음 · 다름을 보여 줍니다. 읍면동마다 몇 필지가 다른지는 표를 직접 세야 합니다. " + T('now-gov-feed-top'),
              prop="읍면동별로 맞음 · 다름 필지 수를 묶어 보이면 어느 동네부터 확인할지 바로 정할 수 있습니다. 현장 확인 순서를 정하는 담당자에게 필요합니다. 경영체로 묶기는 하지 않습니다."))
Q.append(dict(id='제안-이용약속기록화면', t='내려받기 이용 약속 기록 화면', shots=[S('now-gov-pledge')], opts=['넣음', '안 넣음', '나중에'], where=[[ORG + '/landxi/v3/gov-accounts/', GOV, '계정 → 처리 기록']],
              now="이용 약속(목적 · 기간 · 누가 · 언제)은 서버에 기록되지만 화면에서 한눈에 볼 곳이 없습니다. " + T('now-gov-pledge'),
              prop="기관 관리자가 약속 목록과 기간이 끝나는 날을 보고, 기간이 지난 파일 삭제 여부를 점검합니다. 정보보호 점검을 받는 기관에 필요합니다."))
Q.append(dict(id='제안-해외공식통계대조', t='해외 군별 공식 통계와 나란히', shots=[S('now-ov-gun')], opts=['넣음', '안 넣음', '나중에'], where=[[OVS + '/landxi/v3/global/', OV, '군 화면 큰 숫자']],
              now="군 화면 큰 숫자(경작지 넓이)가 맞는지 견줄 기준이 화면에 없습니다. " + T('now-ov-gun'),
              prop="해당 나라 공식 통계의 군별 파종 면적을 작게 나란히 보이면 우리 숫자가 어느 정도 맞는지 해외 기관 담당자가 바로 압니다. 공식 통계를 구할 수 있는 군부터 넣습니다."))
Q.append(dict(id='제안-전력정지사유표시', t="'전력 규칙으로 잠시 멈춤' 표시", shots=[S('now-admin-infra')], opts=['넣음', '안 넣음', '나중에'], where=[[ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라']],
              now="전력 규칙 때문에 분석이 잠시 멈추면 화면에서는 그냥 대기로 보입니다. " + T('now-admin-infra'),
              prop="멈춘 이유(전력 규칙)와 다시 시작될 시각을 같이 보이면 관리자가 고장으로 오해하지 않습니다."))
Q.append(dict(id='제안-첫방문묶어받기', t='기관 첫 화면 처음 방문 줄이기', shots=[], opts=['넣음', '안 넣음', '나중에'], where=[[ORG + '/', GOV, '처음 여는 브라우저로 첫 화면']],
              now="재검수에서 기관 첫 화면이 처음 방문 때만 3~4초 걸렸습니다. 서버는 빠르고 파일 50여 개를 하나씩 받는 시간이 쌓인 것입니다. 그림은 없습니다.",
              prop="첫 화면에 필요한 파일을 묶어 한 번에 받으면 처음 방문 시간을 줄일 수 있습니다. 기관에 처음 들어오는 담당자의 첫인상에 필요합니다."))
Q.append(dict(id='사무실자산-가져오기', t='사무실 자료 가져오는 순서', shots=[], opts=['그대로 진행', '다른 순서'], where=[[APP + '/', '—', '화면이 없는 결정']],
              now="가져올 자료: 키르기스 시범 자료 폴더(약 3GB)를 먼저 가져오고, 이식아타 항공 2023~2024만 고르기 위해 폴더 목록을 먼저 받아 보려 합니다. 그림은 없습니다.",
              prop="그대로 진행이면 작은 것부터 가져와 확인합니다. 다른 순서가 필요하면 아래 칸에 적어 주세요."))
items = [dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요. 그림은 모두 지금 새로 찍은 것입니다.', items=A)]
items.append(dict(section='B. 새 질문 · 시안', desc='이번 바퀴에 고를 것입니다. 고르지 않고 한 줄 적으셔도 됩니다. 시안이라고 쓴 그림은 아직 만들지 않은 모양입니다.', items=Q))
INFO = [
    dict(id='알림-재검수', t='재검수: 진짜 고장 2 · 모두 고침 · 검사 쪽 오판 10', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
         what="전 화면을 다시 점검해 진짜 고장 2개를 찾아 모두 고쳤습니다: 휴대폰 질문 칸이 목록에 가려지던 것 · 통계 내려받기 이름('엑셀'인데 CSV 파일). 나머지 10건은 점검 도구가 잘못 읽은 것이었고 화면은 정상이었습니다."),
    dict(id='알림-GPU전력', t='GPU 전력: 학습 중 잠시 넘은 것을 고쳤습니다', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
         what="학습 중 2분 동안 140 W 를 넘었습니다(최고 173 W · 상한 200 W 안). 30초 평균을 실제로 재서 넘으면 멈추는 규칙으로 고쳤습니다."),
    dict(id='알림-남원정사COG', t='남원 정사영상 원본을 COG 로 바꾸는 중', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
         what="사무실 컴퓨터에서 플랫폼 표준(COG · JPEG 90)으로 변환하라고 지시했습니다. 결과가 오면 등록합니다."),
]
items.append(dict(section='C. 알림', desc='고를 것은 없고 알려 드리는 글입니다.', items=INFO))

nA, nQ, nI = len(A), len(Q), len(INFO)
jf = os.path.join(SH, 'confirm-items-r19.json')
for sec in items:
    for it in sec['items']:
        for k in ('what', 'now', 'prop'):
            if k in it: it[k] = nb(it[k])
json.dump(items, open(jf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if REAL:
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items-r19.json'))
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items.json'))
print('구현 확인', nA, '· 질문', nQ, '· 알림', nI, '· 합', nA + nQ + nI)
lead = f"구현 확인 {nA} · 새 질문과 시안 {nQ} · 알림 {nI}입니다. 그림은 모두 지금 바깥 주소에 로그인 폼으로 들어가 새로 찍었습니다(찍은 시각 표기). 고르시면 이 브라우저에 저장되고, 맨 아래 '결정 복사'로 대화창에 붙여 주세요."
env = dict(os.environ, LX_CONFIRM_ITEMS=jf, LX_CONFIRM_ROUND=('now' if REAL else DRAFT), LX_CONFIRM_EXTRA=SH + ';' + EV, PYTHONIOENCODING='utf-8',
           LX_CONFIRM_TITLE='답을 기다리는 것', LX_CONFIRM_LEAD=lead)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review', 'build-confirm.py')], env=env, check=True)
out = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm', 'now') if REAL else DRAFT
h = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
miss = [m for m in re.findall(r'src="(img/[^"]+)"', h) if not os.path.exists(os.path.join(out, m))]
print('굽은 곳', out, '· 그림 태그', h.count('<img'), '· 없는 그림', miss)
