@echo off
cd /d "%~dp0"
echo %date% %time% - Auto-deploy starting >> deploy_log.txt
git add . >> deploy_log.txt 2>&1
git commit -m "Auto-deploy update" >> deploy_log.txt 2>&1
git push >> deploy_log.txt 2>&1
echo %date% %time% - Auto-deploy finished >> deploy_log.txt
echo. >> deploy_log.txt
