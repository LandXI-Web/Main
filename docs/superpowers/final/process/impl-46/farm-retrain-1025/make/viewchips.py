import sys,random,glob,pathlib
from PIL import Image,ImageDraw
d=pathlib.Path(sys.argv[1]); pat=sys.argv[2]; n=int(sys.argv[3]); random.seed(int(sys.argv[4]) if len(sys.argv)>4 else 1)
fs=sorted(glob.glob(str(d/"images"/"train"/pat))); random.shuffle(fs); fs=fs[:n]
T=420; sh=Image.new("RGB",(4*T,((n+3)//4)*T))
for k,f in enumerate(fs):
    im=Image.open(f).convert("RGB"); W=im.size[0]; dr=ImageDraw.Draw(im,"RGBA")
    lab=(d/"labels"/"train"/(pathlib.Path(f).stem+".txt")).read_text().split("\n")
    for l in lab:
        p=l.split()
        if len(p)<7: continue
        pts=[(float(p[i])*W,float(p[i+1])*W) for i in range(1,len(p),2)]
        col=(40,200,80,90) if p[0]=="0" else (255,90,0,130)
        dr.polygon(pts,fill=col,outline=(255,255,0,255))
    sh.paste(im.resize((T,T)),((k%4)*T,(k//4)*T))
sh.save(sys.argv[5] if len(sys.argv)>5 else "chips_view.jpg")
