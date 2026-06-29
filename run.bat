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
echo Starting the dashboard - leave this window open while you use it...
start "" "http://localhost:3000"
call npm run dev
pause
