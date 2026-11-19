$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidRoot = Join-Path $repoRoot 'android'

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

foreach ($name in @(
  'MOTIONCARE_RELEASE_STORE_FILE',
  'MOTIONCARE_RELEASE_STORE_PASSWORD',
  'MOTIONCARE_RELEASE_KEY_ALIAS',
  'MOTIONCARE_RELEASE_KEY_PASSWORD'
)) {
  if (-not [Environment]::GetEnvironmentVariable($name, 'Process')) {
    throw "$name is required for release signing."
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
  .\gradlew.bat :app:assembleRelease --no-daemon
  Assert-LastExitCode '.\gradlew.bat :app:assembleRelease'
}
finally {
  Pop-Location
}
