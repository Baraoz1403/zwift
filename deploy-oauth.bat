@echo off
echo === Zwift OAuth Deploy ===

cd /d "C:\Users\barak\Zwift Project"

echo Removing stale git locks...
del /f ".git\index.lock" 2>nul
del /f ".git\refs\remotes\origin\main.lock" 2>nul
del /f ".git\objects\maintenance.lock" 2>nul

echo Staging OAuth files...
git add app/api/intervals/oauth-callback/route.ts
git add app/api/intervals/oauth-start/route.ts
git add app/api/intervals/update-ftp/route.ts
git add app/dashboard/intervals-onboarding.tsx
git add lib/intervals.ts

echo Committing...
git commit -m "Add intervals.icu OAuth flow (client 600)"

echo Pushing to GitHub...
git push

echo.
echo === Done! Vercel will rebuild automatically. ===
pause
