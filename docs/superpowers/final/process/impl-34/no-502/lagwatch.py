# 게이트웨이 이벤트 루프 막힘 감시: health 가 1.5초 넘게 안 오면 py-spy 로 MainThread 를 찍는다
import time, subprocess, urllib.request, sys, threading, datetime, os
OUT = os.path.join(os.path.dirname(__file__), 'lag.log')
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 3600
def pid():
    o = subprocess.run(['powershell','-NoProfile','-Command','(Get-NetTCPConnection -State Listen -LocalPort 8700).OwningProcess'],capture_output=True,text=True).stdout.strip()
    return o.split()[0] if o else None
P = pid(); t_end = time.time() + DUR
def log(s):
    with open(OUT,'a',encoding='utf-8') as f: f.write(s+'\n')
log(f'start {datetime.datetime.now().isoformat()} pid {P}')
while time.time() < t_end:
    done = threading.Event(); t0 = time.time(); res = {}
    def probe():
        try: urllib.request.urlopen('http://127.0.0.1:8700/api/v1/health', timeout=60).read(); res['ok']=1
        except Exception as e: res['err']=repr(e)
        done.set()
    threading.Thread(target=probe, daemon=True).start()
    if not done.wait(1.5):
        ts = datetime.datetime.now().isoformat(timespec='seconds')
        d = subprocess.run(['py-spy','dump','--pid',str(P)],capture_output=True,text=True,encoding='utf-8',errors='replace').stdout
        main = d.split('Thread ')[1] if 'Thread ' in d else d
        log(f'=== {ts} slow health >1.5s\n{main[:3000]}')
        # 다른 스레드 중 active 만
        for blk in d.split('Thread ')[2:]:
            if '(active' in blk.split('\n')[0]: log('  [active] '+blk[:1500])
        done.wait(60)
        log(f'    recovered after {time.time()-t0:.1f}s {res}')
        newp = pid()
        if newp != P: log(f'pid changed {P} -> {newp}'); P = newp
    time.sleep(0.5)
log('end')
