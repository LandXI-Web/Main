"""바퀴 9 now 항목 JSON 만들기 — 그림 파일 이름 뒤 시각은 shots 폴더에서 찾는다. 사용: python build-items-r9.py shots-r9
학습 진행 값은 굽는 순간 읽은 학습 화면 글(shots-r9/log.json)과 02. 데이터/training/farm-v2/progress.json 에서 그대로 옮긴다."""
import datetime, glob, json, os, re, sys
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
NOW = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process', 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
FARM = json.load(open(r'E:\Land-XI 플랫폼\02. 데이터\training\farm-v2\progress.json', encoding='utf-8'))
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


# 학습 진행(학습 화면 글 + progress.json)
tt = LOG['_train_text']; ta = LOG['_train_at'][11:16]
m_it = re.search(r'학습 중 · (\d+) / (\d+)회', tt); it_n, it_t = m_it.group(1), m_it.group(2)
m_ac = re.search(r'(\d+)%\s*지금까지', tt) or re.search(r'핵심 수치.*?지금까지\s*(\d+)%', tt, re.S)
acc = m_ac.group(1)
n_screen = re.search(r'경작지 · ([\d,]+)장', tt).group(1)
pj = FARM['train']; started = pj['started'][5:16]
read_at = datetime.datetime.now().strftime('%H:%M')
LIVE = (f"{ta} 학습 화면에서 읽은 진행: 반복 {it_n} / {it_t}회 · 지금까지 정확도 {acc}%(학습 중 자체 검증 300장 · 4분류 전체 · 반복마다 바뀜). "
        f"학습 시작 {started}(학습 기록 파일 {read_at} 에 읽음 · 같은 학습).")
hud = LOG.get('_hud_jeonju') or ''
m = re.search(r'경작지\s*\n?\s*([\d,]+)곳 · ([\d.]+)㎢', hud)
mb = re.search(r'비닐하우스\s*\n?\s*([\d,]+)동', hud)
me = re.search(r'읍면동 (\d+)곳 중 (\d+)곳 분석 끝', hud)
JEON = (f"전주시 카드는 지금 경작지 {m.group(1)}곳 · {m.group(2)}㎢ · 비닐하우스 {mb.group(1)}동 · 읍면동 {me.group(1)}곳 중 {me.group(2)}곳 분석 끝으로 나옵니다(전국 작업기가 계속 돌아 값이 늘어납니다)." if (m and mb and me) else '전주시 카드의 숫자는 위 그림 그대로입니다.')

DONE = ['완료', '다시']
items = []
items.append(dict(section='한눈에', desc='이번에 새로 찍은 지금 화면 네 장입니다. 그림은 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='이번 페이지에 있는 것 — 지금 화면 네 장',
    shots=[S('now-new-project'), S('now-train-farm'), S('now-ximap-jeonju'), S('now-admin-retrain')], opts=['확인'],
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 → 새 프로젝트 · 프로젝트 '경작지 v2' → 학습 · XI맵"],
           [ADMIN + '/landxi/v3/ops-infra/#/deploys/retrain', ADM, "LX 관리자 → 배포 → 'XI 재학습'"]],
    what="위 그림은 새 프로젝트 창('무엇을' 칸이 없음) · 프로젝트 '경작지 v2' 학습 화면(반복마다 정확도 선이 그려지는 중) · XI맵 시군구 카드(전주시 — 실제 숫자) · LX 관리자 XI 재학습 탭의 지금 모습입니다. 구성: 구현 확인 넷(하나는 학습 진행 중) · 시안과 결정 넷 · 새 질문 둘. 구현 확인은 답하신 것을 만든 것이고, 시안은 아직 만들지 않은 모습입니다. " + T('now-new-project', 'now-admin-retrain', 'now-train-farm', 'now-ximap-jeonju'))]))

impl = []
impl.append(dict(id='새프로젝트-한창', t="새 프로젝트 한 창에서 '무엇을' 칸을 뺐습니다 — 이름 · 설명(선택) · 구성원 · 영상 → 만들기 한 번 → 바로 학습 데이터 구축",
    shots=[S('now-new-project')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-project/', STAFF, '프로젝트 → 새 프로젝트(그림은 열어 이름만 쓰고 만들지 않았습니다)'],
           [IMG + 'new-project-nowhat-10s.mp4', '로그인 없이 열림 · 영상 10초', '이름 쓰기 → 영상 올리기 → 구성원 → 만들기 → 학습 데이터 구축까지']],
    what="누른 횟수가 8번에서 7번(영상 올리기와 구성원 한 명 포함)이 됐습니다. 프로젝트가 찾는 것은 학습 데이터 구축에서 올린 학습 데이터의 클래스로 저절로 정해지고, 프로젝트 카드와 프로젝트 한 장에 그 이름이 보입니다. 학습 데이터 구축 화면의 '업무' 칸도 뺐습니다(묶음 이름은 프로젝트 이름). 학습 화면은 '기본' 흐름으로 열립니다. 그림 속 설명 칸의 안내 글은 그대로입니다(설명은 선택). " + T('now-new-project')))
