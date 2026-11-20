<#
=========================================================
 OTOMATİK YÜKLEMEYİ KUR / KALDIR
---------------------------------------------------------
 Windows Görev Zamanlayıcı'ya bir görev ekler. Görev 15 dakikada bir
 tools\surum-yayinla.ps1 -Auto komutunu arka planda çalıştırır:
 değişiklik varsa ve 10 dakikadır dosyalara dokunulmadıysa yeni
 sürümü (1.0.x) GitHub'a gönderir.

   Kur   : powershell -ExecutionPolicy Bypass -File tools\otomatik-yuklemeyi-kur.ps1
   Kaldır: powershell -ExecutionPolicy Bypass -File tools\otomatik-yuklemeyi-kur.ps1 -Kaldir
=========================================================
#>
param([switch]$Kaldir, [int]$IntervalMinutes = 15)

$TaskName = "PervaneTest-OtomatikSurum"

if ($Kaldir) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Otomatik sürüm yükleme kaldırıldı."
  exit 0
}

$script = Join-Path $PSScriptRoot "surum-yayinla.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Auto"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Pervane Test Laboratuvarı: değişiklikleri yeni sürüm olarak GitHub'a yükler." -Force | Out-Null

Write-Host "Otomatik sürüm yükleme kuruldu: her $IntervalMinutes dakikada bir kontrol edilir."
Write-Host "Günlük: $(Join-Path $PSScriptRoot 'surum-gunlugu.log')"
