"""바퀴 15 now 항목 JSON 만들기. 사용: python build-items-r15.py <shots-r15 폴더>
증거 그림(전 그림 · 녹화)은 이름에 시각(파일 수정 시각)을 붙여 같은 폴더로 모은다. 숫자는 log-*.json 과 각 구현 증거에서 옮긴다."""
import glob, json, os, re, shutil, sys, datetime
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
IMG = APP + '/landxi/proto/review/confirm/now/img/'
EV = {   # 전(고치기 전) 그림 — 증거 파일 · 수정 시각을 이름 끝에 붙인다
    'old-zoom-green-z9': 'impl-41/zoomout/shots/before-map-namwon-greenhouse-z9-1440-1051.png',
    'old-zoom-green-z11': 'impl-41/zoomout/shots/before-map-namwon-greenhouse-z11-1440-1051.png',
    'old-zoom-bldg-z11': 'impl-41/zoomout/shots/before-map-building-z11-1440-1052.png',
    'old-zoom-xisvc-z11': 'impl-41/zoomout/shots/before-xi-service-z11-1440-1105.png',
    'old-zoom-xinat-z11': 'impl-41/zoomout/shots/before-xi-national-z11-1440-1118.png',
    'old-density-d2': 'impl-38/small-five/shots/before-d2-fill-1440-1113.png',
    'keep-country-60m': 'impl-38/overseas-train/keep/preview/kgz-2025-08-country-60m.jpg',
    'keep-chuy-aug': 'impl-38/overseas-train/keep/preview/kgz-2025-08-chuy.jpg',
}
for base, rel in EV.items():
    src = os.path.join(PR, rel)
    t = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    shutil.copy2(src, os.path.join(SH, f'{base}-{t:%H%M}' + os.path.splitext(src)[1]))
VID = {'steps': 'impl-39/ximap-steps/ximap-steps-20s.mp4', 'panes': 'impl-39/panes/shots/video/panes-review.webm', 'colors': 'impl-40/map-colors/map-colors-10s.mp4'}
VN = {}
for k, rel in VID.items():
    src = os.path.join(PR, rel); t = datetime.datetime.fromtimestamp(os.path.getmtime(src))
    VN[k] = (f'{os.path.splitext(os.path.basename(src))[0]}-{t:%H%M}' + os.path.splitext(src)[1], t)
    shutil.copy2(src, os.path.join(SH, VN[k][0]))


def S(base):
    f = sorted(glob.glob(os.path.join(SH, base + '-[0-9][0-9][0-9][0-9].*')))
    assert f, base
    return os.path.basename(f[-1])


def hm(b):
    m = re.search(r'-(\d\d)(\d\d)\.', S(b)); return f'{m.group(1)}:{m.group(2)}'


def T(*bs):
    ts = sorted(hm(b) for b in bs)
    return f'(그림 찍은 시각 10월 17일 {ts[0]}' + ('' if ts[0] == ts[-1] else f'–{ts[-1]}') + ')'


def OLD(*bs):
    out = []
    for b in bs:
        t = datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(SH, S(b))))
        out.append(f'{t.month}월 {t.day}일 {t:%H:%M}')
    return '옛 그림은 ' + ' · '.join(sorted(set(out))) + '에 찍은 것입니다.'


def VL(k):
    t = VN[k][1]
    return [IMG + VN[k][0], f'로그인 없이 열림 · 영상({t.month}월 {t.day}일 {t:%H:%M} 녹화)', '재생']


DONE, OK = ['완료', '다시'], ['확인']
XI = APP + '/landxi/v3/xi-clean/'
LM = APP + '/landxi/v3/lx-map/'
num = lambda x: f'{x:,}'
items = []

items.append(dict(section='한눈에', desc='지금 화면 네 장입니다. 모두 이번에 바깥 주소에 로그인 폼으로 들어가 찍었습니다.', items=[dict(
    id='한눈에', t='지금 화면 네 장', shots=[S('now-xi-s1'), S('now-staff-namwon-parcel-card'), S('now-map-color-open'), S('now-map-namwon-greenhouse-z9')], opts=OK,
    where=[[XI, STAFF, "아래 채팅 창에 '남원시 비닐하우스 현황 보여줘'"], [XI, STAFF, "오른쪽 '층' → '지적' 켜기 → 가까이 → 빈 땅 누르기"], [LM, STAFF, '켜진 층 줄의 색 점'], [LM, STAFF, '비닐하우스 분석서비스 · 남원시를 켜고 멀리 보기']],
    what='XI맵(질문하면 먼저 지도에만) · XI맵 필지 카드 · 지도 서비스 색 바꾸기 칸 · 남원 비닐하우스를 멀리서 본 지도(줌 9)입니다. ' + T('now-xi-s1', 'now-staff-namwon-parcel-card', 'now-map-color-open', 'now-map-namwon-greenhouse-z9'))]))

