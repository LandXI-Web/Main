"""바퀴 11 now 항목 JSON 만들기 — 그림 파일 이름 뒤 시각은 shots-r11 폴더에서 찾는다. 사용: python build-items-r11.py shots-r11
숫자는 굽는 순간 읽은 값(log.json — 전국 진행 응답 · 화면 글)과 학습 기록 파일(progress.json)에서 그대로 옮긴다. 카드 문구는 짧게(원칙 230)."""
import glob, json, os, sys
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
    return f'(그림 찍은 시각 10월 13일 {a}' + ('' if a == z else f'–{z}') + ')'


def pct(x):
    return f'{x * 100:.1f}%'


NEW, OLD = FARM['trained/job_01M4QKMB4X8F1JHJHD0D7HSR7Q'], FARM['aerial25/best']
farm = lambda d, k: d[k]['경작지']['mask']['map50']
P = LOG['_progress']['assets']
val = lambda x: x['value'] if isinstance(x, dict) else x
fa, ri = P['farm'], P['river']
fdone, rdone = val(fa['done']), val(ri['done'])
fnew, rnew = val(fa['model_done']), val(ri['model_done'])
fredo, rredo = val(fa['redo']), val(ri['redo'])
assert fdone == fnew + fredo and rdone == rnew + rredo
PT = LOG['_progress_at'][11:16]
DONE = ['완료', '다시']
items = []

items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='이번 페이지의 지금 화면 네 장',
    shots=[S('now-staff-dash'), S('now-admin-shared'), S('now-train-board'), S('now-admin-retrain')], opts=['확인'],
    where=[[APP + '/landxi/v3/lx-console/', STAFF, 'LX 직원 대시보드 · 프로젝트 → 학습'],
           [ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '공유 데이터 · 배포 → XI 재학습']],
    what='LX 직원 대시보드(공지사항 · 메모가 맨 위) · 관리자 공유 데이터 · 학습 화면(추론 블록) · XI 재학습 탭입니다. ' + T('now-staff-dash', 'now-admin-shared', 'now-train-board', 'now-admin-retrain'))]))

