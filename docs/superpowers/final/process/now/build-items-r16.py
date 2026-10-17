"""바퀴 16 now 항목 JSON 만들기 + 페이지 굽기. 사용: python build-items-r16.py <shots-r16 폴더>
그림은 shoot-r16.mjs 가 찍은 것(이름 끝 네 자리 = 찍은 시각). 구현 때 그림은 이름에 시각(파일 수정 시각)을 붙여 같은 폴더로 모으고 '구현 때 그림' 이름표를 단다.
숫자는 log-*.json 과 각 구현 증거(items.json)에서 옮긴다. 비밀번호는 어디에도 적지 않는다."""
import glob, json, os, re, shutil, subprocess, sys, datetime
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
PR = os.path.join(ROOT, 'docs', 'superpowers', 'final', 'process')
NOW = os.path.join(PR, 'now')
SH = sys.argv[1]
L = {r: json.load(open(os.path.join(SH, f'log-{r}.json'), encoding='utf-8')) for r in ('staff', 'admin', 'gov', 'ov')}
st, ad, gv, ov = L['staff'], L['admin'], L['gov'], L['ov']
APP, ADMIN, ORG, OVS = 'https://app.land-xi.dev', 'https://admin.land-xi.dev', 'https://namwon.land-xi.dev', 'https://kgz-agri.land-xi.dev'
STAFF = '아이디 test@lx.or.kr · 임시 비밀번호'
ADM = '아이디 lxadmin@lx.or.kr · 임시 비밀번호'
GOV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (남원 기관 로그인 폼)'
OV = '아이디 lxadmin@lx.or.kr · 임시 비밀번호 (해외 기관 로그인 폼)'
XI = APP + '/landxi/v3/xi-clean/'
LM = APP + '/landxi/v3/lx-map/'

# 구현 때 그림(지금 못 찍는 장면 — 한글 문서 파일 등) — 수정 시각을 이름 끝에 붙인다
EV = {'impl-report-1366': 'impl-42/ximap-r16/shots/275-1366-report.png'}
for base, rel in EV.items():
    src = os.path.join(PR, rel)
    t = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    shutil.copy2(src, os.path.join(SH, f'{base}-{t:%H%M}' + os.path.splitext(src)[1]))


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    return os.path.basename(f[-1])


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b)); return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    ts = sorted(hm(b) for b in bs)
    return f'(그림 찍은 시각 10월 17일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def OLD(*bs):
    out = []
    for b in bs:
        t = datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(SH, S(b))))
        out.append(f'{t.month}월 {t.day}일 {t:%H:%M}')
    return '구현 때 그림은 ' + ' · '.join(sorted(set(out))) + '에 찍은 것입니다.'


DONE, OK = ['완료', '다시'], ['확인']
items = []

# ── 한눈에
items.append(dict(section='한눈에', desc='이번 바퀴 대표 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 새로 찍었습니다.', items=[dict(
    id='한눈에', t='지금 화면 네 장', shots=[S('now-xi-hud-national'), S('now-xi-list'), S('now-xi-service-on'), S('now-gov-hud-line')], opts=OK,
    where=[[XI, STAFF, '지도 왼쪽 위 흰 글씨 한 줄'], [XI, STAFF, '그 한 줄을 누르면 오른쪽에 시군구 · 서비스 목록'], [XI, STAFF, '목록에서 서비스를 누르면 그 결과만 지도에'], [ORG + '/landxi/v3/xi-clean/', GOV, '남원 기관 XI맵 왼쪽 위 한 줄']],
    what='LX 직원 XI맵 왼쪽 위 한 줄(첫 그림) · 눌러서 연 시군구 서비스 목록(둘째) · 서비스를 눌러 그 결과만 켠 지도(셋째) · 기관(남원) XI맵의 같은 한 줄(넷째)입니다. 한 줄의 숫자와 목록의 숫자는 같은 출처입니다. '
         + T('now-xi-hud-national', 'now-xi-list', 'now-xi-service-on', 'now-gov-hud-line'))]))

