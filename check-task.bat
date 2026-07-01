@echo off
echo ============================================
echo   Checking Zwift scheduled deploy task
echo ============================================
echo.

powershell -Command ^
  "Get-ScheduledTask | Where-Object { $_.TaskName -like '*zwift*' -or $_.TaskName -like '*deploy*' -or $_.TaskName -like '*Deploy*' -or $_.TaskName -like '*Zwift*' } | ForEach-Object { $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath; Write-Host ('Task: ' + $_.TaskName); Write-Host ('State: ' + $_.State); Write-Host ('Last Run: ' + $info.LastRunTime); Write-Host ('Last Result: ' + $info.LastTaskResult); Write-Host ('Next Run: ' + $info.NextRunTime); Write-Host '---' }"

echo.
echo If nothing appeared above, NO Zwift/deploy task exists in Task Scheduler.
echo.
pause
