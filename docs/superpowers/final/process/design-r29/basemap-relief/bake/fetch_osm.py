import json,sys,urllib.request,urllib.parse
s,w,n,e=sys.argv[1].split(','); bld=sys.argv[3]=="1"; out=sys.argv[2]
bb=f"({s},{w},{n},{e})"
q=f"""[out:json][timeout:180];(
way["highway"]{bb};
way["waterway"]{bb};
way["natural"="water"]{bb};relation["natural"="water"]{bb};
way["landuse"="reservoir"]{bb};
{'way["building"]'+bb+';relation["building"]'+bb+';' if bld else ''}
);out geom;"""
req=urllib.request.Request("https://overpass-api.de/api/interpreter",data=urllib.parse.urlencode({"data":q}).encode(),headers={"User-Agent":"LandXI-basemap-prototype/0.1"})
d=urllib.request.urlopen(req,timeout=300).read()
open(out,"wb").write(d); j=json.loads(d); print(len(j["elements"]), j.get("osm3s",{}).get("timestamp_osm_base"))