A = []
# ───── XI맵 단계 · 칸 · 객체 (구현 39)
A.append(dict(id='XI맵-지금+C', t='XI맵 결과 표시 — 지금 모양에 말풍선만 더했습니다', shots=[S('now-xi-home'), S('now-xi-hover-big')], opts=DONE,
    where=[[XI, STAFF, '첫 화면 · 왼쪽 위 큰 숫자에 마우스'], VL('steps')],
    what=f"시안 단추는 없고, 결과가 많은 곳 말풍선 셋({' · '.join(st['home']['bubbles'])})이 떠 있습니다. 큰 숫자에 올리면 결과가 있는 자리에서 빛 줄기가 숫자로 모입니다. " + T('now-xi-home', 'now-xi-hover-big')))
A.append(dict(id='XI맵-단계나누기', t='질문하면 먼저 지도에만 — 통계는 원할 때 한 단계씩', shots=[S('now-xi-s1'), S('now-xi-s2'), S('now-xi-s3')], opts=DONE,
    where=[[XI, STAFF, "'남원시 비닐하우스 현황 보여줘' → 오른쪽 위 '통계 보기' → 판의 '크게 보기' → '지도로 돌아가기'"], VL('steps')],
    what=f"세 단계 모두 같은 숫자입니다(남원시 비닐하우스 {num(st['s1']['main']['value'])}동). 단계마다 되돌아갈 길이 있고, 답 끝에도 '통계 보기' · '크게 보기' 단추가 있습니다. " + T('now-xi-s1', 'now-xi-s2', 'now-xi-s3'),
    table=[['단계', '보이는 것', '되돌아가기'], ['1 지도에만', '지도가 차오름 · 꼬리표 · 오른쪽 위 한 줄', '× 로 닫기'], ['2 지도 위 통계', '오른쪽 통계 판(접고 펼침)', "'지도만'"], ['3 대시보드', '지도 칸 + 통계 칸', "'지도로 돌아가기'"]]))
A.append(dict(id='XI맵-통계단추', t="'통계' 단추 — 눌렀을 때 분명히 바뀝니다", shots=[S('now-xi-s1'), S('now-xi-s2'), S('now-xi-s3')], opts=DONE,
    where=[[XI, STAFF, "질문 뒤 왼쪽 아래 '통계 · 지도만 | 지도 위 | 대시보드'"]],
    what="지금 단계가 진하게 보이고, 누르면 그 단계로 바뀝니다. 통계가 없을 때는 단추가 숨습니다(전에는 눌러도 변화가 없었습니다). " + T('now-xi-s1', 'now-xi-s2', 'now-xi-s3')))
A.append(dict(id='XI맵-칸조절', t='통계 판과 지도 칸을 끌어서 넓히고 접고 펼 수 있습니다', shots=[S('now-xi-s2'), S('now-xi-pane-after'), S('now-xi-pane-folded'), S('now-xi-s3'), S('now-xi-pane-dash-after')], opts=DONE,
    where=[[XI, STAFF, '2단계 판 왼쪽 가장자리 · 3단계 지도 칸 오른쪽 가장자리를 끌기 · 꺾쇠로 접기'], VL('steps')],
    what='다시 열어도 크기를 기억합니다. 두 번 누르면 기본 크기로 돌아옵니다. ' + T('now-xi-s2', 'now-xi-pane-after', 'now-xi-pane-folded', 'now-xi-s3', 'now-xi-pane-dash-after'),
    table=[['칸', '끌기 전', '끈 뒤'], ['2단계 통계 판 폭', f"{st['panel']['before']}px", f"{st['panel']['after']}px"], ['3단계 지도 칸 폭', f"{st['dash']['before']}px", f"{st['dash']['after']}px"]]))
A.append(dict(id='XI맵-마우스', t='객체 위에서는 손가락 모양, 빈 지도에서는 끌기 모양', shots=[S('now-xi-obj-pointer')], opts=DONE,
    where=[[XI, STAFF, '남원시로 들어가 객체 위 · 빈 지도 위에 마우스']],
    what=f"객체 위는 손가락, 빈 지도는 끌기 손 모양입니다. 올리면 맨 위 객체 하나만 떠오릅니다. " + T('now-xi-obj-pointer')))
