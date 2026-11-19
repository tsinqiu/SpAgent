$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

function Assert-LastExitCode($commandName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$commandName failed with exit code $LASTEXITCODE"
  }
}

if (-not $env:VITE_NATIVE_API_BASE_URL) {
  throw 'VITE_NATIVE_API_BASE_URL is required for Android sync.'
}

if (-not $env:VITE_API_BASE_URL) {
  $env:VITE_API_BASE_URL = $env:VITE_NATIVE_API_BASE_URL
}

Push-Location $repoRoot
try {
  npm run build
  Assert-LastExitCode 'npm run build'
  npx cap sync android
  Assert-LastExitCode 'npx cap sync android'
}
finally {
  Pop-Location
}
