# Build TheTextApp Android release APK (ARM, signed when keystore env is set).
# Requires: JDK 17+, Android SDK (ANDROID_HOME), Node 20+

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"
$Android = Join-Path $Mobile "android"
$Keystore = Join-Path $Root "infra\android\thetextapp-release.keystore"

Push-Location $Mobile
try {
    if (-not (Test-Path $Keystore)) {
        Write-Host "==> Generating release keystore at infra/android/" -ForegroundColor Cyan
        $AndroidDir = Split-Path $Keystore
        New-Item -ItemType Directory -Force -Path $AndroidDir | Out-Null
        keytool -genkeypair -v `
            -keystore $Keystore `
            -alias thetextapp `
            -keyalg RSA -keysize 2048 -validity 10000 `
            -storepass thetextapp `
            -keypass thetextapp `
            -dname "CN=TheTextApp, OU=Mobile, O=TheTextApp, L=London, ST=England, C=GB"
    }

    $env:THETEXTAPP_KEYSTORE = $Keystore
    $env:THETEXTAPP_KEYSTORE_PASSWORD = "thetextapp"
    $env:THETEXTAPP_KEY_ALIAS = "thetextapp"
    $env:THETEXTAPP_KEY_PASSWORD = "thetextapp"

    if (Test-Path (Join-Path $Android "gradlew.bat")) {
        Write-Host "==> stopping Gradle daemons (avoids EBUSY on prebuild --clean)" -ForegroundColor Cyan
        Push-Location $Android
        .\gradlew.bat --stop 2>$null
        Pop-Location
        Start-Sleep -Seconds 2
    }

    Write-Host "==> expo prebuild (android)" -ForegroundColor Cyan
    npx expo prebuild --platform android --no-install --clean
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> prebuild --clean failed; retrying without --clean" -ForegroundColor Yellow
        npx expo prebuild --platform android --no-install
    }

    Write-Host "==> gradle assembleRelease (arm64 + armeabi-v7a)" -ForegroundColor Cyan
    Push-Location $Android
    if ($IsWindows -or $env:OS -match "Windows") {
        .\gradlew.bat assembleRelease
    } else {
        ./gradlew assembleRelease
    }
    Pop-Location

    $Apk = Join-Path $Android "app\build\outputs\apk\release\app-release.apk"
    $OutDir = Join-Path $Root "dist\android"
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    if (Test-Path $Apk) {
        $Dest = Join-Path $OutDir "thetextapp-release.apk"
        Copy-Item $Apk $Dest -Force
        $SizeMb = [math]::Round((Get-Item $Dest).Length / 1MB, 2)
        Write-Host ""
        Write-Host "BUILD SUCCESSFUL" -ForegroundColor Green
        Write-Host "Signed APK: $Dest ($SizeMb MB)"
        Write-Host "Keystore: $Keystore (password: thetextapp - rotate for production)"
    } else {
        Write-Error "Gradle finished but APK not found at $Apk"
    }
} finally {
    Pop-Location
}
