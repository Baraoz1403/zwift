@echo off
cd /d "%~dp0"
echo ============================================
echo   Pre-deploy checks
echo ============================================
echo.

set ERRORS=0

:: -----------------------------------------------
:: 1. Check globals.css is not truncated
:: -----------------------------------------------
echo [1/4] Checking globals.css is complete...
findstr /C:"@media (max-width: 640px)" app\globals.css >nul 2>&1
if errorlevel 1 (
    echo   FAIL: app\globals.css is missing the mobile media query block.
    echo         The file is probably truncated by OneDrive. Run fix with Python.
    set ERRORS=1
) else (
    echo   OK
)

:: Check it ends with a closing brace, not a partial line
:: (look for "ride-stat" rule which is in the last media query)
findstr /C:"ride-stat" app\globals.css >nul 2>&1
if errorlevel 1 (
    echo   FAIL: app\globals.css is missing .ride-stat rule ^(truncated^).
    set ERRORS=1
)

:: -----------------------------------------------
:: 2. Check key CSS tokens exist
:: -----------------------------------------------
echo [2/4] Checking CSS design tokens...
findstr /C:"--accent:" app\globals.css >nul 2>&1
if errorlevel 1 (
    echo   FAIL: --accent token missing from globals.css
    set ERRORS=1
) else (
    echo   OK
)

findstr /C:"--bg:" app\globals.css >nul 2>&1
if errorlevel 1 (
    echo   FAIL: --bg token missing from globals.css
    set ERRORS=1
)

:: -----------------------------------------------
:: 3. Check key TSX files are not truncated
:: -----------------------------------------------
echo [3/4] Checking key component files...

:: weekly-plan.tsx must end with closing brace
findstr /C:"}" app\dashboard\weekly-plan.tsx >nul 2>&1
if errorlevel 1 (
    echo   FAIL: app\dashboard\weekly-plan.tsx looks empty or corrupt.
    set ERRORS=1
) else (
    echo   OK
)

:: ai.ts must contain DAYS_RANGE_MID reference
findstr /C:"DAYS_RANGE_MID" lib\ai.ts >nul 2>&1
if errorlevel 1 (
    echo   FAIL: lib\ai.ts is missing DAYS_RANGE_MID ^(possibly truncated^).
    set ERRORS=1
) else (
    echo   OK
)

:: training-profile.tsx must contain Toggle component
findstr /C:"function SelectCards" app\dashboard\training-profile.tsx >nul 2>&1
if errorlevel 1 (
    echo   FAIL: app\dashboard\training-profile.tsx is missing SelectCards function ^(possibly truncated^).
    set ERRORS=1
) else (
    echo   OK
)

:: -----------------------------------------------
:: 4. Check no file ends with partial CSS value
:: -----------------------------------------------
echo [4/4] Checking for OneDrive truncation signatures...
findstr /E /R /C:"var(-$" app\globals.css >nul 2>&1
if not errorlevel 1 (
    echo   FAIL: app\globals.css ends with a partial CSS value ^(var^(- truncation bug^).
    set ERRORS=1
) else (
    echo   OK
)

:: -----------------------------------------------
:: Result
:: -----------------------------------------------
echo.
if %ERRORS%==0 (
    echo ============================================
    echo   All checks passed. Safe to deploy.
    echo ============================================
    exit /b 0
) else (
    echo ============================================
    echo   CHECKS FAILED. Fix the issues above
    echo   before deploying. Do NOT run deploy.bat.
    echo ============================================
    exit /b 1
)
