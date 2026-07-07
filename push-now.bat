@echo off
cd /d "C:\Users\barak\Zwift Project"

echo Removing git lock if exists...
if exist ".git\index.lock" del /f ".git\index.lock"

echo Staging changes...
git add .

git diff --cached --quiet
if %errorlevel% == 0 (
    echo Nothing to commit.
) else (
    git commit -m "Fix profile card auto-edit + fix ICU duplicate workouts in Zwift"
    echo Pushing to GitHub...
    git push
    echo.
    echo Done! Vercel is now rebuilding.
    echo https://zwift-delta.vercel.app
)

pause
