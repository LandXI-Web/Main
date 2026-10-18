"""바퀴 18 now 항목 JSON 만들기 + 페이지 굽기.
사용: python build-items-r18.py <shots-r18 폴더> [--real]
  기본 = 시험 굽기: 스크래치 폴더(LX_R17_DRAFT 또는 기본 now-r18-draft)에만 만든다. now 는 건드리지 않는다.
  --real = 진짜 굽기: landxi/proto/review/confirm/now 에 굽는다(지난 now 보관은 따로 먼저 — 이 스크립트는 하지 않는다).
그림: 새로 찍은 것(shoot-r18.mjs · 이름 끝 네 자리 = 찍은 시각) + 구현 증거(impl-44/*, 구현 때 그림).
구현 증거 항목은 실행할 때마다 items.json 을 다시 읽으므로 XI맵 에이전트가 고친 것이 그대로 따라온다."""
import glob, json, os, re, shutil, subprocess, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
IMPL = os.path.join(PR, 'impl-44')
NOW = os.path.join(PR, 'now')
SH = os.path.abspath(sys.argv[1])
REAL = '--real' in sys.argv
DRAFT = os.environ.get('LX_R17_DRAFT', r'C:\Users\User\AppData\Local\Temp\claude\E--Land-XI----\8755e9e1-c9d4-4ccc-ae31-8eb0e35a24df\scratchpad\now-r18-draft')
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


def add(id, t, live, evs, where, what, folder=None, prefix=''):
    lv = [b for b in live if has(b)]
    shots = [S(b) for b in lv]
    if folder:
        shots += [x for x in (ev(folder, s, prefix) for s in evs) if x]
    tm = (' ' + T(*lv) + ' 앞쪽 그림은 오늘 바깥 주소에서 로그인 폼으로 새로 찍은 것입니다.') if lv else ''
    A.append(dict(id=id, t=t, shots=shots, opts=DONE, where=where, what=what + tm + (when(folder, evs) if folder else '')))


def pngs(rels):
    return [r for r in rels if r.lower().endswith('.png')]


for it in load('dashboard-theme'):
    add(it['id'], it['t'], ['now-dash-staff', 'now-dash-theme'] if it['id'] == '대시보드-테마' else ['now-dash-staff'], pngs(it['evidence']), [[APP + '/landxi/v3/lx-console/', STAFF, '오른쪽 위 대시보드 수정하기 → 테마 · 달력']], it['now'], 'dashboard-theme', 'dt-')
for it in load('ximap-list2'):
    add(it['id'], it['t'], ['now-xi-list-1', 'now-xi-list-2', 'now-xi-list-3'], pngs(it['evidence']), [[XI, STAFF, '왼쪽 위 한 줄 누르기']], it['now'], 'ximap-list2', 'xl-')
for it in load('overseas-accuracy'):
    if it.get('kind') == 'question':
        continue
    add(it['id'], it['t'], ['now-ov-crop-drop', 'now-ov-near'], it['shots'], it['where'], it['what'], 'overseas-accuracy', 'oa-')
ri = load('request-due')['items'][0]
add(ri['id'], ri['title'], ['now-gov-request'], ri['evidence'], [[ORG + '/landxi/v3/gov-request/', GOV, '요청하기 → 희망 완료일']],
    "분석 요청 양식에 '희망 완료일'(선택 · 오늘 이후 날짜)이 생겼고, 3일 안이면 차분히 강조됩니다. 기관 · LX 요청 목록과 상세에도 같은 날짜가 보입니다. " + ri['note'], 'request-due', 'rd-')
nw = load('nw-farm')
for it in nw['items']:
    live = ['now-gov-stats'] if it['id'] == 'farm-class-stats' else ['now-gov-fusion']
    add(it['id'], it['title'], live, [it['before'], it['after']] + it.get('more', []), [[ORG + it['where'].split(' ')[0], GOV, it['where']]],
        '운영 중인 영농관리 사이트를 보고 우리에게 없던 핵심을 바로 구현했습니다. 확인한 것: ' + it['check'], 'nw-farm', 'nf-')