A = []
# ── 장비 · 영상 받기 (구현 41)
A.append(dict(id='GPU-두장', t='학습 장비 두 장 함께 쓰기(시험) — 전국 작업이 두 장에서 돕니다', shots=[S('now-admin-infra'), S('now-admin-dash')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라 — 맨 위 한 줄 · 두 장 막대'], [ADMIN + '/', ADM, '오른쪽 카드 경보 줄']],
    what='전국 농지 · 하천 작업이 장비 두 장에서 돕니다. 장당 전력 상한과 장마다 30초 평균 70% · 전력 한도는 그대로 지키고, 두 장 합 전력 · 온도를 1초마다 기록합니다. 이상하면 바로 한 장으로 돌아갑니다(실제로 되돌려 봄). XI ChatGEO 질문이 오면 한 장이 비켜 줍니다. '
         '관리자 인프라 맨 위에 "최근 2시간 두 장 동시 고부하" 횟수가 보입니다. ' + T('now-admin-infra', 'now-admin-dash'),
    table=[['', '한 장', '두 장'], ['구역 조각 하나 처리', '0.51초', '0.35초'], ['합 전력 최대', '—', '297W (300W 넘은 시간 0초)'], ['온도 최대', '—', '81℃'], ['XI ChatGEO 첫 글자', '0.6초', '0.9–1.6초']]))
A.append(dict(id='영상받기-개선', t='영상 받기 속도 개선 — 전국 남은 날 약 20일 → 약 3일', shots=[], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '화면에 따로 보이는 곳 없음 — 서버 안에서 도는 일']],
    what='기다리던 빈칸을 없애고, 같은 영상 조각을 두 번 받지 않게 했습니다(겹침 30–41% → 0–3%). 조각 2개를 동시에 넣고, 분석하는 동안 다음 영상을 미리 받습니다. 영상 서버 호출 상한은 그대로입니다. 브이월드 두 출처는 약관이 불명확하다는 기존 결정대로 쓰지 않았습니다. '
         '같은 시험 칸의 결과는 바꾸기 전과 같습니다(경작지 253곳 · 비닐하우스 23곳). 화면 그림이 없는 항목입니다.',
    table=[['', '전', '후'], ['조각 하나 받기·처리', '1.36초', '0.19초(약 7배)'], ['한 시간에 보는 면적', '45㎢', '556㎢'], ['남은 39,680㎢', '약 20일', '약 2.8일']]))

# ── XI맵 (구현 42)
A.append(dict(id='XI맵-왼쪽위', t="XI맵 왼쪽 위는 흰 글씨 한 줄 'OO 시군구 · OO 서비스 제공중'입니다", shots=[S('now-xi-hud-national'), S('now-xi-hud-region')], opts=DONE,
    where=[[XI, STAFF, '첫 화면 왼쪽 위 · 남원시로 들어가면 그 이름']],
    what=f"큰 숫자와 업무 줄을 걷고 한 줄만 남겼습니다. 전국에서는 '{st['hud']}'(지도에 보이는, 결과가 있는 시군구 수와 그곳들에 제공 중인 서비스 가짓수), 남원시로 들어가면 '{st['hudRegion']}'입니다. 왼쪽 위에 올리면 지도에서 끌려 나오던 움직이는 선은 없앴습니다. 말풍선 · 통계 단추는 그대로. " + T('now-xi-hud-national', 'now-xi-hud-region')))
A.append(dict(id='XI맵-왼쪽위누르기', t='왼쪽 위 한 줄을 누르면 시군구별 서비스 목록 · 서비스를 누르면 그 결과만', shots=[S('now-xi-list'), S('now-xi-service-on')], opts=DONE,
    where=[[XI, STAFF, "왼쪽 위 한 줄 누르기 → 목록에서 서비스(예: '" + st['svcName'].split(' ')[0] + "') 누르기 → 다시 누르면 원래대로"]],
    what=f"오른쪽 서랍에 시군구별로 제공 중인 서비스 목록이 열립니다(지금 지도 범위 · 한 줄 숫자와 같은 출처 — {st['list']['rows']}줄). 서비스를 누르면 그 시군구로 날아가 그 서비스 결과만 지도에 켜지고(왼쪽 위 '원래대로' 칩으로 되돌림), 시군구 이름을 누르면 그곳으로 이동합니다. "
         "누른 서비스를 다시 누르면 원래대로 돌아갑니다. 서랍 제목은 '·' 앞뒤에서만 끊기고 '보고서로'는 제목 아래 줄에 있습니다. 설명 글은 없습니다. " + T('now-xi-list', 'now-xi-service-on')))
