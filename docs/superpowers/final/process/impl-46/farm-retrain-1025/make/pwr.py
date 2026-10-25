import csv,sys,statistics,time
f="E:/Land-XI 플랫폼/02. 데이터/_logs/gpu-pair-"+time.strftime("%Y%m%d")+".csv"
t0=float(sys.argv[1]); t1=float(sys.argv[2]) if len(sys.argv)>2 else 9e12
rows=[r for r in csv.DictReader(open(f)) if t0<=float(r["ts"])<=t1]
def roll(key,k=30):
    v=[float(r[key]) for r in rows]; out=[sum(v[max(0,i-k+1):i+1])/len(v[max(0,i-k+1):i+1]) for i in range(len(v))]; return max(out) if out else 0
print("n",len(rows),"30s max avg W: g0",round(roll("w0"),1),"g1",round(roll("w1"),1),"sum max",round(max(float(r["sum_w"]) for r in rows),1),
      "util30 max g0",round(roll("u0"),1),"g1",round(roll("u1"),1),"temp max",max(int(r["t0"]) for r in rows),max(int(r["t1"]) for r in rows),
      "modes",{m:sum(1 for r in rows if r["mode"]==m) for m in set(r["mode"] for r in rows)})
