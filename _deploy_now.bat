@echo off
cd /d "C:\Users\barak\Zwift Project"
del ".git\index.lock" 2>nul
git add .
git diff --cached --quiet && (echo Nothing new to commit) || git commit -m "Training Score chip blue, remove HR chip, heatmap 1 year"
git push
pause