A.append(dict(id='목록-시도접기', t='시군구 · 서비스 목록을 시도별로 접고 펼 수 있습니다', shots=[S('now-xi-list'), S('now-gov-list')], opts=DONE,
    where=[[XI, STAFF, '왼쪽 위 한 줄 → 시도 머리줄(시도 · 시군구 수 · 꺾쇠) 누르기'], [ORG + '/landxi/v3/xi-clean/', GOV, '기관도 같은 목록(시도 한 곳)']],
    what=f"목록이 시도 머리줄로 묶입니다(전국 화면 {st['list']['sido']}개 시도). 지금 지도 범위에 보이는 시도(또는 지금 지역의 시도)는 펼친 채, 나머지는 접힌 채 시작하고 머리줄을 누르면 접고 폅니다. " + T('now-xi-list', 'now-gov-list')))
A.append(dict(id='한줄통계-보고서', t="목록의 '보고서로' — 제공 중인 시군구 · 서비스 한 장(한글 문서)", shots=[S('impl-report-1366')], opts=DONE,
    where=[[XI, STAFF, "왼쪽 위 한 줄 → 목록 → '보고서로'"]],
    what="목록 서랍의 '보고서로'를 누르면 한글 문서 한 장이 내려받아집니다: 제목 '제공 중인 시군구 · 서비스 보고' · 주요 숫자(시군구 · 서비스 · 서비스 결과) · 표(시군구 · 서비스 · 서비스 결과 · 마지막 분석). 시군구 안에서는 'OO 제공 중인 서비스'. 숫자 이름은 화면 · 문서 모두 '서비스 결과'입니다. "
         "아래 그림은 구현 때 그림입니다(내려받은 문서 파일은 지금 화면으로 다시 찍을 수 없습니다). " + OLD('impl-report-1366')))
A.append(dict(id='XI맵-기관한줄', t='기관(남원) XI맵에도 왼쪽 위 한 줄 · 관할 서비스 목록 · 서비스를 누르면 그 결과 층만', shots=[S('now-gov-hud-line'), S('now-gov-list'), S('now-gov-service-on')], opts=DONE,
    where=[[ORG + '/landxi/v3/xi-clean/?service=card-farm', GOV, "왼쪽 위 '" + gv['hud'] + "' → 목록 → 서비스 누르기 → 다시 누르면 모두"]],
    what=f"기관 XI맵 왼쪽 위가 LX 화면과 같은 흰 글씨 한 줄 '{gv['hud']}'입니다(큰 숫자 'AI 분석 결과'는 걷었습니다 — 같은 이름의 숫자가 두 곳에 있지 않게). 누르면 관할 서비스 목록 {gv['list']['rows']}줄, 서비스를 누르면 그 결과 층만 켜지고 다시 누르면 모두 켜집니다. "
         "서버는 기관에 관할 시군구 자료만 내줍니다(다른 지역 이름 · 숫자 · 결과 층 0). " + T('now-gov-hud-line', 'now-gov-list', 'now-gov-service-on')))
A.append(dict(id='XI맵-입력창하나', t='XI맵 입력은 아래 XI ChatGEO 하나 — 위 돋보기 검색창은 없앴습니다', shots=[S('now-xi-input'), S('now-xi-hud-region'), S('now-xi-choices')], opts=DONE,
    where=[[XI, STAFF, "아래 입력 줄에 '남원시' · '고성' · 질문"], [ORG + '/landxi/v3/xi-clean/', GOV, '기관 · 해외 XI맵도 같음']],
    what=f"LX · 기관 · 해외 XI맵 모두 위쪽 검색창이 없고 아래 XI ChatGEO 하나입니다(안내 글 '{st['inputs']['ph']}'). 시군구 · 읍면동 · 지번만 치면 언어 모델을 거치지 않고 바로 이동합니다(지번은 필지 카드까지). 첫 그림은 입력 줄 하나뿐인 첫 화면, 둘째는 '남원시'를 치고 이동한 모습, "
         "셋째(1366 폭)는 '고성'처럼 후보가 여럿일 때 입력 줄 위에 뜬 후보 칩(" + ' · '.join(c.replace('\n', ' ') for c in st['chips']) + ")입니다. 질문은 지금처럼 XI ChatGEO 로 갑니다. 장소 이동은 대화에 남지 않습니다. " + T('now-xi-input', 'now-xi-hud-region', 'now-xi-choices')))
