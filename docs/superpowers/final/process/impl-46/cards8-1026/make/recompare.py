"""사료작물 비교를 새 규칙(농지 지목만 · 다시 정리한 두 결과)으로 다시 — feedcompare.compare 를 그대로 부른다(LX 관리자 이름으로 · 결과 예시도 다시).
   백업: compare/{옛 작업}.json · cards/card-ba9d6d/example.json"""
import sys, os, json, shutil, asyncio, datetime as dt
from pathlib import Path
SERVER = Path(r"E:\Land-XI 플랫폼\01. 디자인\server"); sys.path.insert(0, str(SERVER)); os.chdir(SERVER); sys.stdout.reconfigure(encoding="utf-8")
from landxi_api import config, feedcompare as FC
from landxi_api.deps import Principal
from types import SimpleNamespace
BK = config.DATA_ROOT / "_backup" / "cards8-1026"; BK.mkdir(parents=True, exist_ok=True)
st = dt.datetime.now().strftime("%H%M%S")
for f in (config.DATA_ROOT / "compare" / "job_01M5R76BKYBANCRZ61WTC6536W.json", config.DATA_ROOT / "cards" / "card-ba9d6d" / "example.json"):
    shutil.copy2(f, BK / f"{f.parent.name}-{f.name}.{st}")
req = SimpleNamespace(state=SimpleNamespace(principal=Principal(realm="lx", role="admin", user_id="u_mail_lxadmin", name="LX 관리자")))
body = {"growth": "job_01M5Q21ZHFPT6F3TC22KKTWRBM", "production": "job_01M5Q2202Q8D5CCKZVYZ7GE1AH", "keep_example": True, "label": "금지면 · 2025년 4월 ↔ 6월"}
out = asyncio.run(FC.compare("card-ba9d6d", body, req))
print(json.dumps(out, ensure_ascii=False, default=str))
print(json.loads((config.DATA_ROOT / "cards" / "card-ba9d6d" / "example.json").read_text(encoding="utf-8"))["example"])
