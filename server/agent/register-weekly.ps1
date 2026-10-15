# XI ChatGEO 정기 개선 바퀴 예약(원칙 249 · 10-15 ChatGEO-매주 '돌림' · LOOP.md 1절 주기) — 전국 작업기 예약(national/register-task.ps1)과 같은 방식.
# 매일 새벽 2시에 깨운다 → agent/improve_weekly.py 가 정한다: 월요일 = 한 바퀴 · 새 후보 10건 이상 = 앞당김 · 같은 질문 3명 이상 = 작은 판 · 그 밖 = 아무것도 안 함.
# 새 판은 '승인 대기'까지만(승인은 LX 관리자). 한 바퀴 상한 3시간 · 이미 돌고 있으면 새로 띄우지 않는다.
# 사용:  powershell -File server/agent/register-weekly.ps1            # 등록(있으면 바꿈)
#        powershell -File server/agent/register-weekly.ps1 -Remove    # 지움
# 창이 뜨지 않게 pythonw 로 돈다. 기록 = 02. 데이터/improve/weekly/state.json · 바퀴마다 폴더
param([switch]$Remove)
$name = "LandXI-ChatGEO-Weekly"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "[chatgeo] 예약 지움"; return }
$server = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = (Get-Command python -ErrorAction Stop).Source
$pyw = Join-Path (Split-Path -Parent $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$act = New-ScheduledTaskAction -Execute $pyw -Argument "-X utf8 -m agent.improve_weekly" -WorkingDirectory $server
$trig = New-ScheduledTaskTrigger -Daily -At "02:00"
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName $name -Action $act -Trigger $trig -Settings $set -Description "Land-XI XI ChatGEO 정기 개선 바퀴(매주 월 02:00 · 후보 10건이면 앞당김 · 3명 이상 같은 질문은 작은 판 · 새 판은 승인 대기까지)" -Force | Out-Null
$t = Get-ScheduledTask -TaskName $name
Write-Host ("[chatgeo] 예약 {0} · 상태 {1} · 다음 {2}" -f $name, $t.State, (Get-ScheduledTaskInfo -TaskName $name).NextRunTime)
