# 自動アップロードの導入（Windows版、プロジェクトごとに一度だけ）。
# 使い方（PowerShell）: powershell -ExecutionPolicy Bypass -File "<プロジェクトのフォルダー>\自動アップロード\install.ps1" [GitHubのリポジトリのURL]
#  - タスクスケジューラーに、1分ごとに auto-push.ps1 を（画面に出さずに）動かすタスクを登録する
#  - .gitignore に、上げないもの（APK、署名の鍵、合図とログなど）を足す
#  - このリポジトリ専用にトークンを保存する設定（credential.useHttpPath）にする
#  - URL を渡し、まだ Git の管理下でなければ、初期化して最初の push までする（このときだけトークンを聞かれる）
param([string]$RepoUrl = '')
$ErrorActionPreference = 'Stop'
$Dir = Split-Path -Parent $PSScriptRoot
$md5 = [Security.Cryptography.MD5]::Create()
$hash = ([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($Dir))) -replace '-', '').Substring(0, 8).ToLower()
$TaskName = "AutoPush-$hash"
# 画面を出さずに動かすための小さな起動ファイル（日本語のパスを扱うため UTF-16 で書く）
$vbs = Join-Path $PSScriptRoot 'run-hidden.vbs'
$ps1 = Join-Path $PSScriptRoot 'auto-push.ps1'
$line = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""' + $ps1 + '""", 0, True'
Set-Content -Path $vbs -Value $line -Encoding Unicode
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "自動アップロード: $Dir" -Force | Out-Null
Set-Location $Dir
# .gitignore は BOM なしの UTF-8 で追記する（BOM が付くと先頭の行が効かなくなるため）
$gi = Join-Path $Dir '.gitignore'
$utf8 = New-Object Text.UTF8Encoding $false
$have = if (Test-Path $gi) { [IO.File]::ReadAllLines($gi, $utf8) } else { @() }
foreach ($l in @('apk/', 'keystore/', '*.tar.gz', '*.new/', 'push-request.txt', 'auto-push.log', '.DS_Store', 'Claude outputs/', '自動アップロード/run-hidden.vbs')) {
  if ($have -notcontains $l) { [IO.File]::AppendAllText($gi, "$l`n", $utf8) }
}
$ErrorActionPreference = 'Continue'
if (-not (Test-Path .git) -and $RepoUrl) {
  git init -q -b main
  git remote add origin $RepoUrl
}
if (Test-Path .git) {
  git config credential.useHttpPath true
  git rev-parse -q --verify HEAD *> $null
  if ($RepoUrl -and $LASTEXITCODE -ne 0) {
    git add -A
    git commit -q -m 'initial'
    git push -u origin main
  }
}
Write-Host "導入しました: $Dir（タスク名 $TaskName、1分ごとに確認）"
