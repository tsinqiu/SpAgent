$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidRoot = Join-Path $repoRoot 'android'

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  npm run android:sync
  Assert-LastExitCode 'npm run android:sync'
}
finally {
  Pop-Location
}

Push-Location $androidRoot
try {
  .\gradlew.bat :app:assembleDebug --no-daemon
  Assert-LastExitCode '.\gradlew.bat :app:assembleDebug'
}
finally {
  Pop-Location
}
