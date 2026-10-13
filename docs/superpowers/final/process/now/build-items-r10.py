"""바퀴 10 now 항목 JSON 만들기 — 그림 파일 이름 뒤 시각은 shots-r10 폴더에서 찾는다. 사용: python build-items-r10.py shots-r10
숫자는 굽는 순간 읽은 화면 글(log.json) · 학습 기록 파일(progress.json)에서 그대로 옮긴다. 카드 문구는 짧게(원칙 230)."""
import glob, json, os, re, sys
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
NOW = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process', 'now')
SH = sys.argv[1]
LOG = json.load(open(os.path.join(SH, 'log.json'), encoding='utf-8'))
FARM = json.load(open(r'E:\Land-XI 플랫폼\02. 데이터\training\farm-v2\progress.json', encoding='utf-8'))['eval']
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
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
    return f'(그림 찍은 시각 10월 13일 {a}' + ('' if a == z else f'–{z}') + ')'


def pct(x):
    return f'{x * 100:.1f}%'


NEW, OLD = FARM['trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q'], FARM['aerial25/best']
farm = lambda d, k: d[k]['경작지']['mask']['map50']
DONE = ['완료', '다시']
items = []

items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='이번 페이지의 지금 화면 네 장',
    shots=[S('now-staff-dash'), S('now-new-project'), S('now-train-farm'), S('now-admin-dash')], opts=['확인'],
    where=[[APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드 · 프로젝트 → 새 프로젝트 · 프로젝트 학습'],
           [ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드']],
    what='LX 직원 대시보드(진행 현황이 숫자 줄) · 새 프로젝트 창(설명 문구 없음) · 프로젝트 학습 화면 · 관리자 대시보드 전국 한 줄입니다. ' + T('now-staff-dash', 'now-new-project', 'now-train-farm', 'now-admin-dash'))]))

