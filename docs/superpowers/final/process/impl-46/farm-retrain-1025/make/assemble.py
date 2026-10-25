"""build_ds 결과 위에 되풀이(원래 학습 묶음 일부) 목록 + dataset.yaml 쓰기 + 원래 검증 묶음의 나머지(회귀 점검용) yaml.
usage: assemble.py DS_DIR [n_replay_train] [n_replay_val]"""
import sys,random,pathlib
ds=pathlib.Path(sys.argv[1]); nt=int(sys.argv[2]) if len(sys.argv)>2 else 400; nv=int(sys.argv[3]) if len(sys.argv)>3 else 100
O=pathlib.Path("E:/namwon/cultivate_uncultivate"); rnd=random.Random(1025)
def split(sp):
    fs=sorted((O/"images"/sp).glob("*.tif")); has1=[];has0=[]
    for f in fs:
        cl={l.split()[0] for l in (O/"labels"/sp/(f.stem+".txt")).read_text().split("\n") if l.strip()}
        (has1 if "1" in cl else has0).append(f)
    rnd.shuffle(has1); rnd.shuffle(has0); return has1,has0
def w(name,lst): (ds/name).write_text("\n".join(str(p).replace("\\","/") for p in lst)+"\n",encoding="utf-8")
h1,h0=split("train"); w("replay_train.txt",h1[:nt//2]+h0[:nt-nt//2])
v1,v0=split("val"); rv=v1[:nv//2]+v0[:nv-nv//2]; rest=v1[nv//2:]+v0[nv-nv//2:]
w("replay_val.txt",rv); w("origval_rest.txt",rest)
base=str(ds).replace(chr(92),'/')
(ds/"dataset.yaml").write_text(f"""path: {base}
train:
  - images/train
  - replay_train.txt
val:
  - images/val
  - replay_val.txt
names:
  0: 경작지
  1: 비경작지
""",encoding="utf-8")
(ds/"dataset_origval.yaml").write_text(f"""path: {base}
train: replay_train.txt
val: origval_rest.txt
names:
  0: 경작지
  1: 비경작지
""",encoding="utf-8")
print(len(rv),len(rest))