A.append(dict(id='XI맵-겹침고르기', t="겹친 객체는 '겹침 3' 표시 뒤 목록에서 고릅니다", shots=[S('now-xi-overlap-hover'), S('now-xi-overlap-pick'), S('now-xi-overlap-picked')], opts=DONE,
    where=[[XI, STAFF, '객체가 겹친 자리에 올리기 · 누르기']],
    what=f"겹침 3 → 목록({' · '.join(st['picker'])}) → 고른 것의 고치기 칸이 열립니다. " + T('now-xi-overlap-hover', 'now-xi-overlap-pick', 'now-xi-overlap-picked')))
A.append(dict(id='XI맵-클래스색반영', t='클래스를 바꾸면 지도 색이 바로 바뀝니다', shots=[S('now-xi-reclass-color')], opts=DONE,
    where=[[XI + '?test=1', STAFF, '객체 누르기 → 클래스 바꾸기 → 다른 클래스 고르기 → 되돌리기(시험)']],
    what=f"경작지를 '{st['reclass']['cls']}'로 바꾸자 그 객체가 곧바로 {st['reclass']['cls']} 색으로 칠해졌고, 되돌리니 원래대로 돌아왔습니다(시험은 되돌려 두었습니다). 저장된 고치기라 다시 열어도 같습니다. " + T('now-xi-reclass-color')))
A.append(dict(id='XI맵-클래스켜끄기', t="'층' 판의 클래스 체크로 켜고 끕니다", shots=[S('now-xi-layers'), S('now-xi-cls-off')], opts=DONE,
    where=[[XI, STAFF, "오른쪽 '층' → '클래스' 체크 끄기"]],
    what=f"'{st['offCls']}'을 끄면 지도에서 빠지고, 왼쪽 위 숫자는 끈 것을 뺀 값에 '보이는 것 기준'이 붙습니다. " + T('now-xi-layers', 'now-xi-cls-off')))
A.append(dict(id='칸-크기조절', t='나뉜 칸은 모두 끌어서 크기를 바꾸고 접고 펼 수 있습니다', shots=[S('now-xi-pane-after'), S('now-xi-pane-dash-after')], opts=DONE,
    where=[[XI, STAFF, '2단계 판 · 3단계 지도 칸(위 항목과 같은 방법)'], VL('panes')],
    what='XI맵 말고도 LX 직원 10 · LX 관리자 8 · 기관 5 · 해외 1 화면과 공용 서랍 44곳이 같은 부품입니다. 기본 크기는 지금 그대로이고 사람 · 화면마다 크기를 기억합니다. 아래 그림은 XI맵 칸입니다. ' + T('now-xi-pane-after', 'now-xi-pane-dash-after')))
# ───── 지적 · 필지 (구현 40)
A.append(dict(id='XI맵-지적층', t="'층' 판에 '지적' 한 줄 — 켜면 LX맵 편집지적도가 지도에", shots=[S('now-xi-cad-far'), S('now-staff-namwon-cad-on'), S('now-xi-layers')], opts=DONE,
    where=[[XI, STAFF, "오른쪽 '층' → 맨 아래 '지적' 체크 → 지도를 가까이"], [ORG + '/landxi/v3/xi-clean/', GOV, "같은 '층' → '지적'"]],
    what="기본은 꺼짐이고 LX 직원 · 기관 모두 있습니다. 멀리서는 체크만 흐려집니다(첫 그림). 가까이 가면 필지선 · 지번이 또렷합니다(둘째 그림). " + T('now-xi-cad-far', 'now-staff-namwon-cad-on', 'now-xi-layers')))
pc = lambda d: d['card']['parcel']
A.append(dict(id='XI맵-필지카드', t='지적을 켜고 빈 땅을 누르면 필지 카드가 열립니다', shots=[S('now-staff-namwon-parcel-card'), S('now-staff-hamyang-parcel-card'), S('now-gov-namwon-parcel-card'), S('now-gov-drawer')], opts=DONE,
    where=[[XI, STAFF, "'지적' 켠 뒤 줌 17 이상에서 객체 없는 땅 누르기"], [ORG + '/landxi/v3/xi-clean/', GOV, "같은 방법 → 카드 '자세히'"]],
    what='지번 · 지목 · 면적 · 공시지가와 그 필지 안 AI 분석(클래스별 수 · 면적)이 나옵니다. 남원 기관의 같은 필지는 기관 필지 카드와 같은 값입니다. ' + T('now-staff-namwon-parcel-card', 'now-staff-hamyang-parcel-card', 'now-gov-namwon-parcel-card', 'now-gov-drawer'),
    table=[['어디', '지번', '지목 · 면적', '공시지가'],
           ['남원(LX 직원)', pc(st['namwon'])['place'], f"{pc(st['namwon'])['jimok']} · {pc(st['namwon'])['area_m2']:,}㎡", f"{pc(st['namwon'])['jiga']:,}원/㎡"],
           ['함양(LX 직원)', pc(st['hamyang'])['place'], f"{pc(st['hamyang'])['jimok']} · {pc(st['hamyang'])['area_m2']:,}㎡", f"{pc(st['hamyang'])['jiga']:,}원/㎡"],
           ['남원(기관)', pc(gv['namwon'])['place'], f"{pc(gv['namwon'])['jimok']} · {pc(gv['namwon'])['area_m2']:,}㎡", f"{pc(gv['namwon'])['jiga']:,}원/㎡"]]))
