@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || exit /b 1

REM Copia del proyecto: ZIP con exclusiones (sin node_modules, dist, entornos sensibles, carpeta backups).
REM Requiere `tar` (incluido en Windows 10+).

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"`) do set "STAMP=%%I"
set "BACKUP_DIR=%~dp0backups"
set "NAME=vene-autos-backup-!STAMP!.zip"
set "OUT=!BACKUP_DIR!\!NAME!"
set "TMP=%TEMP%\!NAME!"

if not exist "!BACKUP_DIR!" mkdir "!BACKUP_DIR!"

where tar >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro el comando tar. Usa Windows 10+ o instala Git for Windows.
  exit /b 1
)

echo.
echo  Creando copia de seguridad...
echo  Destino: !OUT!
echo.

REM Archivo temporal fuera del arbol del proyecto para no incluir el ZIP en si mismo.
tar -a -cf "!TMP!" ^
  --exclude=node_modules ^
  --exclude=dist ^
  --exclude=coverage ^
  --exclude=backups ^
  --exclude=.cursor ^
  --exclude=.env ^
  --exclude=api/.env ^
  --exclude=api/.env.local ^
  --exclude=web/.env ^
  --exclude=web/.env.local ^
  .

if errorlevel 1 (
  echo [ERROR] Fallo al comprimir con tar.
  del /q "!TMP!" 2>nul
  exit /b 1
)

move /Y "!TMP!" "!OUT!" >nul
if errorlevel 1 (
  echo [ERROR] No se pudo mover el archivo a backups\
  del /q "!TMP!" 2>nul
  exit /b 1
)

for %%A in ("!OUT!") do set "SIZE=%%~zA"
echo  Listo: !OUT!
echo  Tamano aproximado: !SIZE! bytes
echo.
endlocal
exit /b 0
