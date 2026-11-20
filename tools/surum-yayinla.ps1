<#
=========================================================
 SÜRÜM YAYINLAMA – Pervane Test Laboratuvarı
---------------------------------------------------------
 Projede değişiklik varsa:
   1) Sürüm numarasını artırır (1.0.0 → 1.0.1 / 1.1.0 / 2.0.0)
   2) VERSION, js/version.js, README.md ve CHANGELOG.md'yi günceller
   3) Commit + "vX.Y.Z" etiketi oluşturur
   4) GitHub'a gönderir (git push --follow-tags)

 KULLANIM
   Elle (hemen yayınla):
     powershell -ExecutionPolicy Bypass -File tools\surum-yayinla.ps1
     powershell -ExecutionPolicy Bypass -File tools\surum-yayinla.ps1 -Bump minor -Message "Yeni motor eklendi"
   Otomatik (zamanlanmış görev bunu çağırır):
     ... -Auto   → son değişiklikten sonra -QuietMinutes dakika geçmediyse bekler

 Sürüm kuralı (SemVer):
   patch (1.0.x) : küçük düzeltmeler — otomatik mod bunu kullanır
   minor (1.x.0) : yeni özellik
   major (x.0.0) : büyük/uyumsuz değişiklik
=========================================================
#>
param(
  [ValidateSet("patch", "minor", "major")] [string]$Bump = "patch",
  [string]$Message = "",
  [switch]$Auto,
  [int]$QuietMinutes = 10,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $PSScriptRoot "surum-gunlugu.log"
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Log($text) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $text
  Write-Host $line
  [System.IO.File]::AppendAllText($LogFile, $line + "`r`n", $Utf8)
}
function GitRun { param([Parameter(ValueFromRemainingArguments = $true)] $GitArgs)
  # Git ilerleme/uyarı mesajlarını stderr'e yazar; PowerShell 5.1 bunları hata sanmasın
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = & git -C $Root @GitArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { throw "git $($GitArgs -join ' ') başarısız: $($out -join ' ')" }
  return $out
}

try {
  Set-Location $Root

  # 1) Değişiklik var mı?
  $status = @(GitRun status --porcelain | Where-Object { $_ -match '^[ MADRCU?!]{2} ' -and $_ -notmatch "surum-gunlugu\.log" })
  if ($status.Count -eq 0) {
    if (-not $Auto) { Log "Değişiklik yok, yeni sürüm gerekmiyor." }
    exit 0
  }

  # 2) Otomatik modda: dosyalar hâlâ düzenleniyorsa bekle
  if ($Auto) {
    $latest = Get-ChildItem -Path $Root -Recurse -File |
      Where-Object { $_.FullName -notmatch "\\\.git\\" -and $_.Name -ne "surum-gunlugu.log" } |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $idle = ((Get-Date) - $latest.LastWriteTime).TotalMinutes
    if ($idle -lt $QuietMinutes) {
      Log ("Değişiklik var ama son düzenleme {0:N1} dk önce; {1} dk sessizlik bekleniyor." -f $idle, $QuietMinutes)
      exit 0
    }
  }

  # 3) Yeni sürüm numarası
  $verFile = Join-Path $Root "VERSION"
  $old = (Get-Content $verFile -Raw).Trim()
  $p = $old.Split(".") | ForEach-Object { [int]$_ }
  switch ($Bump) {
    "major" { $p = @(($p[0] + 1), 0, 0) }
    "minor" { $p = @($p[0], ($p[1] + 1), 0) }
    default { $p = @($p[0], $p[1], ($p[2] + 1)) }
  }
  $new = "{0}.{1}.{2}" -f $p[0], $p[1], $p[2]
  if ((GitRun tag --list "v$new")) { throw "v$new etiketi zaten var." }

  # 4) Değişen dosyaların listesi (sürüm geçmişi için)
  $changes = $status | ForEach-Object {
    $code = $_.Substring(0, 2).Trim(); $file = $_.Substring(3).Trim('"')
    $kind = switch -Regex ($code) { "A|\?\?" { "eklendi" } "D" { "silindi" } "R" { "yeniden adlandırıldı" } default { "güncellendi" } }
    "- ``$file`` $kind"
  }

  # 5) Sürüm dosyalarını güncelle
  [System.IO.File]::WriteAllText($verFile, "$new`n", $Utf8)
  $vjs = Join-Path $Root "js\version.js"
  [System.IO.File]::WriteAllText($vjs, "/* Bu dosya tools/surum-yayinla.ps1 tarafından otomatik güncellenir. */`nconst APP_VERSION = `"$new`";`n", $Utf8)
  $readme = Join-Path $Root "README.md"
  $r = [System.IO.File]::ReadAllText($readme, $Utf8)
  # Büyük başlıktaki ve "Güncel sürüm" satırındaki numara
  $r = $r -replace "(?m)^(# .*— Sürüm )[0-9.]+", "`${1}$new"
  $r = $r -replace "Güncel sürüm: v[0-9.]+", "Güncel sürüm: v$new"
  $r = $r -replace "\*\*Sürüm [0-9.]+\*\*", "**Sürüm $new**"
  # Sürümler tablosuna yeni satır (en üste, kalın); önceki sürümün kalınlığı kaldırılır
  $summary = if ($Message) { $Message.Split("`n")[0].Trim() } else { "Otomatik sürüm: " + (($changes | Select-Object -First 4 | ForEach-Object { $_ -replace '^- ', '' -replace '`', '' }) -join ", ") }
  $summary = $summary -replace '\|', '/'
  $r = $r -replace '\| \*\*(v[0-9.]+)\*\* \|', '| $1 |'
  $row = "| **v$new** | $(Get-Date -Format 'yyyy-MM-dd') | $summary |"
  $r = $r -replace "(<!-- SURUMLER:BASLA -->\r?\n[^\n]*\n[^\n]*\n)", "`${1}$row`n"
  [System.IO.File]::WriteAllText($readme, $r, $Utf8)

  $chg = Join-Path $Root "CHANGELOG.md"
  $c = [System.IO.File]::ReadAllText($chg, $Utf8)
  $head = "## $new — $(Get-Date -Format 'yyyy-MM-dd')`n"
  if ($Message) { $head += "$($Message.Split("`n")[0])`n" } else { $head += "Otomatik sürüm.`n" }
  $head += ($changes -join "`n") + "`n`n"
  $c = $c -replace "(?s)^(# Sürüm geçmişi\s*\n\n)", "`$1$head"
  [System.IO.File]::WriteAllText($chg, $c, $Utf8)

  # 6) Commit + etiket + gönder
  GitRun add -A | Out-Null
  $msgFile = Join-Path $env:TEMP "pervane-commit-msg.txt"
  $body = "Sürüm $new"
  if ($Message) { $body += "`n`n$Message" } else { $body += "`n`n" + (($changes -join "`n")) }
  [System.IO.File]::WriteAllText($msgFile, $body, $Utf8)
  GitRun commit -q -F $msgFile | Out-Null
  Remove-Item $msgFile -ErrorAction SilentlyContinue
  GitRun tag -a "v$new" -m "Sürüm $new" | Out-Null
  Log "Sürüm $old → $new oluşturuldu ($($status.Count) dosya)."

  if (-not $NoPush) {
    $env:GIT_TERMINAL_PROMPT = "0"
    GitRun push origin HEAD --follow-tags | Out-Null
    Log "v$new GitHub'a gönderildi."
  }
  exit 0
}
catch {
  Log "HATA: $($_.Exception.Message)"
  exit 1
}
