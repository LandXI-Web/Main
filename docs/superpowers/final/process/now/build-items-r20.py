"""바퀴 20 now 항목 JSON 만들기 + 페이지 굽기.
사용: python build-items-r20.py <shots-r20 폴더> [--real]
  기본 = 시험 굽기: 스크래치 폴더(LX_R20_DRAFT 또는 기본 now-r20-draft)에만 만든다. now 는 건드리지 않는다.
  --real = 진짜 굽기: landxi/proto/review/confirm/now 에 굽는다(지난 now 보관은 따로 먼저 — 이 스크립트는 하지 않는다).
그림: 전부 shoot-r20.mjs 로 새로 찍은 것(이름 끝 네 자리 = 찍은 시각). 굽을 때 '지금' 이름표가 붙도록 이름 앞에 now- 를 붙여 복사한다.
첫 방문 시간: 같은 폴더의 fv-cold-*.json · fv-flow-*.json(first-visit.mjs 결과)에서 읽는다."""
import glob, json, os, re, shutil, subprocess, sys, datetime, statistics
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
NOW = os.path.join(PR, 'now')
SH = os.path.abspath(sys.argv[1])
REAL = '--real' in sys.argv
DRAFT = os.environ.get('LX_R20_DRAFT', r'C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad\now-r20-draft')
APP, ADMIN, ORG, OVS = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev', 'https://kgz-agri.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
OV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (해외 기관 로그인 폼)'
PUB = '로그인 없이'
XI = APP + '/landxi/v3/xi-clean/'
EV = os.path.join(SH, 'ev'); os.makedirs(EV, exist_ok=True)   # '지금' 이름표용으로 이름 앞에 now- 를 붙인 복사본


def has(base):
    return bool(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))


def S(base):
    """찍은 그림 → 굽는 쪽에 올릴 이름(now- 붙임)"""
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    src = f[-1]; nm = os.path.basename(src)
    if not nm.startswith('now-'):
        nm = 'now-' + nm
        shutil.copy2(src, os.path.join(EV, nm))
    return nm


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b)); return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    ts = sorted(hm(b) for b in bs)
    d = datetime.date.today()
    return f'(그림 찍은 시각 {d.month}월 {d.day}일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def nb(s):
    """숫자와 단위 · 화살표 앞뒤 공백은 줄바꿈 때 갈라지지 않게(줄바꿈 규칙 3-9)."""
    s = re.sub(r' (?=→)|(?<=→) ', ' ', s)
    s = re.sub(r'(?<=[가-힣A-Za-z]) (?=\d)', ' ', s)
    s = re.sub(r'(?<=\d) (?=(?:km|㎢|곳|필지|건|초|W|kg|GB|개|명|회|장)|%)', ' ', s)
    return s


def fv(mode, who):
    f = os.path.join(SH, f'fv-{mode}-{who}.json')
    try:
        j = json.load(open(f, encoding='utf-8'))
        return [round(r['readyMs'] / 1000, 1) for r in j]
    except Exception:
        return []


def fvtxt(xs):
    return ' · '.join(f'{x}' for x in xs) + '초' if xs else '(못 잼)'


DONE = ['완료', '다시']
YNL = ['넣음', '안 넣음', '나중에']
A = []


def add(id, t, live, where, what):
    A.append(dict(id=id, t=t, shots=[S(b) for b in live], opts=DONE, where=where,
                  what=what + (' ' + T(*live) if live else '') + (' 그림은 모두 지금 바깥 주소에서 로그인 폼으로 새로 찍은 것입니다.' if live else '')))


GR = ORG + '/landxi/v3/gov-report/?service=card-farm&tab=report'
GS = ORG + '/landxi/v3/gov-select/?service=card-farm&tab=stats'
GH = ORG + '/landxi/v3/gov-select/?service=card-farm&tab=history'
GF = ORG + '/landxi/v3/gov-fusion/?service=card-farm'
GA = ORG + '/landxi/v3/gov-accounts/'
OVG = OVS + '/landxi/v3/global/'
OVL = APP + '/landxi/v3/global/?country=KGZ'