add('배포이름', "배포 기록 이름 끝에 '· 기관에 공유'(새 규칙 + 저장된 12건)", ['now-admin-shares'], [], [[ADMIN + '/landxi/v3/ops-infra/#/deploys', ADM, '배포 → 기관 공유']],
    "배포 기록 이름 끝을 '· 기관에 공유'로 바꿨습니다(새로 만드는 기록 + 이미 저장된 12건). 화면에는 글자로 나오지 않는 저장 이름이라 그림은 관리자 기관 공유 목록입니다.")
add('지도서비스-도움말뺌', "지도 서비스 제목 옆 '이 화면은?' 링크를 뺐습니다", ['now-lx-map'], [], [[APP + '/landxi/v3/lx-map/', STAFF, '지도 서비스 왼쪽 제목']],
    "지도 서비스 제목 옆에 있던 '이 화면은?' 링크를 없앴습니다. 그림 왼쪽 위 '지도 서비스' 제목 옆이 비어 있는지 봐 주세요.")
A.append(dict(id='중복로그인', t='개발 중 로그인 제한을 넉넉하게 — 에이전트와 사용자가 서로 쫓아내지 않게', shots=[], opts=DONE, where=[[APP + '/', STAFF, '로그인 화면']],
              what='개발하는 동안 바깥 주소의 로그인 동시 접속 제한을 넉넉하게 풀어, 에이전트와 사용자가 서로 로그인을 막지 않습니다. 비밀번호를 5번 틀리면 잠기는 규칙은 그대로입니다. 글로만 알리는 항목이라 그림은 없습니다.'))
OVC = {'해외-첫화면속도': (['now-ov-cold-first'], '해외 첫 화면 속도 — 처음 열 때 숫자가 나오기까지 시간을 줄였습니다(바로 군으로 열고 숫자를 먼저).', [[OVS + '/landxi/v3/global/', OV, '처음 여는 브라우저로 첫 화면']]),
       '해외군-추천질문-고침': (['now-ov-chips', 'now-ov-chip-answer'], '해외 군 화면 XI ChatGEO 추천 질문이 눌리고 답이 나오게 고쳤습니다.', [[OVS + '/landxi/v3/global/', OV, '오른쪽 아래 XI ChatGEO → 추천 질문 누르기']])}
for k, (lv, w, wh) in OVC.items():
    add(k, w.split(' — ')[0].rstrip('.'), lv, [], wh, w)
