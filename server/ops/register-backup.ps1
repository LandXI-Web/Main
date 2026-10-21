# 매일 DB 백업 예약(오픈 전 필수 6-2 · 원칙 300) — 매일 03:30 server/ops/db_backup.py(PostGIS pg_dump -Fc → E: 02. 데이터/_backup/db)
# 일요일 회차는 임시 DB 에 실제로 되살려 보는 시험까지(LX_BACKUP_RESTORE_TEST=1 · --restore-test).
# 사용:  powershell -File server/ops/register-backup.ps1            # 등록(있으면 바꿈)
#        powershell -File server/ops/register-backup.ps1 -Remove    # 지움
#        powershell -File server/ops/register-backup.ps1 -RunNow    # 지금 한 번(예약 작업으로 · 창 없음)
# 창이 뜨지 않게 pythonw 로 돈다. 기록 = 02. 데이터/_backup/db/backup.log · 상태 = status.json(게이트웨이 경보가 읽는다)
param([switch]$Remove, [switch]$RunNow)
$daily = "LandXI-DB-Backup"
$weekly = "LandXI-DB-Backup-RestoreTest"
if ($Remove) {
  foreach ($n in @($daily, $weekly)) { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }
  Write-Host "[backup] 예약 지움"; return
}
if ($RunNow) { Start-ScheduledTask -TaskName $daily; Write-Host "[backup] $daily 지금 시작"; return }
$server = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = (Get-Command python -ErrorAction Stop).Source
$pyw = Join-Path (Split-Path -Parent $py) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $py }
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 6) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30)
# 매일(월~토) 백업 + 목록 읽기 시험 · 일요일은 되살리기 시험까지 — 같은 시각 두 작업이 겹치지 않게 요일을 나눈다
$a1 = New-ScheduledTaskAction -Execute $pyw -Argument "-X utf8 ops\db_backup.py" -WorkingDirectory $server
$t1 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday, Saturday -At "03:30"
Register-ScheduledTask -TaskName $daily -Action $a1 -Trigger $t1 -Settings $set -Description "Land-XI 매일 DB 백업(pg_dump -Fc → E: _backup/db · 매일 7 · 매주 4 보관 · 실패 시 관리자 경보)" -Force | Out-Null
$a2 = New-ScheduledTaskAction -Execute $pyw -Argument "-X utf8 ops\db_backup.py --restore-test" -WorkingDirectory $server
$t2 = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "03:30"
Register-ScheduledTask -TaskName $weekly -Action $a2 -Trigger $t2 -Settings $set -Description "Land-XI 일요일 DB 백업 + 되살리기 시험(임시 DB 에 복원 → 표 수 대조 → 지움)" -Force | Out-Null
foreach ($n in @($daily, $weekly)) {
  $t = Get-ScheduledTask -TaskName $n
  Write-Host ("[backup] 예약 {0} · 상태 {1} · 다음 {2}" -f $n, $t.State, (Get-ScheduledTaskInfo -TaskName $n).NextRunTime)
}
