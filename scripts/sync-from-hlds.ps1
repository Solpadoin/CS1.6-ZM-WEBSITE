param(
  [string]$Source = "..\hlds\cstrike\addons\amxmodx\data\zm_web",
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $repo "data"

if (!(Test-Path $Source)) {
  throw "Source data folder not found: $Source"
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Copy-Item -LiteralPath (Join-Path $Source "server_status.json") -Destination $dataDir -Force
Copy-Item -LiteralPath (Join-Path $Source "players.json") -Destination $dataDir -Force
Copy-Item -LiteralPath (Join-Path $Source "chat.json") -Destination $dataDir -Force
Copy-Item -LiteralPath (Join-Path $Source "events.json") -Destination $dataDir -Force

git -C $repo add data/server_status.json data/players.json data/chat.json data/events.json

$changes = git -C $repo status --porcelain
if ($changes) {
  git -C $repo commit -m "Update live server data"
  if ($Push) {
    git -C $repo push
  }
} else {
  Write-Host "No data changes to sync."
}
