@echo off
title Prontivo
color 0A
echo.
echo  ========================================
echo   Prontivo
echo  ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [!] Node.js non trovato. Installa da https://nodejs.org
    pause
    exit /b 1
)
echo  Node.js: OK (v%node:~1%)

:: Check npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [!] npm non trovato. Installa Node.js da https://nodejs.org
    pause
    exit /b 1
)

:: Installa/aggiorna dipendenze
echo  Installazione dipendenze...
call npm install --no-audit --no-fund >nul 2>nul
title Prontivo
echo.

set PORT=8080

echo  Server in avvio sulla porta %PORT%...
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"

node server.js
exit /b %ERRORLEVEL%
