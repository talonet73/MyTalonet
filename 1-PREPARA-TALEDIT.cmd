@echo off
setlocal
cd /d "%~dp0"
echo.
echo Preparazione di TALEDIT per Windows
echo Verranno installati strumenti gratuiti dalle fonti di Windows.
echo Se Windows chiede il permesso, scegli Si per continuare.
echo.
where winget >nul 2>nul
if errorlevel 1 (
  echo Non trovo il programma di installazione di Windows.
  echo Apri Microsoft Store, cerca "Programma di installazione app" e aggiornalo.
  echo Poi riapri questo file.
  pause
  exit /b 1
)
for %%P in (OpenJS.NodeJS.LTS Python.Python.3.12 Gyan.FFmpeg Microsoft.VCRedist.2015+.x64) do (
  winget list --id %%P --exact --accept-source-agreements >nul 2>nul
  if errorlevel 1 (
    winget install --id %%P --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 goto failed
  )
)
echo.
echo Preparazione terminata.
echo Chiudi questa finestra e fai doppio clic su 2-AVVIA-TALEDIT.cmd.
echo Se viene chiesto di riavviare Windows, riavvialo prima di continuare.
pause
exit /b 0
:failed
echo.
echo Windows non ha completato una delle installazioni.
echo Conserva il messaggio mostrato sopra e riprova dopo averlo risolto.
pause
exit /b 1
