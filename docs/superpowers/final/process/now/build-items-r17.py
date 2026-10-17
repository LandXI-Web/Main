"""바퀴 17 now 항목 JSON 만들기 + 페이지 굽기.
사용: python build-items-r17.py <shots-r17 폴더> [--real]
  기본 = 시험 굽기: 스크래치 폴더(LX_R17_DRAFT 또는 기본 now-r17-draft)에만 만든다. now 는 건드리지 않는다.
  --real = 진짜 굽기: landxi/proto/review/confirm/now 에 굽는다(지난 now 보관은 따로 먼저 — 이 스크립트는 하지 않는다).
그림: 새로 찍은 것(shoot-r17.mjs · 이름 끝 네 자리 = 찍은 시각) + 구현 증거(impl-43/*, 구현 때 그림).
구현 증거 항목은 실행할 때마다 items.json 을 다시 읽으므로 XI맵 에이전트가 고친 것이 그대로 따라온다."""
import glob, json, os, re, shutil, subprocess, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
IMPL = os.path.join(PR, 'impl-43')
NOW = os.path.join(PR, 'now')
SH = os.path.abspath(sys.argv[1])
REAL = '--real' in sys.argv
DRAFT = os.environ.get('LX_R17_DRAFT', r'C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad\now-r17-draft')
APP, ADMIN, ORG, OVS = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev', 'https://kgz-agri.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
OV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (해외 기관 로그인 폼)'
XI = APP + '/landxi/v3/xi-clean/'
EV = os.path.join(SH, 'ev'); os.makedirs(EV, exist_ok=True)   # 구현 때 그림 모음(이름 앞에 폴더 표시를 붙여 겹침 방지)


def has(base):
    return bool(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    return os.path.basename(f[-1])


def Sopt(base):
    return [S(base)] if has(base) else []


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b)); return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    bs = [b for b in bs if has(b)]
    if not bs: return ''
    ts = sorted(hm(b) for b in bs)
    d = datetime.date.today()
    return f'(그림 찍은 시각 {d.month}월 {d.day}일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def ev(folder, rel, prefix, rename=None):
    """구현 증거 그림을 SH/ev 로 모은다. 없으면 None. 이름 = prefix + 원래 이름(rename 이 있으면 그 이름)."""
    for sub in ('', 'shots/'):
        src = os.path.join(IMPL, folder, sub + rel)
        if os.path.exists(src):
            name = rename or (prefix + os.path.basename(rel))
            shutil.copy2(src, os.path.join(EV, name))
            return name
    return None


def evlist(folder, rels, prefix):
    return [x for x in (ev(folder, r, prefix) for r in rels if r.lower().endswith(('.png', '.jpg'))) if x]


def when(folder, rels):
    ts = []
    for r in rels:
        for sub in ('', 'shots/'):
            p = os.path.join(IMPL, folder, sub + r)
            if os.path.exists(p):
                ts.append(datetime.datetime.fromtimestamp(os.path.getmtime(p))); break
    if not ts: return ''
    a, b = min(ts), max(ts)
    f = lambda t: f'{t.month}월 {t.day}일 {t:%H:%M}'
    return ' (구현 때 그림 ' + (f(a) if f(a) == f(b) else f'{f(a)}–{f(b)}') + ')'


def load(folder):
    return json.load(open(os.path.join(IMPL, folder, 'items.json'), encoding='utf-8'))


DONE = ['완료', '다시']
A = []
# ── 정한 것의 구현 (decisions-r17) — '배포이름-적용'은 아래 질문으로
for it in load('decisions-r17'):
    if it['id'] == '배포이름-적용':
        continue
    shots = [x for x in (ev('decisions-r17', s, 'dec-') for s in it['shots']) if x]
    A.append(dict(id=it['id'], t=it['t'], shots=shots, opts=DONE, where=it['where'], what=it['what'] + when('decisions-r17', it['shots'])))
