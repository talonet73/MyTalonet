@echo off
setlocal
cd /d "%~dp0"
rem Refresh installed program paths without changing execution policy.
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"
where node >nul 2>nul
if errorlevel 1 (
  echo Prima apri 1-PREPARA-TALEDIT.cmd e completa le installazioni.
  pause
  exit /b 1
)
node "%~dp0scripts\start-windows.cjs"
if errorlevel 1 (
  echo.
  echo TALEDIT non e stato avviato. Leggi il messaggio sopra.
  pause
  exit /b 1
)