A.append(dict(id='XI맵-소속필지', t='객체를 누르면 고치기 칸 맨 위에 그 객체가 속한 필지 한 줄', shots=[S('now-staff-namwon-object-parcel'), S('now-staff-hamyang-object-parcel')], opts=DONE,
    where=[[XI, STAFF, "'지적'을 켜지 않아도 됩니다 · 가까이에서 객체 누르기 → 칸 맨 위 한 줄 누르기"]],
    what=f"예: '{st['namwon']['object']}'. 한 줄을 누르면 그 필지 카드가 열립니다. " + T('now-staff-namwon-object-parcel', 'now-staff-hamyang-object-parcel')))
A.append(dict(id='클래스끔-통계', t='끈 클래스는 XI ChatGEO 지도 위 통계 숫자에서도 빠집니다', shots=[S('now-xi-stat-all'), S('now-xi-stat-off')], opts=DONE,
    where=[[XI, STAFF, "'층' → 클래스 '건물' 끄기 → '남원시 현황 보여 줘'"]],
    what='끈 뒤에 묻는 질문부터 적용됩니다. ' + T('now-xi-stat-all', 'now-xi-stat-off'),
    table=[['남원시 AI 분석 결과', '개수'], ['모두 켬', num(st['statAll']['main']['value'])], [f"{st['offName']} 끔", num(st['statOff']['main']['value'])], ['빠진 수', num(st['statAll']['main']['value'] - st['statOff']['main']['value'])]]))
A.append(dict(id='변화이름-한글', t='변화 탐지 결과의 클래스 이름이 한글로 보입니다', shots=[S('now-xi-class-names')], opts=DONE,
    where=[[XI, STAFF, "남원 변화 결과 자리에서 '층' → 클래스"]],
    what='클래스 목록 · 겹침 고르기 · 고치기 칸 · 필지 카드 모두 같은 한글 이름입니다(' + ' · '.join(b for a, b in st['classNames'][5:]) + '). ' + T('now-xi-class-names')))
# ───── 색 바꾸기 · 객체 다루기 (구현 40)
A.append(dict(id='색바꾸기-지도서비스', t='지도 서비스 색 바꾸기 — 클래스마다 색 · 투명도 · 신뢰도 색 띠', shots=[S('now-map-color-open'), S('now-map-color-ramp')], opts=DONE,
    where=[[LM, STAFF, '켜진 층 줄의 색 점 → 색 묶음 · 색 · 투명도 · 신뢰도 · 기본 색으로'], VL('colors')],
    what='색 묶음 4벌 중 고르고, 클래스마다 색을 직접 고르고, 투명도를 조절하고, 신뢰도로 바꾸면 색 띠(연속 · 단계 · 발산 · 색약 구분)로 칠합니다. 바꾸면 지도 · 범례 · 색 점에 바로 반영되고 다시 열어도 그대로이며 기본 색으로 되돌릴 수 있습니다. ' + T('now-map-color-open', 'now-map-color-ramp')))
A.append(dict(id='객체다루기-지도서비스', t='지도 서비스도 XI맵과 같은 객체 다루기', shots=[S('now-map-mouse-object'), S('now-map-overlap-hover'), S('now-map-overlap-pick'), S('now-map-overlap-picked'), S('now-map-class-off')], opts=DONE,
    where=[[LM, STAFF, '켜진 결과 위 마우스 · 겹친 자리 누르기 · 왼쪽 아래 클래스 체크']],
    what=f"객체 위 손가락 · 겹침 표시 · 고르기 목록 · 고른 것만 오른쪽 속성 칸으로 열립니다. 클래스를 끄면 지도와 숫자에서 빠지고 '보이는 것 기준'이 붙습니다({st['mapOff']['cls']} 끔: {st['mapOff']['before']} → {st['mapOff']['after']}). " + T('now-map-mouse-object', 'now-map-overlap-hover', 'now-map-overlap-pick', 'now-map-overlap-picked', 'now-map-class-off')))
