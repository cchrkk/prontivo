@echo off
title Prontivo
color 0A
echo.
echo  ========================================
echo   Prontivo
echo  ========================================
echo.

set PORT=8080

echo  Server in avvio sulla porta %PORT%...
echo.

:: Apri il browser automaticamente dopo 2 secondi
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"

node server.js

pause