impl = []
impl.append(dict(id='대시보드-v8', t="LX 직원 대시보드 — '내가 돌린 작업'을 없애고 진행 현황을 그 자리에 같은 크기로",
    shots=[S('now-staff-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '대시보드(로그인 뒤 첫 화면)']],
    what='진행 현황이 숫자 줄로 위에 있고, 아래에 최근 진행한 프로젝트가 있습니다. ' + T('now-staff-dash')))
impl.append(dict(id='데이터하우스-없앰', t="데이터하우스를 없앴습니다 — 학습 데이터는 프로젝트 안, 영상은 '공유 데이터에서 고르기'",
    shots=[S('now-train-data'), S('now-new-pick')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 → 학습 → 학습 데이터 · 프로젝트 → 새 프로젝트 → '공유 데이터에서 고르기'"]],
    what='왼쪽 메뉴에서 뺐고, 옛 주소로 들어와도 프로젝트 목록으로 갑니다. 새 클래스는 이름만 새로 쓰면 됩니다. ' + T('now-train-data', 'now-new-pick')))
r = LOG['_newproj_rects']['1440x900']
impl.append(dict(id='새프로젝트-한창', t='새 프로젝트 한 창 — 설명 문구 없음 · 창 크기 고정',
    shots=[S('now-new-project'), S('now-new-pick'), S('now-new-member')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-project/', STAFF, '프로젝트 → 새 프로젝트(열어 보기만 했고 만들지 않았습니다)'],
           [IMG + 'new-project-10s.mp4', '로그인 없이 열림 · 영상 10초(10월 13일 11:10 녹화)', '이름 → 영상 → 구성원 → 만들기']],
    what='창은 열 때 · 고를 때 · 구성원을 찾을 때 크기가 같고, 안쪽만 스크롤됩니다. ' + T('now-new-project', 'now-new-pick', 'now-new-member'),
    table=[['화면 1440×900', '전', '후(이번에 잰 값)'],
           ['열었을 때', '1040×495', f'{r["open"][0]}×{r["open"][1]}'],
           ['영상 고르기', '1040×814', f'{r["pick"][0]}×{r["pick"][1]}'],
           ['구성원 찾기', '1040×814', f'{r["member"][0]}×{r["member"][1]}']]))
impl.append(dict(id='학습서식-기본하나', t="학습 서식을 '기본' 하나로 — 업무별 고르기를 없앴습니다",
    shots=[S('now-admin-template')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/templates', ADM, 'LX 관리자 → 배포 → 학습 서식']],
    what='업무를 고르는 칸이 없고, 기본 서식 하나만 있습니다. ' + T('now-admin-template')))
impl.append(dict(id='저절로-문구', t="'30분 조용하면 1장' 문구를 쉬운 말로",
    shots=[S('now-admin-retrain'), S('now-train-data')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/retrain', ADM, 'LX 관리자 → 배포 → XI 재학습'],
           [APP + '/landxi/v3/lx-project/', STAFF, '프로젝트 → 학습 → 학습 데이터']],
    what='문구 두 곳을 바꿨습니다. ' + T('now-admin-retrain', 'now-train-data'),
    table=[['자리', '전', '후'],
           ['XI 재학습 설명', 'XI맵에서 고친 자리 한 칸(영상 + 그 안 테두리)이 고친 뒤 30분 조용하면 학습 데이터 1장이 됩니다.', 'XI맵에서 고친 곳은 학습 데이터로 모입니다.'],
           ['XI 재학습 표 머리', '새 학습 데이터', '모인 학습 데이터'],
           ['학습 화면 선택지', 'XI맵에서 고친 것 0건 · XI 재학습으로 쉬는 시간에 학습', 'XI맵에서 고친 곳 0장']]))
impl.append(dict(id='하천-통합본', t='하천 범위를 하천 통합본(국가 · 지방 · 소하천)으로 바꾸고 하천 분석을 처음부터 다시 켬',
    shots=[S('now-xi-national'), S('now-admin-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 전국 결과 자산 → 하천 · 계곡'],
           [ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드 전국 줄']],
    what='새 범위는 3,855 읍면동 · 15,761㎢입니다(옛 범위 14,545㎢보다 1,216㎢ 늘었습니다). ' + T('now-xi-national', 'now-admin-dash')))
impl.append(dict(id='영상호출-단계상향', t='영상 호출 동시 수를 4에서 8로 올리고 자동 조절 장치를 달았습니다',
    shots=[S('now-xi-national'), S('now-admin-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 전국 결과 자산'],
           [ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드 전국 줄']],
    what='8에서 멈춘 이유: 서버가 정상이면 4에서도 영상 읽기 대기가 1초쯤이라 8로 올려도 속도가 거의 같았고, 8에서 응답이 한 번 크게 튀었습니다. '
         '서버가 정상일 때 전국 분석은 약 13~14일 걸립니다. '
         '오전 국토지리정보원 서버 장애 때 영상이 없다고 잘못 끝난 하천 26칸은 되돌려 다시 분석했습니다. ' + T('now-xi-national', 'now-admin-dash')))
impl.append(dict(id='경작지-실험', t='경작지 새 판 실험 결과 — 같은 검증 묶음 경작지 정확도',
    shots=[S('now-train-farm')], opts=['확인'],
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 '경작지 v2' → 학습"]],
    what='API 영상에서는 나아졌고 원본 항공에서는 낮아졌습니다. 학습은 10월 13일 04:14에 끝났습니다. ' + T('now-train-farm'),
    table=[['경작지 정확도', '지금 모델', '새 판'],
           ['API 영상', pct(farm(OLD, 'api')), pct(farm(NEW, 'api'))],
           ['원본 항공', pct(farm(OLD, 'file')), pct(farm(NEW, 'file'))]]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=impl))

items.append(dict(section='B. 시안 · 결정', desc="아직 만들지 않은 시안입니다(그림에 '시안' 표시). 고르신 것만 만듭니다.", items=[dict(
    id='XI맵-퍼포먼스-2', t='XI맵 퍼포먼스 맵 2차 — 올리면 떠오르고 · 누르면 객체로 · 막대를 끌면 두 해가 겹침 · 말로 거름 (시안)',
    shots=[S('mock-p2-first'), S('mock-p2-hover'), S('mock-p2-press'), S('mock-p2-time'), S('mock-p2-filter')], opts=['이대로 구현', '다시'],
    where=[[M + 'ximap-perf-2/index.html', '시안 · ' + STAFF + ' (시안 안 로그인 칸)', '읍면동에 올려 보고 · 눌러 보고 · 위 막대를 끌어 보고 · 아래 질문을 눌러 보세요'],
           [IMG + 'perf2-10s-1142.mp4', '로그인 없이 열림 · 영상 10초(10월 13일 11:42 녹화 시안)', '올림 → 누름 → 고치기 → 말로 거르기']],
    now='첫 화면 · 올림 · 누름 · 시간 · 말로 거르기 다섯 장면입니다. 그림 속 숫자는 서버 값이고, 바뀐 곳이 빛나는 것과 모양 고치기는 예시 동작입니다.',
    prop='이대로 구현하면 범례를 메인에서 빼고, 요약은 지도 안에만 둡니다. ' + T('mock-p2-first', 'mock-p2-filter'))]))

qs = []
qs.append(dict(id='경작지v2-처리', t='경작지 새 판을 어떻게 쓸까', shots=[S('now-train-farm')],
    opts=['ⓐ 전국 분석에만 새 판 · 기관 영상은 지금 모델', 'ⓑ 원본 성능까지 다시 학습(NAS 자료 받은 뒤)', '보류'],
    where=[[APP + '/landxi/v3/lx-project/', STAFF, "프로젝트 '경작지 v2' → 학습"]],
    now=f'API 영상 {pct(farm(OLD, "api"))} → {pct(farm(NEW, "api"))}, 원본 항공 {pct(farm(OLD, "file"))} → {pct(farm(NEW, "file"))}입니다.',
    prop='ⓐ 전국 분석은 API 영상이라 새 판이 낫고, 기관 영상은 원본에 가까워 지금 모델이 낫습니다. ⓑ 원본까지 다시 학습하려면 NAS 자료가 필요합니다.'))
qs.append(dict(id='관리자-공유데이터', t="관리자 화면에 '공유 데이터' 메뉴를 만들까", shots=[S('now-admin-dash')],
    opts=['만듦', '안 만듦'],
    where=[[ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 왼쪽 메뉴']],
    now="직원은 '공유 데이터에서 고르기'만 하고, 관리자가 영상 · 행정 자료를 관리하는 화면은 따로 없습니다.",
    prop='만들면 관리자가 영상 · 행정 자료를 한곳에서 올리고 지웁니다.'))
qs.append(dict(id='하천-등급', t='하천 결과에 국가 · 지방 · 소하천 등급을 붙일까', shots=[S('now-xi-national')],
    opts=['붙임', '안 붙임'],
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 전국 결과 자산 → 하천 · 계곡']],
    now='하천 통합본에는 등급이 없습니다.', prop='붙이면 관리 주체별로 결과를 나눠 볼 수 있습니다.'))
qs.append(dict(id='남은날-표시', t="관리자 · XI맵 전국 줄에 '남은 약 n일'을 보일까", shots=[S('now-admin-dash'), S('now-xi-national')],
    opts=['보임', '안 보임'],
    where=[[ADMIN + '/landxi/v3/ops-core/', ADM, 'LX 관리자 대시보드 전국 줄'],
           [APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 전국 결과 자산']],
    now='지금은 진행 %만 보입니다.', prop="'남은 약 n일'을 더하면 언제 끝나는지 바로 보입니다."))
items.append(dict(section='C. 질문', desc='새로 여쭙는 네 가지입니다.', items=qs))

json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', sum(len(x['items']) for x in items), [len(x['items']) for x in items])