# ───────── 구현 확인 ─────────
add('영농-보고서', '고르면 바로 만들어지는 보고서', ['gov-report-top', 'gov-report-ledger', 'gov-report-issues', 'gov-report-top-m'],
    [[GR, GOV, '서비스 → 보고서 탭']],
    "서비스 · 읍면동을 고르고 '보고서 만들기'를 누르던 것을, 넣을 결과에 체크만 하면 그 자리에서 보고서가 채워지게 바꿨습니다(적어 넣는 칸 없음). 보고서는 개요 · 종류별 · 지도 · 읍면동별이고, 대장은 넣고 싶을 때만 골라 '대장과 견준 결과'를 더합니다(둘째 그림: 올린 대장 1,743필지 · AI 결과가 있는 필지 20 · 영상 범위 밖 1,723 · 농지인데 비경작지 6). 범위는 남원시 전체나 읍면동 하나입니다. 아래 '발급 목록'에는 발급 일시 · 넣은 결과 · 요청자 · 내려받은 횟수가 남고 '다시 받기'로 같은 고르기를 다시 받습니다(셋째 그림). 넷째는 휴대폰 폭입니다. "
    "솔직히 말씀드리면: 남원에 결과가 있는 서비스가 지금 '경작·휴경' 하나뿐이라 그림은 결과 하나만 체크된 한 장짜리 보고서입니다. 결과를 둘 이상 고르면 나오는 시점 비교 · 종류별 차이와 엑셀 · 한글 문서는 예시 결과 셋으로 서버에서 시험해 확인했고, 남원에 결과가 더 공유되면 같은 화면에 체크 칸이 늘어납니다. 이번 그림을 찍을 때는 보고서를 내려받지 않았습니다(발급 목록의 줄은 구현 확인 때 받은 것).")
add('영농-엑셀', '통계 · 이력 내려받기가 진짜 엑셀(.xlsx)', ['gov-stats-xlsx', 'gov-history-xlsx'],
    [[GS, GOV, '통계 · 보고서 탭 아래 종류별 · 읍면동별'], [GH, GOV, '이력 탭 오른쪽 위']],
    "통계(종류별 · 읍면동별)와 이력의 단추 이름이 '엑셀로 내려받기'이고 실제 파일도 진짜 엑셀(.xlsx)입니다. 통계 엑셀은 종류별 · 읍면동별 시트와 안내 시트(숫자는 숫자 칸 · 머리 줄 고정), 이력 엑셀은 날짜 · 시각 · 종류 · 내용 · 누가 + 안내입니다. 받은 일은 이력에 '통계 엑셀 내려받음'으로 남습니다. 그림은 단추가 있는 자리까지이고 이번 그림을 찍을 때는 파일을 받지 않았습니다(받아 열어 본 것은 구현 때입니다).")
add('영농-견주기읍면동', '사료작물 견주기를 읍면동별로', ['gov-feed-emd', 'gov-feed-emd-on'],
    [[GF, GOV, '행정정보 목록 → 사료작물 재배 신청 대장 → 읍면동별']],
    "견주기 결과를 읍면동별로 묶어 읍면동마다 신청 · 맞음 · 다름을 한 줄로 봅니다. 예시 대장 22필지는 모두 운봉읍이라 운봉읍 22 · 16 · 6(신청 · 맞음 · 다름)이고, 위 큰 숫자 · 맞음 줄과 같은 값입니다. 읍면동 줄을 누르면 지도와 표가 그 읍면동만 보이고(둘째 그림), '전체 보기'로 되돌립니다. 다른 필지가 많은 읍면동이 위로 옵니다. 엑셀에도 '읍면동별' 시트가 있습니다. 예시 대장이 한 읍면동뿐이라 여러 읍면동이 나란히 보이는 모습은 아직 그림에 없습니다.")
add('영농-이용약속기록', '이용 약속 기록 화면', ['gov-pledges', 'gov-pledges-m', 'admin-pledges'],
    [[GA + '#pledges', GOV, '계정 → 이용 약속 기록'], [ADMIN + '/landxi/v3/ops-accounts/#pledges', ADM, '계정 관리 → 이용 약속 기록']],
    "누가 · 언제 · 사용 목적 · 활용 기간(기간 안 · 끝) · 받은 파일 종류 · 받은 횟수를 한 표로 보고, 약속한 날 기간으로 거르고, 엑셀로 내려받습니다(보기만 · 고치지 못함). 기관 관리자는 자기 기관 약속만(첫째 · 둘째 그림, 둘째는 휴대폰 폭), LX 관리자는 모든 기관을 기관별로 골라 봅니다(셋째 그림). 부서 사용자 · LX 직원은 서버가 막습니다. 솔직히: 표의 약속 1건은 구현 확인 중 제가 사용 목적 '화면 구현 확인(자체 점검)'으로 직접 적은 것이고 실제 기관 약속이 아닙니다.")