A.append(dict(id='색바꾸기-XI맵', t="XI맵 '층' 판의 클래스 색 점으로 색을 바꿉니다", shots=[S('now-xi-layers'), S('now-xi-color-open'), S('now-xi-color-purple')], opts=DONE,
    where=[[XI, STAFF, "오른쪽 '층' → 클래스 줄의 색 점 · 질문 뒤 통계 판의 '지도 색' 점"]],
    what=f"비닐하우스를 보라로 바꾸자 서비스 결과 · 전국 결과 · 고친 자리 · 왼쪽 위 점이 모두 같은 보라로 바뀌었습니다(확인 뒤 기본 색으로 되돌렸습니다). 다시 열어도 그대로이고 통계 판의 색 띠도 같은 방법입니다. " + T('now-xi-layers', 'now-xi-color-open', 'now-xi-color-purple')))
A.append(dict(id='목록-끈클래스', t="지도 서비스 '목록'도 끈 클래스가 빠집니다", shots=[S('now-map-list-all'), S('now-map-list-off')], opts=DONE,
    where=[[LM, STAFF, "켜진 층 줄 '목록' → 왼쪽 아래 클래스 체크 끄기"]],
    what=f"열린 목록이 바로 다시 세어지고 수 옆에 '보이는 것 기준'이 붙습니다({st['listBefore'].split(' · ')[0]} → {st['listAfter'].split(' · ')[0]}). " + T('now-map-list-all', 'now-map-list-off')))
# ───── 기관 XI맵 3초 · 작은 다섯 (구현 38)
A.append(dict(id='기관XI맵-3초', t='기관에서 XI맵을 열 때 서버 요청이 19개에서 2개로 줄었습니다', shots=[S('now-gov-ximap')], opts=DONE,
    where=[[ORG + '/landxi/v3/xi-clean/?service=card-farm', GOV, '내 서비스 → 서비스 대시보드 → 결과 지도']],
    what=f"첫 화면에 필요한 것을 한 번에 받고, 결과 목록을 미리 계산해 두고, 결과가 보이면 첫 판이 걷힙니다. 이번에 바깥 주소에서 다시 재니 처음 {gv['govXiSec'][0]}초 · 다시 {gv['govXiSec'][1]}초였습니다(재는 때마다 조금 달라집니다). " + T('now-gov-ximap'),
    table=[['', '전', '후'], ['서버 요청(기관)', '19', '2'], ['서버 요청(LX 직원)', '13', '3'], ['첫 판이 걷힐 때까지(같은 시각 짝으로 잼)', '5.3초', '4.5초'], ['다시 열기', '2.8초', '2.5초']]))
A.append(dict(id='메뉴칸', t="왼쪽 메뉴 칸을 넓혀 '지도 서비스' · '공유 데이터'가 한 줄로 보입니다", shots=[S('now-staff-dash'), S('now-admin-dash'), S('now-gov-dash')], opts=DONE,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, "왼쪽 메뉴 '지도 서비스'"], [ADMIN + '/landxi/v3/ops-core/', ADM, '왼쪽 메뉴'], [ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '왼쪽 메뉴']],
    what='메뉴 칸을 72에서 80으로 넓혔습니다. LX 직원 · LX 관리자 · 기관 모두 한 줄이고 넘침이 없습니다. ' + T('now-staff-dash', 'now-admin-dash', 'now-gov-dash')))
A.append(dict(id='밀도색', t='㎢당 밀도 색 — 5단계로 나누어 읍면 사이 차이가 보입니다', shots=[S('old-density-d2'), S('now-xi-density')], opts=DONE,
    where=[[XI, STAFF, "'남원시 비닐하우스 어디가 많아?'"]],
    what='한 곳이 아주 커도 나머지가 옅어지지 않고, 극단값은 맨 위 색에 꼬리표를 답니다. 숫자는 그대로입니다. ' + OLD('old-density-d2') + ' ' + T('now-xi-density')))
A.append(dict(id='해외바로지역', t='해외 두 번째 방문부터 바로 지역으로 열립니다', shots=[S('now-ov-landing')], opts=DONE,
    where=[[OVS + '/', OV, '해외 기관 로그인 → 첫 화면 → 다시 열기']],
    what=f"저장이 막힌 브라우저는 처음처럼 날아갑니다. 이번에 다시 열기는 큰 숫자({ov['revisit']['v']}㎢)까지 {ov['revisit']['bigMs'] / 1000:.1f}초였습니다. " + T('now-ov-landing'),
    table=[['', '처음 방문', '두 번째', '세 번째'], ['큰 숫자까지(구현 때 잼)', '11.6초(지구본 → 나라 → 지역 비행)', '3.6초', '4.3초']]))