A.append(dict(id='XI맵-칸조절2', t='XI맵 통계 판 칸 조절 — 손잡이 · 접힘 · 움직임을 보완했습니다', shots=[S('now-xi-stats-dots'), S('now-xi-handle-hover'), S('now-xi-folded')], opts=DONE,
    where=[[XI + '?test=1', STAFF, "'남원시 비닐하우스 어디가 많아?' → '통계 보기' → 판 왼쪽 가운데 손잡이를 끌기 · 올리기 · 접기"]],
    what='1920 · 1440 · 1100 폭에서 끌기 · 접기 · 펴기를 직접 찍어 보고 고쳤습니다. ① 끌 수 있는 자리가 안 보이던 것 → 가운데 작은 손잡이가 늘 보이고 올리면 짙어집니다 ② 접었을 때 손잡이가 닫기 × 와 겹치던 것 → 접히면 손잡이를 숨기고 "통계 보기"가 펼치기를 맡습니다 '
         '③ 판 폭을 바꿔도 지도 가운데가 그대로이던 것 → 지도 가운데도 따라갑니다 ④ 폭이 바뀔 때 부드럽게(끄는 동안은 바로) ⑤ 가장 좁게 300 → 320. 지도 서비스 화면도 같은 부품이라 함께 확인했습니다. 첫 그림 통계 판 · 둘째 손잡이에 올린 모습 · 셋째 접은 모습. ' + T('now-xi-stats-dots', 'now-xi-handle-hover', 'now-xi-folded')))
A.append(dict(id='꼬리표-색점', t='지도 위 통계 꼬리표에 클래스 색 점', shots=[S('now-xi-stats-step1'), S('now-xi-stats-dots')], opts=DONE,
    where=[[XI + '?test=1', STAFF, "'남원시 비닐하우스 어디가 많아?' → 지도 위 꼬리표 이름 앞 색 점"]],
    what='꼬리표(읍면동 이름 · 숫자) 이름 앞에 색 점을 넣었습니다. 한 업무 통계면 그 클래스 색(사용자가 고른 색이 먼저), 모든 업무 통계면 그곳의 지도 색입니다. 색을 바꾸면 점도 바로 바뀝니다. ' + T('now-xi-stats-step1', 'now-xi-stats-dots')))
A.append(dict(id='좁은화면-접힘', t='좁은 화면(1400 이하)에서는 통계 칸이 접힌 채 열립니다', shots=[S('now-xi-narrow-step1'), S('now-xi-narrow-step2')], opts=DONE,
    where=[[XI + '?test=1', STAFF + ' · 브라우저 폭 1366', "질문 → 위 한 줄 '통계 보기'로 펴기"]],
    what=f"1366 폭에서 새 통계는 한 줄('통계 보기')로 열립니다(첫 그림 · 지도가 넓게 보임). '통계 보기'로 폈다가 새 통계가 와도 다시 한 줄입니다. 손잡이로 끌거나 접고 편 기억이 있으면 그 기억대로 펼쳐집니다. 둘째 그림은 펴 본 모습입니다. " + T('now-xi-narrow-step1', 'now-xi-narrow-step2')))
A.append(dict(id='좁은화면-폭', t='좁은 화면에서 통계 칸 기본 폭은 320, 끌어 둔 폭이 있으면 그 폭', shots=[S('now-xi-narrow-step2')], opts=DONE,
    where=[[XI + '?test=1', STAFF + ' · 브라우저 폭 1366', "'통계 보기'로 펴기"]],
    what=f"1366 폭에서 '통계 보기'로 펴면 판이 320 폭으로 열립니다(지금 재어 보니 {st['narrowW']} = 320 + 테두리). 끌어 둔 폭이 기억에 있으면 그 폭이고, 1920 은 그대로 400입니다. 함께 고침: 순위를 눌러 날아갈 때 가운데 '불러오는 중'이 남던 것을 없앴습니다. " + T('now-xi-narrow-step2')))

