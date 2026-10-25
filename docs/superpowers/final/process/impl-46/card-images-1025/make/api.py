import json, urllib.request, re, pathlib
ENV = pathlib.Path("E:/Land-XI 플랫폼/01. 디자인/server/.env").read_text(encoding="utf-8")
PW = re.search(r"^DEV_PASSWORD=(.*)$", ENV, re.M).group(1).strip()
BASE = "http://127.0.0.1:8700/api/v1"
def login(user="test@lx.or.kr"):
    req = urllib.request.Request(BASE + "/auth/login", data=json.dumps({"realm": "lx", "login": user, "password": PW}).encode(), headers={"content-type": "application/json"})
    r = urllib.request.urlopen(req); j = json.loads(r.read())
    return j.get("token") or j.get("access_token") or j
def get(path, tok):
    req = urllib.request.Request(BASE + path, headers={"authorization": f"Bearer {tok}"})
    return json.loads(urllib.request.urlopen(req).read())
def post(path, tok, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"authorization": f"Bearer {tok}", "content-type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())
