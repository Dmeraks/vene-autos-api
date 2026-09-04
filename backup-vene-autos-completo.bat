@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Copia COMPLETA del proyecto (node_modules, dist, .git, .env, todo).
REM Destino fijo: G:\Back Up Vene Autos
REM Requiere tar (Windows 10+). El ZIP se genera en %%TEMP%% y se mueve al destino.

set "DEST_ROOT=G:\Back Up Vene Autos"
cd /d "%~dp0" || exit /b 1

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "STAMP=%%I"
set "NAME=vene-autos-COMPLETO-!STAMP!.zip"
set "OUT=!DEST_ROOT!\!NAME!"
set "TMP=%TEMP%\!NAME!"

if not exist "!DEST_ROOT!" mkdir "!DEST_ROOT!"

where tar >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro tar. Usa Windows 10+ o Git for Windows.
  exit /b 1
)

echo.
echo  Copia COMPLETA del arbol actual (sin exclusiones).
echo  Origen:  %CD%
echo  Destino: !OUT!
echo  Puede tardar varios minutos si node_modules es grande.
echo.

tar -a -cf "!TMP!" .
if errorlevel 1 (
  echo [ERROR] Fallo tar.
  del /q "!TMP!" 2>nul
  exit /b 1
)

move /Y "!TMP!" "!OUT!" >nul
if errorlevel 1 (
  echo [ERROR] No se pudo mover a !DEST_ROOT!
  echo Comprueba que la unidad G: exista y tengas permisos de escritura.
  del /q "!TMP!" 2>nul
  exit /b 1
)

for %%A in ("!OUT!") do set "SIZE=%%~zA"
echo.
echo  Listo: !OUT!
echo  Tamano: !SIZE! bytes
echo.
endlocal
exit /b 0
