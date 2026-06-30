@echo off
cd /d "%~dp0"

:: Run pre-deploy checks first
call check.bat
if errorlevel 1 (
    echo.
    echo Deploy aborted. Fix the issues above before pushing.
    pause
    exit /b 1
)

echo.
echo Deploying...
git add .
git commit -m "Update site"
git push
echo.
echo Done. Vercel will rebuild automatically in a minute or two.
pause