impl = []
impl.append(dict(id='대시보드-v8', t='LX 직원 대시보드 — 맨 위에 공지사항(가로 2칸)과 메모(오른쪽 1칸), 전국 AI 현황은 삭제',
    shots=[S('now-staff-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '대시보드(로그인 뒤 첫 화면)']],
    what='위에서 아래로 공지사항 · 메모 → 진행 현황 · 요청함 · 저장 용량 → 최근 진행한 프로젝트입니다. ' + T('now-staff-dash')))
impl.append(dict(id='용어-되돌림', t="학습 화면 블록 이름을 '추론'으로 — 새로 생긴 말을 원래 말로 되돌리고 덧말을 뺐습니다",
    shots=[S('now-train-board'), S('now-admin-template')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-train/', STAFF, '프로젝트 → 학습'],
           [ADMIN + '/landxi/v3/ops-infra/#/deploys/templates', ADM, '배포 → 학습 서식']],
    what='블록 이름은 학습 데이터 · 기반 모델 · 학습 설정 · 학습 · 추론 · 배포 신청 여섯입니다(학습 서식도 같음). ' + T('now-train-board', 'now-admin-template'),
    table=[['자리', '전', '후'],
           ['학습 화면 · 시작 막힘 말', 'XI맵에서 고친 곳은 쉬는 시간에 저절로 학습해요', '수정된 부분은 XI 재학습에서 학습합니다'],
           ['학습 화면 · 핵심 수치 아래', '학습 장비 안내 여러 줄', '한 줄'],
           ['학습 화면 · 학습 이력 머리', '이 프로젝트 · 최근 순 · AI 모델 정확도는 학습 끝 검증 값', '최근 순'],
           ['학습 화면 · 판 아래', '바꿀 수 없는 것 줄', '뺌'],
           ['학습 서식 · 머리', '직원 학습 화면을 처음 열면 놓이는 기본 흐름 — … 설명', '설명 뺌']]))
impl.append(dict(id='고친것-문구', t="고친 것 문구 — '수정된 부분은 학습 데이터로 저장됩니다.' · 숫자 '수정된 부분 n장'",
    shots=[S('now-admin-retrain'), S('now-train-data')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys/retrain', ADM, '배포 → XI 재학습'],
           [APP + '/landxi/v3/lx-train/', STAFF, "프로젝트 '비닐하우스 2026' → 학습 → 학습 데이터 블록"]],
    what='XI 재학습 안내는 한 줄이고, 학습 데이터 선택지에 수정된 부분 0장이 보입니다. ' + T('now-admin-retrain', 'now-train-data'),
    table=[['자리', '전', '후'],
           ['XI 재학습 안내', 'XI맵에서 고친 곳은 학습 데이터로 모입니다. + 설명 여러 줄', '수정된 부분은 학습 데이터로 저장됩니다.'],
           ['XI 재학습 칸 머리', '모인 학습 데이터', '학습 데이터'],
           ['학습 데이터 선택지', 'XI맵에서 고친 곳 n장', '수정된 부분 n장'],
           ['XI맵 칸 아래 줄', '고친 것은 원래 모양과 함께 학습 자료로 쌓입니다', '수정된 부분은 학습 데이터로 저장됩니다.'],
           ['XI맵 알림', '지웠습니다 · 학습 자료로 쌓입니다', '지웠습니다']]))
impl.append(dict(id='관리자-공유데이터', t="LX 관리자 메뉴 '공유 데이터' — 영상 올리기 · 정보 고치기 · 공개/비공개 · 지우기",
    shots=[S('now-admin-shared')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, '왼쪽 메뉴 맨 아래 공유 데이터']],
    what='직원이 새 프로젝트에서 고르는 영상 목록과 같은 목록입니다(지금 영상 83장). 비공개로 바꾸면 직원 목록에서 빠지고, 분석에 쓴 영상은 지울 수 없다고 알립니다. 행정 자료는 올리기 기능이 없어 이번에는 영상만 있습니다. ' + T('now-admin-shared')))
impl.append(dict(id='전국-새판', t='전국 분석은 경작지 새 판 · 기관 영상 · 분석하기 · 공개 서비스는 지금 모델 그대로',
    shots=[S('now-xi-national')], opts=DONE,
    where=[[APP + '/landxi/v3/xi-clean/', STAFF, 'XI맵 → 전국 결과 자산(농지 전수 · 하천 · 계곡)']],
    what=f'새 판 이름은 경작지 학습 2026.10.13입니다. 끝난 칸 230칸을 새 판으로 다시 돌리는 중이고, 바뀌는 칸만 결과를 바꿔 끼웁니다. {PT} 읽은 값: 농지 끝난 {fdone}칸 중 새 판 {fnew} · 다시 할 곳 {fredo}, 하천 끝난 {rdone}칸 중 새 판 {rnew} · 다시 할 곳 {rredo}. ' + T('now-xi-national'),
    table=[['경작지 정확도', '지금 모델', '새 판'],
           ['API 영상', pct(farm(OLD, 'api')), pct(farm(NEW, 'api'))],
           ['원본 항공', pct(farm(OLD, 'file')), pct(farm(NEW, 'file'))],
           ['결과가 0이던 전주 도심 9칸', '0', '7칸 0 · 중화산동1가 경작지 3곳 · 효자동1가 경작지 1곳']]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=impl))

items.append(dict(section='B. 시안 · 결정', desc="아직 만들지 않은 시안입니다(그림에 '시안' 표시). 고르신 것만 만듭니다.", items=[dict(
    id='XI맵-퍼포먼스-3', t='XI맵 퍼포먼스 맵 3차 — 처음부터 모든 분석 결과가 함께 · 업무 거르기는 말로 할 때만 (시안)',
    shots=[S('mock-p3-first'), S('mock-p3-hover'), S('mock-p3-press'), S('mock-p3-filter')], opts=['이대로 구현', '다시'],
    where=[[M + 'ximap-perf-3/index.html', '시안 · ' + STAFF + ' (시안 안 로그인 칸)', '시군구에 올려 보고 · 눌러 보고 · 아래 질문을 눌러 보세요'],
           [IMG + 'perf3-10s-1412.mp4', '로그인 없이 열림 · 영상 10초(10월 13일 14:12 녹화 시안)', '첫 화면 → 올림 → 누름 → 고치기 → 말로 거르기']],
    now='첫 화면 · 올림 · 누름 · 말로 거르기 네 장면입니다. 왼쪽 위에 업무 이름이 없고, 남은 날은 보이지 않습니다. 그림 속 숫자는 서버 값이고, 바뀐 곳이 빛나는 것 · 모양 고치기 · 답 문구는 예시 동작입니다.',
    prop='이대로 구현하면 지금 XI맵 첫 화면을 모든 결과가 함께 보이는 모습으로 바꿉니다. ' + T('mock-p3-first', 'mock-p3-filter'))]))

qs = []
qs.append(dict(id='공유데이터-행정자료', t='공유 데이터에 행정 자료를 어떻게 둘까', shots=[S('now-admin-shared')],
    opts=['기관이 올린 대장을 읽기만 하는 목록으로', '지금처럼 영상만'],
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, 'LX 관리자 → 공유 데이터']],
    now='공유 데이터에는 영상만 있습니다. LX 쪽 행정 자료는 브이월드에서 읽어 보기만 하고, 기관 대장은 기관이 올립니다.',
    prop='기관이 올린 대장을 읽기만 하는 목록으로 두면, 관리자가 어떤 대장이 있는지 한곳에서 봅니다. 고르신 쪽으로 만듭니다.'))
qs.append(dict(id='비공개-기관공유', t='관리자가 비공개로 내린 영상은 기관 공유 목록에서도 뺄까', shots=[S('now-admin-shared')],
    opts=['뺌', '그대로'],
    where=[[ADMIN + '/landxi/v3/ops-infra/#/shared', ADM, 'LX 관리자 → 공유 데이터 → 직원에게(공개/비공개)']],
    now='비공개로 바꾸면 직원이 고르는 목록에서만 빠집니다.',
    prop='빼면 비공개 영상이 기관에도 보이지 않습니다.'))
items.append(dict(section='C. 질문', desc='새로 여쭙는 두 가지입니다.', items=qs))

json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', sum(len(x['items']) for x in items), [len(x['items']) for x in items])