impl.append(dict(id='학습단위-저절로', t='고치면 저절로 — XI맵에서 고친 자리 둘레 한 칸(영상 + 그 안 모든 테두리)이 고친 뒤 30분 조용하면 학습 데이터 1장',
    shots=[S('now-admin-retrain')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/retrain', ADM, "LX 관리자 → 배포 → XI 재학습 — 서비스마다 '0 / 200장' 줄"]],
    what="고친 것은 30분 조용하면 저절로 학습 데이터 1장이 됩니다. 같은 객체를 두 사람이 다르게 고친 칸은 뺍니다. 영상 파일은 쌓지 않고 그 칸만 다시 자릅니다. XI 재학습 기준과 대기열은 이제 '장'으로 셉니다. 시험으로 확인했고(고침 3건 → 조용한 시간 뒤 1장 2칸 → 관리자가 다르게 고친 칸 빠짐 → 되돌리면 다시 1장) 시험 기록은 모두 지웠습니다. 지금 실제로 1장이 된 칸은 0장입니다(실제 직원 고치기가 쌓여야 합니다). " + T('now-admin-retrain')))
impl.append(dict(id='경작지-실험', t="[진행 중] 새 AI 모델 실험 — 프로젝트 '경작지 v2 — 항공 · API 영상' 에서 지금 경작지 모델을 이어 학습하는 중",
    shots=[S('now-train-farm')], opts=['확인', '다시'],
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 '경작지 v2' → 학습 — 반복마다 정확도 선이 그려집니다"]],
    what=(f"아직 학습이 끝나지 않았습니다. 학습 데이터 7,000장 = 기존 항공 5,000장 + 지리원 API 영상 2,000장(같은 자리를 같은 해 영상으로 다시 자름). 학습 화면의 {n_screen}장은 여기에 학습 중 검증 300장을 더한 값입니다. "
          f"같은 검증 묶음에서 지금 모델의 경작지 맞힘은 원본 영상 91.6% · API 영상 86.7%(4.9%p 낮음 — 이 차이를 줄이는 실험)입니다. " + LIVE +
          " 끝 예상은 10월 13일 새벽 3시 무렵이고, 끝나면 같은 검증 묶음으로 지금 모델과 다시 비교합니다. 등록과 배포 신청은 사람이 합니다. " + T('now-train-farm'))))
impl.append(dict(id='XI맵-빈요약', t="XI맵 시군구 카드 — 빈 값이 글자로 찍히던 것을 고치고, 구가 있는 시(전주 등 12곳)의 읍면동 목록도 고쳤습니다",
    shots=[S('now-ximap-jeonju')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 전주시로 들어가기 — 왼쪽 위 카드']],
    what="전에는 카드에 빈 값이 글자로 이어 붙어 나왔습니다. 이제 전국 작업기가 끝낸 읍면동이 있는 시군구는 그 결과 숫자를, 결과가 없는 시군구(종로구 등)는 '분석 예정' 한 줄만 보여 줍니다. " + JEON + " 구가 있는 시 12곳(수원 · 성남 · 안양 · 부천 · 안산 · 고양 · 용인 · 청주 · 천안 · 포항 · 창원 · 전주)은 읍면동 목록이 비던 것을 고쳤습니다. " + T('now-ximap-jeonju')))
items.append(dict(section='구현 확인', desc='답하신 것을 만든 것입니다. 열어 보시고 완료 또는 다시를 골라 주세요. 경작지 실험은 아직 학습이 도는 중입니다.', items=impl))

dec = []
dec.append(dict(id='대시보드-v8', t='LX 직원 대시보드 8차 — 위 = 진행 현황 · 숫자, 아래 = 최근 진행한 프로젝트 그림 (시안)',
    shots=[S('mock-dash8'), S('mock-dash8-full')], opts=['이대로 구현', '다시'],
    where=[[M + 'staff-dash-8/index.html', NOLOGIN, "진행 현황 머리의 '다섯 칸 · 여섯 칸' 단추"]],
    now="7차는 '내 분석 결과' 3×3 지도 격자가 맨 위였습니다. 사용자: '분석 결과라기 보다는 최근 진행한 프로젝트. 진행 현황이랑 정량적인 대시보드가 위. 그림이 아래.'",
    prop="위에서 아래로 ① 진행 현황 ② 내가 돌린 작업 · 요청함 · 저장 용량 ③ 최근 진행한 프로젝트 카드 4장(프로젝트 목록 카드와 같은 틀) ④ 공지 · 메모 · 전국 AI 현황 한 줄. 내 분석 결과 격자는 뺐습니다(지도 서비스와 XI맵의 자리). 숫자는 서버 값입니다. 시안 카드의 '무엇을' 줄은 실제로 만들 때 빼고 찾는 것(학습한 클래스)으로 바꿉니다. " + T('mock-dash8', 'mock-dash8-full')))
dec.append(dict(id='진행현황-다섯칸', t="대시보드 '진행 현황'에서 '결과 확인' 칸을 빼고 다섯 단계로 할까 (시안)",
    shots=[S('mock-dash8'), S('mock-dash8-stages6')], opts=['ⓐ 빼고 다섯 칸', 'ⓑ 그대로 둠'],
    where=[[M + 'staff-dash-8/index.html', NOLOGIN, "진행 현황 머리의 '다섯 칸 · 여섯 칸' 단추로 비교"],
           [M + 'staff-dash-8/index.html?stages=6', NOLOGIN, '주소 끝 ?stages=6 으로 열면 여섯 칸부터']],
    now="'결과 확인' 칸이 이제 늘 0입니다. 결과 확인이 더는 진행을 막는 단계가 아니기 때문입니다. 지금 실제 화면은 여섯 칸입니다.",
    prop="ⓐ 빼고 다섯 칸(데이터 올리기 · 학습 데이터 구축 · 학습 · 추론 · 배포 신청) — 늘 0인 칸이 없어 깔끔합니다. ⓑ 그대로 두면 프로젝트 카드의 여섯 칸 막대와 이름이 같아지지만 0이 계속 보입니다. 정해지면 하나만 남깁니다. " + T('mock-dash8', 'mock-dash8-stages6')))
dec.append(dict(id='데이터-개념', t='데이터하우스 · 공유 데이터 · 프로젝트 데이터 · 고친 것 — 겹침을 정리하는 방향 둘 중 어느 쪽으로 (진단 그림 · 시안)',
    shots=[S('mock-data-map')], opts=['ⓐ 데이터하우스 없앰 · 프로젝트 안 + 관리자 공유 데이터 (추천)', 'ⓑ 데이터하우스 하나로 · 프로젝트는 고르기만', '다시'],
    where=[[M + 'data-map/index.html', NOLOGIN, '진단 그림 한 장 — 빨간 줄이 겹치거나 이름이 다른 곳']],
    now="같은 영상 목록이 세 이름(데이터하우스 영상 · 공유 데이터셋 · 공유 영상)으로 불리고, 프로젝트 안 '데이터 올리기'와 데이터하우스 '영상 · 행정 자료' 탭은 같은 화면입니다. 학습 데이터는 학습 화면(묶음별)과 데이터하우스(클래스별) 두 곳에 보이지만 데이터하우스에서 가져다 쓰는 길이 없습니다. 고친 것은 라벨과 같은 것인데 이름 · 단위(건 ↔ 장) · 자리가 다릅니다.",
    prop="추천 ⓐ 데이터하우스를 없애고 '프로젝트 안 학습 데이터 + 관리자 공유 데이터(영상 · 행정 자료)' 둘로 — XI맵에서 고친 것은 그 서비스를 만든 프로젝트의 학습 데이터로 갑니다. 직원 메뉴 '데이터하우스' · 탭 셋 · 승인 대기 목록 · '비슷한 클래스 먼저'가 사라지고 영상 고르기는 '공유 데이터에서 고르기' 하나입니다. 새 클래스는 라벨 붙일 때 이름을 새로 쓰면 되고 관리자는 배포 신청 때 봅니다. ⓑ 데이터하우스 하나로 합치고 프로젝트는 거기서 고르기만 — 이름 구분은 사라지지만 직원이 프로젝트와 데이터하우스를 오가야 합니다. 그림은 설계 그림(시안 · 진단)입니다. " + T('mock-data-map')))
dec.append(dict(id='XI맵-퍼포먼스', t='XI맵 최종 퍼포먼스 맵 — A안 라이브 지휘소 / B안 이야기로 보는 아카이브 (시안)',
    shots=[S('now-ximap-diag'), S('mock-perf-a'), S('mock-perf-b')], opts=['A안으로 (추천)', 'B안으로', '다시'],
    where=[[M + 'ximap-perf/index.html?v=a', '시안 · LX 직원 ' + STAFF + ' (시안 안 로그인 칸)', 'A안 — 네 얼굴이 한 화면에 늘 함께'],
           [M + 'ximap-perf/index.html?v=b', '시안 · 같은 주소 · 위 단추로 바꿔 보기', 'B안 — 위 탭으로 네 장면을 넘김'],
           [IMG + 'mock-a-10s.mp4', '로그인 없이 열림 · 영상 10초(10월 12일 16:52 녹화 시안)', 'A안 움직임'],
           [IMG + 'mock-b-10s.mp4', '로그인 없이 열림 · 영상 10초(10월 12일 16:57 녹화 시안)', 'B안 움직임']],
    now="맨 위 그림이 지금 XI맵입니다. 왼쪽 큰 카드와 오른쪽 도구가 지도 서비스와 같은 문법이고, 국토 전체를 덮은 빗금 '분석 예정'이 가장 크게 보입니다. 살아 있는 전국 분석은 글 한 줄, 시간은 글자, 고치며 똑똑해지는 것은 객체를 눌러야만 보이고, XI ChatGEO 는 구석 단추입니다. 네 얼굴이 전부 글이거나 숨어 있습니다.",
    prop="추천 A안(라이브 지휘소) — 네 얼굴이 한 화면에 늘 함께 보이고 지도 자체가 움직입니다. B안은 위 탭으로 장면을 넘기는데, 탭이 또 하나의 메뉴가 되어 얼굴을 숨깁니다. 두 시안의 숫자(전국 경작지 · 읍면동 · 학습 데이터 등)는 서버 값이고, 시안의 XI ChatGEO 답은 각본입니다(실제로 만들 때 서버가 답합니다). A안을 고르면 왼쪽 큰 카드 · 빗금 · 오른쪽 '층 · 가르기'가 사라지고 연도 막대와 말로 대신합니다. " + T('now-ximap-diag', 'mock-perf-b')))
items.append(dict(section='결정 — 시안', desc="아직 만들지 않은 시안입니다(그림에 '시안' 표시). 고르신 것만 만듭니다.", items=dec))

qs = []
qs.append(dict(id='학습서식-기본하나', t="관리자 '학습 서식'을 '기본' 하나로 줄일까",
    shots=[S('now-admin-template')], opts=["'기본' 하나로", '그대로'],
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/templates', ADM, 'LX 관리자 → 배포 → 학습 서식']],
    now="새 프로젝트는 '무엇을' 칸이 없어져 늘 '기본' 서식을 씁니다. 그런데 관리자 학습 서식 탭에는 업무별로 고르는 칸이 남아 있습니다.",
    prop="'기본' 하나로 줄이면 업무별 칸이 사라지고, 기본 서식의 블록 켜고 끄기와 첫 값만 정합니다. 그대로 두면 업무별 서식이 남지만 새 프로젝트에서는 쓰이지 않습니다. " + T('now-admin-template')))
qs.append(dict(id='학습중-비킴', t='학습 중에 기관 · 직원 AI 분석이 오면 학습이 잠깐 비킬까',
    shots=[S('now-train-farm')], opts=['반복 사이에 비킴', '그대로(학습 먼저)'],
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 '경작지 v2' → 학습 (지금 학습 중인 화면)"]],
    now="학습(예: 경작지 v2 약 10시간) 중에 들어온 AI 분석은 학습이 끝날 때까지 기다립니다. 전국 분석은 이미 사용자 작업에 비킵니다.",
    prop="제안: 반복 사이에 학습이 잠깐 멈추고 분석을 먼저 처리합니다. 대신 학습 시간은 그만큼 늘어납니다. 그대로 두면 학습이 끝날 때까지 분석이 기다립니다. " + T('now-train-farm')))
items.append(dict(section='질문 — 새로 여쭙니다', desc='이번에 새로 여쭙는 두 가지입니다.', items=qs))

json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', sum(len(x['items']) for x in items), [len(x['items']) for x in items])