# ── 이름 · 로고 · 모토 (brand-r17) — 이 폴더 항목에는 보는 곳 · 설명이 없어 여기서 채운다
BR = {
    '로고-같게': ([[APP + '/landxi/v3/login/', '로그인 전', '왼쪽 위 글자'], [APP + '/landxi/v3/main/', '로그인 전', '왼쪽 위 글자']], '로그인과 메인 왼쪽 위 LAND-XI PLATFORM 글자 · 크기 · 자리를 같게 맞췄습니다. 전 · 후 그림으로 비교해 주세요.'),
    '로그인-출처뺌': ([[APP + '/landxi/v3/login/', '로그인 전', '오른쪽 위']], "로그인 화면 오른쪽 위의 'NASA · © V-World' 글을 뺐습니다. 다른 지도 화면의 출처 표시는 그대로입니다."),
    '모토-Hyper한번': ([[APP + '/landxi/v3/main/', '로그인 전', '맨 아래 모토']], "메인 맨 아래 모토를 'Hyper Performance · Solution · GeoAI'로, Hyper 를 한 번만 쓰게 바꿨습니다(PC · 모바일)."),
    '로그인뒤-지도깜빡임': ([[APP + '/', STAFF, '로그인 단추를 누른 직후']], '로그인 단추를 누른 뒤 첫 화면이 나오기 전에 지도가 화면 가득 번쩍이던 것을 없앴습니다(관리자 · 직원 · 영업 모두 전 · 후 비교).'),
    '모토-다른화면': ([[APP + '/landxi/v3/service-detail/', STAFF, '서비스 상세 맨 아래'], [APP + '/landxi/v3/sales/', '영업 계정', '맨 아래']], "서비스 상세와 영업 화면 맨 아래 모토 줄도 'Hyper Performance · Solution · GeoAI'(Hyper 한 번)로 맞췄습니다. 글자만 바뀐 항목이라 그림은 없습니다."),
    '모바일-로고간격': ([[APP + '/landxi/v3/main/', '휴대폰 폭 390', '맨 위']], '모바일(390) 메인 위쪽 로고와 메뉴 사이 간격을 벌렸습니다. 다른 폭은 그대로입니다.'),
}
for it in load('brand-r17'):
    wh, what = BR[it['id']]
    shots = [x for x in (ev('brand-r17', s, 'br-') for s in it['shots']) if x]
    A.append(dict(id=it['id'], t=it['title'], shots=shots, opts=DONE, where=wh, what=what + when('brand-r17', it['shots'])))
# ── 맞춤 대시보드 (dashboard-custom) — 오늘 바깥 주소에서 찍은 그림을 맨 앞에(찍힌 것만), 뒤에 구현 때 그림
LIVE = {'대시보드-맞춤배치': ['now-dash-staff', 'now-dash-edit-1440'], '대시보드-크기고정': ['now-dash-edit-1440'], '대시보드-빈칸': ['now-dash-edit-1440'],
        '대시보드-한줄셋': ['now-dash-row3-1440', 'now-dash-staff-1920', 'now-dash-staff-1366'], '대시보드-크기별화면': ['now-dash-staff-1920', 'now-dash-staff-1366']}
for k, it in enumerate(load('dashboard-custom')):
    lv = [b for b in LIVE.get(it['id'], []) if has(b)]
    shots = [S(b) for b in lv] + evlist('dashboard-custom', it['evidence'], 'dc-')
    extra = (' ' + T(*lv) + ' 앞쪽 그림은 오늘 바깥 주소에서 찍은 것이고 나머지는 구현 때 그림입니다.') if lv else ''
    A.append(dict(id=it['id'], t=it['t'], shots=shots, opts=DONE, where=[[APP + '/landxi/v3/lx-console/', STAFF, '오른쪽 위 대시보드 수정하기']],
                  what=it['now'] + extra + when('dashboard-custom', it['evidence'])))
# ── XI맵 (ximap-layout) — 다른 에이전트가 아직 고치는 중일 수 있어 마지막에 읽는다. 시안은 아래 질문으로
SIAN = None
for it in load('ximap-layout'):
    if it['id'].endswith('-시안'):
        SIAN = it; continue
    live = Sopt('now-xi-list-lvl1') if it['id'] == '왼쪽위-단계' else []
    A.append(dict(id=it['id'], t=it['t'], shots=live + evlist('ximap-layout', it['evidence'], 'xl-'), opts=DONE,
                  where=[[XI, STAFF, '지도 위 · 아래 XI ChatGEO']], what=it['now'] + when('ximap-layout', it['evidence'])))
