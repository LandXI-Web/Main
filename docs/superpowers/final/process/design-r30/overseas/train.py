"""소쿨룩 평야 학습 데이터 조각 → 기준 모델 셋(지수 규칙 · 화소 부스팅 · 작은 U-Net) 정확도. CPU만(GPU 0)."""
import os, json, time, numpy as np
os.environ["CUDA_VISIBLE_DEVICES"]=""
import torch, torch.nn as nn, torch.nn.functional as F
torch.set_num_threads(16)
from sklearn.ensemble import HistGradientBoostingClassifier
rng=np.random.default_rng(7); torch.manual_seed(7)
d=np.load("sokuluk.npz")
def feats(k1,k2):
    xs=[]
    for k in (k1,k2):
        a=(d[k][:6].astype(np.float32)*1e-4-0.1).clip(0,1)
        ndvi=(a[3]-a[2])/(a[3]+a[2]+1e-6)
        xs+= [*a, ndvi]
    return np.stack(xs)            # 14 × H × W
X21=feats("2021a","2021b"); X25=feats("2025a","2025b")
valid21=(d["2021a"][6]>=4)&(d["2021a"][6]<=7)&(d["2021b"][6]>=4)&(d["2021b"][6]<=7)|((d["2021a"][6]==11)|(d["2021b"][6]==11))
WC=d["wc2021"]; M={10:0,20:0,30:1,40:2,50:3,80:4,90:4,60:5}
Y=np.full(WC.shape,255,np.uint8)
for k,v in M.items(): Y[WC==k]=v
Y[~valid21]=255
NAMES=["나무·관목","초지","경작지","시가지","물·습지","맨땅"]; C=6
H,W=Y.shape; S=64
chips=[(i,j) for i in range(0,H-S+1,S) for j in range(0,W-S+1,S)]
# 공간 묶음 나누기: 4×4 조각 묶음을 통째로 학습/검증/시험에 — 옆 조각이 새지 않게
blk={}
for (i,j) in chips: blk.setdefault((i//(S*4),j//(S*4)),[]).append((i,j))
keys=list(blk); rng.shuffle(keys); n=len(keys)
split={k:("test" if q<0.2*n else "val" if q<0.3*n else "train") for q,k in enumerate(keys)}
sets={"train":[],"val":[],"test":[]}
for k,v in blk.items(): sets[split[k]]+=v
print({k:len(v) for k,v in sets.items()})
def take(lst,X): return np.stack([X[:,i:i+S,j:j+S] for i,j in lst]), np.stack([Y[i:i+S,j:j+S] for i,j in lst])
Xtr,Ytr=take(sets["train"],X21); Xva,Yva=take(sets["val"],X21); Xte,Yte=take(sets["test"],X21)
def scores(p,y):
    m=y!=255; p=p[m]; y=y[m]
    cm=np.bincount(y.astype(int)*C+p.astype(int),minlength=C*C).reshape(C,C)
    iou=[cm[c,c]/max(1,cm[c].sum()+cm[:,c].sum()-cm[c,c]) for c in range(C)]
    present=[c for c in range(C) if cm[c].sum()>0]
    tp=cm[2,2]; fp=cm[:,2].sum()-tp; fn=cm[2].sum()-tp
    return dict(oa=round(float(np.trace(cm)/cm.sum()),3), miou=round(float(np.mean([iou[c] for c in present])),3),
                crop_iou=round(float(iou[2]),3), crop_f1=round(float(2*tp/(2*tp+fp+fn)),3), iou={NAMES[c]:round(float(iou[c]),3) for c in present})
R={"chips":{k:len(v) for k,v in sets.items()},"chip_px":S,"cell_m":10}
# A. 지수 규칙: 두 시기 중 NDVI 최대 ≥ 0.5 → 경작지(경작지 대 그 밖 둘만)
def rule(Xc):
    nd=np.maximum(Xc[:,6],Xc[:,13]); return np.where(nd>=0.5,2,1)
pr=rule(Xte); m=Yte!=255; yb=np.where(Yte==2,2,1); 
tp=((pr==2)&(yb==2)&m).sum(); fp=((pr==2)&(yb!=2)&m).sum(); fn=((pr!=2)&(yb==2)&m).sum()
R["rule"]=dict(crop_iou=round(float(tp/(tp+fp+fn)),3),crop_f1=round(float(2*tp/(2*tp+fp+fn)),3))
print("rule",R["rule"])
# B. 화소 부스팅(두 시기 vs 한 시기)
def pix(Xc,Yc,n,ch):
    x=Xc[:,ch].transpose(0,2,3,1).reshape(-1,len(ch)); y=Yc.reshape(-1); k=y!=255; x=x[k]; y=y[k]
    idx=rng.choice(len(y),min(n,len(y)),replace=False); return x[idx],y[idx]
for name,ch in [("gbm_2date",list(range(14))),("gbm_1date",list(range(7,14)))]:
    t0=time.time(); xt,yt=pix(Xtr,Ytr,300000,ch)
    g=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.1,random_state=0).fit(xt,yt)
    p=g.predict(Xte[:,ch].transpose(0,2,3,1).reshape(-1,len(ch))).reshape(Yte.shape)
    R[name]=scores(p,Yte); R[name]["sec"]=round(time.time()-t0,1); print(name,R[name])
    if name=="gbm_2date": G=g
# C. 작은 U-Net(CPU) — 조각 수에 따라(학습 데이터 규모 곡선)
class UNet(nn.Module):
    def __init__(s,cin,c=C,w=32):
        super().__init__()
        blk=lambda a,b: nn.Sequential(nn.Conv2d(a,b,3,padding=1),nn.BatchNorm2d(b),nn.ReLU(True),nn.Conv2d(b,b,3,padding=1),nn.BatchNorm2d(b),nn.ReLU(True))
        s.e1,s.e2,s.e3=blk(cin,w),blk(w,2*w),blk(2*w,4*w); s.d2,s.d1=blk(6*w,2*w),blk(3*w,w); s.o=nn.Conv2d(w,c,1)
    def forward(s,x):
        a=s.e1(x); b=s.e2(F.max_pool2d(a,2)); c=s.e3(F.max_pool2d(b,2))
        u=s.d2(torch.cat([F.interpolate(c,scale_factor=2),b],1)); u=s.d1(torch.cat([F.interpolate(u,scale_factor=2),a],1)); return s.o(u)
mu=Xtr.mean((0,2,3),keepdims=True); sd=Xtr.std((0,2,3),keepdims=True)+1e-6
def unet(ntr,ch,ep=30):
    t0=time.time(); idx=rng.choice(len(Xtr),min(ntr,len(Xtr)),replace=False)
    xt=torch.tensor(((Xtr[idx]-mu)/sd)[:,ch]); yt=torch.tensor(Ytr[idx].astype(np.int64))
    net=UNet(len(ch)); opt=torch.optim.AdamW(net.parameters(),2e-3,weight_decay=1e-4)
    sched=torch.optim.lr_scheduler.OneCycleLR(opt,3e-3,total_steps=ep*((len(xt)+31)//32))
    for e in range(ep):
        net.train(); perm=torch.randperm(len(xt))
        for k in range(0,len(xt),32):
            b=perm[k:k+32]; x=xt[b]; y=yt[b]
            if np.random.rand()<.5: x=x.flip(-1); y=y.flip(-1)
            if np.random.rand()<.5: x=x.flip(-2); y=y.flip(-2)
            loss=F.cross_entropy(net(x),y,ignore_index=255); opt.zero_grad(); loss.backward(); opt.step(); sched.step()
    net.eval()
    with torch.no_grad(): p=torch.cat([net(torch.tensor(((Xte[k:k+64]-mu)/sd)[:,ch])).argmax(1) for k in range(0,len(Xte),64)]).numpy()
    r=scores(p,Yte); r["sec"]=round(time.time()-t0,1); r["train_chips"]=len(idx); return r,net
for n in (100,300,len(Xtr)):
    r,net=unet(n,list(range(14))); R[f"unet_2date_{n}"]=r; print("unet",n,r,flush=True)
r1,_=unet(len(Xtr),list(range(7,14))); R["unet_1date_all"]=r1; print("unet1",r1)
torch.save(net.state_dict(),"unet_2date.pt")
# 2025 적용 — 같은 모델로 2021 · 2025 전체 범위를 그려 변화 · Esri 2025 대조
def paint(X):
    net.eval(); out=np.zeros((H,W),np.uint8); xs=(X-mu[0])/sd[0]
    with torch.no_grad():
        for i in range(0,H,256):
            for j in range(0,W,256):
                t=xs[:,i:i+256,j:j+256]; h,w=t.shape[1:]; ph,pw=(-h)%4,(-w)%4
                t=np.pad(t,((0,0),(0,ph),(0,pw)),mode="reflect")
                out[i:i+h,j:j+w]=net(torch.tensor(t[None])).argmax(1)[0,:h,:w].numpy()
    return out
P21=paint(X21); P25=paint(X25)
np.savez_compressed("pred.npz",p21=P21,p25=P25)
c21=P21==2; c25=P25==2; e25=d["esri2025"]==5; px=0.01  # ha per 10 m px
R["area_ha"]=dict(aoi=round(H*W*px), crop2021_model=round(c21.sum()*px), crop2025_model=round(c25.sum()*px),
    crop2021_worldcover=round((WC==40).sum()*px), crop2025_esri=round(e25.sum()*px),
    new_crop=round((c25&~c21).sum()*px), lost_crop=round((c21&~c25).sum()*px), lost_to_built=round((c21&(P25==3)).sum()*px),
    new_built=round(((P25==3)&(P21!=3)).sum()*px))
R["agree_2025_vs_esri_crop_iou"]=round(float((c25&e25).sum()/(c25|e25).sum()),3)
R["agree_2021_wc_vs_esri2017_crop_iou"]=round(float(((WC==40)&(d["esri2017"]==5)).sum()/((WC==40)|(d["esri2017"]==5)).sum()),3)
# 휴경 의심(규칙): 2021 경작지(모델)인데 2025 두 시기 NDVI 최대 < 0.35
nd25=np.maximum(X25[6],X25[13]); fal=c21&(nd25<0.35)
R["area_ha"]["fallow_candidate_2025"]=round(fal.sum()*px)
np.save("fallow.npy",fal)
json.dump(R,open("result.json","w",encoding="utf8"),ensure_ascii=False,indent=1)
print(json.dumps(R["area_ha"],ensure_ascii=False), R["agree_2025_vs_esri_crop_iou"], R["agree_2021_wc_vs_esri2017_crop_iou"])
