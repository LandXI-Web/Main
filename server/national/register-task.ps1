# 전국 결과 자산 작업기 예약(원칙 218 · 221) — 15분마다 깨어나 학습 장비가 놀 때면 언제든(낮 포함) 칸을 이어서 분석한다.
# 다른 학습 장비 작업(사용자 AI 분석 · 학습 · 재학습 · 시험)이 있으면 조각 사이에서 비킨다. 이미 돌고 있으면(잠금 파일 · PID) 새로 띄우지 않는다.
# 사용:  powershell -File server/national/register-task.ps1            # 등록(있으면 바꿈)
#        powershell -File server/national/register-task.ps1 -Remove    # 지움
# 창이 뜨지 않게 pythonw 로 돈다. 기록 = 02. 데이터/national/runner.log · 상태 = runner.json
param([switch]$Remove)
$name = "LandXI-National"
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "[national] 예약 지움"; return }
$server = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = (Get-Command python -ErrorAction Stop).Source
$pyw = Join-Path (Split-Path -Parent $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$act = New-ScheduledTaskAction -Execute $pyw -Argument "-X utf8 -m national.runner --loop" -WorkingDirectory $server
$trig = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes([math]::Ceiling(((Get-Date) - (Get-Date).Date).TotalMinutes / 15) * 15)) -RepetitionInterval (New-TimeSpan -Minutes 15)
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $name -Action $act -Trigger $trig -Settings $set -Description "Land-XI 전국 결과 자산 작업기(학습 장비가 놀 때면 언제든 · GPU 한 장 · 풀로드 금지 · 원칙 221)" -Force | Out-Null
$t = Get-ScheduledTask -TaskName $name
Write-Host ("[national] 예약 {0} · 상태 {1} · 다음 {2}" -f $name, $t.State, (Get-ScheduledTaskInfo -TaskName $name).NextRunTime)
