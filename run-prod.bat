@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Download and install it from https://nodejs.org , then run this file again.
  pause
  exit /b 1
)

echo Installing dependencies - first time only, may take a minute or two...
call npm install
if errorlevel 1 (
  echo.
  echo Something went wrong during npm install. Take a screenshot of this window and send it over.
  pause
  exit /b 1
)

echo.
echo Building a production version of the dashboard - this is the "real",
echo optimized build, not the dev/edit-friendly one run.bat uses. It does not
echo have the dev server's hot-reload, but it also does not have its extra
echo overhead - the crash we've been chasing happens during page rendering in
echo dev mode, so this is also a real test of whether it is specific to dev mode.
call npm run build
if errorlevel 1 (
  echo.
  echo The build itself failed. Take a screenshot of this window and send it over.
  pause
  exit /b 1
)

echo.
echo Starting the dashboard in production mode - leave this window open while you use it...
start "" "http://localhost:3000"
call npm run start
pause
