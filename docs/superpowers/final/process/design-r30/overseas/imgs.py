"""시안 · README 그림 — 실험 결과(pred.npz)와 영상에서 바로 그림(지어낸 그림 0)."""
import numpy as np, json
from PIL import Image
d=np.load("sokuluk.npz"); p=np.load("pred.npz"); fal=np.load("fallow.npy")
MOCK="E:/Land-XI 플랫폼/01. 디자인/landxi/proto/review/mock/overseas-perf/"
EV="E:/Land-XI 플랫폼/01. 디자인/docs/superpowers/final/process/design-r30/overseas/"
def rgb(k):
    a=d[k][[2,1,0]].astype(np.float32)*1e-4-0.1
    a=np.clip(a/0.28,0,1)**0.85*255
    return a.transpose(1,2,0).astype(np.uint8)
def save(a,name,w=1100):
    im=Image.fromarray(a); h=round(im.height*w/im.width); im=im.resize((w,h),Image.LANCZOS if a.ndim==3 and a.shape[2]==3 else Image.NEAREST)
    im.save(MOCK+name,quality=84) if name.endswith(".webp") else im.save(MOCK+name)
for y,k in (("2021","2021b"),("2025","2025b")): save(rgb(k),f"s2-{y}.webp")
def overlay(m,col,alpha=170):
    o=np.zeros(m.shape+(4,),np.uint8); o[m]=(*col,alpha); return o
save(overlay(p["p21"]==2,(46,158,91)),"crop-2021.png"); save(overlay(p["p25"]==2,(46,158,91)),"crop-2025.png")
c21=p["p21"]==2; c25=p["p25"]==2
ch=np.zeros(c21.shape+(4,),np.uint8)
ch[c25&~c21]=(46,200,110,235); ch[c21&~c25&(p["p25"]!=3)]=(240,140,40,235); ch[(p["p25"]==3)&(p["p21"]!=3)]=(49,130,246,235)
save(ch,"change.png"); save(overlay(fal,(240,68,82),220),"fallow.png")
# README 그림: 조각 넷(영상 여름 · 라벨 · 예측)
PAL=np.array([[34,120,60],[170,200,120],[46,158,91],[49,130,246],[30,110,200],[200,180,140],[255,255,255]],np.uint8)
WC=d["wc2021"]; M={10:0,20:0,30:1,40:2,50:3,80:4,90:4,60:5}
Y=np.full(WC.shape,6,np.uint8)
for k,v in M.items(): Y[WC==k]=v
pal_pred=PAL.copy(); pal_pred[2]=[46,158,91]
r21=rgb("2021b"); tiles=[]
for (i,j) in [(640,320),(1280,1600),(896,1024),(1536,2048)]:
    s=slice(i,i+128),slice(j,j+128)
    row=np.concatenate([r21[s],np.full((128,6,3),255,np.uint8),PAL[Y[s]],np.full((128,6,3),255,np.uint8),PAL[p["p21"][s]]],1)
    tiles+= [row,np.full((6,row.shape[1],3),255,np.uint8)]
Image.fromarray(np.concatenate(tiles,0)).resize((396*2,(134*4)*2),Image.NEAREST).save(EV+"chips-sample.png")
print("ok")
