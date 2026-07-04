# Build TheTextApp Android release APK locally with Gradle.
# Requires: JDK 17+, Android SDK (ANDROID_HOME), Node 20+

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"
$Android = Join-Path $Mobile "android"

Push-Location $Mobile
try {
    Write-Host "==> expo prebuild (android)" -ForegroundColor Cyan
    npx expo prebuild --platform android --no-install

    Write-Host "==> gradle assembleRelease" -ForegroundColor Cyan
    Push-Location $Android
    if ($IsWindows -or $env:OS -match "Windows") {
        .\gradlew.bat assembleRelease
    } else {
        ./gradlew assembleRelease
    }
    Pop-Location

    $Apk = Join-Path $Android "app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $Apk) {
        $SizeMb = [math]::Round((Get-Item $Apk).Length / 1MB, 2)
        Write-Host ""
        Write-Host "BUILD SUCCESSFUL" -ForegroundColor Green
        Write-Host "APK: $Apk ($SizeMb MB)"
    } else {
        Write-Error "Gradle finished but APK not found at $Apk"
    }
} finally {
    Pop-Location
}
