import re,json,sys,time,urllib.request,urllib.parse
def env(p,k):
    try:
        m=re.search(r'^\s*%s\s*=\s*(.+?)\s*$'%k,open(p,encoding='utf8').read(),re.M); return m.group(1).strip('"\'') if m else ''
    except: return ''
R="E:/Land-XI 플랫폼/01. 디자인/"
key=env(R+"server/.env","VWORLD_KEY") or env(R+".env.local","VWORLD_KEY")
dom=env(R+"server/.env","VWORLD_DOMAIN") or env(R+".env.local","VWORLD_DOMAIN")
layer=sys.argv[1]; B=[float(v) for v in sys.argv[2].split(',')]; out=sys.argv[3]; n=int(sys.argv[4])
feats={}
for i in range(n):
  for j in range(n):
    bx=(B[0]+(B[2]-B[0])*i/n,B[1]+(B[3]-B[1])*j/n,B[0]+(B[2]-B[0])*(i+1)/n,B[1]+(B[3]-B[1])*(j+1)/n)
    bb=",".join("%.6f"%v for v in bx); page=1
    while True:
        q=dict(service="data",request="GetFeature",data=layer,key=key,domain=dom,geomFilter=f"BOX({bb})",size=1000,page=page,geometry="true",attribute="true",format="json",crs="EPSG:4326")
        u="https://api.vworld.kr/req/data?"+urllib.parse.urlencode(q)
        for t in range(3):
            try: j=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"LandXI-basemap/0.1"}),timeout=60))["response"]; break
            except Exception as e: print("retry",type(e).__name__); time.sleep(2)
        if j.get("status")!="OK":
            if j.get("status")!="NOT_FOUND": print("status",j.get("status"),(j.get("error") or {}).get("code"))
            break
        fs=j["result"]["featureCollection"]["features"]
        for f in fs: feats[f.get("id") or json.dumps(f["properties"],sort_keys=True)]=f
        tot=int(j["page"]["total"])
        if page>=tot: break
        page+=1; time.sleep(0.2)
    print(i,j and "",len(feats),flush=True)
json.dump({"type":"FeatureCollection","features":list(feats.values())},open(out,"w",encoding="utf8"),ensure_ascii=False)
fs=list(feats.values())
if fs: print("props",list(fs[0]["properties"].items())[:30])
