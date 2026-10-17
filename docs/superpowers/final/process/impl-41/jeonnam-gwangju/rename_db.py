"""DB 이름 바로잡기(10-17 원칙 268) — 광주전남(특별시) → 전남광주(특별시), Gwangju-Jeonnam → Jeonnam-Gwangju.
한 트랜잭션 · 바뀐 행 수 기록. 감사 기록(audit_log) · 사용자가 쓴 질문(agent_runs.prompt_text)은 바꾸지 않는다.
사용: PYTHONUTF8=1 python rename_db.py [--apply]   (없으면 세어 보기만)"""
import sys, json, psycopg
import os, re, pathlib
# 접속 주소는 server/.env 의 PG_ADMIN_DSN (코드에 적지 않음)
_env = pathlib.Path(__file__).resolve().parents[6] / "server" / ".env"
DSN = os.environ.get("PG_ADMIN_DSN") or re.search(r"^PG_ADMIN_DSN=(.*)$", _env.read_text(encoding="utf-8"), re.M).group(1).strip()
PAT = '광주전남|Gwangju-Jeonnam'
# (표, 칸, 종류) — national_cells 는 작업기와 겹치지 않게 맨 뒤(sido 칸만 바꾼다 · 진행 칸은 건드리지 않음)
COLS = [
 ('tenants','name','jsonb'),('tenant_users','name','text'),('deploys','name','text'),('deploys','region_name','jsonb'),
 ('jobs','label','text'),('feedback','note','text'),('tenant_brand','short','text'),('tenant_brand','intro','jsonb'),
 ('approvals','payload','jsonb'),('analysis_requests','meta','jsonb'),
 ('agent_runs','answer_md','text'),('agent_tool_calls','args','jsonb'),('agent_confirms','args','jsonb'),
 ('survey_emd','top5','jsonb'),('survey_sgg','sido','text'),('survey_findings','addr','text'),('survey_parcels','addr','text'),
 ('national_cells_river_old','sido','text'),('national_cells','sido','text'),
]
apply = '--apply' in sys.argv
c = psycopg.connect(DSN)
c.execute("SET lock_timeout='30s'")
out = []
for t, col, kind in COLS:
    pre = c.execute(f'select count(*) from "{t}" where "{col}"::text ~ %s and "{col}"::text ~ %s', (PAT, '전남광주(?!통합)|Jeonnam-Gwangju')).fetchone()[0]
    n = c.execute(f'select count(*) from "{t}" where "{col}"::text ~ %s', (PAT,)).fetchone()[0]
    cast = '::jsonb' if kind == 'jsonb' else ''
    expr = f"replace(replace(\"{col}\"::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju'){cast}"
    done = 0
    if apply and n:
        cur = c.execute(f'update "{t}" set "{col}" = {expr} where "{col}"::text ~ %s', (PAT,))
        done = cur.rowcount
    out.append(dict(table=t, column=col, rows_matching=n, rows_with_preexisting_new_name=pre, rows_updated=done))
    print(out[-1], flush=True)
rest = []
for t, col, kind in COLS:
    rest.append(c.execute(f'select count(*) from "{t}" where "{col}"::text ~ %s', (PAT,)).fetchone()[0])
if apply:
    assert all(r == 0 for r in rest), rest
    c.commit(); print('COMMIT')
else:
    c.rollback(); print('DRY (rollback)')
if apply: json.dump(out, open(sys.argv[0].replace('rename_db.py','db-rows.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