items = [dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요. 구현 때 그림은 그때 찍은 시각을 적었습니다.', items=A)]

Q = []
chat = [ev('ximap-chat-options', f'sian-{k}-1440.png', '', rename=f'mock-chat-{k}-1440.png') for k in 'ABC']
Q.append(dict(id='XI-ChatGEO-자리', t='XI ChatGEO 자리 — 지도를 덜 먹게 세 시안 중 어디로 갈까요', shots=[x for x in chat if x],
              opts=['A 영역 나누기', 'B 지도 안 작은 카드', 'C 아래 시트(추천)', '다시 생각'], where=[[XI, STAFF, '지도 아래 XI ChatGEO']],
              now='지금은 지도 위에 채팅 창이 떠서 답이 오면 지도를 덮습니다. 두 번 고쳐도 겹쳐 보여, 구조를 고르려 합니다. 세 그림은 시안이고 아직 구현하지 않았습니다. A = 오른쪽 칸 나누기(폭 끌기) · B = 지도 안 작은 카드(최근 답 한 장) · C = 아래에서 끌어 올리는 시트(접기 · 반 · 전체).',
              prop='추천 C: 접으면 B 와 같고 전체로 올리면 A 처럼 대화가 다 보이며, 지도 폭은 그대로이고 사람마다 높이를 기억합니다. 시트가 올라온 동안 왼쪽 아래 칸은 시트 위로 올라서게 합니다.'))
Q.append(dict(id='해외-줄어듦빨강', t='해외 첫 화면의 빨간 칸(작황 하락) — 어떻게 보여 줄까요',
              shots=[x for x in [ev('overseas-accuracy', 'ov-nearer-before-2257.png', '', rename='old-ov-nearer-before-2257.png')] if x] + Sopt('now-ov-crop-drop') + Sopt('now-ov-near'),
              opts=['빨강 유지', '가까이에서만 빨강', '빨강 끄고 숫자만'], where=[[OVS + '/landxi/v3/global/', OV, 'Season 탭 첫 화면 → 휠로 확대']],
              now="빨간 칸은 '작년 같은 계절보다 덜 푸른 밭'입니다. 첫 그림은 전(옛 화면), 둘째는 지금 첫 화면, 셋째는 가까이 확대한 모습입니다. " + T('now-ov-crop-drop', 'now-ov-near'),
              prop='빨강 유지 = 어디를 현장 확인할지 바로 보임 · 가까이에서만 = 첫 화면은 숫자만 깔끔하고 확대하면 밭이 보임 · 끄고 숫자만 = 가장 단순하지만 어디인지 알 수 없음.'))
Q.append(dict(id='해외-처음방문', t='해외 첫 화면 — 처음 방문 때 지구본에서 나라, 군으로 날아가는 장면을 어떻게 할까요', shots=Sopt('now-ov-cold-first'),
              opts=['바로 군으로(지금)', '날아가는 장면 되살림', '짧게(1초)'], where=[[OVS + '/landxi/v3/global/', OV, '처음 여는 브라우저로 첫 화면']],
              now='처음 방문 때 날아가는 장면을 빼고 바로 군으로 열면 숫자가 6초 빨리 보입니다. 지금은 바로 군으로 열립니다. ' + T('now-ov-cold-first'),
              prop='바로 군으로(지금) · 날아가는 장면 되살리기(숫자가 6초 늦게 보임) · 1초로 줄이기 중에 골라 주세요.'))
GPU = [('해외-경작지재학습', '해외 다시 돌리기 1: 경작지 모델 다시 학습 + 나라 전체 다시 돌리기', '산기슭 풀밭 · 강바닥이 섞이는 6군을 경작지 아님으로 가르도록 모델을 다시 학습하고, 나라 전체를 다시 돌려 공개 지도 9군도 우리 결과로 채웁니다. GPU 를 오래 씁니다(승인 필요).'),
       ('해외-2017건물', '해외 다시 돌리기 2: 2017 건물 영상을 2025 와 같은 기준으로 다시 돌리기', "'건물 늘어남' 숫자를 믿을 수 있게 같은 기준으로 맞춥니다. GPU 를 씁니다(승인 필요)."),
       ('해외-작황10m', '해외 3: 작황 하락을 서버에서 10 m 로 한 번 재서 보관', '밭 하나 단위로 보이게 됩니다. 서버 CPU 계산이라 GPU 는 쓰지 않습니다.')]
for i, t, p in GPU:
    Q.append(dict(id=i, t=t, shots=[], opts=['넣음', '나중에'], where=[[OVS + '/landxi/v3/global/', OV, '해외 첫 화면']], now='해외 정확도 점검에서 나온 제안입니다. 그림은 없습니다.', prop=p))
for q in nw['questions']:
    sh = []
    if q['id'] == 'q1-feedcrop':
        s = ev('nw-farm', 'shots/sian-q1-feedcrop-compare.png', '', rename='mock-q1-feedcrop.png')
        sh = [s] if s else []
    Q.append(dict(id='영농-' + q['id'], t='영농관리: ' + q['title'], shots=sh, opts=q['options'], where=[[ORG + '/', GOV, '기관 서비스 화면']],
                  now='운영 중인 영농관리 사이트를 분석해 나온 질문입니다.' + (' 그림은 우리가 만든 시안입니다(숫자 없음).' if sh else ''), prop=q.get('why', '고른 안대로 다음 바퀴에 만듭니다.')))
Q.append(dict(id='영농-행정정보목록', t='제안: 행정정보 주제별 목록(기준일 · 건수 · 등록자)', shots=[], opts=['넣음', '안 넣음'], where=[[ORG + '/landxi/v3/gov-fusion/', GOV, '행정 자료 올리기']],
              now='올린 대장을 회차별로 찾는 목록이 없습니다.', prop='담당자가 올린 대장을 기준일 · 건수 · 등록자로 한눈에 찾습니다. 운영 중인 사이트에 있는 화면입니다.'))
Q.append(dict(id='영농-직위칸', t='제안: 사용자 관리에 직위 칸', shots=[], opts=['넣음', '안 넣음'], where=[[ORG + '/landxi/v3/gov-accounts/', GOV, '사용자 관리']],
              now='사용자 관리에 부서는 있고 직위 칸이 없습니다.', prop='이름 · 부서 옆에 직위 한 칸을 둡니다. 운영 중인 사이트에도 있습니다.'))
Q.append(dict(id='제안-공휴일빨강', t='제안: 공휴일도 달력에 빨강으로', shots=Sopt('now-dash-staff'), opts=['넣음(키 신청)', '안 넣음'], where=[[APP + '/landxi/v3/lx-console/', STAFF, '대시보드 달력']],
              now='지금은 토 · 일만 빨강이고 공휴일은 믿을 출처가 없어 넣지 않았습니다. ' + T('now-dash-staff'),
              prop="공공데이터포털 '특일 정보' API 키를 신청해야 합니다(무료). 키가 나오면 공휴일 · 대체공휴일을 같은 빨강으로 보여 줍니다."))
Q.append(dict(id='제안-XI맵-마지막분석', t='XI맵 제안 1: 시군구 칩에 마지막 분석 날짜', shots=Sopt('now-xi-list-3'), opts=['넣음', '안 넣음'], where=[[XI, STAFF, '왼쪽 위 한 줄 누르기']],
              now='시군구 칩에는 이름과 서비스 수만 있습니다. ' + T('now-xi-list-3'), prop='칩에 마지막 분석 날짜를 작게 붙여, 오래된 결과를 한눈에 가립니다.'))
Q.append(dict(id='제안-XI맵-서비스로보기', t="XI맵 제안 2: '서비스로 보기' 전환", shots=Sopt('now-xi-list-3'), opts=['넣음', '안 넣음'], where=[[XI, STAFF, '왼쪽 위 목록']],
              now='지금 목록은 지역(시도 → 시군구) 순서로만 봅니다. ' + T('now-xi-list-3'), prop="'서비스로 보기'를 누르면 같은 목록을 서비스(예: 곤포사일리지) 기준으로 묶어 어느 지역에 있는지 보여 줍니다."))
INFO = [dict(id='알림-재검수', t="재검수(Haiku 3묶음): 진짜 고장 0 · '분석하기' 일시 오류는 다시 열면 정상", shots=[], opts=['확인'], where=[[APP + '/', '—', '화면이 없는 알림']],
             what="재검수(Haiku 3묶음): 진짜 고장 0 · '분석하기' 일시 오류는 다시 열면 정상")]
items.append(dict(section='B. 새 질문 · 제안', desc='이번 바퀴에 고를 것입니다. 시안이라고 쓴 그림은 아직 만들지 않은 모양입니다.', items=Q))
items.append(dict(section='C. 알림', desc='고를 것은 없고 알려 드리는 한 줄입니다.', items=INFO))

nA, nQ, nI = len(A), len(Q), len(INFO)
jf = os.path.join(SH, 'confirm-items-r18.json')
json.dump(items, open(jf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if REAL:
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items-r18.json'))
    shutil.copy2(jf, os.path.join(NOW, 'confirm-items.json'))
print('구현 확인', nA, '· 질문', nQ, '· 합', nA + nQ + nI)
lead = f"구현 확인 {nA} · 새 질문과 제안 {nQ} · 알림 {nI}입니다. 새 그림은 바깥 주소에 로그인 폼으로 들어가 찍었고, 구현 때 그림은 찍은 시각을 적었습니다. 고르시면 이 브라우저에 저장되고, 맨 아래 '결정 복사'로 대화창에 붙여 주세요."
env = dict(os.environ, LX_CONFIRM_ITEMS=jf, LX_CONFIRM_ROUND=('now' if REAL else DRAFT), LX_CONFIRM_EXTRA=SH + ';' + EV, PYTHONIOENCODING='utf-8',
           LX_CONFIRM_TITLE='답을 기다리는 것 — 지금 화면 기준', LX_CONFIRM_LEAD=lead)
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review', 'build-confirm.py')], env=env, check=True)
out = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm', 'now') if REAL else DRAFT
h = open(os.path.join(out, 'index.html'), encoding='utf-8').read()
miss = [m for m in re.findall(r'src="(img/[^"]+)"', h) if not os.path.exists(os.path.join(out, m))]
print('굽은 곳', out, '· 그림 태그', h.count('<img'), '· 없는 그림', miss)
