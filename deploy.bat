@echo off
cd /d "%~dp0"
echo Updating the live site...
git add .
git commit -m "Update site"
git push
echo.
echo Done. Vercel will rebuild automatically in a minute or two.
pause
