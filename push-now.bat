@echo off
cd /d "C:\Users\barak\Zwift Project"

echo Removing git lock if exists...
if exist ".git\index.lock" del /f ".git\index.lock"

echo Staging changes...
git add .

git diff --cached --quiet
if %errorlevel% == 0 (
    echo No file changes - making empty redeploy commit to force Vercel rebuild...
    git commit --allow-empty -m "Redeploy %date% %time%"
) else (
    git commit -m "Deploy %date% %time%"
)

echo Pushing to GitHub...
git push

echo.
echo Done! Vercel is now rebuilding.
echo https://zwift-delta.vercel.app
pause
