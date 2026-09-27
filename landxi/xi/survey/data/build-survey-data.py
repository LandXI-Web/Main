# build-survey-data.py — XI맵 실태조사 모드(F2-A)의 off 모드 정본 사본을 02. 데이터/survey 실파일에서 만든다.
# GPU 사용 0 · GDAL 불필요(gpkg = SQLite 속성만 읽음). 원본 수정 0 · 재생성 0.
#   python landxi/xi/survey/data/build-survey-data.py
# 산출(전부 이 폴더):
#   findings-emd.json      읍면동 39행(광치동-5 1필지 0건은 같은 emd_cd 광치동에 합침) · 합계 = README 표(검증 실패 시 쓰지 않음)
#   rules-fixture.json     R1–R6 이름 · 조건 · 임계[추정 초기값] · 건수 · 등급
#   findings-lite.json     의심 20,872건(규칙별 1행) + 필지 대장·현황 속성(열 배열) — 큐 서랍 · 필지 카드 v2 off 정본
#   replay/survey-namwon.ndjson  대조 작업 39칸 합성 리플레이(F2-S 녹음 전 · 시연 · 저장 결과 재생) — 서→동 순서
import json, sqlite3, os, math, sys, datetime, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))            # 01. 디자인
DATA = os.path.abspath(os.path.join(ROOT, '..', '02. 데이터', 'survey'))
EMD_GEO = os.path.join(ROOT, 'landxi', 'assets', 'data', 'geo', 'namwon-emd.geojson')
AS_OF = '2026-09-24'
README = {'parcels': 332084, 'findings': 20872, 'suspect_parcels': 20852,
          'by_rule': {'R1': 4140, 'R2': 15651, 'R3': 20, 'R4': 33, 'R5': 464, 'R6': 564},
          'by_priority': {'A': 1053, 'B': 7386, 'C': 12433}}

summ = json.load(open(os.path.join(DATA, 'namwon-parcel-emd-summary.json'), encoding='utf-8'))
geo = json.load(open(EMD_GEO, encoding='utf-8'))

def bbox(g):
    b = [180, 90, -180, -90]
    def walk(c):
        nonlocal b
        if isinstance(c[0], (int, float)):
            b = [min(b[0], c[0]), min(b[1], c[1]), max(b[2], c[0]), max(b[3], c[1])]
        else:
            for x in c: walk(x)
    walk(g['coordinates']); return b
geo_by_cd = {f['properties']['cd']: f for f in geo['features']}

# ── 1. 읍면동 39행 ──
rows = {}
for name, v in summ['by_emd'].items():
    cd = v['emd_cd']
    base = name.split('-')[0]
    r = rows.setdefault(cd, {'emd_cd': cd, 'emd': base, 'parcels': 0, 'suspect_parcels': 0, 'findings': 0,
                             'by_rule': {k: 0 for k in README['by_rule']}, 'by_priority': {'A': 0, 'B': 0, 'C': 0}, 'top5': []})
    r['parcels'] += v['parcels']; r['suspect_parcels'] += v['suspect_parcels']; r['findings'] += v['suspects_total']
    for k, n in v['suspects'].items(): r['by_rule'][k] += n
    for k, n in v['priority'].items(): r['by_priority'][k] += n
    if v['top5']: r['top5'] = v['top5']
for cd, r in rows.items():
    f = geo_by_cd.get(cd)
    if f:
        b = bbox(f['geometry']); r['bbox'] = [round(x, 5) for x in b]; r['center'] = [round((b[0] + b[2]) / 2, 5), round((b[1] + b[3]) / 2, 5)]
emd_rows = sorted(rows.values(), key=lambda r: r['center'][0] if 'center' in r else 0)   # 서 → 동(대조 스윕 순서)
tot = {'parcels': sum(r['parcels'] for r in emd_rows), 'findings': sum(r['findings'] for r in emd_rows), 'suspect_parcels': sum(r['suspect_parcels'] for r in emd_rows),
       'by_rule': {k: sum(r['by_rule'][k] for r in emd_rows) for k in README['by_rule']},
       'by_priority': {k: sum(r['by_priority'][k] for r in emd_rows) for k in 'ABC'}}
