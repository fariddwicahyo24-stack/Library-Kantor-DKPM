param(
  [ValidateSet('Debug', 'Release')]
  [string]$BuildType = 'Release',
  [ValidateSet('Apk', 'Bundle')]
  [string]$Artifact = 'Apk'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$javaCandidates = @(@(
  $env:JAVA_HOME,
  "$env:ProgramFiles\Android\Android Studio\jbr",
  "$env:ProgramFiles\Android\Android Studio\jre"
) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe')) })

if (-not $javaCandidates) {
  throw 'JDK tidak ditemukan. Instal Android Studio atau atur environment variable JAVA_HOME.'
}

$env:JAVA_HOME = $javaCandidates[0]
$env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"

Push-Location $projectRoot
try {
  if ($BuildType -eq 'Release' -and -not (Test-Path -LiteralPath 'android\keystore.properties')) {
    & (Join-Path $PSScriptRoot 'create-release-keystore.ps1')
  }

  npm run android:sync
  Push-Location (Join-Path $projectRoot 'android')
  try {
    $gradleTask = if ($Artifact -eq 'Bundle') { "bundle$BuildType" } else { "assemble$BuildType" }
    & .\gradlew.bat $gradleTask
    if ($LASTEXITCODE -ne 0) { throw "Gradle gagal dengan exit code $LASTEXITCODE." }
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}
