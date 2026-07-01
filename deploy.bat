@echo off
cd /d "%~dp0"

set LOGFILE=%~dp0deploy-log.txt
echo. >> "%LOGFILE%"
echo =============================== >> "%LOGFILE%"
echo %DATE% %TIME% >> "%LOGFILE%"
echo =============================== >> "%LOGFILE%"

:: -----------------------------------------------
:: 0. Clear stale git lock files (left by crashed
::    git processes or parallel sessions)
:: -----------------------------------------------
if exist ".git\HEAD.lock" (
    echo Removing stale HEAD.lock... >> "%LOGFILE%"
    del /f ".git\HEAD.lock" >> "%LOGFILE%" 2>&1
)
if exist ".git\index.lock" (
    echo Removing stale index.lock... >> "%LOGFILE%"
    del /f ".git\index.lock" >> "%LOGFILE%" 2>&1
)

:: -----------------------------------------------
:: 1. Pre-deploy checks
:: -----------------------------------------------
call check.bat >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo %DATE% %TIME% - ABORTED: check.bat failed >> "%LOGFILE%"
    exit /b 1
)

:: -----------------------------------------------
:: 2. Commit any pending changes
:: -----------------------------------------------
echo Deploying... >> "%LOGFILE%"
git add . >> "%LOGFILE%" 2>&1

:: Check if there is anything to commit
git diff --cached --quiet
if not errorlevel 1 (
    echo %DATE% %TIME% - SKIP: nothing new to commit. Already up-to-date. >> "%LOGFILE%"
    goto :push
)

git commit -m "Auto deploy %DATE% %TIME%" >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo %DATE% %TIME% - FAILED: git commit error >> "%LOGFILE%"
    exit /b 1
)

:: -----------------------------------------------
:: 3. Push
:: -----------------------------------------------
:push
git push >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo %DATE% %TIME% - FAILED: git push error >> "%LOGFILE%"
    exit /b 1
)

echo %DATE% %TIME% - SUCCESS: pushed. Vercel rebuilding. >> "%LOGFILE%"

:: Pause only when run interactively (not from Task Scheduler)
if defined SESSIONNAME (
    echo.
    echo Done. Check deploy-log.txt for full output.
    pause
)