bad = [k for k in README if README[k] != tot[k]]
if len(emd_rows) != 39 or bad or any(cd not in geo_by_cd for cd in rows):
    print('검증 실패 — 쓰지 않음', len(emd_rows), bad, tot); sys.exit(2)
prov = {'as_of': AS_OF, 'source': '02. 데이터/survey/namwon-parcel-emd-summary.json', 'basis': 'inferred',
        'note': 'V-World 연속지적 2026-09-24 × AI 2023 25cm·2025 A02(검수 전) · 의심 후보이며 위법 판정 아님 · 임계 [추정 초기값]'}
json.dump({**prov, 'totals': tot, 'rows': emd_rows, 'built': datetime.datetime.now().isoformat(timespec='seconds'), 'built_by': 'landxi/xi/survey/data/build-survey-data.py'},
          open(os.path.join(HERE, 'findings-emd.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ── 2. 규칙 ──
TH = summ['thresholds_estimated_initial']
rule_th = {'R1': {'bld_m2_min': TH['R1_bld_m2']}, 'R2': {'parcel_m2_min': TH['R2_parcel_min_m2'], 'farm_ratio_max': TH['R2_crop_ratio_max'], 'bld_ratio_max': TH['R2_bld_ratio_max']},
           'R3': {'gh_m2_min': TH['R3_gh_m2']}, 'R4': {'park_m2_min': TH['R4_park_m2']}, 'R5': {'farm_m2_min': TH['R5_crop_m2'], 'farm_ratio_min': TH['R5_crop_ratio']}, 'R6': {'bld_m2_min': TH['R6_bld_m2']}}
con = sqlite3.connect(os.path.join(DATA, 'namwon-parcel-survey.gpkg'))
prio_by_rule = {}
for rule, pr, n in con.execute('select rule, priority, count(*) from suspects group by rule, priority'):
    prio_by_rule.setdefault(rule, {'A': 0, 'B': 0, 'C': 0})[pr] = n
rules = [{'id': k, 'version': '1.0', 'name': v['name'], 'condition': v['condition'], 'thresholds': rule_th[k], 'thresholds_basis': 'estimate',
          'count': tot['by_rule'][k], 'by_priority': prio_by_rule.get(k, {}), 'basis': 'inferred',
          'common': {'obj_in_frac': TH['obj_in_frac'], 'conf_min': TH['conf_min']},
          'limits': {'R1': '합법 농업용 시설(축사·농막·창고) · 지목변경 미정리 · 연속지적 경계 어긋남 · 칩 경계 잘림이 오탐을 만든다',
                     'R2': '과다 추정 가능 — 1,000㎡ 이상 농지의 25.8%가 걸리고 70%는 AI 농경 0(미탐·촬영 계절) · 2025 반증 시 감점',
                     'R3': '25cm 모델은 비닐하우스를 거의 못 잡는다(전역 728) — 실제보다 크게 적다',
                     'R4': '주차장 판독 · 농업용 작업장과 구분 어려움', 'R5': '태양광 패널이 경작지·비닐하우스로 오탐될 수 있다',
                     'R6': '도로 필지와 겹친 대지 건물(연속지적 어긋남)이 오탐을 만든다'}[k]}
         for k, v in summ['rules'].items()]
rules.sort(key=lambda r: r['id'])
json.dump({**prov, 'source': '02. 데이터/survey/namwon-parcel-emd-summary.json#rules · README §3', 'priority_cut': summ['totals']['priority_cut'], 'items': rules},
          open(os.path.join(HERE, 'rules-fixture.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ── 3. 의심 20,872건 + 필지 속성 ──
pcols = ['pnu', 'ri', 'jibun', 'emd_cd', 'area_m2', 'jiga', 'gosi_year', 'yongdo', 'nongup',
         'a23_bld_m2', 'a23_crop_m2', 'a23_park_m2', 'a23_gh_m2', 'a23_bld_n', 'a23_crop_n', 'a23_park_n', 'a23_gh_n',
         'a23_bld_in_m2', 'a23_park_in_m2', 'a23_gh_in_m2', 'a23_bld_conf', 'a23_crop_conf',
         'a25_crop_m2', 'a25_uncrop_m2', 'a25_gh_m2', 'a25_gh_n', 'chg', 'chg_built_new_m2', 'flags']
P = {}
for row in con.execute('select ' + ','.join(pcols) + ' from parcels where pnu in (select pnu from suspects)'):
    P[row[0]] = dict(zip(pcols, row))
scols = ['rank', 'priority', 'score', 'rule', 'pnu', 'emd', 'jimok', 'parcel_m2', 'evid_m2', 'conf', 'corroboration', 'img_date', 'evidence', 'ai_ids', 'lon', 'lat']
DICT = {k: [] for k in ['emd', 'ri', 'jimok', 'yongdo', 'nongup', 'corroboration', 'img_date', 'flags']}
def code(k, v):
    v = v or ''
    if v not in DICT[k]: DICT[k].append(v)
    return DICT[k].index(v)
COLS = ['id', 'rank', 'priority', 'score', 'rule', 'pnu', 'emd_cd', 'emd', 'ri', 'jibun', 'jimok', 'parcel_m2', 'evid_m2', 'conf', 'lon', 'lat', 'yongdo', 'nongup']
DCOLS = ['id', 'corroboration', 'img_date', 'evidence', 'ai_ids', 'jiga', 'gosi_year', 'a23', 'a25', 'chg', 'chg_built_new_m2', 'flags']
out = []; det = {}
r5 = lambda v: None if v is None else round(v, 1) if isinstance(v, float) else v
for s in con.execute('select ' + ','.join(scols) + ' from suspects order by rank'):
    d = dict(zip(scols, s)); p = P[d['pnu']]
    jb = (p['jibun'] or '').strip()
    jb = re.sub(r'[\s가-힣]+$', '', jb)   # 끝의 지목 한 글자(답·임·잡·도…) 떼기 · 앞의 '산'은 유지
    a23 = [r5(p[k]) for k in ['a23_bld_m2', 'a23_crop_m2', 'a23_park_m2', 'a23_gh_m2', 'a23_bld_n', 'a23_crop_n', 'a23_park_n', 'a23_gh_n', 'a23_bld_in_m2', 'a23_park_in_m2', 'a23_gh_in_m2']] +           [None if p[k] is None else round(p[k], 3) for k in ['a23_bld_conf', 'a23_crop_conf']]
    a25 = [r5(p[k]) for k in ['a25_crop_m2', 'a25_uncrop_m2', 'a25_gh_m2', 'a25_gh_n']]
    fid = f"f_{d['rule']}_{d['pnu']}"
    out.append([fid, d['rank'], d['priority'], d['score'], d['rule'], d['pnu'], p['emd_cd'], code('emd', d['emd']), code('ri', p['ri']), jb, code('jimok', d['jimok']), d['parcel_m2'],
                d['evid_m2'], d['conf'], round(d['lon'], 6), round(d['lat'], 6), code('yongdo', p['yongdo']), code('nongup', p['nongup'])])
    det.setdefault(p['emd_cd'], []).append([fid, code('corroboration', d['corroboration']), code('img_date', d['img_date']), d['evidence'], d['ai_ids'], p['jiga'], p['gosi_year'], a23, a25, p['chg'], r5(p['chg_built_new_m2']), code('flags', p['flags'])])
assert len(out) == README['findings'], len(out)
assert len({r[5] for r in out}) == README['suspect_parcels']
json.dump({**prov, 'source': '02. 데이터/survey/namwon-parcel-survey.gpkg · suspects × parcels', 'n': len(out), 'cols': COLS, 'dict': DICT, 'rows': out},
          open(os.path.join(HERE, 'findings-lite.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
os.makedirs(os.path.join(HERE, 'detail'), exist_ok=True)
for cd, rs in det.items():
    json.dump({**prov, 'source': '02. 데이터/survey/namwon-parcel-survey.gpkg · suspects × parcels · emd ' + cd, 'cols': DCOLS, 'dict': DICT,
               'a23_cols': ['bld_m2', 'crop_m2', 'park_m2', 'gh_m2', 'bld_n', 'crop_n', 'park_n', 'gh_n', 'bld_in_m2', 'park_in_m2', 'gh_in_m2', 'bld_conf', 'crop_conf'],
               'a25_cols': ['crop_m2', 'uncrop_m2', 'gh_m2', 'gh_n'], 'rows': rs},
              open(os.path.join(HERE, 'detail', cd + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ── 4. 대조 작업 39칸 합성 리플레이(계약 v1.1-22 SSE 형식 · 서→동) ──
top_by_emd = {}
for r in out:
    top_by_emd.setdefault(r[6], [])
    if len(top_by_emd[r[6]]) < 3: top_by_emd[r[6]].append({'id': r[0], 'pnu': r[5], 'rule': r[4], 'priority': r[2], 'score': r[3], 'lng': r[14], 'lat': r[15]})
job = 'job_replay_survey_namwon'
L = []; t = 0
L.append({'t': 0, 'event': 'job.queued', 'data': {'job_id': job, 'kind': 'survey', 'position': 0, 'pool': 'cpu'}})
L.append({'t': 240, 'event': 'job.started', 'data': {'job_id': job, 'kind': 'survey', 'shards_total': 39, 'workers': ['cpu-0']}})
t = 380; done = 0; counts = {k: 0 for k in README['by_rule']}; parcels = 0
for i, r in enumerate(emd_rows):
    ts = t + i * 120; te = ts + 120
    sid = 'emd-' + r['emd_cd']
    L.append({'t': ts, 'event': 'shard.started', 'data': {'job_id': job, 'shard_id': sid, 'emd_cd': r['emd_cd'], 'name': r['emd'], 'bbox': r['bbox'], 'worker': 'cpu-0'}})
    done += 1; parcels += r['suspect_parcels']
    for k in counts: counts[k] += r['by_rule'][k]
    L.append({'t': te, 'event': 'shard.done', 'data': {'job_id': job, 'shard_id': sid, 'emd_cd': r['emd_cd'], 'name': r['emd'], 'bbox': r['bbox'], 'n': r['findings'], 'parcels': r['suspect_parcels'],
              'classes': r['by_rule'], 'priority': r['by_priority'], 'ms': None, 'worker': 'cpu-0'}})
    if top_by_emd.get(r['emd_cd']):
        L.append({'t': te + 1, 'event': 'survey.finding', 'data': {'job_id': job, 'shard_id': sid, 'items': top_by_emd[r['emd_cd']]}})
    L.append({'t': te + 2, 'event': 'job.progress', 'data': {'job_id': job, 'shards_done': done, 'shards_total': 39, 'counts': dict(counts), 'parcels': parcels, 'elapsed_s': round(te / 1000, 2)}})
tend = L[-1]['t'] + 240
L.append({'t': tend, 'event': 'job.done', 'data': {'job_id': job, 'kind': 'survey', 'counts': dict(counts), 'parcels': parcels,
          'counts_env': {'value': parcels, 'unit': '필지', 'basis': 'inferred', 'as_of': AS_OF, 'source': 'findings-emd.json 39행 합', 'note': '의심 필지 · 검수 전 · 규칙 R1–R6 [추정 초기 임계]'},
          'elapsed_s': round(tend / 1000, 2), 'gpu_s': None}})
with open(os.path.join(HERE, 'replay', 'survey-namwon.ndjson'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(json.dumps(x, ensure_ascii=False) for x in L) + '\n')
print('ok', len(emd_rows), tot, 'findings', len(out), 'replay lines', len(L))
