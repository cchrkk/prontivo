@echo off
title Generatore Preventivi
color 0A
echo.
echo  ========================================
echo   Generatore Preventivi
echo  ========================================
echo.

set PORT=8080

echo  Server in avvio sulla porta %PORT%...
echo.

:: Apri il browser automaticamente dopo 2 secondi
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"

node server.js

pause
