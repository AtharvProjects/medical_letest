@echo off
title AthassMediSync License Key Generator
color 0b

echo =============================================================
echo   ATHASSMEDISYNC - CLIENT LICENSE KEY GENERATOR
echo =============================================================
echo.

set /p HWID="Enter Client Hardware ID (e.g. AMS-1A2B-3C4D-5E6F): "
if "%HWID%"=="" (
    echo [ERROR] Hardware ID cannot be blank.
    pause
    exit /b
)

set /p EXPIRY="Enter Expiry Date (YYYY-MM-DD or press Enter for Lifetime): "
if "%EXPIRY%"=="" set EXPIRY=never

echo.
echo Generating cryptographically signed license key...
echo.

node scripts/generate-license.js %HWID% %EXPIRY%

pause