A.append(dict(id='대장칠', t='구역 대장 어긋남 빨간 칠은 대장 탭에서만 보입니다', shots=[S('now-ov-register'), S('now-ov-season')], opts=DONE,
    where=[[OVS + '/', OV, 'Register 탭에서 대장 올리기 → Season 탭으로 돌아오기']],
    what='대장 탭에서는 빨간 칠이 보이고, 계절 탭으로 돌아오면 작황 하락 칠이 가려지지 않습니다. ' + T('now-ov-register', 'now-ov-season')))
A.append(dict(id='가벼운조각', t='기관 XI맵 — 결과 파일에 먼 축척용 가벼운 조각을 함께 만듭니다', shots=[S('now-gov-ximap')], opts=DONE,
    where=[[ORG + '/landxi/v3/xi-clean/?service=card-farm', GOV, '결과 지도']],
    what='새 결과는 만들 때 함께 만들고, 이미 있던 44개는 다시 구웠습니다. 열기 시간은 3초에 아직 못 미칩니다(서버 요청 · 첫 판이 대부분). ' + T('now-gov-ximap'),
    table=[['', '전', '후'], ['줌 10 토지피복 조각 크기', '1,081KB', '204KB'], ['열기 시간(처음 · 다시)', '6.4 · 3.5초', '6.5 · 4.2초']]))
# ───── 줌 아웃 · 이름 · 해외
z = st['zoom']
A.append(dict(id='줌아웃-보이게', t='멀리서도 AI 분석 결과가 보입니다 — 점이 아니라 면 그대로', shots=[S('old-zoom-green-z9'), S('now-map-namwon-greenhouse-z9'), S('old-zoom-green-z11'), S('now-map-namwon-greenhouse-z11'), S('old-zoom-bldg-z11'), S('now-map-building-z11'), S('old-zoom-xisvc-z11'), S('now-xi-service-z11'), S('old-zoom-xinat-z11'), S('now-xi-national-z11')], opts=DONE,
    where=[[LM, STAFF, '비닐하우스 분석서비스 · 남원시 703건 켜기 → 시군구 전체로 줌 아웃'], [XI, STAFF, '남원시 · 익산시로 줌 10~13']],
    what='멀리서는 테두리를 화면 기준 최소 굵기로 그리고, 작은 객체는 흰 바깥 테두리와 진한 채움을 더했습니다. 가까이(줌 14.5~)는 원래 모양 그대로입니다. 결과 수 · 누르기 · 색 바꾸기는 그대로입니다. 짝마다 앞이 옛 그림, 뒤가 지금입니다. ' + OLD('old-zoom-green-z9', 'old-zoom-green-z11', 'old-zoom-bldg-z11', 'old-zoom-xisvc-z11', 'old-zoom-xinat-z11') + ' ' + T('now-map-namwon-greenhouse-z9', 'now-map-namwon-greenhouse-z11', 'now-map-building-z11', 'now-xi-service-z11', 'now-xi-national-z11'),
    table=[['보이는 객체 수(화면 안)', '전', '후', '이번에 잼'],
           ['남원 비닐하우스 703건 · 줌 9', '0', '410', num(z['namwon-greenhouse']['z']['9'])],
           ['남원 비닐하우스 703건 · 줌 11', '260', '457', num(z['namwon-greenhouse']['z']['11'])],
           [f"{z['building']['region']} 건물 {num(z['building']['n'])}건 · 줌 11", '672', '2,311', num(z['building']['z']['11'])],
           ['여주 주차장 71건 · 줌 11', '11', '40', '—'],
           ['XI맵 남원 서비스 비닐하우스 · 줌 11(화면 가운데)', '338', '670', '—']]))
A.append(dict(id='이름-전남광주특별시', t="기관 · 지역 이름을 실제 이름 '전남광주특별시'로 바로잡았습니다", shots=[S('now-admin-tenants')], opts=DONE,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/tenants', ADM, '왼쪽 메뉴 기관']],
    what=f"화면 · 서버 응답 · 데이터베이스 · 문서의 옛 이름을 모두 바꿨습니다. 이번에 기관 화면에서 '전남광주특별시'가 보이고 옛 이름은 없음을 확인했습니다. " + T('now-admin-tenants')))