# ── 결정 항목 구현 (구현 42)
A.append(dict(id='지적-합침', t="'층' 판의 '지적선'과 '지적'을 한 줄 '지적'으로 합쳤습니다", shots=[S('now-xi-layers'), S('now-staff-namwon-cad-on'), S('now-staff-namwon-parcel-card')], opts=DONE,
    where=[[XI, STAFF, "오른쪽 '층' → '지적' 켜고 줌 17까지 확대 → 빈 땅 누르기"]],
    what="'층' 판에 '지적' 한 줄만 남았습니다(기본 꺼짐). 켜면 줌 14~17 은 필지 경계 선, 줌 17부터는 편집지적도와 필지 카드가 예전 그대로 나옵니다(둘이 겹쳐 어긋나 보이지 않게 17부터는 편집지적도만). " + T('now-xi-layers', 'now-staff-namwon-cad-on', 'now-staff-namwon-parcel-card')))
A.append(dict(id='새건물-이름', t="변화 탐지 '새로 생긴 건물' 이름을 '새 건물'로 맞췄습니다", shots=[S('now-xi-class-names')], opts=DONE,
    where=[[XI, STAFF, "남원 변화 결과 자리에서 '층' → 클래스"]],
    what="XI맵 · 지도 서비스 · 한글 보고서 · XI ChatGEO 답이 모두 서버 이름표 한 곳을 읽어 '새 건물'로 나옵니다. 필지 근거 줄에 남아 있던 '2025 신축 변화'도 '2025 새 건물'로 바꿨습니다. " + T('now-xi-class-names')))
A.append(dict(id='중복-한번', t='같은 필지 · 같은 규칙은 한 번만 셉니다', shots=[S('now-gov-report')], opts=DONE,
    where=[[ORG + '/landxi/v3/gov-report/?tab=report', GOV, '통계 · 보고서의 지역 숫자']],
    what='실태조사 장부 줄과 서비스 카드 줄이 같은 필지 · 같은 규칙인 8줄을 지역 숫자에서 한 줄로 셉니다(우선순위가 높은 줄을 남김). 남원 의심 건 20,887 → 20,879 · 용도 불일치(비농지 위 비닐하우스) 35 → 27 · 읍면동 7곳이 1~2씩 줄었습니다. 큰 숫자와 서비스 카드 숫자는 그대로입니다. '
         '통계 · 목록 · 요약 · XI ChatGEO · 보고서가 같은 값인지 서버 시험과 숫자 대조로 확인했습니다. 숫자 정의라 그림은 지금 보고서 화면입니다. ' + T('now-gov-report')))
A.append(dict(id='해외-큰숫자', t='해외 기관 첫 화면 큰 숫자를 우리 해외 모델 값으로 바꿨습니다', shots=[S('now-ov-crop-drop'), S('now-ov-sprawl')], opts=DONE,
    where=[[OVS + '/', OV, '첫 화면 큰 숫자 · 오른쪽 Sprawl 탭']],
    what=f"작황 하락의 경작지 바탕을 우리 해외 모델 경작지로 바꿨습니다(고지대처럼 크게 부풀린 9군은 다시 학습 전까지 공개 판정 값). 건물 면적 변화는 같은 모델을 2017년 영상에도 돌려 두 해를 같은 모델로 비교합니다. 지금 화면: Ysyk-Ata 작황 하락 {ov['crop']['v']}㎢ · 건물 면적 변화 {ov['sprawl']['v']}㎢. 화면 큰 숫자와 XI ChatGEO 답이 같은 값입니다. " + T('now-ov-crop-drop', 'now-ov-sprawl'),
    table=[['Ysyk-Ata', '전(공개 판정)', '후(우리 모델)'], ['작황 하락 · 가을 2025', '117.9㎢', '147.5㎢'], ['건물 면적 2017', '109.9㎢', '50.7㎢'], ['건물 면적 2025', '127.1㎢', '66.0㎢'], ['건물 면적 변화', '17.2㎢', '15.3㎢']]))