_dec = {x['id'] for x in load('decisions-r17')}
_pending = [n for i, n in [('해외-첫화면속도', '해외 첫 화면 느림'), ('해외군-추천질문-고침', '해외 군 추천 질문')] if i not in _dec]
items = [dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요. 그림 중 구현 때 그림은 그때 찍은 시각을 적었습니다.', items=A)]

# ── 질문 · 제안
Q = []
sian_shot = ev('ximap-layout', 'sian-왼쪽위-단계-B-1440.png', '', rename='mock-왼쪽위-단계-B-1440.png')
Q.append(dict(id='왼쪽위-단계-시안', t='왼쪽 위 목록 — 단계 넘기기(구현한 안)와 한 화면 2단(시안) 중 어느 쪽으로 갈까요', shots=[x for x in [sian_shot, ev('ximap-layout', 'after-1440-list-lvl2.png', 'xl-')] if x],
              opts=['이 안', '구현한 안'], where=[[XI, STAFF, '왼쪽 위 한 줄 누르기']],
              now=SIAN['now'] if SIAN else '', prop='시안(첫 그림)은 한 화면에서 시도 칩을 고르면 시군구 칩이 깔리고, 시군구 칩을 누르면 그 자리에서 서비스가 펼쳐집니다. 둘째 그림은 지금 구현한 단계 넘기기입니다.'))
Q.append(dict(id='배포이름-적용', t='새 기록 이름 규칙을 쓰고, 이미 저장된 12건 이름도 바꿀까요',
              shots=[x for x in [ev('decisions-r17', 'deploy-name-now-2314.png', '', rename='now-deploy-name-2314.png'), ev('decisions-r17', 'deploy-name-draft-2314.png', '', rename='mock-deploy-name-draft-2314.png')] if x],
              opts=['새 규칙 + 12건 모두', '새 규칙만', '그대로'], where=[[ADMIN + '/landxi/v3/ops-infra/?view=deploys', ADM, '배포 → 기관 공유']],
              now="배포 기록 이름 끝에 '· 적용'이 붙습니다. 지금 어느 화면에도 글자로는 나오지 않고, 저장된 기록 12건과 서버가 새 기록을 만들 때 쓰는 이름입니다(그림의 흰 상자는 실제 기록 이름 6건을 예시로 얹은 것). 화면 용어는 '기관에 공유'로 통일했습니다.",
              prop="새 기록 이름 끝을 '· 기관에 공유'로 바꾸고, 이미 저장된 12건도 같이 바꿀지 골라 주세요. 첫 그림이 지금, 둘째 그림이 시안입니다."))
Q.append(dict(id='해외-줄어듦빨강', t='해외 첫 화면의 작황 하락(줄어든 곳)을 빨간색으로 바꿨습니다 — 그대로 둘까요',
              shots=[x for x in [ev('decisions-r17', 'ov-crop-before-2229.png', '', rename='old-ov-crop-before-2229.png')] + Sopt('now-ov-crop-drop') + Sopt('now-ov-sprawl') if x],
              opts=['그대로', '되돌림'], where=[[OVS + '/', OV, 'Season 탭(작황 하락) · Sprawl 탭']],
              now='이전에는 줄어든 칸이 연한 색이라 멀리서 잘 안 보였습니다(첫 그림 옛 화면). 지금은 붉은 칸으로 또렷하게 보입니다(둘째 그림은 오늘 바깥 주소). 셋째는 Sprawl 탭입니다. ' + T('now-ov-crop-drop', 'now-ov-sprawl'),
              prop="그대로 쓰면 이 빨강을 유지하고, '되돌림'이면 이전 색으로 돌립니다."))
Q.append(dict(id='제안-맞춤대시보드', t='제안: 맞춤 대시보드(칸 끌기 · 크기 · 달력)를 LX 관리자 · 기관 첫 화면에도', shots=Sopt('now-dash-staff') + Sopt('now-dash-admin') + Sopt('now-dash-gov'),
              opts=['둘 다', '관리자만', '기관만', '직원만 두기'], where=[[APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드'], [ADMIN + '/', ADM, 'LX 관리자 대시보드'], [ORG + '/', GOV, '기관 첫 화면']],
              now='칸 끌어 바꾸기 · 크기 조절 · 달력은 LX 직원 대시보드에만 있습니다(첫 그림). 관리자(둘째)와 기관(셋째)은 고정 배치입니다. ' + T('now-dash-staff', 'now-dash-admin', 'now-dash-gov'),
              prop='같은 부품을 관리자(기관 · 배포 · 승인 요청 · 장비 칸 + 승인 기한 · 배포 날짜 달력)와 기관(내 요청 · 새 결과 · 보고서 칸 + 요청 · 결과 날짜 달력)에도 씁니다. 왜: 세 역할 모두 보는 순서가 다르고, 한 부품이면 익히기 쉽습니다.'))
Q.append(dict(id='제안-희망완료일', t="제안: 분석 요청에 '희망 완료일' 칸", shots=Sopt('now-gov-request'), opts=['넣음', '안 넣음'], where=[[ORG + '/landxi/v3/gov-request/', GOV, '요청하기']],
              now="지금 분석 요청에는 '언제까지'가 없어 달력이 지난 일만 보여 줍니다. " + T('now-gov-request'),
              prop="요청 양식에 '희망 완료일' 한 칸(선택)을 둡니다. 그러면 달력이 앞으로의 일을 보여 주고, 요청함 숫자 옆에 '기한 지난 n'도 같은 출처로 셉니다."))
Q.append(dict(id='미룬-채팅자동완성', t='미뤄 둔 결정 1: XI ChatGEO 입력 줄에 미리 후보(자동완성)', shots=Sopt('now-xi-chat-typing'), opts=['넣음', '안 넣음', '나중에'], where=[[XI, STAFF, '아래 입력 줄에 글자 치기']],
              now='입력 줄에 글자를 쳐도 후보가 미리 뜨지 않습니다. 시군구 · 지번 이름을 끝까지 쳐야 합니다. ' + T('now-xi-chat-typing'),
              prop='두세 글자만 쳐도 시군구 · 읍면동 후보를 입력 줄 위에 보이고, 누르면 그곳으로 이동합니다.'))
Q.append(dict(id='미룬-지번색인', t='미뤄 둔 결정 2: 지번 색인(지번을 미리 정리해 빨리 찾기)', shots=Sopt('now-xi-parcel-typing'), opts=['만듦', '나중에'], where=[[XI, STAFF, '아래 입력 줄에 지번 치기']],
              now='지번을 치면 그때그때 찾습니다. 처음 찾을 때는 시간이 더 걸릴 수 있습니다. ' + T('now-xi-parcel-typing'),
              prop='전국 지번을 미리 색인으로 정리해 두어, 지번을 치면 바로 그 필지로 갑니다. 색인을 만드는 시간 · 저장 공간이 듭니다.'))
Q.append(dict(id='미룬-지난그림지움', t='미뤄 둔 결정 3: 지난 now 페이지 그림 66장 지우기', shots=[], opts=['지움', '그대로'], where=[[APP + '/', '관리자 확인 페이지 보관 폴더', '지난 now 보관 폴더']],
              now='지난 바퀴마다 보관해 둔 now 페이지의 그림이 모두 66장 쌓여 있습니다. 그림 자체가 확인 기록의 일부이기도 합니다.',
              prop='그림 파일 66장만 지웁니다. 글로 된 지난 질문 · 답은 그대로 남습니다.'))
INFO = []
INFO.append(dict(id='알림-재검수', t='재검수를 Haiku 5.5 여러 개로 동시에 돌림 — 화면 6묶음 · 진짜 고장 2 · 나머지 오판', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
    what='화면 6묶음을 Haiku 5.5 여러 개로 동시에 다시 눌러 보았습니다. 진짜 고장은 2건(해외 첫 화면 느림 · 해외 군 추천 질문)이고 나머지는 오판이었습니다.'
         + (' 두 건 모두 고쳐서 위 구현 확인에 올렸습니다.' if not _pending else ' 고치는 것: ' + ' · '.join(_pending) + ' — 반영 중입니다. 다 되면 구현 확인으로 올립니다.')))
INFO.append(dict(id='알림-남원영농', t='운영 중인 남원 영농관리 사이트 분석 · 고도화 진행 중', shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
    what='운영 중인 남원 영농관리 사이트 분석 · 고도화 진행 중 — 다음 now 에서 비교표와 질문을 올립니다.'))
items.append(dict(section='B. 새 질문 · 제안', desc='이번 바퀴에 고를 것입니다. 시안이라고 쓴 그림은 아직 만들지 않은 모양입니다.', items=Q))
items.append(dict(section='C. 알림', desc='고를 것은 없고 알려 드리는 두 줄입니다.', items=INFO))

nA, nQ = len(A), len(Q)
nI = len(INFO)
jf = os.path.join(SH, 'confirm-items-r17.json')
json.dump(items, open(jf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if REAL:
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items-r17.json'))
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items.json'))
print('구현 확인', nA, '· 질문', nQ, '· 합', nA + nQ + nI)

# ── 굽기. 시험 = ROUND 에 절대 경로를 주면 build-confirm 이 그 경로에 만든다(now 는 건드리지 않음)
lead = f"구현 확인 {nA} · 새 질문과 제안 {nQ} · 알림 {nI}입니다. 새 그림은 바깥 주소에 로그인 폼으로 들어가 찍었고, 구현 때 그림은 찍은 시각을 적었습니다. 고르시면 이 브라우저에 저장되고, 맨 아래 '결정 복사'로 대화창에 붙여 주세요."
env = dict(os.environ, LX_CONFIRM_ITEMS=jf, LX_CONFIRM_ROUND=('now' if REAL else DRAFT), LX_CONFIRM_EXTRA=SH + ';' + EV, PYTHONIOENCODING='utf-8',
           LX_CONFIRM_TITLE='답을 기다리는 것 — 지금 화면 기준', LX_CONFIRM_LEAD=lead)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review', 'build-confirm.py')], env=env, check=True)
out = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm', 'now') if REAL else DRAFT
h = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
miss = [m for m in re.findall(r'src="(img/[^"]+)"', h) if not os.path.exists(os.path.join(out, m))]
print('굽은 곳', out, '· 그림 태그', h.count('<img'), '· 없는 그림', miss)