A.append(dict(id='해외-1단계', t='키르기스스탄 — 우리 해외 모델로 나라 전체 분석이 끝났습니다', shots=[S('now-xi-kg'), S('now-xi-kg-public'), S('now-xi-kg-model'), S('keep-country-60m'), S('keep-chuy-aug')], opts=DONE,
    where=[[XI + '?nation=kg', STAFF, "XI맵 → 키르기스스탄 → 군 누르기 → 말풍선 맨 아래 '출처'"]],
    what=f"나라 군 42곳을 모두 분석했습니다. 화면(첫 그림)은 '{st['kgHud'][:60].rstrip()}…'입니다. 우리 모델이 크게 부풀린 군(높은 초지 · 빙하)은 다시 학습하기 전까지 공개 판정 값을 쓰며(우리 값이 공개 판정 큰 값의 1.5배를 넘고 20㎢ 이상 차이 나는 군 — 경작지 9군 · 물 8군), 말풍선에 출처가 적힙니다(둘째 그림 공개 판정 · 셋째 그림 우리 모델). 달별 합성 영상은 주마다 대표 2달과 나라 전체 1장(15개)만 남기고 나머지는 정리했습니다(넷째 · 다섯째 그림이 남긴 것). " + T('now-xi-kg', 'now-xi-kg-public', 'now-xi-kg-model') + ' ' + OLD('keep-country-60m', 'keep-chuy-aug'),
    table=[['나라 합계(㎢)', '우리 모델 2025', '공개 판정 Esri 2025', 'WorldCover 2021'], ['경작지', '15,910', '12,950', '13,069'], ['시가지', '1,789', '3,827', '1,505'], ['물', '2,886', '1,517', '1,877']]))
items.append(dict(section='A. 구현 확인', desc='열어 보시고 완료 또는 다시를 골라 주세요.', items=A))

B = []
B.append(dict(id='재검수-바퀴15', t='모든 화면 기능 약 155개를 바깥 주소에서 다시 눌러 봤습니다 — 안 되던 것은 고쳤습니다', shots=[S('now-xi-home'), S('now-admin-deploys'), S('now-gov-dash'), S('now-ov-landing')], opts=OK,
    where=[[XI, STAFF, 'XI맵 새 기능 전부'], [ADMIN + '/landxi/v3/ops-infra/#/deploys', ADM, '배포 · 기관 · 공유 데이터'], [ORG + '/landxi/v3/gov-select/?service=card-farm', GOV, '남원 기관'], [OVS + '/', OV, '해외 기관']],
    what="모두 됩니다. 10월 17일 14:30~14:39에 바깥 주소가 멈춘 것은 이 컴퓨터 안에서 저장소로 가는 길 하나가 막혀 응답이 오지 않았기 때문이고, 다른 길로 바꿔 다시 열었습니다. " + T('now-xi-home', 'now-admin-deploys', 'now-gov-dash', 'now-ov-landing'),
    table=[['화면', '확인한 기능'], ['LX 직원', '17'], ['LX 관리자', '20'], ['남원 기관', '14'], ['전남광주 기관', '6'], ['메인', '6'], ['XI맵 단계 · 칸', '12'], ['XI맵 객체', '8'], ['XI맵 지적 · 필지', '10'], ['색 바꾸기', '16'], ['줌 아웃', '8'], ['칸 조절 화면', '22'], ['해외 기관', '21'],
           ['고친 것', '관리자 탭 멈춤 · 바깥 주소 멈춤 · 고친 직후 객체 수 · 보고서 첫 열기'],
           ['시험 10건', '낡은 기대값을 지금 규칙에 맞춤'],
           ['다시 굽기', '결과 8,345개 · 실패 0']]))
B.append(dict(id='속도-바퀴15', t='느린 화면을 재서 줄였습니다 — 관리자 탭 · 기관 보고서', shots=[S('now-admin-deploys'), S('now-gov-dash')], opts=OK,
    where=[[ADMIN + '/landxi/v3/ops-infra/#/deploys', ADM, '관리자 배포 · 기관 탭'], [ORG + '/landxi/v3/gov-report/?tab=report', GOV, '보고서']],
    what='화면마다 처음 열 때와 다시 열 때를 재서 느린 곳을 고쳤습니다. 모양 · 문구는 그대로입니다. 서버 시간은 대부분 0.5초 안이고, 2초 넘는 나머지는 바깥 왕복 · 큰 파일 · 지도 움직임입니다. 남은 것은 관리자 인프라 · 공유 데이터 4~6초입니다. ' + T('now-admin-deploys', 'now-gov-dash'),
    table=[['화면(처음)', '전', '후'], ['관리자 배포 신청', '10.6초', '2.3초'], ['관리자 배포 · 기관 탭', '5~6초', '2초 안팎'], ['기관 보고서', '7.4초', '3.0초'], ['남원 기관 지도', '7.7초(지난 재검수)', '3.7초']]))
items.append(dict(section='B. 재검수 결과', desc='전수 재검수와 속도 개선 결과입니다. 확인을 눌러 주세요.', items=B))

C = [dict(id='두장-영상받기', t='계산 장비 두 장 함께 쓰기와 영상 받기 빠르게 — 진행 중', shots=[], opts=OK,
    where=[[APP + '/landxi/v3/lx-console/', STAFF, '아직 열어 볼 화면 없음']],
    what='장비 두 장을 함께 쓰는 시험과 영상 받기를 빠르게 하는 일이 지금 돌고 있습니다. 끝나면 결과를 구현 확인으로 올립니다.')]
