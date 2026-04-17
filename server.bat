@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
set "ROOT=%CD%"

REM Carpeta donde está ngrok.exe (ajustá si movés el programa)
set "NGROK_HOME=C:\Users\Memohamed\Desktop\Ngroks"

echo.
echo === Vene Autos — arranque de servidor (dev) ===
echo Raíz: %ROOT%
echo.
echo Se abrirán ventanas: 1^) DB docker  2^) API  3^) Web Vite --host
echo.

REM 1 — Base de datos (docker compose -d)
start "Vene Autos — DB" cmd /k cd /d "%ROOT%" ^&^& npm run db:up

timeout /t 3 /nobreak >nul

REM 2 — API Nest
start "Vene Autos — API" cmd /k cd /d "%ROOT%" ^&^& npm run api:dev

REM 3 — Web Vite (accesible en LAN)
start "Vene Autos — Web" cmd /k cd /d "%ROOT%\web" ^&^& npm run dev -- --host

REM 4 — Ngrok opcional:   server.bat ngrok   (usa NGROK_HOME arriba)
if /i "%~1"=="ngrok" (
  if exist "%NGROK_HOME%\ngrok.exe" (
    start "Vene Autos — Ngrok" cmd /k cd /d "%NGROK_HOME%" ^&^& ngrok.exe http 5173
    echo Ngrok: %NGROK_HOME%\ngrok.exe — túnel al puerto 5173.
  ) else (
    echo [ERROR] No está "%NGROK_HOME%\ngrok.exe". Revisá la ruta NGROK_HOME en server.bat
    pause
    exit /b 1
  )
) else (
  echo Opcional: para abrir Ngrok desde "%NGROK_HOME%", ejecutá:  server.bat ngrok
)

echo.
echo Listo. Revisá las ventanas nuevas.
echo.
pause
endlocal
