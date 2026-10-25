"""usage: sheets.py outdir month sample.json  — 번호 매긴 그림판(예측 숨김)"""
from lib import *
out=pathlib.Path(sys.argv[1]); out.mkdir(parents=True,exist_ok=True); items=json.load(open(sys.argv[2],encoding="utf-8"))
PER=15; T=336
f=font(26)
for s in range(0,len(items),PER):
    sh=Image.new("RGB",(5*T,3*T),"white")
    for k,it in enumerate(items[s:s+PER]):
        g=wkb.loads(bytes.fromhex(it["wkb"])); x0,y0,x1,y1=g.bounds
        cx,cy=(x0+x1)/2,(y0+y1)/2; half=min(70,max(22,max(x1-x0,y1-y0)*0.65))
        bb=(cx-half,cy-half,cx+half,cy+half)
        im=Image.fromarray(read(it["m"],bb,T,T)); draw_poly(im,g,bb)
        d=ImageDraw.Draw(im); d.rectangle([0,0,70,34],fill=(0,0,0)); d.text((4,2),str(it["no"]),fill=(255,255,255),font=f)
        sh.paste(im,((k%5)*T,(k//5)*T))
    sh.save(out/f"sheet{s//PER+1:02d}.jpg",quality=88)
print(len(items))