add('곤포-보령제외', '보령 곤포 결과를 보이지 않게', ['now-xi-list-svc'],
    [[XI, STAFF, '왼쪽 위 목록 → 서비스로 보기']],
    "곤포사일리지 서비스는 남원 자산이라 보령시 결과를 보이지 않게 했습니다(지우지 않았고 되돌리려면 규칙 한 줄만 지우면 1분 안에 돌아옵니다). XI맵 전국 결과 · 보령시 결과 층 · 서비스 지역 · 대시보드 숫자 · 외부 연결에서 모두 빠졌습니다. 그림은 '서비스로 보기' 목록으로, 곤포사일리지가 더 이상 목록에 없습니다(경작·휴경 · 비닐하우스 · 건축물 · 주차장 · 국토 변화 · 해양쓰레기). "
    "알게 된 것: 보령시의 '곤포사일리지' 결과는 실제로는 다른 모델(건물 · 주차장 · 경작지 · 비닐하우스) 결과가 곤포사일리지 서비스에 잘못 붙어 있던 것이었습니다. 메인 화면의 '행정 업무 서비스' 이름 목록에는 서비스 이름으로 남아 있습니다.")
add('해외-공식통계', '해외 군별 공식 통계와 나란히', ['ov-register-pc', 'ov-register-m', 'ov-register-lx', 'ov-season-pc'],
    [[OVG, OV, '해외 기관 화면 → Register 탭 아래'], [OVL, ADM, 'LX 계정 해외 화면 → Register 탭 아래']],
    "군 화면 Register 탭 아래 'Against official statistics' 표에 군별 AI 경작지(ha) · 공식(ha) · 차이(%)를 나란히 보입니다. 공식 숫자는 키르기스스탄 국가통계위원회의 2025년 수확 면적입니다. 이식아타(Ysyk-Ata)는 AI 64,763 · 공식 60,648 · +7%. 표 아래 한 줄이 두 숫자의 정의가 다름을 알립니다('AI = 영상에 보이는 경작지 · 공식 = 신고된 수확 면적'). 기관 계정은 자기 군 한 줄만(첫째 그림 · 휴대폰 폭은 둘째), LX 계정은 40개 군 전체입니다(셋째 그림). 넷째는 Season 탭입니다. "
    "솔직히: 군별 '파종' 면적은 2013년 뒤로 공개된 것이 없어 수확 면적 합으로 견줬고, 정의가 달라 차이가 크게 나는 군이 있습니다(그림 셋째 표에서 +62% · −71% 같은 군).")
add('ChatGEO-지도강조', '답에 나온 곳을 지도에서 강조', ['staff-hl-q1', 'staff-hl-hover', 'staff-hl-q2', 'inst-hl-out'],
    [[XI + '?region=52190', STAFF, '아래 질문 칸 → "남원시 경작지 현황 보여 줘" → 이름에 올리기 → "그중 가장 큰 곳은?"'], [ORG + '/landxi/v3/xi-clean/?region=52190', GOV, '"임실군 경작지 현황 보여 줘"(관할 밖)']],
    "답에 나온 읍면동이 지도에서 테두리와 옅은 면으로 강조되고 같은 시군구의 나머지는 옅게 덮입니다(첫째 그림: 운봉읍 · 송동면 · 보절면). 답 띠의 이름(과 숫자)에 마우스를 올리면 지도의 그곳이 빛납니다(둘째). 이어서 '그중 가장 큰 곳은?'이라고 물으면 앞 답의 목록 안에서 골라 운봉읍만 남고 강조가 바뀝니다(셋째, 숫자는 앞 답 그대로). 기관 계정에서 관할 밖(임실군)을 물으면 '이 기관 계정에서 볼 수 없습니다'만 나오고 그곳은 강조되지 않습니다(넷째). '강조가 끝난 뒤에야 이름을 잇는' 간헐 고장 하나와 관할 밖 답 뒤에 앞 강조가 남던 고장 하나를 이번에 고쳤습니다.")
