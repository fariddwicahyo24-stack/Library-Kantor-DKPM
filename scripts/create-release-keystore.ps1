$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$keystoreDirectory = Join-Path $androidRoot 'keystore'
$keystorePath = Join-Path $keystoreDirectory 'design-dkpm-release.jks'
$propertiesPath = Join-Path $androidRoot 'keystore.properties'

if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $propertiesPath)) {
  throw 'Sebagian konfigurasi signing sudah ada. Hapus keduanya atau pulihkan pasangannya sebelum membuat ulang.'
}

$javaCandidates = @(@(
  $env:JAVA_HOME,
  "$env:ProgramFiles\Android\Android Studio\jbr",
  "$env:ProgramFiles\Android\Android Studio\jre"
) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\keytool.exe')) })

if (-not $javaCandidates) {
  throw 'JDK tidak ditemukan. Instal Android Studio atau atur environment variable JAVA_HOME.'
}

$passwordBytes = New-Object byte[] 24
$randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $randomGenerator.GetBytes($passwordBytes)
}
finally {
  $randomGenerator.Dispose()
}
$password = [Convert]::ToBase64String($passwordBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
$keytool = Join-Path $javaCandidates[0] 'bin\keytool.exe'

New-Item -ItemType Directory -Force -Path $keystoreDirectory | Out-Null
& $keytool -genkeypair -v -keystore $keystorePath -alias design-dkpm -keyalg RSA -keysize 4096 -validity 10000 -storepass $password -keypass $password -dname 'CN=Design App DKPM, OU=DKPM, O=DKPM, C=ID'
if ($LASTEXITCODE -ne 0) { throw "Keytool gagal dengan exit code $LASTEXITCODE." }

$properties = @(
  'storeFile=keystore/design-dkpm-release.jks'
  "storePassword=$password"
  'keyAlias=design-dkpm'
  "keyPassword=$password"
) -join [Environment]::NewLine
[IO.File]::WriteAllText($propertiesPath, $properties + [Environment]::NewLine)

Write-Output "Keystore release dibuat di $keystorePath"
Write-Output 'Simpan folder android/keystore dan android/keystore.properties dengan aman; keduanya diperlukan untuk pembaruan aplikasi.'