items.append(dict(section='C. 진행 중', desc='아직 끝나지 않은 일입니다. 확인을 눌러 주세요.', items=C))

D = []
D.append(dict(id='지적-줌', t='XI맵 지적 층을 줌 15 · 16 에서도 보이게 할까', shots=[S('now-xi-cad-far'), S('now-staff-namwon-cad-on')], opts=['15부터 보이게', '지금대로 17부터'],
    where=[[XI, STAFF, "'층' → '지적' 켜고 줌 15 → 17"]],
    now='LX맵 편집지적도가 줌 17부터만 그려집니다. 첫 그림(줌 15)은 켜 둔 채 멀리서 본 것이고 필지선이 없습니다. ' + T('now-xi-cad-far', 'now-staff-namwon-cad-on'),
    prop='우리 연속지적을 지도 조각으로 구우면 15부터 보입니다(서버 일 · 저장 공간이 듭니다).'))
D.append(dict(id='지적선-합치기', t="'지적선'과 '지적'을 하나로 합칠까", shots=[S('now-xi-layers')], opts=['합침', '그대로'],
    where=[[XI, STAFF, "오른쪽 '층' 맨 아래"]],
    now="'층' 판에 '지적선'과 '지적'이 따로 있습니다. " + T('now-xi-layers'), prop="한 줄 '지적'으로 합칩니다."))
D.append(dict(id='built_new-이름', badge='새 건물-이름', t="변화 탐지 '새로 생긴 건물' 이름", shots=[S('now-xi-class-names')], opts=["'새 건물'", "'나지/정지 변화'"],
    where=[[XI, STAFF, "남원 변화 결과 자리에서 '층' → 클래스"]],
    now="지금은 서버 이름표 '새 건물'이고, 예전 시안은 '나지/정지 변화'였습니다. " + T('now-xi-class-names'), prop='둘 중 하나로 정합니다.'))
D.append(dict(id='색-공유', t='고른 지도 색을 보고서 · 기관 공유에도 쓸까', shots=[S('now-xi-color-purple')], opts=['함께 씀', '내 화면만'],
    where=[[XI, STAFF, "'층' → 클래스 색 점"]],
    now='지금은 내 브라우저에만 기억합니다. ' + T('now-xi-color-purple'), prop='함께 쓰면 보고서와 기관에 공유한 화면도 같은 색으로 나옵니다.'))
D.append(dict(id='꼬리표-색점', t='지도 위 통계 꼬리표에 클래스 색 점을 넣을까', shots=[S('now-xi-s1')], opts=['넣음', '그대로'],
    where=[[XI, STAFF, "'남원시 비닐하우스 어디가 많아?'"]],
    now='꼬리표에는 읍면동 이름과 숫자만 있습니다. ' + T('now-xi-s1'), prop='이름 앞에 그 클래스 색 점을 붙입니다.'))
D.append(dict(id='해외-큰숫자', t='해외 기관 첫 화면 큰 숫자(작황 하락 · 건물 면적 변화)도 우리 해외 모델로 바꿀까', shots=[S('now-ov-landing')], opts=['다음 바퀴에 바꿈', '지금대로'],
    where=[[OVS + '/', OV, '해외 기관 첫 화면']],
    now='지금 큰 숫자는 초록 정도 · 공개 시가지 판정에서 나온 값입니다(XI맵 해외 결과는 이미 우리 모델입니다). ' + T('now-ov-landing'), prop='다음 바퀴에 큰 숫자도 우리 해외 모델 값으로 바꿉니다.'))
D.append(dict(id='중복-세기', t='같은 필지 · 같은 규칙이 두 번 세지는 8줄 — 어떻게 셀까', shots=[], opts=['한 번만 셈', '지금대로'],
    where=[[ORG + '/landxi/v3/gov-report/?tab=report', GOV, '통계 · 보고서의 지역 숫자']],
    now='같은 필지 · 같은 규칙이 실태조사 장부와 서비스 카드 줄로 두 번 세지는 줄이 8개라 의심 건이 그만큼 많게 셉니다. 큰 숫자 현장 확인 필요 n필지는 한 번만 세어 영향이 없습니다. 이 항목은 숫자 정의라 화면 그림이 없습니다.',
    prop='필지와 규칙이 같으면 한 번만 셉니다.'))
items.append(dict(section='D. 새 질문', desc='이번 바퀴에 남은 결정 일곱 가지입니다.', items=D))
json.dump(items, open(os.path.join(NOW, 'confirm-items.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('항목', [len(x['items']) for x in items])