add('서랍열면답띠숨김', "'대화 n' 서랍을 열면 답 띠를 숨김", ['staff-drawer-open', 'staff-drawer-closed', 'inst-drawer-open'],
    [[XI + '?region=52190', STAFF, '질문 → 답 띠 오른쪽 아래 대화 n'], [ORG + '/landxi/v3/xi-clean/?region=52190', GOV, '같은 순서']],
    "서랍을 열면 같은 답이 두 번 보이지 않도록 답 띠가 숨고(첫째 그림), 서랍을 닫으면 답 띠가 다시 보입니다(둘째 그림). 셋째는 기관 계정의 같은 모습입니다. 직원 · 기관 모두 서랍 안 마지막 답에도 지도 잇기가 걸립니다. 솔직히: 서랍을 닫는 순서는 서랍의 닫기 단추를 누를 때 확실했고, 키보드 Esc 만으로는 점검 때 닫히지 않은 적이 있어 그림은 닫기 단추로 찍었습니다.")


def fvmed(xs):
    return round(statistics.median(xs), 1) if xs else None


cs, ci, fs_, fi = fv('cold', 'staff'), fv('cold', 'inst'), fv('flow', 'staff'), fv('flow', 'inst')
FV = dict(cs=cs, ci=ci, fs=fs_, fi=fi)
add('첫방문-빠르게', 'XI맵 처음 열기가 빨라짐', [],
    [[XI, STAFF, '처음 쓰는 브라우저(빈 보관함)로 로그인 → XI맵'], [ORG + '/landxi/v3/xi-clean/', GOV, '같은 순서']],
    "처음 오는 사람이 XI맵을 열 때 '불러오는 중'이 걷히기까지가 줄었습니다. 빈 보관함으로 바로 열었을 때 바꾸기 전 가운데 값은 직원 6.5초 · 기관(남원) 7.3초였고, 이 바퀴를 굽기 직전 3번씩 다시 잰 값은 직원 " + fvtxt(cs) + " · 기관 " + fvtxt(ci) + "입니다. 처음 쓰는 브라우저로 로그인해 첫 화면을 거쳐 여는 실제 길은 직원 " + fvtxt(fs_) + " · 기관 " + fvtxt(fi) + "이고, 로그인한 그 창에서 보관함만 비우고 바로 열면 직원 0.8~1.6초 · 기관 1.0~1.4초였습니다(재검수 때 3번씩). "
    "솔직히: 이 바퀴에서 잰 값은 바꾸기 전보다 줄었지만 '약 1~4초'로 줄었다고까지는 말씀드리기 어렵습니다 — 기관 빈 보관함 직접 열기는 바깥 길(한국에서 외국 가장자리를 거치는 길) 왕복이 요청마다 흔들려 같은 조건에서도 들쭉날쭉하고(이번에 3.7~6.5초), 어떤 때는 몇 초 더 걸립니다. 줄어든 것은 화면 파일을 작게 보내고 지도 엔진을 앞 화면에서 미리 받아 둔 덕분이고 바깥 길 자체는 그대로입니다. 그림은 없고 시간만 잰 값입니다.")
add('패밀리사이트', '패밀리 사이트 — 메인 · 로그인 바닥', ['pub-main-fam', 'pub-login-fam', 'pub-login-fam-m'],
    [[APP + '/landxi/v3/main/', PUB, '맨 아래 한국국토정보공사 줄 → 패밀리 사이트'], [APP + '/landxi/v3/login/', PUB, '로그인 아래 → 패밀리 사이트']],
    "메인과 로그인 화면 맨 아래 '패밀리 사이트'를 누르면 전북특별자치도 남원시 · 전남광주특별시 기관 사이트로 가는 링크 둘이 펼쳐집니다(첫째 메인 · 둘째 로그인 · 셋째 휴대폰 폭 로그인). 링크는 새 창으로 열립니다. 솔직히: 휴대폰 폭에서는 펼친 목록이 로그인 단추 위에 겹쳐 보입니다(셋째 그림) — 닫으면 원래대로입니다.")