A.append(dict(id='이름-남은4줄', t="남아 있던 배포 이름 4줄을 '전남광주특별시'로 바꿨습니다", shots=[S('now-admin-tenants')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/tenants', ADM, '왼쪽 메뉴 기관']],
    what="구례군 · 여수시 · 목포시 · 강진군 배포 4줄의 이름과 지역 이름에서 '통합'을 뺐습니다. 바꾸기 전 · 뒤 줄은 따로 남겼고 기록 장부는 건드리지 않았습니다. 지금 기관 화면에서 '전남광주특별시'가 보이고 옛 이름은 없음을 확인했습니다. " + T('now-admin-tenants')))
A.append(dict(id='해외-겹침없이', t="해외 'AI 경작지' 넓이를 조각이 겹친 곳 없이 다시 셌습니다", shots=[S('now-ov-register')], opts=DONE,
    where=[[OVS + '/', OV, '오른쪽 Register 탭(구역 대장 대조)']],
    what='군별 경작지 장부(한 출처)를 결과 조각이 겹친 곳을 한 번만 센 넓이로 다시 계산했습니다. 우리 모델 값인 32군이 줄었고, 고지대 9군 공개 판정 값은 그대로입니다. 장부를 읽는 해외 첫 화면 · XI맵 해외 · 구역 대장 대조 · XI ChatGEO 가 같은 값을 냅니다. Ysyk-Ata 716.8 → 647.6㎢(대장 대조 화면 AI 64,763ha). ' + T('now-ov-register'),
    table=[['군', '전(조각 넓이 합)', '후(겹침 없는 넓이)'], ['나라 합계(41군)', '13,847㎢', '12,536㎢'], ['Sokuluk', '872.7㎢', '794.1㎢'], ['Kara-Suu', '800.8㎢', '729.1㎢'], ['Suzak', '755.8㎢', '708.2㎢'], ['Jayyl', '735.2㎢', '692.4㎢'], ['Ysyk-Ata', '716.8㎢', '647.6㎢'], ['Moskva', '703.0㎢', '607.5㎢']]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=A))

# ── 재검수
B = []
B.append(dict(id='재검수-바퀴16', t='바퀴 16 재검수 — 안 되던 곳을 고쳤고, 동시 검수에서도 진짜 고장은 0건이었습니다', shots=[S('now-xi-choices'), S('now-xi-stats-step1'), S('now-gov-report'), S('now-ov-english'), S('now-ov-english-answer')], opts=OK,
    where=[[XI, STAFF + ' · 브라우저 폭 1366', "질문 뒤 '고성' 입력 → 후보 칩이 통계 단추를 덮지 않음"], [ORG + '/landxi/v3/xi-clean/', GOV, '왼쪽 위 한 줄 → 목록 → 보고서로'], [OVS + '/landxi/v3/global/', OV, "XI ChatGEO 에 한국어를 치면 'Please ask in English' · 영어로 묻기"]],
    what="지난 기능 63개 · 이번 바퀴 새 기능 42개를 다시 눌렀고 안 되던 9가지를 고쳤습니다(1366 후보 칩 · 답 칸과 통계 단추 겹침 · 좁은 화면 판이 한 번 비쳤다 접힘 · 서랍에 가려진 통계 · 도착 뒤 왼쪽 위 한 줄 늦음 · 읍면동 두 번 비행 · 기관 보고서로 안 됨 · 해외 경작지 넓이 · XI맵 키르기스스탄 질문이 국내로 답함). "
         "그 뒤 이어서 고친 것: ① 저장 표본을 다시 쓰는 일꾼 둘을 다시 켰습니다(인프라 화면 처음 열기 불러오는 중 38초 → 1.5초) ② 해외 화면은 영어 전용이라 한국어 질문은 보내지 않고 입력 줄 위에 'Please ask in English' 한 줄만 보입니다(넷째 그림) — 영어로 묻자 'AI cropland area of Ysyk-Ata 64,763 ha ≈ 647.6㎢'가 나와 화면 값과 같습니다(다섯째 그림) "
         "③ XI맵 목록 제목은 한 줄이고 '보고서로'는 아래 줄입니다 ④ 관리자 범례의 '적용 요청'을 '기관에 공유'로 바꿨습니다 ⑤ 인프라 화면이 같은 요청을 사건마다 되풀이하던 것을 10초 묶음으로 줄였습니다. "
         "Haiku 6개가 영역별로 동시에 검수한 '문제' 목록을 Sonnet 이 하나씩 다시 열어 판정한 결과 진짜 고장은 0건이었습니다(찾는 글쇠가 틀렸거나 기다린 시간을 화면 시간으로 센 것이거나 설계대로인 것). " + T('now-xi-choices', 'now-xi-stats-step1', 'now-gov-report', 'now-ov-english', 'now-ov-english-answer'),
    table=[['고친 것', '전', '후'], ['인프라 화면 처음 열기', '38초', '1.5초'], ['관리자 범례 이름', '적용 요청', '기관에 공유'], ['동시 검수 판정', 'Haiku 6개가 올린 문제', '진짜 고장 0건']]))
B.append(dict(id='속도-바퀴16', t='느린 곳을 재서 줄였습니다 — XI맵 집계 1.3→0.9초 · 관리자 GPU 표 최대 5.6→0.5초 · 인프라 처음 열기 38→1.5초', shots=[S('now-admin-infra'), S('now-admin-deploys')], opts=OK,
    where=[[ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라 열기'], [ADMIN + '/landxi/v3/ops-infra/#/deploys/improve', ADM, '배포 — 개선 후보 다시 열기']],
    what=f"XI맵 첫 열기 집계 1.2~1.3 → 0.8~0.9초 · 규칙 집계 0.77 → 0.4초 · 관리자 GPU 표 1.2~5.6 → 0.1~0.5초 · 개선 후보 다시 열기 10.8 → 2.0초 · 인프라 다시 열기 9.9 → 2.9초, 처음 열기 38 → 1.5초(저장 표본 일꾼을 다시 켠 뒤). 숫자는 그대로입니다(30가지 조합 대조 같음). "
         f"지금 바깥 주소에서 다시 재어 보니 인프라 {ad['infraSec']}초 · 배포 신청 {ad['deploysSec']}초(기다림 1.5초 포함)에 모두 보입니다. " + T('now-admin-infra', 'now-admin-deploys'),
    table=[['화면', '전', '후'], ['XI맵 첫 열기 집계', '1.2~1.3초', '0.8~0.9초'], ['관리자 GPU 표', '1.2~5.6초', '0.1~0.5초'], ['개선 후보 다시 열기', '10.8초', '2.0초'], ['인프라 처음 열기', '38초', '1.5초']]))
items.append(dict(section='B. 재검수 결과', desc='전수 재검수와 속도 개선 결과입니다. 확인을 눌러 주세요.', items=B))

# ── 질문
Q = []
Q.append(dict(id='지도서비스-설명글', t="지도 서비스의 설명 글 두 줄을 지울까", shots=[S('now-map-hints')], opts=['지움', '그대로'],
    where=[[LM, STAFF, "왼쪽 아래 '영상끼리 만나는 경계는…' · 지도 아래 '도형을 누르면…'"]],
    now="지도 서비스에 설명 글이 두 줄 있습니다: '도형을 누르면 오른쪽에 속성이 펼쳐집니다'(지도 왼쪽 아래) · '영상끼리 만나는 경계는 촬영 시기가 다른 곳입니다'(바탕 선택 아래). 화면에는 설명 글을 두지 않기로 한 방향과 맞지 않습니다. " + T('now-map-hints'),
    prop='지웁니다. 도형을 누르면 속성이 열리는 동작은 그대로입니다.'))
Q.append(dict(id='측정멈춤-표시', t="장비 측정이 멈추면 관리자 화면에 '측정 멈춤' 한 줄을 넣을까", shots=[S('now-admin-infra')], opts=['넣음', '안 넣음'],
    where=[[ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라 — 장비 · 전력 표']],
    now='장비 부하 · 전력 값이 한동안 새로 들어오지 않으면 표가 마지막 값으로 멈춰 있어도 정상처럼 보입니다(전에 14:25 값에 멈춘 적이 있었습니다). 지금 그림은 정상일 때라 따로 표시가 없습니다. ' + T('now-admin-infra'),
    prop="새 값이 2분 넘게 안 들어오면 장비 표 위에 '측정 멈춤 · 마지막 값 시각' 한 줄을 보입니다."))
Q.append(dict(id='해외군-추천질문', t="XI맵 키르기스스탄에서 군을 누르면 추천 질문에 '이 군 경작지 넓이'를 넣을까", shots=[S('now-xi-kg-gun')], opts=['넣음', '안 넣음'],
    where=[[XI + '?nation=kg', STAFF, '키르기스스탄 → 군 누르기']],
    now='키르기스스탄 군을 누르면 왼쪽 아래에 그 군의 경작지 판정 카드가 뜨지만, 아래 XI ChatGEO 에는 이어서 물어볼 추천 질문이 없습니다. ' + T('now-xi-kg-gun'),
    prop="누른 군 이름을 넣은 추천 질문 '이 군 경작지 넓이'를 입력 줄 위에 보입니다. 누르면 그 군의 AI 경작지 넓이를 답합니다."))
Q.append(dict(id='배포이름-적용', t="배포 기록 이름 끝 '· 적용'을 '· 기관에 공유'로 바꿀까", shots=[S('now-admin-shares')], opts=['바꿈', '그대로'],
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys', ADM, "배포 → '기관 공유' 탭"]],
    now="서비스를 기관에 공유하면 만들어지는 배포 기록의 이름이 '남원시 · 적용'처럼 끝에 '적용'이 붙습니다. 화면 용어는 '기관에 공유'로 통일했는데 이 이름만 옛 말로 남아 있습니다. " + T('now-admin-shares'),
    prop="이름 끝을 '· 기관에 공유'로 바꿉니다. 이미 만들어진 배포 기록의 이름도 같이 바꿀지는 바꾼 뒤 보고드립니다."))
Q.append(dict(id='전국해외-번갈아', t='전국 작업이 늘 대기열에 있어 해외 나라 분석이 계속 기다립니다 — 번갈아 할까', shots=[S('now-admin-infra')], opts=['번갈아', '지금대로'],
    where=[[ADMIN + '/landxi/v3/ops-infra/', ADM, '인프라 — 맨 아래 대기 · 진행 줄']],
    now='전국 농지 · 하천 작업이 대기열에 늘 남아 있어서, 해외 나라 분석을 넣으면 전국 작업이 끝나기를 계속 기다립니다. ' + T('now-admin-infra'),
    prop='전국 작업이 한 조각 하고 한 번 비켜 주어, 해외 작업과 한 조각씩 번갈아 합니다. 전국 마무리는 조금 늦어지고 해외 분석은 바로 시작합니다.'))
items.append(dict(section='C. 새 질문', desc='이번 바퀴에 남은 결정 다섯 가지입니다.', items=Q))

out = os.path.join(NOW, 'confirm-items-r16.json')
json.dump(items, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', [len(x['items']) for x in items])
json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ── 굽기: now 에 이미지 모으고 페이지 생성
env = dict(os.environ, LX_CONFIRM_ITEMS=os.path.join(NOW, 'confirm-items.json'), LX_CONFIRM_ROUND='now', LX_CONFIRM_EXTRA=SH, PYTHONIOENCODING='utf-8',
           LX_CONFIRM_TITLE='답을 기다리는 것 — 지금 화면 기준',
           LX_CONFIRM_LEAD='한눈에 하나 · 구현 확인 열여덟 · 재검수 결과 둘 · 새 질문 다섯입니다. 그림은 모두 10월 17일 21:51~21:57에 바깥 주소 로그인 폼으로 새로 찍었고, 못 찍는 장면은 구현 때 그림이라고 따로 표시했습니다. 고르시면 이 브라우저에 저장되고, 맨 아래 \'결정 복사\'로 대화창에 붙여 주세요.')
subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'review', 'build-confirm.py')], env=env, check=True)
idx = os.path.join(ROOT, 'landxi', 'proto', 'review', 'confirm', 'now', 'index.html')
h = open(idx, encoding='utf-8').read()
h2 = re.sub(r'(<figure><a href="img/impl-[^"]*"[^>]*><img[^>]*></a>)(</figure>)', r'\1<figcaption>구현 때 그림</figcaption>\2', h)
open(idx, 'w', encoding='utf-8').write(h2)
print('구현 때 그림 이름표', h2.count('구현 때 그림</figcaption>'))
