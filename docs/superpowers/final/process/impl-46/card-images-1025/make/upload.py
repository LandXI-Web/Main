import api, json, urllib.request, uuid, pathlib, sys
CAP = {
 "card-farm": ("52190", "남원시 · 2023 항공영상 · 경작 · 휴경 필지"),
 "card-5e85a9": ("52190", "남원시 · 2023 항공영상 · 비닐하우스"),
 "card-6f7050": ("52190", "남원시 · 드론 영상 · 단동 · 다동"),
 "card-2c5304": ("52190", "남원시 · 드론 영상 · 차량"),
 "card-45424f": ("51130", "원주시 · 2023 항공영상 · 건축물"),
 "card-389c45": ("41670", "여주시 · 2023 항공영상 · 주차장"),
 "card-d8fc01": ("52190", "남원시 · 2025.06 드론 영상 · 곤포사일리지"),
 "card-4d8d6f": ("52190", "남원시 · 2025.04 드론 영상 · 사료작물"),
 "card-f31e5f": ("52190", "남원시 · 2025.06 드론 영상 · 사료작물"),
 "card-ba9d6d": ("52190", "남원시 · 2025.04 ↔ 2025.06 · 필지 비교"),
 "card-change": ("12330", "광산구 · 2019 ↔ 2024 · 변화"),
 "card-landslide": ("52190", "남원시 · 2020 ↔ 2025 · 산림 → 나지"),
 "card-crowd": ("52190", "남원시 · 2025.05 드론 영상 · 인파 · 차량"),
 "card-marine": ("12130", "여수시 · 2026 드론 영상 · 해양쓰레기"),
}
tok = api.login("lxadmin@lx.or.kr")
only = set(sys.argv[1:])
res = {}
for cid, (rg, cap) in CAP.items():
    if only and cid not in only: continue
    data = pathlib.Path(f"out/{cid}.webp").read_bytes()
    b = uuid.uuid4().hex
    def part(name, val): return f'--{b}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n'.encode()
    body = part("region", rg) + part("caption", cap) + part("use", "1") + \
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{cid}.webp"\r\nContent-Type: image/webp\r\n\r\n'.encode() + data + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(api.BASE + f"/cards/{cid}/scene", data=body, headers={"authorization": f"Bearer {tok}", "content-type": f"multipart/form-data; boundary={b}"})
    try:
        j = json.loads(urllib.request.urlopen(req).read())
        res[cid] = (j.get("scene") or {}).get("src"); print(cid, res[cid], (j.get("scene") or {}).get("ex"))
    except urllib.error.HTTPError as e:
        print(cid, "ERR", e.code, e.read()[:300].decode())
json.dump(res, open("uploaded.json", "w"), ensure_ascii=False, indent=1)