add('대시보드-네방향', '칸 크기를 네 방향으로 조절', ['staff-dash', 'staff-dash-edit', 'staff-dash-w', 'staff-dash-se'],
    [[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 수정하기 → 칸의 테두리 · 모서리를 끌기']],
    "칸 크기를 오른쪽 아래만이 아니라 네 변(위 · 아래 · 왼쪽 · 오른쪽)과 네 모서리 어디서든 끌어 늘리고 줄입니다. 수정 중 단추는 '기능 추가하기 · 테마 · 처음 모양으로 · 완료'이고 '모양 고르기'는 없앴습니다(칸 더하기는 '기능 추가하기'로 이름을 바꿨습니다). 그림은 차례로 평소 · 수정 중 · 왼쪽 변을 오른쪽으로 끌어 줄인 모습(공지사항 칸이 좁아지고 왼쪽이 빔) · 오른쪽 아래 모서리를 안쪽으로 끌어 줄인 모습입니다. 찍은 뒤 끌었던 만큼 되돌려 칸 크기는 원래대로 두었습니다. 솔직히: 휴대폰 폭에서의 끌기는 이번 그림에 없습니다.")
add('영상-크게보기', '영상 크게 보기', ['staff-pick-pc', 'staff-zoom-sat', 'staff-zoom-drone', 'staff-zoom-newwindow', 'staff-analyze-zoom'],
    [[APP + '/landxi/v3/lx-project/?new=1', STAFF, '새 프로젝트 → 공유 데이터에서 고르기 → 영상 카드 돋보기'], [APP + '/landxi/v3/lx-analyze/?region=52190', STAFF, '분석하기 → 서비스 → 분석하기 → 영상 카드 돋보기']],
    "영상 카드의 돋보기(크게 보기)를 누르면 그 자리에서 지도를 펼쳐 영상을 자세히 보고, 앞 영상 · 다음 영상으로 넘기고, 원래 해상도로 · 전체 보기로 바꾸고, 닫습니다. 고를 때는 '이 영상 고르기'입니다. 그림은 차례로 공유 데이터 목록 · 위성 영상 크게 보기 · 드론 영상 크게 보기 · '새 창으로 열기'로 열린 창(고르기 · 닫기 없이 영상만) · 분석하기의 크게 보기입니다. 이 화면은 새 프로젝트와 분석하기가 같은 모양을 쓰고, 배포 신청 단계의 영상 고르기도 같은 크게 보기를 씁니다. "
    "솔직히: 배포 신청 단계 화면은 이번 그림에 없고, 이 그림에서 '이 영상 고르기'는 누르지 않았습니다.")

# ───────── 질문 ─────────
Q = []


def q(id, t, live, opts, where, now, prop):
    Q.append(dict(id=id, t=t, shots=[S(b) for b in live], opts=opts, where=where, now=now + (' ' + T(*live) if live else ''), prop=prop))


q('곤포-남원', '남원 곤포사일리지 서비스 완성', ['now-xi-list-svc'], ['ⓐ 원본을 옮겨 오면 6월 영상으로 분석해 남원에 공유(추천)', 'ⓑ 산내면 드론으로 시험만', 'ⓒ 곤포 많은 읍면동 원본만 먼저'],
  [[XI, STAFF, '서비스로 보기'], [GF, GOV, '견주기 아래 곤포사일리지 시점']],
  "남원 곤포사일리지 결과는 지금 플랫폼에 있는 영상만으로는 만들 수 없습니다. 곤포를 가장 잘 보는 2025년 6월(생산기) 드론 원본이 사무실 컴퓨터에 있고 플랫폼에는 없습니다. 그래서 남원 견주기의 곤포 시점은 '고르지 않음'이고 생산량도 숫자가 없습니다.",
  "ⓐ 사무실의 6월 드론 원본을 플랫폼으로 옮겨 와 분석하고 남원에 공유합니다(남원 전체 · 가장 완전하고 시간이 가장 걸림). ⓑ 이미 플랫폼에 있는 산내면 드론 영상으로 먼저 시험만 해 봅니다(빠르지만 남원 전체가 아님). ⓒ 곤포가 많은 읍면동의 원본만 먼저 옮겨 그 읍면동부터 채웁니다. 추천은 ⓐ입니다 — 남원 담당자가 세 시점 견주기와 생산량을 끝까지 확인하려면 남원 전체가 필요합니다.")
q('대상지-검색칸', '새 프로젝트의 대상지 검색칸', ['staff-newproj-top'], ['① 안내 한 줄', "② 접어 두고 '영상 없이 지역만 정하기'로 펼치기(추천)"],
  [[APP + '/landxi/v3/lx-project/?new=1', STAFF, '프로젝트 → 새 프로젝트']],
  "새 프로젝트 창의 '대상지 · 시군구 이름을 검색' 칸은 영상 없이 만들 때만 쓰는 칸입니다. 영상을 올리거나 공유 데이터에서 고르면 대상지는 영상 자리에서 저절로 정해지는데, 칸이 늘 열려 있어 직원이 꼭 채워야 하는 칸으로 오해합니다.",
  "① 칸 위에 '영상을 올리면 대상지는 저절로 정해집니다 · 영상 없이 만들 때만 고르세요' 한 줄을 답니다. ② 칸을 접어 두고 '영상 없이 지역만 정하기'를 눌렀을 때만 펼칩니다(추천 — 화면이 가장 단순하고 오해가 없음).")
q('바깥길-한국가까이', '바깥 주소의 길을 한국 가까이로', [], ['알아보기', '지금은 안 함'],
  [[APP + '/', '—', '화면이 없는 결정']],
  "처음 방문 때 걸리는 시간의 대부분은 바깥 길입니다. 한국에서 접속하면 외국 가장자리를 거쳐 와서 요청마다 0.4~2초 왕복이 흔들립니다. 그림은 없습니다.",
  "Cloudflare 설정을 바꾸거나 요금제를 올려 한국 가까운 길로 오게 하면 처음 방문이 1~2초 더 줄 것으로 봅니다. 비용이 생기므로 '알아보기'는 가격과 효과만 먼저 알아보겠다는 뜻이고, 정하지 않으면 지금 구성 그대로 갑니다.")
q('해외-파종면적요청', '군별 파종 면적을 통계위원회에 요청', ['ov-register-pc'], YNL,
  [[OVG, OV, 'Register 탭 아래 공식 통계 표']],
  "지금 공식 숫자는 군별 '수확 면적'이라 AI가 본 경작지와 정의가 달라 차이가 크게 나는 군이 있습니다. 군별 '파종 면적'은 2013년 뒤 공개된 것이 없습니다.",
  "키르기스스탄 국가통계위원회에 군별 파종 면적을 요청합니다. 받으면 같은 정의로 견줄 수 있어 해외 기관 담당자가 우리 숫자를 믿고 쓰기 쉽습니다. 답이 올지는 알 수 없습니다.")
q('해외-주합계줄', '기관 화면에 주 합계 줄 하나 더', ['ov-register-m'], YNL,
  [[OVG, OV, 'Register 탭 아래 공식 통계 표']],
  "공식 통계는 주 단위 파종 면적이 2024년까지 공개되어 있지만 기관 화면은 자기 군 한 줄만 보입니다.",
  "기관 화면 표에 자기 군이 속한 주의 합계 줄 하나를 더 보입니다. 군 숫자만 볼 때보다 우리 숫자가 어느 정도 맞는지 감이 잡힙니다. 줄 하나가 늘 뿐이라 화면이 복잡해지지 않습니다.")
q('제안-보고서틀이름', '보고서에 이름 붙인 틀', ['gov-report-top'], YNL, [[GR, GOV, '보고서 탭']],
  "발급 목록의 '다시 받기'는 지난 고르기를 그대로 쓰지만 이름이 없어 매달 같은 보고서를 찾기 어렵습니다.",
  "자주 쓰는 결과 · 대장 · 범위를 '내 보고서 틀'로 이름 붙여 두고 한 번에 고릅니다. 매달 같은 보고서를 받는 축산과 · 농정과 담당자에게 필요합니다.")
q('제안-약속만료알림', '내려받기 약속이 끝나기 7일 전 알림', ['gov-pledges'], YNL, [[GA + '#pledges', GOV, '계정 → 이용 약속 기록']],
  "활용 기간이 끝난 뒤 개인정보가 든 파일을 받으려 하면 그제야 다시 약속해야 해서 갑자기 끊깁니다.",
  "기간이 끝나기 7일 전에 알림으로 알려 미리 약속을 새로 하게 합니다. 개인정보가 든 파일을 받는 담당자와 정보보호 담당자에게 필요합니다.")
q('제안-보이기규칙관리화면', '보이기 규칙을 관리자 화면에서', ['now-xi-list-svc'], YNL, [[ADMIN + '/landxi/v3/ops-infra/', ADM, 'LX 관리자 화면(아직 없음)']],
  "곤포사일리지 × 보령시를 보이지 않게 한 것은 데이터 한 줄로만 바꿀 수 있어, 제가 직접 바꿔야 합니다.",
  "LX 관리자 화면에서 서비스 × 시군구를 켜고 끕니다(언제 누가 바꿨는지 이력도 남김). 다른 지역 자산에 같은 결정이 생길 때 관리자가 직접 처리합니다.")
q('제안-두시점겹쳐비교', '영상 고를 때 두 시점 겹쳐 비교', ['staff-zoom-sat'], YNL, [[APP + '/landxi/v3/lx-project/?new=1', STAFF, '공유 데이터에서 고르기 → 크게 보기']],
  "같은 곳의 4월 영상과 10월 영상 중 무엇을 고를지 한 장씩 넘겨 봐야 해서 달라진 점을 눈으로 찾기 어렵습니다.",
  "크게 보기에서 두 시점을 겹쳐 가운데 선을 끌어 좌우로 견줍니다. 생육기 · 생산기 중 어느 영상이 맞는지 고르는 직원에게 필요합니다.")
q('제안-XI맵영상목록크게보기', 'XI맵 영상 목록 크게 보기', ['now-xi-list-region'], YNL, [[XI, STAFF, '왼쪽 위 목록']],
  "XI맵 목록은 시군구 · 서비스만 보이고 영상은 지도에서 직접 찾아야 합니다. 새 프로젝트의 크게 보기를 XI맵에서는 쓸 수 없습니다.",
  "XI맵 목록에서 영상 카드를 크게 봅니다(같은 모양). 지도에서 영상을 찾다 길을 잃는 직원에게 필요합니다.")
q('제안-지도에서답으로', '강조된 곳을 누르면 숫자 한 줄', ['staff-hl-hover'], YNL, [[XI + '?region=52190', STAFF, '질문 후 강조된 읍면동 누르기']],
  "답에서 강조된 읍면동의 숫자를 보려면 답 띠의 글로 돌아가 찾아야 합니다.",
  "지도에서 강조된 읍면동을 누르면 그곳 숫자 한 줄(예: 운봉읍 9,879곳)이 그 자리에서 뜹니다. 지도와 답을 오가는 직원에게 필요합니다.")
q('제안-조건풀기한단추', '조건 풀기와 강조 걷기를 한 단추로', ['staff-hl-q2'], YNL, [[XI + '?region=52190', STAFF, '"그중 가장 큰 곳은?" 뒤']],
  "이어 물은 뒤 처음으로 돌아가려면 '전체 다시 보기'를 눌러도 걸린 조건과 지도 강조를 따로 풀어야 합니다.",
  "한 단추로 조건을 풀고 강조도 걷어 처음 상태로 돌립니다. 이어 묻기를 자주 하는 직원에게 필요합니다.")
q('제안-대시보드방향키', '대시보드 칸 크기를 키보드 방향키로', ['staff-dash-edit'], YNL, [[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 수정하기']],
  "칸 크기는 마우스로 끌어야만 바꿀 수 있어 마우스를 못 쓰는 직원은 바꾸지 못합니다.",
  "칸을 고르고 방향키로 크기를 조절합니다. 마우스를 쓰기 어려운 직원도 같은 기능을 씁니다.")

items = [dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요. 그림은 모두 지금 새로 찍은 것입니다.', items=A)]
items.append(dict(section='B. 새 질문', desc='이번 바퀴에 고를 것입니다. 고르지 않고 한 줄 적으셔도 됩니다. 아직 만들지 않은 모양은 그림이 아니라 글로만 적었습니다.', items=Q))
# ───────── 알림 ─────────
import subprocess as _sp


def natl():
    sys.path.insert(0, os.path.join(ROOT, 'server'))
    from national.common import pg
    with pg() as c:
        rows = c.execute("select asset, state, count(*), coalesce(sum(target_km2),0) from national_cells where year=2025 group by 1,2").fetchall()
    d = {}
    for a, s, n, k in rows:
        e = d.setdefault(a, dict(done=0, total=0, dn=0, tn=0))
        e['total'] += float(k); e['tn'] += n
        if s == 'done': e['done'] += float(k); e['dn'] += n
    return d


N = natl()
def pc(a): return round(100 * N[a]['done'] / N[a]['total'], 1)
now_t = datetime.datetime.now().strftime('%H:%M')
INFO = [
    dict(id='알림-재검수', t='재검수: 진짜 고장 4 모두 고침', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
         what="전 화면을 다시 점검해 진짜 고장 4개를 찾아 모두 고쳤습니다: 영상 크게 보기에서 앞 · 다음 영상으로 넘길 때 '불러오는 중'이 길게 붙던 것 · XI ChatGEO 첫 질문에서 지도 강조가 간헐로 빠지던 것 · 관할 밖 답 뒤에 앞 강조가 남던 것 · 같은 이름의 결과 층 둘이 이름이 겹쳐 보이던 것(이제 분석한 날로 구분). 나머지 7건은 점검 도구가 잘못 읽은 것이었고 화면은 정상이었습니다. 바깥 주소 왕복 때문에 2~3초 걸리는 곳(기관 첫 답 · 영농 탭 첫 열기)은 한계로 두었습니다."),
    dict(id='알림-해외멈춤', t='해외 다시 돌리기 멈춤', shots=[], opts=['확인'], where=[[OVG, OV, '해외 기관 첫 화면']],
         what="사용자 지시('해외는 당분간 하지 않는다. 국내 먼저')로 해외 다시 돌리기를 멈췄습니다. 그래서 해외 화면의 숫자와 지도는 멈추기 전의 예전 값 그대로입니다. 멈췄던 원인(큰 영상 파일을 읽다가 멈추던 것)은 고쳐 두었고, 이미 끝난 결과는 보관했습니다. 국내가 끝나면 이어서 돌립니다."),
    dict(id='알림-국내전국분석', t='국내 전국 분석 진행 상황', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
         what=f"2025년 전국 분석 진행입니다(실패한 곳을 포함한 전체 넓이 대비 끝난 넓이). 농지는 끝난 곳 {N['farm']['dn']:,}칸 · {N['farm']['done']:,.0f}㎢ / 전체 {N['farm']['total']:,.0f}㎢ = {pc('farm')}%, 하천은 끝난 곳 {N['river']['dn']:,}칸 · {N['river']['done']:,.0f}㎢ / 전체 {N['river']['total']:,.0f}㎢ = {pc('river')}%입니다. 16시 50분 기준 농지 39% · 하천 35%에서 크게 늘지 않았고, 속도를 점검 중입니다."),
]
items.append(dict(section='C. 알림', desc='고를 것은 없고 알려 드리는 글입니다.', items=INFO))

nA, nQ, nI = len(A), len(Q), len(INFO)
jf = os.path.join(SH, 'confirm-items-r20.json')
for sec in items:
    for it in sec['items']:
        for k in ('what', 'now', 'prop', 't'):
            if k in it: it[k] = nb(it[k])
json.dump(items, open(jf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(dict(fv=FV, national=N), open(os.path.join(SH, 'r20-numbers.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if REAL:
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items-r20.json'))
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items.json'))
print('구현 확인', nA, '· 질문', nQ, '· 알림', nI, '· 합', nA + nQ + nI)
lead = f"구현 확인 {nA} · 새 질문 {nQ} · 알림 {nI}입니다. 그림은 모두 지금 바깥 주소에 로그인 폼으로 들어가 새로 찍었습니다(찍은 시각 표기). 고르시면 이 브라우저에 저장되고, 맨 아래 '결정 복사'로 대화창에 붙여 주세요."
env = dict(os.environ, LX_CONFIRM_ITEMS=jf, LX_CONFIRM_ROUND=('now' if REAL else DRAFT), LX_CONFIRM_EXTRA=SH + ';' + EV, PYTHONIOENCODING='utf-8',
           LX_CONFIRM_TITLE='답을 기다리는 것', LX_CONFIRM_LEAD=lead)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review', 'build-confirm.py')], env=env, check=True)
out = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm', 'now') if REAL else DRAFT
h = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
miss = [m for m in re.findall(r'src="(img/[^"]+)"', h) if not os.path.exists(os.path.join(out, m))]
print('굽은 곳', out, '· 그림 태그', h.count('<img'), '· 없는 그림', miss)
